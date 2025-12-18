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
    let i;
    if (loading) {
      i = setInterval(() => setDots((d) => (d.length < 3 ? d + "." : "")), 500);
    } else setDots("");
    return () => clearInterval(i);
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
            "Vous pouvez maintenant poser vos questions.",
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

  const buildMessagesForApi = (base) => {
    if (!docContext) return base;
    return [
      {
        from: "user",
        text:
          "Le document suivant est la référence principale :\n\n" +
          docContext +
          "\n\nExplique les implications juridiques.",
      },
      ...base,
    ];
  };

  /* =======================
     🟢 STREAMING SIMULÉ
  ======================= */
  const typeWriterEffect = async (html) => {
    let current = "";
    for (let i = 0; i < html.length; i++) {
      current += html[i];
      updateLastAssistantMessage(current);
      await new Promise((r) => setTimeout(r, 8)); // vitesse écriture
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

    setMessages((p) => [...p, { from: "user", text: input }, { from: "assistant", text: "" }]);

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
      const answer = data?.answer || "❌ Réponse vide.";

      await typeWriterEffect(answer);
    } catch (e) {
      updateLastAssistantMessage("❌ Erreur serveur. Réessayez.");
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
     UI (inchangée)
  ======================= */
  return (
    <div className="min-h-screen bg-slate-950 text-white flex justify-center px-4 py-6">
      <div className="w-full max-w-5xl bg-white/5 rounded-3xl shadow-2xl flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={m.from === "user" ? "text-right" : "text-left"}>
              <div
                className={`inline-block px-4 py-2 rounded-xl ${
                  m.from === "user" ? "bg-emerald-500" : "bg-slate-800"
                }`}
                dangerouslySetInnerHTML={{ __html: m.text }}
              />
              {m.from === "assistant" && m.text && (
                <button
                  onClick={() => generatePDF(m.text)}
                  className="block text-xs text-emerald-300 mt-1"
                >
                  PDF
                </button>
              )}
            </div>
          ))}
          {loading && <div className="text-slate-400">Assistant rédige{dots}</div>}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-white/10">
          <textarea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            rows={4}
            className="w-full p-3 rounded-xl bg-slate-900"
          />
          <button
            onClick={handleSend}
            disabled={loading}
            className="mt-2 px-4 py-2 bg-emerald-500 rounded-xl"
          >
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}
