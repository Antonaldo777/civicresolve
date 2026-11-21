import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  Check,
  Clock,
  Download,
  MapPin,
  MessageSquare,
  Phone,
  Search,
  Send,
  Sparkles,
  ThumbsUp,
} from 'lucide-react';
import {
  CivicIssue,
  IssuePriority,
  IssueStatus,
  MunicipalDepartment,
} from '../shared/types.ts';
import {
  getLifecycleStepIndex,
  validateCommentInput,
  validateSmsPhoneInput,
} from '../shared/civicDomain.ts';
import { useCivicIssues } from '../context/CivicContext.tsx';
import { useAdminActions } from '../hooks/useAdminActions.ts';
import {
  IssueCategoryThumbnail,
  PriorityBadge,
  SpatialMapPreview,
  StatusBadge,
} from './CivicGraphics.tsx';

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diffMs / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const LIFECYCLE_STEPS = [
  { step: 1, title: '1. Citizen Logged', subtitle: 'CivicResolve Portal' },
  { step: 2, title: '2. AI Triaged', subtitle: 'Gemini Categorized' },
  { step: 3, title: '3. Work Order', subtitle: 'Crew Dispatched' },
  { step: 4, title: '4. Crew On Site', subtitle: 'Active Resolution' },
  { step: 5, title: '5. Verification', subtitle: 'Resolved & Audited' },
];

export function IssueTrackingDashboard({
  onReportNew,
}: {
  onReportNew?: () => void;
}) {
  const {
    issues,
    filteredIssues,
    stats,
    filters,
    updateFilter,
    resetFilters,
    selectedIssue,
    selectIssueById,
    isLoading,
    loadError,
    endorsedIssueIds,
    toggleEndorseIssue,
    addWorkLogComment,
    subscribeIssueSms,
  } = useCivicIssues();

  const { exportCsv, isExporting } = useAdminActions();

  const [commentBody, setCommentBody] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isPostingComment, setIsPostingComment] = useState(false);

  const [smsPhone, setSmsPhone] = useState('');
  const [smsFeedback, setSmsFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [isSubscribingSms, setIsSubscribingSms] = useState(false);

  const activeIssue: CivicIssue | null =
    selectedIssue && filteredIssues.some((i) => i.id === selectedIssue.id)
      ? selectedIssue
      : filteredIssues[0] ?? selectedIssue ?? null;

  const currentStep = activeIssue ? getLifecycleStepIndex(activeIssue.status) : 1;

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeIssue) return;
    const validationErr = validateCommentInput(commentBody);
    if (validationErr) {
      setCommentError(validationErr);
      return;
    }
    setCommentError(null);
    setIsPostingComment(true);
    try {
      await addWorkLogComment(activeIssue.id, commentBody.trim(), 'Citizen');
      setCommentBody('');
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Unable to post public note.');
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleSubscribeSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeIssue) return;
    const err = validateSmsPhoneInput(smsPhone);
    if (err) {
      setSmsFeedback({ type: 'err', text: err });
      return;
    }
    setIsSubscribingSms(true);
    try {
      await subscribeIssueSms(activeIssue.id, smsPhone.trim());
      setSmsPhone('');
      setSmsFeedback({
        type: 'ok',
        text: `Subscribed for SMS alerts on ${activeIssue.trackingCode}.`,
      });
    } catch (error) {
      setSmsFeedback({
        type: 'err',
        text: error instanceof Error ? error.message : 'Unable to subscribe right now.',
      });
    } finally {
      setIsSubscribingSms(false);
    }
  };

  const statusChips: Array<{ id: IssueStatus | 'ALL'; label: string; count: number }> = [
    { id: 'ALL', label: `All Issues (${stats.total})`, count: stats.total },
    { id: IssueStatus.REPORTED, label: `Reported (${stats.byStatus[IssueStatus.REPORTED] ?? 0})`, count: stats.byStatus[IssueStatus.REPORTED] ?? 0 },
    { id: IssueStatus.TRIAGED, label: `AI Triaged (${stats.byStatus[IssueStatus.TRIAGED] ?? 0})`, count: stats.byStatus[IssueStatus.TRIAGED] ?? 0 },
    { id: IssueStatus.DISPATCHED, label: `Dispatched (${stats.byStatus[IssueStatus.DISPATCHED] ?? 0})`, count: stats.byStatus[IssueStatus.DISPATCHED] ?? 0 },
    { id: IssueStatus.IN_PROGRESS, label: `In Progress (${stats.byStatus[IssueStatus.IN_PROGRESS] ?? 0})`, count: stats.byStatus[IssueStatus.IN_PROGRESS] ?? 0 },
    { id: IssueStatus.RESOLVED, label: `Resolved (${stats.byStatus[IssueStatus.RESOLVED] ?? 0})`, count: stats.byStatus[IssueStatus.RESOLVED] ?? 0 },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-6 space-y-5">
      {/* Live Metrics Strip */}
      <section
        aria-label="Live Municipal Metrics"
        className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/40 p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center"
      >
        <div className="lg:col-span-5 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-surface-container-low flex items-center justify-center text-secondary shrink-0">
            <Activity className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed font-mono text-[11px] font-semibold">
                LIVE METRICS
              </span>
              <span className="font-mono text-xs text-on-surface-variant">Synced Real-Time</span>
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-on-surface mt-0.5">
              Public Issue Tracker &amp; Resolution Hub
            </h1>
          </div>
        </div>

        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-surface-container-low p-3">
            <span className="font-mono text-[11px] uppercase text-on-surface-variant">Total Issues Logged</span>
            <div className="font-display text-2xl font-extrabold text-on-surface tabular-nums mt-0.5">
              {stats.total}
            </div>
          </div>
          <div className="rounded-xl bg-surface-container-low p-3">
            <span className="font-mono text-[11px] uppercase text-on-surface-variant">Active Pipeline</span>
            <div className="font-display text-2xl font-extrabold text-secondary tabular-nums mt-0.5">
              {stats.total - (stats.byStatus[IssueStatus.RESOLVED] ?? 0)}
            </div>
          </div>
          <div className="rounded-xl bg-surface-container-low p-3">
            <span className="font-mono text-[11px] uppercase text-on-surface-variant">Resolution Rate</span>
            <div className="font-display text-2xl font-extrabold text-on-tertiary-container tabular-nums mt-0.5">
              {stats.resolutionRatePercent}%
            </div>
          </div>
          <div className="rounded-xl bg-surface-container-low p-3">
            <span className="font-mono text-[11px] uppercase text-on-surface-variant">Urgent Open</span>
            <div className="font-display text-2xl font-extrabold text-error tabular-nums mt-0.5">
              {stats.openUrgentCount}
            </div>
          </div>
        </div>
      </section>

      {/* Search, Filters & Status Chips */}
      <section
        aria-label="Filter Civic Issues"
        className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/40 p-4 space-y-3"
      >
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-on-surface-variant" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search civic issues by tracking code, street, ward, or keyword"
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              placeholder="Search by Ticket ID (e.g. CR-2026-0001), street name, or keyword..."
              className="w-full bg-surface-container-low text-on-surface placeholder:text-outline rounded-lg pl-9 pr-3 py-2.5 text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-secondary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by urgency"
              value={filters.priority}
              onChange={(e) => updateFilter('priority', e.target.value as IssuePriority | 'ALL')}
              className="bg-surface-container-low text-on-surface text-xs font-semibold rounded-lg px-3 py-2.5 border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-secondary"
            >
              <option value="ALL">Urgency: All Priority</option>
              {Object.values(IssuePriority).map((p) => (
                <option key={p} value={p}>
                  Urgency: {p}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by municipal department"
              value={filters.department}
              onChange={(e) => updateFilter('department', e.target.value as MunicipalDepartment | 'ALL')}
              className="bg-surface-container-low text-on-surface text-xs font-semibold rounded-lg px-3 py-2.5 border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-secondary max-w-[230px]"
            >
              <option value="ALL">Department: All Units</option>
              {Object.values(MunicipalDepartment).map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={isExporting}
              onClick={() => void exportCsv({ filters })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-semibold transition-colors"
            >
              <Download className="w-4 h-4 text-secondary" aria-hidden="true" />
              <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
            </button>
          </div>
        </div>

        {/* Status Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {statusChips.map((chip) => {
            const active = filters.status === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={active}
                onClick={() => updateFilter('status', chip.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors tabular-nums ${
                  active
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
              >
                {chip.label}
              </button>
            );
          })}

          {(filters.search ||
            filters.status !== 'ALL' ||
            filters.priority !== 'ALL' ||
            filters.department !== 'ALL') && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-semibold text-secondary hover:underline ml-1"
            >
              Clear Filters
            </button>
          )}
        </div>
      </section>

      {loadError && (
        <div role="alert" className="rounded-xl bg-error-container text-on-error-container p-4 text-sm font-medium">
          {loadError}
        </div>
      )}

      {/* Split Master-Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Feed Column (5 Cols) */}
        <section aria-label="Submitted Civic Issues List" className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1 font-mono text-xs text-on-surface-variant">
            <span>
              SHOWING {filteredIssues.length} OF {issues.length} INCIDENTS
            </span>
            <span className="inline-flex items-center gap-1.5 text-on-tertiary-container font-semibold">
              <span className="h-2 w-2 rounded-full bg-on-tertiary-container" />
              <span>Real-time Dispatch Active</span>
            </span>
          </div>

          {isLoading && issues.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-surface-container-lowest border border-outline-variant/40 text-sm text-on-surface-variant">
              Loading civic reports...
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-surface-container-lowest border border-outline-variant/40 space-y-3">
              <p className="text-sm font-semibold text-on-surface">
                No civic issues match the active filters.
              </p>
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="px-3 py-1.5 rounded-lg bg-surface-container-high text-xs font-semibold text-on-surface"
                >
                  Reset Filters
                </button>
                {onReportNew && (
                  <button
                    type="button"
                    onClick={onReportNew}
                    className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold"
                  >
                    Report Issue
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredIssues.map((issue) => {
                const isSelected = activeIssue?.id === issue.id;
                return (
                  <button
                    key={issue.id}
                    type="button"
                    onClick={() => selectIssueById(issue.id)}
                    aria-current={isSelected ? 'true' : undefined}
                    className={`w-full text-left rounded-xl p-4 transition-all border ${
                      isSelected
                        ? 'bg-surface-container-lowest border-secondary shadow-md ring-2 ring-secondary/20'
                        : 'bg-surface-container-lowest border-outline-variant/40 hover:border-secondary/50 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-primary-container text-white font-mono text-[11px] font-bold">
                          #{issue.trackingCode}
                        </span>
                        <PriorityBadge priority={issue.priority} />
                      </div>
                      <span className="font-mono text-xs text-on-surface-variant">
                        {formatRelativeTime(issue.createdAt)}
                      </span>
                    </div>

                    <h2 className="font-display text-base font-bold text-on-surface leading-snug">
                      {issue.title}
                    </h2>

                    <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mt-1">
                      <MapPin className="w-3.5 h-3.5 text-secondary shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {issue.ward} • {issue.location}
                      </span>
                    </div>

                    <div className="mt-3 p-2 rounded-lg bg-surface-container-low flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-secondary truncate">
                        Dept: {issue.assignedDepartment.replace('Department of ', '')}
                      </span>
                      <StatusBadge status={issue.status} />
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-xs text-on-surface-variant">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <ThumbsUp className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
                        <span className="tabular-nums">{issue.endorsementCount} Endorsements</span>
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-secondary">
                        <span>{isSelected ? 'Inspector Active' : 'Inspect'}</span>
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Detailed Ticket Inspector (7 Cols) */}
        <section aria-label="Selected Ticket Inspector" className="lg:col-span-7">
          {!activeIssue ? (
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-10 text-center text-sm text-on-surface-variant">
              Select a civic ticket on the left to inspect AI triage rationale, spatial telemetry, and work logs.
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-xl shadow-md border border-outline-variant/40 p-5 sm:p-6 space-y-6">
              {/* Ticket Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded bg-primary-container text-white font-mono text-xs font-bold">
                      #{activeIssue.trackingCode}
                    </span>
                    <span className="text-xs font-medium text-on-surface-variant">
                      {activeIssue.ward} • {activeIssue.category}
                    </span>
                    <PriorityBadge priority={activeIssue.priority} />
                  </div>
                  <h2 className="font-display text-2xl font-bold text-on-surface leading-tight">
                    {activeIssue.title}
                  </h2>
                  <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                    <MapPin className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />
                    <span>{activeIssue.location}</span>
                  </div>
                </div>

                <div className="flex flex-col sm:items-end gap-1 shrink-0">
                  <StatusBadge status={activeIssue.status} />
                  <span className="font-mono text-[11px] text-on-surface-variant">
                    {activeIssue.slaTarget ? `SLA Target: ${activeIssue.slaTarget}` : 'Active Tracking'}
                  </span>
                </div>
              </div>

              <p className="text-sm text-on-surface-variant leading-relaxed bg-surface-container-low/60 p-3.5 rounded-lg">
                {activeIssue.description}
              </p>

              {/* 5-Step Public Lifecycle & Dispatch Stepper */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-on-surface">
                    Public Lifecycle &amp; Dispatch Stepper
                  </h3>
                  <span className="font-mono text-xs text-secondary font-semibold">
                    Step {currentStep} of 5 ({activeIssue.status})
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {LIFECYCLE_STEPS.map((st) => {
                    const completed = st.step < currentStep;
                    const current = st.step === currentStep;
                    return (
                      <div
                        key={st.step}
                        className={`rounded-xl p-2.5 border transition-colors ${
                          current
                            ? 'bg-secondary-fixed/60 border-secondary text-on-surface shadow-xs'
                            : completed
                              ? 'bg-surface-container-low border-on-tertiary-container/40 text-on-surface'
                              : 'bg-surface-container-low/50 border-outline-variant/30 text-on-surface-variant opacity-75'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          {completed ? (
                            <Check className="w-4 h-4 text-on-tertiary-container" aria-hidden="true" />
                          ) : current ? (
                            <Clock className="w-4 h-4 text-secondary" aria-hidden="true" />
                          ) : (
                            <span className="w-3 h-3 rounded-full border border-outline-variant inline-block" />
                          )}
                          <span className="font-mono text-[10px] text-on-surface-variant">
                            {completed ? 'Done' : current ? 'Active' : 'Next'}
                          </span>
                        </div>
                        <div className="text-xs font-bold leading-tight">{st.title}</div>
                        <div className="text-[11px] text-on-surface-variant mt-0.5 truncate">
                          {st.subtitle}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Spatial Telemetry Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-on-surface">
                    Spatial Telemetry &amp; Geo-Fence Coordinates
                  </h3>
                  <span className="font-mono text-xs text-on-surface-variant">
                    {activeIssue.assignedCrew ? `Crew: ${activeIssue.assignedCrew}` : 'Unit Staging'}
                  </span>
                </div>
                <SpatialMapPreview
                  issues={[activeIssue]}
                  selectedIssueId={activeIssue.id}
                  showSingleFocus
                  heightClass="h-44"
                />
              </div>

              {/* Gemini Intelligence Dossier */}
              <div className="rounded-xl bg-surface-container-low border border-secondary/30 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-secondary" aria-hidden="true" />
                    <h3 className="font-display text-base font-bold text-on-surface">
                      Gemini Intelligence Dossier
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="px-2 py-0.5 rounded bg-surface-container-lowest text-secondary font-semibold">
                      Confidence: {Math.round((activeIssue.aiAnalysis?.confidence ?? 0.92) * 100)}%
                    </span>
                    <span className="px-2 py-0.5 rounded bg-surface-container-lowest text-on-surface font-semibold">
                      Severity: {activeIssue.aiAnalysis?.urgencyScore ?? 75}/100
                    </span>
                  </div>
                </div>

                <div className="bg-surface-container-lowest rounded-lg p-3.5 border border-outline-variant/30 space-y-2">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-secondary">
                    Automated Classification Justification
                  </span>
                  <p className="text-sm text-on-surface leading-relaxed">
                    {activeIssue.aiAnalysis?.publicImpactSummary ??
                      `Routed to ${activeIssue.assignedDepartment} based on municipal triage classification.`}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="bg-surface-container-lowest p-2.5 rounded-lg">
                    <span className="text-on-surface-variant block">Assigned Department</span>
                    <strong className="text-on-surface">{activeIssue.assignedDepartment}</strong>
                  </div>
                  <div className="bg-surface-container-lowest p-2.5 rounded-lg">
                    <span className="text-on-surface-variant block">Field Crew</span>
                    <strong className="text-on-surface">
                      {activeIssue.assignedCrew ?? 'Pending Assignment'}
                    </strong>
                  </div>
                  <div className="bg-surface-container-lowest p-2.5 rounded-lg">
                    <span className="text-on-surface-variant block">Estimated SLA</span>
                    <strong className="text-on-surface">
                      {activeIssue.aiAnalysis?.estimatedSlaHours
                        ? `< ${activeIssue.aiAnalysis.estimatedSlaHours} Hours`
                        : activeIssue.slaTarget ?? '24 Hours'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Verification Visual & Telemetry */}
              <div className="space-y-2">
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  Verification Evidence &amp; Field Context
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <IssueCategoryThumbnail
                      issue={activeIssue}
                      className="w-full h-36"
                      caption={activeIssue.image ? 'Citizen Photo' : 'Telemetry Card'}
                    />
                    <span className="text-xs text-on-surface-variant block">
                      {activeIssue.image
                        ? `Uploaded: ${activeIssue.image.fileName}`
                        : `Categorized visual profile for ${activeIssue.category}`}
                    </span>
                  </div>
                  <div className="rounded-lg bg-surface-container-low p-3.5 flex flex-col justify-between space-y-2">
                    <div className="text-xs font-semibold text-on-surface">
                      Recent Audit Milestones
                    </div>
                    <ul className="space-y-1.5 text-xs text-on-surface-variant max-h-28 overflow-y-auto">
                      {activeIssue.statusHistory.slice(-3).map((entry) => (
                        <li key={entry.id} className="border-l-2 border-secondary pl-2">
                          <span className="font-semibold text-on-surface">{entry.status}:</span>{' '}
                          {entry.note}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Resident Endorsement + SMS Alert Subscription */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 pt-2 border-t border-surface-container">
                <button
                  type="button"
                  aria-pressed={Boolean(endorsedIssueIds[activeIssue.id])}
                  onClick={() => void toggleEndorseIssue(activeIssue.id)}
                  className={`inline-flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                    endorsedIssueIds[activeIssue.id]
                      ? 'bg-secondary text-on-secondary shadow-sm'
                      : 'bg-primary text-on-primary hover:bg-on-primary-fixed-variant'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <ThumbsUp className="w-4 h-4" aria-hidden="true" />
                    <span>
                      {endorsedIssueIds[activeIssue.id]
                        ? 'Endorsed (Affected)'
                        : 'I Am Affected By This Issue'}
                    </span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/20 font-mono text-xs tabular-nums">
                    {activeIssue.endorsementCount}
                  </span>
                </button>

                <form onSubmit={handleSubscribeSms} className="flex-1 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Phone className="w-4 h-4 absolute left-3 top-2.5 text-on-surface-variant" aria-hidden="true" />
                    <label htmlFor="sms-subscribe-input" className="sr-only">
                      Phone number for SMS dispatch alerts
                    </label>
                    <input
                      id="sms-subscribe-input"
                      type="tel"
                      value={smsPhone}
                      onChange={(e) => setSmsPhone(e.target.value)}
                      placeholder="Phone # for SMS alerts..."
                      className="w-full bg-surface-container-low text-on-surface text-sm rounded-lg pl-9 pr-3 py-2 border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-secondary"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubscribingSms}
                    className="px-4 py-2 rounded-lg bg-secondary hover:bg-on-secondary-container text-on-secondary text-sm font-semibold transition-colors disabled:opacity-60 shrink-0"
                  >
                    {isSubscribingSms ? 'Saving...' : 'Subscribe'}
                  </button>
                </form>
              </div>
              {smsFeedback && (
                <p
                  role={smsFeedback.type === 'err' ? 'alert' : 'status'}
                  className={`text-xs font-medium ${
                    smsFeedback.type === 'err' ? 'text-error' : 'text-on-tertiary-container'
                  }`}
                >
                  {smsFeedback.text}
                </p>
              )}

              {/* Community & Municipal Work Log */}
              <div className="pt-4 border-t border-surface-container space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-bold text-on-surface flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-secondary" aria-hidden="true" />
                    <span>Community &amp; Municipal Work Log</span>
                  </h3>
                  <span className="font-mono text-xs text-on-surface-variant">
                    Public Ledger • Immutable Timestamps
                  </span>
                </div>

                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {activeIssue.comments.length === 0 ? (
                    <p className="text-xs text-on-surface-variant bg-surface-container-low p-3 rounded-lg">
                      No public field updates posted yet. Add a resident observation below.
                    </p>
                  ) : (
                    activeIssue.comments.map((cmt) => (
                      <div
                        key={cmt.id}
                        className="rounded-xl bg-surface-container-low p-3.5 space-y-1 border border-outline-variant/30"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-on-surface">
                              {cmt.authorName}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-mono text-[10px] font-semibold">
                              {cmt.authorRole}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-on-surface-variant">
                            {formatRelativeTime(cmt.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-on-surface-variant">{cmt.body}</p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handlePostComment} className="space-y-1.5">
                  <label htmlFor="worklog-comment-input" className="text-xs font-semibold text-on-surface block">
                    Add Resident Observation or Status Update
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id="worklog-comment-input"
                      type="text"
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      placeholder="Share verified details or conditions on the ground..."
                      className="flex-1 bg-surface-container-low text-on-surface text-sm rounded-lg px-3.5 py-2.5 border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-secondary"
                    />
                    <button
                      type="submit"
                      disabled={isPostingComment}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary hover:bg-on-primary-fixed-variant text-on-primary text-sm font-semibold transition-colors disabled:opacity-60 shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{isPostingComment ? 'Posting...' : 'Post Public Note'}</span>
                    </button>
                  </div>
                  {commentError && (
                    <p role="alert" className="text-xs font-medium text-error">
                      {commentError}
                    </p>
                  )}
                </form>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
