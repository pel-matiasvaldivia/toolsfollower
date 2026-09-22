const BASE = import.meta.env.VITE_API_URL ?? '/api';

export function getToken() {
  return localStorage.getItem('trazza_token');
}
export function setSession(token: string, tenant: unknown, user: unknown) {
  localStorage.setItem('trazza_token', token);
  localStorage.setItem('trazza_tenant', JSON.stringify(tenant));
  localStorage.setItem('trazza_user', JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem('trazza_token');
  localStorage.removeItem('trazza_tenant');
  localStorage.removeItem('trazza_user');
}

export async function api(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error ${res.status}`);
  }
  return res.json();
}
