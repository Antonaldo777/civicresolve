import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  AdminUpdateIssuePayload,
  AiAuditLogEntry,
  AiTriageAnalysis,
  CivicIssue,
  CreateIssuePayload,
  GovernanceSettings,
  IssueDashboardStats,
  IssueFilterState,
  IssueWorkLogComment,
} from '../shared/types.ts';
import {
  computeIssueStats,
  DEFAULT_FILTER_STATE,
  filterIssues,
  formatFilterResultsAnnouncement,
  formatIssueStatusAnnouncement,
  sortIssues,
} from '../shared/civicDomain.ts';
import {
  addIssueCommentApi,
  analyzeIssueWithAi,
  checkApiHealth,
  CivicApiError,
  deleteCivicIssue,
  endorseCivicIssueApi,
  fetchIssues,
  reanalyzeCivicIssue,
  subscribeIssueSmsApi,
  updateCivicIssue,
} from '../services/civicApi.ts';
import {
  auth,
  signInWithGooglePopup,
  signOutFirebase,
} from '../firebase.ts';
import {
  addCommentInFirestore,
  checkIsUserAdmin,
  createIssueInFirestore,
  DEFAULT_GOVERNANCE,
  deleteIssueInFirestore,
  saveGovernanceInFirestore,
  seedFirestoreIfEmpty,
  subscribeAuditLogsInFirestore,
  subscribeCommentsForIssue,
  subscribeGovernanceInFirestore,
  subscribePublicIssues,
  subscribeSmsInFirestore,
  toggleEndorsementInFirestore,
  updateIssueInFirestore,
} from '../services/firestoreIssues.ts';
import { useAnnouncer } from '../a11y/LiveAnnouncer.tsx';

export interface CivicContextValue {
  issues: CivicIssue[];
  filteredIssues: CivicIssue[];
  stats: IssueDashboardStats;
  filters: IssueFilterState;
  setFilters: React.Dispatch<React.SetStateAction<IssueFilterState>>;
  updateFilter: <K extends keyof IssueFilterState>(key: K, value: IssueFilterState[K]) => void;
  resetFilters: () => void;
  selectedIssue: CivicIssue | null;
  selectIssueById: (id: string | null) => void;
  isLoading: boolean;
  loadError: string | null;
  aiConfigured: boolean | null;
  // Firebase Auth & Cloud Firestore state
  firebaseUser: User | null;
  authReady: boolean;
  isAdminUser: boolean;
  cloudSyncActive: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  // Issue operations
  refreshIssues: () => Promise<void>;
  submitNewIssue: (payload: CreateIssuePayload) => Promise<CivicIssue>;
  adminUpdateIssue: (id: string, patch: AdminUpdateIssuePayload) => Promise<CivicIssue>;
  adminReanalyzeIssue: (
    id: string,
    applyRecommendations?: boolean,
  ) => Promise<{ issue: CivicIssue; analysis: AiTriageAnalysis }>;
  adminDeleteIssue: (id: string) => Promise<void>;
  // Community & Governance features
  endorsedIssueIds: Record<string, boolean>;
  toggleEndorseIssue: (issueId: string) => Promise<void>;
  addWorkLogComment: (
    issueId: string,
    body: string,
    authorRole?: IssueWorkLogComment['authorRole'],
  ) => Promise<void>;
  subscribeIssueSms: (issueId: string, phone: string) => Promise<void>;
  governance: GovernanceSettings;
  updateGovernance: (next: GovernanceSettings) => Promise<void>;
  auditLogs: AiAuditLogEntry[];
  pushLocalAuditLog: (eventType: string, summary: string, ticketCode?: string) => void;
}

const CivicContext = createContext<CivicContextValue | null>(null);

const INITIAL_AUDIT_LOGS: AiAuditLogEntry[] = [
  {
    id: 'evt-90412',
    eventType: 'MULTIMODAL_TRIAGE',
    summary:
      'Analyzed Oakway Blvd water main rupture telemetry. Gemini Classified: Critical Structural Hazard -> Water & Sewer Authority.',
    ticketCode: 'CR-2026-0001',
    tokensProcessed: 412,
    latencyMs: 680,
    timestamp: new Date(Date.now() - 12 * 60_000).toISOString(),
  },
  {
    id: 'evt-90411',
    eventType: 'SCHOOL_ZONE_PRIORITY',
    summary:
      'Spatial proximity match near Lincoln Elementary crossing for #CR-2026-0002. Priority elevated to High.',
    ticketCode: 'CR-2026-0002',
    tokensProcessed: 384,
    latencyMs: 590,
    timestamp: new Date(Date.now() - 37 * 60_000).toISOString(),
  },
  {
    id: 'evt-90409',
    eventType: 'CRITICAL_SAFETY_TRIP',
    summary:
      'Trigger keyword "sparking / power lines" matched. Automated priority elevated to Critical Emergency Dispatch.',
    ticketCode: 'CR-2026-0004',
    tokensProcessed: 452,
    latencyMs: 610,
    timestamp: new Date(Date.now() - 70 * 60_000).toISOString(),
  },
];

export function CivicProvider({ children }: { children: React.ReactNode }) {
  const { announcePolite, announceAssertive } = useAnnouncer();

  const [issues, setIssues] = useState<CivicIssue[]>([]);
  const [selectedComments, setSelectedComments] = useState<IssueWorkLogComment[]>([]);
  const [filters, setFilters] = useState<IssueFilterState>(DEFAULT_FILTER_STATE);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);
  const [cloudIssues, setCloudIssues] = useState<CivicIssue[] | null>(null);

  const [endorsedIssueIds, setEndorsedIssueIds] = useState<Record<string, boolean>>({});
  const [governance, setGovernance] = useState<GovernanceSettings>(DEFAULT_GOVERNANCE);
  const [auditLogs, setAuditLogs] = useState<AiAuditLogEntry[]>(INITIAL_AUDIT_LOGS);

  const seededRef = useRef(false);

  const refreshIssues = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [issuesRes, healthRes] = await Promise.all([
        fetchIssues(),
        checkApiHealth().catch(() => ({ status: 'ok', aiConfigured: false })),
      ]);
      setIssues(issuesRes.issues);
      setAiConfigured(healthRes.aiConfigured);
    } catch (err) {
      const msg =
        err instanceof CivicApiError
          ? err.message
          : 'Unable to load civic issues from the server.';
      setLoadError(msg);
      announceAssertive(msg);
    } finally {
      setIsLoading(false);
    }
  }, [announceAssertive]);

  useEffect(() => {
    void refreshIssues();
  }, [refreshIssues]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const admin = await checkIsUserAdmin(user);
        setIsAdminUser(admin);
      } else {
        setIsAdminUser(false);
        setCloudIssues(null);
        seededRef.current = false;
      }
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Attach Firestore real-time listeners only when auth is ready and user is authenticated
  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    const unsubIssues = subscribePublicIssues(
      (fsIssues) => {
        setCloudIssues(fsIssues);
        if (fsIssues.length === 0 && isAdminUser && !seededRef.current && issues.length > 0) {
          seededRef.current = true;
          void seedFirestoreIfEmpty(firebaseUser, issues);
        }
      },
      (err) => {
        console.warn('Firestore issues subscription notice:', err.message);
      },
    );

    const unsubGov = subscribeGovernanceInFirestore((gov) => {
      setGovernance(gov);
    });

    let unsubAudit: (() => void) | undefined;
    if (isAdminUser) {
      unsubAudit = subscribeAuditLogsInFirestore((logs) => {
        if (logs.length > 0) {
          setAuditLogs(logs);
        }
      });
    }

    return () => {
      unsubIssues();
      unsubGov();
      unsubAudit?.();
    };
  }, [authReady, firebaseUser, isAdminUser, issues.length]);

  const cloudSyncActive = Boolean(firebaseUser && cloudIssues && cloudIssues.length > 0);
  const activeIssues = useMemo(
    () => (cloudSyncActive && cloudIssues ? cloudIssues : issues),
    [cloudSyncActive, cloudIssues, issues],
  );

  // Subscribe to comments subcollection for selected issue when synced with Firestore
  useEffect(() => {
    if (!cloudSyncActive || !selectedIssueId) {
      setSelectedComments([]);
      return;
    }
    const unsub = subscribeCommentsForIssue(selectedIssueId, (cmts) => {
      setSelectedComments(cmts);
    });
    return unsub;
  }, [cloudSyncActive, selectedIssueId]);

  // Keep selectedIssueId defaulting to first issue when available
  useEffect(() => {
    if (!selectedIssueId && activeIssues.length > 0) {
      setSelectedIssueId(activeIssues[0].id);
    }
  }, [activeIssues, selectedIssueId]);

  const filteredIssues = useMemo(
    () => sortIssues(filterIssues(activeIssues, filters), filters.sort),
    [activeIssues, filters],
  );

  const stats = useMemo(() => computeIssueStats(activeIssues), [activeIssues]);

  const selectedIssue = useMemo(() => {
    const found = activeIssues.find((item) => item.id === selectedIssueId) ?? null;
    if (!found) return null;
    if (cloudSyncActive && selectedComments.length > 0) {
      return { ...found, comments: selectedComments };
    }
    return found;
  }, [activeIssues, selectedIssueId, cloudSyncActive, selectedComments]);

  const signInWithGoogle = useCallback(async () => {
    const user = await signInWithGooglePopup();
    announcePolite(`Signed in as ${user.displayName ?? user.email ?? 'user'}. Cloud Firestore sync active.`);
  }, [announcePolite]);

  const signOutUser = useCallback(async () => {
    await signOutFirebase();
    announcePolite('Signed out of Google Cloud account.');
  }, [announcePolite]);

  const pushLocalAuditLog = useCallback(
    (eventType: string, summary: string, ticketCode?: string) => {
      setAuditLogs((prev) => [
        {
          id: `evt_${Date.now()}`,
          eventType,
          summary,
          ticketCode,
          tokensProcessed: 0,
          latencyMs: 120,
          timestamp: new Date().toISOString(),
        },
        ...prev.slice(0, 19),
      ]);
    },
    [],
  );

  const updateFilter = useCallback(
    <K extends keyof IssueFilterState>(key: K, value: IssueFilterState[K]) => {
      setFilters((prev) => {
        const next = { ...prev, [key]: value };
        const count = filterIssues(activeIssues, next).length;
        announcePolite(formatFilterResultsAnnouncement(count, activeIssues.length));
        return next;
      });
    },
    [activeIssues, announcePolite],
  );

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTER_STATE);
    announcePolite(formatFilterResultsAnnouncement(activeIssues.length, activeIssues.length));
  }, [activeIssues.length, announcePolite]);

  const selectIssueById = useCallback((id: string | null) => {
    setSelectedIssueId(id);
  }, []);

  const submitNewIssue = useCallback(
    async (payload: CreateIssuePayload): Promise<CivicIssue> => {
      if (!firebaseUser) {
        throw new CivicApiError(
          'Sign in with a verified Google account before submitting a report.',
          401,
          'AUTH_REQUIRED',
        );
      }

      // Run server-side Gemini triage first if needed
      let aiAnalysis = payload.precomputedAiAnalysis;
      if (!aiAnalysis && payload.autoClassifyWithAi !== false) {
        const res = await analyzeIssueWithAi({
          title: payload.title,
          description: payload.description,
          location: payload.location,
          categoryHint: payload.category,
          image: payload.image,
        });
        aiAnalysis = res.analysis;
      }

      const created = await createIssueInFirestore(
        payload,
        firebaseUser,
        activeIssues.length,
        aiAnalysis,
      );
      announcePolite(
        `Report ${created.trackingCode} saved to Cloud Firestore. Priority ${created.priority}, routed to ${created.assignedDepartment}.`,
      );
      setSelectedIssueId(created.id);
      return created;
    },
    [firebaseUser, activeIssues.length, announcePolite],
  );

  const adminUpdateIssue = useCallback(
    async (id: string, patch: AdminUpdateIssuePayload): Promise<CivicIssue> => {
      const target = activeIssues.find((item) => item.id === id);
      if (firebaseUser && isAdminUser && cloudSyncActive && target) {
        await updateIssueInFirestore(target, patch, firebaseUser);
        const optimistic: CivicIssue = {
          ...target,
          status: patch.status ?? target.status,
          priority: patch.priority ?? target.priority,
          category: patch.category ?? target.category,
          assignedDepartment: patch.assignedDepartment ?? target.assignedDepartment,
          assignedCrew: patch.assignedCrew ?? target.assignedCrew,
          slaTarget: patch.slaTarget ?? target.slaTarget,
          aiApproved: patch.aiApproved ?? target.aiApproved,
          adminNotes: patch.adminNotes ?? target.adminNotes,
          updatedAt: new Date().toISOString(),
        };
        announcePolite(formatIssueStatusAnnouncement(optimistic));
        return optimistic;
      }

      const { issue } = await updateCivicIssue(id, patch);
      setIssues((prev) => prev.map((item) => (item.id === issue.id ? issue : item)));
      pushLocalAuditLog(
        'ADMIN_DISPATCH_UPDATE',
        `${issue.trackingCode} updated to ${issue.status} (${issue.priority}) • ${issue.assignedCrew ?? issue.assignedDepartment}`,
        issue.trackingCode,
      );
      announcePolite(formatIssueStatusAnnouncement(issue));
      return issue;
    },
    [activeIssues, firebaseUser, isAdminUser, cloudSyncActive, announcePolite, pushLocalAuditLog],
  );

  const adminReanalyzeIssue = useCallback(
    async (
      id: string,
      applyRecommendations = true,
    ): Promise<{ issue: CivicIssue; analysis: AiTriageAnalysis }> => {
      const target = activeIssues.find((item) => item.id === id);
      if (firebaseUser && isAdminUser && cloudSyncActive && target) {
        const { analysis } = await analyzeIssueWithAi({
          title: target.title,
          description: target.description,
          location: target.location,
          categoryHint: target.category,
          image: target.image,
        });
        await updateIssueInFirestore(
          target,
          applyRecommendations
            ? {
                category: analysis.detectedCategory,
                priority: analysis.detectedPriority,
                assignedDepartment: analysis.recommendedDepartment,
                slaTarget: `< ${analysis.estimatedSlaHours} Hours`,
                statusNote: `Gemini AI re-analysis completed (${Math.round(analysis.confidence * 100)}% confidence).`,
              }
            : { statusNote: 'Gemini AI diagnostics refreshed.' },
          firebaseUser,
        );
        const updated = { ...target, aiAnalysis: analysis };
        return { issue: updated, analysis };
      }

      const result = await reanalyzeCivicIssue(id, applyRecommendations);
      setIssues((prev) =>
        prev.map((item) => (item.id === result.issue.id ? result.issue : item)),
      );
      pushLocalAuditLog(
        'RE_ANALYSIS',
        `Gemini re-scored ${result.issue.trackingCode} as ${result.issue.priority} (${result.issue.category}).`,
        result.issue.trackingCode,
      );
      announcePolite(
        `Gemini AI re-analysis completed for ${result.issue.trackingCode}: ${result.issue.category}, ${result.issue.priority} priority.`,
      );
      return result;
    },
    [activeIssues, firebaseUser, isAdminUser, cloudSyncActive, announcePolite, pushLocalAuditLog],
  );

  const adminDeleteIssue = useCallback(
    async (id: string): Promise<void> => {
      const target = activeIssues.find((item) => item.id === id);
      if (firebaseUser && isAdminUser && cloudSyncActive) {
        await deleteIssueInFirestore(id);
      } else {
        await deleteCivicIssue(id);
        setIssues((prev) => prev.filter((item) => item.id !== id));
      }
      if (selectedIssueId === id) {
        setSelectedIssueId(null);
      }
      if (target) {
        pushLocalAuditLog('ISSUE_REMOVED', `Removed civic issue ${target.trackingCode}.`, target.trackingCode);
        announcePolite(`Removed civic issue ${target.trackingCode}.`);
      }
    },
    [activeIssues, firebaseUser, isAdminUser, cloudSyncActive, selectedIssueId, announcePolite, pushLocalAuditLog],
  );

  const toggleEndorseIssue = useCallback(
    async (issueId: string) => {
      const target = activeIssues.find((i) => i.id === issueId);
      if (!target) return;
      const already = Boolean(endorsedIssueIds[issueId]);

      if (firebaseUser && cloudSyncActive) {
        const nowEndorsed = await toggleEndorsementInFirestore(target, firebaseUser);
        setEndorsedIssueIds((prev) => ({ ...prev, [issueId]: nowEndorsed }));
        announcePolite(
          nowEndorsed
            ? `Endorsed ${target.trackingCode}.`
            : `Removed endorsement for ${target.trackingCode}.`,
        );
        return;
      }

      const delta = already ? -1 : 1;
      const { issue } = await endorseCivicIssueApi(issueId, delta);
      setIssues((prev) => prev.map((item) => (item.id === issue.id ? issue : item)));
      setEndorsedIssueIds((prev) => ({ ...prev, [issueId]: !already }));
      announcePolite(
        !already
          ? `Endorsed ${issue.trackingCode}. Total affected residents: ${issue.endorsementCount}.`
          : `Removed endorsement for ${issue.trackingCode}.`,
      );
    },
    [activeIssues, endorsedIssueIds, firebaseUser, cloudSyncActive, announcePolite],
  );

  const addWorkLogComment = useCallback(
    async (
      issueId: string,
      body: string,
      authorRole: IssueWorkLogComment['authorRole'] = 'Citizen',
    ) => {
      if (firebaseUser && cloudSyncActive) {
        await addCommentInFirestore(issueId, firebaseUser, body, authorRole);
        announcePolite('Posted public work-log observation to Cloud Firestore.');
        return;
      }

      const authorName =
        authorRole === 'Administrator'
          ? 'Elena Vance • Ops Director'
          : 'Verified Resident';
      const { issue } = await addIssueCommentApi(issueId, body, authorName, authorRole);
      setIssues((prev) => prev.map((item) => (item.id === issue.id ? issue : item)));
      announcePolite('Posted public note to municipal work log.');
    },
    [firebaseUser, cloudSyncActive, announcePolite],
  );

  const subscribeIssueSms = useCallback(
    async (issueId: string, phone: string) => {
      if (firebaseUser && cloudSyncActive) {
        await subscribeSmsInFirestore(issueId, phone, firebaseUser);
        announcePolite('Subscribed phone number for SMS dispatch alerts.');
        return;
      }
      const { issue } = await subscribeIssueSmsApi(issueId, phone);
      setIssues((prev) => prev.map((item) => (item.id === issue.id ? issue : item)));
      announcePolite('Subscribed phone number for SMS dispatch alerts.');
    },
    [firebaseUser, cloudSyncActive, announcePolite],
  );

  const updateGovernance = useCallback(
    async (next: GovernanceSettings) => {
      setGovernance(next);
      if (firebaseUser && isAdminUser) {
        await saveGovernanceInFirestore(next, firebaseUser);
      }
      pushLocalAuditLog(
        'GOVERNANCE_UPDATE',
        `Auto-dispatch confidence threshold set to ${next.autoDispatchThreshold}% (${next.emergencyKeywords.length} active safety triggers).`,
      );
      announcePolite('Updated Municipal AI governance guardrails.');
    },
    [firebaseUser, isAdminUser, pushLocalAuditLog, announcePolite],
  );

  const value: CivicContextValue = {
    issues: activeIssues,
    filteredIssues,
    stats,
    filters,
    setFilters,
    updateFilter,
    resetFilters,
    selectedIssue,
    selectIssueById,
    isLoading,
    loadError,
    aiConfigured,
    firebaseUser,
    authReady,
    isAdminUser,
    cloudSyncActive,
    signInWithGoogle,
    signOutUser,
    refreshIssues,
    submitNewIssue,
    adminUpdateIssue,
    adminReanalyzeIssue,
    adminDeleteIssue,
    endorsedIssueIds,
    toggleEndorseIssue,
    addWorkLogComment,
    subscribeIssueSms,
    governance,
    updateGovernance,
    auditLogs,
    pushLocalAuditLog,
  };

  return <CivicContext.Provider value={value}>{children}</CivicContext.Provider>;
}

export function useCivicIssues(): CivicContextValue {
  const ctx = useContext(CivicContext);
  if (!ctx) {
    throw new Error('useCivicIssues must be used within a CivicProvider.');
  }
  return ctx;
}
