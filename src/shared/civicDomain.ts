import {
  AdminUpdateIssuePayload,
  CivicIssue,
  CreateIssuePayload,
  IssueCategory,
  IssueCoordinates,
  IssueDashboardStats,
  IssueFilterState,
  IssuePriority,
  IssueSortOption,
  IssueStatus,
  MunicipalDepartment,
  ValidationResult,
} from './types.ts';

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const MAX_IMAGE_DATA_URL_BYTES = 4 * 1024 * 1024; // 4 MB encoded limit
export const MAX_FIRESTORE_IMAGE_BYTES = 600 * 1024; // Keeps total Firestore doc well below 1MB

export const DEFAULT_FILTER_STATE: IssueFilterState = {
  search: '',
  status: 'ALL',
  priority: 'ALL',
  category: 'ALL',
  department: 'ALL',
  sort: 'newest',
};

export const PRIORITY_WEIGHT: Record<IssuePriority, number> = {
  [IssuePriority.LOW]: 1,
  [IssuePriority.MEDIUM]: 2,
  [IssuePriority.HIGH]: 3,
  [IssuePriority.CRITICAL]: 4,
};

export const ALLOWED_STATUS_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  [IssueStatus.REPORTED]: [
    IssueStatus.REPORTED,
    IssueStatus.TRIAGED,
    IssueStatus.DISPATCHED,
    IssueStatus.IN_PROGRESS,
    IssueStatus.RESOLVED,
  ],
  [IssueStatus.TRIAGED]: [
    IssueStatus.REPORTED,
    IssueStatus.TRIAGED,
    IssueStatus.DISPATCHED,
    IssueStatus.IN_PROGRESS,
    IssueStatus.RESOLVED,
  ],
  [IssueStatus.DISPATCHED]: [
    IssueStatus.TRIAGED,
    IssueStatus.DISPATCHED,
    IssueStatus.IN_PROGRESS,
    IssueStatus.RESOLVED,
  ],
  [IssueStatus.IN_PROGRESS]: [
    IssueStatus.REPORTED,
    IssueStatus.TRIAGED,
    IssueStatus.DISPATCHED,
    IssueStatus.IN_PROGRESS,
    IssueStatus.RESOLVED,
  ],
  [IssueStatus.RESOLVED]: [
    IssueStatus.IN_PROGRESS,
    IssueStatus.RESOLVED,
  ],
};

export const CATEGORY_TO_DEFAULT_DEPARTMENT: Record<IssueCategory, MunicipalDepartment> = {
  [IssueCategory.ROAD_INFRASTRUCTURE]: MunicipalDepartment.TRANSPORTATION,
  [IssueCategory.SANITATION_WASTE]: MunicipalDepartment.SANITATION,
  [IssueCategory.STREETLIGHTING]: MunicipalDepartment.POWER_LIGHTING,
  [IssueCategory.WATER_DRAINAGE]: MunicipalDepartment.WATER_SEWER,
  [IssueCategory.PARKS_RECREATION]: MunicipalDepartment.PARKS,
  [IssueCategory.TRAFFIC_SIGNAGE]: MunicipalDepartment.TRAFFIC,
  [IssueCategory.PUBLIC_SAFETY]: MunicipalDepartment.EMERGENCY,
  [IssueCategory.OTHER]: MunicipalDepartment.GENERAL_SERVICES,
};

export const WARDS = [
  'Ward 1',
  'Ward 2',
  'Ward 3',
  'Ward 4',
  'Ward 5',
  'Ward 6',
  'Ward 7',
] as const;

export function inferWardFromLocation(location: string): string {
  const match = location.match(/\bward\s*(\d{1,2})\b/i);
  if (match) {
    return `Ward ${match[1]}`;
  }
  const lower = location.toLowerCase();
  if (lower.includes('elm') || lower.includes('lincoln')) return 'Ward 4';
  if (lower.includes('pine') || lower.includes('oakway')) return 'Ward 2';
  if (lower.includes('market') || lower.includes('broadway')) return 'Ward 1';
  if (lower.includes('harbor') || lower.includes('bayfront')) return 'Ward 3';
  if (lower.includes('industrial') || lower.includes('cedar')) return 'Ward 5';
  return 'Ward 2';
}

export function deriveCoordinatesForLocation(
  location: string,
  ward: string,
): IssueCoordinates {
  // Deterministic city grid coordinates around Metro Central District
  let hash = 0;
  const seed = `${ward}:${location}`;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const latOffset = ((Math.abs(hash) % 420) - 210) / 10000;
  const lngOffset = ((Math.abs(hash >> 4) % 520) - 260) / 10000;
  return {
    lat: Math.round((41.8781 + latOffset) * 10000) / 10000,
    lng: Math.round((-87.6298 + lngOffset) * 10000) / 10000,
  };
}

export function getLifecycleStepIndex(status: IssueStatus): number {
  switch (status) {
    case IssueStatus.REPORTED:
      return 1;
    case IssueStatus.TRIAGED:
      return 2;
    case IssueStatus.DISPATCHED:
      return 3;
    case IssueStatus.IN_PROGRESS:
      return 4;
    case IssueStatus.RESOLVED:
      return 5;
    default:
      return 1;
  }
}

export function isValidEnumValue<T extends Record<string, string>>(
  enumObj: T,
  value: unknown,
): value is T[keyof T] {
  return typeof value === 'string' && Object.values(enumObj).includes(value);
}

export function canTransitionStatus(from: IssueStatus, to: IssueStatus): boolean {
  return ALLOWED_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getDefaultDepartmentForCategory(category: IssueCategory): MunicipalDepartment {
  return CATEGORY_TO_DEFAULT_DEPARTMENT[category] ?? MunicipalDepartment.GENERAL_SERVICES;
}

export function validateCreateIssueInput(input: Partial<CreateIssuePayload>): ValidationResult {
  const errors: Record<string, string> = {};
  const fieldOrder = [
    'title',
    'description',
    'location',
    'category',
    'priority',
    'reporterName',
    'reporterContact',
    'image',
  ];

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const location = typeof input.location === 'string' ? input.location.trim() : '';

  if (!title) {
    errors.title = 'Enter a short issue title summarizing the problem.';
  } else if (title.length < 5) {
    errors.title = 'Issue title must be at least 5 characters.';
  } else if (title.length > 140) {
    errors.title = 'Issue title must be 140 characters or fewer.';
  }

  if (!description) {
    errors.description = 'Describe the civic issue, its condition, and any safety concerns.';
  } else if (description.length < 15) {
    errors.description = 'Description must be at least 15 characters so teams can triage it.';
  } else if (description.length > 3000) {
    errors.description = 'Description must be 3,000 characters or fewer.';
  }

  if (!location) {
    errors.location = 'Provide a street address, intersection, or landmark location.';
  } else if (location.length < 3) {
    errors.location = 'Location must be at least 3 characters.';
  } else if (location.length > 240) {
    errors.location = 'Location must be 240 characters or fewer.';
  }

  if (input.category !== undefined && !isValidEnumValue(IssueCategory, input.category)) {
    errors.category = 'Select a valid civic issue category.';
  }

  if (input.priority !== undefined && !isValidEnumValue(IssuePriority, input.priority)) {
    errors.priority = 'Select a valid issue priority.';
  }

  if (
    input.reporterName !== undefined &&
    (typeof input.reporterName !== 'string' || input.reporterName.trim().length > 100)
  ) {
    errors.reporterName = 'Reporter name must be 100 characters or fewer.';
  }

  if (
    input.reporterContact !== undefined &&
    (typeof input.reporterContact !== 'string' || input.reporterContact.trim().length > 160)
  ) {
    errors.reporterContact = 'Contact details must be 160 characters or fewer.';
  }

  if (input.image !== undefined) {
    const image = input.image as unknown;
    if (!image || typeof image !== 'object') {
      errors.image = 'Uploaded image data is invalid or corrupted.';
    } else {
      const { dataUrl, mimeType } = image as Record<string, unknown>;
      if (
        typeof mimeType !== 'string' ||
        !ALLOWED_IMAGE_MIME_TYPES.includes(
          mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
        )
      ) {
        errors.image = 'Uploaded image must be JPEG, PNG, WebP, or GIF.';
      } else if (typeof dataUrl !== 'string' || !dataUrl.startsWith(`data:${mimeType};base64,`)) {
        errors.image = 'Uploaded image data is invalid or corrupted.';
      } else if (dataUrl.length > MAX_IMAGE_DATA_URL_BYTES) {
        errors.image = 'Uploaded image exceeds the maximum supported size (4 MB).';
      } else {
        const imageRecord = image as Record<string, unknown>;
        if (
          typeof imageRecord.fileName !== 'string' ||
          imageRecord.fileName.length > 120 ||
          typeof imageRecord.altText !== 'string' ||
          imageRecord.altText.length > 240
        ) {
          errors.image = 'Uploaded image metadata is invalid.';
        }
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    fieldOrder: fieldOrder.filter((f) => f in errors),
  };
}

export function validateAnalyzeIssueInput(input: {
  title?: string;
  description?: string;
  location?: string;
}): ValidationResult {
  const errors: Record<string, string> = {};
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const location = typeof input.location === 'string' ? input.location.trim() : '';

  if (title.length < 5) {
    errors.title = 'Enter an issue title (at least 5 characters) before running AI analysis.';
  }
  if (description.length < 15) {
    errors.description = 'Enter a description (at least 15 characters) before running AI analysis.';
  }
  if (location.length > 240) {
    errors.location = 'Location must be 240 characters or fewer.';
  }

  const fieldOrder = ['title', 'description', 'location'].filter((f) => f in errors);
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    fieldOrder,
  };
}

export function validateAdminUpdateInput(
  currentStatus: IssueStatus,
  patch: AdminUpdateIssuePayload,
): ValidationResult {
  const errors: Record<string, string> = {};

  if (patch.status !== undefined) {
    if (!isValidEnumValue(IssueStatus, patch.status)) {
      errors.status = 'Invalid issue status value.';
    } else if (!canTransitionStatus(currentStatus, patch.status)) {
      errors.status = `Cannot transition issue directly from ${currentStatus} to ${patch.status}.`;
    }
  }

  if (patch.priority !== undefined && !isValidEnumValue(IssuePriority, patch.priority)) {
    errors.priority = 'Invalid priority value.';
  }

  if (patch.category !== undefined && !isValidEnumValue(IssueCategory, patch.category)) {
    errors.category = 'Invalid category value.';
  }

  if (
    patch.assignedDepartment !== undefined &&
    !isValidEnumValue(MunicipalDepartment, patch.assignedDepartment)
  ) {
    errors.assignedDepartment = 'Invalid municipal department.';
  }

  if (
    patch.assignedCrew !== undefined &&
    (typeof patch.assignedCrew !== 'string' || patch.assignedCrew.trim().length > 100)
  ) {
    errors.assignedCrew = 'Assigned crew name must be 100 characters or fewer.';
  }

  if (
    patch.adminNotes !== undefined &&
    (typeof patch.adminNotes !== 'string' || patch.adminNotes.trim().length > 2000)
  ) {
    errors.adminNotes = 'Administrator notes must be 2,000 characters or fewer.';
  }

  if (
    patch.statusNote !== undefined &&
    (typeof patch.statusNote !== 'string' || patch.statusNote.trim().length > 500)
  ) {
    errors.statusNote = 'Status update note must be 500 characters or fewer.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    fieldOrder: Object.keys(errors),
  };
}

export function validateCommentInput(body: unknown): string | null {
  if (typeof body !== 'string') return 'Enter a valid observation or status update.';
  const trimmed = body.trim();
  if (!trimmed) return 'Enter an observation or status update before posting.';
  if (trimmed.length < 2) return 'Observation must be at least 2 characters.';
  if (trimmed.length > 1000) return 'Observation must be 1,000 characters or fewer.';
  return null;
}

export function validateSmsPhoneInput(phone: unknown): string | null {
  if (typeof phone !== 'string') return 'Enter a valid phone number.';
  const trimmed = phone.trim();
  if (!trimmed) return 'Enter a phone number to subscribe to SMS dispatch alerts.';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || trimmed.length > 32) {
    return 'Enter a valid mobile number (at least 7 digits).';
  }
  return null;
}

export function filterIssues(issues: CivicIssue[], filters: IssueFilterState): CivicIssue[] {
  const query = filters.search.trim().toLowerCase();

  return issues.filter((issue) => {
    if (filters.status !== 'ALL' && issue.status !== filters.status) {
      return false;
    }
    if (filters.priority !== 'ALL' && issue.priority !== filters.priority) {
      return false;
    }
    if (filters.category !== 'ALL' && issue.category !== filters.category) {
      return false;
    }
    if (filters.department !== 'ALL' && issue.assignedDepartment !== filters.department) {
      return false;
    }
    if (query) {
      const searchable = [
        issue.trackingCode,
        issue.title,
        issue.description,
        issue.location,
        issue.ward,
        issue.category,
        issue.assignedDepartment,
        issue.assignedCrew ?? '',
        issue.priority,
        issue.status,
      ]
        .join(' ')
        .toLowerCase();
      if (!searchable.includes(query)) {
        return false;
      }
    }
    return true;
  });
}

export function sortIssues(issues: CivicIssue[], sortBy: IssueSortOption): CivicIssue[] {
  const copy = [...issues];
  copy.sort((a, b) => {
    switch (sortBy) {
      case 'oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'priority-desc': {
        const diff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
        return diff !== 0
          ? diff
          : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      case 'priority-asc': {
        const diff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
        return diff !== 0
          ? diff
          : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      case 'updated':
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      case 'newest':
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });
  return copy;
}

export function computeIssueStats(issues: CivicIssue[]): IssueDashboardStats {
  const byStatus: Record<IssueStatus, number> = {
    [IssueStatus.REPORTED]: 0,
    [IssueStatus.TRIAGED]: 0,
    [IssueStatus.DISPATCHED]: 0,
    [IssueStatus.IN_PROGRESS]: 0,
    [IssueStatus.RESOLVED]: 0,
  };
  const byPriority: Record<IssuePriority, number> = {
    [IssuePriority.LOW]: 0,
    [IssuePriority.MEDIUM]: 0,
    [IssuePriority.HIGH]: 0,
    [IssuePriority.CRITICAL]: 0,
  };
  const byCategory: Record<string, number> = {};
  const byDepartment: Record<string, number> = {};

  let openUrgentCount = 0;
  let resolvedDurationHoursSum = 0;
  let resolvedDurationCount = 0;

  for (const issue of issues) {
    byStatus[issue.status] = (byStatus[issue.status] ?? 0) + 1;
    byPriority[issue.priority] = (byPriority[issue.priority] ?? 0) + 1;
    byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1;
    byDepartment[issue.assignedDepartment] = (byDepartment[issue.assignedDepartment] ?? 0) + 1;

    if (
      issue.status !== IssueStatus.RESOLVED &&
      (issue.priority === IssuePriority.HIGH || issue.priority === IssuePriority.CRITICAL)
    ) {
      openUrgentCount += 1;
    }

    if (issue.status === IssueStatus.RESOLVED && issue.resolvedAt) {
      const startMs = new Date(issue.createdAt).getTime();
      const endMs = new Date(issue.resolvedAt).getTime();
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
        resolvedDurationHoursSum += (endMs - startMs) / (1000 * 60 * 60);
        resolvedDurationCount += 1;
      }
    }
  }

  const total = issues.length;
  const resolvedCount = byStatus[IssueStatus.RESOLVED];
  const activeInProgressCount =
    byStatus[IssueStatus.TRIAGED] +
    byStatus[IssueStatus.DISPATCHED] +
    byStatus[IssueStatus.IN_PROGRESS];
  const resolutionRatePercent = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;
  const averageResolutionHours =
    resolvedDurationCount > 0
      ? Math.round((resolvedDurationHoursSum / resolvedDurationCount) * 10) / 10
      : null;

  return {
    total,
    byStatus,
    byPriority,
    byCategory,
    byDepartment,
    openUrgentCount,
    activeInProgressCount,
    resolutionRatePercent,
    averageResolutionHours,
  };
}

export interface WardHealthSummary {
  ward: string;
  activeCount: number;
  criticalCount: number;
  highCount: number;
  resolvedCount: number;
  healthScore: number;
  standing: 'Good Standing' | 'Stable State' | 'Attention Needed';
}

export function computeWardHealthStats(issues: CivicIssue[]): WardHealthSummary[] {
  const wardsToReport = ['Ward 1', 'Ward 2', 'Ward 3', 'Ward 4', 'Ward 5'];
  const grouped = new Map<string, CivicIssue[]>();
  for (const w of wardsToReport) grouped.set(w, []);
  for (const issue of issues) {
    const w = issue.ward || inferWardFromLocation(issue.location);
    if (!grouped.has(w)) grouped.set(w, []);
    grouped.get(w)!.push(issue);
  }

  return Array.from(grouped.entries()).map(([ward, list]) => {
    const active = list.filter((i) => i.status !== IssueStatus.RESOLVED);
    const criticalCount = active.filter((i) => i.priority === IssuePriority.CRITICAL).length;
    const highCount = active.filter((i) => i.priority === IssuePriority.HIGH).length;
    const resolvedCount = list.length - active.length;

    const penalty = criticalCount * 16 + highCount * 8 + active.length * 3;
    const healthScore = Math.max(45, Math.min(99, 98 - penalty));
    const standing =
      healthScore >= 85
        ? 'Good Standing'
        : healthScore >= 72
          ? 'Stable State'
          : 'Attention Needed';

    return {
      ward,
      activeCount: active.length,
      criticalCount,
      highCount,
      resolvedCount,
      healthScore,
      standing,
    };
  });
}

export interface DepartmentBreakdownItem {
  department: string;
  shortLabel: string;
  count: number;
  percentage: number;
  color: string;
}

const DEPT_COLORS = ['#006398', '#5bb8fe', '#131b2e', '#6bd8cb', '#bec6e0', '#0c9488'];

export function computeDepartmentDistribution(issues: CivicIssue[]): DepartmentBreakdownItem[] {
  const total = issues.length;
  if (total === 0) return [];
  const counts = new Map<string, number>();
  for (const issue of issues) {
    counts.set(issue.assignedDepartment, (counts.get(issue.assignedDepartment) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  return sorted.map(([department, count], idx) => ({
    department,
    shortLabel: department
      .replace('Department of ', '')
      .replace(' & Public Works', '')
      .replace(' & Solid Waste Management', '')
      .replace('Municipal ', ''),
    count,
    percentage: Math.round((count / total) * 100),
    color: DEPT_COLORS[idx % DEPT_COLORS.length],
  }));
}

export function generateTrackingCode(sequenceNumber: number, date = new Date()): string {
  const year = date.getUTCFullYear();
  const padded = String(Math.max(1, sequenceNumber)).padStart(4, '0');
  return `CR-${year}-${padded}`;
}

function escapeCsvCell(raw: string | number | boolean | undefined): string {
  const str = raw === undefined ? '' : String(raw);
  // Neutralize CSV formula injection (=, +, -, @, tab, CR)
  const neutralized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  const escaped = neutralized.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function serializeIssuesToCsv(
  issues: CivicIssue[],
  options: { includeBom?: boolean } = {},
): string {
  const headers = [
    'Tracking Code',
    'Title',
    'Description',
    'Status',
    'Priority',
    'Category',
    'Assigned Department',
    'Assigned Crew',
    'Ward',
    'Location',
    'Endorsements',
    'AI Approved',
    'Urgency Score',
    'Estimated SLA (Hours)',
    'AI Public Impact Summary',
    'Created At',
    'Updated At',
    'Resolved At',
  ];

  const rows = issues.map((issue) =>
    [
      issue.trackingCode,
      issue.title,
      issue.description,
      issue.status,
      issue.priority,
      issue.category,
      issue.assignedDepartment,
      issue.assignedCrew ?? '',
      issue.ward,
      issue.location,
      issue.endorsementCount,
      issue.aiApproved ? 'Yes' : 'No',
      issue.aiAnalysis?.urgencyScore ?? '',
      issue.aiAnalysis?.estimatedSlaHours ?? '',
      issue.aiAnalysis?.publicImpactSummary ?? '',
      issue.createdAt,
      issue.updatedAt,
      issue.resolvedAt ?? '',
    ]
      .map(escapeCsvCell)
      .join(','),
  );

  const csvBody = [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
  return options.includeBom ? `\uFEFF${csvBody}` : csvBody;
}

export function getCsvExportFilename(
  statusFilter: IssueStatus | 'ALL' = 'ALL',
  date = new Date(),
): string {
  const datePart = date.toISOString().slice(0, 10);
  const slug =
    statusFilter === 'ALL'
      ? 'all'
      : statusFilter.toLowerCase().replace(/\s+/g, '-');
  return `civicresolve-issues-${slug}-${datePart}.csv`;
}

export function formatFilterResultsAnnouncement(filteredCount: number, totalCount: number): string {
  if (totalCount === 0) {
    return 'No civic issues have been reported yet.';
  }
  if (filteredCount === 0) {
    return `0 matching issues found out of ${totalCount} total reports. Try clearing filters.`;
  }
  if (filteredCount === totalCount) {
    return `Showing all ${totalCount} civic ${totalCount === 1 ? 'issue' : 'issues'}.`;
  }
  return `Showing ${filteredCount} of ${totalCount} civic issues.`;
}

export function formatIssueStatusAnnouncement(issue: CivicIssue): string {
  return `Issue ${issue.trackingCode}, ${issue.title}, updated to status ${issue.status}, priority ${issue.priority}, assigned to ${issue.assignedDepartment}.`;
}
