import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const AuthContext = createContext(null);

const STORAGE_KEY = "droitgpt_access_token";

// 👉 Backend attendu:
// POST  /auth/register  { fullName, phone, password } => { accessToken, user }
// POST  /auth/login     { phone, password }          => { accessToken, user }
// GET   /auth/me        (Bearer token)               => { user }
const AUTH_BASE_URL =
  import.meta.env.VITE_AUTH_API_URL || "https://droitgpt-indexer.onrender.com/auth";

async function parseError(res) {
  try {
    const data = await res.json();
    return data?.error || data?.message || JSON.stringify(data);
  } catch {
    try {
      const raw = await res.text();
      return raw || "Requête échouée.";
    } catch {
      return "Requête échouée.";
    }
  }
}

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [user, setUser] = useState(null);
  const [isReady, setIsReady] = useState(false);

  const saveToken = (token) => {
    const t = token || "";
    if (t) localStorage.setItem(STORAGE_KEY, t);
    else localStorage.removeItem(STORAGE_KEY);
    setAccessToken(t);
  };

  const refreshMe = async (token = accessToken) => {
    if (!token) {
      setUser(null);
      return null;
    }

    const res = await fetch(`${AUTH_BASE_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      saveToken("");
      setUser(null);
      return null;
    }

    const data = await res.json().catch(() => null);
    const u = data?.user || data;
    setUser(u || null);
    return u || null;
  };

  useEffect(() => {
    const run = async () => {
      setIsReady(false);
      try {
        await refreshMe(accessToken);
      } catch {
        // backend down: user null, token conservé (le user devra réessayer)
        setUser(null);
      } finally {
        setIsReady(true);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // ✅ Auth “réelle” = token présent + user chargé
  const isAuthenticated = !!accessToken && !!user;

  // ✅ LOGIN : { phone, password }
  const login = async ({ phone, password }) => {
    const res = await fetch(`${AUTH_BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    });

    if (!res.ok) {
      const msg = await parseError(res);
      throw new Error(msg || "Connexion échouée.");
    }

    const data = await res.json().catch(() => null);
    if (!data?.accessToken) throw new Error("Réponse invalide (accessToken manquant).");

    saveToken(data.accessToken);

    // user optionnel dans la réponse; sinon on fetch /me
    if (data?.user) setUser(data.user);
    else await refreshMe(data.accessToken);

    return true;
  };

  // ✅ REGISTER : { fullName, phone, password }
  const register = async ({ fullName, phone, password }) => {
    const res = await fetch(`${AUTH_BASE_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, phone, password }),
    });

    if (!res.ok) {
      const msg = await parseError(res);
      throw new Error(msg || "Inscription échouée.");
    }

    const data = await res.json().catch(() => null);

    if (data?.accessToken) {
      saveToken(data.accessToken);
      if (data?.user) setUser(data.user);
      else await refreshMe(data.accessToken);
    }

    return true;
  };

  const logout = async () => {
    // Optionnel: prévenir le backend (ne bloque pas si ça échoue)
    try {
      if (accessToken) {
        await fetch(`${AUTH_BASE_URL}/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
    } catch {
      // ignore
    } finally {
      saveToken("");
      setUser(null);
    }
  };

  const value = useMemo(
    () => ({
      accessToken,
      isAuthenticated,
      isReady,
      user,
      login,
      register,
      logout,
      refreshMe,
      AUTH_BASE_URL,
    }),
    [accessToken, isAuthenticated, isReady, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
