import {
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
} from "node:crypto";

const ISSUER = "https://token.actions.githubusercontent.com";
const DEFAULT_AUDIENCE = "pal-catalog-check-pro-monitor";
const REPOSITORY = "enricoaboujaoude-droid/practical-automation-lab";
const REF = "refs/heads/main";
const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/pal-pro-monitoring.yml@${REF}`;
const MAX_TOKEN_AGE_SECONDS = 10 * 60;
const JWKS_CACHE_MS = 6 * 60 * 60 * 1000;

type JwtHeader = {
  alg?: string;
  kid?: string;
};

type JwtClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  repository?: string;
  ref?: string;
  event_name?: string;
  workflow_ref?: string;
};

type Jwk = {
  kid?: string;
  kty?: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
};

let jwksCache:
  | {
      expiresAt: number;
      keys: Jwk[];
    }
  | null = null;

function decodeJsonPart<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function audienceMatches(aud: JwtClaims["aud"], expected: string) {
  if (Array.isArray(aud)) return aud.includes(expected);
  return aud === expected;
}

export function validateGithubOidcClaims(
  claims: JwtClaims,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const audience =
    String(process.env.PAL_PRO_GITHUB_OIDC_AUDIENCE || DEFAULT_AUDIENCE).trim();

  if (claims.iss !== ISSUER) return false;
  if (!audienceMatches(claims.aud, audience)) return false;
  if (claims.repository !== REPOSITORY) return false;
  if (claims.ref !== REF) return false;
  if (claims.workflow_ref !== WORKFLOW_REF) return false;
  if (!["schedule", "workflow_dispatch"].includes(String(claims.event_name || ""))) {
    return false;
  }

  if (!claims.exp || claims.exp <= nowSeconds) return false;
  if (claims.nbf && claims.nbf > nowSeconds + 30) return false;
  if (!claims.iat || claims.iat > nowSeconds + 30) return false;
  if (nowSeconds - claims.iat > MAX_TOKEN_AGE_SECONDS) return false;

  return true;
}

async function getJwks() {
  if (jwksCache && jwksCache.expiresAt > Date.now()) {
    return jwksCache.keys;
  }

  const configResponse = await fetch(
    `${ISSUER}/.well-known/openid-configuration`,
    { headers: { accept: "application/json" } },
  );
  if (!configResponse.ok) {
    throw new Error("Unable to load GitHub OIDC configuration.");
  }

  const config = await configResponse.json();
  const jwksUri = String(config.jwks_uri || "");
  if (!jwksUri.startsWith("https://token.actions.githubusercontent.com/")) {
    throw new Error("Unexpected GitHub OIDC JWKS endpoint.");
  }

  const jwksResponse = await fetch(jwksUri, {
    headers: { accept: "application/json" },
  });
  if (!jwksResponse.ok) {
    throw new Error("Unable to load GitHub OIDC signing keys.");
  }

  const jwks = await jwksResponse.json();
  const keys = Array.isArray(jwks.keys) ? (jwks.keys as Jwk[]) : [];
  jwksCache = {
    expiresAt: Date.now() + JWKS_CACHE_MS,
    keys,
  };
  return keys;
}

export async function verifyGithubOidcToken(token: string) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return false;

  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  let header: JwtHeader;
  let claims: JwtClaims;

  try {
    header = decodeJsonPart<JwtHeader>(encodedHeader);
    claims = decodeJsonPart<JwtClaims>(encodedClaims);
  } catch {
    return false;
  }

  if (header.alg !== "RS256" || !header.kid) return false;
  if (!validateGithubOidcClaims(claims)) return false;

  const keys = await getJwks();
  const jwk = keys.find(
    (entry) =>
      entry.kid === header.kid &&
      entry.kty === "RSA" &&
      (!entry.alg || entry.alg === "RS256"),
  );
  if (!jwk) return false;

  try {
    const publicKey = createPublicKey({
      key: jwk as JsonWebKey,
      format: "jwk",
    });
    return verifySignature(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedClaims}`),
      publicKey,
      Buffer.from(encodedSignature, "base64url"),
    );
  } catch {
    return false;
  }
}

export function verifySharedSecretAuthorization(request: Request) {
  const expected = String(process.env.PAL_PRO_CRON_SECRET || "");
  if (!expected) return false;

  const supplied = String(request.headers.get("authorization") || "").replace(
    /^Bearer\s+/i,
    "",
  );

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);

  if (expectedBuffer.length !== suppliedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function authorizeProRunner(request: Request) {
  if (verifySharedSecretAuthorization(request)) return true;

  const bearer = String(request.headers.get("authorization") || "").replace(
    /^Bearer\s+/i,
    "",
  );
  return verifyGithubOidcToken(bearer);
}
