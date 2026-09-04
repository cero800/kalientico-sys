import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequiereCaja, RequiereSesion } from './components/guards';
import Shell from './components/Shell';
import { useSesion } from './store/sesion';
import LoginPage from './pages/LoginPage';
import AbrirCajaPage from './pages/AbrirCajaPage';
import VentaPage from './pages/VentaPage';
import ProductosPage from './pages/ProductosPage';
import ClientesPage from './pages/ClientesPage';
import InventarioPage from './pages/InventarioPage';
import ReportePage from './pages/ReportePage';
import DeudoresPage from './pages/DeudoresPage';
import CerrarCajaPage from './pages/CerrarCajaPage';

export default function App() {
  useEffect(() => {
    void useSesion.getState().refrescar();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}