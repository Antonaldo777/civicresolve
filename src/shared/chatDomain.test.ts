import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChatSystemInstruction,
  buildSanitizedCivicContext,
  resolveChatModel,
  validateAndNormalizeChatPayload,
} from './chatDomain';
import {
  CivicIssue,
  IssueCategory,
  IssueDashboardStats,
  IssuePriority,
  IssueStatus,
  MunicipalDepartment,
} from './types';

test('resolveChatModel routes standard and fast mode to supported Gemini models', () => {
  assert.equal(resolveChatModel(false), 'gemini-4-hydrogen');
  assert.equal(resolveChatModel(true), 'gemini-3.1-flash-lite');
});

test('validateAndNormalizeChatPayload rejects empty messages and invalid roles', () => {
  const empty = validateAndNormalizeChatPayload({ message: '   ', history: [] });
  assert.equal(empty.valid, false);

  const badRole = validateAndNormalizeChatPayload({
    message: 'Help me report a pothole',
    rolePreset: 'unknown-role',
    history: [],
  });
  assert.equal(badRole.valid, false);
});

test('validateAndNormalizeChatPayload strips leading model turns and keeps multi-turn history', () => {
  const result = validateAndNormalizeChatPayload({
    message: 'Which department handles this?',
    rolePreset: 'ops-strategist',
    fastMode: true,
    history: [
      { role: 'model', text: 'Greeting before user turn should be trimmed' },
      { role: 'user', text: 'There is water gushing on Oakway Blvd' },
      { role: 'model', text: 'That sounds like a ruptured water main.' },
      { role: 'system', text: 'Invalid role ignored' },
    ],
  });

  assert.equal(result.valid, true);
  assert.ok(result.payload);
  assert.equal(result.payload.rolePreset, 'ops-strategist');
  assert.equal(result.payload.fastMode, true);
  assert.equal(result.payload.history.length, 2);
  assert.equal(result.payload.history[0].role, 'user');
  assert.equal(result.payload.history[1].role, 'model');
});

test('buildSanitizedCivicContext excludes PII and buildChatSystemInstruction embeds role and ticket context', () => {
  const stats: IssueDashboardStats = {
    total: 12,
    byStatus: {
      [IssueStatus.REPORTED]: 2,
      [IssueStatus.TRIAGED]: 3,
      [IssueStatus.DISPATCHED]: 2,
      [IssueStatus.IN_PROGRESS]: 2,
      [IssueStatus.RESOLVED]: 3,
    },
    byPriority: {
      [IssuePriority.LOW]: 2,
      [IssuePriority.MEDIUM]: 4,
      [IssuePriority.HIGH]: 4,
      [IssuePriority.CRITICAL]: 2,
    },
    byCategory: {},
    byDepartment: {},
    openUrgentCount: 6,
    activeInProgressCount: 7,
    resolutionRatePercent: 25,
    averageResolutionHours: 14.5,
  };

  const sampleIssue: CivicIssue = {
    id: 'iss-1',
    trackingCode: 'CR-2026-0001',
    title: 'Ruptured Water Main Flooding Bike Lane',
    description: 'High pressure leak flooding Oakway Blvd.',
    location: '820 Oakway Blvd',
    ward: 'Ward 2',
    category: IssueCategory.WATER_DRAINAGE,
    priority: IssuePriority.CRITICAL,
    status: IssueStatus.IN_PROGRESS,
    assignedDepartment: MunicipalDepartment.WATER_SEWER,
    aiApproved: true,
    endorsementCount: 18,
    statusHistory: [],
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const legacyIssue = Object.assign(sampleIssue, {
    reporterName: 'Private Resident',
    reporterContact: '555-0199-secret@example.com',
  });
  const ctx = buildSanitizedCivicContext(stats, 'public-tracker', legacyIssue);
  const instruction = buildChatSystemInstruction('field-safety-auditor', ctx);

  assert.match(instruction, /Infrastructure & Safety Analyst/);
  assert.match(instruction, /CR-2026-0001/);
  assert.match(instruction, /12 total issues/);
  assert.equal(instruction.includes('555-0199-secret@example.com'), false);
  assert.equal(instruction.includes('Private Resident'), false);
});
