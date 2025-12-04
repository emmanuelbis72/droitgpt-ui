// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home.jsx";
import ChatInterface from "./components/ChatInterface.jsx";
import Generate from "./components/Generate.jsx";
import Analyse from "./components/Analyse.jsx";

// ✅ CORRECTION : AssistantVocal se trouve dans src/components
import AssistantVocal from "./components/AssistantVocal.jsx";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Page d'accueil */}
        <Route path="/" element={<Home />} />

        {/* Chat juridique */}
        <Route path="/chat" element={<ChatInterface />} />

        {/* Génération de PDF */}
        <Route path="/generate" element={<Generate />} />

        {/* Analyse de documents */}
        <Route path="/analyse" element={<Analyse />} />

        {/* Assistant vocal */}
        <Route path="/assistant-vocal" element={<AssistantVocal />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
