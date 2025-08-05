// 📄 app.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import ChatInterface from './components/ChatInterface';
import Generate from './components/Generate';
import Analyse from './components/Analyse'; // ✅ le vrai fichier

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<ChatInterface />} />
        <Route path="/generate" element={<Generate />} />
        <Route path="/analyse" element={<Analyse />} /> {/* ✅ Route OK */}
      </Routes>
    </Router>
  );
}
