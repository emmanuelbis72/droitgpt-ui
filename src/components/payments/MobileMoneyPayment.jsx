import React, { useEffect, useMemo, useState } from "react";
import {
  clearStoredPayment,
  fetchPaymentConfig,
  fetchPaymentStatus,
  getStoredPayment,
  saveStoredPayment,
  startMobileMoneyPayment,
} from "../../services/paymentsApi.js";

const STATUS_LABELS = {
  pending: "En attente de validation",
  paid: "Paiement confirmé",
  failed: "Paiement échoué",
  unknown: "Statut à vérifier",
};

function formatMoney(amount, currency) {
  if (!amount) return "Prix non configuré";
  try {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(amount) + ` ${currency || "CDF"}`;
  } catch {
    return `${amount} ${currency || "CDF"}`;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function MobileMoneyPayment({
  apiBase,
  documentType,
  disabled = false,
  variant = "light",
  resetSignal = 0,
  onPaymentReady,
  onRequirementChange,
  className = "",
}) {
  const [config, setConfig] = useState(null);
  const [phone, setPhone] = useState("");
  const [payment, setPayment] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [starting, setStarting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const docConfig = config?.documents?.[documentType] || null;
  const requiresPayment = Boolean(config?.requiresPayment);
  const isDark = variant === "dark";

  const shell = isDark
    ? "border-white/10 bg-slate-950/50 text-slate-50"
    : "border-slate-200 bg-white text-slate-900";
  const muted = isDark ? "text-slate-300" : "text-slate-600";
  const inputClass = isDark
    ? "border-white/10 bg-slate-950/70 text-slate-50 placeholder:text-slate-500"
    : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400";

  const readyOrderNumber = useMemo(() => {
    return payment?.status === "paid" && !payment?.consumedAt ? payment.orderNumber : "";
  }, [payment]);

  useEffect(() => {
    let alive = true;
    setLoadingConfig(true);
    fetchPaymentConfig(apiBase)
      .then((data) => {
        if (!alive) return;
        setConfig(data);
        const required = Boolean(data?.requiresPayment);
        onRequirementChange?.(required);
        if (!required) onPaymentReady?.("");
      })
      .catch((err) => {
        if (!alive) return;
        setError(String(err?.message || err));
        onRequirementChange?.(false);
      })
      .finally(() => {
        if (alive) setLoadingConfig(false);
      });
    return () => {
      alive = false;
    };
  }, [apiBase]);

  useEffect(() => {
    const stored = getStoredPayment(documentType);
    if (stored?.orderNumber) setPayment(stored);
  }, [documentType]);

  useEffect(() => {
    if (!resetSignal) return;
    setPayment(null);
    onPaymentReady?.("");
  }, [resetSignal]);

  useEffect(() => {
    onPaymentReady?.(readyOrderNumber);
  }, [readyOrderNumber]);

  useEffect(() => {
    if (!requiresPayment || !payment?.orderNumber || payment.status === "paid" || payment.status === "failed") return;
    let cancelled = false;

    async function poll() {
      while (!cancelled) {
        await wait(4000);
        if (cancelled) return;
        await checkStatus(payment.orderNumber, { silent: true });
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [requiresPayment, payment?.orderNumber, payment?.status]);

  async function checkStatus(orderNumber = payment?.orderNumber, options = {}) {
    if (!orderNumber) return null;
    if (!options.silent) setError("");
    setChecking(true);
    try {
      const data = await fetchPaymentStatus(apiBase, orderNumber);
      const next = data?.payment || null;
      if (next?.orderNumber) {
        setPayment(next);
        saveStoredPayment(documentType, next);
      }
      return next;
    } catch (err) {
      if (!options.silent) setError(String(err?.message || err));
      return null;
    } finally {
      setChecking(false);
    }
  }

  async function startPayment() {
    setError("");
    setStarting(true);
    try {
      const data = await startMobileMoneyPayment(apiBase, {
        documentType,
        phone,
      });
      const next = data?.payment;
      if (!next?.orderNumber) throw new Error("Numéro de commande manquant dans la réponse FlexPay.");
      setPayment(next);
      saveStoredPayment(documentType, next);
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setStarting(false);
    }
  }

  function resetPayment() {
    clearStoredPayment(documentType);
    setPayment(null);
    onPaymentReady?.("");
  }

  if (loadingConfig) {
    return (
      <div className={`rounded-2xl border p-4 ${shell} ${className}`}>
        <div className={`text-sm ${muted}`}>Vérification du paiement Mobile Money...</div>
      </div>
    );
  }

  if (!requiresPayment) return null;

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${shell} ${className}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-semibold">Paiement Mobile Money requis</div>
          <div className={`mt-1 text-sm ${muted}`}>
            {docConfig?.label || "Document premium"} : {formatMoney(docConfig?.amount, docConfig?.currency || config?.currency)}
          </div>
          <div className={`mt-1 text-xs ${muted}`}>
            Le token FlexPay reste côté serveur. Après validation du push, la génération se débloque automatiquement.
          </div>
        </div>

        {payment?.status ? (
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
              payment.status === "paid"
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/30"
                : payment.status === "failed"
                  ? "bg-rose-500/15 text-rose-300 border border-rose-400/30"
                  : "bg-amber-500/15 text-amber-300 border border-amber-400/30"
            }`}
          >
            {STATUS_LABELS[payment.status] || payment.status}
          </span>
        ) : null}
      </div>

      {!config?.configured ? (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Paiement requis mais FlexPay n'est pas encore configuré côté backend.
        </div>
      ) : null}

      {payment?.orderNumber ? (
        <div className={`mt-4 rounded-xl border px-3 py-3 text-sm ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
          <div className="font-medium">Commande : {payment.orderNumber}</div>
          <div className={`mt-1 ${muted}`}>
            {payment.status === "paid"
              ? "Paiement confirmé. Tu peux générer le document."
              : payment.status === "failed"
                ? "Transaction échouée. Lance un nouveau paiement."
                : "Valide le push Mobile Money sur ton téléphone, puis attends la confirmation."}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => checkStatus(payment.orderNumber)}
              disabled={checking || disabled}
              className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:opacity-60"
            >
              {checking ? "Vérification..." : "Vérifier le statut"}
            </button>
            <button
              type="button"
              onClick={resetPayment}
              disabled={disabled}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
                isDark ? "border-white/10 text-slate-300" : "border-slate-200 text-slate-600"
              }`}
            >
              Nouveau paiement
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={disabled || starting || !config?.configured}
            className={`rounded-xl border px-3 py-2 text-sm outline-none focus:border-emerald-400 ${inputClass}`}
            placeholder="Téléphone: 243XXXXXXXXX ou 0XXXXXXXXX"
          />
          <button
            type="button"
            onClick={startPayment}
            disabled={disabled || starting || !phone.trim() || !config?.configured}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 disabled:opacity-60"
          >
            {starting ? "Envoi..." : "Payer par Mobile Money"}
          </button>
        </div>
      )}

      {error ? <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div> : null}
    </div>
  );
}
