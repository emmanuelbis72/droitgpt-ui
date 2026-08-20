const STORAGE_KEY = "droitgpt_generated_documents_v1";

export const DOCUMENT_TYPE_LABELS = {
  businessplan: "Business Plan",
  businessplan_rewrite: "Business Plan corrigé",
  memoire: "Mémoire",
  ngo_project: "Projet ONG",
  grants_management: "Gestion de subventions",
  excel_app: "Progiciel Excel",
};

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, 80)));
  } catch {
    // ignore storage failures
  }
}

function nowIso() {
  return new Date().toISOString();
}

export function listGeneratedDocuments() {
  return readAll().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export function upsertGeneratedDocument(input = {}) {
  if (!input.jobId || !input.statusUrl || !input.resultUrl) return null;
  const rows = readAll();
  const id = input.id || `${input.documentType || "document"}:${input.jobId}`;
  const idx = rows.findIndex((row) => row.id === id || row.jobId === input.jobId);
  const existing = idx >= 0 ? rows[idx] : null;
  const record = {
    id,
    documentType: input.documentType || existing?.documentType || "document",
    label: input.label || existing?.label || DOCUMENT_TYPE_LABELS[input.documentType] || "Document",
    title: input.title || existing?.title || "Document en génération",
    fileName: input.fileName || existing?.fileName || "document.pdf",
    jobId: input.jobId,
    status: input.status || existing?.status || "queued",
    statusUrl: input.statusUrl,
    resultUrl: input.resultUrl,
    apiBase: input.apiBase || existing?.apiBase || "",
    paymentOrderNumber: input.paymentOrderNumber || existing?.paymentOrderNumber || "",
    createdAt: existing?.createdAt || input.createdAt || nowIso(),
    updatedAt: nowIso(),
    doneAt: input.doneAt || existing?.doneAt || null,
    downloadedAt: input.downloadedAt || existing?.downloadedAt || null,
    error: input.error || existing?.error || null,
  };

  if (idx >= 0) rows[idx] = { ...existing, ...record };
  else rows.unshift(record);
  writeAll(rows);
  return record;
}

export function updateGeneratedDocument(jobIdOrId, patch = {}) {
  const rows = readAll();
  const idx = rows.findIndex((row) => row.id === jobIdOrId || row.jobId === jobIdOrId);
  if (idx < 0) return null;
  rows[idx] = { ...rows[idx], ...patch, updatedAt: nowIso() };
  writeAll(rows);
  return rows[idx];
}

export function removeGeneratedDocument(jobIdOrId) {
  const rows = readAll().filter((row) => row.id !== jobIdOrId && row.jobId !== jobIdOrId);
  writeAll(rows);
}

export function clearGeneratedDocuments() {
  writeAll([]);
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
  const response = await fetch(record.statusUrl);
  if (!response.ok) throw new Error((await readResponseError(response)) || `HTTP ${response.status}`);
  const status = await response.json();
  const next = updateGeneratedDocument(record.jobId, {
    status: status.status || record.status,
    error: status.error || null,
    doneAt: status.doneAt || record.doneAt || null,
  });
  return next || { ...record, status: status.status || record.status };
}

export async function downloadGeneratedDocument(record) {
  if (!record?.resultUrl) throw new Error("URL de téléchargement manquante.");
  const response = await fetch(record.resultUrl);
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
  return updateGeneratedDocument(record.jobId, { status: "done", downloadedAt: nowIso() });
}
