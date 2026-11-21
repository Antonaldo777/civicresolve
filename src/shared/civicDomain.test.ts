import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionStatus,
  computeDepartmentDistribution,
  computeIssueStats,
  computeWardHealthStats,
  DEFAULT_FILTER_STATE,
  filterIssues,
  formatFilterResultsAnnouncement,
  generateTrackingCode,
  getCsvExportFilename,
  getLifecycleStepIndex,
  inferWardFromLocation,
  serializeIssuesToCsv,
  sortIssues,
  validateAdminUpdateInput,
  validateCommentInput,
  validateCreateIssueInput,
  validateSmsPhoneInput,
} from './civicDomain';
import {
  CivicIssue,
  CreateIssuePayload,
  IssueCategory,
  IssuePriority,
  IssueStatus,
  MunicipalDepartment,
} from './types';

function makeIssue(overrides: Partial<CivicIssue> = {}): CivicIssue {
  return {
    id: overrides.id ?? 'issue-1',
    trackingCode: overrides.trackingCode ?? 'CR-2026-0001',
    title: overrides.title ?? 'Deep pothole on Main St',
    description: overrides.description ?? 'Large pothole near the intersection causing swerving.',
    location: overrides.location ?? '100 Main St',
    ward: overrides.ward ?? 'Ward 1',
    category: overrides.category ?? IssueCategory.ROAD_INFRASTRUCTURE,
    priority: overrides.priority ?? IssuePriority.HIGH,
    status: overrides.status ?? IssueStatus.REPORTED,
    assignedDepartment: overrides.assignedDepartment ?? MunicipalDepartment.TRANSPORTATION,
    assignedCrew: overrides.assignedCrew,
    aiApproved: overrides.aiApproved ?? false,
    endorsementCount: overrides.endorsementCount ?? 0,
    statusHistory: overrides.statusHistory ?? [],
    comments: overrides.comments ?? [],
    createdAt: overrides.createdAt ?? '2026-11-10T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-11-10T10:00:00.000Z',
    resolvedAt: overrides.resolvedAt,
    adminNotes: overrides.adminNotes,
    aiAnalysis: overrides.aiAnalysis,
  };
}

test('validateCreateIssueInput catches empty and short fields in predictable field order', () => {
  const result = validateCreateIssueInput({
    title: 'Hi',
    description: 'Too short',
    location: '',
  });
  assert.equal(result.valid, false);
  assert.deepEqual(result.fieldOrder, ['title', 'description', 'location']);
  assert.ok(result.errors.title);
  assert.ok(result.errors.description);
  assert.ok(result.errors.location);
});

test('validateCreateIssueInput accepts valid payload and validates image MIME type', () => {
  const validResult = validateCreateIssueInput({
    title: 'Broken streetlight at Elm Park',
    description: 'Streetlight pole #42 has been completely dark for three nights.',
    location: 'Elm Park North Path',
    category: IssueCategory.STREETLIGHTING,
  });
  assert.equal(validResult.valid, true);
  assert.deepEqual(validResult.errors, {});

  const badImageResult = validateCreateIssueInput({
    title: 'Broken streetlight at Elm Park',
    description: 'Streetlight pole #42 has been completely dark for three nights.',
    location: 'Elm Park North Path',
    image: {
      dataUrl: 'data:application/pdf;base64,AAAA',
      mimeType: 'application/pdf',
      fileName: 'doc.pdf',
      altText: 'pdf',
    },
  });
  assert.equal(badImageResult.valid, false);
  assert.ok(badImageResult.errors.image);
});

test('input validators reject malformed JSON field types without throwing', () => {
  const invalidCreate = validateCreateIssueInput({
    title: 'Broken streetlight',
    description: 'Streetlight is not working on the sidewalk.',
    location: 'Elm Park',
    reporterContact: 123 as unknown as string,
    image: null as unknown as NonNullable<CreateIssuePayload['image']>,
  });
  assert.equal(invalidCreate.valid, false);
  assert.ok(invalidCreate.errors.reporterContact);
  assert.ok(invalidCreate.errors.image);

  const invalidAdminUpdate = validateAdminUpdateInput(IssueStatus.REPORTED, {
    assignedCrew: 7 as unknown as string,
  });
  assert.equal(invalidAdminUpdate.valid, false);
  assert.ok(invalidAdminUpdate.errors.assignedCrew);
  assert.ok(validateCommentInput(42));
  assert.ok(validateSmsPhoneInput(null));
});

test('status transition workflow enforces valid 5-stage transitions', () => {
  assert.equal(canTransitionStatus(IssueStatus.REPORTED, IssueStatus.TRIAGED), true);
  assert.equal(canTransitionStatus(IssueStatus.TRIAGED, IssueStatus.DISPATCHED), true);
  assert.equal(canTransitionStatus(IssueStatus.DISPATCHED, IssueStatus.IN_PROGRESS), true);
  assert.equal(canTransitionStatus(IssueStatus.IN_PROGRESS, IssueStatus.RESOLVED), true);
  assert.equal(canTransitionStatus(IssueStatus.RESOLVED, IssueStatus.IN_PROGRESS), true);
  assert.equal(canTransitionStatus(IssueStatus.RESOLVED, IssueStatus.REPORTED), false);
  assert.equal(getLifecycleStepIndex(IssueStatus.DISPATCHED), 3);

  const invalidPatch = validateAdminUpdateInput(IssueStatus.RESOLVED, {
    status: IssueStatus.REPORTED,
  });
  assert.equal(invalidPatch.valid, false);
  assert.ok(invalidPatch.errors.status);
});

test('filterIssues and sortIssues filter and order issues accurately', () => {
  const issues = [
    makeIssue({
      id: '1',
      trackingCode: 'CR-2026-0001',
      title: 'Overflowing bin near transit stop',
      status: IssueStatus.REPORTED,
      priority: IssuePriority.MEDIUM,
      category: IssueCategory.SANITATION_WASTE,
      assignedDepartment: MunicipalDepartment.SANITATION,
      createdAt: '2026-11-01T10:00:00.000Z',
    }),
    makeIssue({
      id: '2',
      trackingCode: 'CR-2026-0002',
      title: 'Water main burst flooding intersection',
      status: IssueStatus.IN_PROGRESS,
      priority: IssuePriority.CRITICAL,
      category: IssueCategory.WATER_DRAINAGE,
      assignedDepartment: MunicipalDepartment.WATER_SEWER,
      createdAt: '2026-11-05T10:00:00.000Z',
    }),
    makeIssue({
      id: '3',
      trackingCode: 'CR-2026-0003',
      title: 'Minor sidewalk crack',
      status: IssueStatus.RESOLVED,
      priority: IssuePriority.LOW,
      createdAt: '2026-11-03T10:00:00.000Z',
      resolvedAt: '2026-11-04T10:00:00.000Z',
    }),
  ];

  const bySearch = filterIssues(issues, { ...DEFAULT_FILTER_STATE, search: 'water main' });
  assert.equal(bySearch.length, 1);
  assert.equal(bySearch[0].id, '2');

  const sortedByPriority = sortIssues(issues, 'priority-desc');
  assert.deepEqual(
    sortedByPriority.map((i) => i.id),
    ['2', '1', '3'],
  );
});

test('computeIssueStats, ward health, and department distribution aggregate accurately', () => {
  const issues = [
    makeIssue({
      id: '1',
      ward: 'Ward 4',
      status: IssueStatus.REPORTED,
      priority: IssuePriority.CRITICAL,
      assignedDepartment: MunicipalDepartment.WATER_SEWER,
    }),
    makeIssue({
      id: '2',
      ward: 'Ward 4',
      status: IssueStatus.DISPATCHED,
      priority: IssuePriority.HIGH,
      assignedDepartment: MunicipalDepartment.TRANSPORTATION,
    }),
    makeIssue({
      id: '3',
      ward: 'Ward 1',
      status: IssueStatus.RESOLVED,
      priority: IssuePriority.MEDIUM,
      assignedDepartment: MunicipalDepartment.TRANSPORTATION,
      createdAt: '2026-11-01T00:00:00.000Z',
      resolvedAt: '2026-11-01T12:00:00.000Z',
    }),
  ];

  const stats = computeIssueStats(issues);
  assert.equal(stats.total, 3);
  assert.equal(stats.byStatus[IssueStatus.REPORTED], 1);
  assert.equal(stats.byStatus[IssueStatus.DISPATCHED], 1);
  assert.equal(stats.byStatus[IssueStatus.RESOLVED], 1);
  assert.equal(stats.openUrgentCount, 2);
  assert.equal(stats.activeInProgressCount, 1);
  assert.equal(stats.resolutionRatePercent, 33);
  assert.equal(stats.averageResolutionHours, 12);

  const wardStats = computeWardHealthStats(issues);
  const ward4 = wardStats.find((w) => w.ward === 'Ward 4');
  assert.ok(ward4);
  assert.equal(ward4.criticalCount, 1);
  assert.equal(inferWardFromLocation('412 Elm Street, Ward 7'), 'Ward 7');

  const deptDist = computeDepartmentDistribution(issues);
  assert.equal(deptDist[0].department, MunicipalDepartment.TRANSPORTATION);
  assert.equal(deptDist[0].count, 2);
});

test('serializeIssuesToCsv neutralizes formula injection, supports BOM, and validates comments/SMS', () => {
  assert.equal(generateTrackingCode(7, new Date('2026-05-01T00:00:00.000Z')), 'CR-2026-0007');
  assert.equal(
    getCsvExportFilename(IssueStatus.IN_PROGRESS, new Date('2026-11-20T00:00:00.000Z')),
    'civicresolve-issues-in-progress-2026-11-20.csv',
  );

  const malicious = makeIssue({
    title: '=CMD("calc")',
    adminNotes: '+SUM(A1:A2)',
    endorsementCount: 14,
  });
  const csv = serializeIssuesToCsv([malicious], { includeBom: true });
  assert.ok(csv.startsWith('\uFEFF"Tracking Code"'));
  assert.ok(csv.includes('"Description"'));
  assert.ok(!csv.includes('Reporter Name'));
  assert.ok(!csv.includes('Reporter Contact'));
  assert.ok(csv.includes('"14"'));
  assert.ok(csv.includes('"\'=CMD(""calc"")"'));
  assert.ok(!csv.includes('Admin Notes'));
  assert.ok(!csv.includes('+SUM(A1:A2)'));
  assert.equal(
    formatFilterResultsAnnouncement(2, 5),
    'Showing 2 of 5 civic issues.',
  );

  assert.ok(validateCommentInput('') !== null);
  assert.equal(validateCommentInput('Valve shutoff confirmed.'), null);
  assert.ok(validateSmsPhoneInput('123') !== null);
  assert.equal(validateSmsPhoneInput('+1 (555) 392-8114'), null);
});
