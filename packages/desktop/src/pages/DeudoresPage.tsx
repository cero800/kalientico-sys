import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2, Undo2, Wallet } from 'lucide-react';
import type {
  AbonoInput,
  DetalleVentaDevolucion,
  Devolucion,
  EstadoCuenta,
  PagoLinea,
  Moneda,
  TipoPago,
  VentaDevolucion,
} from '@panaderia/core';
import { TIPO_PAGO_LABELS, toUsd, toVes } from '@panaderia/core';
import {
  estadoCuentaTodos,
  historialPagos,
  listarDevoluciones,
  listarVentasEmpresa,
  detalleVenta,
  registrarAbono,
  registrarDevolucion,
} from '../services/db';
import { formatCents, formatUsdCents, formatVesCents, parseCentsInput } from '../lib/format';
import type { MontoPago } from '../lib/pago';
import { useSesion } from '../store/sesion';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Table, THead, Th, Td } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { EmptyState, PageHeader } from '../components/ui/Page';
import { PageLoader } from '../components/ui/Spinner';
import { DatePicker } from '../components/ui/DatePicker';

interface PagoForm {
  id: number;
  moneda: Moneda;
  tipo_pago: TipoPago;
  monto: string;
  numero_referencia: string;
}

interface LineaDev {
  detalle: DetalleVentaDevolucion;
  devuelve: string;
}

let siguienteId = 1;

function pagoVacio(): PagoForm {
  return { id: siguienteId++, moneda: 'ves', tipo_pago: 'efectivo', monto: '', numero_referencia: '' };
}

function aMontoPago(p: PagoForm): MontoPago {
  return {
    monto: parseCentsInput(p.monto, p.moneda) ?? 0,
    tipo_pago: p.tipo_pago,
    moneda: p.moneda,
    numero_referencia: p.numero_referencia.trim() || undefined,
  };
}

function centsToInput(cents: number, moneda: Moneda): string {
  if (cents <= 0) return '';
  const s = (cents / 100).toFixed(2);
  return moneda === 'usd' ? s : s.replace('.', ',');
}

export default function DeudoresPage() {
  const operadorId = useSesion((s) => s.operador?.id ?? 0);
  const tasa = useSesion((s) => s.tasa);
  const [deudores, setDeudores] = useState<EstadoCuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [seleccion, setSeleccion] = useState<EstadoCuenta | null>(null);
  const [historial, setHistorial] = useState<PagoLinea[]>([]);
  const [ventas, setVentas] = useState<VentaDevolucion[]>([]);
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([]);
  const [abonoAbierto, setAbonoAbierto] = useState(false);
  const [pagos, setPagos] = useState<PagoForm[]>([pagoVacio()]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [devAbierto, setDevAbierto] = useState(false);
  const [devVenta, setDevVenta] = useState<VentaDevolucion | null>(null);
  const [devLineas, setDevLineas] = useState<LineaDev[]>([]);
  const [devMotivo, setDevMotivo] = useState('');
  const [devError, setDevError] = useState<string | null>(null);
  const [devGuardando, setDevGuardando] = useState(false);
  const [filtroDia, setFiltroDia] = useState('');

  const devolucionesVisibles =
    filtroDia === '' ? devoluciones : devoluciones.filter((d) => (d.fecha_devolucion ?? '').slice(0, 10) === filtroDia);

  const cargar = () => estadoCuentaTodos().then(setDeudores).finally(() => setCargando(false));
  useEffect(() => {
    cargar();
  }, []);

  const cargarHistorial = async (empresaId: number) => {
    const [pagos, facturas, devs] = await Promise.allSettled([
      historialPagos(empresaId),
      listarVentasEmpresa(empresaId),
      listarDevoluciones(empresaId),
    ]);
    setHistorial(pagos.status === 'fulfilled' ? pagos.value : []);
    setVentas(facturas.status === 'fulfilled' ? facturas.value : []);
    setDevoluciones(devs.status === 'fulfilled' ? devs.value : []);
  };

  const ver = async (d: EstadoCuenta) => {
    setSeleccion(d);
    setHistorial([]);
    setVentas([]);
    setDevoluciones([]);
    try {
      await cargarHistorial(d.empresa_id);
    } catch {
      setHistorial([]);
    }
  };

  // Tras un abono refresca la lista Y la fila seleccionada, para que el saldo
  // refleje lo pagado (p. ej. 11.20 → 1.20) en vez de quedar obsoleto.
  const refrescar = async (empresaId: number) => {
    const todos = await estadoCuentaTodos();
    setDeudores(todos);
    const actual = todos.find((e) => e.empresa_id === empresaId);
    setSeleccion(actual ?? null);
    if (actual) {
      try {
        await cargarHistorial(empresaId);
      } catch {
        setHistorial([]);
      }
    }
  };

  const abrirAbono = () => {
    setPagos([pagoVacio()]);
    setError(null);
    setAbonoAbierto(true);
  };

  const abrirDevolucion = async (v: VentaDevolucion) => {
    setDevError(null);
    setDevMotivo('');
    setDevVenta(v);
    try {
      const lineas = await detalleVenta(v.venta_id);
      setDevLineas(lineas.map((l) => ({ detalle: l, devuelve: '0' })));
      setDevAbierto(true);
    } catch (e) {
      setDevError(String(e));
    }
  };

  const guardarDevolucion = async () => {
    if (!seleccion || !devVenta) return;
    setDevGuardando(true);
    setDevError(null);
    try {
      const detalle = devLineas.flatMap((l) => {
        const n = Number(l.devuelve.replace(',', '.'));
        if (!Number.isFinite(n) || n <= 0) return [];
        return [{ producto_id: l.detalle.producto_id, cantidad: n, precio_unitario: l.detalle.precio_unitario }];
      });
      await registrarDevolucion({
        empresa_id: seleccion.empresa_id,
        venta_id: devVenta.venta_id,
        monto: totalDevUsd,
        motivo: devMotivo.trim() || null,
        operador_id: operadorId,
        detalle,
      });
      setDevAbierto(false);
      await refrescar(seleccion.empresa_id);
    } catch (e) {
      setDevError(String(e));
    } finally {
      setDevGuardando(false);
    }
  };

  const cambiar = (id: number, parcial: Partial<PagoForm>) =>
    setPagos((prev) => prev.map((p) => (p.id === id ? { ...p, ...parcial } : p)));

  // En US$ solo se acepta efectivo: al elegir US$ se fuerza el tipo efectivo.
  const cambiarMoneda = (id: number, moneda: Moneda) => {
    const m: Moneda = moneda;
    setPagos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, moneda: m, tipo_pago: m === 'usd' ? 'efectivo' : p.tipo_pago } : p)),
    );
  };

  const abonarRestante = () => {
    if (pagos.length === 0 || !seleccion) return;
    const restoUsd = pagos
      .slice(1)
      .reduce((acc, p) => acc + toUsd(aMontoPago(p).monto, p.moneda, tasa), 0);
    const restanteUsd = Math.max(seleccion.saldo_pendiente - restoUsd, 0);
    const monedaLinea = pagos[0].moneda;
    const enMoneda = monedaLinea === 'usd' ? restanteUsd : Math.round(restanteUsd * tasa);
    cambiar(pagos[0].id, { monto: centsToInput(enMoneda, monedaLinea) });
  };

  const guardarAbono = async () => {
    if (!seleccion) return;
    setGuardando(true);
    setError(null);
    try {
      const abono: AbonoInput = {
        empresa_id: seleccion.empresa_id,
        pagos: montos.filter((m) => m.monto > 0),
        operador_id: operadorId,
      };
      await registrarAbono(abono);
      setAbonoAbierto(false);
      await refrescar(seleccion.empresa_id);
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  // Saldo pendiente en US$ (base) y conversiones en vivo según la moneda elegida.
  const tasaValida = tasa > 0;
  const saldoUsd = seleccion?.saldo_pendiente ?? 0;
  const montos = pagos.map(aMontoPago);
  const pagadoUsd = montos.reduce((acc, m) => acc + toUsd(m.monto, m.moneda, tasa), 0);
  const quedaUsd = Math.max(saldoUsd - pagadoUsd, 0);
  const superaSaldo = pagadoUsd > saldoUsd;
  const todosMontosValidos = pagos.every(
    (p) => p.monto.trim() === '' || parseCentsInput(p.monto, p.moneda) !== null,
  );
  const referenciaFaltante = pagos.some(
    (p) => p.tipo_pago === 'pago_movil' && p.numero_referencia.trim() === '',
  );
  const puedeGuardarAbono =
    !guardando && pagadoUsd > 0 && !superaSaldo && !referenciaFaltante && todosMontosValidos;
  const aBs = (usd: number) => (tasaValida ? toVes(usd, 'usd', tasa) : null);

  const devolvible = (devVenta?.total ?? 0) - (devVenta?.devuelto ?? 0);
  const totalDevUsd = devLineas.reduce((acc, l) => {
    const n = Number(l.devuelve.replace(',', '.'));
    return acc + (Number.isFinite(n) && n > 0 ? Math.round(n * l.detalle.precio_unitario) : 0);
  }, 0);
  const cantidadesDevInvalidas = devLineas.some((l) => {
    const n = Number(l.devuelve.replace(',', '.'));
    return l.devuelve.trim() === '' || !Number.isFinite(n) || n < 0 || n > l.detalle.cantidad;
  });
  const excedeDevolucion = totalDevUsd > devolvible;
  const puedeGuardarDevolucion =
    !devGuardando && totalDevUsd > 0 && !cantidadesDevInvalidas && !excedeDevolucion;

  if (cargando) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Deudores"
        subtitle="Estado de cuenta y cobranza"
        actions={
          <Button variant="secondary" onClick={cargar} aria-label="Recargar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Saldo pendiente por cliente" subtitle="Ventas a crédito" />
          {deudores.length === 0 ? (
            <EmptyState icon={<Wallet className="h-8 w-8" />} message="No hay deudores destacados" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Cliente</Th>
                  <Th className="text-right">Facturado</Th>
                  <Th className="text-right">Pagado</Th>
                  <Th className="text-right">Vencido</Th>
                  <Th className="text-right">Saldo</Th>
                </tr>
              </THead>
              <tbody>
                {deudores.map((d) => (
                  <tr
                    key={d.empresa_id}
                    onClick={() => ver(d)}
                    className={`cursor-pointer border-b border-gray-50 last:border-0 hover:bg-emerald-50/40 ${
                      seleccion?.empresa_id === d.empresa_id ? 'bg-emerald-50/60' : ''
                    }`}
                  >
                    <Td>
                      <span className="font-medium text-gray-900">{d.nombre_comercial}</span>
                      {d.saldo_pendiente > 0 && d.total_vencido > 0 && (
                        <Badge tone="red">Vencido</Badge>
                      )}
                      {d.saldo_pendiente > 0 && d.total_vencido === 0 && (
                        <Badge tone="green">Al día</Badge>
                      )}
                      {d.dias_credito > 0 && (
                        <span className="block text-xs text-gray-400">Plazo: {d.dias_credito} días</span>
                      )}
                    </Td>
                    <Td className="text-right">{formatUsdCents(d.total_facturado)}</Td>
                    <Td className="text-right">{formatUsdCents(d.total_pagado)}</Td>
                    <Td className={`text-right font-bold ${d.total_vencido > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {d.total_vencido > 0 ? formatUsdCents(d.total_vencido) : '—'}
                    </Td>
                    <Td className={`text-right font-bold ${d.saldo_pendiente > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatUsdCents(d.saldo_pendiente)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title={seleccion ? `Historial — ${seleccion.nombre_comercial}` : 'Historial de pagos'}
            subtitle={seleccion
                ? seleccion.total_vencido > 0
                  ? `Vencido: ${formatUsdCents(seleccion.total_vencido)} · Saldo: ${formatUsdCents(seleccion.saldo_pendiente)}`
                  : `Saldo pendiente: ${formatUsdCents(seleccion.saldo_pendiente)}`
                : 'Selecciona un cliente'
            }
            actions={
              seleccion && (seleccion.saldo_pendiente ?? 0) > 0 ? (
                <Button onClick={abrirAbono}>
                  <Plus className="h-4 w-4" /> Abono
                </Button>
              ) : undefined
            }
          />
          {!seleccion ? (
            <EmptyState message="Haz clic en un cliente para ver su historial" />
          ) : historial.length === 0 ? (
            <EmptyState message="Sin pagos registrados" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Factura</Th>
                  <Th>Tipo</Th>
                  <Th className="text-right">Monto</Th>
                  <Th>Fecha</Th>
                </tr>
              </THead>
              <tbody>
                {historial.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 last:border-0">
                    <Td className="font-mono text-xs">{p.numero_factura ? `#${p.numero_factura}` : 'Abono'}</Td>
                    <Td>
                      <Badge tone={p.tipo_pago === 'efectivo' ? 'green' : 'blue'}>{TIPO_PAGO_LABELS[p.tipo_pago]}</Badge>{' '}
                      {p.moneda.toUpperCase()}
                      {p.numero_referencia ? ` · Ref. ${p.numero_referencia}` : ''}
                    </Td>
                    <Td className="text-right">{formatCents(p.monto, p.moneda)}</Td>
                    <Td className="text-xs text-gray-500">{p.fecha_pago?.slice(0, 10) ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title={seleccion ? `Facturas — ${seleccion.nombre_comercial}` : 'Facturas y devoluciones'}
            subtitle="Devoluciones por panes deteriorados/extraviados"
          />
          {!seleccion ? (
            <EmptyState message="Selecciona un cliente" />
          ) : ventas.length === 0 ? (
            <EmptyState message="Sin facturas entregadas" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Factura</Th>
                  <Th>Tipo</Th>
                  <Th>Entrega</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Devuelto</Th>
                  <Th className="text-right"></Th>
                </tr>
              </THead>
              <tbody>
                {ventas.map((v) => (
                  <tr key={v.venta_id} className="border-b border-gray-50 last:border-0">
                    <Td className="font-mono text-xs">#{v.numero_factura}</Td>
                    <Td>
                      <Badge tone={v.tipo === 'credito' ? 'amber' : 'blue'}>{v.tipo === 'credito' ? 'Crédito' : 'Contado'}</Badge>
                    </Td>
                    <Td className="text-xs text-gray-500">{v.fecha?.slice(0, 10) ?? '—'}</Td>
                    <Td className="text-right">{formatUsdCents(v.total)}</Td>
                    <Td className={`text-right ${v.devuelto > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {v.devuelto > 0 ? `-${formatUsdCents(v.devuelto)}` : '—'}
                    </Td>
                    <Td className="text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => abrirDevolucion(v)}
                        disabled={v.total - v.devuelto <= 0}
                        aria-label={`Devolver factura ${v.numero_factura}`}
                      >
                        <Undo2 className="h-3.5 w-3.5" /> Devolver
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {seleccion && (devoluciones.length > 0 || filtroDia !== '') && (
            <div className="mt-4 border-t border-gray-100 px-4 pb-4 pt-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Devoluciones registradas{filtroDia === '' ? ` · ${devoluciones.length}` : ` · ${devolucionesVisibles.length}`}
                </p>
                <div className="flex items-center gap-2">
                  <DatePicker
                    value={filtroDia === '' ? new Date().toISOString().slice(0, 10) : filtroDia}
                    onChange={setFiltroDia}
                    aria-label="Filtrar devoluciones por día"
                  />
                  {filtroDia !== '' && (
                    <Button variant="ghost" size="sm" onClick={() => setFiltroDia('')}>
                      Todos
                    </Button>
                  )}
                </div>
              </div>
              {devolucionesVisibles.length === 0 ? (
                <p className="text-sm text-gray-500">Sin devoluciones registradas el {filtroDia}</p>
              ) : (
                <ul className="space-y-2">
                  {devolucionesVisibles.map((d) => (
                    <li key={d.id}>
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-gray-600">
                          {d.fecha_devolucion?.slice(0, 10) ?? '—'} · Factura #{d.numero_factura}
                          {d.motivo ? ` · ${d.motivo}` : ''}
                        </span>
                        <span className="shrink-0 font-semibold text-red-600">-{formatUsdCents(d.monto)}</span>
                      </div>
                      {d.detalle.length > 0 && (
                        <ul className="mt-1 space-y-1 border-l-2 border-red-100 pl-5 text-xs text-gray-500">
                          {d.detalle.map((p) => (
                            <li key={p.producto_id} className="flex items-center justify-between gap-4">
                              <span>{p.nombre} × {p.cantidad}</span>
                              <span className="shrink-0 tabular-nums">{formatUsdCents(p.subtotal)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      </div>

      <Modal open={abonoAbierto} title="Registrar abono" onClose={() => setAbonoAbierto(false)} footer={<>
        <Button variant="secondary" onClick={() => setAbonoAbierto(false)}>Cancelar</Button>
        <Button onClick={guardarAbono} disabled={!puedeGuardarAbono}>{guardando ? 'Guardando…' : 'Guardar abono'}</Button>
      </>}>
        <div className="space-y-3">
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <div className="grid grid-cols-3 gap-3 rounded-lg bg-gray-50 p-3 text-sm">
            <div>
              <p className="text-xs text-gray-500">Facturado</p>
              <p className="font-bold text-gray-900">{formatUsdCents(seleccion?.total_facturado ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Debe (saldo)</p>
              <p className="font-bold text-red-600">{formatUsdCents(saldoUsd)}</p>
              {aBs(saldoUsd) !== null && <p className="font-semibold text-emerald-700">{formatVesCents(aBs(saldoUsd)!)}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Queda tras este abono</p>
              <p className={`font-bold ${superaSaldo ? 'text-red-600' : 'text-emerald-700'}`}>
                {superaSaldo ? 'Excede el saldo' : formatUsdCents(quedaUsd)}
              </p>
              {!superaSaldo && aBs(quedaUsd) !== null && (
                <p className="font-semibold text-gray-600">{formatVesCents(aBs(quedaUsd)!)}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {pagos.map((p, i) => (
              <div key={p.id} className="flex gap-2 rounded-lg border border-gray-200 p-2">
                <div className="w-24">
                  <Select
                    aria-label={`Moneda abono ${i + 1}`}
                    value={p.moneda}
                    onChange={(e) => cambiarMoneda(p.id, e.target.value as Moneda)}
                    className="px-2"
                  >
                    <option value="usd">US$</option>
                    <option value="ves">Bs</option>
                  </Select>
                </div>
                <div className="w-32">
                  <Select
                    aria-label={`Tipo abono ${i + 1}`}
                    value={p.tipo_pago}
                    onChange={(e) => cambiar(p.id, { tipo_pago: e.target.value as TipoPago })}
                    disabled={p.moneda === 'usd'}
                    className="px-2"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="pago_movil">Pago móvil</option>
                    <option value="punto">Punto</option>
                  </Select>
                </div>
                <div className="flex-1">
                  <Input
                    aria-label={`Monto abono ${i + 1}`}
                    value={p.monto}
                    onChange={(e) => cambiar(p.id, { monto: e.target.value })}
                    placeholder={p.moneda === 'usd' ? '0.00' : '0,00'}
                    error={p.monto.trim() !== '' && parseCentsInput(p.monto, p.moneda) === null ? 'Monto no válido' : undefined}
                  />
                </div>
                {p.tipo_pago === 'pago_movil' && (
                  <div className="flex-1">
                    <Input
                      aria-label={`Referencia abono ${i + 1}`}
                      value={p.numero_referencia}
                      onChange={(e) => cambiar(p.id, { numero_referencia: e.target.value })}
                      placeholder="N° referencia"
                      error={p.numero_referencia.trim() === '' ? 'Requerida' : undefined}
                    />
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Quitar pago ${i + 1}`}
                  onClick={() => setPagos((prev) => prev.filter((x) => x.id !== p.id))}
                  disabled={pagos.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPagos((prev) => [...prev, pagoVacio()])}>
                <Plus className="h-4 w-4" /> Agregar pago
              </Button>
              <Button variant="secondary" size="sm" onClick={abonarRestante}>
                Abonar restante
              </Button>
            </div>
          </div>

          {superaSaldo && (
            <p className="text-xs text-red-600">El abono supera el saldo pendiente ({formatUsdCents(saldoUsd)})</p>
          )}
          {referenciaFaltante && <p className="text-xs text-red-600">El pago móvil requiere el número de referencia</p>}
        </div>
      </Modal>

      <Modal
        open={devAbierto}
        title={`Devolución — factura #${devVenta?.numero_factura ?? ''}`}
        onClose={() => setDevAbierto(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setDevAbierto(false)}>Cancelar</Button>
          <Button onClick={guardarDevolucion} disabled={!puedeGuardarDevolucion}>
            {devGuardando ? 'Guardando…' : 'Registrar devolución'}
          </Button>
        </>}
      >
        <div className="space-y-3">
          {devError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{devError}</p>}

          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3 text-sm">
            <span className="text-gray-600">Devoluble de la factura</span>
            <span className="font-bold text-gray-900">{formatUsdCents(devolvible)}</span>
          </div>

          <div className="space-y-2">
            {devLineas.map((l, i) => {
              const n = Number(l.devuelve.replace(',', '.'));
              const invalida = l.devuelve.trim() !== '' && (!Number.isFinite(n) || n < 0 || n > l.detalle.cantidad);
              const subtotal = Number.isFinite(n) && n > 0 ? Math.round(n * l.detalle.precio_unitario) : 0;
              return (
                <div key={l.detalle.producto_id} className="flex items-center gap-2 rounded-lg border border-gray-200 p-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{l.detalle.nombre}</p>
                    <p className="text-xs text-gray-500">
                      Vendidos: {l.detalle.cantidad} · {formatUsdCents(l.detalle.subtotal)}
                    </p>
                  </div>
                  <div className="w-28">
                    <Input
                      aria-label={`Devolver ${l.detalle.nombre}`}
                      value={l.devuelve}
                      onChange={(e) =>
                        setDevLineas((prev) => prev.map((x, j) => (j === i ? { ...x, devuelve: e.target.value } : x)))
                      }
                      inputMode="decimal"
                      error={invalida ? 'Cantidad inválida' : undefined}
                    />
                  </div>
                  <span className="w-24 text-right text-sm font-semibold text-gray-700">{formatUsdCents(subtotal)}</span>
                </div>
              );
            })}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Motivo (opcional)</label>
            <Input
              aria-label="Motivo de la devolución"
              value={devMotivo}
              onChange={(e) => setDevMotivo(e.target.value)}
              placeholder="p. ej. pan deteriorado"
            />
          </div>

          <div className="flex justify-between rounded-lg bg-red-50 p-3 text-sm">
            <span className="text-gray-600">Total a devolver</span>
            <strong className="text-red-700">{formatUsdCents(totalDevUsd)}</strong>
          </div>

          {cantidadesDevInvalidas && (
            <p className="text-xs text-red-600">La cantidad devuelta no puede superar la vendida por producto</p>
          )}
          {excedeDevolucion && (
            <p className="text-xs text-red-600">
              La devolución supera el monto devoluble de la factura ({formatUsdCents(devolvible)})
            </p>
          )}
          {totalDevUsd === 0 && devLineas.length > 0 && (
            <p className="text-xs text-gray-500">Indica una cantidad mayor a 0 para registrar la devolución</p>
          )}
        </div>
      </Modal>
    </div>
  );
}