import { GoogleGenAI, GenerateContentResponse, Type } from '@google/genai';
import {
  AiTriageAnalysis,
  AnalyzeIssuePayload,
  IssueCategory,
  IssuePriority,
  MunicipalDepartment,
} from '../../src/shared/types.ts';
import {
  getDefaultDepartmentForCategory,
  isValidEnumValue,
} from '../../src/shared/civicDomain.ts';

const GEMINI_MODEL = 'gemini-4-hydrogen';

export class GeminiServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 500, code = 'GEMINI_ERROR') {
    super(message);
    this.name = 'GeminiServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new GeminiServiceError(
      'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets to enable AI classification.',
      503,
      'API_KEY_MISSING',
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractBase64FromDataUrl(dataUrl: string): string | null {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) {
    return null;
  }
  return dataUrl.slice(commaIndex + 1);
}

function extractCleanErrorMessage(rawMessage: string): string {
  const trimmed = rawMessage.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: { message?: string } };
      if (parsed?.error?.message) {
        return parsed.error.message;
      }
    } catch {
      // fall through
    }
  }
  return rawMessage;
}

export function mapGeminiError(
  error: unknown,
  modelName = GEMINI_MODEL,
  source: 'classifier' | 'chat' = 'classifier',
): GeminiServiceError {
  if (error instanceof GeminiServiceError) {
    return error;
  }

  const rawMessage = error instanceof Error ? error.message : String(error);
  const cleanMessage = extractCleanErrorMessage(rawMessage);
  const status =
    typeof (error as { status?: number })?.status === 'number'
      ? (error as { status: number }).status
      : undefined;

  if (
    status === 403 ||
    rawMessage.includes('PERMISSION_DENIED') ||
    rawMessage.includes('API_KEY_INVALID') ||
    status === 400
  ) {
    return new GeminiServiceError(
      'Gemini API authentication failed. Please verify your GEMINI_API_KEY in Settings > Secrets.',
      status === 403 ? 403 : 400,
      'API_KEY_INVALID',
    );
  }

  if (status === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
    return new GeminiServiceError(
      'Gemini API rate limit or quota exceeded. Please try again shortly or check your quota in Settings > Secrets.',
      429,
      'RESOURCE_EXHAUSTED',
    );
  }

  if (status === 503 || rawMessage.includes('UNAVAILABLE')) {
    const recoveryHint =
      source === 'chat'
        ? 'Please try again shortly or switch to Fast Lite (gemini-3.1-flash-lite).'
        : 'Please try again shortly, or uncheck automatic AI classification to submit with a manual category.';
    return new GeminiServiceError(
      `Gemini AI service is temporarily unavailable (${cleanMessage}). ${recoveryHint}`,
      503,
      'AI_UNAVAILABLE',
    );
  }

  if (status === 404 || rawMessage.includes('NOT_FOUND')) {
    return new GeminiServiceError(
      `Requested Gemini model (${modelName}) was not found or is unavailable.`,
      502,
      'MODEL_NOT_FOUND',
    );
  }

  return new GeminiServiceError(
    `Gemini AI analysis failed: ${cleanMessage}`,
    status && status >= 400 ? status : 502,
    'UPSTREAM_AI_ERROR',
  );
}

export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const mapped = mapGeminiError(error);
      if (mapped.statusCode === 400 || mapped.statusCode === 403 || mapped.statusCode === 503) {
        throw mapped;
      }
      if (attempt < maxRetries) {
        const delayMs = 400 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw mapGeminiError(lastError);
}

export async function analyzeCivicIssueWithGemini(
  payload: AnalyzeIssuePayload,
): Promise<AiTriageAnalysis> {
  const ai = getGeminiClient();
  const startedAt = Date.now();

  const categories = Object.values(IssueCategory);
  const priorities = Object.values(IssuePriority);
  const departments = Object.values(MunicipalDepartment);

  const systemInstruction = [
    'You are CivicResolve AI, a municipal 311 triage and routing specialist.',
    'Analyze the citizen complaint (and attached photo if provided) to determine:',
    '1. The exact issue category.',
    '2. Urgency priority (Critical = immediate life/safety hazard, live downed wires, major water main rupture, sinkhole; High = significant traffic/safety hazard or widespread utility outage; Medium = notable service disruption or localized infrastructure damage; Low = cosmetic or minor maintenance).',
    '3. Numeric urgencyScore (1 to 100).',
    '4. Primary recommended municipal department and optional secondary department.',
    '5. Confidence score (0.0 to 1.0).',
    '6. A concise publicImpactSummary (1-2 sentences) explaining the community impact and urgency rationale.',
    '7. 2 to 4 concrete recommendedActions for city dispatchers.',
    '8. estimatedSlaHours (realistic municipal response target in hours).',
    '9. tags: 2 to 3 concise 1-3 word hazard/sector tags.',
    `Allowed categories: ${categories.join(', ')}.`,
    `Allowed priorities: ${priorities.join(', ')}.`,
    `Allowed departments: ${departments.join(', ')}.`,
  ].join(' ');

  const textPrompt = [
    `Title: ${payload.title.trim()}`,
    `Location: ${payload.location.trim() || 'Not specified'}`,
    payload.categoryHint ? `Citizen Category Hint: ${payload.categoryHint}` : '',
    `Description: ${payload.description.trim()}`,
  ]
    .filter(Boolean)
    .join('\n');

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ text: textPrompt }];

  if (payload.image?.dataUrl && payload.image?.mimeType) {
    const base64Data = extractBase64FromDataUrl(payload.image.dataUrl);
    if (base64Data) {
      parts.unshift({
        inlineData: {
          mimeType: payload.image.mimeType,
          data: base64Data,
        },
      });
    }
  }

  const response: GenerateContentResponse = await withRetry(() =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedCategory: {
              type: Type.STRING,
              description: `One of: ${categories.join(', ')}`,
            },
            detectedPriority: {
              type: Type.STRING,
              description: `One of: ${priorities.join(', ')}`,
            },
            urgencyScore: {
              type: Type.INTEGER,
              description: 'Integer urgency score from 1 to 100.',
            },
            recommendedDepartment: {
              type: Type.STRING,
              description: `One of: ${departments.join(', ')}`,
            },
            secondaryDepartment: {
              type: Type.STRING,
              description: `Optional secondary department from: ${departments.join(', ')}`,
            },
            confidence: {
              type: Type.NUMBER,
              description: 'Confidence score between 0 and 1.',
            },
            publicImpactSummary: {
              type: Type.STRING,
              description: 'Concise 1-2 sentence explanation of public safety/service impact.',
            },
            recommendedActions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '2 to 4 concrete dispatch/inspection actions for city staff.',
            },
            estimatedSlaHours: {
              type: Type.INTEGER,
              description: 'Estimated target response time in hours.',
            },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '2 to 3 concise hazard or location tags.',
            },
          },
          required: [
            'detectedCategory',
            'detectedPriority',
            'urgencyScore',
            'recommendedDepartment',
            'confidence',
            'publicImpactSummary',
            'recommendedActions',
            'estimatedSlaHours',
          ],
        },
      },
    }),
  );

  const latencyMs = Date.now() - startedAt;
  const tokensProcessed = response.usageMetadata?.totalTokenCount ?? 360;

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new GeminiServiceError(
      'Gemini returned an empty response while analyzing the issue.',
      502,
      'EMPTY_AI_RESPONSE',
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw new GeminiServiceError(
      'Gemini returned malformed JSON while analyzing the issue.',
      502,
      'INVALID_AI_JSON',
    );
  }

  const detectedCategory = isValidEnumValue(IssueCategory, parsed.detectedCategory)
    ? parsed.detectedCategory
    : payload.categoryHint ?? IssueCategory.OTHER;

  const detectedPriority = isValidEnumValue(IssuePriority, parsed.detectedPriority)
    ? parsed.detectedPriority
    : IssuePriority.MEDIUM;

  const recommendedDepartment = isValidEnumValue(
    MunicipalDepartment,
    parsed.recommendedDepartment,
  )
    ? parsed.recommendedDepartment
    : getDefaultDepartmentForCategory(detectedCategory);

  const secondaryDepartment = isValidEnumValue(
    MunicipalDepartment,
    parsed.secondaryDepartment,
  )
    ? parsed.secondaryDepartment
    : undefined;

  const rawUrgency = Number(parsed.urgencyScore);
  const urgencyScore = Number.isFinite(rawUrgency)
    ? Math.max(1, Math.min(100, Math.round(rawUrgency)))
    : 50;

  const rawConfidence = Number(parsed.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? Math.max(0, Math.min(1, Math.round(rawConfidence * 100) / 100))
    : 0.85;

  const rawSla = Number(parsed.estimatedSlaHours);
  const estimatedSlaHours = Number.isFinite(rawSla)
    ? Math.max(1, Math.min(720, Math.round(rawSla)))
    : 48;

  const recommendedActions = Array.isArray(parsed.recommendedActions)
    ? parsed.recommendedActions
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .slice(0, 5)
    : [];

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .slice(0, 3)
    : [];

  return {
    detectedCategory,
    detectedPriority,
    urgencyScore,
    recommendedDepartment,
    secondaryDepartment:
      secondaryDepartment && secondaryDepartment !== recommendedDepartment
        ? secondaryDepartment
        : undefined,
    confidence,
    publicImpactSummary:
      typeof parsed.publicImpactSummary === 'string' && parsed.publicImpactSummary.trim()
        ? parsed.publicImpactSummary.trim()
        : 'AI triage completed based on complaint details.',
    recommendedActions:
      recommendedActions.length > 0
        ? recommendedActions
        : ['Dispatch field inspector to verify reported site conditions.'],
    estimatedSlaHours,
    analyzedAt: new Date().toISOString(),
    model: GEMINI_MODEL,
    tags: tags.length > 0 ? tags : [detectedCategory, `${detectedPriority} Priority`],
    tokensProcessed,
    latencyMs,
  };
}

export async function polishIssueDescriptionWithGemini(input: {
  title: string;
  description: string;
  location?: string;
}): Promise<string> {
  const ai = getGeminiClient();

  const response: GenerateContentResponse = await withRetry(() =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        'Rewrite the following citizen infrastructure complaint into a clear, factual, concise 2-3 sentence municipal work-order observation preserving all facts, dimensions, street references, and safety impacts. Return only the improved description text.',
        `Title: ${input.title.trim()}`,
        input.location ? `Location: ${input.location.trim()}` : '',
        `Original description: ${input.description.trim()}`,
      ]
        .filter(Boolean)
        .join('\n'),
    }),
  );

  const polished = (response.text ?? '').trim();
  if (!polished) {
    throw new GeminiServiceError(
      'Gemini returned an empty response while polishing the description.',
      502,
      'EMPTY_AI_RESPONSE',
    );
  }
  return polished;
}
