// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Home from "./pages/Home.jsx";

import { AuthProvider } from "./auth/AuthContext.jsx";
import ProtectedRoute from "./auth/ProtectedRoute.jsx";

// ✅ Admin (protégé par rôle)
import AdminRoute from "./auth/AdminRoute.jsx";
import Admin from "./pages/Admin.jsx";

// Pages / components
import ChatInterface from "./components/ChatInterface.jsx";
import Generate from "./components/Generate.jsx";
import Analyse from "./components/Analyse.jsx";
import AssistantVocal from "./components/AssistantVocal.jsx";

// Auth UI
import Login from "./components/Login.jsx";
import Register from "./components/Register.jsx";

// 🎓 Pages Académie
import Academie from "./pages/Academie.jsx";
import AcademieProgramme from "./pages/AcademieProgramme.jsx";
import AcademieLecon from "./pages/AcademieLecon.jsx";
import AcademieDashboard from "./pages/AcademieDashboard.jsx";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* ✅ Admin (invisible pour les autres) */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            }
          />

          {/* Protected */}
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <ChatInterface />
              </ProtectedRoute>
            }
          />

          <Route
            path="/generate"
            element={
              <ProtectedRoute>
                <Generate />
              </ProtectedRoute>
            }
          />

          <Route
            path="/analyse"
            element={
              <ProtectedRoute>
                <Analyse />
              </ProtectedRoute>
            }
          />

          <Route
            path="/assistant-vocal"
            element={
              <ProtectedRoute>
                <AssistantVocal />
              </ProtectedRoute>
            }
          />

          {/* Académie (protégé, même si le lien est en pause côté Home) */}
          <Route
            path="/academie"
            element={
              <ProtectedRoute>
                <Academie />
              </ProtectedRoute>
            }
          />

          <Route
            path="/academie/dashboard"
            element={
              <ProtectedRoute>
                <AcademieDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/academie/programme/:id"
            element={
              <ProtectedRoute>
                <AcademieProgramme />
              </ProtectedRoute>
            }
          />

          <Route
            path="/academie/programme/:id/lesson/:lessonId"
            element={
              <ProtectedRoute>
                <AcademieLecon />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
