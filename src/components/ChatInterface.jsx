import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import jsPDF from "jspdf";
import { useAuth } from "../auth/AuthContext.jsx";

const API_BASE = "https://droitgpt-indexer.onrender.com";

export default function ChatInterface() {
  const { accessToken, logout } = useAuth();
  const authHeaders = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem("chatMessages");
    return saved
      ? JSON.parse(saved)
      : [
          {
            from: "assistant",
            text: `👋 <strong>Bienvenue</strong><br/>Je suis <strong>DroitGPT</strong>, votre assistant juridique congolais.<br/>Posez-moi toutes vos questions juridiques 📚⚖️`,
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

  // permet d’annuler un stream en cours si l’utilisateur renvoie un nouveau message
  const streamAbortRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("chatMessages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    let interval;
    if (loading) {
      interval = setInterval(() => {
        setDots((prev) => (prev.length < 3 ? prev + "." : ""));
      }, 500);
    } else {
      setDots("");
    }
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (hasInitDocFromLocation.current) return;

    if (location.state && location.state.documentText) {
      hasInitDocFromLocation.current = true;

      setDocContext(location.state.documentText);
      setDocTitle(location.state.filename || "Document importé depuis la page Analyse");

      setMessages((prev) => [
        ...prev,
        {
          from: "assistant",
          text:
            "📂 Le document analysé a été chargé comme référence. " +
            "Vous pouvez maintenant me poser des questions en vous basant sur ce document.",
        },
      ]);

      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [location.state]);

  const detectLanguage = (text) => {
    const lower = text.toLowerCase();
    const dict = {
      fr: ["bonjour", "tribunal", "avocat", "juridique"],
      en: ["hello", "law", "court", "legal"],
      sw: ["habari", "sheria", "mahakama"],
      ln: ["mbote", "mobeko"],
      kg: ["maboko"],
      tsh: ["moyo", "ntu"],
    };
    for (const [lang, words] of Object.entries(dict)) {
      if (words.some((w) => lower.includes(w))) return lang;
    }
    return "fr";
  };

  const redirectToLogin = (nextPath = "/chat") => {
    logout();
    const next = encodeURIComponent(nextPath);
    window.location.href = `/login?next=${next}`;
  };

  // ✅ Met à jour le dernier message assistant (pendant le stream)
  const updateLastAssistantMessage = (newText) => {
    setMessages((prev) => {
      if (!prev.length) return prev;
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i]?.from === "assistant") {
          copy[i] = { ...copy[i], text: newText };
          return copy;
        }
      }
      return [...copy, { from: "assistant", text: newText }];
    });
  };

  const buildMessagesForApi = (baseMessages) => {
    if (!docContext) return baseMessages;

    return [
      {
        from: "user",
        text:
          "Le document suivant doit servir de référence principale pour répondre à ma question :\n\n" +
          docContext +
          "\n\nMerci d'expliquer clairement les implications juridiques basées sur ce document.",
      },
      ...baseMessages,
    ];
  };

  // ✅ Fallback JSON /ask (si stream ne démarre pas / proxy / erreur)
  const askJsonFallback = async ({ messagesForApi, lang }) => {
    const r2 = await fetch(`${API_BASE}/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({ messages: messagesForApi, lang }),
    });

    if (r2.status === 401) {
      redirectToLogin("/chat");
      return;
    }

    const data = await r2.json().catch(() => ({}));
    let reply = data?.answer || "❌ Réponse vide (fallback).";

    if (docContext) {
      reply =
        `<div class="mb-2 text-xs text-emerald-300">📂 Cette réponse tient compte du document que vous avez joint.</div>` +
        reply;
    }

    updateLastAssistantMessage(reply);
  };

  // ✅ Streaming SSE /ask-stream (affiche token par token)
  const askStream = async ({ messagesForApi, lang }) => {
    // stop stream précédent
    if (streamAbortRef.current) {
      try {
        streamAbortRef.current.abort();
      } catch {
        // ignore
      }
    }

    const controller = new AbortController();
    streamAbortRef.current = controller;

    const res = await fetch(`${API_BASE}/ask-stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...authHeaders,
      },
      body: JSON.stringify({ messages: messagesForApi, lang }),
      signal: controller.signal,
    });

    if (res.status === 401) {
      redirectToLogin("/chat");
      return;
    }

    // Si pas OK → fallback direct
    if (!res.ok) {
      await askJsonFallback({ messagesForApi, lang });
      return;
    }

    const ct = res.headers.get("content-type") || "";

    // ✅ Si le serveur renvoie autre chose que SSE → fallback JSON
    if (!ct.includes("text/event-stream") || !res.body) {
      await askJsonFallback({ messagesForApi, lang });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buffer = "";
    let assistantHtml = "";
    let started = false;

    // ✅ timeout sécurité : si rien n’arrive en X secondes → fallback
    const startTimeoutMs = 9000;
    const startTimer = setTimeout(async () => {
      if (!started) {
        try {
          controller.abort();
        } catch {
          // ignore
        }
        await askJsonFallback({ messagesForApi, lang });
      }
    }, startTimeoutMs);

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE = blocs séparés par \n\n
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        const lines = part.split("\n");

        const eventLine = lines.find((l) => l.startsWith("event:"));
        const dataLine = lines.find((l) => l.startsWith("data:"));

        const event = eventLine?.replace("event:", "").trim() || "";
        const dataRaw = dataLine?.replace("data:", "").trim() || "";

        if (!dataRaw) continue;

        let payload;
        try {
          payload = JSON.parse(dataRaw);
        } catch {
          continue;
        }

        // le backend envoie event: ready (donc started = true)
        if (event === "ready") {
          started = true;
          clearTimeout(startTimer);
          continue;
        }

        if (event === "ping") continue;

        if (event === "error") {
          clearTimeout(startTimer);
          await askJsonFallback({ messagesForApi, lang });
          return;
        }

        if (event === "delta") {
          started = true;
          clearTimeout(startTimer);

          const chunk = payload?.content || "";
          if (chunk) {
            assistantHtml += chunk;

            let display = assistantHtml;
            if (docContext) {
              display =
                `<div class="mb-2 text-xs text-emerald-300">📂 Cette réponse tient compte du document que vous avez joint.</div>` +
                assistantHtml;
            }

            updateLastAssistantMessage(display);
          }
        }

        if (event === "done") {
          clearTimeout(startTimer);
          return;
        }
      }
    }

    clearTimeout(startTimer);

    // si stream finit sans delta → fallback
    if (!started) {
      await askJsonFallback({ messagesForApi, lang });
    }
  };

  const handleSend = async () => {
    if (!userInput.trim() || loading) return;

    const input = userInput;

    // 1) Ajoute message user + placeholder assistant (en un seul setMessages, plus stable)
    setMessages((prev) => [...prev, { from: "user", text: input }, { from: "assistant", text: "" }]);
    setUserInput("");
    setLoading(true);

    try {
      const lang = detectLanguage(input);

      // Base messages = état actuel + message user (sans le placeholder)
      const baseMessages = [...messages, { from: "user", text: input }];

      const messagesForApi = buildMessagesForApi(baseMessages);

      // 2) Streaming (avec fallback)
      await askStream({ messagesForApi, lang });
    } catch (err) {
      updateLastAssistantMessage(`❌ Erreur serveur. ${err.message || "Veuillez réessayer."}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    // stop stream if running
    if (streamAbortRef.current) {
      try {
        streamAbortRef.current.abort();
      } catch {
        // ignore
      }
      streamAbortRef.current = null;
    }

    const welcome = {
      from: "assistant",
      text: `👋 <strong>Bienvenue</strong><br/>Je suis <strong>DroitGPT</strong>, votre assistant juridique congolais.<br/>Posez-moi toutes vos questions juridiques 📚⚖️`,
    };
    setMessages([welcome]);
    setUserInput("");
    setDocContext(null);
    setDocTitle(null);
  };

  const handleClearDocument = () => {
    setDocContext(null);
    setDocTitle(null);
    setMessages((prev) => [
      ...prev,
      {
        from: "assistant",
        text:
          "🔄 Vous êtes revenu au <strong>chat normal DroitGPT</strong>. Le document n’est plus utilisé comme référence.",
      },
    ]);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setMessages((prev) => [...prev, { from: "user", text: `📄 Fichier envoyé : ${file.name}` }]);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("https://droitgpt-analysepdf.onrender.com/analyse-document", {
        method: "POST",
        headers: {
          ...authHeaders, // ✅ token
        },
        body: formData,
      });

      if (res.status === 401) {
        redirectToLogin("/chat");
        return;
      }

      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("application/json")) {
        const raw = await res.text();
        throw new Error(`Réponse inattendue : ${raw.slice(0, 100)}...`);
      }

      const data = await res.json();
      const result = data.analysis || "❌ Analyse vide.";

      if (data.documentText) {
        setDocContext(data.documentText);
        setDocTitle(file.name);
      }

      setMessages((prev) => [
        ...prev,
        {
          from: "assistant",
          text:
            "📑 <strong>Analyse du document :</strong><br/>" +
            result +
            "<br/><br/>💬 Vous pouvez maintenant poser des questions basées sur ce document.",
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          from: "assistant",
          text: "❌ Erreur analyse document : " + err.message,
        },
      ]);
    }

    setLoading(false);
  };

  const htmlToPlainForPdf = (html) => {
    if (!html) return "";

    let cleaned = html
      .replace(/<li>/gi, "• ")
      .replace(/<\/(p|div|h[1-6]|li|ul|ol|br)>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();

    cleaned = cleaned.replace(/[^\n\r\x20-\x7E\u00A0-\u00FF]/g, "");
    return cleaned;
  };

  const generatePDF = (content) => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(15);
    doc.text("Analyse juridique – DroitGPT", 20, 20);

    doc.setFontSize(11);
    const plain = htmlToPlainForPdf(content);
    const lines = doc.splitTextToSize(plain, 170);

    doc.text(lines, 20, 30);
    doc.save("analyse_droitgpt.pdf");
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-5xl rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* ---------- HEADER ---------- */}
        <div className="px-4 md:px-6 py-4 border-b border-white/10 bg-slate-950/60 flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <h1 className="text-[13px] uppercase tracking-[0.25em] text-emerald-300 font-semibold">
              DROITGPT
            </h1>
            <h2 className="text-lg md:text-xl font-bold mt-1">IA ASSISTANT JURIDIQUE CONGOLAIS</h2>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <Link
              to="/assistant-vocal"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-emerald-500/80 bg-slate-900/80 text-emerald-200 hover:bg-emerald-500/10 transition"
            >
              🎤 Assistant vocal
            </Link>

            <button
              onClick={() => redirectToLogin("/")}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-rose-500/70 bg-slate-900/80 text-rose-200 hover:bg-rose-500/10 transition"
              title="Se déconnecter"
            >
              🚪 Déconnexion
            </button>

            <Link
              to="/"
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-600/70 bg-slate-900/80 text-slate-200 hover:bg-slate-800 transition"
            >
              ⬅️ Accueil
            </Link>
          </div>
        </div>

        {/* ---------- SOUS-HEADER ---------- */}
        <div className="px-4 md:px-6 py-3 border-b border-white/10 bg-slate-950/40 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            {docContext && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/60 bg-emerald-500/5 text-[11px] text-emerald-200">
                📂 <strong>Document chargé :</strong>
                <span className="truncate max-w-[180px]">{docTitle}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs justify-end">
            <Link
              to="/generate"
              className="px-3 py-1.5 rounded-full border border-indigo-500/70 text-indigo-300 bg-slate-900/80 hover:bg-indigo-500/10 transition"
            >
              📝 Générer un document juridique
            </Link>

            {docContext && (
              <button
                onClick={handleClearDocument}
                className="px-3 py-1.5 rounded-full border border-amber-400/80 text-amber-200 bg-slate-900/80 hover:bg-amber-500/10 transition"
              >
                🔄 Chat normal (sans document)
              </button>
            )}

            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-full border border-rose-500/70 text-rose-300 hover:bg-rose-500/10 transition"
            >
              Réinitialiser
            </button>

            <label className="cursor-pointer px-3 py-1.5 rounded-full border border-emerald-500/70 text-emerald-300 hover:bg-emerald-500/10 transition">
              📎 Joindre document (PDF/DOCX)
              <input type="file" accept=".pdf,.docx" hidden onChange={handleFileUpload} />
            </label>
          </div>
        </div>

        {/* ---------- MESSAGES ---------- */}
        <div className="flex-1 overflow-y-auto px-3 md:px-5 py-4 space-y-3 bg-slate-950/70">
          {messages.map((msg, i) => {
            const isUser = msg.from === "user";
            const isAssistant = msg.from === "assistant";

            const showPdfButton =
              isAssistant &&
              (msg.text.includes("Analyse du document") || msg.text.includes("Résumé des points juridiques clés"));

            return (
              <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`relative max-w-[85%] md:max-w-[70%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
                    isUser
                      ? "bg-emerald-500 text-white rounded-br-sm"
                      : "bg-slate-900/90 text-slate-50 rounded-bl-sm border border-white/10"
                  }`}
                >
                  {isAssistant && (
                    <div className="text-[10px] uppercase tracking-wide mb-1 text-slate-300/80">
                      DroitGPT • Réponse juridique
                    </div>
                  )}

                  <div
                    className="prose prose-sm max-w-none prose-invert prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-strong:text-emerald-300"
                    dangerouslySetInnerHTML={{ __html: msg.text }}
                  />

                  {showPdfButton && (
                    <button
                      onClick={() => generatePDF(msg.text)}
                      className="absolute -right-8 top-2 text-[11px] text-emerald-300 hover:text-emerald-200 underline"
                    >
                      PDF
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-white/10 text-xs text-slate-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Assistant rédige{dots}</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ---------- INPUT ---------- */}
        <div className="border-t border-white/10 bg-slate-950/90 px-3 md:px-5 py-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <textarea
                className="flex-1 px-4 py-4 rounded-2xl
                           bg-slate-900/80 border border-slate-700
                           text-sm text-slate-100 placeholder:text-slate-500
                           leading-relaxed
                           focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-transparent
                           min-h-[160px] max-h-[320px] resize-y"
                placeholder={
                  "Décrivez votre situation juridique en détail ou posez votre question ici…\n" +
                  "Vous pouvez écrire sur plusieurs lignes."
                }
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && userInput.trim()) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />

              <button
                className={`inline-flex items-center justify-center px-4 py-2 rounded-2xl text-sm font-medium transition self-stretch ${
                  loading || !userInput.trim()
                    ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                    : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/25"
                }`}
                onClick={handleSend}
                disabled={loading || !userInput.trim()}
              >
                Envoyer
              </button>
            </div>

            {docContext && (
              <button
                onClick={handleClearDocument}
                className="w-fit px-3 py-1.5 rounded-full border border-amber-400/80 text-amber-200 bg-slate-900/80 hover:bg-amber-500/10 text-xs transition self-start"
              >
                🔄 Revenir au chat normal (sans document)
              </button>
            )}

            <p className="text-[11px] text-slate-400">
              ⚠️ DroitGPT ne remplace pas un avocat. Pour un litige concret, consultez un professionnel du droit en RDC.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
