import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import jsPDF from "jspdf";
import { useAuth } from "../auth/AuthContext.jsx";

const API_BASE = import.meta.env.VITE_INDEXER_URL || "https://droitgpt-indexer.onrender.com";

function normalizeMessages(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((m) => {
      // Nouveau format attendu
      if (m && typeof m === "object" && typeof m.from === "string" && typeof m.text === "string") {
        return { from: m.from, text: m.text };
      }
      // Ancien format (content/isUser)
      if (m && typeof m === "object" && typeof m.content === "string") {
        return { from: m.isUser ? "user" : "assistant", text: m.content };
      }
      return null;
    })
    .filter((m) => m && m.text && String(m.text).trim().length > 0);
}

export default function ChatInterface() {
  const { accessToken, logout } = useAuth();
  const authHeaders = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem("chatMessages");
    const normalized = saved ? normalizeMessages(JSON.parse(saved)) : [];
    return normalized.length
      ? normalized
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

  // Streaming control
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

      // Ajoute un message système côté UI (facultatif)
      setMessages((prev) => [
        ...prev,
        {
          from: "assistant",
          text: `📄 <strong>Document chargé :</strong> ${location.state.filename || "Document"}<br/>Posez votre question en lien avec ce document.`,
        },
      ]);
    }
  }, [location.state]);

  const detectLanguage = (text) => {
    if (!text) return "fr";
    const hasEnglish = /\b(the|and|or|is|are|to|from|with|without)\b/i.test(text);
    return hasEnglish ? "en" : "fr";
  };

  const redirectToLogin = (fromPath = "/chat") => {
    // Tu peux remplacer par ton routing si besoin
    window.location.href = `/login?from=${encodeURIComponent(fromPath)}`;
  };

  const updateLastAssistantMessage = (newText) => {
    setMessages((prev) => {
      if (!prev.length) return prev;
      const copy = [...prev];
      // trouve le dernier assistant
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i]?.from === "assistant") {
          copy[i] = { ...copy[i], text: newText };
          break;
        }
      }
      return copy;
    });
  };

  // ✅ Streaming SSE: lit event: delta / done / error
  const streamAsk = async ({ messagesForApi, lang }) => {
    // Annule un stream précédent si existant
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

    // 🔒 backend protégé → non connecté
    if (res.status === 401) {
      redirectToLogin("/chat");
      return;
    }

    // Si le backend n'a pas encore /ask-stream (404), on repassera en fallback JSON
    if (res.status === 404) {
      throw new Error("STREAM_NOT_AVAILABLE");
    }

    if (!res.ok || !res.body) {
      throw new Error("Erreur de streaming (réponse serveur invalide).");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buffer = "";
    let assistantHtml = "";

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

        const event = eventLine?.replace("event:", "").trim();
        const dataRaw = dataLine?.replace("data:", "").trim();

        if (!event || !dataRaw) continue;

        let payload;
        try {
          payload = JSON.parse(dataRaw);
        } catch {
          continue;
        }

        if (event === "delta") {
          const chunk = payload?.content || "";
          if (chunk) {
            assistantHtml += chunk;
            updateLastAssistantMessage(assistantHtml);
          }
        }

        if (event === "error") {
          throw new Error(payload?.error || "Erreur streaming.");
        }

        if (event === "done") {
          return;
        }

        // event ping -> ignore
      }
    }
  };

  const askJsonFallback = async ({ messagesForApi, lang }) => {
    const res = await fetch(`${API_BASE}/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({ messages: messagesForApi, lang }),
    });

    if (res.status === 401) {
      redirectToLogin("/chat");
      return;
    }

    if (!res.ok) throw new Error("Erreur de réponse du serveur");

    const data = await res.json();
    return data?.answer || "❌ Réponse vide.";
  };

  const handleSend = async () => {
    if (!userInput.trim() || loading) return;

    const input = userInput;

    // ✅ Normalise au cas où localStorage contient d'anciens objets
    const normalizedCurrent = normalizeMessages(messages);

    // 1) Ajoute le message user
    const newMessages = [...normalizedCurrent, { from: "user", text: input }];
    setMessages(newMessages);
    setUserInput("");

    // 2) Ajoute un message assistant vide (placeholder) → sera rempli en streaming
    setMessages((prev) => [...prev, { from: "assistant", text: "" }]);

    setLoading(true);

    try {
      const lang = detectLanguage(input);

      let messagesForApi = [...newMessages];

      if (docContext) {
        messagesForApi = [
          {
            from: "user",
            text:
              "Le document suivant doit servir de référence principale pour répondre à ma question :\n\n" +
              docContext +
              "\n\nMerci d'expliquer clairement les implications juridiques basées sur ce document.",
          },
          ...newMessages,
        ];
      }

      // 3) Streaming (rapide comme ChatGPT). Fallback automatique si /ask-stream indisponible.
      try {
        await streamAsk({ messagesForApi, lang });
      } catch (e) {
        if (String(e?.message || e) === "STREAM_NOT_AVAILABLE") {
          const reply = await askJsonFallback({ messagesForApi, lang });
          let finalReply = reply;

          if (docContext) {
            finalReply =
              `<div class="mb-2 text-xs text-emerald-300">📂 Cette réponse tient compte du document que vous avez joint.</div>` +
              finalReply;
          }

          updateLastAssistantMessage(finalReply);
        } else {
          throw e;
        }
      }
    } catch (err) {
      console.error("Erreur Chat:", err);
      updateLastAssistantMessage("❌ Réponse vide (fallback).");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    try {
      logout?.();
    } catch {
      // ignore
    }
  };

  const exportChatToPDF = () => {
    const doc = new jsPDF();
    let y = 10;
    doc.setFontSize(12);

    doc.text("DroitGPT - Historique de conversation", 10, y);
    y += 10;

    messages.forEach((m) => {
      const label = m.from === "user" ? "Vous" : "DroitGPT";
      const text = (m.text || "").replace(/<[^>]*>/g, ""); // enlève HTML
      const lines = doc.splitTextToSize(`${label}: ${text}`, 180);
      doc.text(lines, 10, y);
      y += lines.length * 7 + 2;

      if (y > 280) {
        doc.addPage();
        y = 10;
      }
    });

    doc.save("droitgpt_chat.pdf");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">DroitGPT</h1>
            <p className="text-xs text-slate-400">
              Assistant juridique RDC • Mode streaming activé (si disponible)
            </p>
            {docTitle ? (
              <p className="mt-1 text-xs text-emerald-300">📎 Document: {docTitle}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={exportChatToPDF}
              className="rounded-md bg-slate-800 px-3 py-2 text-xs hover:bg-slate-700"
            >
              Télécharger PDF
            </button>
            <button
              onClick={handleLogout}
              className="rounded-md bg-slate-800 px-3 py-2 text-xs hover:bg-slate-700"
            >
              Déconnexion
            </button>
            <Link to="/" className="text-xs text-slate-300 hover:text-white">
              Accueil
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="h-[65vh] overflow-y-auto pr-2">
            {messages.map((m, idx) => {
              const isUser = m.from === "user";
              return (
                <div key={idx} className={`mb-3 flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className={[
                      "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                      isUser ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-100",
                    ].join(" ")}
                  >
                    <div dangerouslySetInnerHTML={{ __html: m.text }} />
                  </div>
                </div>
              );
            })}

            {loading ? (
              <div className="mb-3 flex justify-start">
                <div className="max-w-[85%] rounded-2xl bg-slate-800 px-4 py-3 text-sm text-slate-100">
                  DroitGPT écrit{dots}
                </div>
              </div>
            ) : null}

            <div ref={messagesEndRef} />
          </div>

          <div className="mt-4 flex gap-2">
            <input
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
              placeholder="Écrivez votre question…"
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
            />
            <button
              onClick={handleSend}
              disabled={loading || !userInput.trim()}
              className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium disabled:opacity-50"
            >
              Envoyer
            </button>
          </div>

          <div className="mt-2 text-[11px] text-slate-500">
            Astuce: si tu vois encore des erreurs 400, vide le cache du chat (localStorage) ou reconnecte-toi.
          </div>
        </div>
      </div>
    </div>
  );
}
