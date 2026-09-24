import { useEffect, useState, Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken, setSession, clearSession } from '../lib/api';
import type { MapAsset, MapGeofence } from './MapView';

const MapView = lazy(() => import('./MapView'));
const MENDOZA = { lng: -68.8458, lat: -32.8895 };

export default function AppShell() {
  const [authed, setAuthed] = useState(!!getToken());
  return authed
    ? <Dashboard onLogout={() => { clearSession(); setAuthed(false); }} />
    : <Login onAuthed={() => setAuthed(true)} />;
}

/* ============================ Marca / iconos ============================ */
function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className}>
      <rect width="32" height="32" rx="7" fill="#f59e0b" />
      <path d="M16 6 L25 22 H7 Z" fill="none" stroke="#0e1116" strokeWidth="2.6" strokeLinejoin="round" />
      <circle cx="16" cy="18" r="2.6" fill="#0e1116" />
    </svg>
  );
}
function Icon({ path, className = 'h-5 w-5' }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={className}><path d={path} /></svg>
  );
}
const IC = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5',
  depot: 'M3 21V9l9-6 9 6v12M9 21v-6h6v6',
  wrench: 'M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2 2.3-2.3z',
  chip: 'M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M6 6h12v12H6z',
  map: 'M9 6l6-3 6 3v15l-6-3-6 3-6-3V3l6 3zm0 0v15m6-12v15',
  gauge: 'M12 13a3 3 0 1 0 0-.01M12 3a9 9 0 0 1 9 9M12 3a9 9 0 0 0-9 9m9-4v4',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
  check: 'M20 6 9 17l-5-5',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9',
};

/* ================================ Login ================================ */
function Login({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ company: '', name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const data = await api(mode === 'login' ? '/auth/login' : '/auth/register',
        { method: 'POST', body: JSON.stringify(form) });
      setSession(data.token, data.tenant, data.user);
      onAuthed();
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-graphite-50 px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <Logo className="h-9 w-9" />
          <span className="text-2xl font-extrabold text-graphite-900">Trazza</span>
        </Link>
        <div className="card">
          <div className="mb-6 flex rounded-lg bg-graphite-100 p-1 text-sm font-semibold">
            {(['login', 'register'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 rounded-md py-2 transition ${mode === m ? 'bg-white text-graphite-900 shadow-sm' : 'text-graphite-500'}`}>
                {m === 'login' ? 'Ingresar' : 'Crear cuenta'}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-3">
            {mode === 'register' && (<>
              <Field label="Empresa" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
              <Field label="Tu nombre" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            </>)}
            <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Field label="Contraseña" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <button disabled={loading} className="btn-primary w-full py-3">
              {loading ? 'Procesando…' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
            </button>
          </form>
        </div>
        <Link to="/" className="mt-6 block text-center text-sm text-graphite-500 hover:text-graphite-800">← Volver al inicio</Link>
      </div>
    </div>
  );
}
function Field({ label, value, onChange, type = 'text' }:
  { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required className="input" />
    </label>
  );
}

/* ============================== Dashboard ============================== */
type View = 'inicio' | 'depositos' | 'herramientas' | 'dispositivos' | 'mapa' | 'mantenimiento' | 'alertas' | 'notificaciones';

const NAV: { key: View; label: string; icon: string }[] = [
  { key: 'inicio', label: 'Inicio', icon: IC.home },
  { key: 'depositos', label: 'Depósitos', icon: IC.depot },
  { key: 'herramientas', label: 'Herramientas', icon: IC.wrench },
  { key: 'dispositivos', label: 'Dispositivos', icon: IC.chip },
  { key: 'mapa', label: 'Mapa', icon: IC.map },
  { key: 'mantenimiento', label: 'Mantenimiento', icon: IC.gauge },
  { key: 'alertas', label: 'Alertas', icon: IC.bell },
  { key: 'notificaciones', label: 'Notificaciones', icon: IC.send },
];

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState<View>('inicio');
  const [summary, setSummary] = useState<any>(null);
  const [assets, setAssets] = useState<MapAsset[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [geofences, setGeofences] = useState<MapGeofence[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [notif, setNotif] = useState<any>({ enabled: true, emails: '', whatsapp: '', min_severity: 'warning' });
  const [error, setError] = useState('');

  const tenant = JSON.parse(localStorage.getItem('trazza_tenant') || '{}');
  const user = JSON.parse(localStorage.getItem('trazza_user') || '{}');
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.startsWith('http')
    ? (import.meta.env.VITE_API_URL as string) : `${window.location.origin}/api`;

  const load = async () => {
    try {
      const [s, a, l, g, al, mp, dv, nt] = await Promise.all([
        api('/summary'), api('/assets'), api('/locations'), api('/geofences'),
        api('/alerts'), api('/maintenance/plans'), api('/devices'), api('/notifications/settings'),
      ]);
      setSummary(s); setAssets(a.assets); setLocations(l.locations); setGeofences(g.geofences);
      setAlerts(al.alerts); setPlans(mp.plans); setDevices(dv.devices); setNotif(nt.settings);
    } catch (err: any) { setError(err.message); }
  };
  useEffect(() => { load(); }, []);

  const go = (v: View) => { setView(v); setError(''); window.scrollTo(0, 0); };

  const openAlerts = alerts.filter((a) => !a.resolved_at).length;
  const notifSet = !!(notif && ((notif.emails || '').trim() || (notif.whatsapp || '').trim()));
  const steps = [
    { done: locations.length > 0, title: 'Creá tu primer depósito u obra', desc: 'Es el lugar donde viven tus herramientas.', view: 'depositos' as View, cta: 'Crear depósito' },
    { done: assets.length > 0, title: 'Registrá una herramienta', desc: 'Cargá el equipo con su tecnología y valor.', view: 'herramientas' as View, cta: 'Registrar herramienta' },
    { done: devices.length > 0, title: 'Vinculá un dispositivo', desc: 'Asociá el rastreador GPS/LoRa/RFID al equipo.', view: 'dispositivos' as View, cta: 'Vincular dispositivo' },
    { done: geofences.length > 0 || plans.length > 0 || notifSet, title: 'Configurá los avisos', desc: 'Geocercas, mantenimiento y notificaciones.', view: 'notificaciones' as View, cta: 'Configurar avisos' },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="min-h-screen bg-graphite-50 md:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 border-r border-graphite-200 bg-white md:flex md:flex-col">
        <div className="flex items-center gap-2 border-b border-graphite-200 px-5 py-4">
          <Logo className="h-7 w-7" />
          <span className="font-extrabold text-graphite-900">Trazza</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((n) => (
            <NavBtn key={n.key} n={n} active={view === n.key}
              badge={n.key === 'alertas' && openAlerts ? openAlerts : undefined}
              onClick={() => go(n.key)} />
          ))}
        </nav>
        <div className="border-t border-graphite-200 p-3">
          <div className="px-2 pb-2 text-xs text-graphite-500">
            <p className="font-semibold text-graphite-700">{tenant.name}</p>
            <p className="truncate">{user.name}</p>
          </div>
          <button onClick={onLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-graphite-600 hover:bg-graphite-50">
            <Icon path={IC.logout} className="h-4 w-4" /> Salir
          </button>
        </div>
      </aside>

      <div className="flex-1">
        {/* Top bar (mobile nav) */}
        <header className="sticky top-0 z-30 border-b border-graphite-200 bg-white/90 backdrop-blur md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2"><Logo className="h-6 w-6" /><span className="font-extrabold text-graphite-900">Trazza</span></div>
            <button onClick={onLogout} className="text-sm text-graphite-500">Salir</button>
          </div>
          <div className="flex gap-1 overflow-x-auto px-2 pb-2">
            {NAV.map((n) => (
              <button key={n.key} onClick={() => go(n.key)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${view === n.key ? 'bg-amber-500 text-graphite-950' : 'text-graphite-600'}`}>
                {n.label}
              </button>
            ))}
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
          {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

          {view === 'inicio' && (
            <Inicio user={user} steps={steps} doneCount={doneCount} summary={summary}
              openAlerts={openAlerts} alerts={alerts} go={go} />
          )}
          {view === 'depositos' && <Depositos locations={locations} reload={load} setError={setError} />}
          {view === 'herramientas' && <Herramientas assets={assets} locations={locations} apiBase={apiBase} reload={load} setError={setError} go={go} />}
          {view === 'dispositivos' && <Dispositivos devices={devices} assets={assets} tenant={tenant} apiBase={apiBase} reload={load} setError={setError} />}
          {view === 'mapa' && <Mapa assets={assets} geofences={geofences} reload={load} setError={setError} />}
          {view === 'mantenimiento' && <Mantenimiento plans={plans} assets={assets} reload={load} setError={setError} />}
          {view === 'alertas' && <Alertas alerts={alerts} />}
          {view === 'notificaciones' && <Notificaciones notif={notif} setNotif={setNotif} setError={setError} />}
        </main>
      </div>
    </div>
  );
}

function NavBtn({ n, active, badge, onClick }: { n: { label: string; icon: string }; active: boolean; badge?: number; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition
        ${active ? 'bg-amber-50 text-amber-700' : 'text-graphite-600 hover:bg-graphite-50'}`}>
      <Icon path={n.icon} className="h-5 w-5" />
      <span className="flex-1 text-left">{n.label}</span>
      {badge ? <span className="rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">{badge}</span> : null}
    </button>
  );
}

/* ============================== Secciones ============================== */
function PageHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-graphite-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-graphite-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-graphite-300 bg-white px-4 py-10 text-center text-sm text-graphite-500">{children}</div>;
}
function TierChip({ tier }: { tier: string }) {
  const map: Record<string, string> = {
    gps: 'bg-emerald-50 text-emerald-700', lora: 'bg-sky-50 text-sky-700', rfid: 'bg-violet-50 text-violet-700',
  };
  return <span className={`chip ${map[tier] ?? ''}`}>{tier}</span>;
}

/* -------- Inicio -------- */
function Inicio({ user, steps, doneCount, summary, openAlerts, alerts, go }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-graphite-900">Hola, {user.name?.split(' ')[0] ?? 'bienvenido'} 👋</h1>
        <p className="mt-1 text-graphite-500">Este es el estado de tu pañol digital.</p>
      </div>

      {/* Primeros pasos */}
      {doneCount < steps.length && (
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-graphite-900">Primeros pasos</h2>
              <p className="text-sm text-graphite-500">Seguí este orden para dejar todo funcionando.</p>
            </div>
            <span className="chip bg-amber-50 text-amber-700">{doneCount}/{steps.length}</span>
          </div>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-graphite-100">
            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ol className="space-y-2">
            {steps.map((s: any, i: number) => (
              <li key={i} className={`flex items-center gap-3 rounded-xl border p-3 ${s.done ? 'border-emerald-200 bg-emerald-50/50' : 'border-graphite-200'}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${s.done ? 'bg-emerald-500 text-white' : 'bg-graphite-100 text-graphite-500'}`}>
                  {s.done ? <Icon path={IC.check} className="h-4 w-4" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${s.done ? 'text-graphite-500 line-through' : 'text-graphite-900'}`}>{s.title}</p>
                  {!s.done && <p className="text-xs text-graphite-500">{s.desc}</p>}
                </div>
                {!s.done && <button onClick={() => go(s.view)} className="btn-primary shrink-0 py-1.5 text-sm">{s.cta}</button>}
              </li>
            ))}
          </ol>
        </div>
      )}
      {doneCount === steps.length && (
        <div className="card flex items-center gap-3 border-emerald-200 bg-emerald-50/50">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white"><Icon path={IC.check} /></span>
          <p className="text-sm font-medium text-graphite-700">¡Todo listo! Tu pañol está configurado y funcionando.</p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Herramientas" value={summary?.total ?? '—'} to={() => go('herramientas')} />
        <Stat label="Con GPS" value={summary?.gps ?? '—'} />
        <Stat label="LoRaWAN" value={summary?.lora ?? '—'} />
        <Stat label="Alertas abiertas" value={openAlerts} tone={openAlerts ? 'warn' : undefined} to={() => go('alertas')} />
      </div>

      {/* Alertas recientes */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-graphite-900">Alertas recientes</h2>
          <button onClick={() => go('alertas')} className="text-sm font-medium text-amber-600 hover:text-amber-700">Ver todas →</button>
        </div>
        {alerts.length === 0 ? <Empty>Sin alertas. Todo en orden.</Empty> : (
          <div className="space-y-2">
            {alerts.slice(0, 4).map((al: any) => <AlertRow key={al.id} al={al} />)}
          </div>
        )}
      </div>
    </div>
  );
}
function Stat({ label, value, tone, to }: { label: string; value: React.ReactNode; tone?: 'warn'; to?: () => void }) {
  return (
    <button onClick={to} disabled={!to}
      className={`card p-4 text-left ${to ? 'transition hover:border-amber-300 hover:shadow' : ''}`}>
      <p className={`text-2xl font-extrabold ${tone === 'warn' && value ? 'text-amber-600' : 'text-graphite-900'}`}>{value}</p>
      <p className="mt-1 text-xs font-medium text-graphite-500">{label}</p>
    </button>
  );
}
function AlertRow({ al }: { al: any }) {
  return (
    <div className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${al.resolved_at ? 'border-graphite-200 bg-graphite-50 text-graphite-500' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
      <span>{al.resolved_at ? '✓' : '⚠'} <strong>{al.asset_name ?? 'Activo'}</strong> — {al.message}</span>
      <span className="text-xs opacity-70">{al.resolved_at ? 'resuelta' : 'abierta'}</span>
    </div>
  );
}

/* -------- Depósitos -------- */
function Depositos({ locations, reload, setError }: any) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'depot' | 'site'>('depot');
  const create = async () => {
    if (!name.trim()) return;
    try { await api('/locations', { method: 'POST', body: JSON.stringify({ name: name.trim(), kind }) }); setName(''); reload(); }
    catch (e: any) { setError(e.message); }
  };
  const del = async (id: string) => { try { await api(`/locations/${id}`, { method: 'DELETE' }); reload(); } catch (e: any) { setError(e.message); } };
  return (
    <div>
      <PageHead title="Depósitos y obras" subtitle="El punto de partida: dónde viven tus herramientas." />
      <div className="card mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1"><span className="label">Nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Depósito central / Obra Godoy Cruz" className="input" /></label>
          <label><span className="label">Tipo</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="input">
              <option value="depot">Depósito</option><option value="site">Obra</option>
            </select></label>
          <button onClick={create} disabled={!name.trim()} className="btn-primary">Agregar</button>
        </div>
      </div>
      {locations.length === 0 ? <Empty>Todavía no tenés depósitos. Creá el primero arriba.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((l: any) => (
            <div key={l.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div><p className="font-semibold text-graphite-900">{l.name}</p>
                  <span className="chip mt-1">{l.kind === 'site' ? 'Obra' : 'Depósito'}</span></div>
                <button onClick={() => del(l.id)} className="text-xs text-graphite-400 hover:text-red-500">Eliminar</button>
              </div>
              <p className="mt-3 text-sm text-graphite-500">{l.asset_count} herramienta{l.asset_count === 1 ? '' : 's'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------- Herramientas -------- */
function Herramientas({ assets, locations, apiBase, reload, setError, go }: any) {
  const [f, setF] = useState({ name: '', tier: 'gps', value_usd: '', locationId: '' });
  const [open, setOpen] = useState(false);
  const create = async () => {
    if (!f.name.trim()) return;
    try {
      await api('/assets', { method: 'POST', body: JSON.stringify({
        name: f.name.trim(), tier: f.tier,
        value_usd: f.value_usd ? Number(f.value_usd) : null, locationId: f.locationId || null,
      })});
      setF({ name: '', tier: 'gps', value_usd: '', locationId: '' }); setOpen(false); reload();
    } catch (e: any) { setError(e.message); }
  };
  const uploadPhoto = async (assetId: string, file: File) => {
    try {
      const { uploadUrl, key } = await api(`/assets/${assetId}/photo-upload`, { method: 'POST', body: JSON.stringify({ contentType: file.type }) });
      const put = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!put.ok) throw new Error('no se pudo subir la foto');
      await api(`/assets/${assetId}/photo`, { method: 'PUT', body: JSON.stringify({ key }) });
      reload();
    } catch (e: any) { setError(e.message); }
  };
  return (
    <div>
      <PageHead title="Herramientas" subtitle="Tu inventario de equipos."
        action={<button onClick={() => setOpen((o) => !o)} className="btn-primary">{open ? 'Cerrar' : '+ Registrar herramienta'}</button>} />
      {locations.length === 0 && (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>Primero conviene crear un depósito para asignarle la herramienta.</span>
          <button onClick={() => go('depositos')} className="font-semibold underline">Crear depósito</button>
        </div>
      )}
      {open && (
        <div className="card mb-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="label">Nombre</span>
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Motogenerador Honda EU70" className="input" /></label>
            <label><span className="label">Tecnología de rastreo</span>
              <select value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })} className="input">
                <option value="gps">GPS / 4G</option><option value="lora">LoRaWAN</option><option value="rfid">RFID</option>
              </select></label>
            <label><span className="label">Valor (USD)</span>
              <input type="number" value={f.value_usd} onChange={(e) => setF({ ...f, value_usd: e.target.value })} placeholder="4000" className="input" /></label>
            <label><span className="label">Depósito / obra</span>
              <select value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })} className="input">
                <option value="">Sin asignar</option>
                {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></label>
          </div>
          <div className="mt-4 flex justify-end"><button onClick={create} disabled={!f.name.trim()} className="btn-primary">Guardar herramienta</button></div>
        </div>
      )}
      {assets.length === 0 ? <Empty>Sin herramientas todavía. Registrá la primera.</Empty> : (
        <div className="overflow-hidden rounded-xl border border-graphite-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-graphite-50 text-left text-graphite-500">
              <tr>
                <th className="px-4 py-3 font-medium">Foto</th><th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Tecnología</th><th className="px-4 py-3 font-medium">Depósito</th>
                <th className="px-4 py-3 font-medium">Valor USD</th><th className="px-4 py-3 font-medium">Ubicación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-100">
              {assets.map((a: any) => (
                <tr key={a.id} className="text-graphite-700">
                  <td className="px-4 py-3">
                    <label className="flex h-11 w-11 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-graphite-200 bg-graphite-50 text-graphite-400 hover:border-amber-400">
                      {a.photo_url ? <img src={a.photo_url} alt={a.name} className="h-full w-full object-cover" /> : <span className="text-lg">＋</span>}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const fl = e.target.files?.[0]; if (fl) uploadPhoto(a.id, fl); e.target.value = ''; }} />
                    </label>
                  </td>
                  <td className="px-4 py-3 font-medium text-graphite-900">{a.name}</td>
                  <td className="px-4 py-3"><TierChip tier={a.tier} /></td>
                  <td className="px-4 py-3">{a.location_name ?? <span className="text-graphite-400">—</span>}</td>
                  <td className="px-4 py-3">{a.value_usd ?? '—'}</td>
                  <td className="px-4 py-3">{a.last_lat != null ? `${a.last_lat.toFixed(4)}, ${a.last_lng.toFixed(4)}` : <span className="text-graphite-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* -------- Dispositivos -------- */
function Dispositivos({ devices, assets, tenant, apiBase, reload, setError }: any) {
  const [kind, setKind] = useState<'gps' | 'lora' | 'rfid'>('gps');
  const [ident, setIdent] = useState('');
  const [asset, setAsset] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const create = async () => {
    if (!ident.trim()) return;
    try {
      const d = await api('/devices', { method: 'POST', body: JSON.stringify({ kind, identifier: ident.trim(), assetId: asset || null }) });
      setIdent(''); setAsset(''); if (d.key) setNewKey(d.key); reload();
    } catch (e: any) { setError(e.message); }
  };
  const rotate = async (id: string) => { try { const d = await api(`/devices/${id}/rotate-key`, { method: 'POST', body: JSON.stringify({}) }); if (d.key) setNewKey(d.key); reload(); } catch (e: any) { setError(e.message); } };
  const bind = async (id: string, assetId: string) => { try { await api(`/devices/${id}`, { method: 'PATCH', body: JSON.stringify({ assetId: assetId || null }) }); reload(); } catch (e: any) { setError(e.message); } };
  const del = async (id: string) => { try { await api(`/devices/${id}`, { method: 'DELETE' }); reload(); } catch (e: any) { setError(e.message); } };
  return (
    <div>
      <PageHead title="Dispositivos" subtitle="Rastreadores físicos vinculados a tus herramientas (IMEI / DevEUI / EPC)." />
      <div className="card mb-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <label><span className="label">Tecnología</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="input">
              <option value="gps">GPS / 4G</option><option value="lora">LoRaWAN</option><option value="rfid">RFID</option>
            </select></label>
          <label><span className="label">Identificador</span>
            <input value={ident} onChange={(e) => setIdent(e.target.value)} placeholder="860123456789012" className="input" /></label>
          <label><span className="label">Herramienta</span>
            <select value={asset} onChange={(e) => setAsset(e.target.value)} className="input">
              <option value="">Sin vincular</option>
              {assets.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></label>
          <div className="flex items-end"><button onClick={create} disabled={!ident.trim()} className="btn-primary w-full">Registrar</button></div>
        </div>
      </div>

      {newKey && (
        <div className="card mb-4 border-amber-200 bg-amber-50">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-800">Credencial del dispositivo — guardala ahora</p>
              <p className="mt-1 text-xs text-amber-700">Se muestra una sola vez. Cargala en el equipo como header <span className="font-mono">X-Device-Key</span>.</p>
              <code className="mt-2 block break-all rounded bg-white px-3 py-2 font-mono text-xs text-amber-800">{newKey}</code>
            </div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => navigator.clipboard?.writeText(newKey)} className="btn-ghost py-1.5 text-xs">Copiar</button>
              <button onClick={() => setNewKey(null)} className="btn-ghost py-1.5 text-xs">Listo</button>
            </div>
          </div>
        </div>
      )}

      <div className="card mb-4 bg-graphite-50/60">
        <p className="text-xs font-semibold uppercase tracking-wide text-graphite-500">Ingesta directa (HTTP)</p>
        <code className="mt-1 block break-all text-xs text-amber-700">{`${apiBase}/telemetry/ingest`}</code>
        <p className="mt-1 text-xs text-graphite-500">Autenticá con la credencial del dispositivo (<span className="font-mono">X-Device-Key</span>). Para GPS, Traccar corre en el stack: usá este tenantId en <span className="font-mono">TRACCAR_TENANT_ID</span> → <span className="text-graphite-700">{tenant.id ?? '—'}</span>.</p>
      </div>

      {devices.length === 0 ? <Empty>Sin dispositivos. Registrá el primero arriba.</Empty> : (
        <div className="overflow-hidden rounded-xl border border-graphite-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-graphite-50 text-left text-graphite-500">
              <tr><th className="px-4 py-3 font-medium">Tipo</th><th className="px-4 py-3 font-medium">Identificador</th>
                <th className="px-4 py-3 font-medium">Credencial</th><th className="px-4 py-3 font-medium">Herramienta</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-graphite-100">
              {devices.map((d: any) => (
                <tr key={d.id} className="text-graphite-700">
                  <td className="px-4 py-3"><TierChip tier={d.kind} /></td>
                  <td className="px-4 py-3 font-mono text-xs">{d.identifier}</td>
                  <td className="px-4 py-3 font-mono text-xs text-graphite-400">{d.key_prefix ? `${d.key_prefix}…` : '—'}</td>
                  <td className="px-4 py-3">
                    <select value={d.asset_id ?? ''} onChange={(e) => bind(d.id, e.target.value)} className="input py-1 text-xs">
                      <option value="">Sin vincular</option>
                      {assets.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => rotate(d.id)} className="text-xs text-graphite-500 hover:text-amber-600">Rotar clave</button>
                    <button onClick={() => del(d.id)} className="ml-3 text-xs text-graphite-500 hover:text-red-500">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* -------- Mapa -------- */
function Mapa({ assets, geofences, reload, setError }: any) {
  const [picking, setPicking] = useState(false);
  const [gfName, setGfName] = useState('');
  const [gfRadius, setGfRadius] = useState(500);
  const [gfCenter, setGfCenter] = useState<{ lng: number; lat: number } | null>(null);

  const simulate = async () => {
    if (assets.length === 0) return;
    try {
      await Promise.all(assets.map((a: any) => api(`/assets/${a.id}/position`, { method: 'POST', body: JSON.stringify({
        lng: MENDOZA.lng + (Math.random() - 0.5) * 0.12, lat: MENDOZA.lat + (Math.random() - 0.5) * 0.12,
        battery: Math.floor(Math.random() * 60 + 40), engineHours: Math.floor(Math.random() * 300 + 50),
      })})));
      reload();
    } catch (e: any) { setError(e.message); }
  };
  const createGeofence = async () => {
    if (!gfName || !gfCenter) return;
    try { await api('/geofences', { method: 'POST', body: JSON.stringify({ name: gfName, center: [gfCenter.lng, gfCenter.lat], radiusM: gfRadius }) });
      setGfName(''); setGfCenter(null); setPicking(false); reload();
    } catch (e: any) { setError(e.message); }
  };
  return (
    <div>
      <PageHead title="Mapa en vivo" subtitle="Ubicación de tus equipos y geocercas."
        action={<div className="flex flex-wrap gap-2">
          <button onClick={simulate} className="btn-ghost py-2 text-sm">Simular movimiento</button>
          <button onClick={() => { setPicking((p) => !p); setGfCenter(null); }} className={`py-2 text-sm ${picking ? 'btn-primary' : 'btn-ghost'}`}>{picking ? 'Cancelar' : 'Nueva geocerca'}</button>
        </div>} />
      {picking && (
        <div className="card mb-4 border-amber-200 bg-amber-50">
          <p className="mb-2 text-sm text-amber-800">{gfCenter ? '✓ Centro elegido. Completá y creá.' : '① Hacé clic en el mapa para elegir el centro.'}</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1"><span className="label">Nombre</span>
              <input value={gfName} onChange={(e) => setGfName(e.target.value)} placeholder="Obra Godoy Cruz" className="input" /></label>
            <label><span className="label">Radio (m)</span>
              <input type="number" value={gfRadius} min={50} step={50} onChange={(e) => setGfRadius(Number(e.target.value))} className="input w-28" /></label>
            <button onClick={createGeofence} disabled={!gfName || !gfCenter} className="btn-primary">Crear geocerca</button>
          </div>
        </div>
      )}
      <Suspense fallback={<div className="flex h-[420px] items-center justify-center rounded-xl border border-graphite-200 bg-white text-graphite-400">Cargando mapa…</div>}>
        <MapView assets={assets} geofences={geofences} picking={picking} onPick={(lng, lat) => setGfCenter({ lng, lat })} />
      </Suspense>
    </div>
  );
}

/* -------- Mantenimiento -------- */
function Mantenimiento({ plans, assets, reload, setError }: any) {
  const [asset, setAsset] = useState('');
  const [strategy, setStrategy] = useState<'hours' | 'calendar'>('hours');
  const [interval, setIntervalV] = useState(250);
  const create = async () => {
    if (!asset) return;
    const body: any = { assetId: asset, strategy };
    if (strategy === 'hours') body.intervalHours = interval; else body.intervalDays = interval;
    try { await api('/maintenance/plans', { method: 'POST', body: JSON.stringify(body) }); setAsset(''); reload(); } catch (e: any) { setError(e.message); }
  };
  const complete = async (id: string) => { try { await api(`/maintenance/plans/${id}/complete`, { method: 'POST', body: JSON.stringify({}) }); reload(); } catch (e: any) { setError(e.message); } };
  return (
    <div>
      <PageHead title="Mantenimiento" subtitle="Planes por horas de uso o por calendario." />
      <div className="card mb-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <label><span className="label">Herramienta</span>
            <select value={asset} onChange={(e) => setAsset(e.target.value)} className="input">
              <option value="">Elegí…</option>{assets.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></label>
          <label><span className="label">Estrategia</span>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as any)} className="input">
              <option value="hours">Por horas de uso</option><option value="calendar">Por calendario</option>
            </select></label>
          <label><span className="label">{strategy === 'hours' ? 'Cada (horas)' : 'Cada (días)'}</span>
            <input type="number" min={1} value={interval} onChange={(e) => setIntervalV(Number(e.target.value))} className="input" /></label>
          <div className="flex items-end"><button onClick={create} disabled={!asset} className="btn-primary w-full">Crear plan</button></div>
        </div>
      </div>
      {plans.length === 0 ? <Empty>Sin planes de mantenimiento.</Empty> : (
        <div className="space-y-2">
          {plans.map((p: any) => {
            const badge = p.status === 'overdue' ? 'border-red-200 bg-red-50 text-red-700'
              : p.status === 'due_soon' ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-graphite-200 bg-white text-graphite-600';
            const label = p.status === 'overdue' ? 'Vencido' : p.status === 'due_soon' ? 'Vence pronto' : 'Al día';
            return (
              <div key={p.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${badge}`}>
                <div><strong className="text-graphite-900">{p.asset_name}</strong>
                  <span className="ml-2 opacity-80">{p.strategy === 'hours'
                    ? `cada ${p.interval_hours} h · próx. ${p.next_due_hours} h (actual ${p.last_engine_hours ?? 0} h)`
                    : `cada ${p.interval_days} días · próx. ${p.next_due_at ? new Date(p.next_due_at).toLocaleDateString() : '—'}`}</span></div>
                <div className="flex items-center gap-3">
                  <span className="rounded px-2 py-0.5 text-xs font-bold uppercase">{label}</span>
                  <button onClick={() => complete(p.id)} className="btn-ghost py-1.5 text-xs">Registrar service</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------- Alertas -------- */
function Alertas({ alerts }: any) {
  return (
    <div>
      <PageHead title="Alertas" subtitle="Geocerca, mantenimiento y batería." />
      {alerts.length === 0 ? <Empty>Sin alertas. Todo en orden.</Empty> : (
        <div className="space-y-2">{alerts.map((al: any) => <AlertRow key={al.id} al={al} />)}</div>
      )}
    </div>
  );
}

/* -------- Notificaciones -------- */
function Notificaciones({ notif, setNotif, setError }: any) {
  const [msg, setMsg] = useState('');
  const save = async () => {
    setMsg('');
    try { await api('/notifications/settings', { method: 'PUT', body: JSON.stringify({
      enabled: notif.enabled, emails: notif.emails, whatsapp: notif.whatsapp, minSeverity: notif.min_severity }) });
      setMsg('Guardado ✓'); } catch (e: any) { setError(e.message); }
  };
  const test = async () => { setMsg(''); try { await api('/notifications/test', { method: 'POST', body: JSON.stringify({}) }); setMsg('Prueba encolada — revisá email/WhatsApp.'); } catch (e: any) { setError(e.message); } };
  return (
    <div>
      <PageHead title="Notificaciones" subtitle="Avisos por email / WhatsApp cuando se abre una alerta." />
      <div className="card max-w-2xl">
        <label className="flex items-center gap-2 text-sm text-graphite-700">
          <input type="checkbox" checked={!!notif.enabled} onChange={(e) => setNotif({ ...notif, enabled: e.target.checked })} className="h-4 w-4 accent-amber-500" />
          Notificaciones activadas
        </label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label><span className="label">Emails (separados por coma)</span>
            <input value={notif.emails ?? ''} onChange={(e) => setNotif({ ...notif, emails: e.target.value })} placeholder="jefe@obra.com, deposito@obra.com" className="input" /></label>
          <label><span className="label">WhatsApp (E.164, separados por coma)</span>
            <input value={notif.whatsapp ?? ''} onChange={(e) => setNotif({ ...notif, whatsapp: e.target.value })} placeholder="+5492611234567" className="input" /></label>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label><span className="label">Severidad mínima</span>
            <select value={notif.min_severity ?? 'warning'} onChange={(e) => setNotif({ ...notif, min_severity: e.target.value })} className="input">
              <option value="info">Info (todas)</option><option value="warning">Warning</option><option value="critical">Critical</option>
            </select></label>
          <button onClick={save} className="btn-primary">Guardar</button>
          <button onClick={test} className="btn-ghost">Enviar prueba</button>
          {msg && <span className="text-sm text-amber-600">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
