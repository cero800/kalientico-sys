import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { resumenDia } from '../services/db';
import ReportePage from './ReportePage';

vi.mock('../services/db', () => ({
  resumenDia: vi.fn(),
  getFactura: vi.fn(),
  guardarReporteExcel: vi.fn(),
}));

const resumen = {
  producciones: [
    { producto: 'Pan Canilla', cantidad: 10, costo_unitario: 100 },
  ],
  ventas: [
    { venta_id: 1, numero_factura: 1, cliente: 'Mostrador', tipo: 'contado', monto: 5000, devuelto: 0, estado: 'entregada', tasa_cambio: 36.85 },
    { venta_id: 2, numero_factura: 2, cliente: 'Pan S.A.', tipo: 'credito', monto: 3000, devuelto: 2000, estado: 'entregada', tasa_cambio: 36.85 },
  ],
  pagos_efectivo_usd: 5000,
  pagos_efectivo_ves: 36850,
  devoluciones: [
    { id: 1, venta_id: 2, numero_factura: 2, cliente: 'Pan S.A.', monto: 2000, motivo: 'pan deteriorado', operador_nombre: 'Ana', fecha_devolucion: '2026-09-04', detalle: [{ producto_id: 3, nombre: 'Pan Canilla', cantidad: 10, precio_unitario: 200, subtotal: 2000 }] },
  ],
  deudores: [],
};

beforeEach(() => {
  vi.mocked(resumenDia).mockReset();
  vi.mocked(resumenDia).mockResolvedValue(resumen as never);
});

describe('ReportePage', () => {
  it('muestra ventas brutas, devoluciones y ventas netas (perdido/ganado)', async () => {
    render(<ReportePage />);
    expect(await screen.findByText('Ventas brutas')).toBeInTheDocument();
    expect(screen.getByText('Devoluciones (perdido)')).toBeInTheDocument();
    expect(screen.getByText('Ventas netas (ganado)')).toBeInTheDocument();
    expect(screen.getByText('$80.00')).toBeInTheDocument();
    expect(screen.getAllByText('-$20.00').length).toBeGreaterThan(0);
    expect(screen.getByText('$60.00')).toBeInTheDocument();
  });

  it('muestra junto a cada factura lo devuelto y el neto', async () => {
    render(<ReportePage />);
    await screen.findByText('Ventas brutas');
    expect(screen.getAllByText(/#2/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('-$20.00').length).toBeGreaterThan(0);
    expect(screen.getByText('$10.00')).toBeInTheDocument();
  });

  it('lista las devoluciones del día con motivo y monto', async () => {
    render(<ReportePage />);
    expect(await screen.findByText('Devoluciones del día')).toBeInTheDocument();
    expect(screen.getByText(/pan deteriorado/)).toBeInTheDocument();
    // Muestra también qué productos se devolvieron.
    expect(screen.getByText(/Pan Canilla × 10/)).toBeInTheDocument();
  });
});