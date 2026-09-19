import { generationHeaders } from "../utils/generationClient.js";

const DEFAULT_API_BASE = "https://businessplan-v9yy.onrender.com";

function normalizeBase(apiBase) {
  return String(apiBase || import.meta.env.VITE_BP_API_BASE || import.meta.env.VITE_API_BASE || DEFAULT_API_BASE).replace(/\/$/, "");
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

export async function fetchPaymentConfig(apiBase) {
  const response = await fetch(`${normalizeBase(apiBase)}/payments/config`);
  return readJsonResponse(response);
}

export async function startMobileMoneyPayment(apiBase, payload) {
  const response = await fetch(`${normalizeBase(apiBase)}/payments/mobile-money`, {
    method: "POST",
    headers: generationHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload || {}),
  });
  return readJsonResponse(response);
}

export async function recoverPaymentByPhone(apiBase, payload) {
  const response = await fetch(`${normalizeBase(apiBase)}/payments/recover`, {
    method: "POST",
    headers: generationHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload || {}),
  });
  return readJsonResponse(response);
}

export async function fetchPaymentStatus(apiBase, orderNumber) {
  const response = await fetch(`${normalizeBase(apiBase)}/payments/status/${encodeURIComponent(orderNumber)}`, {
    headers: generationHeaders(),
  });
  return readJsonResponse(response);
}

export function paymentStorageKey(documentType) {
  return `droitgpt_payment_${documentType}`;
}

export function getStoredPayment(documentType) {
  try {
    const raw = localStorage.getItem(paymentStorageKey(documentType));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveStoredPayment(documentType, payment) {
  try {
    if (!payment?.orderNumber) return;
    localStorage.setItem(paymentStorageKey(documentType), JSON.stringify(payment));
  } catch {
    // ignore storage failures
  }
}

export function clearStoredPayment(documentType) {
  try {
    localStorage.removeItem(paymentStorageKey(documentType));
  } catch {
    // ignore storage failures
  }
}
