import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import type { CierreDia } from '@panaderia/core';
import { TIPO_PAGO_LABELS, toVes } from '@panaderia/core';
import { formatCents, formatUsdCents, formatVesCents } from '../../lib/format';
import { Button } from './Button';

interface Props {
  cierre: CierreDia | null;
  onClose: () => void;
}

function fechaLegible(fecha: string): string {
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return fecha ?? '';
  return d.toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function CierreModal({ cierre, onClose }: Props) {
  const [imprimiendo, setImprimiendo] = useState(false);

  useEffect(() => {
    setImprimiendo(false);
  }, [cierre?.caja_id]);

  if (!cierre) return null;

  const imprimir = () => {
    setImprimiendo(true);
    try {
      window.print();
    } finally {
      setTimeout(() => {
        setImprimiendo(false);
        onClose();
      }, 200);
    }
  };

  const totalDiaUsd = cierre.total_ventas_usd + cierre.total_abonos_usd;
  const totalDiaBs = cierre.total_ventas_bs + cierre.total_abonos_bs;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cierre de caja"
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Cierre de caja</h2>
            <p className="text-xs text-gray-500">Caja #{cierre.caja_id} · {cierre.fecha.slice(0, 10)}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={imprimir} disabled={imprimiendo}>
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {/* Área que se imprime (solo este bloque sale a la impresora). */}
          <div className="factura-print mx-auto max-w-md bg-white text-sm text-gray-900">
            <header className="border-b-2 border-gray-900 pb-3 text-center">
              <h1 className="text-xl font-black uppercase tracking-wide">
                {cierre.negocio_nombre || 'Mi Negocio'}
              </h1>
              {cierre.negocio_rif && <p className="text-xs">RIF: {cierre.negocio_rif}</p>}
              {cierre.negocio_telefono && <p className="text-xs">Telf: {cierre.negocio_telefono}</p>}
              {cierre.negocio_direccion && <p className="text-xs">{cierre.negocio_direccion}</p>}
            </header>

            <div className="border-b border-dashed border-gray-400 py-2 text-center">
              <p className="text-[11px] uppercase text-gray-500">Cierre de caja N°</p>
              <p className="font-mono text-base font-bold">{String(cierre.caja_id).padStart(4, '0')}</p>
            </div>

            <div className="flex justify-between gap-3 border-b border-dashed border-gray-400 py-2">
              <div>
                <p className="text-[11px] uppercase text-gray-500">Operador</p>
                <p className="font-medium">{cierre.operador_nombre}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase text-gray-500">Fecha</p>
                <p>{fechaLegible(cierre.fecha)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-dashed border-gray-400 py-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Efectivo inicial</span>
                <span className="font-medium">{formatUsdCents(cierre.efectivo_inicial_usd)} / {formatVesCents(cierre.efectivo_inicial_ves)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Ventas efectivo</span>
                <span className="font-medium">{formatUsdCents(cierre.efectivo_ventas_usd)} / {formatVesCents(cierre.efectivo_ventas_ves)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Abonos efectivo</span>
                <span className="font-medium">{formatUsdCents(cierre.abonos_efectivo_usd)} / {formatVesCents(cierre.abonos_efectivo_ves)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Esperado</span>
                <span className="font-bold">{formatUsdCents(cierre.efectivo_esperado_usd)} / {formatVesCents(cierre.efectivo_esperado_ves)}</span>
              </div>
            </div>

            <div className="py-2">
              <p className="mb-1 text-[11px] uppercase text-gray-500">Ventas del día</p>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[11px] uppercase text-gray-500">
                    <th className="py-1">Factura</th>
                    <th className="py-1">Cliente</th>
                    <th className="py-1 text-center">Tipo</th>
                    <th className="py-1 text-right">US$</th>
                    <th className="py-1 text-right">Bs</th>
                  </tr>
                </thead>
                <tbody>
                  {cierre.ventas.map((v) => (
                    <tr key={v.venta_id} className="border-b border-gray-100">
                      <td className="py-1 font-mono">#{String(v.numero_factura).padStart(4, '0')}</td>
                      <td className="py-1">{v.cliente}</td>
                      <td className="py-1 text-center">{v.tipo === 'contado' ? 'Contado' : 'Crédito'}</td>
                      <td className="py-1 text-right">{formatUsdCents(v.monto)}</td>
                      <td className="py-1 text-right">{formatVesCents(toVes(v.monto, 'usd', v.tasa_cambio))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td className="pt-1" colSpan={3}>Total ventas</td>
                    <td className="pt-1 text-right">{formatUsdCents(cierre.total_ventas_usd)}</td>
                    <td className="pt-1 text-right">{formatVesCents(cierre.total_ventas_bs)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="border-t border-dashed border-gray-400 py-2">
              <p className="mb-1 text-[11px] uppercase text-gray-500">Abonos del día</p>
              {cierre.abonos.length === 0 ? (
                <p className="text-xs text-gray-500">Sin abonos registrados</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[11px] uppercase text-gray-500">
                      <th className="py-1">Cliente</th>
                      <th className="py-1">Pago</th>
                      <th className="py-1 text-right">Monto</th>
                      <th className="py-1 text-right">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cierre.abonos.map((a) => (
                      <tr key={`${a.empresa_id}-${a.fecha_pago}-${a.monto}-${a.tipo_pago}`} className="border-b border-gray-100">
                        <td className="py-1">{a.cliente}</td>
                        <td className="py-1">{TIPO_PAGO_LABELS[a.tipo_pago]} {a.moneda === 'usd' ? 'US$' : 'Bs'}</td>
                        <td className="py-1 text-right">{formatCents(a.monto, a.moneda)}</td>
                        <td className="py-1 text-right">{a.fecha_pago.slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="mt-1 flex justify-between text-xs">
                <span className="text-gray-600">Total abonos</span>
                <span className="font-medium">{formatUsdCents(cierre.total_abonos_usd)} / {formatVesCents(cierre.total_abonos_bs)}</span>
              </div>
            </div>

            <div className="border-t border-gray-900 pt-2">
              <div className="flex justify-between text-base font-bold">
                <span>Total del día</span>
                <span>{formatUsdCents(totalDiaUsd)} / {formatVesCents(totalDiaBs)}</span>
              </div>
            </div>

            <p className="pb-1 pt-2 text-center text-[11px] tracking-wide">
              Tasa de cierre: Bs {cierre.tasa_cierre.toFixed(2)} por US$ 1
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}