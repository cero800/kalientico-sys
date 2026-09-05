import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { historialPagos, registrarAbono, estadoCuentaTodos } from '../services/db';
import { useSesion } from '../store/sesion';
import DeudoresPage from './DeudoresPage';

vi.mock('../services/db', () => ({
  estadoCuentaTodos: vi.fn().mockResolvedValue([
    { empresa_id: 2, nombre_comercial: 'Café del Centro', total_facturado: 25000, total_pagado: 5000, saldo_pendiente: 20000 },
  ]),
  estadoCuenta: vi.fn(),
  historialPagos: vi.fn().mockResolvedValue([
    { id: 1, venta_id: 10, numero_factura: 3, monto: 5000, tipo_pago: 'efectivo', moneda: 'ves', tasa_cambio: 36.85, fecha_pago: '2026-09-04' },
  ]),
  registrarAbono: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(registrarAbono).mockReset();
  useSesion.setState({ operador: { id: 1, nombre: 'Ana', rol: 'admin', activo: true } });
});

describe('DeudoresPage', () => {
  it('lista deudores con saldo pendiente', async () => {
    render(<DeudoresPage />);
    expect(await screen.findByText('Café del Centro')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getAllByText('$200.00').length).toBeGreaterThan(0);
  });

  it('muestra historial de pagos al seleccionar cliente', async () => {
    const user = userEvent.setup();
    render(<DeudoresPage />);
    await user.click(await screen.findByText('Café del Centro'));
    expect(await screen.findByText(/#3/)).toBeInTheDocument();
    expect(screen.getByText('Bs 50,00')).toBeInTheDocument();
  });

  it('registra un abono en Bs', async () => {
    const user = userEvent.setup();
    vi.mocked(registrarAbono).mockResolvedValue(undefined as never);
    render(<DeudoresPage />);
    await user.click(await screen.findByText('Café del Centro'));
    await user.click(await screen.findByRole('button', { name: /Abono/ }));

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Monto/), '100');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar abono' }));

    expect(registrarAbono).toHaveBeenCalledWith({
      empresa_id: 2,
      monto: 10000,
      tipo_pago: 'efectivo',
      moneda: 'ves',
      numero_referencia: undefined,
      operador_id: 1,
    });
  });

  it('exige referencia en pagos móviles', async () => {
    const user = userEvent.setup();
    render(<DeudoresPage />);
    await user.click(await screen.findByText('Café del Centro'));
    await user.click(await screen.findByRole('button', { name: /Abono/ }));

    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText(/Tipo de pago/), 'pago_movil');
    await user.type(within(dialog).getByLabelText(/Monto/), '100');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar abono' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('referencia');
    expect(registrarAbono).not.toHaveBeenCalled();
  });

  it('muestra en el abono el saldo pendiente y lo que queda por pagar en US$ y Bs', async () => {
    const user = userEvent.setup();
    useSesion.setState({ operador: { id: 1, nombre: 'Ana', rol: 'admin', activo: true }, tasa: 1 });
    render(<DeudoresPage />);
    await user.click(await screen.findByText('Café del Centro'));
    await user.click(await screen.findByRole('button', { name: /Abono/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Debe (saldo pendiente)')).toBeInTheDocument();
    expect(within(dialog).getAllByText('$200.00')).toHaveLength(2);
    expect(within(dialog).getAllByText('Bs 200,00')).toHaveLength(2);

    await user.type(within(dialog).getByLabelText(/Monto/), '50');
    expect(within(dialog).getByText('$150.00')).toBeInTheDocument();
    expect(within(dialog).getByText('Bs 150,00')).toBeInTheDocument();
  });
});