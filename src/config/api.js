function cleanBaseUrl(value, fallback) {
  return String(value || fallback || "").replace(/\/$/, "");
}

export const API_BASE = cleanBaseUrl(
  import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL,
  "https://droitgpt-indexer.onrender.com"
);

export const BP_API_BASE = cleanBaseUrl(
  import.meta.env.VITE_BP_API_BASE,
  "https://businessplan-v9yy.onrender.com"
);
