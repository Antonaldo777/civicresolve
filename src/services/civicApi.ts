import {
  AdminUpdateIssuePayload,
  AiTriageAnalysis,
  AnalyzeIssuePayload,
  ApiErrorPayload,
  CivicChatRequestPayload,
  CivicChatResponsePayload,
  CivicIssue,
  CreateIssuePayload,
  IssueDashboardStats,
  IssueFilterState,
  IssueImageAttachment,
  IssueWorkLogComment,
} from '../shared/types.ts';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_FIRESTORE_IMAGE_BYTES,
  MAX_IMAGE_DATA_URL_BYTES,
} from '../shared/civicDomain.ts';
import { auth } from '../firebase.ts';

export class CivicApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, string>;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: Record<string, string>,
  ) {
    super(message);
    this.name = 'CivicApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { error: text };
    }
  }

  if (!response.ok) {
    const errPayload = parsed as Partial<ApiErrorPayload>;
    throw new CivicApiError(
      errPayload.error || `Request failed with status ${response.status}`,
      response.status,
      errPayload.code,
      errPayload.details,
    );
  }

  return parsed as T;
}

export async function checkApiHealth(signal?: AbortSignal): Promise<{
  status: string;
  aiConfigured: boolean;
}> {
  return requestJson('/api/health', { method: 'GET', signal });
}

export async function fetchIssues(
  filters?: Partial<IssueFilterState>,
  signal?: AbortSignal,
): Promise<{
  issues: CivicIssue[];
  totalCount: number;
  filteredCount: number;
  stats: IssueDashboardStats;
}> {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.status && filters.status !== 'ALL') params.set('status', filters.status);
  if (filters?.priority && filters.priority !== 'ALL') params.set('priority', filters.priority);
  if (filters?.category && filters.category !== 'ALL') params.set('category', filters.category);
  if (filters?.department && filters.department !== 'ALL') {
    params.set('department', filters.department);
  }
  if (filters?.sort) params.set('sort', filters.sort);

  const qs = params.toString();
  return requestJson(`/api/issues${qs ? `?${qs}` : ''}`, { method: 'GET', signal });
}

export async function fetchIssueById(
  id: string,
  signal?: AbortSignal,
): Promise<{ issue: CivicIssue }> {
  return requestJson(`/api/issues/${encodeURIComponent(id)}`, {
    method: 'GET',
    signal,
  });
}

export async function fetchIssueStats(
  signal?: AbortSignal,
): Promise<{ stats: IssueDashboardStats }> {
  return requestJson('/api/issues/stats', { method: 'GET', signal });
}

export async function downloadIssuesCsvFromServer(
  filters?: Partial<IssueFilterState>,
  signal?: AbortSignal,
): Promise<{ csv: string; filename: string; count: number }> {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.status && filters.status !== 'ALL') params.set('status', filters.status);
  if (filters?.priority && filters.priority !== 'ALL') params.set('priority', filters.priority);
  if (filters?.category && filters.category !== 'ALL') params.set('category', filters.category);
  if (filters?.department && filters.department !== 'ALL') {
    params.set('department', filters.department);
  }
  if (filters?.sort) params.set('sort', filters.sort);

  const qs = params.toString();
  const response = await fetch(`/api/issues/export${qs ? `?${qs}` : ''}`, {
    method: 'GET',
    headers: { Accept: 'text/csv' },
    signal,
  });

  if (!response.ok) {
    throw new CivicApiError(
      `Failed to export CSV (${response.status}).`,
      response.status,
    );
  }

  const csv = await response.text();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename =
    match?.[1] ||
    `civicresolve-issues-${new Date().toISOString().slice(0, 10)}.csv`;
  const countHeader = Number(response.headers.get('X-Export-Count'));
  const count = Number.isFinite(countHeader) ? countHeader : 0;

  return { csv, filename, count };
}

export async function analyzeIssueWithAi(
  payload: AnalyzeIssuePayload,
  signal?: AbortSignal,
): Promise<{ analysis: AiTriageAnalysis }> {
  return requestJson('/api/ai/analyze', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });
}

export async function polishIssueDescription(
  payload: { title: string; description: string; location?: string },
  signal?: AbortSignal,
): Promise<{ description: string }> {
  return requestJson('/api/ai/polish', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });
}

export async function sendCivicChatMessageApi(
  payload: CivicChatRequestPayload,
  signal?: AbortSignal,
): Promise<CivicChatResponsePayload> {
  return requestJson('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });
}

export async function streamCivicChatMessageApi(
  payload: CivicChatRequestPayload,
  handlers: {
    onChunk: (delta: string) => void;
    onDone: (meta: CivicChatResponsePayload) => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch('/api/ai/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    let parsed: Partial<ApiErrorPayload> = {};
    try {
      parsed = JSON.parse(text) as Partial<ApiErrorPayload>;
    } catch {
      parsed = { error: text };
    }
    throw new CivicApiError(
      parsed.error || `Chat request failed with status ${response.status}`,
      response.status,
      parsed.code,
    );
  }

  if (!response.body) {
    const fallback = await sendCivicChatMessageApi(payload, signal);
    handlers.onChunk(fallback.reply);
    handlers.onDone(fallback);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let receivedDone = false;

  const processEventBlock = (block: string) => {
    const lines = block.split(/\r?\n/);
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (dataLines.length === 0) return;
    const rawData = dataLines.join('\n');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawData) as Record<string, unknown>;
    } catch {
      return;
    }

    if (eventName === 'chunk' && typeof parsed.delta === 'string') {
      handlers.onChunk(parsed.delta);
    } else if (eventName === 'done') {
      receivedDone = true;
      handlers.onDone(parsed as unknown as CivicChatResponsePayload);
    } else if (eventName === 'error') {
      throw new CivicApiError(
        typeof parsed.error === 'string' ? parsed.error : 'Gemini chat stream failed.',
        typeof parsed.statusCode === 'number' ? parsed.statusCode : 502,
        typeof parsed.code === 'string' ? parsed.code : 'UPSTREAM_AI_ERROR',
      );
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      if (part.trim()) {
        processEventBlock(part);
      }
    }
  }

  if (buffer.trim()) {
    processEventBlock(buffer);
  }

  if (!receivedDone) {
    throw new CivicApiError(
      'Gemini response stream closed before completion.',
      502,
      'STREAM_INCOMPLETE',
    );
  }
}

export async function createCivicIssue(
  payload: CreateIssuePayload,
): Promise<{ issue: CivicIssue }> {
  return requestJson('/api/issues', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCivicIssue(
  id: string,
  patch: AdminUpdateIssuePayload,
): Promise<{ issue: CivicIssue }> {
  return requestJson(`/api/issues/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function endorseCivicIssueApi(
  id: string,
  delta: 1 | -1,
): Promise<{ issue: CivicIssue }> {
  return requestJson(`/api/issues/${encodeURIComponent(id)}/endorse`, {
    method: 'POST',
    body: JSON.stringify({ delta }),
  });
}

export async function addIssueCommentApi(
  id: string,
  body: string,
  authorName = 'Verified Resident',
  authorRole: IssueWorkLogComment['authorRole'] = 'Citizen',
): Promise<{ issue: CivicIssue }> {
  return requestJson(`/api/issues/${encodeURIComponent(id)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body, authorName, authorRole }),
  });
}

export async function subscribeIssueSmsApi(
  id: string,
  phone: string,
): Promise<{ issue: CivicIssue; subscribed: boolean }> {
  return requestJson(`/api/issues/${encodeURIComponent(id)}/subscribe-sms`, {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export async function reanalyzeCivicIssue(
  id: string,
  applyRecommendations = true,
): Promise<{ issue: CivicIssue; analysis: AiTriageAnalysis }> {
  return requestJson(`/api/issues/${encodeURIComponent(id)}/reanalyze`, {
    method: 'POST',
    body: JSON.stringify({ applyRecommendations }),
  });
}

export async function deleteCivicIssue(id: string): Promise<{ deleted: boolean }> {
  return requestJson(`/api/issues/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

async function compressDataUrlForCloud(dataUrl: string, mimeType: string): Promise<{
  dataUrl: string;
  mimeType: string;
}> {
  if (dataUrl.length <= MAX_FIRESTORE_IMAGE_BYTES || typeof document === 'undefined') {
    return { dataUrl, mimeType };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1024;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ dataUrl, mimeType });
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL('image/jpeg', 0.78);
      resolve({ dataUrl: compressed, mimeType: 'image/jpeg' });
    };
    img.onerror = () => resolve({ dataUrl, mimeType });
    img.src = dataUrl;
  });
}

export async function readImageFileAsAttachment(
  file: File,
  altText?: string,
): Promise<IssueImageAttachment> {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    throw new Error('Please upload a JPEG, PNG, WebP, or GIF image.');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

  if (rawDataUrl.length > MAX_IMAGE_DATA_URL_BYTES) {
    throw new Error('Image exceeds the 4 MB upload limit. Please choose a smaller image.');
  }

  const { dataUrl, mimeType } = await compressDataUrlForCloud(rawDataUrl, file.type);

  return {
    dataUrl,
    mimeType,
    fileName: file.name,
    altText: altText?.trim() || `Photo attached for civic issue (${file.name})`,
  };
}
