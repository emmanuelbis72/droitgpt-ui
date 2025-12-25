import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  ensureActiveRunValid,
  upsertAndSetActive,
  patchActiveRun,
} from "../justiceLab/storage.js";

import {
  mergeAudienceWithTemplates,
  setAudienceScene as setAudienceSceneOnRun,
  applyAudienceDecision,
  getPiecesStatusSummary,
} from "../justiceLab/engine.js";

import { CASES } from "../justiceLab/cases.js";

const API_BASE =
  (import.meta?.env?.VITE_API_URL || "https://droitgpt-indexer.onrender.com").replace(/\/$/, "");

function getAuthToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("droitgpt_token") ||
    ""
  );
}

function safeStr(v, max = 2000) {
  return String(v ?? "").slice(0, max);
}

function cls(...arr) {
  return arr.filter(Boolean).join(" ");
}

function nowIso() {
  return new Date().toISOString();
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function pickSceneMeta(scene) {
  if (!scene || typeof scene !== "object") return null;
  const s = scene.sceneMeta || scene.scene || scene;
  return {
    tribunal: s.tribunal || s.juridiction || s.cour || null,
    chambre: s.chambre || s.section || null,
    date: s.date || s.audienceDate || null,
    ville: s.ville || null,
    dossier: s.dossier || s.reference || s.numero || null,
    audienceType: s.audienceType || s.type || null,
  };
}

function normalizePhases(data) {
  const s = data?.sceneMeta || data?.scene || data || {};
  const p =
    (Array.isArray(s?.phases) && s.phases) ||
    (Array.isArray(data?.phases) && data.phases) ||
    [];
  return p
    .map((x) => {
      if (!x) return null;
      if (typeof x === "string") return { id: x, title: x };
      return { id: x.id || x.title || x.name || "phase", title: x.title || x.name || x.id || "Phase" };
    })
    .filter(Boolean);
}

function bestChoiceByRole(obj, role) {
  const r = (role || "").trim() || "Juge";
  return obj?.bestChoiceByRole?.[r] || null;
}

async function postJSON(url, body) {
  const token = getAuthToken();
  if (!token || token.length < 10) throw new Error("AUTH_TOKEN_MISSING");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`HTTP_${resp.status}:${text.slice(0, 200)}`);
    }
    return await resp.json();
  } finally {
    clearTimeout(timeout);
  }
}

export default function JusticeLabAudience() {
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  const [run, setRun] = useState(null);
  const [caseData, setCaseData] = useState(null);

  const [turns, setTurns] = useState([]);
  const [objections, setObjections] = useState([]);
  const [selectedObjId, setSelectedObjId] = useState(null);

  const [choice, setChoice] = useState("Demander précision");
  const [reasoning, setReasoning] = useState("");
  const [reasoningLocked, setReasoningLocked] = useState(true);

  const [instantFeedback, setInstantFeedback] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  // bootstrap run from nav OR active run
  useEffect(() => {
    const nav = location?.state || {};
    const navRun = nav.runData || nav.run || null;

    if (navRun?.runId) {
      upsertAndSetActive(navRun);
      setRun(navRun);
      return;
    }

    const active = ensureActiveRunValid();
    if (active) setRun(active);
  }, [location?.state]);

  // resolve caseData from run.caseId
  useEffect(() => {
    if (!run) return;
    const cid = run?.caseId || run?.caseMeta?.caseId;
    const found = CASES.find((c) => c.caseId === cid) || null;
    setCaseData(found);
  }, [run]);

  const role = safeStr(run?.answers?.role || "Juge", 24);

  const sceneFromRun = run?.answers?.audience?.scene || null;
  const sceneMeta = useMemo(() => pickSceneMeta(sceneFromRun), [sceneFromRun]);
  const phases = useMemo(() => normalizePhases(sceneFromRun), [sceneFromRun]);

  const selectedObjection = useMemo(
    () => objections.find((o) => o.id === selectedObjId) || null,
    [objections, selectedObjId]
  );

  // Load audience (IA) then merge with templates
  async function loadAudience() {
    if (!run || !caseData) return;

    setApiError("");
    setLoading(true);

    try {
      const payload = {
        caseId: run?.caseId || run?.caseMeta?.caseId,
        role: run?.answers?.role || "Juge",
        difficulty: caseData?.niveau || "Intermédiaire",
        facts: caseData?.resume || "",
        parties: caseData?.parties || {},
        pieces: (caseData?.pieces || []).map((p) => ({
          id: p.id,
          title: p.title,
          type: p.type,
          content: safeStr(p.content || "", 900),
        })),
        legalIssues: caseData?.legalIssues || [],
        procedureChoice: run?.answers?.procedureChoice || null,
        procedureJustification: run?.answers?.procedureJustification || "",
        language: "fr",
      };

      const apiData = await postJSON(`${API_BASE}/justice-lab/audience`, payload);

      const merged = mergeAudienceWithTemplates(caseData, apiData);
      const scene = { ...(merged || {}) };

      setTurns(Array.isArray(merged.turns) ? merged.turns : []);
      setObjections(Array.isArray(merged.objections) ? merged.objections : []);

      const firstId = merged?.objections?.[0]?.id || null;
      if (firstId && !selectedObjId) setSelectedObjId(firstId);

      const updatedRun = setAudienceSceneOnRun(run, scene);
      upsertAndSetActive(updatedRun);
      setRun(updatedRun);

      // petit patch state facultatif (safe)
      patchActiveRun({
        answers: {
          ...(updatedRun.answers || {}),
          audience: {
            ...(updatedRun.answers?.audience || {}),
            scene,
          },
        },
      });
    } catch (e) {
      console.warn(e);
      setApiError(
        "Impossible de charger l’audience IA. Vérifie le token, Render, ou l’endpoint /justice-lab/audience."
      );
    } finally {
      setLoading(false);
    }
  }

  // init from persisted scene OR call IA
  useEffect(() => {
    if (!run || !caseData) return;

    const already = run?.answers?.audience?.scene || null;
    const hasTurns = Array.isArray(already?.turns) && already.turns.length;
    const hasObjs = Array.isArray(already?.objections) && already.objections.length;

    if (hasTurns || hasObjs) {
      setTurns(Array.isArray(already.turns) ? already.turns : []);
      setObjections(Array.isArray(already.objections) ? already.objections : []);
      const first = already?.objections?.[0]?.id || null;
      if (first && !selectedObjId) setSelectedObjId(first);
      return;
    }

    loadAudience();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, caseData]);

  // sync editor when selecting objection (V5 decisions format)
  useEffect(() => {
    if (!run || !selectedObjection) return;
    const decisions = Array.isArray(run?.answers?.audience?.decisions) ? run.answers.audience.decisions : [];
    const d = decisions.find((x) => x.objectionId === selectedObjection.id) || null;

    if (d?.decision) setChoice(d.decision);
    else setChoice(bestChoiceByRole(selectedObjection, role) || "Demander précision");

    if (typeof d?.reasoning === "string") setReasoning(d.reasoning);
    else setReasoning("");

    // par défaut verrouillé; on déverrouille via bouton
    setReasoningLocked(true);

    setInstantFeedback(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedObjId]);

  function applyAndSaveDecision() {
    if (!run || !selectedObjection) return;

    const payload = {
      objectionId: selectedObjection.id,
      decision: choice,
      reasoning: safeStr(reasoning, 1200),
      role,
      effects: selectedObjection.effects || selectedObjection.effect || null,
    };

    const next = applyAudienceDecision(run, payload);

    upsertAndSetActive(next);
    setRun(next);
    patchActiveRun(next); // persistance “safe” via storage

    setLastSavedAt(nowIso());
    setReasoningLocked(true);

    // feedback instant + impacts (pièces/tâches)
    const best = bestChoiceByRole(selectedObjection, role);
    const ok = best ? best === choice : null;

    const impact = [];
    const eff = selectedObjection?.effects || selectedObjection?.effect || null;
    const key = choice === "Accueillir" ? "onAccueillir" : choice === "Rejeter" ? "onRejeter" : "onDemander";
    const pick = eff?.[key] || null;

    if (pick?.excludePieceIds?.length) impact.push(`🧾 Pièce(s) écartée(s) : ${pick.excludePieceIds.join(", ")}`);
    if (pick?.admitLatePieceIds?.length) impact.push(`📎 Pièce(s) tardive(s) admise(s) : ${pick.admitLatePieceIds.join(", ")}`);
    if (pick?.addTask?.label) impact.push(`✅ Action : ${pick.addTask.label}`);
    if (pick?.clarification?.label) impact.push(`🔎 Précision : ${pick.clarification.label}`);
    if (!impact.length) impact.push("ℹ️ Aucun effet procédural direct (bonus/risque interne possible).");

    setInstantFeedback({
      ok,
      best,
      choice,
      title: selectedObjection.title,
      suggestion:
        ok === true
          ? "Bonne cohérence. Ajoute 1–2 phrases (contradictoire + base juridique/procédurale)."
          : ok === false
          ? `Pour le rôle ${role}, le choix “${best}” est souvent plus sûr. Motive pour réduire le risque d’appel.`
          : "Motivation correcte si reliée aux principes (contradictoire, pertinence, délais, proportionnalité).",
      impact,
    });
  }

  function goBackToPlay() {
    const cid = run?.caseId || run?.caseMeta?.caseId;
    if (cid) navigate(`/justice-lab/play/${encodeURIComponent(cid)}`);
    else navigate("/justice-lab");
  }

  if (!run || !(run?.caseId || run?.caseMeta?.caseId)) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h1 className="text-2xl font-semibold">🏛️ Audience</h1>
            <p className="text-slate-300 mt-2">Aucune session Justice Lab active trouvée.</p>
            <Link to="/justice-lab" className="inline-flex mt-4 text-emerald-300 underline">
              Retour Justice Lab
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const piecesSummary = useMemo(
    () => (caseData ? getPiecesStatusSummary(run, caseData) : { ok: [], admittedLate: [], excluded: [], counts: { ok: 0, admittedLate: 0, excluded: 0, total: 0 } }),
    [run, caseData]
  );

  const excludedPieces = piecesSummary.excluded || [];
  const latePieces = piecesSummary.admittedLate || [];
  const okPieces = piecesSummary.ok || [];

  const audit = Array.isArray(run?.state?.auditLog) ? run.state.auditLog : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-slate-400">
              <Link to="/justice-lab" className="hover:underline">
                Justice Lab
              </Link>{" "}
              <span className="opacity-60">/</span> <span className="text-slate-200 font-semibold">Audience</span>
            </div>

            <h1 className="text-2xl font-semibold mt-2">🏛️ Audience simulée</h1>

            <div className="mt-1 text-sm text-slate-300">
              Dossier:{" "}
              <span className="text-slate-100 font-semibold">{run?.caseId || run?.caseMeta?.caseId}</span> • Rôle:{" "}
              <span className="text-slate-100 font-semibold">{role}</span>
              {lastSavedAt ? <span className="text-slate-400"> • Dernier enregistrement {formatTime(lastSavedAt)}</span> : null}
            </div>

            {sceneMeta ? (
              <div className="mt-2 text-xs text-slate-400">
                {sceneMeta.tribunal ? `${sceneMeta.tribunal}` : "Juridiction"}{" "}
                {sceneMeta.chambre ? `• ${sceneMeta.chambre}` : ""}{" "}
                {sceneMeta.ville ? `• ${sceneMeta.ville}` : ""}{" "}
                {sceneMeta.date ? `• ${sceneMeta.date}` : ""}{" "}
                {sceneMeta.dossier ? `• Ref: ${sceneMeta.dossier}` : ""}{" "}
                {sceneMeta.audienceType ? `• ${sceneMeta.audienceType}` : ""}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={goBackToPlay}
              className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
            >
              ← Retour Play
            </button>

            <button
              onClick={() => navigate("/justice-lab")}
              className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
            >
              Quitter
            </button>
          </div>
        </div>

        {apiError ? (
          <div className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
            {apiError}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* left */}
          <div className="lg:col-span-2 space-y-4">
            {/* phases */}
            {phases?.length ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400 font-semibold">Phases</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {phases.map((p) => (
                    <div key={p.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                      <div className="text-sm text-slate-100 font-semibold">{p.title}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* turns */}
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400 font-semibold">Transcription</div>
                {loading ? <div className="text-xs text-slate-400">Chargement…</div> : null}
              </div>

              <div className="mt-3 space-y-2 max-h-[320px] overflow-auto pr-1">
                {(turns || []).map((t, i) => (
                  <div key={i} className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                    <div className="text-xs text-slate-400">{safeStr(t.speaker, 24)}</div>
                    <div className="text-sm text-slate-100 mt-1">{safeStr(t.text, 900)}</div>
                  </div>
                ))}
                {!turns?.length ? <div className="text-sm text-slate-400">Aucune transcription.</div> : null}
              </div>
            </div>

            {/* pieces */}
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400 font-semibold">Pièces</div>
                <div className="text-xs text-slate-400">
                  OK: {okPieces.length} • Écartées: {excludedPieces.length} • Tardives admises: {latePieces.length}
                </div>
              </div>

              {(excludedPieces.length || latePieces.length) ? (
                <div className="mt-3 grid gap-2">
                  {excludedPieces.length ? (
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                      <div className="text-xs font-semibold text-amber-100">🧾 Pièces écartées</div>
                      <div className="mt-1 text-xs text-amber-50/90">
                        {excludedPieces.map((p) => `${p.id} — ${p.title}`).join(" • ")}
                      </div>
                    </div>
                  ) : null}

                  {latePieces.length ? (
                    <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3">
                      <div className="text-xs font-semibold text-violet-100">📎 Pièces admises tardivement</div>
                      <div className="mt-1 text-xs text-violet-50/90">
                        {latePieces.map((p) => `${p.id} — ${p.title}`).join(" • ")}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {[...okPieces, ...latePieces, ...excludedPieces].map((p) => (
                  <div
                    key={p.id}
                    className={cls(
                      "rounded-2xl border p-3",
                      p.status === "EXCLUDEE"
                        ? "border-amber-500/30 bg-amber-500/10"
                        : p.status === "TARDIVE_ADMISE"
                        ? "border-violet-500/30 bg-violet-500/10"
                        : "border-white/10 bg-slate-950/40"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{p.title}</div>
                      <div className="text-[11px] text-slate-300">{p.type}</div>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      {p.status === "EXCLUDEE" ? "🧾 Écartée" : p.status === "TARDIVE_ADMISE" ? "📎 Tardive admise" : "OK"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* audit */}
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400 font-semibold">
                  Journal d’audience (audit log)
                </div>
                <div className="text-xs text-slate-400">{audit.length} événement(s)</div>
              </div>

              <div className="mt-3 space-y-2 max-h-[260px] overflow-auto pr-1">
                {audit.slice(0, 80).map((a, i) => (
                  <div key={a.id || i} className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-slate-200">
                        <span className="text-slate-400">{formatTime(a.ts || a.at)}</span> •{" "}
                        <span className="font-semibold">{safeStr(a.title || a.action || a.type, 60)}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">{safeStr(a.type || a.kind, 24)}</div>
                    </div>
                    {a.detail ? <div className="mt-1 text-xs text-slate-300">{safeStr(a.detail, 280)}</div> : null}
                  </div>
                ))}
                {!audit.length ? <div className="text-sm text-slate-400">Aucune action enregistrée.</div> : null}
              </div>
            </div>
          </div>

          {/* right */}
          <div className="space-y-4">
            {/* objections */}
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">🎯 Objections</h2>
                <div className="text-xs text-slate-400">{objections.length}</div>
              </div>

              <div className="mt-3 space-y-2">
                {(objections || []).map((o) => {
                  const active = o.id === selectedObjId;
                  const decisions = Array.isArray(run?.answers?.audience?.decisions) ? run.answers.audience.decisions : [];
                  const decided = decisions.some((x) => x.objectionId === o.id);

                  return (
                    <button
                      key={o.id}
                      onClick={() => setSelectedObjId(o.id)}
                      className={cls(
                        "w-full text-left rounded-2xl border p-3 transition",
                        active
                          ? "border-emerald-500/30 bg-emerald-500/10"
                          : "border-white/10 bg-slate-950/40 hover:bg-white/5"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400 font-semibold">
                          {safeStr(o.by, 24)}
                        </div>
                        {decided ? (
                          <span className="text-[11px] px-2 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                            Décidé
                          </span>
                        ) : (
                          <span className="text-[11px] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-slate-300">
                            À trancher
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-semibold mt-1">{safeStr(o.title, 90)}</div>
                      <div className="text-xs text-slate-300 mt-1 line-clamp-2">{safeStr(o.statement, 180)}</div>
                    </button>
                  );
                })}

                {!objections.length ? <div className="text-sm text-slate-400">Aucune objection.</div> : null}
              </div>
            </div>

            {/* decision */}
            {selectedObjection ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">🧑🏽‍⚖️ Décision sur objection</h2>
                  <div className="text-[11px] text-slate-400">{selectedObjection.id}</div>
                </div>

                <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">
                      {safeStr(selectedObjection.by, 24)}
                    </div>

                    {bestChoiceByRole(selectedObjection, role) ? (
                      <span className="text-[11px] px-2 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-200">
                        Best (rôle {role}) : {bestChoiceByRole(selectedObjection, role)}
                      </span>
                    ) : (
                      <span className="text-[11px] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-slate-300">
                        Best: auto
                      </span>
                    )}
                  </div>

                  <div className="text-sm font-semibold mt-2">{safeStr(selectedObjection.title, 100)}</div>
                  <div className="text-sm text-slate-200 mt-2 whitespace-pre-wrap">
                    {safeStr(selectedObjection.statement, 2000)}
                  </div>

                  <div className="mt-4">
                    <div className="text-xs text-slate-400 font-semibold mb-2">Décision</div>
                    <div className="flex gap-2 flex-wrap">
                      {["Accueillir", "Rejeter", "Demander précision"].map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setChoice(opt)}
                          className={cls(
                            "px-3 py-2 rounded-xl border text-xs transition",
                            choice === opt
                              ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-200"
                              : "border-white/10 bg-white/5 hover:bg-white/10"
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-slate-400 font-semibold">
                          Motivation {reasoningLocked ? "🔒 (verrouillée)" : "✍️ (édition)"}
                        </div>

                        {reasoningLocked ? (
                          <button
                            type="button"
                            onClick={() => setReasoningLocked(false)}
                            className="text-[11px] px-2 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition"
                          >
                            Modifier
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setReasoningLocked(true)}
                            className="text-[11px] px-2 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 transition text-emerald-100"
                          >
                            Verrouiller
                          </button>
                        )}
                      </div>

                      <textarea
                        value={reasoning}
                        onChange={(e) => setReasoning(e.target.value)}
                        disabled={reasoningLocked}
                        placeholder="Motivation courte (contradictoire, recevabilité, régularité, droits de la défense...)"
                        className={cls(
                          "w-full min-h-[120px] rounded-2xl border p-3 text-sm outline-none",
                          reasoningLocked
                            ? "border-white/10 bg-slate-950/30 text-slate-200/90 cursor-not-allowed opacity-85"
                            : "border-white/10 bg-slate-950/50 focus:border-emerald-400/60"
                        )}
                      />
                      <div className="text-[11px] text-slate-400 mt-1">
                        Conseil : 2–5 phrases, puis cite le principe (contradictoire / pertinence / délais / proportionnalité).
                      </div>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={applyAndSaveDecision}
                        className="flex-1 px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-indigo-500 hover:from-emerald-600 hover:to-indigo-600 transition font-semibold"
                      >
                        ✅ Enregistrer (avec effets)
                      </button>

                      <button
                        onClick={goBackToPlay}
                        className="px-4 py-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition font-semibold"
                      >
                        Continuer →
                      </button>
                    </div>
                  </div>
                </div>

                {instantFeedback ? (
                  <div
                    className={cls(
                      "mt-4 rounded-2xl border p-4",
                      instantFeedback.ok === true
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-50"
                        : instantFeedback.ok === false
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-50"
                        : "border-white/10 bg-white/5 text-slate-100"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">
                        {instantFeedback.ok === true
                          ? "✅ Feedback instant"
                          : instantFeedback.ok === false
                          ? "⚠️ Feedback instant"
                          : "ℹ️ Feedback instant"}
                      </div>
                      <div className="text-[11px] text-slate-300">{instantFeedback.choice}</div>
                    </div>
                    <div className="mt-1 text-xs opacity-90">{instantFeedback.suggestion}</div>

                    <div className="mt-3 text-xs text-slate-200">
                      <div className="text-slate-400">Impact moteur :</div>
                      <ul className="mt-1 space-y-1">
                        {instantFeedback.impact.map((x, i) => (
                          <li key={i}>• {x}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 text-xs text-slate-500">
                  Cette page utilise le moteur <code>applyAudienceDecision(payload)</code> : audit log + pièces + tâches + scoring audience.
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
