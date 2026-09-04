// Helpers de moneda dual (US$ base + Bs).
// Todos los montos se manejan en CENTAVOS de su moneda (i64).
// `tasa` = Bs por 1 US$.

import type { Moneda } from '../types/schema.js';

export const TASA_CAMBIO_KEY = 'tasa_cambio';

export function validarTasa(tasa: number): number {
  if (!Number.isFinite(tasa) || tasa <= 0) {
    throw new Error('Tasa de cambio inválida');
  }
  return tasa;
}

/// Convierte un monto en céntimos de la moneda indicada a céntimos de US$.
export function toUsd(monto: number, moneda: Moneda, tasa: number): number {
  validarTasa(tasa);
  if (moneda === 'usd') return monto;
  return Math.round(monto / tasa);
}

/// Convierte un monto en céntimos de la moneda indicada a céntimos de Bs.
export function toVes(monto: number, moneda: Moneda, tasa: number): number {
  validarTasa(tasa);
  if (moneda === 'ves') return monto;
  return Math.round(monto * tasa);
}