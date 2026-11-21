/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppView, CivicIssue } from './shared/types.ts';
import { LiveAnnouncerProvider } from './a11y/LiveAnnouncer.tsx';
import { SkipLink } from './a11y/primitives.tsx';
import { CivicProvider, useCivicIssues } from './context/CivicContext.tsx';
import { PortalShell } from './components/PortalShell.tsx';
import { CitizenReportForm } from './components/CitizenReportForm.tsx';
import { IssueTrackingDashboard } from './components/IssueTrackingDashboard.tsx';
import { LiveCityMapView } from './components/LiveCityMapView.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { AiDiagnosticsView } from './components/AiDiagnosticsView.tsx';
import { IssueDetailDialog } from './components/IssueDetailDialog.tsx';
import { CivicChatWidget } from './components/CivicChatWidget.tsx';

function CivicResolveWorkspace() {
  const { issues, selectIssueById } = useCivicIssues();
  const [activeView, setActiveView] = useState<AppView>('report-an-issue');
  const [modalIssueId, setModalIssueId] = useState<string | null>(null);

  const modalIssue: CivicIssue | null =
    issues.find((item) => item.id === modalIssueId) ?? null;

  return (
    <PortalShell activeView={activeView} onChangeView={setActiveView}>
      {activeView === 'report-an-issue' && (
        <CitizenReportForm
          onIssueSubmitted={(created) => {
            selectIssueById(created.id);
          }}
          onGoToTracker={() => setActiveView('public-tracker')}
        />
      )}

      {activeView === 'public-tracker' && (
        <IssueTrackingDashboard
          onReportNew={() => setActiveView('report-an-issue')}
        />
      )}

      {activeView === 'live-city-map' && (
        <LiveCityMapView
          onInspectIssue={(issue) => setModalIssueId(issue.id)}
          onOpenInTracker={(issueId) => {
            selectIssueById(issueId);
            setActiveView('public-tracker');
          }}
        />
      )}

      {activeView === 'admin-triage-and-ops' && (
        <AdminDashboard
          onSelectIssueDetail={(issue) => setModalIssueId(issue.id)}
        />
      )}

      {activeView === 'gemini-ai-insights' && (
        <AiDiagnosticsView
          onOpenAdminBoard={() => setActiveView('admin-triage-and-ops')}
        />
      )}

      <IssueDetailDialog
        issue={modalIssue}
        onClose={() => setModalIssueId(null)}
      />

      <CivicChatWidget activeView={activeView} />
    </PortalShell>
  );
}

export default function App() {
  return (
    <LiveAnnouncerProvider>
      <CivicProvider>
        <SkipLink targetId="main-content" label="Skip to CivicResolve workspace" />
        <CivicResolveWorkspace />
      </CivicProvider>
    </LiveAnnouncerProvider>
  );
}
