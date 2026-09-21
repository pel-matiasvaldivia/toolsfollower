import { Link } from 'react-router-dom';

/* ---------- Iconos inline (sin dependencias) ---------- */
function Icon({ path, className = 'h-6 w-6' }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={path} />
    </svg>
  );
}
const icons = {
  map: 'M9 6l6-3 6 3v15l-6-3-6 3-6-3V3l6 3zm0 0v15m6-12v15',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  wrench: 'M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2 2.3-2.3z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  chip: 'M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M6 6h12v12H6z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  layers: 'M12 3l9 5-9 5-9-5 9-5zm9 9l-9 5-9-5',
};

function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className}>
      <rect width="32" height="32" rx="7" fill="#f59e0b" />
      <path d="M16 6 L25 22 H7 Z" fill="none" stroke="#0e1116" strokeWidth="2.6" strokeLinejoin="round" />
      <circle cx="16" cy="18" r="2.6" fill="#0e1116" />
    </svg>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-graphite-900">
      <Nav />
      <Hero />
      <Stats />
      <Problem />
      <Features />
      <HowItWorks />
      <Technology />
      <Pricing />
      <FinalCTA />
      <Footer />
    </div>
  );
}

/* ------------------------------ Nav ------------------------------ */
function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-graphite-800 bg-graphite-900/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <a href="#top" className="flex items-center gap-2">
          <Logo />
          <span className="text-xl font-extrabold tracking-tight text-white">Trazza</span>
        </a>
        <nav className="hidden items-center gap-8 text-sm font-medium text-graphite-300 md:flex">
          <a href="#features" className="hover:text-white">Funciones</a>
          <a href="#tecnologia" className="hover:text-white">Tecnología</a>
          <a href="#precios" className="hover:text-white">Precios</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link to="/app" className="text-sm font-semibold text-graphite-200 hover:text-white">Ingresar</Link>
          <a href="#precios" className="btn-primary py-2 text-sm">Pedir demo</a>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------ Hero ------------------------------ */
function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-40"
        style={{ background: 'radial-gradient(60% 50% at 70% 0%, rgba(245,158,11,0.18), transparent 70%)' }} />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 md:grid-cols-2 md:py-28">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-graphite-700 bg-graphite-800/60 px-3 py-1 text-xs font-medium text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Hecho para constructoras · Mendoza, Argentina
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
            Cada herramienta,<br /><span className="text-amber-500">siempre a la vista.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-graphite-300">
            Trazza es tu <strong className="text-white">pañol digital</strong>: sabé dónde está cada
            equipo, quién es el responsable y cuándo le toca mantenimiento. Motogeneradores,
            rotomartillos y niveladoras, todo en una sola pantalla.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#precios" className="btn-primary">Empezar ahora</a>
            <a href="#tecnologia" className="btn-ghost">Ver cómo funciona</a>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-graphite-400">
            <Check>Sin planillas de Excel</Check>
            <Check>GPS, LoRaWAN y RFID</Check>
            <Check>Alta en minutos</Check>
          </div>
        </div>
        <HeroPanel />
      </div>
    </section>
  );
}

function Check({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-500" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </span>
  );
}

function HeroPanel() {
  const rows = [
    { n: 'Motogenerador Honda EU70', t: 'GPS', s: 'Obra Godoy Cruz', c: 'text-emerald-400', b: '92%' },
    { n: 'Rotomartillo Bosch GBH', t: 'LoRa', s: 'Obra Las Heras', c: 'text-emerald-400', b: '78%' },
    { n: 'Niveladora láser', t: 'RFID', s: 'Depósito central', c: 'text-graphite-400', b: '—' },
    { n: 'Compactadora Wacker', t: 'GPS', s: '⚠ Fuera de geocerca', c: 'text-amber-400', b: '64%' },
  ];
  return (
    <div className="relative">
      <div className="rounded-2xl border border-graphite-700 bg-graphite-800/70 p-4 shadow-2xl shadow-black/40">
        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-sm font-semibold text-white">Panel de activos</span>
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">En vivo</span>
        </div>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.n} className="flex items-center justify-between rounded-lg bg-graphite-900/70 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-graphite-100">{r.n}</p>
                <p className={`text-xs ${r.c}`}>{r.s}</p>
              </div>
              <div className="flex items-center gap-3 pl-3">
                <span className="rounded bg-graphite-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-graphite-200">{r.t}</span>
                <span className="w-8 text-right text-xs text-graphite-400">{r.b}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -bottom-5 -left-5 hidden rounded-xl border border-graphite-700 bg-graphite-800 px-4 py-3 shadow-xl sm:block">
        <p className="text-2xl font-extrabold text-white">-73%</p>
        <p className="text-xs text-graphite-400">pérdidas de herramienta</p>
      </div>
    </div>
  );
}

/* ------------------------------ Stats ------------------------------ */
function Stats() {
  const stats = [
    ['1 pantalla', 'toda tu flota mixta'],
    ['3 tecnologías', 'GPS · LoRaWAN · RFID'],
    ['24/7', 'alertas de robo y salida'],
    ['Minutos', 'para dar de alta un equipo'],
  ];
  return (
    <section className="border-y border-graphite-800 bg-graphite-950/40">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 md:grid-cols-4">
        {stats.map(([a, b]) => (
          <div key={b}>
            <p className="text-2xl font-extrabold text-amber-500">{a}</p>
            <p className="mt-1 text-sm text-graphite-400">{b}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ Problem ------------------------------ */
function Problem() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold text-white sm:text-4xl">La herramienta cara desaparece sin seguimiento</h2>
        <p className="mt-4 text-graphite-300">
          Rotan entre obras, cambian de responsable y nadie sabe dónde quedaron. Cada equipo perdido
          es plata y una obra frenada. Las planillas no alcanzan.
        </p>
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {[
          ['Sin trazabilidad', 'No sabés qué equipo está en qué obra ni quién lo tiene.'],
          ['Robos y extravíos', 'Motogeneradores y máquinas caras que se pierden sin alerta.'],
          ['Mantenimiento tarde', 'Se rompe en obra porque nadie llevaba el plan de service.'],
        ].map(([t, d]) => (
          <div key={t} className="card">
            <h3 className="text-lg font-semibold text-white">{t}</h3>
            <p className="mt-2 text-sm text-graphite-400">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ Features ------------------------------ */
function Features() {
  const feats = [
    [icons.layers, 'Flota mixta unificada', 'Desde el motogenerador hasta la herramienta manual, todo en un mismo inventario con foto, número de serie y estado.'],
    [icons.user, 'Cadena de custodia', 'Quién tiene cada equipo, con historial de traspasos firmado. Se acabó el "yo no lo tenía".'],
    [icons.map, 'Ubicación en mapa', 'Posición en tiempo real de lo que lleva GPS y última ubicación conocida del resto.'],
    [icons.bell, 'Alertas inteligentes', 'Salida de geocerca, movimiento fuera de horario, batería baja y service vencido.'],
    [icons.wrench, 'Mantenimiento por uso', 'Planes por calendario o por horas de motor que el propio equipo reporta.'],
    [icons.chart, 'Reportes y auditoría', 'Utilización, pérdidas evitadas y auditorías de campo listas para exportar.'],
  ] as const;
  return (
    <section id="features" className="border-y border-graphite-800 bg-graphite-950/30">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">Todo lo que tu pañol necesita</h2>
          <p className="mt-4 text-graphite-300">Una plataforma pensada para la operación real de una constructora.</p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {feats.map(([p, t, d]) => (
            <div key={t} className="card transition hover:border-amber-500/60">
              <div className="mb-4 inline-flex rounded-xl bg-amber-500/10 p-3 text-amber-500">
                <Icon path={p} />
              </div>
              <h3 className="text-lg font-semibold text-white">{t}</h3>
              <p className="mt-2 text-sm text-graphite-400">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ How it works ------------------------------ */
function HowItWorks() {
  const steps = [
    ['01', 'Cargá tus herramientas', 'Alta rápida con QR o etiqueta RFID. Categoría, obra, responsable y plan de mantenimiento.'],
    ['02', 'Elegí cómo rastrear', 'GPS para lo caro, LoRaWAN para lo que rota entre obras, RFID para inventario. Todo mezclable.'],
    ['03', 'Controlá desde una pantalla', 'Mapa, custodia, alertas y mantenimiento en vivo, desde la oficina o el celular.'],
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold text-white sm:text-4xl">Andando en 3 pasos</h2>
      </div>
      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {steps.map(([n, t, d]) => (
          <div key={n} className="relative">
            <span className="text-5xl font-extrabold text-graphite-700">{n}</span>
            <h3 className="mt-2 text-lg font-semibold text-white">{t}</h3>
            <p className="mt-2 text-sm text-graphite-400">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ Technology ------------------------------ */
function Technology() {
  const tiers = [
    {
      tag: 'GPS + 4G', name: 'Activos de alto valor', color: 'border-amber-500',
      desc: 'Motogeneradores y maquinaria con energía propia. Ubicación en tiempo real, antirrobo y horas de motor.',
      points: ['Tiempo real en toda la provincia', 'Geocercas y alertas de robo', 'Reporta horas para el service'],
    },
    {
      tag: 'LoRaWAN', name: 'Equipos que rotan entre obras', color: 'border-graphite-600',
      desc: 'Rotomartillos y herramienta eléctrica. Batería de años y datos casi gratis con gateway propio en la obra.',
      points: ['Autonomía de años', 'Alerta al salir de la obra', 'Infra barata y escalable'],
    },
    {
      tag: 'RFID', name: 'Inventario y alta rotación', color: 'border-graphite-600',
      desc: 'Herramienta manual y accesorios. Control de entrada/salida del depósito y auditorías rápidas.',
      points: ['Etiquetas de centavos', 'Check-in/out en portería', 'Inventario en minutos'],
    },
  ];
  return (
    <section id="tecnologia" className="border-y border-graphite-800 bg-graphite-950/30">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-amber-500">Hardware-agnóstico</span>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">La tecnología justa para cada herramienta</h2>
          <p className="mt-4 text-graphite-300">
            No te casás con un proveedor. Trazza combina tecnologías según el valor de cada equipo y tu presupuesto.
          </p>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {tiers.map((t) => (
            <div key={t.name} className={`card border-t-4 ${t.color}`}>
              <span className="rounded bg-graphite-700 px-2 py-1 text-xs font-bold uppercase tracking-wide text-amber-400">{t.tag}</span>
              <h3 className="mt-4 text-xl font-semibold text-white">{t.name}</h3>
              <p className="mt-2 text-sm text-graphite-400">{t.desc}</p>
              <ul className="mt-4 space-y-2">
                {t.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-graphite-300">
                    <Icon path={icons.chip} className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Pricing ------------------------------ */
function Pricing() {
  const plans = [
    { name: 'Inventario', price: 'USD 1', unit: '/activo · mes', hl: false,
      feats: ['Alta ilimitada de herramientas', 'Cadena de custodia', 'RFID + QR', 'Auditorías de campo'], cta: 'Empezar' },
    { name: 'Pro', price: 'USD 5-10', unit: '/activo · mes', hl: true,
      feats: ['Todo lo de Inventario', 'GPS tiempo real + LoRaWAN', 'Geocercas y alertas', 'Mantenimiento por horas'], cta: 'Pedir demo' },
    { name: 'Enterprise', price: 'A medida', unit: 'multi-obra', hl: false,
      feats: ['Todo lo de Pro', 'Mantenimiento predictivo', 'Integraciones y API', 'Soporte e instalación'], cta: 'Hablar con ventas' },
  ];
  return (
    <section id="precios" className="mx-auto max-w-6xl px-4 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold text-white sm:text-4xl">Precios claros, en dólares</h2>
        <p className="mt-4 text-graphite-300">Suscripción por activo. Hardware en leasing para no inmovilizar tu capital.</p>
      </div>
      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {plans.map((p) => (
          <div key={p.name} className={`card relative ${p.hl ? 'border-amber-500 ring-1 ring-amber-500/40' : ''}`}>
            {p.hl && (
              <span className="absolute -top-3 left-6 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-graphite-950">Más elegido</span>
            )}
            <h3 className="text-lg font-semibold text-white">{p.name}</h3>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-3xl font-extrabold text-white">{p.price}</span>
              <span className="pb-1 text-sm text-graphite-400">{p.unit}</span>
            </div>
            <ul className="mt-6 space-y-3">
              {p.feats.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-graphite-300">
                  <Icon path={icons.shield} className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> {f}
                </li>
              ))}
            </ul>
            <a href="#" className={`mt-8 w-full ${p.hl ? 'btn-primary' : 'btn-ghost'}`}>{p.cta}</a>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ Final CTA ------------------------------ */
function FinalCTA() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20">
      <div className="overflow-hidden rounded-3xl border border-graphite-700 bg-gradient-to-br from-graphite-800 to-graphite-950 p-10 text-center md:p-16">
        <h2 className="mx-auto max-w-2xl text-3xl font-bold text-white sm:text-4xl">
          Dejá de perder herramientas caras
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-graphite-300">
          Sumá tu primer equipo hoy y ganá visibilidad total de tu flota. Sin instalaciones complicadas.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href="#precios" className="btn-primary">Pedir demo</a>
          <Link to="/app" className="btn-ghost">Ingresar al panel</Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Footer ------------------------------ */
function Footer() {
  return (
    <footer className="border-t border-graphite-800">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row">
        <div className="flex items-center gap-2">
          <Logo className="h-7 w-7" />
          <span className="font-extrabold text-white">Trazza</span>
          <span className="text-sm text-graphite-500">· Seguimiento de herramientas</span>
        </div>
        <p className="text-sm text-graphite-500">Mendoza, Argentina · © {new Date().getFullYear()} Trazza</p>
      </div>
    </footer>
  );
}
