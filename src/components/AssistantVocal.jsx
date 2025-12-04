import React, { useState, useRef } from "react";

// Convertit base64 en Blob audio
function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

export default function AssistantVocal() {
  const [isRecording, setIsRecording] = useState(false);
  const [conversation, setConversation] = useState([]); // 🧠 mémoire locale
  const [isLoading, setIsLoading] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioRef = useRef(null);

  // 👉 en prod: remplacer par ton URL Render
  const VOICE_API_URL = "http://localhost:5050/voice-chat";

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        // on coupe le micro
        stream.getTracks().forEach((t) => t.stop());

        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        await sendAudio(audioBlob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      alert("Micro non autorisé ou indisponible.");
      console.error("Erreur getUserMedia :", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendAudio = async (audioBlob) => {
    setIsLoading(true);

    const formData = new FormData();
    formData.append("audio", audioBlob, "speech.webm");

    // 🧠 On envoie l'historique au backend vocal
    // On peut limiter à, par ex., les 6–8 derniers messages pour ne pas exploser le contexte
    const MAX_MESSAGES = 8;
    const trimmedHistory =
      conversation.length > MAX_MESSAGES
        ? conversation.slice(conversation.length - MAX_MESSAGES)
        : conversation;

    // On met uniquement { from, text } comme ton /ask les attend
    const historyForBackend = trimmedHistory.map((m) => ({
      from: m.from,
      text: m.text,
    }));

    formData.append("history", JSON.stringify(historyForBackend));

    try {
      const res = await fetch(VOICE_API_URL, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Réponse serveur vocal non OK :", res.status, text);
        alert(`Erreur serveur vocal : ${res.status}\n${text}`);
        return;
      }

      const data = await res.json();
      console.log("Réponse voice-service :", data);

      if (!data || (!data.userText && !data.answerText)) {
        alert("Réponse vocale vide ou invalide.");
        return;
      }

      // ➕ On ajoute la nouvelle interaction à la mémoire locale
      setConversation((prev) => [
        ...prev,
        { from: "user", text: data.userText },
        { from: "assistant", text: data.answerText },
      ]);

      // Lecture de la réponse audio
      if (data.audioBase64) {
        const audioBlobResponse = base64ToBlob(
          data.audioBase64,
          data.mimeType || "audio/mpeg"
        );
        const audioUrl = URL.createObjectURL(audioBlobResponse);

        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current
            .play()
            .catch((e) => console.warn("Lecture audio bloquée :", e));
        }
      }
    } catch (err) {
      console.error("Erreur fetch vocal :", err);
      alert("Erreur lors de la communication vocale : " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-2xl p-5 flex flex-col gap-5">
        {/* Header style Siri */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
              DroitGPT • Assistant vocal
            </span>
            <h1 className="text-xl font-semibold mt-1">
              Parlez avec votre avocat
            </h1>
          </div>
          <div className="h-9 px-3 rounded-full bg-slate-900/60 border border-white/10 flex items-center text-xs text-slate-200 gap-1">
            <span
              className={`h-2 w-2 rounded-full ${
                isRecording ? "bg-rose-500 animate-pulse" : "bg-emerald-400"
              }`}
            />
            <span>{isRecording ? "Enregistrement…" : "Prêt à vous écouter"}</span>
          </div>
        </div>

        {/* Zone conversation */}
        <div className="relative flex-1 min-h-[220px] max-h-[320px] overflow-y-auto rounded-2xl bg-slate-950/60 border border-white/5 px-3 py-3 space-y-3">
          {conversation.length === 0 && !isLoading && (
            <div className="h-full flex flex-col items-center justify-center text-center text-xs text-slate-400">
              <p>Maintenez une conversation naturelle sur vos questions juridiques.</p>
              <p className="mt-1">Appuyez sur le micro pour commencer.</p>
            </div>
          )}

          {conversation.map((msg, index) => (
            <div
              key={index}
              className={`flex ${
                msg.from === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  msg.from === "user"
                    ? "bg-emerald-500 text-white rounded-br-sm"
                    : "bg-slate-800 text-slate-50 rounded-bl-sm"
                }`}
              >
                <div className="text-[10px] uppercase tracking-wide mb-1 opacity-70">
                  {msg.from === "user" ? "Vous" : "DroitGPT Avocat"}
                </div>
                <div>{msg.text}</div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-slate-300 mt-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              <span>DroitGPT prépare sa réponse…</span>
            </div>
          )}
        </div>

        {/* Bouton micro style Siri */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            {isRecording && (
              <div className="absolute inset-0 -z-10 animate-ping rounded-full bg-rose-500/40" />
            )}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`h-16 w-16 rounded-full flex items-center justify-center shadow-2xl border border-white/20 transition-all duration-200 ${
                isRecording
                  ? "bg-rose-500 hover:bg-rose-600 scale-105"
                  : "bg-slate-800 hover:bg-slate-700"
              }`}
            >
              <span className="text-2xl">🎤</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-400 text-center">
            {isRecording
              ? "Parlez librement, cliquez pour arrêter."
              : "Touchez le micro, posez votre question juridique, puis relâchez."}
          </p>
        </div>

        <audio ref={audioRef} hidden />
      </div>
    </div>
  );
}
