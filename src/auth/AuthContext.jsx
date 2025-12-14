import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const AuthContext = createContext(null);

const STORAGE_KEY = "droitgpt_access_token";

// 👉 Ton backend devra exposer ces routes:
// POST  /auth/register  { email, password }
// POST  /auth/login     { email, password }  => { accessToken }
// GET   /auth/me        (Bearer token)       => { user }
const AUTH_BASE_URL =
  import.meta.env.VITE_AUTH_API_URL || "https://droitgpt-indexer.onrender.com/auth";

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [user, setUser] = useState(null);
  const [isReady, setIsReady] = useState(false);

  const isAuthenticated = !!accessToken;

  useEffect(() => {
    // Tente de charger /auth/me si token présent
    const run = async () => {
      if (!accessToken) {
        setUser(null);
        setIsReady(true);
        return;
      }

      try {
        const res = await fetch(`${AUTH_BASE_URL}/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) {
          // token invalide / expiré
          localStorage.removeItem(STORAGE_KEY);
          setAccessToken("");
          setUser(null);
          setIsReady(true);
          return;
        }

        const data = await res.json();
        setUser(data.user || data);
      } catch {
        // si le backend est down, on reste "ready" mais sans user
        setUser(null);
      } finally {
        setIsReady(true);
      }
    };

    run();
  }, [accessToken]);

  const login = async ({ email, password }) => {
    const res = await fetch(`${AUTH_BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const raw = await res.text();
      throw new Error(raw || "Connexion échouée.");
    }

    const data = await res.json();
    if (!data?.accessToken) throw new Error("Réponse invalide (accessToken manquant).");

    localStorage.setItem(STORAGE_KEY, data.accessToken);
    setAccessToken(data.accessToken);
    return true;
  };

  const register = async ({ email, password }) => {
    const res = await fetch(`${AUTH_BASE_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const raw = await res.text();
      throw new Error(raw || "Inscription échouée.");
    }

    // Option: auto-login si le backend renvoie accessToken
    const data = await res.json().catch(() => null);
    if (data?.accessToken) {
      localStorage.setItem(STORAGE_KEY, data.accessToken);
      setAccessToken(data.accessToken);
    }
    return true;
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setAccessToken("");
    setUser(null);
  };

  const value = useMemo(
    () => ({ accessToken, isAuthenticated, isReady, user, login, register, logout, AUTH_BASE_URL }),
    [accessToken, isAuthenticated, isReady, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
