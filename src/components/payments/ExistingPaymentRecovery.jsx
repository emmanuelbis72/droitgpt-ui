import React, { useEffect, useState } from "react";
import { fetchPaymentStatus, saveStoredPayment } from "../../services/paymentsApi.js";

const DOCUMENT_LABELS = {
  businessplan: "business plan",
  memoire: "mémoire",
  ngo_project: "projet ONG",
  grants_management: "dossier de financement",
  excel_app: "progiciel Excel",
  businessplan_pack: "pack de plans d'affaires",
};

const TYPE_ALIASES = {
  business_plan: "businessplan",
  bp: "businessplan",
  licence_memoire: "memoire",
  academic: "memoire",
  ngo: "ngo_project",
  project_ong: "ngo_project",
  ong_project: "ngo_project",
  excel: "excel_app",
  pack_bp: "businessplan_pack",
  business_plan_pack: "businessplan_pack",
};

function normalizeDocumentType(value) {
  const raw = String(value || "").trim().toLowerCase();
  return TYPE_ALIASES[raw] || raw;
}

export default function ExistingPaymentRecovery({
  apiBase,
  documentType,
  visible = true,
  disabled = false,
  variant = "light",
  currentOrderNumber = "",
  resetSignal = 0,
  onPaymentReady,
  className = "",
}) {
  const [orderNumber, setOrderNumber] = useState("");
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isDark = variant === "dark";
  const normalizedType = normalizeDocumentType(documentType);
  const documentLabel = DOCUMENT_LABELS[normalizedType] || "document";

  useEffect(() => {
    if (!resetSignal) return;
    setOrderNumber("");
    setMessage("");
    setError("");
  }, [resetSignal]);

  if (!visible) return null;

  async function recoverPayment() {
    const cleanOrder = orderNumber.trim();
    setError("");
    setMessage("");

    if (!cleanOrder) {
      setError("Saisissez le numéro de transaction FlexPay reçu après le paiement.");
      return;
    }

    setChecking(true);
    try {
      const data = await fetchPaymentStatus(apiBase, cleanOrder);
      const payment = data?.payment || null;
      if (!payment?.orderNumber) {
        throw new Error("Transaction introuvable. Vérifiez le numéro saisi.");
      }

      if (payment.status !== "paid") {
        throw new Error("Ce paiement n'est pas encore confirmé par FlexPay.");
      }

      const actualType = normalizeDocumentType(payment.documentType);
      if (actualType && normalizedType && actualType !== normalizedType) {
        throw new Error("Cette transaction correspond à un autre service DroitGPT.");
      }

      saveStoredPayment(normalizedType, payment);
      onPaymentReady?.(payment.orderNumber);
      setMessage(
        payment.consumedAt
          ? "Paiement retrouvé. Relancez la génération; le serveur autorisera la reprise si l'ancien job n'est plus disponible."
          : "Paiement confirmé. Vous pouvez générer ce document sans repayer."
      );
    } catch (err) {
      setError(String(err?.message || err || "Impossible de vérifier ce paiement."));
    } finally {
      setChecking(false);
    }
  }

  const shell = isDark
    ? "border-white/10 bg-slate-950/40 text-slate-100"
    : "border-slate-200 bg-slate-50 text-slate-900";
  const muted = isDark ? "text-slate-400" : "text-slate-600";
  const input = isDark
    ? "border-white/10 bg-slate-950/70 text-slate-50 placeholder:text-slate-500"
    : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400";

  return (
    <details className={`rounded-2xl border p-4 ${shell} ${className}`}>
      <summary className="cursor-pointer select-none text-sm font-semibold">
        {currentOrderNumber ? "Paiement prêt à utiliser" : "J'ai déjà payé"}
      </summary>

      <div className="mt-3 space-y-3">
        <p className={`text-xs leading-5 ${muted}`}>
          Si le paiement a été débité mais que le {documentLabel} n'a pas été généré ou téléchargé,
          collez le numéro de transaction FlexPay. Le serveur vérifiera le paiement avant d'autoriser une relance sans nouveau paiement.
        </p>

        {currentOrderNumber ? (
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300">
            Numéro validé : {currentOrderNumber}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
            disabled={disabled || checking}
            className={`rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400/30 disabled:opacity-60 ${input}`}
            placeholder="Numéro de transaction FlexPay"
          />
          <button
            type="button"
            onClick={recoverPayment}
            disabled={disabled || checking || !orderNumber.trim()}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
          >
            {checking ? "Vérification..." : "Utiliser ce paiement"}
          </button>
        </div>

        {message ? (
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300">
            {error}
          </div>
        ) : null}
      </div>
    </details>
  );
}
