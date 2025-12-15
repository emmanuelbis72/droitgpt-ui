import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

export default function AdminRoute({ children }) {
  const { isReady, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isReady) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-slate-200">
        Chargement…
      </div>
    );
  }

  // Pas connecté -> login
  if (!isAuthenticated) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  // Connecté mais pas admin -> 404 (pour ne rien révéler)
  if ((user?.role || "user") !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}
