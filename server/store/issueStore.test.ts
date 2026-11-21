import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { IssueStore } from './issueStore';
import {
  IssueCategory,
  IssuePriority,
  IssueStatus,
  MunicipalDepartment,
} from '../../src/shared/types';

test('IssueStore seeds data, creates, updates, persists to disk, and deletes issues', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'civicresolve-store-'));
  const storePath = path.join(tempDir, 'issues.json');

  try {
    const store = new IssueStore(storePath);
    const seeded = await store.listIssues();
    assert.ok(seeded.length >= 5);

    const created = await store.createIssue({
      title: 'Fallen tree limb blocking Oak Ave bike lane',
      description: 'Large oak branch snapped during overnight windstorm blocking westbound lane.',
      location: '310 Oak Ave',
      category: IssueCategory.PARKS_RECREATION,
      priority: IssuePriority.HIGH,
      reporterName: 'Private Reporter',
      reporterContact: 'private@example.test',
    });
    assert.equal(created.status, IssueStatus.REPORTED);
    assert.equal(created.assignedDepartment, MunicipalDepartment.PARKS);
    assert.ok(created.trackingCode.startsWith('CR-'));
    assert.equal('reporterName' in created, false);
    assert.equal('reporterContact' in created, false);

    const stored = JSON.parse(await fs.readFile(storePath, 'utf-8')) as {
      issues: Array<Record<string, unknown>>;
      privateContacts: Record<string, { reporterName?: string; reporterContact?: string }>;
    };
    assert.equal('reporterName' in stored.issues[0], false);
    assert.equal(stored.privateContacts[created.id].reporterName, 'Private Reporter');
    assert.equal(stored.privateContacts[created.id].reporterContact, 'private@example.test');

    const updated = await store.updateIssue(created.id, {
      status: IssueStatus.RESOLVED,
      adminNotes: 'Forestry crew cleared debris.',
    });
    assert.ok(updated);
    assert.equal(updated.status, IssueStatus.RESOLVED);
    assert.ok(updated.resolvedAt);
    assert.equal(updated.statusHistory.length, 2);

    // Reload from disk with fresh IssueStore instance to confirm persistence
    const reloadedStore = new IssueStore(storePath);
    const reloaded = await reloadedStore.getIssueById(created.id);
    assert.ok(reloaded);
    assert.equal(reloaded.status, IssueStatus.RESOLVED);
    assert.equal(reloaded.adminNotes, 'Forestry crew cleared debris.');
    assert.equal('reporterContact' in reloaded, false);

    const legacy = JSON.parse(await fs.readFile(storePath, 'utf-8')) as {
      issues: Array<Record<string, unknown>>;
      privateContacts?: Record<string, { reporterName?: string; reporterContact?: string }>;
    };
    legacy.issues[0].reporterName = 'Legacy Private Reporter';
    legacy.issues[0].reporterContact = 'legacy@example.test';
    delete legacy.privateContacts;
    await fs.writeFile(storePath, JSON.stringify(legacy), 'utf-8');

    const migratedStore = new IssueStore(storePath);
    const migratedIssue = await migratedStore.getIssueById(created.id);
    const migrated = JSON.parse(await fs.readFile(storePath, 'utf-8')) as {
      issues: Array<Record<string, unknown>>;
      privateContacts: Record<string, { reporterName?: string; reporterContact?: string }>;
    };
    assert.ok(migratedIssue);
    assert.equal('reporterName' in migrated.issues[0], false);
    assert.equal(migrated.privateContacts[created.id].reporterName, 'Legacy Private Reporter');
    assert.equal(migrated.privateContacts[created.id].reporterContact, 'legacy@example.test');

    const deleted = await migratedStore.deleteIssue(created.id);
    assert.equal(deleted, true);
    const afterDelete = await migratedStore.getIssueById(created.id);
    assert.equal(afterDelete, null);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
