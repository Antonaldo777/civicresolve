import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { verifyFirebaseIdToken } from './auth.ts';

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

test('Firebase ID tokens require a valid signature and project claims', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  const kid = 'civicresolve-test-key';
  const previousProjectId = process.env.FIREBASE_PROJECT_ID;
  const previousFetch = globalThis.fetch;
  process.env.FIREBASE_PROJECT_ID = 'civicresolve-test-project';
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        keys: [{ ...jwk, kid, kty: 'RSA' }],
      }),
      { headers: { 'cache-control': 'max-age=300' } },
    );

  const now = Math.floor(Date.now() / 1000);
  const header = encodeSegment({ alg: 'RS256', kid });
  const claimValues = {
    aud: 'civicresolve-test-project',
    email: 'admin@example.test',
    email_verified: true,
    exp: now + 3600,
    iat: now,
    iss: 'https://securetoken.google.com/civicresolve-test-project',
    sub: 'firebase-user-1',
    admin: true,
  };
  const claims = encodeSegment(claimValues);
  const signedInput = `${header}.${claims}`;
  const signature = sign('RSA-SHA256', Buffer.from(signedInput), privateKey).toString(
    'base64url',
  );
  const token = `${signedInput}.${signature}`;

  try {
    const user = await verifyFirebaseIdToken(token);
    assert.deepEqual(user, {
      uid: 'firebase-user-1',
      email: 'admin@example.test',
      name: undefined,
      isAdmin: true,
    });

    const wrongAudienceClaims = encodeSegment({
      ...claimValues,
      aud: 'wrong-project',
    });
    const wrongAudienceInput = `${header}.${wrongAudienceClaims}`;
    const wrongAudienceSignature = sign(
      'RSA-SHA256',
      Buffer.from(wrongAudienceInput),
      privateKey,
    ).toString('base64url');
    await assert.rejects(
      verifyFirebaseIdToken(`${wrongAudienceInput}.${wrongAudienceSignature}`),
      /Firebase ID token claims are invalid/,
    );
    await assert.rejects(verifyFirebaseIdToken('malformed-token'));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousProjectId === undefined) {
      delete process.env.FIREBASE_PROJECT_ID;
    } else {
      process.env.FIREBASE_PROJECT_ID = previousProjectId;
    }
  }
});
