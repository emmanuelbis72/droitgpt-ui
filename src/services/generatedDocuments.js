import { generationHeaders } from "../utils/generationClient.js";

const STORAGE_KEY = "droitgpt_generated_documents_v1";
const DEFAULT_API_BASE = "https://businessplan-v9yy.onrender.com";

export const DOCUMENT_TYPE_LABELS = {
  businessplan: "Business Plan",
  businessplan_rewrite: "Business Plan corrigé",
  memoire: "Mémoire",
  ngo_project: "Projet ONG",
  grants_management: "Gestion de subventions",
  excel_app: "Progiciel Excel",
};

function normalizeBase(apiBase) {
  return String(apiBase || import.meta.env.VITE_BP_API_BASE || import.meta.env.VITE_API_BASE || DEFAULT_API_BASE).replace(/\/$/, "");
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeAll(rows) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, 300)));
  } catch {
    // Local cache only; server remains the source of truth.
  }
}

function nowIso() {
  return new Date().toISOString();
}

function sortRows(rows = []) {
  return rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function buildRecord(input = {}, existing = null) {
  const id = input.id || existing?.id || `${input.documentType || existing?.documentType || "document"}:${input.jobId || existing?.jobId || Date.now()}`;
  return {
    id,
    documentType: input.documentType || existing?.documentType || "document",
    label: input.label || existing?.label || DOCUMENT_TYPE_LABELS[input.documentType] || "Document",
    title: input.title || existing?.title || "Document en génération",
    fileName: input.fileName || existing?.fileName || "document.pdf",
    jobId: input.jobId || existing?.jobId || "",
    status: input.status || existing?.status || "queued",
    statusUrl: input.statusUrl || existing?.statusUrl || "",
    resultUrl: input.resultUrl || existing?.resultUrl || "",
    apiBase: input.apiBase || existing?.apiBase || normalizeBase(),
    paymentOrderNumber: input.paymentOrderNumber || existing?.paymentOrderNumber || "",
    createdAt: existing?.createdAt || input.createdAt || nowIso(),
    updatedAt: nowIso(),
    doneAt: input.doneAt || existing?.doneAt || null,
    downloadedAt: input.downloadedAt || existing?.downloadedAt || null,
    error: input.error || existing?.error || null,
  };
}

async function readJsonResponse(response) {
  const text = await response.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const details = json?.details || json?.error || text || `HTTP ${response.status}`;
    throw new Error(details);
  }

  return json || {};
}

async function saveRemote(record) {
  if (!record?.jobId && !record?.id) return null;
  const response = await fetch(`${normalizeBase(record.apiBase)}/documents`, {
    method: "POST",
    headers: generationHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(record),
  });
  const data = await readJsonResponse(response);
  return data?.document || null;
}

async function patchRemote(recordOrId, patch = {}) {
  const id = typeof recordOrId === "string" ? recordOrId : recordOrId?.id || recordOrId?.jobId;
  const apiBase = typeof recordOrId === "object" ? recordOrId.apiBase : patch.apiBase;
  if (!id) return null;
  const response = await fetch(`${normalizeBase(apiBase)}/documents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: generationHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(patch),
  });
  const data = await readJsonResponse(response);
  return data?.document || null;
}

async function deleteRemote(idOrJobId, apiBase) {
  if (!idOrJobId) return false;
  const response = await fetch(`${normalizeBase(apiBase)}/documents/${encodeURIComponent(idOrJobId)}`, {
    method: "DELETE",
    headers: generationHeaders(),
  });
  const data = await readJsonResponse(response);
  return Boolean(data?.removed);
}

async function clearRemote(apiBase) {
  const response = await fetch(`${normalizeBase(apiBase)}/documents`, {
    method: "DELETE",
    headers: generationHeaders(),
  });
  return readJsonResponse(response);
}

export function listGeneratedDocuments() {
  return sortRows(readAll());
}

export async function fetchGeneratedDocuments(apiBase) {
  const response = await fetch(`${normalizeBase(apiBase)}/documents`, {
    headers: generationHeaders(),
  });
  const data = await readJsonResponse(response);
  const documents = Array.isArray(data?.documents) ? data.documents : [];
  writeAll(documents);
  return sortRows(documents);
}

export async function syncGeneratedDocuments(apiBase) {
  const localRows = readAll();
  for (const record of localRows) {
    try {
      await saveRemote({ ...record, apiBase: record.apiBase || normalizeBase(apiBase) });
    } catch {
      // Best effort migration from old browser-only history.
    }
  }
  return fetchGeneratedDocuments(apiBase);
}

export function upsertGeneratedDocument(input = {}) {
  if (!input.jobId || !input.statusUrl || !input.resultUrl) return null;
  const rows = readAll();
  const id = input.id || `${input.documentType || "document"}:${input.jobId}`;
  const idx = rows.findIndex((row) => row.id === id || row.jobId === input.jobId);
  const existing = idx >= 0 ? rows[idx] : null;
  const record = buildRecord({ ...input, id }, existing);

  if (idx >= 0) rows[idx] = { ...existing, ...record };
  else rows.unshift(record);
  writeAll(rows);

  void saveRemote(record).catch((error) => {
    console.warn("[DOCUMENTS] remote save failed:", String(error?.message || error));
  });

  return record;
}

export function updateGeneratedDocument(jobIdOrId, patch = {}) {
  const rows = readAll();
  const idx = rows.findIndex((row) => row.id === jobIdOrId || row.jobId === jobIdOrId);
  if (idx < 0) return null;
  rows[idx] = { ...rows[idx], ...patch, updatedAt: nowIso() };
  writeAll(rows);

  void patchRemote(rows[idx], patch).catch((error) => {
    console.warn("[DOCUMENTS] remote patch failed:", String(error?.message || error));
  });

  return rows[idx];
}

export function removeGeneratedDocument(jobIdOrId) {
  const rows = readAll();
  const existing = rows.find((row) => row.id === jobIdOrId || row.jobId === jobIdOrId);
  writeAll(rows.filter((row) => row.id !== jobIdOrId && row.jobId !== jobIdOrId));

  if (existing) {
    void deleteRemote(existing.id || existing.jobId, existing.apiBase).catch((error) => {
      console.warn("[DOCUMENTS] remote delete failed:", String(error?.message || error));
    });
  }
}

export function clearGeneratedDocuments(apiBase) {
  writeAll([]);
  void clearRemote(apiBase).catch((error) => {
    console.warn("[DOCUMENTS] remote clear failed:", String(error?.message || error));
  });
}

export async function readResponseError(response) {
  try {
    const ct = (response?.headers?.get?.("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      const json = await response.json();
      return json?.details || json?.error || json?.message || JSON.stringify(json);
    }
    return (await response.text()) || "";
  } catch (error) {
    return String(error?.message || error);
  }
}

export async function refreshGeneratedDocument(record) {
  if (!record?.statusUrl) throw new Error("URL de statut manquante.");
  const response = await fetch(record.statusUrl, { headers: generationHeaders() });
  if (!response.ok) throw new Error((await readResponseError(response)) || `HTTP ${response.status}`);
  const status = await response.json();
  const patch = {
    status: status.status || record.status,
    error: status.error || null,
    doneAt: status.doneAt || record.doneAt || null,
  };
  const next = updateGeneratedDocument(record.jobId || record.id, patch) || { ...record, ...patch, updatedAt: nowIso() };
  try {
    await patchRemote(next, patch);
  } catch {
    // Local cache remains updated; server sync will retry later.
  }
  return next;
}

export async function downloadGeneratedDocument(record) {
  if (!record?.resultUrl) throw new Error("URL de téléchargement manquante.");
  const response = await fetch(record.resultUrl, { headers: generationHeaders() });
  if (!response.ok) throw new Error((await readResponseError(response)) || `HTTP ${response.status}`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = record.fileName || "document.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  const patch = { status: "done", downloadedAt: nowIso() };
  const next = updateGeneratedDocument(record.jobId || record.id, patch);
  try {
    await patchRemote(next || record, patch);
  } catch {
    // ignore sync failure
  }
  return next;
}
