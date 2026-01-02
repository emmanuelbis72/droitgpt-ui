import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import jsPDF from "jspdf";
import { useAuth } from "../auth/AuthContext.jsx";

const API_BASE = "https://droitgpt-indexer.onrender.com";
const ACTIVE_DOC_KEY = "droitgpt_active_document_context";

export default function ChatInterface() {
  const { accessToken, logout } = useAuth();
  const authHeaders = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

  /* =======================
     Utils
  ======================= */
  const normalizeStoredMessages = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((m) => {
        if (m?.from && m?.text) return m;
        if (m?.content && typeof m.isUser === "boolean") {
          return { from: m.isUser ? "user" : "assistant", text: m.content };
        }
        return null;
      })
      .filter(Boolean);
  };

  const escapeHtml = (s) =>
    String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  /* =======================
     State
  ======================= */
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem("chatMessages");
      if (saved) {
        const norm = normalizeStoredMessages(JSON.parse(saved));
        if (norm.length) return norm;
      }
    } catch {}
    return [
      {
        from: "assistant",
        text:
          `👋 <strong>Bienvenue</strong><br/>` +
          `Je suis <strong>DroitGPT</strong>, votre assistant juridique congolais.<br/>` +
          `Décrivez votre situation juridique avec autant de détails que nécessaire 📚⚖️`,
      },
    ];
  });

  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dots, setDots] = useState("");

  // ✅ Document actif (injecté dans le chat)
  const [activeDoc, setActiveDoc] = useState(null);

  const messagesEndRef = useRef(null);
  const location = useLocation();

  /* =======================
     Effects
  ======================= */
  useEffect(() => {
    localStorage.setItem("chatMessages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    let interval;
    if (loading) {
      interval = setInterval(() => {
        setDots((d) => (d.length < 3 ? d + "." : ""));
      }, 500);
    } else {
      setDots("");
    }
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ✅ Récupère le document depuis Analyse.jsx (state) + fallback localStorage
  useEffect(() => {
    const st = location?.state;

    if (st?.fromAnalyse && st?.documentText) {
      const payload = {
        filename: st.filename || "Document analysé",
        documentText: String(st.documentText || ""),
        ts: Date.now(),
      };
      setActiveDoc(payload);
      localStorage.setItem(ACTIVE_DOC_KEY, JSON.stringify(payload));
      return;
    }

    try {
      const raw = localStorage.getItem(ACTIVE_DOC_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.documentText) setActiveDoc(parsed);
      }
    } catch {}
  }, [location]);

  /* =======================
     Helpers
  ======================= */
  const redirectToLogin = () => {
    logout();
    window.location.href = "/login";
  };

  const updateLastAssistantMessage = (text) => {
    setMessages((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].from === "assistant") {
          copy[i] = { ...copy[i], text };
          return copy;
        }
      }
      return [...copy, { from: "assistant", text }];
    });
  };

  /* =======================
     Streaming simulé (effet ChatGPT) — OPTIMISÉ
  ======================= */
  const typeWriterEffect = async (html) => {
    if (!html) return;

    const MAX_DURATION = 2500;
    const PREVIEW = 160;

    const first = html.slice(0, PREVIEW);
    updateLastAssistantMessage(first);

    const remaining = html.slice(PREVIEW);
    if (!remaining) return;

    const MAX_UPDATES = 80;
    const step = Math.max(6, Math.ceil(remaining.length / MAX_UPDATES));
    const delay = Math.max(6, Math.floor(MAX_DURATION / MAX_UPDATES));

    let current = first;
    for (let i = 0; i < remaining.length; i += step) {
      current += remaining.slice(i, i + step);
      updateLastAssistantMessage(current);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, delay));
    }
  };

  // ✅ Contexte doc injecté au backend (sans l’afficher comme message “normal”)
  const buildContextMessage = () => {
    if (!activeDoc?.documentText) return null;
    const title = escapeHtml(activeDoc.filename || "Document");
    const txt = escapeHtml(activeDoc.documentText);

    return {
      from: "assistant",
      text:
        `<strong>📎 CONTEXTE DOCUMENT (${title})</strong><br/>` +
        `<em>Utilise ce texte comme base pour répondre aux questions.</em><br/><br/>` +
        `<div style="white-space:pre-wrap">${txt}</div>`,
      _hiddenContext: true, // juste un flag local, ignoré côté backend
    };
  };

  /* =======================
     Send
  ======================= */
  const handleSend = async () => {
    if (!userInput.trim() || loading) return;

    const input = userInput.trim();
    setUserInput("");
    setLoading(true);

    // affichage dans l’UI
    setMessages((p) => [...p, { from: "user", text: escapeHtml(input) }, { from: "assistant", text: "" }]);

    try {
      const contextMsg = buildContextMessage();

      // ✅ Payload envoyé au backend : on injecte le contexte au début
      const payloadMessages = contextMsg
        ? [contextMsg, ...messages, { from: "user", text: input }]
        : [...messages, { from: "user", text: input }];

      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          messages: payloadMessages,
          lang: "fr",
        }),
      });

      if (res.status === 401) return redirectToLogin();

      const data = await res.json();
      const answer = data?.answer || "<p>❌ Réponse vide.</p>";

      await typeWriterEffect(answer);
    } catch {
      updateLastAssistantMessage("<p>❌ Erreur serveur. Veuillez réessayer.</p>");
    } finally {
      setLoading(false);
    }
  };

  const clearActiveDoc = () => {
    setActiveDoc(null);
    try {
      localStorage.removeItem(ACTIVE_DOC_KEY);
    } catch {}
  };

  /* =======================
     UI
  ======================= */
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-6xl rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* HEADER + MENU */}
        <div className="px-4 md:px-6 py-4 border-b border-white/10 bg-slate-950/60">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-[13px] uppercase tracking-[0.25em] text-emerald-300 font-semibold">DROITGPT</h1>
              <h2 className="text-lg md:text-xl font-bold mt-1">IA ASSISTANT JURIDIQUE CONGOLAIS</h2>
            </div>

            <nav className="flex flex-wrap items-center gap-2 text-[12px]">
              <Link to="/" className="px-3 py-1.5 rounded-full border border-slate-600 text-slate-200 hover:bg-slate-800">
                🏠 Accueil
              </Link>

              <Link to="/generate" className="px-3 py-1.5 rounded-full border border-indigo-500/80 text-indigo-200">
                📝 Générer document
              </Link>

              <Link to="/analyse" className="px-3 py-1.5 rounded-full border border-amber-500/80 text-amber-200">
                📂 Analyse document
              </Link>

              <Link
                to="/assistant-vocal"
                className="px-3 py-1.5 rounded-full border border-emerald-500/80 text-emerald-200"
              >
                🎤 Assistant vocal
              </Link>

              <button onClick={redirectToLogin} className="px-3 py-1.5 rounded-full border border-rose-500/70 text-rose-200">
                🚪 Déconnexion
              </button>
            </nav>
          </div>

          {/* ✅ Bandeau doc chargé */}
          {activeDoc?.documentText && (
            <div className="mt-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-100 flex items-center justify-between gap-3">
              <div className="truncate">
                📎 <strong>Document chargé :</strong> {activeDoc.filename || "Document"}
                <span className="text-blue-200/80"> • {String(activeDoc.documentText || "").length.toLocaleString()} caractères</span>
              </div>
              <button onClick={clearActiveDoc} className="px-3 py-1 rounded-xl border border-blue-300/30 hover:bg-blue-500/10">
                Retirer
              </button>
            </div>
          )}
        </div>

        {/* MESSAGES */}
        <div className="flex-1 overflow-y-auto px-3 md:px-5 py-4 space-y-3 bg-slate-950/70">
          {messages.map((msg, i) => {
            const isUser = msg.from === "user";
            return (
              <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    isUser ? "bg-emerald-500 text-white" : "bg-slate-900/90 border border-white/10"
                  }`}
                  dangerouslySetInnerHTML={{ __html: msg.text }}
                />
              </div>
            );
          })}

          {loading && <div className="text-xs text-slate-300">Assistant rédige{dots}</div>}

          <div ref={messagesEndRef} />
        </div>

        {/* INPUT */}
        <div className="border-t border-white/10 bg-slate-950/90 px-3 md:px-5 py-3">
          <textarea
            className="w-full px-4 py-4 rounded-2xl bg-slate-900 text-sm min-h-[180px] max-h-[360px] resize-y"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Décrivez votre situation juridique ici…"
          />

          <button onClick={handleSend} disabled={loading} className="mt-2 px-4 py-2 rounded-xl bg-emerald-500 text-white">
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}
