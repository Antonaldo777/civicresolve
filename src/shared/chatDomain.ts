import {
  AppView,
  CivicChatContextSnapshot,
  CivicChatModelId,
  CivicChatRequestPayload,
  CivicChatRoleId,
  CivicChatTurn,
  CivicIssue,
  IssueCategory,
  IssueDashboardStats,
  MunicipalDepartment,
} from './types.ts';

export interface ChatRolePresetDefinition {
  id: CivicChatRoleId;
  label: string;
  shortLabel: string;
  badge: string;
  description: string;
  systemRoleDirective: string;
  starterPrompts: string[];
}

export const CHAT_ROLE_PRESETS: Record<CivicChatRoleId, ChatRolePresetDefinition> = {
  'citizen-concierge': {
    id: 'citizen-concierge',
    label: 'Citizen 311 Concierge',
    shortLabel: '311 Concierge',
    badge: 'Public Intake & Tracking',
    description:
      'Helps residents craft actionable reports, pick the right department, and understand SLA timelines.',
    systemRoleDirective:
      'You are the CivicResolve Citizen 311 Concierge. Your role is to help city residents describe local infrastructure issues clearly (what, exact street/landmark, observable hazard, pedestrian/traffic impact), identify the proper municipal department, explain expected urgency levels and SLA response windows, and guide them on tracking existing tickets. If someone describes an immediate life-threatening emergency (gas leak explosion, active fire, arcing/downed live power line, violent incident, medical emergency), instruct them to call 911 immediately before submitting a 311 ticket.',
    starterPrompts: [
      'Help me write a clear report for a flooded intersection',
      'Which department handles flickering traffic signals?',
      'What details make a pothole report get triaged faster?',
    ],
  },
  'ops-strategist': {
    id: 'ops-strategist',
    label: 'Municipal Dispatch Advisor',
    shortLabel: 'Dispatch Advisor',
    badge: 'Ops & Triage Strategy',
    description:
      'Assists city dispatchers with priority queues, crew routing, SLA triage, and resident updates.',
    systemRoleDirective:
      'You are the CivicResolve Municipal Dispatch Advisor assisting city operations directors and 311 coordinators. Your role is to help prioritize incoming infrastructure queues, recommend cross-department crew routing, evaluate SLA risks, and draft concise, transparent public work-log updates for citizens. Ground operational advice in standard municipal service-level priorities (Critical -> High -> Medium -> Low) and reference live ledger metrics when provided.',
    starterPrompts: [
      'How should we prioritize Critical vs High tickets during storm surge?',
      'Draft a clear public crew-on-site update for a water main break',
      'Summarize the active ticket context and suggest next dispatch steps',
    ],
  },
  'field-safety-auditor': {
    id: 'field-safety-auditor',
    label: 'Infrastructure & Safety Analyst',
    shortLabel: 'Safety Analyst',
    badge: 'Root-Cause & Field QA',
    description:
      'Provides engineering checklists, ADA/pedestrian risk assessments, and preventive maintenance insights.',
    systemRoleDirective:
      'You are the CivicResolve Infrastructure & Safety Analyst. Your role is to evaluate municipal infrastructure complaints from a public-works engineering and safety standpoint: identify root-cause factors (freeze-thaw cycles, sub-base erosion, storm-drain blockage, ADA accessibility barriers), list field inspection verification steps, and recommend preventative follow-up measures before marking a ticket Resolved & Verified.',
    starterPrompts: [
      'Give me a field QA checklist before closing a road sinkhole repair',
      'What ADA & pedestrian hazards should we flag on sidewalk obstructions?',
      'Analyze root causes behind recurring Ward 4 pothole clusters',
    ],
  },
};

export const CHAT_ROLE_LIST: ChatRolePresetDefinition[] = Object.values(CHAT_ROLE_PRESETS);

export const MAX_CHAT_MESSAGE_CHARS = 2000;
export const MAX_CHAT_HISTORY_TURNS = 20;

export function isValidChatRoleId(value: unknown): value is CivicChatRoleId {
  return typeof value === 'string' && value in CHAT_ROLE_PRESETS;
}

export function resolveChatModel(fastMode = false): CivicChatModelId {
  return fastMode ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
}

export function buildSanitizedCivicContext(
  stats: IssueDashboardStats,
  activeView?: AppView,
  selectedIssue?: CivicIssue | null,
): CivicChatContextSnapshot {
  const snapshot: CivicChatContextSnapshot = {
    activeView,
    totalIssues: stats.total,
    openUrgentCount: stats.openUrgentCount,
    activeInProgressCount: stats.activeInProgressCount,
    resolutionRatePercent: stats.resolutionRatePercent,
  };

  if (selectedIssue) {
    snapshot.selectedIssueSummary = {
      trackingCode: selectedIssue.trackingCode,
      title: selectedIssue.title,
      category: selectedIssue.category,
      priority: selectedIssue.priority,
      status: selectedIssue.status,
      ward: selectedIssue.ward,
      assignedDepartment: selectedIssue.assignedDepartment,
      slaTarget: selectedIssue.slaTarget,
      aiSummary: selectedIssue.aiAnalysis?.publicImpactSummary,
    };
  }

  return snapshot;
}

export function buildChatSystemInstruction(
  rolePreset: CivicChatRoleId,
  context?: CivicChatContextSnapshot,
): string {
  const preset = CHAT_ROLE_PRESETS[rolePreset] ?? CHAT_ROLE_PRESETS['citizen-concierge'];
  const categories = Object.values(IssueCategory).join(', ');
  const departments = Object.values(MunicipalDepartment).join(', ');

  const lines: string[] = [
    preset.systemRoleDirective,
    'Response style guidelines: Keep responses practical, accurate, well-structured, and concise (typically 2-4 short paragraphs or crisp bullet points, under ~220 words unless the user asks for a detailed checklist). Never invent ticket numbers, street statuses, or crew names that were not provided.',
    `CivicResolve supported issue categories: ${categories}.`,
    `CivicResolve municipal departments: ${departments}.`,
  ];

  if (context) {
    const contextParts: string[] = [];
    if (typeof context.totalIssues === 'number') {
      contextParts.push(
        `Live CivicResolve Ledger: ${context.totalIssues} total issues, ${context.openUrgentCount ?? 0} open High/Critical urgent tickets, ${context.activeInProgressCount ?? 0} active in-progress/dispatched tickets, ${context.resolutionRatePercent ?? 0}% resolution rate.`,
      );
    }
    if (context.activeView) {
      contextParts.push(`User current workspace view: ${context.activeView}.`);
    }
    if (context.selectedIssueSummary) {
      const s = context.selectedIssueSummary;
      contextParts.push(
        `Currently inspected ticket: ${s.trackingCode} — "${s.title}" | Ward: ${s.ward} | Category: ${s.category} | Priority: ${s.priority} | Status: ${s.status} | Dept: ${s.assignedDepartment}${s.slaTarget ? ` | SLA: ${s.slaTarget}` : ''}${s.aiSummary ? ` | Triage Note: ${s.aiSummary}` : ''}.`,
      );
    }
    if (contextParts.length > 0) {
      lines.push(contextParts.join(' '));
    }
  }

  return lines.join('\n\n');
}

export interface ChatValidationResult {
  valid: boolean;
  error?: string;
  payload?: CivicChatRequestPayload;
}

export function validateAndNormalizeChatPayload(raw: unknown): ChatValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Chat request payload is required.' };
  }

  const record = raw as Record<string, unknown>;
  const message = typeof record.message === 'string' ? record.message.trim() : '';

  if (!message) {
    return { valid: false, error: 'Enter a message before sending.' };
  }
  if (message.length > MAX_CHAT_MESSAGE_CHARS) {
    return {
      valid: false,
      error: `Message must be ${MAX_CHAT_MESSAGE_CHARS.toLocaleString()} characters or fewer.`,
    };
  }

  let rolePreset: CivicChatRoleId = 'citizen-concierge';
  if (record.rolePreset !== undefined) {
    if (!isValidChatRoleId(record.rolePreset)) {
      return { valid: false, error: 'Invalid chatbot role preset selected.' };
    }
    rolePreset = record.rolePreset;
  }

  const fastMode = Boolean(record.fastMode);

  const sanitizedHistory: CivicChatTurn[] = [];
  if (Array.isArray(record.history)) {
    for (const item of record.history.slice(-MAX_CHAT_HISTORY_TURNS)) {
      if (!item || typeof item !== 'object') continue;
      const turn = item as Record<string, unknown>;
      const role = turn.role;
      const text = typeof turn.text === 'string' ? turn.text.trim() : '';
      if ((role === 'user' || role === 'model') && text.length > 0) {
        sanitizedHistory.push({
          role,
          text: text.slice(0, MAX_CHAT_MESSAGE_CHARS * 2),
        });
      }
    }
  }

  // Gemini chat history should begin with a user turn when non-empty
  while (sanitizedHistory.length > 0 && sanitizedHistory[0].role !== 'user') {
    sanitizedHistory.shift();
  }

  let safeContext: CivicChatContextSnapshot | undefined;
  if (record.context && typeof record.context === 'object') {
    const ctx = record.context as Record<string, unknown>;
    safeContext = {
      activeView: typeof ctx.activeView === 'string' ? (ctx.activeView as AppView) : undefined,
      totalIssues:
        typeof ctx.totalIssues === 'number' && Number.isFinite(ctx.totalIssues)
          ? ctx.totalIssues
          : undefined,
      openUrgentCount:
        typeof ctx.openUrgentCount === 'number' && Number.isFinite(ctx.openUrgentCount)
          ? ctx.openUrgentCount
          : undefined,
      activeInProgressCount:
        typeof ctx.activeInProgressCount === 'number' && Number.isFinite(ctx.activeInProgressCount)
          ? ctx.activeInProgressCount
          : undefined,
      resolutionRatePercent:
        typeof ctx.resolutionRatePercent === 'number' && Number.isFinite(ctx.resolutionRatePercent)
          ? ctx.resolutionRatePercent
          : undefined,
    };

    if (ctx.selectedIssueSummary && typeof ctx.selectedIssueSummary === 'object') {
      const s = ctx.selectedIssueSummary as Record<string, unknown>;
      if (typeof s.trackingCode === 'string' && typeof s.title === 'string') {
        safeContext.selectedIssueSummary = {
          trackingCode: s.trackingCode.slice(0, 40),
          title: s.title.slice(0, 160),
          category: s.category as IssueCategory,
          priority: s.priority as CivicIssue['priority'],
          status: s.status as CivicIssue['status'],
          ward: typeof s.ward === 'string' ? s.ward.slice(0, 40) : 'Ward 1',
          assignedDepartment: s.assignedDepartment as MunicipalDepartment,
          slaTarget: typeof s.slaTarget === 'string' ? s.slaTarget.slice(0, 60) : undefined,
          aiSummary: typeof s.aiSummary === 'string' ? s.aiSummary.slice(0, 320) : undefined,
        };
      }
    }
  }

  return {
    valid: true,
    payload: {
      message,
      history: sanitizedHistory,
      rolePreset,
      fastMode,
      context: safeContext,
    },
  };
}
