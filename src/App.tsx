import { lazy, Suspense, useCallback, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProvider, useApp, type ToastItem } from "./data/store";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import type { Rol } from "./lib/types";

// las páginas menos visitadas se cargan cuando se necesitan
const Clases = lazy(() => import("./pages/Clases"));
const ClaseDetalle = lazy(() => import("./pages/ClaseDetalle"));
const Comparar = lazy(() => import("./pages/Comparar"));
const Estudiantes = lazy(() => import("./pages/Estudiantes"));
const Equipo = lazy(() => import("./pages/Equipo"));
const Importar = lazy(() => import("./pages/Importar"));
const Ajustes = lazy(() => import("./pages/Ajustes"));

function Guard({ roles, children }: { roles: Rol[]; children: JSX.Element }) {
  const { user } = useApp();
  return user && roles.includes(user.rol) ? children : <Navigate to="/" replace />;
}

function Routed() {
  const { user, ready } = useApp();
  if (!ready) return <div className="boot"><div className="brand-mark"><span className="spinner" /></div></div>;
  if (!user) return <Login />;
  return (
    <Layout>
      <Suspense fallback={<div className="page-loading"><span className="spinner" /></div>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clases" element={<Clases />} />
          <Route path="/clases/:id" element={<ClaseDetalle />} />
          <Route path="/comparar" element={<Comparar />} />
          <Route path="/estudiantes" element={<Estudiantes />} />
          <Route path="/equipo" element={<Guard roles={["admin", "decano"]}><Equipo /></Guard>} />
          <Route path="/importar" element={<Guard roles={["admin"]}><Importar /></Guard>} />
          <Route path="/ajustes" element={<Ajustes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

export default function App() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const onToasts = useCallback((t: ToastItem[]) => setToasts(t), []);
  return (
    <HashRouter>
      <AppProvider onToasts={onToasts}>
        <Routed />
      </AppProvider>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={"toast " + t.kind}>{t.msg}</div>)}
      </div>
    </HashRouter>
  );
}
