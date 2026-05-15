import { BP_API_BASE } from "../config/api.js";

const GRANTS_BASE = `${String(BP_API_BASE || "https://businessplan-v9yy.onrender.com").replace(/\/$/, "")}/grants`;

async function request(path, options = {}) {
  const response = await fetch(`${GRANTS_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? safeJson(text) : {};
  if (!response.ok) {
    throw new Error(data.error || data.details || `HTTP ${response.status}`);
  }
  return data;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function listGrantOpportunities(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, value);
  });
  return request(`/opportunities?${params.toString()}`);
}

export function getGrantOpportunity(id) {
  return request(`/opportunities/${encodeURIComponent(id)}`);
}

export function semanticSearchGrants(q, filters = {}) {
  const params = new URLSearchParams();
  params.set("q", q);
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, value);
  });
  return request(`/opportunities/semantic?${params.toString()}`);
}

export function searchGrants(payload) {
  return request("/search", { method: "POST", body: JSON.stringify(payload) });
}

export function crawlGrants(payload, cronSecret) {
  return request("/crawl", {
    method: "POST",
    headers: cronSecret ? { "X-Cron-Secret": cronSecret } : {},
    body: JSON.stringify(payload),
  });
}

export function getGrantJob(id) {
  return request(`/jobs/${encodeURIComponent(id)}`);
}

export function getGrantJobResult(id) {
  return request(`/jobs/${encodeURIComponent(id)}/result`);
}

export function listGrantSources() {
  return request("/sources");
}

export function addGrantSource(payload) {
  return request("/sources", { method: "POST", body: JSON.stringify(payload) });
}

export function updateGrantStatus(id, status) {
  return request(`/opportunities/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function getGrantAdvice(id, userContext = {}) {
  return request(`/opportunities/${encodeURIComponent(id)}/advice`, {
    method: "POST",
    body: JSON.stringify({ userContext }),
  });
}
