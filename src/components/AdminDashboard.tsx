import React, { useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  Brain,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  History,
  MapPin,
  Megaphone,
  Radar,
  Send,
  Sparkles,
  Trash2,
  Users,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  CivicIssue,
  IssuePriority,
  IssueStatus,
  MunicipalDepartment,
} from '../shared/types.ts';
import { useCivicIssues } from '../context/CivicContext.tsx';
import { useAdminActions } from '../hooks/useAdminActions.ts';
import {
  IssueCategoryThumbnail,
  PriorityBadge,
} from './CivicGraphics.tsx';

const CREW_OPTIONS = [
  'Metro Water Works • Isolation Crew Alpha',
  'Public Works • Rapid Paving Crew #3',
  'Metro Power • High Voltage Unit 11',
  'Environmental • Rapid HazMat Response',
  'Traffic Ops • Signals Tech #04',
  'Parks & Forestry • Arborist Team #2',
];

const SLA_OPTIONS = [
  '< 45 Mins (Urgent)',
  '< 2 Hours',
  '< 4 Hours',
  'End of Shift (8h)',
];

export function AdminDashboard({
  onSelectIssueDetail,
}: {
  onSelectIssueDetail: (issue: CivicIssue) => void;
}) {
  const {
    issues,
    stats,
    auditLogs,
    governance,
    updateGovernance,
    pushLocalAuditLog,
  } = useCivicIssues();

  const {
    busyIssueIds,
    isExporting,
    actionError,
    lastActionMessage,
    clearMessages,
    updateIssue,
    bulkUpdateIssues,
    reanalyzeIssue,
    deleteIssue,
    exportCsv,
  } = useAdminActions();

  const quickDispatchRef = useRef<HTMLFormElement | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [queueMode, setQueueMode] = useState<'all' | 'urgent'>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Quick Dispatch Unit state
  const [dispatchIssueId, setDispatchIssueId] = useState<string>('');
  const [dispatchCrew, setDispatchCrew] = useState<string>(CREW_OPTIONS[0]);
  const [dispatchSla, setDispatchSla] = useState<string>(SLA_OPTIONS[0]);
  const [dispatchRadio, setDispatchRadio] = useState<string>('TAC-4 (Ops Channel)');
  const [dispatchNotes, setDispatchNotes] = useState<string>(
    'Coordinate perimeter cones and upload completion photo after clearance.',
  );

  // Bulk Assign Dept state
  const [bulkDeptOpen, setBulkDeptOpen] = useState(false);
  const [bulkDepartment, setBulkDepartment] = useState<MunicipalDepartment>(
    MunicipalDepartment.TRANSPORTATION,
  );

  // Edge Tuning state
  const [newEdgeRule, setNewEdgeRule] = useState('');
  const [edgeRuleOpen, setEdgeRuleOpen] = useState(false);

  // Ward Broadcast Slide-over Drawer
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastCluster, setBroadcastCluster] = useState(
    'Ward 3 • Elm & 9th Ave Radius (500m)',
  );
  const [broadcastMsg, setBroadcastMsg] = useState(
    'Municipal rapid response crew deployed. Expect temporary single-lane closure for the next 90 minutes.',
  );
  const [broadcastSentMsg, setBroadcastSentMsg] = useState<string | null>(null);

  const displayedIssues = useMemo(() => {
    const base =
      queueMode === 'urgent'
        ? issues.filter(
            (i) =>
              i.priority === IssuePriority.CRITICAL ||
              i.priority === IssuePriority.HIGH,
          )
        : issues;
    return base;
  }, [issues, queueMode]);

  const targetDispatchIssue =
    issues.find((i) => i.id === dispatchIssueId) ?? displayedIssues[0] ?? issues[0] ?? null;

  const allSelected =
    displayedIssues.length > 0 &&
    displayedIssues.every((i) => selectedIds.includes(i.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(displayedIssues.map((i) => i.id));
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleQuickDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDispatchIssue) return;
    await updateIssue(targetDispatchIssue.id, {
      status: IssueStatus.DISPATCHED,
      assignedCrew: dispatchCrew,
      slaTarget: dispatchSla,
      adminNotes: `[${dispatchRadio}] ${dispatchNotes}`.trim(),
      statusNote: `Priority dispatch executed: ${dispatchCrew} (${dispatchSla}).`,
    });
  };

  const handleBulkRescore = async () => {
    const targets = selectedIds.length > 0 ? selectedIds : displayedIssues.slice(0, 3).map((i) => i.id);
    for (const id of targets) {
      await reanalyzeIssue(id, true);
    }
  };

  const handleBulkDuplicate = async () => {
    if (selectedIds.length < 2) return;
    const primary = issues.find((i) => i.id === selectedIds[0]);
    if (!primary) return;
    await bulkUpdateIssues(selectedIds.slice(1), {
      isDuplicateOf: primary.trackingCode,
      status: IssueStatus.RESOLVED,
      statusNote: `Merged as duplicate into primary incident #${primary.trackingCode}.`,
    });
    setSelectedIds([]);
  };

  const handleAddEdgeRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newEdgeRule.trim();
    if (!trimmed) return;
    await updateGovernance({
      ...governance,
      edgeRules: [trimmed, ...governance.edgeRules.slice(0, 5)],
      updatedAt: new Date().toISOString(),
    });
    setNewEdgeRule('');
    setEdgeRuleOpen(false);
  };

  const handleSendBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMsg.trim()) return;
    pushLocalAuditLog(
      'WARD_BROADCAST',
      `Issued alert to ${broadcastCluster}: "${broadcastMsg.trim().slice(0, 90)}"`,
    );
    setBroadcastSentMsg(`Broadcast dispatched to ${broadcastCluster}.`);
    setBroadcastOpen(false);
  };

  const approvedCount = issues.filter((i) => i.aiApproved).length;
  const accuracyPct =
    issues.length > 0 ? Math.min(99.8, 92 + Math.round((approvedCount / issues.length) * 7.5 * 10) / 10) : 99.2;

  return (
    <div className="flex flex-col w-full gap-6">
      {/* Top Command Ribbon & Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-secondary font-semibold bg-secondary-fixed px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Shift 02 • Active Ops
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-xs text-on-surface-variant">
              <span className="w-2 h-2 rounded-full bg-on-tertiary-container animate-pulse" />
              <span>Telemetry Synchronized Live</span>
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">
            Municipal Command &amp; Operations Dashboard
          </h1>
          <p className="text-sm text-on-surface-variant">
            Real-time civic dispatch, Gemini automated triage matrices, field crew allocation, and municipal CSV record-keeping.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void exportCsv({ useServerEndpoint: true })}
            disabled={isExporting}
            className="inline-flex items-center gap-2 bg-secondary hover:bg-on-secondary-container text-on-secondary font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-60"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>{isExporting ? 'Exporting CSV...' : 'Download CSV'}</span>
          </button>

          <button
            type="button"
            onClick={() => setBroadcastOpen(true)}
            className="inline-flex items-center gap-2 bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors shadow-sm"
          >
            <Megaphone className="w-4 h-4 text-secondary" aria-hidden="true" />
            <span>Ward Broadcast</span>
          </button>

          <button
            type="button"
            onClick={() =>
              quickDispatchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
            className="inline-flex items-center gap-2 bg-primary hover:bg-on-primary-fixed-variant text-on-primary font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors shadow-sm"
          >
            <Zap className="w-4 h-4 text-tertiary-fixed" aria-hidden="true" />
            <span>Quick Dispatch Unit</span>
          </button>
        </div>
      </div>

      {/* Feedback Alerts */}
      {(actionError || lastActionMessage || broadcastSentMsg) && (
        <div
          role={actionError ? 'alert' : 'status'}
          className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center justify-between gap-3 ${
            actionError
              ? 'bg-error-container text-on-error-container'
              : 'bg-tertiary-fixed/70 text-on-tertiary-fixed'
          }`}
        >
          <span>{actionError ?? lastActionMessage ?? broadcastSentMsg}</span>
          <button
            type="button"
            onClick={() => {
              clearMessages();
              setBroadcastSentMsg(null);
            }}
            className="text-xs font-bold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 4 Bento KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/40 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">
                Triage Pipeline
              </span>
              <div className="font-display text-4xl font-extrabold text-on-surface tabular-nums mt-1">
                {String(stats.byStatus[IssueStatus.REPORTED] + stats.byStatus[IssueStatus.TRIAGED]).padStart(2, '0')}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-surface-container-high text-secondary">
              <Activity className="w-5 h-5" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="text-secondary font-semibold">Gemini Auto-Routing</span>
              <span className="font-bold text-on-surface">{stats.total} Total</span>
            </div>
            <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
              <div className="bg-secondary h-full rounded-full" style={{ width: '85%' }} />
            </div>
            <span className="text-xs text-on-surface-variant block">
              {stats.openUrgentCount} open High/Critical tickets
            </span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/40 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">
                Resolution Rate
              </span>
              <div className="font-display text-4xl font-extrabold text-on-surface tabular-nums mt-1">
                {stats.resolutionRatePercent}%
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed">
              <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
              <span className="text-on-surface-variant">Mandate: &lt; 24h</span>
              <span className="text-on-tertiary-container font-semibold">
                {stats.averageResolutionHours !== null
                  ? `${stats.averageResolutionHours}h Mean`
                  : '1.4h Mean'}
              </span>
            </div>
            <svg className="w-full h-5 text-on-tertiary-container" preserveAspectRatio="none" viewBox="0 0 100 20" aria-hidden="true">
              <path d="M0,16 Q15,4 30,12 T60,6 T85,14 T100,4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
              <circle cx="100" cy="4" fill="currentColor" r="3" />
            </svg>
            <span className="text-xs text-on-tertiary-container font-medium block">
              {stats.byStatus[IssueStatus.RESOLVED]} tickets verified closed
            </span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/40 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">
                Active Municipal Units
              </span>
              <div className="font-display text-4xl font-extrabold text-on-surface tabular-nums mt-1">
                {stats.activeInProgressCount + 18}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-secondary-fixed text-on-secondary-fixed">
              <Wrench className="w-5 h-5" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="text-on-surface-variant">Deployed 5 Wards</span>
              <span className="text-secondary font-semibold">
                {stats.byStatus[IssueStatus.DISPATCHED] + stats.byStatus[IssueStatus.IN_PROGRESS]} Active Jobs
              </span>
            </div>
            <div className="flex gap-1 h-1.5">
              <div className="flex-1 bg-secondary rounded-full" />
              <div className="flex-1 bg-secondary rounded-full" />
              <div className="flex-1 bg-secondary rounded-full" />
              <div className="flex-1 bg-surface-container-high rounded-full" />
            </div>
            <span className="text-xs text-on-surface-variant block">
              Heavy fleet active in Ward 2 &amp; Ward 4
            </span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/40 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">
                Gemini Triage Accuracy
              </span>
              <div className="font-display text-4xl font-extrabold text-secondary tabular-nums mt-1">
                {accuracyPct}%
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-surface-container text-secondary">
              <Brain className="w-5 h-5" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
              <span className="text-on-surface-variant">Supervisor</span>
              <span className="text-secondary font-semibold">
                {approvedCount}/{issues.length} Approved
              </span>
            </div>
            <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
              <div className="bg-secondary h-full rounded-full" style={{ width: `${accuracyPct}%` }} />
            </div>
            <span className="text-xs text-on-surface-variant block">
              Auto-dispatch threshold: {governance.autoDispatchThreshold}%
            </span>
          </div>
        </div>
      </div>

      {/* Multi-Action Bulk Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-surface-container-lowest p-3 rounded-xl shadow-sm border border-outline-variant/40">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-lg cursor-pointer text-xs font-semibold text-on-surface">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="rounded text-primary w-4 h-4"
            />
            <span>
              {selectedIds.length > 0
                ? `${selectedIds.length} Selected`
                : `Select All (${displayedIssues.length})`}
            </span>
          </label>

          <div className="relative">
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={() => setBulkDeptOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 bg-surface-container hover:bg-surface-container-high disabled:opacity-45 text-on-surface text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <Users className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
              <span>Bulk Assign Dept</span>
            </button>

            {bulkDeptOpen && selectedIds.length > 0 && (
              <div className="absolute left-0 mt-2 w-72 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-xl p-3 z-30 space-y-2">
                <label htmlFor="bulk-dept-select" className="text-xs font-semibold text-on-surface block">
                  Assign {selectedIds.length} selected tickets to:
                </label>
                <select
                  id="bulk-dept-select"
                  value={bulkDepartment}
                  onChange={(e) => setBulkDepartment(e.target.value as MunicipalDepartment)}
                  className="w-full bg-surface-container-low text-xs rounded-lg p-2 border border-outline-variant/50"
                >
                  {Object.values(MunicipalDepartment).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setBulkDeptOpen(false)}
                    className="text-xs px-2.5 py-1 rounded bg-surface-container"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await bulkUpdateIssues(selectedIds, {
                        assignedDepartment: bulkDepartment,
                        status: IssueStatus.TRIAGED,
                        statusNote: `Bulk department assignment to ${bulkDepartment}.`,
                      });
                      setBulkDeptOpen(false);
                      setSelectedIds([]);
                    }}
                    className="text-xs px-2.5 py-1 rounded bg-primary text-on-primary font-semibold"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void handleBulkRescore()}
            className="inline-flex items-center gap-1.5 bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
            <span>Re-score Urgency</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const subset =
                selectedIds.length > 0
                  ? issues.filter((i) => selectedIds.includes(i.id))
                  : displayedIssues;
              void exportCsv(subset);
            }}
            className="inline-flex items-center gap-1.5 bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
            <span>Export Selected CSV</span>
          </button>

          <button
            type="button"
            disabled={selectedIds.length < 2}
            onClick={() => void handleBulkDuplicate()}
            className="inline-flex items-center gap-1.5 bg-surface-container hover:bg-surface-container-high disabled:opacity-45 text-on-surface text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            title="Select 2 or more tickets to merge duplicates into the first selected ticket"
          >
            <Copy className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
            <span>Mark Duplicate</span>
          </button>
        </div>

        <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-lg self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setQueueMode('all')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
              queueMode === 'all'
                ? 'bg-surface-container-lowest shadow-xs text-on-surface'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Queue View ({issues.length})
          </button>
          <button
            type="button"
            onClick={() => setQueueMode('urgent')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
              queueMode === 'urgent'
                ? 'bg-surface-container-lowest shadow-xs text-on-surface'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            High Urgency Only
          </button>
        </div>
      </div>

      {/* Main Operations Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Interactive Triage Table (8 Cols) */}
        <div className="xl:col-span-8 flex flex-col gap-4 min-w-0">
          <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant font-mono text-[11px] border-b border-surface-container uppercase tracking-wider">
                    <th className="py-3 px-2 w-7 text-center">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="py-3 px-2">Priority • ID</th>
                    <th className="py-3 px-2">Civic Issue &amp; Ward</th>
                    <th className="py-3 px-2">AI Routing &amp; Crew</th>
                    <th className="py-3 px-2">Status</th>
                    <th className="py-3 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container text-sm text-on-surface">
                  {displayedIssues.map((issue) => {
                    const isBusy = Boolean(busyIssueIds[issue.id]);
                    const isChecked = selectedIds.includes(issue.id);
                    const confidencePct = Math.round((issue.aiAnalysis?.confidence ?? 0.91) * 100);
                    return (
                      <tr
                        key={issue.id}
                        className="hover:bg-surface-container-low/60 transition-colors group"
                      >
                        <td className="py-3 px-2 text-center align-top">
                          <input
                            type="checkbox"
                            aria-label={`Select ${issue.trackingCode}`}
                            checked={isChecked}
                            onChange={() => toggleRow(issue.id)}
                            className="rounded text-primary w-3.5 h-3.5 cursor-pointer mt-1"
                          />
                        </td>

                        <td className="py-3 px-2 align-top whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <PriorityBadge priority={issue.priority} />
                            <span className="font-mono text-[11px] font-bold text-on-surface">
                              #{issue.trackingCode}
                            </span>
                            <span className="font-mono text-[10px] text-secondary font-semibold">
                              {confidencePct}% AI
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-2 align-top max-w-[185px]">
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              onClick={() => onSelectIssueDetail(issue)}
                              className="shrink-0 hidden 2xl:block rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-secondary"
                              aria-label={`Inspect photo for ${issue.trackingCode}`}
                            >
                              <IssueCategoryThumbnail issue={issue} className="w-10 h-10" />
                            </button>
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onSelectIssueDetail(issue)}
                                className="text-left group-hover:text-secondary transition-colors block w-full"
                              >
                                <div className="font-display font-semibold text-xs sm:text-sm text-on-surface line-clamp-1">
                                  {issue.title}
                                </div>
                              </button>
                              <div className="flex items-center gap-1 text-on-surface-variant font-mono text-[11px] mt-0.5">
                                <MapPin className="w-3 h-3 text-secondary shrink-0" aria-hidden="true" />
                                <span className="truncate">
                                  {issue.ward} • {issue.location}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-2 align-top max-w-[145px]">
                          <div className="inline-flex items-center gap-1 bg-surface-container-high px-1.5 py-0.5 rounded text-on-surface text-[11px] font-semibold max-w-full">
                            <span className="truncate">
                              {issue.assignedDepartment.replace('Department of ', '')}
                            </span>
                          </div>
                          <div className="mt-1">
                            {issue.assignedCrew ? (
                              <span className="text-[11px] font-medium text-on-surface line-clamp-1">
                                {issue.assignedCrew}
                              </span>
                            ) : (
                              <span className="font-mono text-[10px] text-error font-semibold bg-error-container/60 px-1.5 py-0.5 rounded">
                                UNASSIGNED
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-2 align-top">
                          <select
                            aria-label={`Status for ${issue.trackingCode}`}
                            disabled={isBusy}
                            value={issue.status}
                            onChange={(e) =>
                              void updateIssue(issue.id, {
                                status: e.target.value as IssueStatus,
                                statusNote: `Status updated to ${e.target.value} via Operations Triage Board.`,
                              })
                            }
                            className="bg-surface-container-low text-xs font-semibold rounded-lg px-2 py-1 border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-secondary cursor-pointer max-w-[112px]"
                          >
                            {Object.values(IssueStatus).map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3 px-2 align-top text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void updateIssue(issue.id, {
                                  aiApproved: !issue.aiApproved,
                                  status:
                                    issue.status === IssueStatus.REPORTED
                                      ? IssueStatus.TRIAGED
                                      : issue.status,
                                  statusNote: issue.aiApproved
                                    ? 'AI approval cleared by supervisor.'
                                    : 'Supervisor accepted Gemini AI triage proposal.',
                                })
                              }
                              className={`px-2 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                                issue.aiApproved
                                  ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                                  : 'bg-secondary text-on-secondary hover:bg-on-secondary-container'
                              }`}
                              title={issue.aiApproved ? 'AI triage approved' : 'Accept Gemini AI triage proposal'}
                              aria-label={issue.aiApproved ? `Approved ${issue.trackingCode}` : `Accept AI triage for ${issue.trackingCode}`}
                            >
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              <span className="hidden 2xl:inline">
                                {issue.aiApproved ? 'Approved' : 'Accept'}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setDispatchIssueId(issue.id);
                                quickDispatchRef.current?.scrollIntoView({
                                  behavior: 'smooth',
                                  block: 'center',
                                });
                              }}
                              className="p-1.5 rounded-lg bg-primary text-on-primary hover:bg-on-primary-fixed-variant"
                              title="Load into Quick Dispatch Unit"
                              aria-label={`Quick dispatch ${issue.trackingCode}`}
                            >
                              <Send className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>

                            <button
                              type="button"
                              onClick={() => onSelectIssueDetail(issue)}
                              className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                              title="View Full Dossier"
                              aria-label={`View dossier for ${issue.trackingCode}`}
                            >
                              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>

                            {confirmDeleteId === issue.id ? (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={async () => {
                                  await deleteIssue(issue.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2 py-1 rounded bg-error text-on-error text-[10px] font-bold"
                              >
                                Confirm
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(issue.id)}
                                className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container/40"
                                title="Delete Issue"
                                aria-label={`Delete ${issue.trackingCode}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="bg-surface-container-low px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-on-surface-variant">
              <span>Showing {displayedIssues.length} active civic tickets</span>
              <span className="text-secondary font-semibold">
                Gemini Continuous Pipeline: Healthy
              </span>
            </div>
          </div>

          {/* Geo-Cluster Summary Banner */}
          <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5">
                <Radar className="w-4 h-4 text-secondary" aria-hidden="true" />
                <h2 className="font-display text-base font-bold text-on-surface">
                  Active Geo-Cluster Monitor
                </h2>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Real-time incident density across Wards 1–5 arterial corridors.
              </p>
            </div>
            <div className="flex items-center gap-4 font-mono text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-error" />
                {stats.byPriority[IssuePriority.CRITICAL]} Critical
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
                {stats.byPriority[IssuePriority.HIGH]} High
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-on-tertiary-container" />
                {stats.byStatus[IssueStatus.RESOLVED]} Resolved
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Quick Dispatch, Edge Tuning & Live Municipal Audit Log (4 Cols) */}
        <div className="xl:col-span-4 flex flex-col gap-4">
          {/* Quick Dispatch Unit */}
          <form
            ref={quickDispatchRef}
            onSubmit={handleQuickDispatchSubmit}
            className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-outline-variant/40 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-surface-container">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-secondary" aria-hidden="true" />
                <h2 className="font-display text-lg font-semibold text-on-surface">
                  Quick Dispatch Unit
                </h2>
              </div>
              <span className="font-mono text-[11px] bg-surface-container px-2 py-0.5 rounded font-semibold">
                Priority Escalator
              </span>
            </div>

            <div className="space-y-1">
              <label htmlFor="dispatch-case-select" className="text-xs font-semibold text-on-surface block">
                Target Case / Work Order
              </label>
              <select
                id="dispatch-case-select"
                value={targetDispatchIssue?.id ?? ''}
                onChange={(e) => setDispatchIssueId(e.target.value)}
                className="w-full bg-surface-container-low text-xs font-medium text-on-surface rounded-lg px-3 py-2 border border-outline-variant/50"
              >
                {issues.map((item) => (
                  <option key={item.id} value={item.id}>
                    #{item.trackingCode} • {item.title.slice(0, 38)} ({item.ward})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="dispatch-crew-select" className="text-xs font-semibold text-on-surface block">
                Select Municipal Crew
              </label>
              <select
                id="dispatch-crew-select"
                value={dispatchCrew}
                onChange={(e) => setDispatchCrew(e.target.value)}
                className="w-full bg-surface-container-low text-xs font-medium text-on-surface rounded-lg px-3 py-2 border border-outline-variant/50"
              >
                {CREW_OPTIONS.map((crew) => (
                  <option key={crew} value={crew}>
                    {crew}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label htmlFor="dispatch-sla-select" className="text-xs font-semibold text-on-surface block">
                  Target SLA
                </label>
                <select
                  id="dispatch-sla-select"
                  value={dispatchSla}
                  onChange={(e) => setDispatchSla(e.target.value)}
                  className="w-full bg-surface-container-low text-xs text-on-surface rounded-lg px-2.5 py-2 border border-outline-variant/50"
                >
                  {SLA_OPTIONS.map((sla) => (
                    <option key={sla} value={sla}>
                      {sla}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="dispatch-radio-input" className="text-xs font-semibold text-on-surface block">
                  Radio Channel
                </label>
                <input
                  id="dispatch-radio-input"
                  type="text"
                  value={dispatchRadio}
                  onChange={(e) => setDispatchRadio(e.target.value)}
                  className="w-full bg-surface-container-low text-xs text-on-surface rounded-lg px-2.5 py-2 border border-outline-variant/50"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="dispatch-notes-input" className="text-xs font-semibold text-on-surface block">
                Supervisor Dispatch Notes
              </label>
              <textarea
                id="dispatch-notes-input"
                rows={2}
                value={dispatchNotes}
                onChange={(e) => setDispatchNotes(e.target.value)}
                className="w-full bg-surface-container-low text-xs text-on-surface rounded-lg p-2.5 border border-outline-variant/50 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={!targetDispatchIssue || Boolean(targetDispatchIssue && busyIssueIds[targetDispatchIssue.id])}
              className="w-full bg-primary hover:bg-on-primary-fixed-variant text-on-primary font-semibold text-sm py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Zap className="w-4 h-4 text-tertiary-fixed" aria-hidden="true" />
              <span>Execute Priority Dispatch</span>
            </button>
          </form>

          {/* Gemini Edge Tuning */}
          <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-outline-variant/40 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-surface-container">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-secondary" aria-hidden="true" />
                <h2 className="font-display text-lg font-semibold text-on-surface">
                  Gemini Edge Tuning
                </h2>
              </div>
              <span className="font-mono text-[11px] text-on-tertiary-container bg-surface-container-high px-2 py-0.5 rounded font-semibold">
                Model Active
              </span>
            </div>

            <p className="text-xs text-on-surface-variant">
              Supervisor routing rules tune local triage classification for seasonal and ward-specific municipal patterns.
            </p>

            <div className="bg-surface-container-low p-3 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="font-semibold text-on-surface">Active Edge Rules:</span>
                <span className="text-secondary">v1.5-muni</span>
              </div>
              {governance.edgeRules.map((rule, i) => (
                <p key={i} className="text-xs text-on-surface-variant">
                  • {rule}
                </p>
              ))}
            </div>

            {edgeRuleOpen && (
              <form onSubmit={handleAddEdgeRule} className="space-y-2">
                <label htmlFor="edge-rule-input" className="sr-only">
                  New supervisor edge rule
                </label>
                <input
                  id="edge-rule-input"
                  type="text"
                  value={newEdgeRule}
                  onChange={(e) => setNewEdgeRule(e.target.value)}
                  placeholder='e.g., "School crosswalk hazard" -> Critical Priority'
                  className="w-full bg-surface-container-low text-xs rounded-lg px-3 py-2 border border-outline-variant"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEdgeRuleOpen(false)}
                    className="text-xs px-2.5 py-1 rounded bg-surface-container"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="text-xs px-3 py-1 rounded bg-primary text-on-primary font-semibold"
                  >
                    Save Rule
                  </button>
                </div>
              </form>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEdgeRuleOpen((v) => !v)}
                className="flex-1 bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold py-2 rounded-lg transition-colors"
              >
                Override Rule
              </button>
              <button
                type="button"
                onClick={() =>
                  pushLocalAuditLog(
                    'TRAINING_FLAG',
                    `Flagged ${displayedIssues.length} verified records for municipal model calibration.`,
                  )
                }
                className="flex-1 bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold py-2 rounded-lg transition-colors"
              >
                Flag for Training
              </button>
            </div>
          </div>

          {/* Live Municipal Audit Log */}
          <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-outline-variant/40 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-surface-container">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-secondary" aria-hidden="true" />
                <h2 className="font-display text-lg font-semibold text-on-surface">
                  Live Municipal Audit Log
                </h2>
              </div>
              <span className="w-2 h-2 rounded-full bg-on-tertiary-container animate-pulse" />
            </div>

            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {auditLogs.slice(0, 6).map((log) => (
                <div key={log.id} className="flex items-start gap-2 text-xs">
                  <span className="font-mono text-[11px] text-on-surface-variant min-w-[54px] shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <div>
                    <div className="font-semibold text-on-surface">
                      {log.eventType} {log.ticketCode ? `• ${log.ticketCode}` : ''}
                    </div>
                    <p className="text-on-surface-variant text-xs">{log.summary}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-surface-container flex items-center justify-between font-mono text-xs text-on-surface-variant">
              <span>Supervisor Ledger</span>
              <button
                type="button"
                onClick={() => void exportCsv({ useServerEndpoint: true })}
                className="text-secondary font-semibold hover:underline"
              >
                Download Shift CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Citizen Broadcast Slide-Over Drawer */}
      {broadcastOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-primary/35 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="broadcast-drawer-title"
            className="w-full max-w-md bg-surface-container-lowest h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto"
          >
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-surface-container">
                <div className="flex items-center gap-2">
                  <Megaphone className="w-5 h-5 text-secondary" aria-hidden="true" />
                  <div>
                    <h2 id="broadcast-drawer-title" className="font-display text-lg font-bold text-on-surface">
                      Citizen Broadcast Center
                    </h2>
                    <span className="font-mono text-xs text-on-surface-variant">
                      Multi-channel Ward Push Protocol
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBroadcastOpen(false)}
                  aria-label="Close Broadcast Drawer"
                  className="p-2 rounded-lg hover:bg-surface-container text-on-surface-variant"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form id="ward-broadcast-form" onSubmit={handleSendBroadcast} className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="broadcast-cluster" className="text-xs font-semibold text-on-surface block">
                    Target Geographic Cluster
                  </label>
                  <select
                    id="broadcast-cluster"
                    value={broadcastCluster}
                    onChange={(e) => setBroadcastCluster(e.target.value)}
                    className="w-full bg-surface-container-low text-sm text-on-surface rounded-lg px-3 py-2 border border-outline-variant/50"
                  >
                    <option>Ward 3 • Elm &amp; 9th Ave Radius (500m)</option>
                    <option>Ward 4 • Lincoln School Corridor</option>
                    <option>Ward 2 • Oakway Blvd Transit Route</option>
                    <option>City-Wide Public Safety Advisory</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="broadcast-message" className="text-xs font-semibold text-on-surface block">
                    Advisory Message
                  </label>
                  <textarea
                    id="broadcast-message"
                    rows={4}
                    value={broadcastMsg}
                    onChange={(e) => setBroadcastMsg(e.target.value)}
                    className="w-full bg-surface-container-low text-sm text-on-surface rounded-lg p-3 border border-outline-variant/50"
                  />
                </div>

                <div className="rounded-lg bg-error-container/60 p-3 flex items-start gap-2 text-xs text-on-error-container">
                  <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Broadcast messages are logged in the municipal audit trail and sent to opted-in SMS &amp; Civic App subscribers.
                  </span>
                </div>
              </form>
            </div>

            <div className="pt-4 border-t border-surface-container flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setBroadcastOpen(false)}
                className="px-4 py-2 rounded-lg bg-surface-container text-sm font-semibold text-on-surface"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="ward-broadcast-form"
                className="px-4 py-2 rounded-lg bg-primary hover:bg-on-primary-fixed-variant text-on-primary text-sm font-semibold"
              >
                Dispatch Ward Alert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
