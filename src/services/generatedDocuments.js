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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
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

function normalizeRegeneration(input = {}, existing = null) {
  const source = input && typeof input === "object" ? input : {};
  const previous = existing && typeof existing === "object" ? existing : {};
  return {
    method: source.method || previous.method || "POST",
    url: source.url || previous.url || "",
    contentType: source.contentType || previous.contentType || "application/json",
    body: source.body || previous.body || null,
    statusUrlTemplate: source.statusUrlTemplate || previous.statusUrlTemplate || "",
    resultUrlTemplate: source.resultUrlTemplate || previous.resultUrlTemplate || "",
  };
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
    regeneration: normalizeRegeneration(input.regeneration, existing?.regeneration),
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
    let message = "";
    const ct = (response?.headers?.get?.("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      const json = await response.json();
      message = json?.details || json?.error || json?.message || JSON.stringify(json);
    } else {
      message = (await response.text()) || "";
    }
    return humanizeDocumentError(message);
  } catch (error) {
    return humanizeDocumentError(String(error?.message || error));
  }
}

function humanizeDocumentError(message) {
  const text = String(message || "").trim();
  if (/JOB_NOT_FOUND/i.test(text)) {
    return "Cette generation n'est plus disponible cote serveur. Si le paiement avait ete valide, relancez la generation depuis la page du document : le paiement deja consomme sera accepte si l'ancien job a ete perdu.";
  }
  if (/RESULT_EXPIRED/i.test(text)) {
    return "Le fichier temporaire a expire cote serveur. Relancez la generation depuis votre compte pour recuperer un nouveau fichier sans repayer si le job precedent a ete perdu.";
  }
  return text;
}

export function isRecoverableLostJobError(errorOrMessage) {
  const message = String(errorOrMessage?.message || errorOrMessage || "");
  return /JOB_NOT_FOUND|RESULT_EXPIRED|n'est plus disponible cote serveur|fichier temporaire a expire/i.test(message);
}

function fillJobTemplate(template, jobId) {
  return String(template || "").replace(/\{jobId\}/g, encodeURIComponent(jobId));
}

function fallbackJobUrls(documentType, apiBase, jobId) {
  const base = normalizeBase(apiBase);
  const encoded = encodeURIComponent(jobId);
  if (documentType === "businessplan" || documentType === "businessplan_rewrite") {
    return {
      statusUrl: `${base}/generate-business-plan/premium/jobs/${encoded}`,
      resultUrl: `${base}/generate-business-plan/premium/jobs/${encoded}/result`,
    };
  }
  if (documentType === "memoire" || documentType === "licence_memoire") {
    return {
      statusUrl: `${base}/generate-academic/licence-memoire/jobs/${encoded}`,
      resultUrl: `${base}/generate-academic/licence-memoire/jobs/${encoded}/result`,
    };
  }
  if (documentType === "ngo_project") {
    return {
      statusUrl: `${base}/generate-ngo-project/premium/jobs/${encoded}`,
      resultUrl: `${base}/generate-ngo-project/premium/jobs/${encoded}/result`,
    };
  }
  if (documentType === "grants_management") {
    return {
      statusUrl: `${base}/generate-grants-management/jobs/${encoded}`,
      resultUrl: `${base}/generate-grants-management/jobs/${encoded}/result`,
    };
  }
  if (documentType === "excel_app") {
    return {
      statusUrl: `${base}/generate-excel-app/jobs/${encoded}`,
      resultUrl: `${base}/generate-excel-app/jobs/${encoded}/result`,
    };
  }
  return { statusUrl: "", resultUrl: "" };
}

export async function refreshGeneratedDocument(record) {
  if (!record?.statusUrl) throw new Error("URL de statut manquante.");
  const response = await fetch(record.statusUrl, { headers: generationHeaders() });
  if (!response.ok) {
    const message = (await readResponseError(response)) || `HTTP ${response.status}`;
    const error = new Error(message);
    if (isRecoverableLostJobError(message)) error.code = "RECOVERABLE_LOST_JOB";
    throw error;
  }
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

export async function regenerateGeneratedDocument(record, { onProgress } = {}) {
  const regen = normalizeRegeneration(record?.regeneration);
  if (!regen.url || !regen.body) {
    throw new Error(
      "Ce document ne contient pas encore les donnees necessaires pour une regeneration automatique. Relancez-le depuis sa page d'origine."
    );
  }
  if (!record?.paymentOrderNumber) {
    throw new Error("Numero de paiement introuvable pour relancer la generation sans repaiement.");
  }

  onProgress?.({ progress: 8, label: "Relance de la generation..." });
  const headers = generationHeaders({
    "Content-Type": regen.contentType || "application/json",
    "X-Payment-Order": record.paymentOrderNumber,
  });

  const response = await fetch(regen.url, {
    method: regen.method || "POST",
    headers,
    body: JSON.stringify(regen.body),
  });

  if (!response.ok) {
    throw new Error((await readResponseError(response)) || `HTTP ${response.status}`);
  }

  const started = await response.json().catch(() => null);
  const jobId = started?.jobId;
  if (!jobId) throw new Error("La regeneration a demarre mais le backend n'a pas retourne de jobId.");

  onProgress?.({ progress: 18, label: "Nouveau job cree, generation en cours..." });
  const fallback = fallbackJobUrls(record.documentType, record.apiBase, jobId);
  const patch = {
    jobId,
    status: "queued",
    statusUrl: fillJobTemplate(regen.statusUrlTemplate, jobId) || fallback.statusUrl,
    resultUrl: fillJobTemplate(regen.resultUrlTemplate, jobId) || fallback.resultUrl,
    error: null,
    doneAt: null,
    downloadedAt: null,
  };
  const next = updateGeneratedDocument(record.id || record.jobId, patch) || { ...record, ...patch, updatedAt: nowIso() };
  try {
    await patchRemote(next, patch);
  } catch {
    // Local cache remains usable; remote sync will retry later.
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
