import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const AuthContext = createContext(null);

const STORAGE_KEY = "droitgpt_access_token";

// Backend attendu:
// POST  /auth/register        { fullName, phone, email?, password } => { accessToken, user }
// POST  /auth/login           { identifier|phone|email, password } => { accessToken, user }
// POST  /auth/forgot-password { email }
// POST  /auth/reset-password  { token, password } => { accessToken, user }
// GET   /auth/me        (Bearer token)               => { user }
const AUTH_BASE_URL =
  import.meta.env.VITE_AUTH_API_URL || "https://droitgpt-indexer.onrender.com/auth";

// ✅ Option : désactiver l'auth en local/dev (utile pour tester /bp sans bruit 401)
const DISABLE_AUTH =
  String(import.meta.env.VITE_DISABLE_AUTH || "").toLowerCase() === "1" ||
  String(import.meta.env.VITE_DISABLE_AUTH || "").toLowerCase() === "true";

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
  const [accessToken, setAccessToken] = useState(
    () => localStorage.getItem(STORAGE_KEY) || ""
  );
  const [user, setUser] = useState(null);
  const [isReady, setIsReady] = useState(false);

  // ✅ Anti double-fetch en DEV (React StrictMode)
  const lastMeCheckRef = useRef({ token: "", ts: 0 });

  const saveToken = (token) => {
    const t = token || "";
    if (t) localStorage.setItem(STORAGE_KEY, t);
    else localStorage.removeItem(STORAGE_KEY);
    setAccessToken(t);
  };

  const refreshMe = async (token = accessToken) => {
    if (DISABLE_AUTH) {
      setUser(null);
      return null;
    }

    if (!token) {
      setUser(null);
      return null;
    }

    // DEV StrictMode -> évite 2 appels /me identiques dans la même seconde
    if (import.meta.env.DEV) {
      const now = Date.now();
      if (
        lastMeCheckRef.current.token === token &&
        now - lastMeCheckRef.current.ts < 1500
      ) {
        return user || null;
      }
      lastMeCheckRef.current = { token, ts: now };
    }

    const res = await fetch(`${AUTH_BASE_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // ✅ 401 = "pas connecté" : ne pas spammer, ne pas bloquer
    if (res.status === 401) {
      // Token invalide/expiré -> on nettoie pour éviter des appels futurs
      saveToken("");
      setUser(null);
      return null;
    }

    if (!res.ok) {
      // Autres erreurs (500, 503, etc.) -> on ne bloque pas l'app
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

      if (DISABLE_AUTH) {
        setUser(null);
        setIsReady(true);
        return;
      }

      try {
        await refreshMe(accessToken);
      } catch {
        // backend down: user null, token conservé (l'utilisateur réessaiera)
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

  // LOGIN : { identifier|phone|email, password }
  const login = async ({ identifier, phone, email, password }) => {
    const res = await fetch(`${AUTH_BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, phone, email, password }),
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

  // REGISTER : { fullName, phone, email?, password }
  const register = async ({ fullName, phone, email, password }) => {
    const res = await fetch(`${AUTH_BASE_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, phone, email, password }),
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

  const forgotPassword = async ({ email }) => {
    const res = await fetch(`${AUTH_BASE_URL}/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      const msg = await parseError(res);
      throw new Error(msg || "Demande de réinitialisation impossible.");
    }

    return res.json().catch(() => ({ ok: true }));
  };

  const resetPassword = async ({ token, password }) => {
    const res = await fetch(`${AUTH_BASE_URL}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    if (!res.ok) {
      const msg = await parseError(res);
      throw new Error(msg || "Réinitialisation impossible.");
    }

    const data = await res.json().catch(() => null);
    if (!data?.accessToken) throw new Error("Réponse invalide (accessToken manquant).");
    saveToken(data.accessToken);
    if (data?.user) setUser(data.user);
    else await refreshMe(data.accessToken);
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
      forgotPassword,
      resetPassword,
      logout,
      refreshMe,
      AUTH_BASE_URL,
      DISABLE_AUTH,
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
