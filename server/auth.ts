import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Request, RequestHandler } from 'express';

interface FirebaseTokenClaims {
  aud?: unknown;
  email?: unknown;
  email_verified?: unknown;
  exp?: unknown;
  iat?: unknown;
  iss?: unknown;
  name?: unknown;
  sub?: unknown;
  admin?: unknown;
}

interface FirebaseJwk {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
}

interface FirebaseJwks {
  keys: FirebaseJwk[];
}

interface CachedJwks {
  keys: FirebaseJwk[];
  expiresAt: number;
}

export interface AuthenticatedCivicUser {
  uid: string;
  email: string;
  name?: string;
  isAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      civicUser?: AuthenticatedCivicUser;
    }
  }
}

class InvalidFirebaseTokenError extends Error {}

let cachedJwks: CachedJwks | undefined;
let jwksRequest: Promise<FirebaseJwk[]> | undefined;

function getFirebaseProjectId(): string {
  const configuredProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (configuredProjectId) {
    return configuredProjectId;
  }

  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      projectId?: unknown;
    };
    if (typeof config.projectId === 'string' && config.projectId.trim()) {
      return config.projectId.trim();
    }
  } catch {
    throw new Error('Firebase project configuration is unavailable.');
  }

  throw new Error('FIREBASE_PROJECT_ID is not configured.');
}

async function getFirebaseJwks(forceRefresh = false): Promise<FirebaseJwk[]> {
  if (forceRefresh) {
    cachedJwks = undefined;
  }
  if (cachedJwks && cachedJwks.expiresAt > Date.now()) {
    return cachedJwks.keys;
  }
  if (jwksRequest) {
    return jwksRequest;
  }

  jwksRequest = (async () => {
    const response = await fetch(
      'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) {
      throw new Error(`Firebase signing-key service returned ${response.status}.`);
    }

    const jwks = (await response.json()) as FirebaseJwks;
    if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) {
      throw new Error('Firebase signing-key service returned no keys.');
    }

    const cacheControl = response.headers.get('cache-control') ?? '';
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
    const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
    cachedJwks = {
      keys: jwks.keys,
      expiresAt: Date.now() + Math.max(60, Math.min(maxAgeSeconds, 86400)) * 1000,
    };
    return jwks.keys;
  })();

  try {
    return await jwksRequest;
  } finally {
    jwksRequest = undefined;
  }
}

function decodeJsonSegment<T>(segment: string): T {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
  } catch {
    throw new InvalidFirebaseTokenError('Malformed Firebase ID token.');
  }
}

export async function verifyFirebaseIdToken(token: string): Promise<AuthenticatedCivicUser> {
  if (!token || token.length > 8192) {
    throw new InvalidFirebaseTokenError('Firebase ID token is missing or too large.');
  }
  const segments = token.split('.');
  if (segments.length !== 3) {
    throw new InvalidFirebaseTokenError('Malformed Firebase ID token.');
  }

  const header = decodeJsonSegment<{ alg?: unknown; kid?: unknown }>(segments[0]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new InvalidFirebaseTokenError('Unsupported Firebase ID token signature.');
  }

  const projectId = getFirebaseProjectId();
  let jwks = await getFirebaseJwks();
  let jwk = jwks.find((key) => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) {
    jwks = await getFirebaseJwks(true);
    jwk = jwks.find((key) => key.kid === header.kid && key.kty === 'RSA');
  }
  if (!jwk) {
    throw new InvalidFirebaseTokenError('Unknown Firebase ID token signing key.');
  }

  let signature: Buffer;
  try {
    signature = Buffer.from(segments[2], 'base64url');
  } catch {
    throw new InvalidFirebaseTokenError('Malformed Firebase ID token signature.');
  }
  const publicKey = createPublicKey({
    key: { kty: jwk.kty, n: jwk.n, e: jwk.e },
    format: 'jwk',
  });
  const validSignature = verifySignature(
    'RSA-SHA256',
    Buffer.from(`${segments[0]}.${segments[1]}`),
    publicKey,
    signature,
  );
  if (!validSignature) {
    throw new InvalidFirebaseTokenError('Invalid Firebase ID token signature.');
  }

  const claims = decodeJsonSegment<FirebaseTokenClaims>(segments[1]);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const uid = typeof claims.sub === 'string' ? claims.sub : '';
  const email = typeof claims.email === 'string' ? claims.email.trim() : '';

  if (
    claims.aud !== projectId ||
    claims.iss !== `https://securetoken.google.com/${projectId}` ||
    !uid ||
    uid.length > 128 ||
    typeof claims.exp !== 'number' ||
    claims.exp <= nowSeconds ||
    typeof claims.iat !== 'number' ||
    claims.iat > nowSeconds + 60 ||
    claims.iat < nowSeconds - 3660 ||
    claims.exp - claims.iat > 3660 ||
    typeof claims.email_verified !== 'boolean'
  ) {
    throw new InvalidFirebaseTokenError('Firebase ID token claims are invalid or expired.');
  }
  if (claims.email_verified !== true || !email) {
    throw new InvalidFirebaseTokenError('A verified email address is required.');
  }

  return {
    uid,
    email,
    name: typeof claims.name === 'string' ? claims.name.slice(0, 100) : undefined,
    isAdmin: claims.admin === true,
  };
}

export const requireVerifiedFirebaseUser: RequestHandler = (req, res, next) => {
  const authorization = req.header('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({
      error: 'Sign in with a verified Google account to continue.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  void verifyFirebaseIdToken(match[1].trim())
    .then((user) => {
      req.civicUser = user;
      next();
    })
    .catch((error: unknown) => {
      if (error instanceof InvalidFirebaseTokenError) {
        res.status(401).json({
          error: error.message,
          code: 'INVALID_AUTH_TOKEN',
        });
        return;
      }

      console.error('[CivicResolve Auth Error]', error);
      res.status(503).json({
        error: 'Authentication could not be verified right now.',
        code: 'AUTH_PROVIDER_UNAVAILABLE',
      });
    });
};

export const requireCivicAdministrator: RequestHandler = (
  req: Request,
  res,
  next,
) => {
  if (!req.civicUser) {
    res.status(401).json({
      error: 'Sign in with a verified Google account to continue.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }
  if (!req.civicUser.isAdmin) {
    res.status(403).json({
      error: 'Administrator access is required for this action.',
      code: 'ADMIN_REQUIRED',
    });
    return;
  }
  next();
};
