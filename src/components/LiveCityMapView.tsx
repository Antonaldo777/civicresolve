import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Compass,
  Layers,
  MapPin,
  Send,
  Sparkles,
} from 'lucide-react';
import { CivicIssue, IssuePriority, IssueStatus } from '../shared/types.ts';
import { WARDS } from '../shared/civicDomain.ts';
import { useCivicIssues } from '../context/CivicContext.tsx';
import { useAdminActions } from '../hooks/useAdminActions.ts';
import {
  IssueCategoryThumbnail,
  PriorityBadge,
  SpatialMapPreview,
  StatusBadge,
} from './CivicGraphics.tsx';

export function LiveCityMapView({
  onInspectIssue,
  onOpenInTracker,
}: {
  onInspectIssue: (issue: CivicIssue) => void;
  onOpenInTracker: (issueId: string) => void;
}) {
  const { issues, selectedIssue, selectIssueById } = useCivicIssues();
  const { updateIssue, busyIssueIds } = useAdminActions();

  const [selectedWard, setSelectedWard] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | 'ALL'>('ALL');

  const mapIssues = useMemo(() => {
    return issues.filter((issue) => {
      if (selectedWard !== 'ALL' && issue.ward !== selectedWard) return false;
      if (priorityFilter !== 'ALL' && issue.priority !== priorityFilter) return false;
      return true;
    });
  }, [issues, selectedWard, priorityFilter]);

  const activeIssue =
    mapIssues.find((i) => i.id === selectedIssue?.id) ?? mapIssues[0] ?? null;

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-secondary font-semibold">
            <Compass className="w-4 h-4" aria-hidden="true" />
            <span>Municipal Spatial GIS Telemetry</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-on-surface mt-0.5">
            Live City Spatial Map
          </h1>
          <p className="text-sm text-on-surface-variant">
            Click any geospatial incident pin to inspect Gemini triage diagnostics, ward density, and crew dispatch readiness.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-surface-container-lowest px-3 py-2 rounded-lg border border-outline-variant/40 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-error" />
            <span className="font-mono font-semibold">
              {issues.filter((i) => i.priority === IssuePriority.CRITICAL && i.status !== IssueStatus.RESOLVED).length} Critical
            </span>
          </div>
          <div className="flex items-center gap-2 bg-surface-container-lowest px-3 py-2 rounded-lg border border-outline-variant/40 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
            <span className="font-mono font-semibold">
              {issues.filter((i) => i.priority === IssuePriority.HIGH && i.status !== IssueStatus.RESOLVED).length} High
            </span>
          </div>
          <div className="flex items-center gap-2 bg-surface-container-lowest px-3 py-2 rounded-lg border border-outline-variant/40 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-on-tertiary-container" />
            <span className="font-mono font-semibold">
              {issues.filter((i) => i.status === IssueStatus.RESOLVED).length} Resolved
            </span>
          </div>
        </div>
      </div>

      {/* Ward & Severity Filter Bar */}
      <div className="bg-surface-container-lowest rounded-xl p-3.5 border border-outline-variant/40 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-on-surface-variant mr-1">
            <Layers className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
            <span>Ward:</span>
          </span>
          <button
            type="button"
            onClick={() => setSelectedWard('ALL')}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              selectedWard === 'ALL'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            All Wards ({issues.length})
          </button>
          {WARDS.slice(0, 5).map((ward) => (
            <button
              key={ward}
              type="button"
              onClick={() => setSelectedWard(ward)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                selectedWard === ward
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {ward}
            </button>
          ))}
        </div>

        <select
          aria-label="Filter map pins by priority"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as IssuePriority | 'ALL')}
          className="bg-surface-container-low text-on-surface text-xs font-semibold rounded-lg px-3 py-2 border border-outline-variant/40"
        >
          <option value="ALL">All Severities</option>
          {Object.values(IssuePriority).map((p) => (
            <option key={p} value={p}>
              {p} Priority Only
            </option>
          ))}
        </select>
      </div>

      {/* Interactive Spatial Canvas + Selected Incident HUD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-3">
          <SpatialMapPreview
            issues={mapIssues}
            selectedIssueId={activeIssue?.id ?? null}
            onSelectIssue={(id) => selectIssueById(id)}
            heightClass="h-[420px] sm:h-[480px]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-on-surface-variant px-1">
            <span>Showing {mapIssues.length} active geospatial pins</span>
            <span>Projection: Metro Municipal Grid • WGS84</span>
          </div>
        </div>

        {/* Selected Incident Card */}
        <aside className="lg:col-span-4 space-y-4">
          {!activeIssue ? (
            <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/40 text-sm text-on-surface-variant text-center">
              No incidents match the selected ward or severity filter.
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-xl shadow-md border border-outline-variant/40 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="px-2 py-0.5 rounded bg-primary-container text-white font-mono text-xs font-bold">
                  #{activeIssue.trackingCode}
                </span>
                <StatusBadge status={activeIssue.status} />
              </div>

              <IssueCategoryThumbnail issue={activeIssue} className="w-full h-36" />

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <PriorityBadge priority={activeIssue.priority} />
                  <span className="font-mono text-xs text-on-surface-variant">
                    {activeIssue.ward}
                  </span>
                </div>
                <h2 className="font-display text-lg font-bold text-on-surface leading-snug">
                  {activeIssue.title}
                </h2>
                <p className="text-xs text-on-surface-variant flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-secondary shrink-0" aria-hidden="true" />
                  <span>{activeIssue.location}</span>
                </p>
              </div>

              <div className="p-3 rounded-lg bg-surface-container-low text-xs space-y-1">
                <div className="flex items-center gap-1 font-semibold text-secondary">
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>AI Recommended Route</span>
                </div>
                <div className="font-semibold text-on-surface">{activeIssue.assignedDepartment}</div>
                <div className="text-on-surface-variant">
                  Crew: {activeIssue.assignedCrew ?? 'Staging Unit Ready'}
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                {activeIssue.status !== IssueStatus.DISPATCHED &&
                  activeIssue.status !== IssueStatus.RESOLVED && (
                    <button
                      type="button"
                      disabled={Boolean(busyIssueIds[activeIssue.id])}
                      onClick={() =>
                        void updateIssue(activeIssue.id, {
                          status: IssueStatus.DISPATCHED,
                          assignedCrew: activeIssue.assignedCrew ?? 'Rapid Field Unit #04',
                          statusNote: 'Dispatched directly from Live City Map HUD.',
                        })
                      }
                      className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary hover:bg-on-primary-fixed-variant text-on-primary text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Dispatch Nearest Crew</span>
                    </button>
                  )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onInspectIssue(activeIssue)}
                    className="px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-semibold transition-colors"
                  >
                    Full Dossier
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenInTracker(activeIssue.id)}
                    className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-secondary hover:bg-on-secondary-container text-on-secondary text-xs font-semibold transition-colors"
                  >
                    <span>Open Tracker</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
