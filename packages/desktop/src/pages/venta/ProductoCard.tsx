import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useSesion } from '../../store/sesion';
import { formatUsdCents } from '../../lib/format';

export function ProductoCard({
  nombre,
  codigo,
  precio,
  stock,
  icono,
  onAgregar,
  deshabilitado,
}: {
  nombre: string;
  codigo: string;
  precio: number;
  stock?: number;
  icono?: ReactNode;
  onAgregar: () => void;
  deshabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onAgregar}
      disabled={deshabilitado}
      className="group flex flex-col justify-between gap-2 rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-300 hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">{codigo}</span>
        {typeof stock === 'number' && (
          <span className="rounded-full bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
            {stock}
          </span>
        )}
      </div>
      <div>
        <p className="line-clamp-2 text-sm font-semibold text-gray-800">{nombre}</p>
        <span className="text-sm font-bold text-emerald-700">{formatUsdCents(precio)}</span>
      </div>
      {icono}
    </button>
  );
}

export function ClienteSelect({
  value,
  onChange,
  clientes,
}: {
  value: string;
  onChange: (empresaId: number) => void;
  clientes: Array<{ id: number; nombre: string; esMostrador?: boolean }>;
}) {
  const seleccion = clientes.find((c) => c.id === Number(value));
  return (
    <div>
      <label htmlFor="cliente-venta" className="mb-1 block text-xs font-medium text-gray-500">
        Cliente
      </label>
      <select
        id="cliente-venta"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
      >
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
            {c.esMostrador ? ' (mostrador)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TasaBar() {
  const tasa = useSesion((s) => s.tasa);
  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
      <span>Tasa de hoy</span>
      <strong className="text-sm text-gray-900">{formatUsdCents(Math.round(tasa * 100))}</strong>
    </div>
  );
}

export function TotalRow({ etiqueta, monto, moneda }: { etiqueta: string; monto: number; moneda: 'usd' | 'ves' }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{etiqueta}</span>
      <strong className={moneda === 'usd' ? 'text-gray-900' : 'text-emerald-700'}>{formatUsdCents(monto)}</strong>
    </div>
  );
}