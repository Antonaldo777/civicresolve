import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { IssueStore } from '../store/issueStore.ts';
import { requireCivicAdministrator } from '../auth.ts';
import { createIssuesRouter } from './issues.ts';

test('public issue reads stay available while AI and mutation routes require authentication', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'civicresolve-api-'));
  const app = express();
  const store = new IssueStore(path.join(tempDir, 'issues.json'));
  app.use(express.json());
  app.use('/api', createIssuesRouter(store));
  app.get('/test-admin', (req, _res, next) => {
    req.civicUser = {
      uid: 'resident-1',
      email: 'resident@example.test',
      isAdmin: false,
    };
    next();
  }, requireCivicAdministrator, (_req, res) => {
    res.sendStatus(204);
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const publicResponse = await fetch(`${baseUrl}/api/issues`);
    assert.equal(publicResponse.status, 200);
    const publicPayload = (await publicResponse.json()) as {
      issues: Array<{ id: string; adminNotes?: string }>;
    };
    assert.ok(publicPayload.issues.length > 0);
    assert.ok(publicPayload.issues.every((issue) => !('adminNotes' in issue)));

    const detailResponse = await fetch(
      `${baseUrl}/api/issues/${encodeURIComponent(publicPayload.issues[0].id)}`,
    );
    assert.equal(detailResponse.status, 200);
    const detailPayload = (await detailResponse.json()) as {
      issue: { adminNotes?: string };
    };
    assert.equal('adminNotes' in detailPayload.issue, false);

    const exportResponse = await fetch(`${baseUrl}/api/issues/export`);
    assert.equal(exportResponse.status, 200);
    const csv = await exportResponse.text();
    assert.equal(csv.includes('Admin Notes'), false);

    const protectedPaths = [
      ['/api/ai/analyze', { method: 'POST', body: '{}' }],
      ['/api/ai/chat', { method: 'POST', body: '{}' }],
      ['/api/issues', { method: 'POST', body: '{}' }],
      ['/api/issues/test-1', { method: 'PATCH', body: '{}' }],
      ['/api/issues/test-1', { method: 'DELETE' }],
      ['/api/issues/test-1/comments', { method: 'POST', body: '{}' }],
      ['/api/issues/test-1/endorse', { method: 'POST', body: '{}' }],
    ] as const;

    for (const [pathname, init] of protectedPaths) {
      const response = await fetch(`${baseUrl}${pathname}`, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
      });
      assert.equal(response.status, 401, `${init.method} ${pathname} must require authentication`);
      const body = (await response.json()) as { code?: string };
      assert.equal(body.code, 'AUTH_REQUIRED');
    }

    const adminOnlyResponse = await fetch(`${baseUrl}/test-admin`);
    assert.equal(adminOnlyResponse.status, 403);
  } finally {
    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
});
