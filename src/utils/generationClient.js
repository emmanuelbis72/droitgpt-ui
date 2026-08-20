const STORAGE_KEY = "droitgpt_generation_client_id";

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

export function generationHeaders(extra = {}) {
  return {
    ...extra,
    "X-Generation-User": getGenerationClientId(),
  };
}
