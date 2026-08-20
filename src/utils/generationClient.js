const STORAGE_KEY = "droitgpt_generation_client_id";
const AUTH_TOKEN_KEY = "droitgpt_access_token";

function createClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getGenerationClientId() {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const next = createClientId();
    localStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return createClientId();
  }
}

export function getAccessToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function decodeJwtPayload(token) {
  try {
    const payload = String(token || "").split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function getGenerationUserIdentity() {
  const token = getAccessToken();
  const payload = decodeJwtPayload(token);
  if (payload?.sub) {
    return {
      token,
      key: `user:${payload.sub}`,
      userId: String(payload.sub || ""),
      email: String(payload.email || ""),
    };
  }
  return {
    token,
    key: getGenerationClientId(),
    userId: "",
    email: "",
  };
}

export function generationHeaders(extra = {}) {
  const identity = getGenerationUserIdentity();
  return {
    ...extra,
    ...(identity.token ? { Authorization: `Bearer ${identity.token}` } : {}),
    "X-Generation-User": identity.key,
    "X-DroitGPT-User": identity.key,
    ...(identity.userId ? { "X-User-Id": identity.userId } : {}),
    ...(identity.email ? { "X-User-Email": identity.email } : {}),
  };
}
