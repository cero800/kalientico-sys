import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequiereCaja, RequiereRol, RequiereSesion } from './components/guards';
import Shell from './components/Shell';
import ErrorBoundary from './components/ErrorBoundary';
import OverlayErrores from './components/OverlayErrores';
import { useSesion } from './store/sesion';
import { PageLoader } from './components/ui/Spinner';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const SetupAdminPage = lazy(() => import('./pages/SetupAdminPage'));
const AbrirCajaPage = lazy(() => import('./pages/AbrirCajaPage'));
const VentaPage = lazy(() => import('./pages/VentaPage'));
const ProductosPage = lazy(() => import('./pages/ProductosPage'));
const ClientesPage = lazy(() => import('./pages/ClientesPage'));
const InventarioPage = lazy(() => import('./pages/InventarioPage'));
const ReportePage = lazy(() => import('./pages/ReportePage'));
const DeudoresPage = lazy(() => import('./pages/DeudoresPage'));
const CerrarCajaPage = lazy(() => import('./pages/CerrarCajaPage'));
const ConfiguracionPage = lazy(() => import('./pages/ConfiguracionPage'));

export default function App() {
  useEffect(() => {
    void useSesion.getState().refrescar();
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<PageLoader label="Cargando…" />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<SetupAdminPage />} />
            <Route element={<RequiereSesion />}>
              <Route path="/abrir-caja" element={<AbrirCajaPage />} />
              <Route element={<RequiereCaja />}>
                <Route element={<Shell />}>
                  <Route path="/" element={<Navigate to="/venta" replace />} />
                  <Route path="/venta" element={<VentaPage />} />
                  <Route path="/productos" element={<ProductosPage />} />
                  <Route path="/clientes" element={<ClientesPage />} />
                  <Route path="/inventario" element={<InventarioPage />} />
                  <Route path="/reporte" element={<ReportePage />} />
                  <Route path="/deudores" element={<DeudoresPage />} />
                  <Route path="/cerrar-caja" element={<CerrarCajaPage />} />
                  <Route element={<RequiereRol roles={['admin']} />}>
                    <Route path="/config" element={<ConfiguracionPage />} />
                  </Route>
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <OverlayErrores />
    </ErrorBoundary>
  );
}