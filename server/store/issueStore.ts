import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  AdminUpdateIssuePayload,
  AiTriageAnalysis,
  CivicIssue,
  CreateIssuePayload,
  IssueCategory,
  IssuePriority,
  IssueStatus,
  IssueStatusHistoryEntry,
  IssueWorkLogComment,
} from '../../src/shared/types.ts';
import {
  deriveCoordinatesForLocation,
  generateTrackingCode,
  getDefaultDepartmentForCategory,
  inferWardFromLocation,
} from '../../src/shared/civicDomain.ts';
import { SEED_ISSUES } from './seedData.ts';

interface PersistedStoreShape {
  sequenceCounter: number;
  issues: CivicIssue[];
  privateContacts: Record<string, { reporterName?: string; reporterContact?: string }>;
}

export class IssueStore {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();
  private cache: PersistedStoreShape | null = null;

  constructor(filePath = path.resolve(process.cwd(), 'data', 'issues.json')) {
    this.filePath = filePath;
  }

  private async ensureLoaded(): Promise<PersistedStoreShape> {
    if (this.cache) {
      return this.cache;
    }

    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedStoreShape;
      if (
        parsed &&
        typeof parsed.sequenceCounter === 'number' &&
        Array.isArray(parsed.issues)
      ) {
        const privateContacts =
          parsed.privateContacts && typeof parsed.privateContacts === 'object'
            ? parsed.privateContacts
            : {};
        let migrated = !parsed.privateContacts;
        const issues = parsed.issues.map((storedIssue) => {
          if (!storedIssue || typeof storedIssue !== 'object') {
            return storedIssue;
          }
          const {
            reporterName,
            reporterContact,
            ...publicIssue
          } = storedIssue as CivicIssue & {
            reporterName?: string;
            reporterContact?: string;
          };
          if (reporterName || reporterContact) {
            privateContacts[publicIssue.id] = {
              ...privateContacts[publicIssue.id],
              reporterName,
              reporterContact,
            };
            migrated = true;
          }
          return publicIssue as CivicIssue;
        });
        this.cache = {
          sequenceCounter: parsed.sequenceCounter,
          issues,
          privateContacts,
        };
        if (migrated) {
          await this.persistToDisk(this.cache);
        }
        return this.cache;
      }
    } catch {
      // File missing or unreadable -> initialize from seed
    }

    const initial: PersistedStoreShape = {
      sequenceCounter: SEED_ISSUES.length,
      issues: structuredClone(SEED_ISSUES),
      privateContacts: {},
    };
    this.cache = initial;
    await this.persistToDisk(initial);
    return initial;
  }

  private async persistToDisk(data: PersistedStoreShape): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmpPath, this.filePath);
  }

  private enqueueMutation<T>(fn: (store: PersistedStoreShape) => Promise<T> | T): Promise<T> {
    const run = this.writeQueue.then(async () => {
      const store = await this.ensureLoaded();
      const result = await fn(store);
      await this.persistToDisk(store);
      return result;
    });
    this.writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async listIssues(): Promise<CivicIssue[]> {
    const store = await this.ensureLoaded();
    return structuredClone(store.issues);
  }

  async getIssueById(id: string): Promise<CivicIssue | null> {
    const store = await this.ensureLoaded();
    const found = store.issues.find((item) => item.id === id || item.trackingCode === id);
    return found ? structuredClone(found) : null;
  }

  async createIssue(
    payload: CreateIssuePayload,
    aiAnalysis?: AiTriageAnalysis,
  ): Promise<CivicIssue> {
    return this.enqueueMutation((store) => {
      const now = new Date().toISOString();
      store.sequenceCounter += 1;
      const id = crypto.randomUUID();

      const resolvedCategory =
        aiAnalysis?.detectedCategory ?? payload.category ?? IssueCategory.OTHER;
      const resolvedPriority =
        aiAnalysis?.detectedPriority ?? IssuePriority.MEDIUM;
      const resolvedDepartment =
        aiAnalysis?.recommendedDepartment ??
        getDefaultDepartmentForCategory(resolvedCategory);
      const ward = payload.ward?.trim() || inferWardFromLocation(payload.location);
      const coordinates = deriveCoordinatesForLocation(payload.location, ward);

      const history: IssueStatusHistoryEntry[] = [
        {
          id: crypto.randomUUID(),
          status: IssueStatus.REPORTED,
          priority: resolvedPriority,
          department: resolvedDepartment,
          note: aiAnalysis
            ? `Report submitted. Gemini AI classified as ${resolvedCategory} (${resolvedPriority} priority) and recommended ${resolvedDepartment}.`
            : `Report submitted under ${resolvedCategory} and routed to ${resolvedDepartment}.`,
          actor: aiAnalysis ? 'Gemini AI' : 'Citizen',
          timestamp: now,
        },
      ];

      const issue: CivicIssue = {
        id,
        trackingCode: generateTrackingCode(store.sequenceCounter),
        title: payload.title.trim(),
        description: payload.description.trim(),
        location: payload.location.trim(),
        ward,
        coordinates,
        category: resolvedCategory,
        priority: resolvedPriority,
        status: IssueStatus.REPORTED,
        assignedDepartment: resolvedDepartment,
        slaTarget: aiAnalysis ? `< ${aiAnalysis.estimatedSlaHours} Hours` : '< 24 Hours',
        aiApproved: false,
        endorsementCount: 1,
        smsSubscribersCount: 0,
        image: payload.image,
        aiAnalysis,
        statusHistory: history,
        comments: [],
        visibility: 'public',
        createdAt: now,
        updatedAt: now,
      };

      const reporterName = payload.reporterName?.trim();
      const reporterContact = payload.reporterContact?.trim();
      if (reporterName || reporterContact) {
        store.privateContacts[id] = {
          reporterName: reporterName || undefined,
          reporterContact: reporterContact || undefined,
        };
      }
      store.issues.unshift(issue);
      return structuredClone(issue);
    });
  }

  async updateIssue(
    id: string,
    patch: AdminUpdateIssuePayload,
  ): Promise<CivicIssue | null> {
    return this.enqueueMutation((store) => {
      const index = store.issues.findIndex((item) => item.id === id);
      if (index === -1) {
        return null;
      }

      const existing = store.issues[index];
      const now = new Date().toISOString();

      const nextStatus = patch.status ?? existing.status;
      const nextPriority = patch.priority ?? existing.priority;
      const nextCategory = patch.category ?? existing.category;
      const nextDepartment = patch.assignedDepartment ?? existing.assignedDepartment;
      const nextCrew =
        patch.assignedCrew !== undefined ? patch.assignedCrew.trim() : existing.assignedCrew;
      const nextSla =
        patch.slaTarget !== undefined ? patch.slaTarget.trim() : existing.slaTarget;
      const nextAiApproved =
        patch.aiApproved !== undefined ? patch.aiApproved : existing.aiApproved;
      const nextDup =
        patch.isDuplicateOf !== undefined ? patch.isDuplicateOf : existing.isDuplicateOf;
      const nextAdminNotes =
        patch.adminNotes !== undefined ? patch.adminNotes.trim() : existing.adminNotes;

      const changes: string[] = [];
      if (patch.status && patch.status !== existing.status) {
        changes.push(`status changed from ${existing.status} to ${patch.status}`);
      }
      if (patch.priority && patch.priority !== existing.priority) {
        changes.push(`priority updated to ${patch.priority}`);
      }
      if (patch.assignedDepartment && patch.assignedDepartment !== existing.assignedDepartment) {
        changes.push(`reassigned to ${patch.assignedDepartment}`);
      }
      if (patch.assignedCrew && patch.assignedCrew !== existing.assignedCrew) {
        changes.push(`assigned crew ${patch.assignedCrew}`);
      }
      if (patch.category && patch.category !== existing.category) {
        changes.push(`recategorized as ${patch.category}`);
      }
      if (patch.aiApproved === true && !existing.aiApproved) {
        changes.push('AI routing approved');
      }

      const customNote = patch.statusNote?.trim();
      const historyNote =
        customNote ||
        (changes.length > 0
          ? `Administrator update: ${changes.join('; ')}.`
          : 'Administrator updated issue record.');

      const historyEntry: IssueStatusHistoryEntry = {
        id: crypto.randomUUID(),
        status: nextStatus,
        priority: nextPriority,
        department: nextDepartment,
        note: historyNote,
        actor: 'Administrator',
        timestamp: now,
      };

      const resolvedAt =
        nextStatus === IssueStatus.RESOLVED
          ? existing.resolvedAt ?? now
          : undefined;

      const updated: CivicIssue = {
        ...existing,
        status: nextStatus,
        priority: nextPriority,
        category: nextCategory,
        assignedDepartment: nextDepartment,
        assignedCrew: nextCrew,
        slaTarget: nextSla,
        aiApproved: nextAiApproved,
        isDuplicateOf: nextDup,
        adminNotes: nextAdminNotes,
        updatedAt: now,
        resolvedAt,
        statusHistory: [...existing.statusHistory, historyEntry],
      };

      store.issues[index] = updated;
      return structuredClone(updated);
    });
  }

  async toggleEndorsement(id: string, delta: 1 | -1): Promise<CivicIssue | null> {
    return this.enqueueMutation((store) => {
      const index = store.issues.findIndex((item) => item.id === id);
      if (index === -1) return null;
      const existing = store.issues[index];
      const nextCount = Math.max(0, (existing.endorsementCount ?? 0) + delta);
      const updated: CivicIssue = {
        ...existing,
        endorsementCount: nextCount,
        updatedAt: new Date().toISOString(),
      };
      store.issues[index] = updated;
      return structuredClone(updated);
    });
  }

  async addComment(
    id: string,
    authorName: string,
    authorRole: IssueWorkLogComment['authorRole'],
    body: string,
  ): Promise<CivicIssue | null> {
    return this.enqueueMutation((store) => {
      const index = store.issues.findIndex((item) => item.id === id);
      if (index === -1) return null;
      const existing = store.issues[index];
      const now = new Date().toISOString();
      const comment: IssueWorkLogComment = {
        id: crypto.randomUUID(),
        issueId: existing.id,
        authorName: authorName.trim(),
        authorRole,
        body: body.trim(),
        timestamp: now,
      };
      const updated: CivicIssue = {
        ...existing,
        comments: [comment, ...(existing.comments ?? [])],
        updatedAt: now,
      };
      store.issues[index] = updated;
      return structuredClone(updated);
    });
  }

  async subscribeSms(id: string): Promise<CivicIssue | null> {
    return this.enqueueMutation((store) => {
      const index = store.issues.findIndex((item) => item.id === id);
      if (index === -1) return null;
      const existing = store.issues[index];
      const updated: CivicIssue = {
        ...existing,
        smsSubscribersCount: (existing.smsSubscribersCount ?? 0) + 1,
        updatedAt: new Date().toISOString(),
      };
      store.issues[index] = updated;
      return structuredClone(updated);
    });
  }

  async attachAiAnalysis(
    id: string,
    aiAnalysis: AiTriageAnalysis,
    applyRecommendations = true,
  ): Promise<CivicIssue | null> {
    return this.enqueueMutation((store) => {
      const index = store.issues.findIndex((item) => item.id === id);
      if (index === -1) {
        return null;
      }

      const existing = store.issues[index];
      const now = new Date().toISOString();

      const nextCategory = applyRecommendations
        ? aiAnalysis.detectedCategory
        : existing.category;
      const nextPriority = applyRecommendations
        ? aiAnalysis.detectedPriority
        : existing.priority;
      const nextDepartment = applyRecommendations
        ? aiAnalysis.recommendedDepartment
        : existing.assignedDepartment;

      const historyEntry: IssueStatusHistoryEntry = {
        id: crypto.randomUUID(),
        status: existing.status,
        priority: nextPriority,
        department: nextDepartment,
        note: `Gemini AI re-analysis completed: ${nextCategory}, ${nextPriority} priority, recommended ${nextDepartment}.`,
        actor: 'Gemini AI',
        timestamp: now,
      };

      const updated: CivicIssue = {
        ...existing,
        category: nextCategory,
        priority: nextPriority,
        assignedDepartment: nextDepartment,
        slaTarget: `< ${aiAnalysis.estimatedSlaHours} Hours`,
        aiAnalysis,
        updatedAt: now,
        statusHistory: [...existing.statusHistory, historyEntry],
      };

      store.issues[index] = updated;
      return structuredClone(updated);
    });
  }

  async deleteIssue(id: string): Promise<boolean> {
    return this.enqueueMutation((store) => {
      const before = store.issues.length;
      store.issues = store.issues.filter((item) => item.id !== id);
      delete store.privateContacts[id];
      return store.issues.length < before;
    });
  }
}

export const defaultIssueStore = new IssueStore();
