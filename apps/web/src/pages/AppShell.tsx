import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken, setSession, clearSession } from '../lib/api';

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
function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [summary, setSummary] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [error, setError] = useState('');
  const tenant = JSON.parse(localStorage.getItem('trazza_tenant') || '{}');

  const load = async () => {
    try {
      const [s, a] = await Promise.all([api('/summary'), api('/assets')]);
      setSummary(s); setAssets(a.assets);
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

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Activos</h2>
          <button onClick={addDemo} className="btn-primary py-2 text-sm">+ Agregar activo</button>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-graphite-700">
          <table className="w-full text-sm">
            <thead className="bg-graphite-800 text-left text-graphite-300">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Tecnología</th>
                <th className="px-4 py-3 font-medium">Valor USD</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-800">
              {assets.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-graphite-500">Sin activos todavía. Agregá el primero.</td></tr>
              )}
              {assets.map((a) => (
                <tr key={a.id} className="text-graphite-200">
                  <td className="px-4 py-3">{a.name}</td>
                  <td className="px-4 py-3"><span className="rounded bg-graphite-700 px-2 py-0.5 text-xs font-bold uppercase text-amber-400">{a.tier}</span></td>
                  <td className="px-4 py-3">{a.value_usd ?? '—'}</td>
                  <td className="px-4 py-3">{a.status}</td>
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
