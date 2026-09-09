import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins } from 'lucide-react';
import type { CierreDia, ResumenDia } from '@panaderia/core';
import { toVes } from '@panaderia/core';
import { cerrarCaja, resumenDia } from '../services/db';
import { useSesion } from '../store/sesion';
import { formatUsdCents, formatVesCents } from '../lib/format';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { CierreModal } from '../components/ui/CierreModal';

export default function CerrarCajaPage() {
  const navegar = useNavigate();
  const caja = useSesion((s) => s.caja);
  const operador = useSesion((s) => s.operador);
  const setCaja = useSesion((s) => s.setCaja);
  const tasa = useSesion((s) => s.tasa);

  const [resumen, setResumen] = useState<ResumenDia | null>(null);
  const [tasaCierre, setTasaCierre] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [cierre, setCierre] = useState<CierreDia | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (caja) {
      setTasaCierre(caja.tasa_cierre > 0 ? String(caja.tasa_cierre) : String(tasa));
    }
  }, [caja, tasa]);

  useEffect(() => {
    resumenDia()
      .then(setResumen)
      .catch(() => setResumen(null));
  }, []);

  const tasaNum = parseFloat(tasaCierre.trim().replace(',', '.'));
  const tasaValida = tasaCierre.trim() !== '' && Number.isFinite(tasaNum) && tasaNum > 0;
  const puedeCerrar = tasaValida && caja != null;

  const cerrar = async () => {
    if (!caja) return;
    setGuardando(true);
    setError(null);
    try {
      const c = await cerrarCaja({
        caja_id: caja.id,
        operador_id: operador!.id,
        tasa_cierre: tasaNum,
      });
      setCaja(null);
      setCierre(c);
      setConfirmar(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  const cerrarModal = () => navegar('/');

  return (
    <div>
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader title="Cerrar caja" subtitle={operador?.nombre} />
          <div className="space-y-4 p-5">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Cuenta del día</h3>
              {!resumen ? (
                <p className="text-sm text-gray-500">Cargando ventas del día…</p>
              ) : resumen.ventas.length === 0 && resumen.devoluciones.length === 0 ? (
                <p className="text-sm text-gray-500">No hay ventas registradas hoy.</p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs uppercase text-gray-500">
                        <th className="py-1 text-left">Factura</th>
                        <th className="py-1 text-left">Cliente</th>
                        <th className="py-1 text-center">Tipo</th>
                        <th className="py-1 text-right">US$</th>
                        <th className="py-1 text-right">Bs</th>
                        <th className="py-1 text-right">Devuelto</th>
                        <th className="py-1 text-right">Neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumen.ventas.map((v) => (
                        <tr key={v.venta_id} className="border-b border-gray-100">
                          <td className="py-1 font-mono text-xs">#{String(v.numero_factura).padStart(4, '0')}</td>
                          <td className="py-1">{v.cliente}</td>
                          <td className="py-1 text-center text-xs">{v.tipo === 'contado' ? 'Contado' : 'Crédito'}</td>
                          <td className="py-1 text-right">{formatUsdCents(v.monto)}</td>
                          <td className="py-1 text-right">{formatVesCents(toVes(v.monto, 'usd', v.tasa_cambio))}</td>
                          <td className={`py-1 text-right ${v.devuelto > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {v.devuelto > 0 ? `-${formatUsdCents(v.devuelto)}` : '—'}
                          </td>
                          <td className="py-1 text-right">{formatUsdCents(Math.max(v.monto - v.devuelto, 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold">
                        <td className="pt-2" colSpan={3}>
                          Total ventas
                        </td>
                        <td className="pt-2 text-right">{formatUsdCents(resumen.ventas.reduce((s, v) => s + v.monto, 0))}</td>
                        <td className="pt-2 text-right">
                          {formatVesCents(resumen.ventas.reduce((s, v) => s + toVes(v.monto, 'usd', v.tasa_cambio), 0))}
                        </td>
                        <td className="pt-2 text-right text-red-600">
                          -{formatUsdCents(resumen.devoluciones.reduce((s, d) => s + d.monto, 0))}
                        </td>
                        <td className="pt-2 text-right">
                          {formatUsdCents(
                            Math.max(
                              resumen.ventas.reduce((s, v) => s + v.monto, 0) -
                                resumen.devoluciones.reduce((s, d) => s + d.monto, 0),
                              0,
                            ),
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  {resumen.devoluciones.length > 0 && (
                    <div className="mt-3 border-t border-gray-100 pt-2">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Devoluciones del día (perdido)
                      </p>
                      <ul className="space-y-1">
                        {resumen.devoluciones.map((d) => (
                          <li key={d.id}>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">
                                Factura #{String(d.numero_factura).padStart(4, '0')} · {d.cliente}
                                {d.motivo ? ` · ${d.motivo}` : ''}
                              </span>
                              <span className="font-semibold text-red-600">-{formatUsdCents(d.monto)}</span>
                            </div>
                            {d.detalle.length > 0 && (
                              <ul className="mt-0.5 space-y-0.5 border-l border-red-100 pl-3 text-xs text-gray-500">
                                {d.detalle.map((p) => (
                                  <li key={p.producto_id} className="flex justify-between gap-4">
                                    <span>{p.nombre} × {p.cantidad}</span>
                                    <span>{formatUsdCents(p.subtotal)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-gray-500">
                        Las devoluciones no alteran el arqueo de efectivo (no hay reembolso).
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4">
              <Input
                label="Tasa de cierre"
                prefix={<span className="font-semibold">Bs</span>}
                type="number"
                step="0.01"
                min="0"
                value={tasaCierre}
                onChange={(e) => setTasaCierre(e.target.value)}
                error={!tasaValida ? 'Tasa inválida' : undefined}
              />
              <p className="mt-2 text-xs text-gray-500">
                El efectivo real se cuenta en persona; aquí se cierra con la cuenta del día.
              </p>
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            {!confirmar ? (
              <Button className="w-full" size="lg" disabled={!puedeCerrar} onClick={() => setConfirmar(true)}>
                <Coins className="h-4 w-4" /> Cerrar caja
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-center text-sm text-gray-600">
                  ¿Confirmas el cierre? Se bloquea el punto de venta hasta abrir una nueva
                  caja. Tasa de cierre: <strong>{tasaCierre} Bs</strong>.
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setConfirmar(false)}>
                    Volver
                  </Button>
                  <Button variant="danger" className="flex-1" disabled={guardando} onClick={cerrar}>
                    {guardando ? 'Cerrando…' : 'Sí, cerrar'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <CierreModal cierre={cierre} onClose={cerrarModal} />
    </div>
  );
}