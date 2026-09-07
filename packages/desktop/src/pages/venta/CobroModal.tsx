import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Moneda, TipoPago, VentaInput } from '@panaderia/core';
import { useCarrito } from '../../store/carrito';
import { useSesion } from '../../store/sesion';
import { formatUsdCents, formatVesCents, parseCentsInput } from '../../lib/format';
import { validarCobertura } from '../../lib/pago';
import type { MontoPago } from '../../lib/pago';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';

interface PagoForm {
  id: number;
  moneda: Moneda;
  tipo_pago: TipoPago;
  monto: string;
  numero_referencia: string;
}

let siguienteId = 1;

function pagoVacio(): PagoForm {
  return { id: siguienteId++, moneda: 'usd', tipo_pago: 'efectivo', monto: '', numero_referencia: '' };
}

function aMontoPago(p: PagoForm): MontoPago {
  return {
    monto: parseCentsInput(p.monto, p.moneda) ?? 0,
    tipo_pago: p.tipo_pago,
    moneda: p.moneda,
    numero_referencia: p.numero_referencia.trim() || undefined,
  };
}

interface Props {
  abre: boolean;
  total: number;
  clienteId: number;
  sePermiteCredito: boolean;
  onCerrar: () => void;
  onConfirmar: (venta: VentaInput) => Promise<void>;
}

export default function CobroModal({ abre, total, clienteId, sePermiteCredito, onCerrar, onConfirmar }: Props) {
  const lineas = useCarrito((s) => s.lineas);
  const operadorId = useSesion((s) => s.operador?.id ?? 0);
  const tasa = useSesion((s) => s.tasa);

  const [tipo, setTipo] = useState<'contado' | 'credito'>('contado');
  const [pagos, setPagos] = useState<PagoForm[]>([pagoVacio()]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [descuento, setDescuento] = useState('');

  const esContado = tipo === 'contado';

  const descuentoCents = parseCentsInput(descuento, 'usd');
  const totalConDescuento = Math.max(0, total - (descuentoCents ?? 0));

  const montos = useMemo(() => pagos.map(aMontoPago), [pagos]);
  const validacion = useMemo(
    () => validarCobertura(totalConDescuento, esContado ? montos : [], tasa),
    [totalConDescuento, montos, esContado, tasa],
  );

  const todosMontosValidos = pagos.every((p) => p.monto.trim() === '' || parseCentsInput(p.monto, p.moneda) !== null);
  const referenciaFaltante = pagos.some(
    (p) => (p.tipo_pago === 'pago_movil' || p.tipo_pago === 'biopago') && p.numero_referencia.trim() === '',
  );
  const puedeConfirmar =
    !guardando &&
    !referenciaFaltante &&
    todosMontosValidos &&
    (esContado ? validacion.valido : true) &&
    (!descuento.trim() || descuentoCents !== null);

  const confirmar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const venta: VentaInput = {
        empresa_id: clienteId,
        tipo,
        descuento: descuentoCents ?? 0,
        detalles: lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad })),
        pagos: esContado
          ? montos.filter((m) => m.monto > 0).map((m) => ({
              monto: m.monto,
              tipo_pago: m.tipo_pago,
              moneda: m.moneda,
              numero_referencia: m.numero_referencia,
            }))
          : [],
        operador_id: operadorId,
      };
      await onConfirmar(venta);
      setPagos([pagoVacio()]);
      setTipo('contado');
      setDescuento('');
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  const cambiar = (id: number, parcial: Partial<PagoForm>) =>
    setPagos((prev) => prev.map((p) => (p.id === id ? { ...p, ...parcial } : p)));

  // En US$ solo se acepta efectivo: al elegir US$ se fuerza el tipo efectivo.
  const cambiarMoneda = (id: number, moneda: Moneda) =>
    setPagos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, moneda, tipo_pago: moneda === 'usd' ? 'efectivo' : p.tipo_pago } : p)),
    );

  return (
    <Modal
      open={abre}
      title="Cobro"
      onClose={onCerrar}
      footer={
        <Button onClick={confirmar} size="lg" disabled={!puedeConfirmar}>
          {guardando ? 'Guardando…' : 'Confirmar venta'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <Select label="Tipo de venta" value={tipo} onChange={(e) => setTipo(e.target.value as 'contado' | 'credito')}>
              <option value="contado">Contado</option>
              {sePermiteCredito && <option value="credito">Crédito</option>}
            </Select>
          </div>
          {esContado && (
            <div className="flex-1">
              <Input
                label="Descuento (US$)"
                value={descuento}
                onChange={(e) => setDescuento(e.target.value)}
                placeholder="0.00"
                error={descuento.trim() !== '' && descuentoCents === null ? 'Monto no válido' : undefined}
              />
            </div>
          )}
        </div>

        {esContado && (
          <div className="space-y-2">
            {pagos.map((p, i) => (
              <div key={p.id} className="flex gap-2 rounded-lg border border-gray-200 p-2">
                <div className="w-24">
                  <Select
                    aria-label={`Moneda pago ${i + 1}`}
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
                    aria-label={`Tipo pago ${i + 1}`}
                    value={p.tipo_pago}
                    onChange={(e) => cambiar(p.id, { tipo_pago: e.target.value as TipoPago })}
                    disabled={p.moneda === 'usd'}
                    className="px-2"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="pago_movil">Pago móvil</option>
                    <option value="punto">Punto</option>
                    <option value="biopago">Biopago</option>
                  </Select>
                </div>
                <div className="flex-1">
                  <Input
                    aria-label={`Monto pago ${i + 1}`}
                    value={p.monto}
                    onChange={(e) => cambiar(p.id, { monto: e.target.value })}
                    placeholder={p.moneda === 'usd' ? '0.00' : '0,00'}
                    error={p.monto.trim() !== '' && parseCentsInput(p.monto, p.moneda) === null ? 'Monto no válido' : undefined}
                  />
                </div>
                {(p.tipo_pago === 'pago_movil' || p.tipo_pago === 'biopago') && (
                  <div className="flex-1">
                    <Input
                      aria-label={`Referencia pago ${i + 1}`}
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
            <Button variant="secondary" size="sm" onClick={() => setPagos((prev) => [...prev, pagoVacio()])}>
              <Plus className="h-4 w-4" /> Agregar pago
            </Button>
          </div>
        )}

        <div className="space-y-1.5 rounded-lg bg-gray-50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <strong>{formatUsdCents(total)}</strong>
          </div>
          {descuentoCents ? (
            <div className="flex justify-between">
              <span className="text-gray-600">Descuento</span>
              <strong className="text-red-600">-{formatUsdCents(descuentoCents)}</strong>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-gray-200 pt-2">
            <span className="font-semibold text-gray-800">Total a pagar</span>
            <span className="text-right">
              <strong className="block text-lg">{formatUsdCents(totalConDescuento)}</strong>
              <strong className="block text-sm text-emerald-700">{formatVesCents(Math.round(totalConDescuento * tasa))}</strong>
            </span>
          </div>

          {esContado && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-600">Pagado</span>
                <span className="text-right">
                  <strong className="block">{formatUsdCents(validacion.pagadoUsd)}</strong>
                  <span className="block text-xs text-gray-500">{formatVesCents(Math.round(validacion.pagadoUsd * tasa))}</span>
                </span>
              </div>
              {!validacion.valido && validacion.faltanteUsd > 0 && (
                <p className="text-xs text-red-600">
                  Faltan {formatUsdCents(validacion.faltanteUsd)}{' '}
                  <span className="text-gray-400">({formatVesCents(Math.round(validacion.faltanteUsd * tasa))})</span>
                </p>
              )}
              {validacion.valido && validacion.pagadoUsd > totalConDescuento && (
                <p className="text-xs font-semibold text-emerald-600">
                  Vuelto: {formatUsdCents(validacion.pagadoUsd - totalConDescuento)}{' '}
                  <span className="font-normal text-gray-400">
                    ({formatVesCents(Math.round((validacion.pagadoUsd - totalConDescuento) * tasa))})
                  </span>
                </p>
              )}
              {referenciaFaltante && (
                <p className="text-xs text-red-600">El pago móvil y biopago requieren el número de referencia</p>
              )}
            </>
          )}
        </div>

        <p className="text-xs text-gray-500">Equivalente Bs a la tasa {formatVesCents(Math.round(tasa * 100))}</p>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}