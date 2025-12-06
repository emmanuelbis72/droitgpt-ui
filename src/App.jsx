// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home.jsx";
import ChatInterface from "./components/ChatInterface.jsx";
import Generate from "./components/Generate.jsx";
import Analyse from "./components/Analyse.jsx";

// Assistant vocal
import AssistantVocal from "./components/AssistantVocal.jsx";

// 🎓 Pages Académie
import Academie from "./pages/Academie.jsx";
import AcademieProgramme from "./pages/AcademieProgramme.jsx";
import AcademieLecon from "./pages/AcademieLecon.jsx";
import AcademieDashboard from "./pages/AcademieDashboard.jsx"; // ✅ nouveau

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Accueil */}
        <Route path="/" element={<Home />} />

        {/* Chat juridique */}
        <Route path="/chat" element={<ChatInterface />} />

        {/* Génération PDF */}
        <Route path="/generate" element={<Generate />} />

        {/* Analyse de documents */}
        <Route path="/analyse" element={<Analyse />} />

        {/* Assistant vocal */}
        <Route path="/assistant-vocal" element={<AssistantVocal />} />

        {/* 🎓 DroitGPT Académie – liste des modules */}
        <Route path="/academie" element={<Academie />} />

        {/* 🎓 Tableau de bord Académie */}
        <Route
          path="/academie/dashboard"
          element={<AcademieDashboard />}
        />

        {/* 🎓 Programme détaillé d’un module */}
        <Route
          path="/academie/programme/:id"
          element={<AcademieProgramme />}
        />

        {/* 🎓 Chapitre / leçon d’un module */}
        <Route
          path="/academie/programme/:id/lesson/:lessonId"
          element={<AcademieLecon />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
