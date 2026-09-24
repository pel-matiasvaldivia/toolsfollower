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
  // Sesión inválida/expirada (token viejo o tenant inexistente): limpiar y volver
  // al login. Sólo si había sesión, para no romper el form de login/registro.
  if (res.status === 401 && token) {
    clearSession();
    window.location.reload();
    throw new Error('Sesión expirada. Ingresá de nuevo.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error ${res.status}`);
  }
  return res.json();
}
