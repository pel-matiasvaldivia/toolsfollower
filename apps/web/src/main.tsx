import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import Landing from './pages/Landing';

// El panel (y MapLibre) se cargan sólo al entrar a /app, no en la landing.
const AppShell = lazy(() => import('./pages/AppShell'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={
          <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-graphite-500">Cargando…</div>}>
            <AppShell />
          </Suspense>
        } />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
