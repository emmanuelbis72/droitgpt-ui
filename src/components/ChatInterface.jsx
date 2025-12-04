import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import jsPDF from "jspdf";

export default function ChatInterface() {
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
  const [docContext, setDocContext] = useState(null); // 🧠 texte du document
  const [docTitle, setDocTitle] = useState(null); // nom du fichier
  const messagesEndRef = useRef(null);
  const location = useLocation();

  // 👉 empêche de recharger le document analysé après avoir cliqué "Chat normal"
  const hasInitDocFromLocation = useRef(false);

  // 🔁 Persistance locale (chat texte seulement)
  useEffect(() => {
    localStorage.setItem("chatMessages", JSON.stringify(messages));
  }, [messages]);

  // Animation "... "
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

  // Scroll auto
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ⬇️ Récupère le document envoyé depuis Analyse.jsx UNE SEULE FOIS
  useEffect(() => {
    if (hasInitDocFromLocation.current) return;

    if (location.state && location.state.documentText) {
      hasInitDocFromLocation.current = true; // on ne le fera plus

      setDocContext(location.state.documentText);
      setDocTitle(
        location.state.filename || "Document importé depuis la page Analyse"
      );

      setMessages((prev) => [
        ...prev,
        {
          from: "assistant",
          text:
            "📂 Le document analysé a été chargé comme référence. " +
            "Vous pouvez maintenant me poser des questions en vous basant sur ce document.",
        },
      ]);

      // Nettoyage historique URL (évite le rechargement si on revient en arrière)
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [location.state]);

  // Détection très simple de langue
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

  const handleSend = async () => {
    if (!userInput.trim() || loading) return;

    // Messages pour l'UI
    const newMessages = [...messages, { from: "user", text: userInput }];
    setMessages(newMessages);
    setUserInput("");
    setLoading(true);

    try {
      const lang = detectLanguage(userInput);

      // 🧠 Contexte pour l'API : si un document est chargé, on le met en avant
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

      const res = await fetch("https://droitgpt-indexer.onrender.com/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messagesForApi, lang }),
      });

      if (!res.ok) throw new Error("Erreur de réponse du serveur");

      const data = await res.json();
      let reply = data.answer || "❌ Réponse vide.";

      // ⭐ Indicateur si réponse basée sur un document
      if (docContext) {
        reply =
          `<div class="mb-2 text-xs text-emerald-300">📂 Cette réponse tient compte du document que vous avez joint.</div>` +
          reply;
      }

      setMessages([...newMessages, { from: "assistant", text: reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          from: "assistant",
          text: `❌ Erreur serveur. ${err.message || "Veuillez réessayer."}`,
        },
      ]);
    }

    setLoading(false);
  };

  const handleReset = () => {
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
    setMessages((prev) => [
      ...prev,
      { from: "user", text: `📄 Fichier envoyé : ${file.name}` },
    ]);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(
        "https://droitgpt-analysepdf.onrender.com/analyse-document",
        {
          method: "POST",
          body: formData,
        }
      );

      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("application/json")) {
        const raw = await res.text();
        throw new Error(`Réponse inattendue : ${raw.slice(0, 100)}...`);
      }

      const data = await res.json();
      const result = data.analysis || "❌ Analyse vide.";

      // 🧠 On garde le texte brut pour "chat avec ce document"
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

  // ---- Conversion HTML -> texte structuré pour le PDF ----
  const htmlToPlainForPdf = (html) => {
    if (!html) return "";

    let cleaned = html
      .replace(/<li>/gi, "• ")
      .replace(/<\/(p|div|h[1-6]|li|ul|ol|br)>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();

    // 🔎 Supprimer les emojis / caractères non standards qui gênent certains lecteurs PDF
    cleaned = cleaned.replace(/[^\n\r\x20-\x7E\u00A0-\u00FF]/g, "");

    return cleaned;
  };

  const generatePDF = (content) => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(15);

    // 🧾 En-tête propre, sans emoji
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
        {/* Header */}
        <div className="px-4 md:px-6 py-4 border-b border-white/10 bg-slate-950/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                DroitGPT • Assistant juridique
              </span>
              <h1 className="text-lg md:text-xl font-semibold mt-1">
                Chat texte & analyse de documents
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <Link
              to="/assistant-vocal"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-emerald-500/80 bg-slate-900/80 text-emerald-200 hover:bg-emerald-500/10 transition"
            >
              🎤 Assistant vocal
            </Link>

            <Link
              to="/"
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-600/70 bg-slate-900/80 text-slate-200 hover:bg-slate-800 transition"
            >
              ⬅️ Accueil
            </Link>
          </div>
        </div>

        {/* Sous-header : actions */}
        <div className="px-4 md:px-6 py-3 border-b border-white/10 bg-slate-950/40 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-[11px] text-slate-300">
            <p>
              Posez vos questions, joignez un <strong>PDF/DOCX</strong> et
              obtenez une <strong>analyse juridique détaillée</strong>.
            </p>
            <p className="mt-0.5 text-slate-400">
              Les réponses sont basées sur le <strong>droit congolais</strong>{" "}
              et, si présent, sur le <strong>document joint</strong>.
            </p>

            {docContext && (
              <div className="mt-1 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/60 bg-emerald-500/5 text-[11px] text-emerald-200">
                📂 <strong>Document chargé :</strong>
                <span className="truncate max-w-[150px]">{docTitle}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs justify-end">
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
              Réinitialiser le chat
            </button>

            <label className="cursor-pointer px-3 py-1.5 rounded-full border border-emerald-500/70 text-emerald-300 hover:bg-emerald-500/10 transition">
              📎 Joindre PDF / DOCX
              <input
                type="file"
                accept=".pdf,.docx"
                hidden
                onChange={handleFileUpload}
              />
            </label>
          </div>
        </div>

        {/* Zone messages */}
        <div className="flex-1 overflow-y-auto px-3 md:px-5 py-4 space-y-3 bg-slate-950/70">
          {messages.map((msg, i) => {
            const isUser = msg.from === "user";
            const isAssistant = msg.from === "assistant";
            const showPdfButton =
              isAssistant &&
              (msg.text.includes("Analyse du document") ||
                msg.text.includes("Résumé des points juridiques clés"));

            return (
              <div
                key={i}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
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

        {/* Zone input */}
        <div className="border-t border-white/10 bg-slate-950/90 px-3 md:px-5 py-3">
          <div className="flex flex-col gap-2">
            {/* input + bouton envoyer */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="flex-1 px-3 py-2.5 rounded-2xl bg-slate-900/80 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-transparent"
                placeholder="Posez votre question juridique ici…"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
              />
              <button
                className={`inline-flex items-center justify-center px-4 py-2 rounded-2xl text-sm font-medium transition ${
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

            {/* 🔄 Lien bien visible proche de la zone de texte */}
            {docContext && (
              <button
                onClick={handleClearDocument}
                className="w-fit px-3 py-1.5 rounded-full border border-amber-400/80 text-amber-200 bg-slate-900/80 hover:bg-amber-500/10 text-xs transition self-start"
              >
                🔄 Revenir au chat normal (sans document)
              </button>
            )}

            <p className="text-[11px] text-slate-400">
              ⚠️ DroitGPT ne remplace pas un avocat. Pour un litige concret,
              consultez un professionnel du droit en RDC.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
