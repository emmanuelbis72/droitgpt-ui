import React, { useEffect, useMemo, useState } from "react";
import {
  clearGeneratedDocuments,
  downloadGeneratedDocument,
  fetchGeneratedDocuments,
  listGeneratedDocuments,
  refreshGeneratedDocument,
  removeGeneratedDocument,
  syncGeneratedDocuments,
} from "../services/generatedDocuments.js";
import { useAuth } from "../auth/AuthContext.jsx";

const DEFAULT_API_BASE = "https://businessplan-v9yy.onrender.com";
const API_BASE = import.meta.env.VITE_BP_API_BASE || import.meta.env.VITE_API_BASE || DEFAULT_API_BASE;

const STATUS_LABELS = {
  queued: "En file",
  running: "En cours",
  done: "Prêt",
  error: "Erreur",
  rejected: "Rejeté",
};

const STATUS_CLASSES = {
  queued: "border-amber-300 bg-amber-50 text-amber-800",
  running: "border-sky-300 bg-sky-50 text-sky-800",
  done: "border-emerald-300 bg-emerald-50 text-emerald-800",
  error: "border-rose-300 bg-rose-50 text-rose-800",
  rejected: "border-rose-300 bg-rose-50 text-rose-800",
};

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

export default function GeneratedDocumentsPage() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState(() => listGeneratedDocuments());
  const [busy, setBusy] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const pendingCount = useMemo(
    () => documents.filter((doc) => ["queued", "running"].includes(doc.status)).length,
    [documents]
  );

  async function reload(options = {}) {
    const remote = options.remote !== false;
    if (!remote) {
      setDocuments(listGeneratedDocuments());
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchGeneratedDocuments(API_BASE);
      setDocuments(rows);
    } catch (error) {
      setMessage(String(error?.message || error));
      setDocuments(listGeneratedDocuments());
    } finally {
      setLoading(false);
    }
  }

  async function refreshOne(doc) {
    setBusy((prev) => ({ ...prev, [doc.id]: "refresh" }));
    setMessage("");
    try {
      await refreshGeneratedDocument(doc);
      await reload();
    } catch (error) {
      setMessage(String(error?.message || error));
    } finally {
      setBusy((prev) => ({ ...prev, [doc.id]: null }));
    }
  }

  async function downloadOne(doc) {
    setBusy((prev) => ({ ...prev, [doc.id]: "download" }));
    setMessage("");
    try {
      let latest = doc;
      if (doc.status !== "done") latest = await refreshGeneratedDocument(doc);
      if (latest.status !== "done") {
        setMessage("Le document n'est pas encore prêt. Réessaie dans quelques minutes.");
        await reload();
        return;
      }
      await downloadGeneratedDocument(latest);
      await reload();
    } catch (error) {
      setMessage(String(error?.message || error));
    } finally {
      setBusy((prev) => ({ ...prev, [doc.id]: null }));
    }
  }

  async function refreshAll() {
    setMessage("");
    for (const doc of listGeneratedDocuments()) {
      if (["queued", "running"].includes(doc.status)) {
        try {
          await refreshGeneratedDocument(doc);
        } catch {
          // keep other documents refreshable
        }
      }
    }
    await reload();
  }

  useEffect(() => {
    let alive = true;
    async function initialLoad() {
      setLoading(true);
      try {
        const rows = await syncGeneratedDocuments(API_BASE);
        if (alive) setDocuments(rows);
      } catch (error) {
        if (alive) {
          setMessage(String(error?.message || error));
          setDocuments(listGeneratedDocuments());
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    void initialLoad();
    window.addEventListener("online", refreshAll);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshAll();
    }, 15000);
    return () => {
      alive = false;
      window.removeEventListener("online", refreshAll);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="min-h-[70vh] rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">DroitGPT</div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Mes documents générés</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Quand une génération démarre, elle continue côté serveur. Si votre connexion coupe ou si l'ordinateur s'éteint,
            reconnectez-vous à votre compte pour vérifier le statut et télécharger le fichier.
          </p>
          {user?.email ? <p className="mt-1 text-xs text-slate-500">Compte : {user.email}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refreshAll}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {loading ? "Chargement..." : "Actualiser"}
          </button>
          {documents.length ? (
            <button
              type="button"
              onClick={() => {
                if (!confirm("Supprimer l'historique des documents de votre compte ?")) return;
                clearGeneratedDocuments(API_BASE);
                void reload();
              }}
              className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
            >
              Vider
            </button>
          ) : null}
        </div>
      </div>

      {pendingCount ? (
        <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          {pendingCount} génération(s) encore en cours. Vous pouvez quitter cette page et revenir plus tard.
        </div>
      ) : null}

      {message ? (
        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div>
      ) : null}

      {!documents.length ? (
        <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <div className="text-lg font-semibold text-slate-900">Aucun document enregistré sur votre compte</div>
          <p className="mt-2 text-sm text-slate-600">
            Lancez une génération depuis Business Plan, Mémoire, Projet ONG ou Excel. Le suivi apparaîtra ici automatiquement.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4">
          {documents.map((doc) => (
            <article key={doc.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                      {doc.label || doc.documentType || "Document"}
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_CLASSES[doc.status] || "border-slate-200 bg-white text-slate-700"}`}>
                      {STATUS_LABELS[doc.status] || doc.status || "Inconnu"}
                    </span>
                  </div>
                  <h2 className="mt-3 truncate text-base font-semibold text-slate-950">{doc.title}</h2>
                  <div className="mt-1 text-xs text-slate-500">
                    Créé : {formatDate(doc.createdAt)} • Mis à jour : {formatDate(doc.updatedAt)}
                  </div>
                  {doc.error ? <div className="mt-2 text-sm text-rose-700">{doc.error}</div> : null}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => refreshOne(doc)}
                    disabled={Boolean(busy[doc.id])}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                  >
                    {busy[doc.id] === "refresh" ? "Vérification..." : "Vérifier"}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadOne(doc)}
                    disabled={Boolean(busy[doc.id])}
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {busy[doc.id] === "download" ? "Téléchargement..." : "Télécharger"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      removeGeneratedDocument(doc.id);
                      void reload();
                    }}
                    disabled={Boolean(busy[doc.id])}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-60"
                  >
                    Retirer
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
