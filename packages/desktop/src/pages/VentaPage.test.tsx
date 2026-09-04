import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCarrito } from '../store/carrito';
import { useSesion } from '../store/sesion';
import { crearVenta } from '../services/db';
import VentaPage from './VentaPage';

vi.mock('../services/db', () => ({
  listarProductos: vi.fn().mockResolvedValue([
    { id: 1, codigo: 'P1', nombre: 'Pan Canilla', descripcion: null, unidad_medida: 'unidad', precio_base: 500, precio_mayoreo: 450, impuesto_porcentaje: 0, activo: true, creado_en: null },
    { id: 2, codigo: 'P2', nombre: 'Croissant', descripcion: null, unidad_medida: 'unidad', precio_base: 800, precio_mayoreo: 700, impuesto_porcentaje: 0, activo: true, creado_en: null },
  ]),
  listarEmpresas: vi.fn().mockResolvedValue([
    { id: 1, rut_nit: '0', nombre_comercial: 'Consumidor Final', razon_social: null, telefono: null, email: null, direccion: null, dias_credito: 0, limite_credito: 0, activo: true, creado_en: null },
    { id: 2, rut_nit: 'J-123', nombre_comercial: 'Café del Centro', razon_social: null, telefono: null, email: null, direccion: null, dias_credito: 15, limite_credito: 5000, activo: true, creado_en: null },
  ]),
  listarStock: vi.fn().mockResolvedValue([
    { producto_id: 1, nombre: 'Pan Canilla', codigo: 'P1', cantidad_disponible: 10, unidad_medida: 'unidad' },
    { producto_id: 2, nombre: 'Croissant', codigo: 'P2', cantidad_disponible: 0, unidad_medida: 'unidad' },
  ]),
  listarPreciosCliente: vi.fn().mockImplementation((empresaId: number) =>
    empresaId === 2 ? Promise.resolve([{ id: 1, empresa_id: 2, producto_id: 1, precio_especial: 900 }]) : Promise.resolve([]),
  ),
  crearVenta: vi.fn(),
}));

beforeEach(() => {
  useCarrito.getState().vaciar();
  useSesion.setState({
    tasa: 36.85,
    operador: { id: 1, nombre: 'Ana', rol: 'admin', activo: true },
    caja: { id: 7, fecha: '2026-09-04', operador_id: 1, operador_nombre: 'Ana', efectivo_inicial_usd: 0, efectivo_inicial_ves: 0, efectivo_ventas_usd: 0, efectivo_ventas_ves: 0, efectivo_egresos_usd: 0, efectivo_egresos_ves: 0, efectivo_final_usd: 0, efectivo_final_ves: 0, efectivo_esperado_usd: 0, efectivo_esperado_ves: 0, diferencia_usd: 0, diferencia_ves: 0, tasa_cierre: 36.85, estado: 'abierta' },
  });
  vi.mocked(crearVenta).mockReset();
  vi.mocked(crearVenta).mockResolvedValue({
    id: 1, empresa_id: 2, numero_factura: 12, tipo: 'contado', estado: 'entregada', fecha: '2026-09-04', subtotal: 900, descuento: 0, impuesto: 0, total: 900, operador_id: 1, moneda: 'usd', tasa_cambio: 36.85,
  } as never);
});

describe('VentaPage', () => {
  it('lista productos y agrega al carrito con precio de mostrador', async () => {
    const user = userEvent.setup();
    render(<VentaPage />);

    expect(await screen.findByText('Pan Canilla')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Pan Canilla/i }));
    expect(await screen.findByText('$5.00 × 1')).toBeInTheDocument();

    // producto sin stock no se puede agregar
    expect(screen.getByRole('button', { name: /Croissant/i })).toBeDisabled();
    useCarrito.getState().vaciar();
  });

  it('aplica precio especial al cambiar de cliente', async () => {
    const user = userEvent.setup();
    render(<VentaPage />);
    await screen.findByText('Pan Canilla');

    await user.selectOptions(screen.getByLabelText(/Cliente/i), '2');
    await waitFor(() => expect(screen.getByText('$9.00')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Pan Canilla/i }));
    expect(screen.getByText('$9.00 × 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cobrar/ })).toBeEnabled();
    useCarrito.getState().vaciar();
  });

  it('cobra y confirma la venta completa', async () => {
    const user = userEvent.setup();
    render(<VentaPage />);
    await screen.findByRole('button', { name: /Pan Canilla/i });

    await user.click(screen.getByRole('button', { name: /Pan Canilla/i }));
    await user.click(screen.getByRole('button', { name: /Cobrar/ }));

    await user.type(screen.getAllByLabelText(/Monto pago/)[0], '5');
    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));

    expect(await screen.findByText('Venta registrada')).toBeInTheDocument();
    expect(crearVenta).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'contado', empresa_id: 1, detalles: [{ producto_id: 1, cantidad: 1 }] }));
    expect(await screen.findByText(/Factura/)).toBeInTheDocument();
    useCarrito.getState().vaciar();
  });
});