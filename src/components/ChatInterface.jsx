import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import jsPDF from "jspdf";
import { useAuth } from "../auth/AuthContext.jsx";

const API_BASE = "https://droitgpt-indexer.onrender.com";

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
          `👋 <strong>Bienvenue</strong><br/>Je suis <strong>DroitGPT</strong>, votre assistant juridique congolais.<br/>Posez-moi toutes vos questions juridiques 📚⚖️`,
      },
    ];
  });

  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dots, setDots] = useState("");
  const [docContext, setDocContext] = useState(null);
  const [docTitle, setDocTitle] = useState(null);

  const messagesEndRef = useRef(null);
  const location = useLocation();
  const hasInitDocFromLocation = useRef(false);

  /* =======================
     Effects
  ======================= */
  useEffect(() => {
    localStorage.setItem("chatMessages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    let interval;
    if (loading) {
      interval = setInterval(() => setDots((d) => (d.length < 3 ? d + "." : "")), 500);
    } else setDots("");
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (hasInitDocFromLocation.current) return;
    if (location.state?.documentText) {
      hasInitDocFromLocation.current = true;
      setDocContext(location.state.documentText);
      setDocTitle(location.state.filename || "Document importé");
      setMessages((p) => [
        ...p,
        {
          from: "assistant",
          text:
            "📂 Le document analysé a été chargé comme référence. " +
            "Vous pouvez maintenant poser vos questions basées sur ce document.",
        },
      ]);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [location.state]);

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

  const buildMessagesForApi = (baseMessages) => {
    if (!docContext) return baseMessages;
    return [
      {
        from: "user",
        text:
          "Le document suivant doit servir de référence principale :\n\n" +
          docContext +
          "\n\nExplique clairement les implications juridiques.",
      },
      ...baseMessages,
    ];
  };

  /* =======================
     🔥 Streaming simulé (typewriter)
  ======================= */
  const typeWriterEffect = async (html) => {
    let current = "";
    for (let i = 0; i < html.length; i++) {
      current += html[i];
      updateLastAssistantMessage(current);
      await new Promise((r) => setTimeout(r, 8));
    }
  };

  /* =======================
     Send
  ======================= */
  const handleSend = async () => {
    if (!userInput.trim() || loading) return;

    const input = userInput.trim();
    setUserInput("");
    setLoading(true);

    setMessages((p) => [
      ...p,
      { from: "user", text: input },
      { from: "assistant", text: "" },
    ]);

    try {
      const baseMessages = buildMessagesForApi([...messages, { from: "user", text: input }]);

      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ messages: baseMessages, lang: "fr" }),
      });

      if (res.status === 401) return redirectToLogin();

      const data = await res.json();
      const answer = data?.answer || "<p>❌ Réponse vide.</p>";

      await typeWriterEffect(answer);
    } catch (err) {
      updateLastAssistantMessage("<p>❌ Erreur serveur. Veuillez réessayer.</p>");
    } finally {
      setLoading(false);
    }
  };

  /* =======================
     PDF
  ======================= */
  const htmlToPlainForPdf = (html) =>
    String(html)
      .replace(/<li>/gi, "• ")
      .replace(/<\/(p|div|h[1-6]|li|ul|ol|br)>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const generatePDF = (content) => {
    const doc = new jsPDF();
    doc.text("Analyse juridique – DroitGPT", 20, 20);
    const lines = doc.splitTextToSize(htmlToPlainForPdf(content), 170);
    doc.text(lines, 20, 30);
    doc.save("analyse_droitgpt.pdf");
  };

  /* =======================
     UI (DESIGN CONSERVÉ)
  ======================= */
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-5xl rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* HEADER */}
        <div className="px-4 md:px-6 py-4 border-b border-white/10 bg-slate-950/60 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[13px] uppercase tracking-[0.25em] text-emerald-300 font-semibold">
              DROITGPT
            </h1>
            <h2 className="text-lg md:text-xl font-bold mt-1">
              IA ASSISTANT JURIDIQUE CONGOLAIS
            </h2>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <Link
              to="/assistant-vocal"
              className="px-3 py-1.5 rounded-full border border-emerald-500/80 text-emerald-200"
            >
              🎤 Assistant vocal
            </Link>
            <button
              onClick={redirectToLogin}
              className="px-3 py-1.5 rounded-full border border-rose-500/70 text-rose-200"
            >
              🚪 Déconnexion
            </button>
          </div>
        </div>

        {/* MESSAGES */}
        <div className="flex-1 overflow-y-auto px-3 md:px-5 py-4 space-y-3 bg-slate-950/70">
          {messages.map((msg, i) => {
            const isUser = msg.from === "user";
            return (
              <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    isUser
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-900/90 border border-white/10"
                  }`}
                  dangerouslySetInnerHTML={{ __html: msg.text }}
                />
              </div>
            );
          })}

          {loading && (
            <div className="text-xs text-slate-300">Assistant rédige{dots}</div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT */}
        <div className="border-t border-white/10 bg-slate-950/90 px-3 md:px-5 py-3">
          <textarea
            className="w-full px-4 py-4 rounded-2xl bg-slate-900 text-sm"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Décrivez votre situation juridique ici…"
          />
          <button
            onClick={handleSend}
            disabled={loading}
            className="mt-2 px-4 py-2 rounded-xl bg-emerald-500 text-white"
          >
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}
