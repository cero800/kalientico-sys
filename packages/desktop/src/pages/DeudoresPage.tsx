import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Wallet } from 'lucide-react';
import type { AbonoInput, EstadoCuenta, PagoLinea, Moneda, TipoPago } from '@panaderia/core';
import { TIPO_PAGO_LABELS, toUsd, toVes } from '@panaderia/core';
import { estadoCuenta, estadoCuentaTodos, historialPagos, registrarAbono } from '../services/db';
import { formatCents, formatUsdCents, formatVesCents, parseCentsInput } from '../lib/format';
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

export default function DeudoresPage() {
  const operadorId = useSesion((s) => s.operador?.id ?? 0);
  const tasa = useSesion((s) => s.tasa);
  const [deudores, setDeudores] = useState<EstadoCuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [seleccion, setSeleccion] = useState<EstadoCuenta | null>(null);
  const [historial, setHistorial] = useState<PagoLinea[]>([]);
  const [abonoAbierto, setAbonoAbierto] = useState(false);
  const [moneda, setMoneda] = useState<Moneda>('ves');
  const [tipo, setTipo] = useState<TipoPago>('efectivo');
  const [monto, setMonto] = useState('');
  const [referencia, setReferencia] = useState('');
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

  const abrirAbono = () => {
    setMoneda('ves');
    setTipo('efectivo');
    setMonto('');
    setReferencia('');
    setError(null);
    setAbonoAbierto(true);
  };

  // En US$ solo se acepta efectivo: al elegir US$ se fuerza el tipo efectivo.
  const cambiarMoneda = (m: Moneda) => {
    setMoneda(m);
    if (m === 'usd') setTipo('efectivo');
  };

  const guardarAbono = async () => {
    if (!seleccion) return;
    const montoCents = parseCentsInput(monto, moneda);
    if (montoCents === null || montoCents <= 0) {
      setError('Ingresa un monto válido');
      return;
    }
    if (tipo !== 'efectivo' && !referencia.trim()) {
      setError('El pago no en efectivo requiere referencia');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const abono: AbonoInput = {
        empresa_id: seleccion.empresa_id,
        monto: montoCents,
        tipo_pago: tipo,
        moneda,
        numero_referencia: tipo === 'efectivo' ? undefined : referencia.trim(),
        operador_id: operadorId,
      };
      await registrarAbono(abono);
      setAbonoAbierto(false);
      await cargar();
      await ver(seleccion);
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  // Saldo pendiente en US$ (base) y conversiones en vivo según moneda elegida.
  const tasaValida = tasa > 0;
  const saldoUsd = seleccion?.saldo_pendiente ?? 0;
  const montoCents = parseCentsInput(monto, moneda);
  const montoUsd = montoCents === null ? 0 : toUsd(montoCents, moneda, tasa);
  const quedaUsd = Math.max(saldoUsd - montoUsd, 0);
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
        <Button onClick={guardarAbono} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar abono'}</Button>
      </>}>
        <div className="space-y-3">
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 text-sm">
            <div>
              <p className="text-xs text-gray-500">Debe (saldo pendiente)</p>
              <p className="font-bold text-red-600">{formatUsdCents(saldoUsd)}</p>
              {aBs(saldoUsd) !== null && <p className="text-xs text-gray-600">{formatVesCents(aBs(saldoUsd)!)}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Queda por pagar</p>
              <p className="font-bold text-emerald-700">{formatUsdCents(quedaUsd)}</p>
              {aBs(quedaUsd) !== null && <p className="text-xs text-gray-600">{formatVesCents(aBs(quedaUsd)!)}</p>}
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <Select label="Moneda" value={moneda} onChange={(e) => cambiarMoneda(e.target.value as Moneda)}>
                <option value="usd">US$</option>
                <option value="ves">Bs</option>
              </Select>
            </div>
            <div className="flex-1">
              <Select
                label="Tipo de pago"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoPago)}
                disabled={moneda === 'usd'}
              >
                <option value="efectivo">Efectivo</option>
                <option value="pago_movil">Pago móvil</option>
                <option value="punto">Punto</option>
              </Select>
            </div>
          </div>
          <Input
            label="Monto"
            prefix={moneda === 'usd' ? '$' : 'Bs'}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder={moneda === 'usd' ? '0.00' : '0,00'}
          />
          {tipo !== 'efectivo' && (
            <Input label="N° referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
          )}
        </div>
      </Modal>
    </div>
  );
}