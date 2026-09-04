// Formato de montos y parseo de entrada.
// Reglas acordadas: US$ → $1,234.56 (miles con coma, decimal con punto);
// Bs → Bs 1.234,56 (miles con punto, decimal con coma).

import type { Moneda } from '@panaderia/core';

export const CENTS_PER_UNIT = 100;

function separarCentavos(cents: number): { neg: boolean; enteros: string; decimal: string } {
  const neg = cents < 0;
  const abs = String(Math.abs(Math.round(cents))).padStart(3, '0');
  const decimal = abs.slice(-2);
  const enteros = abs.slice(0, -2);
  return { neg, enteros, decimal };
}

export function formatUsdCents(cents: number): string {
  const { neg, enteros, decimal } = separarCentavos(cents);
  const miles = Number(enteros).toLocaleString('en-US');
  return `${neg ? '-' : ''}$${miles}.${decimal}`;
}

export function formatVesCents(cents: number): string {
  const { neg, enteros, decimal } = separarCentavos(cents);
  // de-DE usa '.' como separador de miles (entero => sin decimales).
  const miles = Number(enteros).toLocaleString('de-DE');
  return `${neg ? '-' : ''}Bs ${miles},${decimal}`;
}

/// Formatea un monto (en céntimos) según su moneda.
export function formatCents(cents: number, moneda: Moneda): string {
  return moneda === 'usd' ? formatUsdCents(cents) : formatVesCents(cents);
}

/// Convertir input: US$ acepta "1234.56", "1,234.56"; Bs acepta "1234,56", "1.234,56".
const RE_USD = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/;
const RE_VES = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/;

/// Convierte lo que el usuario teclea en céntimos de la moneda elegida.
/// Devuelve `null` si el texto no es un monto válido (<= 2 decimales).
export function parseCentsInput(raw: string, moneda: Moneda): number | null {
  if (raw == null) return null;
  const t = raw.trim().replace(/[$ ]/g, '');
  if (t === '') return null;

  let s = t;
  if (moneda === 'usd') {
    if (!RE_USD.test(t)) return null;
    s = t.replace(/,/g, '');
  } else {
    if (!RE_VES.test(t)) return null;
    s = t.replace(/\./g, '').replace(/,/g, '.');
  }

  const f = parseFloat(s);
  if (!Number.isFinite(f) || f < 0) return null;
  return Math.round(f * CENTS_PER_UNIT);
}