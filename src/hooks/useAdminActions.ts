import { useCallback, useState } from 'react';
import {
  AdminUpdateIssuePayload,
  CivicIssue,
  IssueFilterState,
} from '../shared/types.ts';
import {
  filterIssues,
  getCsvExportFilename,
  serializeIssuesToCsv,
} from '../shared/civicDomain.ts';
import {
  CivicApiError,
  downloadIssuesCsvFromServer,
} from '../services/civicApi.ts';
import { useCivicIssues } from '../context/CivicContext.tsx';
import { useAnnouncer } from '../a11y/LiveAnnouncer.tsx';

export interface ExportCsvOptions {
  subset?: CivicIssue[];
  filters?: Partial<IssueFilterState>;
  useServerEndpoint?: boolean;
}

function triggerBrowserCsvDownload(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function useAdminActions() {
  const {
    issues,
    cloudSyncActive,
    adminUpdateIssue,
    adminReanalyzeIssue,
    adminDeleteIssue,
  } = useCivicIssues();
  const { announcePolite, announceAssertive } = useAnnouncer();

  const [busyIssueIds, setBusyIssueIds] = useState<Record<string, boolean>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);

  const setBusy = (id: string, busy: boolean) => {
    setBusyIssueIds((prev) => {
      if (!busy) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: true };
    });
  };

  const updateIssue = useCallback(
    async (id: string, patch: AdminUpdateIssuePayload): Promise<CivicIssue | null> => {
      setActionError(null);
      setBusy(id, true);
      try {
        const updated = await adminUpdateIssue(id, patch);
        const msg = `Updated ${updated.trackingCode} (${updated.status}, ${updated.priority}).`;
        setLastActionMessage(msg);
        return updated;
      } catch (err) {
        const msg =
          err instanceof CivicApiError || err instanceof Error
            ? err.message
            : 'Unable to update civic issue.';
        setActionError(msg);
        announceAssertive(msg);
        return null;
      } finally {
        setBusy(id, false);
      }
    },
    [adminUpdateIssue, announceAssertive],
  );

  const bulkUpdateIssues = useCallback(
    async (ids: string[], patch: AdminUpdateIssuePayload): Promise<number> => {
      setActionError(null);
      let updatedCount = 0;
      for (const id of ids) {
        setBusy(id, true);
        try {
          await adminUpdateIssue(id, patch);
          updatedCount += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Bulk update failed.';
          setActionError(msg);
        } finally {
          setBusy(id, false);
        }
      }
      if (updatedCount > 0) {
        const msg = `Bulk updated ${updatedCount} civic ${updatedCount === 1 ? 'ticket' : 'tickets'}.`;
        setLastActionMessage(msg);
        announcePolite(msg);
      }
      return updatedCount;
    },
    [adminUpdateIssue, announcePolite],
  );

  const reanalyzeIssue = useCallback(
    async (id: string, applyRecommendations = true): Promise<CivicIssue | null> => {
      setActionError(null);
      setBusy(id, true);
      try {
        const { issue } = await adminReanalyzeIssue(id, applyRecommendations);
        const msg = `AI re-analysis applied to ${issue.trackingCode}.`;
        setLastActionMessage(msg);
        return issue;
      } catch (err) {
        const msg =
          err instanceof CivicApiError || err instanceof Error
            ? err.message
            : 'Unable to re-run Gemini AI analysis.';
        setActionError(msg);
        announceAssertive(msg);
        return null;
      } finally {
        setBusy(id, false);
      }
    },
    [adminReanalyzeIssue, announceAssertive],
  );

  const deleteIssue = useCallback(
    async (id: string): Promise<boolean> => {
      setActionError(null);
      setBusy(id, true);
      try {
        await adminDeleteIssue(id);
        const msg = 'Issue deleted from municipal queue.';
        setLastActionMessage(msg);
        return true;
      } catch (err) {
        const msg =
          err instanceof CivicApiError || err instanceof Error
            ? err.message
            : 'Unable to delete civic issue.';
        setActionError(msg);
        announceAssertive(msg);
        return false;
      } finally {
        setBusy(id, false);
      }
    },
    [adminDeleteIssue, announceAssertive],
  );

  const exportCsv = useCallback(
    async (arg?: CivicIssue[] | ExportCsvOptions): Promise<boolean> => {
      setActionError(null);
      const opts: ExportCsvOptions = Array.isArray(arg)
        ? { subset: arg, useServerEndpoint: false }
        : arg ?? { useServerEndpoint: !cloudSyncActive };

      if (opts.subset) {
        const csv = serializeIssuesToCsv(opts.subset, { includeBom: true });
        const filename = getCsvExportFilename(opts.filters?.status ?? 'ALL');
        triggerBrowserCsvDownload(csv, filename);
        const msg = `Downloaded ${filename} (${opts.subset.length} civic ${
          opts.subset.length === 1 ? 'issue' : 'issues'
        }).`;
        setLastActionMessage(msg);
        announcePolite(msg);
        return true;
      }

      if (opts.useServerEndpoint && !cloudSyncActive) {
        setIsExporting(true);
        try {
          const { csv, filename, count } = await downloadIssuesCsvFromServer(opts.filters);
          triggerBrowserCsvDownload(csv, filename);
          const msg = `Downloaded ${filename} (${count} civic ${
            count === 1 ? 'issue' : 'issues'
          }) for municipal record-keeping.`;
          setLastActionMessage(msg);
          announcePolite(msg);
          return true;
        } catch (err) {
          const msg =
            err instanceof CivicApiError
              ? err.message
              : 'Unable to export civic issues CSV.';
          setActionError(msg);
          announceAssertive(msg);
          return false;
        } finally {
          setIsExporting(false);
        }
      }

      const filtered = opts.filters
        ? filterIssues(issues, {
            search: opts.filters.search ?? '',
            status: opts.filters.status ?? 'ALL',
            priority: opts.filters.priority ?? 'ALL',
            category: opts.filters.category ?? 'ALL',
            department: opts.filters.department ?? 'ALL',
            sort: opts.filters.sort ?? 'newest',
          })
        : issues;
      const csv = serializeIssuesToCsv(filtered, { includeBom: true });
      const filename = getCsvExportFilename(opts.filters?.status ?? 'ALL');
      triggerBrowserCsvDownload(csv, filename);
      const msg = `Downloaded ${filename} (${filtered.length} civic ${
        filtered.length === 1 ? 'issue' : 'issues'
      }).`;
      setLastActionMessage(msg);
      announcePolite(msg);
      return true;
    },
    [issues, cloudSyncActive, announcePolite, announceAssertive],
  );

  return {
    busyIssueIds,
    isExporting,
    actionError,
    lastActionMessage,
    clearMessages: () => {
      setActionError(null);
      setLastActionMessage(null);
    },
    updateIssue,
    bulkUpdateIssues,
    reanalyzeIssue,
    deleteIssue,
    exportCsv,
  };
}
