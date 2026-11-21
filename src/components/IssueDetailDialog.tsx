import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, MapPin, Sparkles, X } from 'lucide-react';
import {
  CivicIssue,
  IssuePriority,
  IssueStatus,
  MunicipalDepartment,
} from '../shared/types.ts';
import { useDialogFocusTrap } from '../a11y/useFocusManagement.ts';
import { useAdminActions } from '../hooks/useAdminActions.ts';
import {
  IssueCategoryThumbnail,
  PriorityBadge,
  StatusBadge,
} from './CivicGraphics.tsx';

interface IssueDetailDialogProps {
  issue: CivicIssue | null;
  onClose: () => void;
}

export function IssueDetailDialog({ issue, onClose }: IssueDetailDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const { updateIssue, reanalyzeIssue, busyIssueIds } = useAdminActions();

  const [status, setStatus] = useState<IssueStatus>(IssueStatus.REPORTED);
  const [priority, setPriority] = useState<IssuePriority>(IssuePriority.MEDIUM);
  const [department, setDepartment] = useState<MunicipalDepartment>(
    MunicipalDepartment.GENERAL_SERVICES,
  );
  const [crew, setCrew] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (issue) {
      setStatus(issue.status);
      setPriority(issue.priority);
      setDepartment(issue.assignedDepartment);
      setCrew(issue.assignedCrew ?? '');
      setAdminNotes(issue.adminNotes ?? '');
      setSaveMessage(null);
    }
  }, [issue]);

  useDialogFocusTrap(Boolean(issue), dialogRef, onClose);

  if (!issue) return null;
  const isBusy = Boolean(busyIssueIds[issue.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = await updateIssue(issue.id, {
      status,
      priority,
      assignedDepartment: department,
      assignedCrew: crew.trim() || undefined,
      adminNotes,
      statusNote: `Updated from dossier modal (${status}, ${priority}).`,
    });
    if (updated) {
      setSaveMessage('Saved municipal updates to ticket record.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary/45 backdrop-blur-xs p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="issue-dossier-heading"
        tabIndex={-1}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-surface-container-lowest shadow-2xl border border-outline-variant/60 p-6 space-y-5 focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-surface-container">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded bg-primary-container text-white font-mono text-xs font-bold">
                #{issue.trackingCode}
              </span>
              <PriorityBadge priority={issue.priority} />
              <StatusBadge status={issue.status} />
            </div>
            <h2 id="issue-dossier-heading" className="font-display text-xl font-bold text-on-surface">
              {issue.title}
            </h2>
            <p className="text-xs text-on-surface-variant flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
              <span>
                {issue.ward} • {issue.location}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dossier modal"
            className="p-2 rounded-lg hover:bg-surface-container text-on-surface-variant"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-5">
            <IssueCategoryThumbnail issue={issue} className="w-full h-44" />
          </div>
          <div className="md:col-span-7 space-y-3">
            <p className="text-sm text-on-surface leading-relaxed bg-surface-container-low p-3.5 rounded-xl">
              {issue.description}
            </p>
            {issue.aiAnalysis && (
              <div className="rounded-xl bg-secondary-fixed/40 border border-secondary/30 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-secondary">
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Gemini Triage Analysis</span>
                  </span>
                  <span className="font-mono">
                    {Math.round(issue.aiAnalysis.confidence * 100)}% conf • Urgency {issue.aiAnalysis.urgencyScore}/100
                  </span>
                </div>
                <p className="text-xs text-on-surface">{issue.aiAnalysis.publicImpactSummary}</p>
              </div>
            )}
          </div>
        </div>

        {/* Admin Update Form */}
        <form onSubmit={handleSave} className="bg-surface-container-low rounded-xl p-4 space-y-3 border border-outline-variant/40">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-on-surface">
              Dispatch &amp; Resolution Controls
            </h3>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void reanalyzeIssue(issue.id, true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-secondary hover:underline"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Re-run Gemini Triage</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="dossier-status" className="text-xs font-semibold text-on-surface block mb-1">
                Status
              </label>
              <select
                id="dossier-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as IssueStatus)}
                className="w-full bg-surface-container-lowest text-xs font-semibold rounded-lg px-2.5 py-2 border border-outline-variant/60"
              >
                {Object.values(IssueStatus).map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dossier-priority" className="text-xs font-semibold text-on-surface block mb-1">
                Priority
              </label>
              <select
                id="dossier-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as IssuePriority)}
                className="w-full bg-surface-container-lowest text-xs font-semibold rounded-lg px-2.5 py-2 border border-outline-variant/60"
              >
                {Object.values(IssuePriority).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dossier-crew" className="text-xs font-semibold text-on-surface block mb-1">
                Assigned Crew
              </label>
              <input
                id="dossier-crew"
                type="text"
                value={crew}
                onChange={(e) => setCrew(e.target.value)}
                placeholder="e.g., Water Ops Unit B"
                className="w-full bg-surface-container-lowest text-xs rounded-lg px-2.5 py-2 border border-outline-variant/60"
              />
            </div>
          </div>

          <div>
            <label htmlFor="dossier-dept" className="text-xs font-semibold text-on-surface block mb-1">
              Responsible Department
            </label>
            <select
              id="dossier-dept"
              value={department}
              onChange={(e) => setDepartment(e.target.value as MunicipalDepartment)}
              className="w-full bg-surface-container-lowest text-xs font-semibold rounded-lg px-2.5 py-2 border border-outline-variant/60"
            >
              {Object.values(MunicipalDepartment).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="dossier-notes" className="text-xs font-semibold text-on-surface block mb-1">
              Municipal Field Notes
            </label>
            <textarea
              id="dossier-notes"
              rows={2}
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              className="w-full bg-surface-container-lowest text-xs rounded-lg p-2.5 border border-outline-variant/60"
            />
          </div>

          {saveMessage && (
            <p role="status" className="text-xs font-semibold text-on-tertiary-container flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{saveMessage}</span>
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-surface-container text-xs font-semibold text-on-surface"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={isBusy}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-on-primary-fixed-variant text-on-primary text-xs font-semibold disabled:opacity-60"
            >
              {isBusy ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
