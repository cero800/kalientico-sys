import { Navigate, Outlet } from 'react-router-dom';
import { useSesion } from '../store/sesion';
import { PageLoader } from './ui/Spinner';

/** Requiere operador elegido; si la sesión aún no se inicializa, muestra carga. */
export function RequiereSesion() {
  const inicializado = useSesion((s) => s.inicializado);
  const operador = useSesion((s) => s.operador);

  if (!inicializado) return <PageLoader label="Iniciando…" />;
  if (!operador) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Requiere caja abierta (inicio de turno). */
export function RequiereCaja() {
  const caja = useSesion((s) => s.caja);
  if (!caja) return <Navigate to="/abrir-caja" replace />;
  return <Outlet />;
}