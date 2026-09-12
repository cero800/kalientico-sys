import { describe, expect, it, vi } from 'vitest';
import type { Factura } from '@panaderia/core';
import { getConfig } from '../services/db';
import { calcularRecordatorio, DEFAULT_RECORDATORIO_DIAS, leerRecordatorioDias } from './factura';

vi.mock('../services/db', () => ({
  getConfig: vi.fn(),
}));

function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function factura(parcial: Partial<Factura>): Factura {
  return {
    venta_id: 1,
    numero_factura: 1,
    tipo: 'credito',
    estado: 'entregada',
    fecha: isoLocal(new Date()),
    cliente: 'Café del Centro',
    cliente_rif: 'J-123',
    dias_credito: 15,
    negocio_nombre: '',
    negocio_rif: '',
    negocio_telefono: '',
    negocio_direccion: '',
    subtotal: 1000,
    descuento: 0,
    impuesto: 0,
    total: 1000,
    tasa_cambio: 0,
    detalle: [],
    pagos: [],
    devoluciones: [],
    ...parcial,
  };
}

describe('calcularRecordatorio', () => {
  it('devuelve null cuando la venta no es a crédito', () => {
    expect(calcularRecordatorio(factura({ tipo: 'contado' }), DEFAULT_RECORDATORIO_DIAS)).toBeNull();
  });

  it('devuelve null cuando la venta no tiene plazo', () => {
    expect(calcularRecordatorio(factura({ dias_credito: 0 }), DEFAULT_RECORDATORIO_DIAS)).toBeNull();
  });

  it('muestra el recordatorio cuando faltan pocos días', () => {
    const f = factura({ dias_credito: 3 });
    const texto = calcularRecordatorio(f, 5);
    expect(texto).toMatch(/^Recuerde: su pago vence el \d{2}\/\d{2}\/\d{4}$/);
  });

  it('muestra el recordatorio el mismo día del vencimiento', () => {
    const ayer = new Date(Date.now() - 86_400_000);
    const f = factura({ fecha: isoLocal(ayer), dias_credito: 1 });
    expect(calcularRecordatorio(f, 5)).not.toBeNull();
  });

  it('no muestra el recordatorio si faltan más días que el umbral', () => {
    const f = factura({ dias_credito: 10 });
    expect(calcularRecordatorio(f, 5)).toBeNull();
  });

  it('no muestra el recordatorio si la factura ya venció', () => {
    const hace10 = new Date(Date.now() - 10 * 86_400_000);
    const f = factura({ fecha: isoLocal(hace10), dias_credito: 3 });
    expect(calcularRecordatorio(f, 5)).toBeNull();
  });
});

describe('leerRecordatorioDias', () => {
  it('usa el valor configurado', async () => {
    vi.mocked(getConfig).mockResolvedValueOnce('7');
    expect(await leerRecordatorioDias()).toBe(7);
  });

  it('usa el valor por defecto si la config es inválida o nula', async () => {
    vi.mocked(getConfig).mockResolvedValueOnce(null);
    expect(await leerRecordatorioDias()).toBe(DEFAULT_RECORDATORIO_DIAS);
    vi.mocked(getConfig).mockResolvedValueOnce('abc');
    expect(await leerRecordatorioDias()).toBe(DEFAULT_RECORDATORIO_DIAS);
  });
});