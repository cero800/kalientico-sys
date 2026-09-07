import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2, Wallet } from 'lucide-react';
import type { AbonoInput, EstadoCuenta, PagoLinea, Moneda, TipoPago } from '@panaderia/core';
import { TIPO_PAGO_LABELS, toUsd, toVes } from '@panaderia/core';
import { estadoCuentaTodos, historialPagos, registrarAbono } from '../services/db';
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

interface PagoForm {
  id: number;
  moneda: Moneda;
  tipo_pago: TipoPago;
  monto: string;
  numero_referencia: string;
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
  const [abonoAbierto, setAbonoAbierto] = useState(false);
  const [pagos, setPagos] = useState<PagoForm[]>([pagoVacio()]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = () => estadoCuentaTodos().then(setDeudores).finally(() => setCargando(false));
  useEffect(() => {
    cargar();
  }, []);

  const ver = async (d: EstadoCuenta) => {
    setSeleccion(d);
    setHistorial([]);
    try {
      setHistorial(await historialPagos(d.empresa_id));
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
        setHistorial(await historialPagos(empresaId));
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
                      {d.saldo_pendiente > 0 && (
                        <Badge tone="red">Pendiente</Badge>
                      )}
                    </Td>
                    <Td className="text-right">{formatUsdCents(d.total_facturado)}</Td>
                    <Td className="text-right">{formatUsdCents(d.total_pagado)}</Td>
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
            subtitle={seleccion ? `Saldo pendiente: ${formatUsdCents(seleccion.saldo_pendiente)}` : 'Selecciona un cliente'}
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

          <div className="flex justify-between rounded-lg bg-emerald-50 p-3 text-sm">
            <span className="text-gray-600">A abonar ahora</span>
            <span className="text-right">
              <strong className="block">{formatUsdCents(pagadoUsd)}</strong>
              <span className="block text-xs text-gray-500">{formatVesCents(Math.round(pagadoUsd * tasa))}</span>
            </span>
          </div>

          {superaSaldo && (
            <p className="text-xs text-red-600">El abono supera el saldo pendiente ({formatUsdCents(saldoUsd)})</p>
          )}
          {referenciaFaltante && <p className="text-xs text-red-600">El pago móvil requiere el número de referencia</p>}
        </div>
      </Modal>
    </div>
  );
}