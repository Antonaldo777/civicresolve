import { Router, Request, Response } from 'express';
import {
  computeIssueStats,
  DEFAULT_FILTER_STATE,
  filterIssues,
  getCsvExportFilename,
  isValidEnumValue,
  serializeIssuesToCsv,
  sortIssues,
  validateAdminUpdateInput,
  validateAnalyzeIssueInput,
  validateCommentInput,
  validateCreateIssueInput,
  validateSmsPhoneInput,
} from '../../src/shared/civicDomain.ts';
import {
  AdminUpdateIssuePayload,
  AiTriageAnalysis,
  AnalyzeIssuePayload,
  CreateIssuePayload,
  IssueCategory,
  IssueFilterState,
  IssuePriority,
  IssueSortOption,
  IssueStatus,
  MunicipalDepartment,
} from '../../src/shared/types.ts';
import {
  analyzeCivicIssueWithGemini,
  GeminiServiceError,
  polishIssueDescriptionWithGemini,
} from '../services/geminiClassifier.ts';
import {
  sendCivicChatMessage,
  streamCivicChatMessage,
} from '../services/geminiChat.ts';
import { validateAndNormalizeChatPayload } from '../../src/shared/chatDomain.ts';
import { defaultIssueStore, IssueStore } from '../store/issueStore.ts';
import {
  requireCivicAdministrator,
  requireVerifiedFirebaseUser,
} from '../auth.ts';

function parseFiltersFromQuery(query: Request['query']): IssueFilterState {
  const status = isValidEnumValue(IssueStatus, query.status) ? query.status : 'ALL';
  const priority = isValidEnumValue(IssuePriority, query.priority) ? query.priority : 'ALL';
  const category = isValidEnumValue(IssueCategory, query.category) ? query.category : 'ALL';
  const department = isValidEnumValue(MunicipalDepartment, query.department)
    ? query.department
    : 'ALL';
  const search = typeof query.search === 'string' ? query.search : '';
  const validSorts: IssueSortOption[] = [
    'newest',
    'oldest',
    'priority-desc',
    'priority-asc',
    'updated',
  ];
  const sort =
    typeof query.sort === 'string' && validSorts.includes(query.sort as IssueSortOption)
      ? (query.sort as IssueSortOption)
      : DEFAULT_FILTER_STATE.sort;

  return { search, status, priority, category, department, sort };
}

function handleRouteError(res: Response, error: unknown): void {
  if (error instanceof GeminiServiceError) {
    res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
    });
    return;
  }

  console.error('[CivicResolve API Error]', error);
  res.status(500).json({
    error: 'An unexpected server error occurred while processing the request.',
    code: 'INTERNAL_SERVER_ERROR',
  });
}

function toPublicIssue<T extends { adminNotes?: string }>(issue: T): Omit<T, 'adminNotes'> {
  const { adminNotes: _adminNotes, ...publicIssue } = issue;
  return publicIssue;
}

export function createIssuesRouter(store: IssueStore = defaultIssueStore): Router {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    const hasGeminiKey = Boolean(
      process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY.trim() !== '' &&
        process.env.GEMINI_API_KEY.trim() !== 'MY_GEMINI_API_KEY',
    );
    res.json({
      status: 'ok',
      service: 'civicresolve-api',
      aiConfigured: hasGeminiKey,
      timestamp: new Date().toISOString(),
    });
  });

  router.post('/ai/analyze', requireVerifiedFirebaseUser, async (req: Request, res: Response) => {
    try {
      const payload = (req.body ?? {}) as AnalyzeIssuePayload;
      const validation = validateAnalyzeIssueInput(payload);
      if (!validation.valid) {
        res.status(400).json({
          error: 'Please complete the required fields before running AI analysis.',
          code: 'VALIDATION_ERROR',
          details: validation.errors,
        });
        return;
      }

      const analysis = await analyzeCivicIssueWithGemini(payload);
      res.json({ analysis });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post('/ai/polish', requireVerifiedFirebaseUser, async (req: Request, res: Response) => {
    try {
      const { title = '', description = '', location = '' } = (req.body ?? {}) as {
        title?: string;
        description?: string;
        location?: string;
      };
      if (description.trim().length < 10) {
        res.status(400).json({
          error: 'Enter at least 10 characters in the description before using AI Polish.',
          code: 'VALIDATION_ERROR',
        });
        return;
      }
      const polished = await polishIssueDescriptionWithGemini({
        title: title || 'Civic issue',
        description,
        location,
      });
      res.json({ description: polished });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post('/ai/chat', requireVerifiedFirebaseUser, async (req: Request, res: Response) => {
    try {
      const validation = validateAndNormalizeChatPayload(req.body);
      if (!validation.valid || !validation.payload) {
        res.status(400).json({
          error: validation.error || 'Invalid chat request payload.',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      const result = await sendCivicChatMessage(validation.payload);
      res.json(result);
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post(
    '/ai/chat/stream',
    requireVerifiedFirebaseUser,
    async (req: Request, res: Response) => {
    const validation = validateAndNormalizeChatPayload(req.body);
    if (!validation.valid || !validation.payload) {
      res.status(400).json({
        error: validation.error || 'Invalid chat request payload.',
        code: 'VALIDATION_ERROR',
        },
      );
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const writeEvent = (event: string, data: unknown) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      await streamCivicChatMessage(validation.payload, {
        onChunk: (delta) => writeEvent('chunk', { delta }),
        onDone: (meta) => writeEvent('done', meta),
      });
    } catch (error) {
      const geminiErr =
        error instanceof GeminiServiceError
          ? error
          : new GeminiServiceError(
              'Unable to complete Gemini chat response.',
              502,
              'UPSTREAM_AI_ERROR',
            );
      writeEvent('error', {
        error: geminiErr.message,
        code: geminiErr.code,
        statusCode: geminiErr.statusCode,
      });
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  router.get('/issues', async (req: Request, res: Response) => {
    try {
      const allIssues = await store.listIssues();
      const filters = parseFiltersFromQuery(req.query);
      const filtered = sortIssues(filterIssues(allIssues, filters), filters.sort);
      const stats = computeIssueStats(allIssues);
      res.json({
        issues: filtered.map(toPublicIssue),
        totalCount: allIssues.length,
        filteredCount: filtered.length,
        stats,
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get('/issues/stats', async (_req: Request, res: Response) => {
    try {
      const allIssues = await store.listIssues();
      const stats = computeIssueStats(allIssues);
      res.json({ stats });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get('/issues/export', async (req: Request, res: Response) => {
    try {
      const allIssues = await store.listIssues();
      const filters = parseFiltersFromQuery(req.query);
      const filtered = sortIssues(filterIssues(allIssues, filters), filters.sort);
      const csv = serializeIssuesToCsv(filtered.map(toPublicIssue), { includeBom: true });
      const filename = getCsvExportFilename(filters.status);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Export-Count', String(filtered.length));
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(csv);
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get('/issues/:id', async (req: Request, res: Response) => {
    try {
      const issue = await store.getIssueById(String(req.params.id));
      if (!issue) {
        res.status(404).json({
          error: 'Civic issue not found.',
          code: 'NOT_FOUND',
        });
        return;
      }
      res.json({ issue: toPublicIssue(issue) });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post('/issues', requireVerifiedFirebaseUser, async (req: Request, res: Response) => {
    try {
      const payload = (req.body ?? {}) as CreateIssuePayload;
      const validation = validateCreateIssueInput(payload);
      if (!validation.valid) {
        res.status(400).json({
          error: 'Submitted issue contains invalid or missing fields.',
          code: 'VALIDATION_ERROR',
          details: validation.errors,
        });
        return;
      }

      let aiAnalysis: AiTriageAnalysis | undefined;
      if (payload.autoClassifyWithAi !== false) {
        aiAnalysis = await analyzeCivicIssueWithGemini({
          title: payload.title,
          description: payload.description,
          location: payload.location,
          categoryHint: payload.category,
          image: payload.image,
        });
      }

      const created = await store.createIssue(payload, aiAnalysis);
      res.status(201).json({ issue: created });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.patch(
    '/issues/:id',
    requireVerifiedFirebaseUser,
    requireCivicAdministrator,
    async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const existing = await store.getIssueById(id);
      if (!existing) {
        res.status(404).json({
          error: 'Civic issue not found.',
          code: 'NOT_FOUND',
        });
        return;
      }

      const patch = (req.body ?? {}) as AdminUpdateIssuePayload;
      const validation = validateAdminUpdateInput(existing.status, patch);
      if (!validation.valid) {
        res.status(400).json({
          error: 'Invalid update parameters.',
          code: 'VALIDATION_ERROR',
          details: validation.errors,
        });
        return;
      }

      const updated = await store.updateIssue(existing.id, patch);
      res.json({ issue: updated });
    } catch (error) {
      handleRouteError(res, error);
    }
    },
  );

  router.post('/issues/:id/endorse', requireVerifiedFirebaseUser, async (req: Request, res: Response) => {
    try {
      const delta = req.body?.delta === -1 ? -1 : 1;
      const updated = await store.toggleEndorsement(String(req.params.id), delta);
      if (!updated) {
        res.status(404).json({ error: 'Civic issue not found.', code: 'NOT_FOUND' });
        return;
      }
      res.json({ issue: toPublicIssue(updated) });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post('/issues/:id/comments', requireVerifiedFirebaseUser, async (req: Request, res: Response) => {
    try {
      const { body = '' } = (req.body ?? {}) as { body?: string };
      const err = validateCommentInput(body);
      if (err) {
        res.status(400).json({ error: err, code: 'VALIDATION_ERROR' });
        return;
      }
      const updated = await store.addComment(
        String(req.params.id),
        req.civicUser?.name || 'Verified Resident',
        req.civicUser?.isAdmin ? 'Administrator' : 'Citizen',
        body,
      );
      if (!updated) {
        res.status(404).json({ error: 'Civic issue not found.', code: 'NOT_FOUND' });
        return;
      }
      res.status(201).json({ issue: toPublicIssue(updated) });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post('/issues/:id/subscribe-sms', requireVerifiedFirebaseUser, async (req: Request, res: Response) => {
    try {
      const { phone = '' } = (req.body ?? {}) as { phone?: string };
      const err = validateSmsPhoneInput(phone);
      if (err) {
        res.status(400).json({ error: err, code: 'VALIDATION_ERROR' });
        return;
      }
      const updated = await store.subscribeSms(String(req.params.id));
      if (!updated) {
        res.status(404).json({ error: 'Civic issue not found.', code: 'NOT_FOUND' });
        return;
      }
      res.status(201).json({ issue: toPublicIssue(updated), subscribed: true });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post(
    '/issues/:id/reanalyze',
    requireVerifiedFirebaseUser,
    requireCivicAdministrator,
    async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const existing = await store.getIssueById(id);
      if (!existing) {
        res.status(404).json({
          error: 'Civic issue not found.',
          code: 'NOT_FOUND',
        });
        return;
      }

      const applyRecommendations = req.body?.applyRecommendations !== false;
      const aiAnalysis = await analyzeCivicIssueWithGemini({
        title: existing.title,
        description: existing.description,
        location: existing.location,
        categoryHint: existing.category,
        image: existing.image,
      });

      const updated = await store.attachAiAnalysis(
        existing.id,
        aiAnalysis,
        applyRecommendations,
      );
      res.json({ issue: updated, analysis: aiAnalysis });
    } catch (error) {
      handleRouteError(res, error);
    }
    },
  );

  router.delete(
    '/issues/:id',
    requireVerifiedFirebaseUser,
    requireCivicAdministrator,
    async (req: Request, res: Response) => {
    try {
      const deleted = await store.deleteIssue(String(req.params.id));
      if (!deleted) {
        res.status(404).json({
          error: 'Civic issue not found.',
          code: 'NOT_FOUND',
          },
        );
        return;
      }
      res.json({ deleted: true });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  return router;
}
