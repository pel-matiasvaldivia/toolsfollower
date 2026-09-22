import { useEffect, useState, Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken, setSession, clearSession } from '../lib/api';
import type { MapAsset, MapGeofence } from './MapView';

const MapView = lazy(() => import('./MapView'));

export default function AppShell() {
  const [authed, setAuthed] = useState(!!getToken());
  return authed ? <Dashboard onLogout={() => { clearSession(); setAuthed(false); }} />
                : <Login onAuthed={() => setAuthed(true)} />;
}

/* ------------------------------ Login ------------------------------ */
function Login({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ company: '', name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const data = await api(path, { method: 'POST', body: JSON.stringify(form) });
      setSession(data.token, data.tenant, data.user);
      onAuthed();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <svg viewBox="0 0 32 32" className="h-9 w-9"><rect width="32" height="32" rx="7" fill="#f59e0b" /><path d="M16 6 L25 22 H7 Z" fill="none" stroke="#0e1116" strokeWidth="2.6" strokeLinejoin="round" /><circle cx="16" cy="18" r="2.6" fill="#0e1116" /></svg>
          <span className="text-2xl font-extrabold text-white">Trazza</span>
        </Link>
        <div className="card">
          <div className="mb-6 flex rounded-lg bg-graphite-900 p-1 text-sm font-semibold">
            {(['login', 'register'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 rounded-md py-2 transition ${mode === m ? 'bg-amber-500 text-graphite-950' : 'text-graphite-300'}`}>
                {m === 'login' ? 'Ingresar' : 'Crear cuenta'}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-3">
            {mode === 'register' && (
              <>
                <Field label="Empresa" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
                <Field label="Tu nombre" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              </>
            )}
            <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Field label="Contraseña" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button disabled={loading} className="btn-primary w-full">
              {loading ? 'Procesando…' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
            </button>
          </form>
        </div>
        <Link to="/" className="mt-6 block text-center text-sm text-graphite-400 hover:text-white">← Volver al inicio</Link>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }:
  { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-graphite-300">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required
        className="w-full rounded-lg border border-graphite-700 bg-graphite-900 px-3 py-2.5 text-white
                   outline-none focus:border-amber-500" />
    </label>
  );
}

/* ------------------------------ Dashboard ------------------------------ */
const MENDOZA = { lng: -68.8458, lat: -32.8895 };

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [summary, setSummary] = useState<any>(null);
  const [assets, setAssets] = useState<MapAsset[]>([]);
  const [geofences, setGeofences] = useState<MapGeofence[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [error, setError] = useState('');

  // Form de alta de dispositivo.
  const [dvKind, setDvKind] = useState<'gps' | 'lora' | 'rfid'>('gps');
  const [dvIdent, setDvIdent] = useState('');
  const [dvAsset, setDvAsset] = useState('');
  // Credencial recién generada (se muestra una sola vez).
  const [newKey, setNewKey] = useState<{ id: string; key: string } | null>(null);

  // Form de plan de mantenimiento.
  const [mpAsset, setMpAsset] = useState('');
  const [mpStrategy, setMpStrategy] = useState<'calendar' | 'hours'>('hours');
  const [mpInterval, setMpInterval] = useState(250);

  // Estado de creación de geocerca.
  const [picking, setPicking] = useState(false);
  const [gfName, setGfName] = useState('');
  const [gfRadius, setGfRadius] = useState(500);
  const [gfCenter, setGfCenter] = useState<{ lng: number; lat: number } | null>(null);

  const tenant = JSON.parse(localStorage.getItem('trazza_tenant') || '{}');
  // URL pública de la API (para configurar los trackers): dominio actual + /api.
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.startsWith('http')
    ? (import.meta.env.VITE_API_URL as string)
    : `${window.location.origin}/api`;

  const load = async () => {
    try {
      const [s, a, g, al, mp, dv] = await Promise.all([
        api('/summary'), api('/assets'), api('/geofences'), api('/alerts'),
        api('/maintenance/plans'), api('/devices'),
      ]);
      setSummary(s); setAssets(a.assets); setGeofences(g.geofences);
      setAlerts(al.alerts); setPlans(mp.plans); setDevices(dv.devices);
    } catch (err: any) { setError(err.message); }
  };
  useEffect(() => { load(); }, []);

  const addDemo = async () => {
    const tiers = ['gps', 'lora', 'rfid'];
    await api('/assets', { method: 'POST', body: JSON.stringify({
      name: `Herramienta ${Math.floor(Math.random() * 900 + 100)}`,
      tier: tiers[Math.floor(Math.random() * 3)],
      value_usd: Math.floor(Math.random() * 5000 + 200),
    })});
    load();
  };

  // Mueve cada activo a un punto aleatorio alrededor de Mendoza (demo de telemetría).
  const simulate = async () => {
    if (assets.length === 0) return;
    await Promise.all(assets.map((a) => api(`/assets/${a.id}/position`, {
      method: 'POST',
      body: JSON.stringify({
        lng: MENDOZA.lng + (Math.random() - 0.5) * 0.12,
        lat: MENDOZA.lat + (Math.random() - 0.5) * 0.12,
        battery: Math.floor(Math.random() * 60 + 40),
        // Suma horas de motor (para disparar mantenimiento por uso).
        engineHours: Math.floor(Math.random() * 300 + 50),
      }),
    })));
    load();
  };

  const createPlan = async () => {
    if (!mpAsset) return;
    const body: any = { assetId: mpAsset, strategy: mpStrategy };
    if (mpStrategy === 'hours') body.intervalHours = mpInterval;
    else body.intervalDays = mpInterval;
    await api('/maintenance/plans', { method: 'POST', body: JSON.stringify(body) });
    setMpAsset('');
    load();
  };

  const completePlan = async (id: string) => {
    await api(`/maintenance/plans/${id}/complete`, { method: 'POST', body: JSON.stringify({}) });
    load();
  };

  const createDevice = async () => {
    if (!dvIdent.trim()) return;
    try {
      const data = await api('/devices', { method: 'POST', body: JSON.stringify({
        kind: dvKind, identifier: dvIdent.trim(), assetId: dvAsset || null,
      })});
      setDvIdent(''); setDvAsset('');
      if (data.key) setNewKey({ id: data.device.id, key: data.key });
      load();
    } catch (err: any) { setError(err.message); }
  };

  const rotateKey = async (id: string) => {
    try {
      const data = await api(`/devices/${id}/rotate-key`, { method: 'POST', body: JSON.stringify({}) });
      if (data.key) setNewKey({ id, key: data.key });
      load();
    } catch (err: any) { setError(err.message); }
  };

  const bindDevice = async (id: string, assetId: string) => {
    await api(`/devices/${id}`, { method: 'PATCH', body: JSON.stringify({ assetId: assetId || null }) });
    load();
  };

  const deleteDevice = async (id: string) => {
    await api(`/devices/${id}`, { method: 'DELETE' });
    load();
  };

  const uploadPhoto = async (assetId: string, file: File) => {
    try {
      const { uploadUrl, key } = await api(`/assets/${assetId}/photo-upload`, {
        method: 'POST', body: JSON.stringify({ contentType: file.type }),
      });
      const put = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!put.ok) throw new Error('no se pudo subir la foto a MinIO');
      await api(`/assets/${assetId}/photo`, { method: 'PUT', body: JSON.stringify({ key }) });
      load();
    } catch (err: any) { setError(err.message); }
  };

  const createGeofence = async () => {
    if (!gfName || !gfCenter) return;
    await api('/geofences', { method: 'POST', body: JSON.stringify({
      name: gfName, center: [gfCenter.lng, gfCenter.lat], radiusM: gfRadius,
    })});
    setGfName(''); setGfCenter(null); setPicking(false);
    load();
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-graphite-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 32 32" className="h-7 w-7"><rect width="32" height="32" rx="7" fill="#f59e0b" /><path d="M16 6 L25 22 H7 Z" fill="none" stroke="#0e1116" strokeWidth="2.6" strokeLinejoin="round" /></svg>
            <span className="font-extrabold text-white">Trazza</span>
            <span className="ml-2 text-sm text-graphite-400">· {tenant.name}</span>
          </div>
          <button onClick={onLogout} className="text-sm text-graphite-300 hover:text-white">Salir</button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {error && <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Stat label="Activos" value={summary?.total ?? '—'} />
          <Stat label="GPS" value={summary?.gps ?? '—'} />
          <Stat label="LoRaWAN" value={summary?.lora ?? '—'} />
          <Stat label="RFID" value={summary?.rfid ?? '—'} />
          <Stat label="Alertas" value={summary?.open_alerts ?? '—'} />
        </div>

        {/* Mapa en vivo */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Mapa en vivo</h2>
          <div className="flex flex-wrap gap-2">
            <button onClick={simulate} className="btn-ghost py-2 text-sm">Simular movimiento</button>
            <button onClick={() => { setPicking((p) => !p); setGfCenter(null); }}
              className={`py-2 text-sm ${picking ? 'btn-primary' : 'btn-ghost'}`}>
              {picking ? 'Cancelar geocerca' : 'Nueva geocerca'}
            </button>
          </div>
        </div>

        {picking && (
          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
            <div className="flex-1">
              <p className="mb-2 text-sm text-amber-300">
                {gfCenter ? '✓ Centro elegido. Completá y creá.' : '① Hacé clic en el mapa para elegir el centro.'}
              </p>
              <div className="flex flex-wrap gap-3">
                <input value={gfName} onChange={(e) => setGfName(e.target.value)} placeholder="Nombre (ej. Obra Godoy Cruz)"
                  className="rounded-lg border border-graphite-700 bg-graphite-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500" />
                <label className="flex items-center gap-2 text-sm text-graphite-300">
                  Radio (m)
                  <input type="number" value={gfRadius} min={50} step={50}
                    onChange={(e) => setGfRadius(Number(e.target.value))}
                    className="w-24 rounded-lg border border-graphite-700 bg-graphite-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500" />
                </label>
                <button onClick={createGeofence} disabled={!gfName || !gfCenter}
                  className="btn-primary py-2 text-sm disabled:opacity-40">Crear geocerca</button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4">
          <Suspense fallback={<div className="flex h-[420px] items-center justify-center rounded-xl border border-graphite-700 text-graphite-400">Cargando mapa…</div>}>
            <MapView assets={assets} geofences={geofences} picking={picking}
              onPick={(lng, lat) => setGfCenter({ lng, lat })} />
          </Suspense>
        </div>

        {/* Alertas */}
        {alerts.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-lg font-semibold text-white">Alertas</h2>
            <div className="space-y-2">
              {alerts.slice(0, 8).map((al) => (
                <div key={al.id} className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${al.resolved_at ? 'border-graphite-700 bg-graphite-800/40 text-graphite-400' : 'border-amber-500/40 bg-amber-500/5 text-amber-200'}`}>
                  <span>{al.resolved_at ? '✓' : '⚠'} <strong>{al.asset_name ?? 'Activo'}</strong> — {al.message}</span>
                  <span className="text-xs opacity-70">{al.resolved_at ? 'resuelta' : 'abierta'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mantenimiento */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-white">Mantenimiento</h2>
          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-graphite-700 bg-graphite-800/40 p-4">
            <label className="text-sm text-graphite-300">
              <span className="mb-1 block">Activo</span>
              <select value={mpAsset} onChange={(e) => setMpAsset(e.target.value)}
                className="rounded-lg border border-graphite-700 bg-graphite-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500">
                <option value="">Elegí…</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="text-sm text-graphite-300">
              <span className="mb-1 block">Estrategia</span>
              <select value={mpStrategy} onChange={(e) => setMpStrategy(e.target.value as any)}
                className="rounded-lg border border-graphite-700 bg-graphite-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500">
                <option value="hours">Por horas de uso</option>
                <option value="calendar">Por calendario</option>
              </select>
            </label>
            <label className="text-sm text-graphite-300">
              <span className="mb-1 block">{mpStrategy === 'hours' ? 'Cada (horas)' : 'Cada (días)'}</span>
              <input type="number" min={1} value={mpInterval} onChange={(e) => setMpInterval(Number(e.target.value))}
                className="w-28 rounded-lg border border-graphite-700 bg-graphite-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500" />
            </label>
            <button onClick={createPlan} disabled={!mpAsset} className="btn-primary py-2 text-sm disabled:opacity-40">Crear plan</button>
          </div>

          {plans.length > 0 && (
            <div className="mt-4 space-y-2">
              {plans.map((p) => {
                const badge = p.status === 'overdue'
                  ? 'border-red-500/50 bg-red-500/10 text-red-300'
                  : p.status === 'due_soon'
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                  : 'border-graphite-700 bg-graphite-800/40 text-graphite-300';
                const label = p.status === 'overdue' ? 'Vencido' : p.status === 'due_soon' ? 'Vence pronto' : 'Al día';
                return (
                  <div key={p.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${badge}`}>
                    <div>
                      <strong className="text-white">{p.asset_name}</strong>
                      <span className="ml-2 opacity-80">
                        {p.strategy === 'hours'
                          ? `cada ${p.interval_hours} h · próx. ${p.next_due_hours} h (actual ${p.last_engine_hours ?? 0} h)`
                          : `cada ${p.interval_days} días · próx. ${p.next_due_at ? new Date(p.next_due_at).toLocaleDateString() : '—'}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded px-2 py-0.5 text-xs font-bold uppercase">{label}</span>
                      <button onClick={() => completePlan(p.id)} className="btn-ghost py-1.5 text-xs">Registrar service</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dispositivos */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-white">Dispositivos</h2>
          <p className="mt-1 text-sm text-graphite-400">
            Registrá el rastreador físico (IMEI para GPS/4G, DevEUI para LoRaWAN, EPC para RFID) y
            vinculalo a un activo. Luego apuntá el tracker a la ingesta de Trazza.
          </p>

          {/* Alta */}
          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-graphite-700 bg-graphite-800/40 p-4">
            <label className="text-sm text-graphite-300">
              <span className="mb-1 block">Tecnología</span>
              <select value={dvKind} onChange={(e) => setDvKind(e.target.value as any)}
                className="rounded-lg border border-graphite-700 bg-graphite-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500">
                <option value="gps">GPS / 4G</option>
                <option value="lora">LoRaWAN</option>
                <option value="rfid">RFID</option>
              </select>
            </label>
            <label className="text-sm text-graphite-300">
              <span className="mb-1 block">Identificador (IMEI/DevEUI/EPC)</span>
              <input value={dvIdent} onChange={(e) => setDvIdent(e.target.value)} placeholder="860123456789012"
                className="w-56 rounded-lg border border-graphite-700 bg-graphite-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500" />
            </label>
            <label className="text-sm text-graphite-300">
              <span className="mb-1 block">Activo (opcional)</span>
              <select value={dvAsset} onChange={(e) => setDvAsset(e.target.value)}
                className="rounded-lg border border-graphite-700 bg-graphite-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500">
                <option value="">Sin vincular…</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <button onClick={createDevice} disabled={!dvIdent.trim()} className="btn-primary py-2 text-sm disabled:opacity-40">
              Registrar dispositivo
            </button>
          </div>

          {/* Endpoint de ingesta para este tenant */}
          <div className="mt-3 rounded-xl border border-graphite-700 bg-graphite-900/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-graphite-400">Endpoint de ingesta (este cliente)</p>
            <code className="mt-1 block break-all text-xs text-amber-300">
              {`${apiBase}/telemetry/ingest`}
            </code>
            <p className="mt-1 text-xs text-graphite-500">
              Equipos que hablan HTTP directo: autenticá con la credencial del dispositivo
              (header <span className="text-graphite-300">X-Device-Key</span>) — no hace falta tenantId.
              Gateways (Traccar, LNS, MQTT) usan el token compartido + tenantId
              (<span className="text-graphite-300">{tenant.id ?? '—'}</span>).
            </p>
          </div>

          {newKey && (
            <div className="mt-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-200">Credencial del dispositivo — guardala ahora</p>
                  <p className="mt-1 text-xs text-amber-300/80">Se muestra una sola vez. Cargala en el dispositivo como header <span className="font-mono">X-Device-Key</span>.</p>
                  <code className="mt-2 block break-all rounded bg-graphite-950/60 px-3 py-2 font-mono text-xs text-amber-200">{newKey.key}</code>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => navigator.clipboard?.writeText(newKey.key)} className="btn-ghost py-1.5 text-xs">Copiar</button>
                  <button onClick={() => setNewKey(null)} className="btn-ghost py-1.5 text-xs">Listo</button>
                </div>
              </div>
            </div>
          )}

          {devices.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-xl border border-graphite-700">
              <table className="w-full text-sm">
                <thead className="bg-graphite-800 text-left text-graphite-300">
                  <tr>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Identificador</th>
                    <th className="px-4 py-3 font-medium">Credencial</th>
                    <th className="px-4 py-3 font-medium">Activo vinculado</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-graphite-800">
                  {devices.map((d) => (
                    <tr key={d.id} className="text-graphite-200">
                      <td className="px-4 py-3"><span className="rounded bg-graphite-700 px-2 py-0.5 text-xs font-bold uppercase text-amber-400">{d.kind}</span></td>
                      <td className="px-4 py-3 font-mono text-xs">{d.identifier}</td>
                      <td className="px-4 py-3 font-mono text-xs text-graphite-400">{d.key_prefix ? `${d.key_prefix}…` : '—'}</td>
                      <td className="px-4 py-3">
                        <select value={d.asset_id ?? ''} onChange={(e) => bindDevice(d.id, e.target.value)}
                          className="rounded-lg border border-graphite-700 bg-graphite-900 px-2 py-1 text-xs text-white outline-none focus:border-amber-500">
                          <option value="">Sin vincular</option>
                          {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => rotateKey(d.id)} className="text-xs text-graphite-400 hover:text-amber-400">Rotar clave</button>
                        <button onClick={() => deleteDevice(d.id)} className="ml-3 text-xs text-graphite-400 hover:text-red-400">Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Activos */}
        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Activos</h2>
          <button onClick={addDemo} className="btn-primary py-2 text-sm">+ Agregar activo</button>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-graphite-700">
          <table className="w-full text-sm">
            <thead className="bg-graphite-800 text-left text-graphite-300">
              <tr>
                <th className="px-4 py-3 font-medium">Foto</th>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Tecnología</th>
                <th className="px-4 py-3 font-medium">Valor USD</th>
                <th className="px-4 py-3 font-medium">Ubicación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-800">
              {assets.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-graphite-500">Sin activos todavía. Agregá el primero.</td></tr>
              )}
              {assets.map((a) => (
                <tr key={a.id} className="text-graphite-200">
                  <td className="px-4 py-3">
                    <label className="group relative flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-graphite-700 bg-graphite-900 text-graphite-500 hover:border-amber-500">
                      {(a as any).photo_url
                        ? <img src={(a as any).photo_url} alt={a.name} className="h-full w-full object-cover" />
                        : <span className="text-lg">＋</span>}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(a.id, f); e.target.value = ''; }} />
                    </label>
                  </td>
                  <td className="px-4 py-3">{a.name}</td>
                  <td className="px-4 py-3"><span className="rounded bg-graphite-700 px-2 py-0.5 text-xs font-bold uppercase text-amber-400">{a.tier}</span></td>
                  <td className="px-4 py-3">{(a as any).value_usd ?? '—'}</td>
                  <td className="px-4 py-3">{a.last_lat != null ? `${a.last_lat.toFixed(4)}, ${a.last_lng!.toFixed(4)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-2xl font-extrabold text-white">{value}</p>
      <p className="mt-1 text-xs text-graphite-400">{label}</p>
    </div>
  );
}
