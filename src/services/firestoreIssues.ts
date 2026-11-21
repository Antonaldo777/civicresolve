import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../firebase.ts';
import {
  AdminUpdateIssuePayload,
  AiAuditLogEntry,
  AiTriageAnalysis,
  CivicIssue,
  CreateIssuePayload,
  GovernanceSettings,
  IssueCategory,
  IssuePriority,
  IssueStatus,
  IssueStatusHistoryEntry,
  IssueWorkLogComment,
  MunicipalDepartment,
} from '../shared/types.ts';
import {
  deriveCoordinatesForLocation,
  generateTrackingCode,
  getDefaultDepartmentForCategory,
  inferWardFromLocation,
  MAX_FIRESTORE_IMAGE_BYTES,
} from '../shared/civicDomain.ts';

export const DEFAULT_GOVERNANCE: GovernanceSettings = {
  autoDispatchThreshold: 92,
  emergencyKeywords: ['gas leak', 'live wire', 'flooding', 'collapsed tree'],
  emergencyPause: false,
  edgeRules: [
    'Autumn leaf accumulation mapped to Routine Sweeper, not Flood Hazard.',
    'Cracked curb paint confidence clamped to 82% max priority threshold.',
  ],
  updatedAt: new Date().toISOString(),
};

function toIsoString(value: unknown, fallback = new Date().toISOString()): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return fallback;
}

function mapDocToIssue(id: string, data: Record<string, unknown>): CivicIssue {
  const location = String(data.location ?? '');
  const ward = String(data.ward ?? inferWardFromLocation(location));
  const createdAt = toIsoString(data.createdAt);
  const updatedAt = toIsoString(data.updatedAt, createdAt);
  const resolvedAt = data.resolvedAt ? toIsoString(data.resolvedAt) : undefined;

  return {
    id,
    trackingCode: String(data.trackingCode ?? `CR-${id.slice(0, 6).toUpperCase()}`),
    title: String(data.title ?? ''),
    description: String(data.description ?? ''),
    location,
    ward,
    coordinates: deriveCoordinatesForLocation(location, ward),
    category: (data.category as IssueCategory) ?? IssueCategory.OTHER,
    priority: (data.priority as IssuePriority) ?? IssuePriority.MEDIUM,
    status: (data.status as IssueStatus) ?? IssueStatus.REPORTED,
    assignedDepartment:
      (data.assignedDepartment as MunicipalDepartment) ?? MunicipalDepartment.GENERAL_SERVICES,
    assignedCrew: data.assignedCrew ? String(data.assignedCrew) : undefined,
    slaTarget: data.slaTarget ? String(data.slaTarget) : undefined,
    aiApproved: Boolean(data.aiApproved),
    endorsementCount:
      typeof data.endorsementCount === 'number' ? data.endorsementCount : 0,
    image:
      typeof data.imageDataUrl === 'string' && data.imageDataUrl.startsWith('data:')
        ? {
            dataUrl: data.imageDataUrl,
            mimeType: String(data.imageMimeType ?? 'image/jpeg'),
            fileName: String(data.imageFileName ?? 'evidence.jpg'),
            altText: String(data.imageAltText ?? 'Citizen uploaded issue photo'),
          }
        : undefined,
    aiAnalysis: data.aiAnalysis as AiTriageAnalysis | undefined,
    adminNotes: data.adminNotes ? String(data.adminNotes) : undefined,
    statusHistory: Array.isArray(data.statusHistory)
      ? (data.statusHistory as IssueStatusHistoryEntry[])
      : [],
    comments: [],
    visibility: 'public',
    authorUid: data.authorUid ? String(data.authorUid) : undefined,
    createdAt,
    updatedAt,
    resolvedAt,
  };
}

export async function checkIsUserAdmin(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  try {
    const token = await user.getIdTokenResult();
    if (token.claims.admin === true) return true;
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export function subscribePublicIssues(
  onData: (issues: CivicIssue[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = 'issues';
  const q = query(collection(db, path), where('visibility', '==', 'public'));
  return onSnapshot(
    q,
    (snapshot) => {
      const mapped = snapshot.docs.map((d) =>
        mapDocToIssue(d.id, d.data() as Record<string, unknown>),
      );
      mapped.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      onData(mapped);
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    },
  );
}

export function subscribeCommentsForIssue(
  issueId: string,
  onData: (comments: IssueWorkLogComment[]) => void,
): Unsubscribe {
  const path = `issues/${issueId}/comments`;
  const q = query(collection(db, path), where('issueId', '==', issueId), limit(50));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: IssueWorkLogComment[] = snapshot.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          issueId,
          authorName: String(data.authorName ?? 'Citizen'),
          authorRole:
            (data.authorRole as IssueWorkLogComment['authorRole']) ?? 'Citizen',
          body: String(data.body ?? ''),
          timestamp: toIsoString(data.createdAt),
        };
      });
      list.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export async function createIssueInFirestore(
  payload: CreateIssuePayload,
  user: User,
  sequenceHint: number,
  aiAnalysis?: AiTriageAnalysis,
): Promise<CivicIssue> {
  const issueId = `cr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `issues/${issueId}`;

  const resolvedCategory =
    payload.category ?? aiAnalysis?.detectedCategory ?? IssueCategory.OTHER;
  const resolvedPriority =
    payload.priority ?? aiAnalysis?.detectedPriority ?? IssuePriority.MEDIUM;
  const resolvedDepartment =
    aiAnalysis?.recommendedDepartment ?? getDefaultDepartmentForCategory(resolvedCategory);
  const ward = (payload.ward?.trim() || inferWardFromLocation(payload.location)).slice(0, 40);
  const trackingCode = generateTrackingCode(sequenceHint + 1);
  const nowIso = new Date().toISOString();

  const history: IssueStatusHistoryEntry[] = [
    {
      id: `hist_${Date.now()}`,
      status: IssueStatus.REPORTED,
      priority: resolvedPriority,
      department: resolvedDepartment,
      note: aiAnalysis
        ? `Report submitted. Gemini AI classified as ${resolvedCategory} (${resolvedPriority} priority) and recommended ${resolvedDepartment}.`
        : `Report submitted under ${resolvedCategory} and routed to ${resolvedDepartment}.`,
      actor: aiAnalysis ? 'Gemini AI' : 'Citizen',
      timestamp: nowIso,
    },
  ];

  const publicDoc: Record<string, unknown> = {
    id: issueId,
    trackingCode,
    title: payload.title.trim().slice(0, 140),
    description: payload.description.trim().slice(0, 3000),
    location: payload.location.trim().slice(0, 240),
    ward,
    category: resolvedCategory,
    priority: resolvedPriority,
    status: IssueStatus.REPORTED,
    assignedDepartment: resolvedDepartment,
    slaTarget: aiAnalysis ? `< ${aiAnalysis.estimatedSlaHours} Hours` : '< 24 Hours',
    aiApproved: false,
    endorsementCount: 0,
    visibility: 'public',
    authorUid: user.uid,
    statusHistory: history,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (payload.image && payload.image.dataUrl.length <= MAX_FIRESTORE_IMAGE_BYTES) {
    publicDoc.imageDataUrl = payload.image.dataUrl;
    publicDoc.imageMimeType = payload.image.mimeType.slice(0, 40);
    publicDoc.imageFileName = payload.image.fileName.slice(0, 120);
    publicDoc.imageAltText = payload.image.altText.slice(0, 240);
  }
  if (aiAnalysis) {
    publicDoc.aiAnalysis = aiAnalysis;
  }

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'issues', issueId), publicDoc);

    if (payload.reporterContact?.trim() || payload.reporterName?.trim()) {
      batch.set(doc(db, 'issueContacts', issueId), {
        issueId,
        authorUid: user.uid,
        reporterName: (payload.reporterName ?? '').trim().slice(0, 100),
        reporterEmail: payload.reporterContact?.includes('@')
          ? payload.reporterContact.trim().slice(0, 160)
          : '',
        reporterPhone:
          payload.reporterContact && !payload.reporterContact.includes('@')
            ? payload.reporterContact.trim().slice(0, 40)
            : '',
        createdAt: serverTimestamp(),
      });
    }

    const auditId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    batch.set(doc(db, 'aiAuditLogs', auditId), {
      id: auditId,
      authorUid: user.uid,
      eventType: aiAnalysis ? 'MULTIMODAL_TRIAGE' : 'MANUAL_INTAKE',
      summary: aiAnalysis
        ? `Ticket ${trackingCode} classified as ${resolvedCategory} (${resolvedPriority}) -> ${resolvedDepartment}`
        : `Ticket ${trackingCode} submitted manually under ${resolvedCategory}`,
      ticketCode: trackingCode,
      tokensProcessed: aiAnalysis?.tokensProcessed ?? 0,
      latencyMs: aiAnalysis?.latencyMs ?? 0,
      createdAt: serverTimestamp(),
    });

    await batch.commit();

    return {
      id: issueId,
      trackingCode,
      title: String(publicDoc.title),
      description: String(publicDoc.description),
      location: String(publicDoc.location),
      ward,
      coordinates: deriveCoordinatesForLocation(String(publicDoc.location), ward),
      category: resolvedCategory,
      priority: resolvedPriority,
      status: IssueStatus.REPORTED,
      assignedDepartment: resolvedDepartment,
      slaTarget: String(publicDoc.slaTarget),
      aiApproved: false,
      endorsementCount: 0,
      image: payload.image,
      aiAnalysis,
      statusHistory: history,
      comments: [],
      visibility: 'public',
      authorUid: user.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateIssueInFirestore(
  issue: CivicIssue,
  patch: AdminUpdateIssuePayload,
  user: User,
): Promise<void> {
  const path = `issues/${issue.id}`;
  const docRef = doc(db, 'issues', issue.id);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error('Issue document not found in Cloud Firestore.');
    }
    const existingData = snap.data() as Record<string, unknown>;
    const nextStatus = patch.status ?? issue.status;
    const nextPriority = patch.priority ?? issue.priority;
    const nextCategory = patch.category ?? issue.category;
    const nextDept = patch.assignedDepartment ?? issue.assignedDepartment;

    const nowIso = new Date().toISOString();
    const historyEntry: IssueStatusHistoryEntry = {
      id: `hist_${Date.now()}`,
      status: nextStatus,
      priority: nextPriority,
      department: nextDept,
      note:
        patch.statusNote?.trim() ||
        `Administrator update: status ${nextStatus}, department ${nextDept}.`,
      actor: 'Administrator',
      timestamp: nowIso,
    };

    const existingHistory = Array.isArray(existingData.statusHistory)
      ? (existingData.statusHistory as IssueStatusHistoryEntry[])
      : [];
    const nextHistory = [...existingHistory.slice(-24), historyEntry];

    const payload: Record<string, unknown> = {
      ...existingData,
      status: nextStatus,
      priority: nextPriority,
      category: nextCategory,
      assignedDepartment: nextDept,
      aiApproved: patch.aiApproved !== undefined ? patch.aiApproved : issue.aiApproved,
      statusHistory: nextHistory,
      updatedAt: serverTimestamp(),
    };

    if (patch.assignedCrew !== undefined) {
      payload.assignedCrew = patch.assignedCrew.trim().slice(0, 100);
    }
    if (patch.slaTarget !== undefined) {
      payload.slaTarget = patch.slaTarget.trim().slice(0, 60);
    }
    if (patch.adminNotes !== undefined) {
      payload.adminNotes = patch.adminNotes.trim().slice(0, 2000);
    }
    if (nextStatus === IssueStatus.RESOLVED && !existingData.resolvedAt) {
      payload.resolvedAt = serverTimestamp();
    }

    await setDoc(docRef, payload);

    const logId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await setDoc(doc(db, 'aiAuditLogs', logId), {
      id: logId,
      authorUid: user.uid,
      eventType: 'ADMIN_DISPATCH_UPDATE',
      summary: `${issue.trackingCode} updated to ${nextStatus} (${nextPriority}) by ${user.email ?? 'Admin'}`,
      ticketCode: issue.trackingCode,
      tokensProcessed: 0,
      latencyMs: 0,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteIssueInFirestore(issueId: string): Promise<void> {
  const path = `issues/${issueId}`;
  try {
    await deleteDoc(doc(db, 'issues', issueId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function toggleEndorsementInFirestore(
  issue: CivicIssue,
  user: User,
): Promise<boolean> {
  const issueRef = doc(db, 'issues', issue.id);
  const endorseRef = doc(db, 'issues', issue.id, 'endorsements', user.uid);
  const path = `issues/${issue.id}/endorsements/${user.uid}`;

  try {
    const existingEndorse = await getDoc(endorseRef);
    const issueSnap = await getDoc(issueRef);
    if (!issueSnap.exists()) return false;
    const issueData = issueSnap.data() as Record<string, unknown>;
    const currentCount =
      typeof issueData.endorsementCount === 'number' ? issueData.endorsementCount : 0;

    const batch = writeBatch(db);
    if (existingEndorse.exists()) {
      batch.delete(endorseRef);
      batch.set(issueRef, {
        ...issueData,
        endorsementCount: Math.max(0, currentCount - 1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return false;
    } else {
      batch.set(endorseRef, {
        userId: user.uid,
        issueId: issue.id,
        createdAt: serverTimestamp(),
      });
      batch.set(issueRef, {
        ...issueData,
        endorsementCount: currentCount + 1,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return true;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function addCommentInFirestore(
  issueId: string,
  user: User,
  body: string,
  authorRole: IssueWorkLogComment['authorRole'] = 'Citizen',
): Promise<void> {
  const commentId = `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `issues/${issueId}/comments/${commentId}`;
  try {
    await setDoc(doc(db, 'issues', issueId, 'comments', commentId), {
      id: commentId,
      issueId,
      authorUid: user.uid,
      authorName: (user.displayName || user.email || 'Verified Resident').slice(0, 80),
      authorRole,
      body: body.trim().slice(0, 1000),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function subscribeSmsInFirestore(
  issueId: string,
  phone: string,
  user: User,
): Promise<void> {
  const subId = `sms_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `smsSubscriptions/${subId}`;
  try {
    await setDoc(doc(db, 'smsSubscriptions', subId), {
      id: subId,
      issueId,
      authorUid: user.uid,
      phone: phone.trim().slice(0, 32),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function seedFirestoreIfEmpty(
  user: User,
  seedIssues: CivicIssue[],
): Promise<boolean> {
  try {
    const existingSnap = await getDocs(
      query(collection(db, 'issues'), where('visibility', '==', 'public'), limit(1)),
    );
    if (!existingSnap.empty) return false;

    const batch = writeBatch(db);
    for (const issue of seedIssues) {
      const docData: Record<string, unknown> = {
        id: issue.id,
        trackingCode: issue.trackingCode,
        title: issue.title,
        description: issue.description,
        location: issue.location,
        ward: issue.ward,
        category: issue.category,
        priority: issue.priority,
        status: issue.status,
        assignedDepartment: issue.assignedDepartment,
        aiApproved: issue.aiApproved,
        endorsementCount: issue.endorsementCount,
        visibility: 'public',
        authorUid: user.uid,
        statusHistory: issue.statusHistory.slice(0, 25),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (issue.assignedCrew) docData.assignedCrew = issue.assignedCrew;
      if (issue.slaTarget) docData.slaTarget = issue.slaTarget;
      if (issue.adminNotes) docData.adminNotes = issue.adminNotes;
      if (issue.aiAnalysis) docData.aiAnalysis = issue.aiAnalysis;
      if (issue.status === IssueStatus.RESOLVED) {
        docData.resolvedAt = serverTimestamp();
      }
      batch.set(doc(db, 'issues', issue.id), docData);

      for (const cmt of issue.comments) {
        batch.set(doc(db, 'issues', issue.id, 'comments', cmt.id), {
          id: cmt.id,
          issueId: issue.id,
          authorUid: user.uid,
          authorName: cmt.authorName,
          authorRole: cmt.authorRole,
          body: cmt.body,
          createdAt: serverTimestamp(),
        });
      }
    }

    batch.set(doc(db, 'governance', 'config'), {
      ...DEFAULT_GOVERNANCE,
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'issues');
  }
}

export function subscribeGovernanceInFirestore(
  onData: (settings: GovernanceSettings) => void,
): Unsubscribe {
  const path = 'governance/config';
  return onSnapshot(
    doc(db, 'governance', 'config'),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data() as Record<string, unknown>;
      onData({
        autoDispatchThreshold:
          typeof d.autoDispatchThreshold === 'number' ? d.autoDispatchThreshold : 92,
        emergencyKeywords: Array.isArray(d.emergencyKeywords)
          ? (d.emergencyKeywords as string[])
          : DEFAULT_GOVERNANCE.emergencyKeywords,
        emergencyPause: Boolean(d.emergencyPause),
        edgeRules: Array.isArray(d.edgeRules)
          ? (d.edgeRules as string[])
          : DEFAULT_GOVERNANCE.edgeRules,
        updatedAt: toIsoString(d.updatedAt),
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    },
  );
}

export async function saveGovernanceInFirestore(
  settings: GovernanceSettings,
  user: User,
): Promise<void> {
  const path = 'governance/config';
  try {
    await setDoc(doc(db, 'governance', 'config'), {
      autoDispatchThreshold: settings.autoDispatchThreshold,
      emergencyKeywords: settings.emergencyKeywords.slice(0, 20),
      emergencyPause: settings.emergencyPause,
      edgeRules: settings.edgeRules.slice(0, 20),
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeAuditLogsInFirestore(
  onData: (logs: AiAuditLogEntry[]) => void,
): Unsubscribe {
  const path = 'aiAuditLogs';
  const q = query(
    collection(db, path),
    where('tokensProcessed', '>=', 0),
    orderBy('tokensProcessed'),
    limit(20),
  );
  return onSnapshot(
    q,
    (snap) => {
      const logs: AiAuditLogEntry[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          eventType: String(data.eventType ?? 'SYSTEM_EVENT'),
          summary: String(data.summary ?? ''),
          ticketCode: data.ticketCode ? String(data.ticketCode) : undefined,
          tokensProcessed:
            typeof data.tokensProcessed === 'number' ? data.tokensProcessed : undefined,
          latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : undefined,
          timestamp: toIsoString(data.createdAt),
        };
      });
      logs.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      onData(logs);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}
