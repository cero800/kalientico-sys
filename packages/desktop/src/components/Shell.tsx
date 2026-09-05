import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  ShoppingCart,
  Package,
  Users,
  Boxes,
  BarChart3,
  Wallet,
  LogOut,
  Coins,
  Settings,
} from 'lucide-react';
import { useSesion } from '../store/sesion';
import { cn } from '../lib/cn';
import { formatVesCents } from '../lib/format';
import { Button } from './ui/Button';

const nav: Array<{ to: string; label: string; icon: ReactNode }> = [
  { to: '/venta', label: 'Venta', icon: <ShoppingCart className="h-4 w-4" /> },
  { to: '/productos', label: 'Productos', icon: <Package className="h-4 w-4" /> },
  { to: '/clientes', label: 'Clientes', icon: <Users className="h-4 w-4" /> },
  { to: '/inventario', label: 'Inventario', icon: <Boxes className="h-4 w-4" /> },
  { to: '/reporte', label: 'Reporte', icon: <BarChart3 className="h-4 w-4" /> },
  { to: '/deudores', label: 'Deudores', icon: <Wallet className="h-4 w-4" /> },
  { to: '/cerrar-caja', label: 'Cerrar caja', icon: <Coins className="h-4 w-4" /> },
  { to: '/config', label: 'Configuración', icon: <Settings className="h-4 w-4" /> },
];

export default function Shell() {
  const navegar = useNavigate();
  const operador = useSesion((s) => s.operador);
  const caja = useSesion((s) => s.caja);
  const logout = useSesion((s) => s.logout);

  const salir = () => {
    logout();
    navegar('/login');
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-4">
          <p className="text-sm font-bold text-gray-900">Kalientico POS</p>
          <p className="mt-0.5 text-xs text-gray-500">Panadería</p>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-100 p-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-800">{operador?.nombre}</p>
              <p className="text-xs text-gray-500">{caja?.estado}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={salir} aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>
              Caja #{caja?.id} · {caja?.fecha?.slice(0, 10) ?? '—'}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500">
              Tasa del día:{' '}
              <strong className="text-gray-900" data-testid="tasa-bar">
                {formatVesCents(Math.round(useSesion.getState().tasa * 100))}
              </strong>
            </span>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}