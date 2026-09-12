// Helpers de la factura imprimible: recordatorio de pago a crédito.

import type { Factura } from '@panaderia/core';
import { RECORDATORIO_PAGO_DIAS_KEY } from '@panaderia/core';
import { getConfig } from '../services/db';

/** Días de anticipo por defecto si aún no hay config guardada. */
export const DEFAULT_RECORDATORIO_DIAS = 5;

/** Lee el umbral configurado: cuántos días antes del vencimiento se recuerda el pago. */
export async function leerRecordatorioDias(): Promise<number> {
  try {
    const crudo = await getConfig(RECORDATORIO_PAGO_DIAS_KEY);
    if (crudo == null || crudo.trim() === '') return DEFAULT_RECORDATORIO_DIAS;
    const valor = Number(crudo);
    return Number.isFinite(valor) && valor >= 0 ? Math.floor(valor) : DEFAULT_RECORDATORIO_DIAS;
  } catch {
    return DEFAULT_RECORDATORIO_DIAS;
  }
}

/** Días que faltan hasta `fecha` (positivo = falta, negativo = ya venció). */
export function diasHasta(fecha: string | Date): number {
  const destino =
    typeof fecha === 'string' ? new Date(`${fecha.slice(0, 10)}T00:00:00`) : new Date(fecha);
  if (Number.isNaN(destino.getTime())) return Infinity;
  const aplanar = (d: Date) => {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c.getTime();
  };
  return Math.round((aplanar(destino) - aplanar(new Date())) / 86_400_000);
}

/**
 * Texto del recordatorio de pago para una factura a crédito próxima a vencer,
 * o `null` si no aplica (venta al contado, sin plazo, aún no cercana o vencida).
 */
export function calcularRecordatorio(f: Factura, umbralDias: number): string | null {
  if (f.tipo !== 'credito' || f.dias_credito <= 0) return null;
  const vence = new Date(`${f.fecha.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(vence.getTime())) return null;
  vence.setDate(vence.getDate() + f.dias_credito);
  const faltan = diasHasta(vence);
  if (!Number.isFinite(faltan) || faltan < 0 || faltan > umbralDias) return null;
  const dd = String(vence.getDate()).padStart(2, '0');
  const mm = String(vence.getMonth() + 1).padStart(2, '0');
  const yyyy = vence.getFullYear();
  return `Recuerde: su pago vence el ${dd}/${mm}/${yyyy}`;
}