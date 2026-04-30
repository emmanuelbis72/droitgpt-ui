function cleanBaseUrl(value, fallback) {
  return String(value || fallback || "").replace(/\/$/, "");
}

export const API_BASE = cleanBaseUrl(
  import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL,
  "https://droitgpt-indexer.onrender.com"
);

export const ANALYSE_API = cleanBaseUrl(
  import.meta.env.VITE_ANALYSE_BASE || import.meta.env.VITE_ANALYSE_API_URL,
  "https://droitgpt-analysepdf.onrender.com"
);

export const BP_API_BASE = cleanBaseUrl(
  import.meta.env.VITE_BP_API_BASE,
  "https://businessplan-v9yy.onrender.com"
);
