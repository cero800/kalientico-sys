import type { Moneda, PagoInput, TipoPago } from '@panaderia/core';
import { toUsd } from '@panaderia/core';

export interface MontoPago {
  monto: number;
  tipo_pago: TipoPago;
  moneda: Moneda;
  numero_referencia?: string;
}

/// Suma de uno o varios pagos convertida a US$ (base).
export function pagadoEnUsd(pagos: MontoPago[], tasa: number): number {
  return pagos.reduce((acc, p) => acc + toUsd(p.monto, p.moneda, tasa), 0);
}

export interface ValidacionPago {
  pagadoUsd: number;
  faltanteUsd: number;
  valido: boolean;
}

/// Valida que los pagos cubran el total de una venta de contado
/// (misma regla que el backend: cubre el total y no supera total+1).
export function validarCobertura(totalUsd: number, pagos: MontoPago[], tasa: number): ValidacionPago {
  const pagadoUsd = pagadoEnUsd(pagos, tasa);
  const faltanteUsd = totalUsd - pagadoUsd;
  const excede = pagadoUsd > totalUsd + 1;
  return { pagadoUsd, faltanteUsd, valido: faltanteUsd <= 0 && !excede };
}

/// Convierte un PagoInput del dominio al modelo local de montos.
export function aMontoPago(p: PagoInput): MontoPago {
  return {
    monto: p.monto,
    tipo_pago: p.tipo_pago,
    moneda: p.moneda,
    numero_referencia: p.numero_referencia,
  };
}