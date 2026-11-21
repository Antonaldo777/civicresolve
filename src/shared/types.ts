export enum IssueStatus {
  REPORTED = 'Reported',
  TRIAGED = 'Triaged',
  DISPATCHED = 'Dispatched',
  IN_PROGRESS = 'In Progress',
  RESOLVED = 'Resolved',
}

export enum IssuePriority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical',
}

export enum IssueCategory {
  ROAD_INFRASTRUCTURE = 'Road & Potholes',
  SANITATION_WASTE = 'Waste & Sanitation',
  STREETLIGHTING = 'Streetlighting & Electrical',
  WATER_DRAINAGE = 'Water & Drainage',
  PARKS_RECREATION = 'Parks & Public Spaces',
  TRAFFIC_SIGNAGE = 'Traffic & Signage',
  PUBLIC_SAFETY = 'Public Safety & Hazards',
  OTHER = 'Other',
}

export enum MunicipalDepartment {
  TRANSPORTATION = 'Department of Transportation & Public Works',
  SANITATION = 'Sanitation & Solid Waste Management',
  POWER_LIGHTING = 'Municipal Power & Streetlighting',
  WATER_SEWER = 'Water & Sewer Authority',
  PARKS = 'Parks & Recreation Department',
  TRAFFIC = 'Traffic Engineering & Mobility',
  EMERGENCY = 'Emergency Municipal Response',
  GENERAL_SERVICES = '311 General Municipal Services',
}

export type IssueSortOption =
  | 'newest'
  | 'oldest'
  | 'priority-desc'
  | 'priority-asc'
  | 'updated';

export type AppView =
  | 'report-an-issue'
  | 'public-tracker'
  | 'live-city-map'
  | 'admin-triage-and-ops'
  | 'gemini-ai-insights';

export interface IssueImageAttachment {
  dataUrl: string;
  mimeType: string;
  fileName: string;
  altText: string;
}

export interface IssueCoordinates {
  lat: number;
  lng: number;
}

export interface AiTriageAnalysis {
  detectedCategory: IssueCategory;
  detectedPriority: IssuePriority;
  urgencyScore: number;
  recommendedDepartment: MunicipalDepartment;
  secondaryDepartment?: MunicipalDepartment;
  confidence: number;
  publicImpactSummary: string;
  recommendedActions: string[];
  estimatedSlaHours: number;
  analyzedAt: string;
  model: string;
  tags?: string[];
  tokensProcessed?: number;
  latencyMs?: number;
}

export interface IssueStatusHistoryEntry {
  id: string;
  status: IssueStatus;
  priority?: IssuePriority;
  department?: MunicipalDepartment;
  note: string;
  actor: 'Citizen' | 'Gemini AI' | 'Administrator';
  timestamp: string;
}

export interface IssueWorkLogComment {
  id: string;
  issueId: string;
  authorName: string;
  authorRole: 'Citizen' | 'Crew' | 'Gemini AI' | 'Administrator';
  body: string;
  timestamp: string;
}

export interface CivicIssue {
  id: string;
  trackingCode: string;
  title: string;
  description: string;
  location: string;
  ward: string;
  coordinates?: IssueCoordinates;
  category: IssueCategory;
  priority: IssuePriority;
  status: IssueStatus;
  assignedDepartment: MunicipalDepartment;
  assignedCrew?: string;
  slaTarget?: string;
  aiApproved: boolean;
  endorsementCount: number;
  smsSubscribersCount?: number;
  isDuplicateOf?: string;
  image?: IssueImageAttachment;
  aiAnalysis?: AiTriageAnalysis;
  adminNotes?: string;
  statusHistory: IssueStatusHistoryEntry[];
  comments: IssueWorkLogComment[];
  visibility?: 'public';
  authorUid?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface CreateIssuePayload {
  title: string;
  description: string;
  location: string;
  ward?: string;
  category?: IssueCategory;
  priority?: IssuePriority;
  reporterName?: string;
  reporterContact?: string;
  image?: IssueImageAttachment;
  autoClassifyWithAi?: boolean;
  precomputedAiAnalysis?: AiTriageAnalysis;
}

export interface AnalyzeIssuePayload {
  title: string;
  description: string;
  location: string;
  categoryHint?: IssueCategory;
  image?: IssueImageAttachment;
}

export interface AdminUpdateIssuePayload {
  status?: IssueStatus;
  priority?: IssuePriority;
  category?: IssueCategory;
  assignedDepartment?: MunicipalDepartment;
  assignedCrew?: string;
  slaTarget?: string;
  aiApproved?: boolean;
  isDuplicateOf?: string;
  adminNotes?: string;
  statusNote?: string;
}

export interface IssueFilterState {
  search: string;
  status: IssueStatus | 'ALL';
  priority: IssuePriority | 'ALL';
  category: IssueCategory | 'ALL';
  department: MunicipalDepartment | 'ALL';
  sort: IssueSortOption;
}

export interface IssueDashboardStats {
  total: number;
  byStatus: Record<IssueStatus, number>;
  byPriority: Record<IssuePriority, number>;
  byCategory: Record<string, number>;
  byDepartment: Record<string, number>;
  openUrgentCount: number;
  activeInProgressCount: number;
  resolutionRatePercent: number;
  averageResolutionHours: number | null;
}

export interface GovernanceSettings {
  autoDispatchThreshold: number;
  emergencyKeywords: string[];
  emergencyPause: boolean;
  edgeRules: string[];
  updatedAt: string;
}

export interface AiAuditLogEntry {
  id: string;
  eventType: string;
  summary: string;
  ticketCode?: string;
  tokensProcessed?: number;
  latencyMs?: number;
  timestamp: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  fieldOrder: string[];
}

export interface ApiErrorPayload {
  error: string;
  code?: string;
  details?: Record<string, string>;
}

export type CivicChatRoleId =
  | 'citizen-concierge'
  | 'ops-strategist'
  | 'field-safety-auditor';

export type CivicChatModelId = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';

export interface CivicChatTurn {
  role: 'user' | 'model';
  text: string;
}

export interface CivicChatMessage extends CivicChatTurn {
  id: string;
  timestamp: string;
  model?: CivicChatModelId;
  rolePreset?: CivicChatRoleId;
  tokensUsed?: number;
  latencyMs?: number;
}

export interface CivicChatContextSnapshot {
  activeView?: AppView;
  totalIssues?: number;
  openUrgentCount?: number;
  activeInProgressCount?: number;
  resolutionRatePercent?: number;
  selectedIssueSummary?: {
    trackingCode: string;
    title: string;
    category: IssueCategory;
    priority: IssuePriority;
    status: IssueStatus;
    ward: string;
    assignedDepartment: MunicipalDepartment;
    slaTarget?: string;
    aiSummary?: string;
  };
}

export interface CivicChatRequestPayload {
  message: string;
  history: CivicChatTurn[];
  rolePreset: CivicChatRoleId;
  fastMode?: boolean;
  context?: CivicChatContextSnapshot;
}

export interface CivicChatResponsePayload {
  reply: string;
  model: CivicChatModelId;
  rolePreset: CivicChatRoleId;
  tokensUsed?: number;
  latencyMs: number;
}

