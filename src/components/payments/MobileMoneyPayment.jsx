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
  openSignal = 0,
  onPaymentReady,
  onRequirementChange,
  launcherTitle = "Paiement Mobile Money",
  launcherHint = "Cliquez ici pour payer ou vérifier votre transaction.",
  paidMessage = "Paiement confirmé. Vous pouvez lancer la génération.",
  className = "",
}) {
  const [config, setConfig] = useState(null);
  const [phone, setPhone] = useState("");
  const [payment, setPayment] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [starting, setStarting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const docConfig = config?.documents?.[documentType] || null;
  const requiresPayment = Boolean(config?.requiresPayment);
  const isDark = variant === "dark";

  const shell = isDark
    ? "border-white/10 bg-slate-950/50 text-slate-50 hover:bg-slate-900/70"
    : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50";
  const muted = isDark ? "text-slate-300" : "text-slate-600";
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
    setModalOpen(false);
    onPaymentReady?.("");
  }, [resetSignal]);

  useEffect(() => {
    if (!openSignal || !requiresPayment) return;
    setModalOpen(true);
  }, [openSignal, requiresPayment]);

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
        if (next.status === "paid") setModalOpen(false);
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

  const statusBadge = payment?.status ? STATUS_LABELS[payment.status] || payment.status : "Paiement à effectuer";
  const amount = formatMoney(docConfig?.amount, docConfig?.currency || config?.currency);

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${shell} ${className}`}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold">{launcherTitle}</div>
            <div className={`mt-1 text-sm ${muted}`}>
              {docConfig?.label || "Document premium"} : {amount}
            </div>
            <div className={`mt-1 text-xs ${muted}`}>{launcherHint}</div>
          </div>
          <span
            className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${
              payment?.status === "paid"
                ? "border border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                : payment?.status === "failed"
                  ? "border border-rose-400/30 bg-rose-500/15 text-rose-300"
                  : "border border-amber-400/30 bg-amber-500/15 text-amber-300"
            }`}
          >
            {statusBadge}
          </span>
        </div>
      </button>

      {modalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <div className={`w-full max-w-lg rounded-3xl border p-5 shadow-2xl ${isDark ? "border-white/10 bg-slate-950 text-slate-50" : "border-slate-200 bg-white text-slate-900"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Paiement sécurisé</div>
                <h2 className="mt-1 text-xl font-semibold">Payer par Mobile Money</h2>
                <p className={`mt-1 text-sm ${muted}`}>
                  {docConfig?.label || "Document premium"} - {amount}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${isDark ? "border-white/10 text-slate-300" : "border-slate-200 text-slate-600"}`}
              >
                Fermer
              </button>
            </div>

            {!config?.configured ? (
              <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                Le paiement Mobile Money n'est pas encore configuré côté backend.
              </div>
            ) : null}

            {payment?.orderNumber ? (
              <div className={`mt-5 rounded-2xl border px-4 py-4 text-sm ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
                <div className="font-medium">Paiement Mobile Money enregistré</div>
                <div className={`mt-1 ${muted}`}>
                  {payment.status === "paid"
                    ? paidMessage
                    : payment.status === "failed"
                      ? "Transaction échouée. Lancez un nouveau paiement."
                      : "Validez le push Mobile Money sur votre téléphone, puis vérifiez le statut."}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
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
              <div className="mt-5 space-y-3">
                <label className="block text-sm font-medium">
                  Numéro Mobile Money
                  <span className={`mt-1 block text-xs font-normal ${muted}`}>
                    Le préfixe pays 243 est ajouté automatiquement. Entrez le numéro local sans zéro initial, par exemple 997123456.
                  </span>
                  <div className="mt-2 flex overflow-hidden rounded-xl border border-emerald-400/30">
                    <span className={`flex items-center px-3 text-sm font-semibold ${isDark ? "bg-emerald-500/10 text-emerald-200" : "bg-emerald-50 text-emerald-800"}`}>
                      243
                    </span>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={disabled || starting || !config?.configured}
                      className={`w-full px-3 py-3 text-sm outline-none ${isDark ? "bg-slate-950/70 text-slate-50 placeholder:text-slate-500" : "bg-white text-slate-900 placeholder:text-slate-400"}`}
                      placeholder="997123456"
                      inputMode="numeric"
                    />
                  </div>
                </label>
                <button
                  type="button"
                  onClick={startPayment}
                  disabled={disabled || starting || !phone.trim() || !config?.configured}
                  className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 disabled:opacity-60"
                >
                  {starting ? "Traitement du paiement..." : "Effectuer le paiement par Mobile Money"}
                </button>
              </div>
            )}

            {error ? <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
