import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileDown, Printer, X } from 'lucide-react';
import type { Factura } from '@panaderia/core';
import { TIPO_PAGO_LABELS } from '@panaderia/core';
import { formatCents, formatUsdCents } from '../../lib/format';
import { facturaPdfB64, nombreArchivoFactura } from '../../lib/facturaPdf';
import { guardarFacturaPdf } from '../../services/db';
import { Button } from './Button';

interface Props {
  factura: Factura | null;
  onClose: () => void;
}

function fechaLegible(fecha: string): string {
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return fecha ?? '';
  return d.toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function FacturaModal({ factura, onClose }: Props) {
  const [imprimiendo, setImprimiendo] = useState(false);
  const [guardandoPdf, setGuardandoPdf] = useState(false);
  const [rutaPdf, setRutaPdf] = useState<string | null>(null);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);
  const guardadas = useRef<Set<number>>(new Set());

  const guardarPdf = async () => {
    if (!factura) return;
    setGuardandoPdf(true);
    setErrorPdf(null);
    try {
      const ruta = await guardarFacturaPdf(nombreArchivoFactura(factura), await facturaPdfB64(factura));
      setRutaPdf(ruta);
      guardadas.current.add(factura.venta_id);
    } catch (e) {
      setErrorPdf(String(e));
    } finally {
      setGuardandoPdf(false);
    }
  };

  // Guardado automático la primera vez que se abre cada factura.
  useEffect(() => {
    setRutaPdf(null);
    setErrorPdf(null);
    if (factura && !guardadas.current.has(factura.venta_id)) {
      guardarPdf();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factura?.venta_id]);

  useEffect(() => {
    setImprimiendo(false);
  }, [factura?.venta_id]);

  if (!factura) return null;

  const imprimir = () => {
    setImprimiendo(true);
    try {
      window.print();
    } finally {
      afterPrint();
    }
  };

  const afterPrint = () => {
    setTimeout(() => {
      setImprimiendo(false);
      onClose();
    }, 200);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Factura ${factura.numero_factura}`}
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Factura</h2>
            <p className="text-xs text-gray-500">Venta #{factura.venta_id} · {factura.fecha.slice(0, 10)}</p>
            {rutaPdf && (
              <p className="mt-0.5 text-xs text-emerald-600">PDF guardado en {rutaPdf}</p>
            )}
            {errorPdf && (
              <p className="mt-0.5 text-xs text-red-600">No se pudo guardar el PDF: {errorPdf}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={guardarPdf} disabled={guardandoPdf}>
              <FileDown className="h-4 w-4" /> {guardandoPdf ? 'Guardando…' : 'Guardar PDF'}
            </Button>
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
                {factura.negocio_nombre || 'Mi Negocio'}
              </h1>
              {factura.negocio_rif && <p className="text-xs">RIF: {factura.negocio_rif}</p>}
              {factura.negocio_telefono && <p className="text-xs">Telf: {factura.negocio_telefono}</p>}
              {factura.negocio_direccion && <p className="text-xs">{factura.negocio_direccion}</p>}
            </header>

            <div className="flex justify-between gap-3 border-b border-dashed border-gray-400 py-2">
              <div>
                <p className="text-[11px] uppercase text-gray-500">Factura N°</p>
                <p className="font-mono text-base font-bold">{String(factura.numero_factura).padStart(4, '0')}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase text-gray-500">Fecha</p>
                <p>{fechaLegible(factura.fecha)}</p>
              </div>
            </div>

            <div className="border-b border-dashed border-gray-400 py-2">
              <p className="text-[11px] uppercase text-gray-500">Cliente</p>
              <p className="font-medium">{factura.cliente}</p>
              {factura.cliente_rif && <p className="text-xs">{factura.cliente_rif}</p>}
            </div>

            <table className="w-full border-b border-dashed border-gray-400 py-1 text-left">
              <thead>
                <tr className="text-[11px] uppercase text-gray-500">
                  <th className="py-1">Producto</th>
                  <th className="py-1 text-center">Cant.</th>
                  <th className="py-1 text-right">P. unit.</th>
                  <th className="py-1 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {factura.detalle.map((d, i) => (
                  <tr key={i}>
                    <td className="py-1">{d.producto}</td>
                    <td className="py-1 text-center">{d.cantidad}</td>
                    <td className="py-1 text-right">{formatUsdCents(d.precio_unitario)}</td>
                    <td className="py-1 text-right">{formatUsdCents(d.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="space-y-0.5 py-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Subtotal</span>
                <span>{formatUsdCents(factura.subtotal)}</span>
              </div>
              {factura.descuento > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Descuento</span>
                  <span>-{formatUsdCents(factura.descuento)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-900 pt-1 text-base font-bold">
                <span>Total</span>
                <span>{formatUsdCents(factura.total)}</span>
              </div>
            </div>

            <div className="border-t border-dashed border-gray-400 py-2">
              <p className="mb-1 text-[11px] uppercase text-gray-500">Forma de pago</p>
              <ul className="space-y-0.5 text-xs">
                {factura.pagos.map((p, i) => (
                  <li key={i} className="flex justify-between">
                    <span>
                      {TIPO_PAGO_LABELS[p.tipo_pago]} {p.moneda === 'usd' ? 'US$' : 'Bs'}
                      {p.numero_referencia ? ` · Ref. ${p.numero_referencia}` : ''}
                    </span>
                    <span className="font-medium">{formatCents(p.monto, p.moneda)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {factura.devoluciones.length > 0 && (
              <div className="border-t border-dashed border-gray-400 py-2">
                <p className="mb-1 text-[11px] uppercase text-gray-500">
                  Devoluciones (panes deteriorados)
                </p>
                {factura.devoluciones.map((dev) => (
                  <div key={dev.id} className="mb-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-600">
                        Devuelto el {dev.fecha_devolucion.slice(0, 10)}
                        {dev.motivo ? ` · ${dev.motivo}` : ''}
                      </span>
                      <span className="font-semibold text-red-600">-{formatUsdCents(dev.monto)}</span>
                    </div>
                    {dev.detalle.length > 0 && (
                      <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-red-100 pl-3 text-[11px] text-gray-500">
                        {dev.detalle.map((p) => (
                          <li key={p.producto_id} className="flex justify-between gap-4">
                            <span>{p.nombre} × {p.cantidad}</span>
                            <span>{formatUsdCents(p.subtotal)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                <div className="mt-1 flex justify-between text-xs font-bold">
                  <span>Saldo final de la venta (neto)</span>
                  <span>
                    {formatUsdCents(
                      Math.max(
                        factura.total - factura.devoluciones.reduce((s, d) => s + d.monto, 0),
                        0,
                      ),
                    )}
                  </span>
                </div>
              </div>
            )}

            <p className="pb-1 text-center text-[11px] tracking-wide">
              {factura.tasa_cambio > 0
                ? `Tasa: Bs ${factura.tasa_cambio.toFixed(2)} por US$ 1`
                : 'Gracias por su compra'}
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}