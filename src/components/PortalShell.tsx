import React, { useState } from 'react';
import {
  Activity,
  Bell,
  Cloud,
  LayoutDashboard,
  ListChecks,
  LogIn,
  LogOut,
  Map as MapIcon,
  Menu,
  PlusCircle,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { AppView } from '../shared/types.ts';
import { useCivicIssues } from '../context/CivicContext.tsx';
import { CivicCrestLogo } from './CivicGraphics.tsx';

const DISTRICTS = [
  'Metro Central District',
  'North Harbor Division',
  'Highland Tech Corridor',
  'East River Ward',
];

interface PortalShellProps {
  activeView: AppView;
  onChangeView: (view: AppView) => void;
  children: React.ReactNode;
}

export function PortalShell({
  activeView,
  onChangeView,
  children,
}: PortalShellProps) {
  const {
    stats,
    filters,
    updateFilter,
    firebaseUser,
    isAdminUser,
    cloudSyncActive,
    aiConfigured,
    auditLogs,
    signInWithGoogle,
    signOutUser,
  } = useCivicIssues();

  const [selectedDistrict, setSelectedDistrict] = useState(DISTRICTS[0]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const isOpsShell =
    activeView === 'admin-triage-and-ops' || activeView === 'gemini-ai-insights';

  const activeIncidentCount = stats.total - (stats.byStatus.Resolved ?? 0);

  const handleSearchChange = (value: string) => {
    updateFilter('search', value);
    if (value.trim() && activeView === 'report-an-issue') {
      onChangeView('public-tracker');
    }
  };

  const handleAuthClick = async () => {
    setAuthMessage(null);
    try {
      if (firebaseUser) {
        await signOutUser();
      } else {
        await signInWithGoogle();
      }
    } catch (err) {
      setAuthMessage(
        err instanceof Error ? err.message : 'Unable to complete Google sign-in.',
      );
    }
  };

  const navItems: Array<{
    id: AppView;
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
    badge?: string;
  }> = [
    {
      id: 'report-an-issue',
      label: 'Report an Issue',
      shortLabel: 'Dispatch Ticket',
      icon: <PlusCircle className="w-4 h-4" aria-hidden="true" />,
      badge: '+ New',
    },
    {
      id: 'public-tracker',
      label: 'Public Tracker',
      shortLabel: 'Public Incidents',
      icon: <ListChecks className="w-4 h-4" aria-hidden="true" />,
      badge: `${activeIncidentCount} Active`,
    },
    {
      id: 'live-city-map',
      label: 'Live City Map',
      shortLabel: 'Live Spatial Grid',
      icon: <MapIcon className="w-4 h-4" aria-hidden="true" />,
    },
    {
      id: 'admin-triage-and-ops',
      label: 'Admin Triage & Ops',
      shortLabel: 'Triage Board',
      icon: <LayoutDashboard className="w-4 h-4" aria-hidden="true" />,
      badge: 'Portal',
    },
    {
      id: 'gemini-ai-insights',
      label: 'Gemini AI Insights',
      shortLabel: 'AI Diagnostics',
      icon: <Sparkles className="w-4 h-4 text-secondary" aria-hidden="true" />,
    },
  ];

  const AuthStatusButton = () => (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleAuthClick}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
          cloudSyncActive
            ? 'bg-tertiary-fixed text-on-tertiary-fixed hover:bg-tertiary-fixed-dim'
            : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high border border-outline-variant/60'
        }`}
        title={
          firebaseUser
            ? `Signed in as ${firebaseUser.email ?? firebaseUser.displayName}. Click to sign out.`
            : 'Sign in with a verified Google account to submit reports, use AI features, and sync to Firestore'
        }
      >
        {firebaseUser ? (
          <>
            <Cloud className="w-3.5 h-3.5 text-on-tertiary-container" aria-hidden="true" />
            <span className="hidden sm:inline">
              {isAdminUser ? 'Admin • Firestore' : 'Firestore Synced'}
            </span>
            <LogOut className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
          </>
        ) : (
          <>
            <LogIn className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
            <span className="hidden sm:inline">Sign In / Cloud Sync</span>
          </>
        )}
      </button>
    </div>
  );

  const NotificationsButton = () => (
    <div className="relative">
      <button
        type="button"
        onClick={() => setNotificationsOpen((prev) => !prev)}
        aria-label={`Notifications (${auditLogs.length} updates)`}
        aria-expanded={notificationsOpen}
        className="relative p-2 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
      >
        <Bell className="w-5 h-5" aria-hidden="true" />
        <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-error text-on-error text-[10px] font-bold tabular-nums">
          {Math.min(9, auditLogs.length)}
        </span>
      </button>

      {notificationsOpen && (
        <div
          role="region"
          aria-label="Recent Municipal Alerts"
          className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-xl bg-surface-container-lowest shadow-xl border border-outline-variant/60 p-3 z-50 space-y-2"
        >
          <div className="flex items-center justify-between border-b border-surface-container pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-on-surface">
              Dispatch Telemetry Feed
            </span>
            <button
              type="button"
              onClick={() => setNotificationsOpen(false)}
              className="text-xs text-secondary hover:underline"
            >
              Close
            </button>
          </div>
          <ul className="space-y-2 max-h-60 overflow-y-auto">
            {auditLogs.slice(0, 4).map((log) => (
              <li
                key={log.id}
                className="rounded-lg bg-surface-container-low p-2 text-xs text-on-surface"
              >
                <div className="flex items-center justify-between font-mono text-[11px] text-secondary font-semibold">
                  <span>{log.eventType}</span>
                  <span>{log.ticketCode ?? 'SYS'}</span>
                </div>
                <p className="text-on-surface-variant mt-0.5 line-clamp-2">{log.summary}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  if (isOpsShell) {
    return (
      <div className="min-h-screen bg-surface text-on-surface flex">
        {/* Ops Desktop Fixed Sidebar */}
        <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 bg-surface-container-low border-r border-outline-variant/40 z-40 flex-col justify-between py-4">
          <div className="flex flex-col gap-4 px-4">
            <button
              type="button"
              onClick={() => onChangeView('public-tracker')}
              className="flex items-center gap-2.5 px-2 py-1 text-left rounded-lg hover:bg-surface-container transition-colors"
            >
              <CivicCrestLogo className="w-8 h-8 shrink-0" />
              <div className="flex flex-col">
                <span className="font-display text-lg font-bold text-on-surface leading-none tracking-tight">
                  CivicResolve
                </span>
                <span className="font-mono text-[11px] text-secondary font-medium">
                  Ops Command
                </span>
              </div>
            </button>

            <div className="bg-surface-container-lowest p-2.5 rounded-lg shadow-sm border border-outline-variant/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-on-tertiary-container animate-pulse" />
                <span className="font-mono text-xs text-on-surface font-semibold">
                  {aiConfigured === true
                    ? 'Gemini Triage Live'
                    : aiConfigured === false
                      ? 'Gemini API Key Required'
                      : 'Checking Gemini Status'}
                </span>
              </div>
              <span className="font-mono text-[11px] text-secondary bg-secondary-fixed px-1.5 py-0.5 rounded-full font-semibold">
                {cloudSyncActive ? 'Cloud' : '99.8%'}
              </span>
            </div>

            <nav aria-label="Operations Command Navigation" className="flex flex-col gap-1">
              {[
                { id: 'admin-triage-and-ops' as AppView, label: 'Triage Board', icon: <LayoutDashboard className="w-4 h-4" /> },
                { id: 'live-city-map' as AppView, label: 'Live Spatial Grid', icon: <MapIcon className="w-4 h-4" /> },
                { id: 'gemini-ai-insights' as AppView, label: 'AI Diagnostics', icon: <Sparkles className="w-4 h-4 text-secondary" /> },
                { id: 'public-tracker' as AppView, label: 'Public Incidents', icon: <ListChecks className="w-4 h-4" /> },
                { id: 'report-an-issue' as AppView, label: 'Dispatch Ticket', icon: <PlusCircle className="w-4 h-4" /> },
              ].map((item) => {
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => onChangeView(item.id)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-left transition-colors ${
                      isActive
                        ? 'bg-surface-container-high text-on-surface shadow-sm'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="px-4 flex flex-col gap-3">
            <div className="bg-surface-container-lowest p-3 rounded-lg shadow-sm border border-outline-variant/30 flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                Hotline Telemetry
              </span>
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-error font-semibold">911 Active Link</span>
                <span className="text-on-tertiary-container font-semibold">100% UP</span>
              </div>
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-secondary">311 Lines</span>
                <span className="tabular-nums">24 Dispatchers</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-1.5 rounded-lg bg-surface-container-lowest/70 border border-outline-variant/30">
              <div className="w-8 h-8 rounded-full bg-primary-container text-white flex items-center justify-center text-xs font-bold shrink-0">
                {firebaseUser?.displayName
                  ? firebaseUser.displayName
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()
                  : 'EV'}
              </div>
              <div className="min-w-0 flex flex-col text-left">
                <span className="text-xs font-semibold text-on-surface truncate">
                  {firebaseUser?.displayName ?? 'Elena Vance'}
                </span>
                <span className="font-mono text-[11px] text-on-surface-variant truncate">
                  {isAdminUser ? 'Super Admin • Firestore' : 'Ops Director'}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Ops Content Column */}
        <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
          <header className="sticky top-0 h-16 bg-surface-container-lowest/95 backdrop-blur border-b border-outline-variant/40 z-30 flex items-center justify-between px-4 lg:px-6 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen((v) => !v)}
                aria-label="Toggle operations menu"
                aria-expanded={mobileMenuOpen}
                className="lg:hidden p-2 rounded-lg bg-surface-container-low text-on-surface"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              <div className="hidden sm:flex items-center gap-1.5 font-mono text-xs text-on-surface-variant truncate">
                <Activity className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />
                <span>Operations Portal</span>
                <span aria-hidden="true">&gt;</span>
                <span className="text-on-surface font-semibold">
                  {activeView === 'gemini-ai-insights'
                    ? 'Gemini AI Diagnostics'
                    : 'Municipal Dispatch Command'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="relative hidden md:block w-56">
                <Search className="w-4 h-4 absolute left-2.5 top-2 text-on-surface-variant" aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Search tickets"
                  value={filters.search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search Ticket # or Street..."
                  className="w-full bg-surface-container-low text-on-surface placeholder:text-outline text-xs rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-secondary/60"
                />
              </div>
              <AuthStatusButton />
              <NotificationsButton />
            </div>
          </header>

          {mobileMenuOpen && (
            <nav
              aria-label="Mobile Operations Navigation"
              className="lg:hidden bg-surface-container-low border-b border-outline-variant/40 px-4 py-3 grid grid-cols-2 gap-2"
            >
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onChangeView(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${
                    activeView === item.id
                      ? 'bg-surface-container-high text-on-surface'
                      : 'bg-surface-container-lowest text-on-surface-variant'
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.shortLabel}</span>
                </button>
              ))}
            </nav>
          )}

          {authMessage && (
            <div role="alert" className="mx-4 lg:mx-6 mt-3 rounded-lg bg-error-container text-on-error-container px-4 py-2 text-xs font-medium">
              {authMessage}
            </div>
          )}

          <main id="main-content" tabIndex={-1} className="flex-1 px-4 lg:px-6 py-6 min-w-0">
            {children}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col">
      {/* Top Municipal Portal Header */}
      <header className="sticky top-0 w-full z-40 bg-surface-container-lowest/95 backdrop-blur border-b border-outline-variant/40 shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        {/* Hotline & Protocol Top Ribbon */}
        <div className="w-full bg-primary-container text-surface-container-highest px-4 lg:px-6 py-1.5">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between font-mono text-[11px] gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-tertiary-fixed animate-pulse" aria-hidden="true" />
              <span className="text-inverse-on-surface font-semibold">City Services Hotline: 311</span>
              <span className="text-on-primary-container" aria-hidden="true">|</span>
              <span className="text-error-container font-semibold">Emergency: 911</span>
              <span className="text-on-primary-container" aria-hidden="true">|</span>
              <span className="text-secondary-fixed">AI Triage active 24/7</span>
            </div>
            <div className="hidden md:flex items-center gap-1.5 text-surface-container-high">
              <ShieldCheck className="w-3.5 h-3.5 text-tertiary-fixed" aria-hidden="true" />
              <span>Municipal Sovereign Infrastructure • Google Cloud Firestore Ready</span>
            </div>
          </div>
        </div>

        {/* Main Navigation Bar */}
        <div className="max-w-7xl mx-auto px-4 lg:px-6 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => onChangeView('public-tracker')}
            className="flex items-center gap-2.5 text-left shrink-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
          >
            <CivicCrestLogo className="w-8 h-8" />
            <div className="flex flex-col">
              <span className="font-display text-lg font-bold text-on-surface leading-none tracking-tight">
                CivicResolve
              </span>
              <span className="font-mono text-[10px] text-secondary font-medium whitespace-nowrap">
                AI Municipal Governance
              </span>
            </div>
          </button>

          <nav aria-label="Primary Civic Navigation" className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onChangeView(item.id)}
                  className={`px-2.5 xl:px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? 'bg-surface-container-high text-on-surface shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.badge && (
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums ${
                        item.id === 'report-an-issue'
                          ? 'bg-primary text-on-primary'
                          : item.id === 'public-tracker'
                            ? 'bg-secondary-fixed text-on-secondary-fixed'
                            : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {item.id === 'gemini-ai-insights' && (
                    <Sparkles className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <AuthStatusButton />
            <NotificationsButton />

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
              className="lg:hidden p-2 rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-container"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Sub-ribbon Breadcrumb, Search, District & Model Status */}
        <div className="w-full bg-surface-container-low/80 border-t border-outline-variant/30 px-4 lg:px-6 py-1.5">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between font-mono text-[11px] gap-2">
            <div className="flex items-center gap-1.5 text-on-surface-variant">
              <span>City Portal</span>
              <span aria-hidden="true">&gt;</span>
              <span className="text-on-surface font-semibold">
                {activeView === 'report-an-issue'
                  ? 'Citizen Issue Reporting'
                  : activeView === 'live-city-map'
                    ? 'Live Spatial Grid'
                    : 'Public Issue Tracker & Resolution Hub'}
              </span>
              <span className="hidden sm:inline text-outline-variant">•</span>
              <span className="hidden sm:inline text-secondary font-medium">{selectedDistrict}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative hidden md:block w-48">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-on-surface-variant" aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Global ticket or street search"
                  value={filters.search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search Ticket # or Street..."
                  className="w-full bg-surface-container-lowest text-on-surface placeholder:text-outline font-sans text-xs rounded-md pl-7 pr-2.5 py-1 border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-secondary/60"
                />
              </div>

              <div className="hidden md:flex items-center bg-surface-container-lowest px-2 py-1 rounded-md border border-outline-variant/40">
                <label htmlFor="district-selector" className="sr-only">
                  Select Municipal District
                </label>
                <select
                  id="district-selector"
                  value={selectedDistrict}
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                  className="bg-transparent font-sans text-xs font-semibold text-on-surface focus:outline-none cursor-pointer"
                >
                  {DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <span className="inline-flex items-center gap-1 bg-surface-container-lowest px-2.5 py-0.5 rounded-full shadow-xs border border-outline-variant/30">
                <Sparkles className="w-3 h-3 text-secondary" aria-hidden="true" />
                <span className="text-secondary font-semibold">
                  {aiConfigured === true
                    ? 'Gemini AI Triage: Operational'
                    : aiConfigured === false
                      ? 'Gemini API Key Required'
                      : 'Checking Gemini Status'}
                </span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-on-surface-variant">
                <span className="h-1.5 w-1.5 rounded-full bg-on-tertiary-container" />
                <span>{cloudSyncActive ? 'Cloud Firestore Live' : 'Municipal API Live'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Mobile/Tablet Nav Drawer */}
        {mobileMenuOpen && (
          <nav
            aria-label="Mobile Civic Navigation"
            className="lg:hidden bg-surface-container-lowest border-t border-outline-variant/40 px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onChangeView(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold ${
                  activeView === item.id
                    ? 'bg-surface-container-high text-on-surface'
                    : 'bg-surface-container-low text-on-surface-variant'
                }`}
              >
                <span className="flex items-center gap-2">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {item.badge && (
                  <span className="text-[11px] font-mono bg-surface-container-lowest px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        )}
      </header>

      {authMessage && (
        <div role="alert" className="max-w-7xl mx-auto w-full px-4 lg:px-6 mt-3">
          <div className="rounded-lg bg-error-container text-on-error-container px-4 py-2 text-xs font-medium">
            {authMessage}
          </div>
        </div>
      )}

      <main id="main-content" tabIndex={-1} className="flex-1 w-full">
        {children}
      </main>

      {/* Municipal Footer */}
      <footer className="w-full bg-surface-container-lowest border-t border-outline-variant/40 py-10 mt-12">
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <CivicCrestLogo className="w-6 h-6" />
                <span className="font-display text-lg font-bold text-on-surface">CivicResolve</span>
              </div>
              <p className="text-sm text-on-surface-variant">
                Empowering metropolitan residents, Gemini AI triage, and frontline municipal crews through transparent public infrastructure tracking.
              </p>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-container-high text-on-surface w-max mt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
                WCAG 2.1 AA Accessible
              </span>
            </div>

            <div className="flex flex-col gap-1.5 text-sm">
              <h3 className="font-semibold text-on-surface mb-1">Portal Workflows</h3>
              <button type="button" onClick={() => onChangeView('report-an-issue')} className="text-left text-on-surface-variant hover:text-secondary">
                Report a Civic Issue
              </button>
              <button type="button" onClick={() => onChangeView('public-tracker')} className="text-left text-on-surface-variant hover:text-secondary">
                Public Issue Tracker
              </button>
              <button type="button" onClick={() => onChangeView('live-city-map')} className="text-left text-on-surface-variant hover:text-secondary">
                Live City Spatial Map
              </button>
            </div>

            <div className="flex flex-col gap-1.5 text-sm">
              <h3 className="font-semibold text-on-surface mb-1">Operations & AI</h3>
              <button type="button" onClick={() => onChangeView('admin-triage-and-ops')} className="text-left text-on-surface-variant hover:text-secondary">
                Admin Triage &amp; Dispatch
              </button>
              <button type="button" onClick={() => onChangeView('gemini-ai-insights')} className="text-left text-on-surface-variant hover:text-secondary">
                Gemini AI Diagnostics
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-on-surface">Google Cloud Storage</h3>
              <div className="p-3 bg-surface-container-low rounded-lg font-mono text-xs text-on-surface-variant space-y-1">
                <div>Database: Cloud Firestore</div>
                <div>PII Isolation: Enforced</div>
                <div>Sync: {cloudSyncActive ? 'Authenticated Real-Time' : 'Public Ledger Active'}</div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-surface-container flex flex-col sm:flex-row items-center justify-between gap-2 font-mono text-xs text-on-surface-variant">
            <p>© {new Date().getFullYear()} Municipal Authority • CivicResolve Platform</p>
            <span>Powered by Google Gemini AI &amp; Cloud Firestore</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
