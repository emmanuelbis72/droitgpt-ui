// src/auth/api.js
export async function authFetch(url, options = {}, auth = null) {
  // auth = { accessToken, logout }
  const headers = new Headers(options.headers || {});

  if (auth?.accessToken) {
    headers.set("Authorization", `Bearer ${auth.accessToken}`);
  }

  const res = await fetch(url, { ...options, headers });

  // Si backend répond 401 => logout + redirect login
  if (res.status === 401 && auth?.logout) {
    auth.logout();
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?next=${next}`;
    return res;
  }

  return res;
}
