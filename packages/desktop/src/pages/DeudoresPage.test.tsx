import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { estadoCuentaTodos, registrarAbono } from '../services/db';
import { useSesion } from '../store/sesion';
import DeudoresPage from './DeudoresPage';

vi.mock('../services/db', () => ({
  estadoCuentaTodos: vi.fn().mockResolvedValue([
    { empresa_id: 2, nombre_comercial: 'Café del Centro', total_facturado: 25000, total_pagado: 5000, saldo_pendiente: 20000, total_vencido: 15000, total_al_dia: 5000, dias_credito: 30 },
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
  it('lista deudores con vencido, plazo y saldo', async () => {
    render(<DeudoresPage />);
    expect(await screen.findByText('Café del Centro')).toBeInTheDocument();
    expect(screen.getByText('Vencido', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByText('Al día')).not.toBeInTheDocument();
    expect(screen.getByText('Plazo: 30 días')).toBeInTheDocument();
    expect(screen.getByText('$150.00')).toBeInTheDocument();
    expect(screen.getAllByText('$200.00').length).toBeGreaterThan(0);
  });

  it('marca Al día cuando no hay saldo vencido', async () => {
    vi.mocked(estadoCuentaTodos).mockResolvedValueOnce([
      { empresa_id: 2, nombre_comercial: 'Café del Centro', total_facturado: 25000, total_pagado: 5000, saldo_pendiente: 20000, total_vencido: 0, total_al_dia: 20000, dias_credito: 30 },
    ] as never);
    render(<DeudoresPage />);
    expect(await screen.findByText('Café del Centro')).toBeInTheDocument();
    expect(screen.getByText('Al día')).toBeInTheDocument();
    expect(screen.queryByText('Vencido', { selector: 'span' })).not.toBeInTheDocument();
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
    await user.type(within(dialog).getByLabelText(/Monto abono 1/), '100');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar abono' }));

    expect(registrarAbono).toHaveBeenCalledWith({
      empresa_id: 2,
      pagos: [{ monto: 10000, tipo_pago: 'efectivo', moneda: 'ves', numero_referencia: undefined }],
      operador_id: 1,
    });
  });

  it('registra un abono mixto de varias formas de pago', async () => {
    const user = userEvent.setup();
    vi.mocked(registrarAbono).mockResolvedValue(undefined as never);
    useSesion.setState({ operador: { id: 1, nombre: 'Ana', rol: 'admin', activo: true }, tasa: 36.85 });
    render(<DeudoresPage />);
    await user.click(await screen.findByText('Café del Centro'));
    await user.click(await screen.findByRole('button', { name: /Abono/ }));

    const dialog = screen.getByRole('dialog');
    // Efectivo US$ $5 en la primera línea.
    await user.selectOptions(within(dialog).getByLabelText(/Moneda abono 1/), 'usd');
    await user.type(within(dialog).getByLabelText(/Monto abono 1/), '5');

    // Pago móvil Bs (= $5) con referencia en la segunda línea.
    await user.click(within(dialog).getByRole('button', { name: /Agregar pago/ }));
    await user.selectOptions(within(dialog).getByLabelText(/Tipo abono 2/), 'pago_movil');
    await user.type(within(dialog).getByLabelText(/Monto abono 2/), '184,25');
    await user.type(within(dialog).getByLabelText(/Referencia abono 2/), 'R-001');

    await user.click(within(dialog).getByRole('button', { name: 'Guardar abono' }));

    expect(registrarAbono).toHaveBeenCalledWith({
      empresa_id: 2,
      pagos: [
        { monto: 500, tipo_pago: 'efectivo', moneda: 'usd', numero_referencia: undefined },
        { monto: 18425, tipo_pago: 'pago_movil', moneda: 'ves', numero_referencia: 'R-001' },
      ],
      operador_id: 1,
    });
  });

  it('exige referencia en pagos móviles', async () => {
    const user = userEvent.setup();
    useSesion.setState({ operador: { id: 1, nombre: 'Ana', rol: 'admin', activo: true }, tasa: 1 });
    render(<DeudoresPage />);
    await user.click(await screen.findByText('Café del Centro'));
    await user.click(await screen.findByRole('button', { name: /Abono/ }));

    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText(/Tipo abono 1/), 'pago_movil');
    await user.type(within(dialog).getByLabelText(/Monto abono 1/), '100');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar abono' }));

    expect(within(dialog).getByText(/pago móvil requiere el número de referencia/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Guardar abono' })).toBeDisabled();
    expect(registrarAbono).not.toHaveBeenCalled();
  });

  it('bloquea el abono que supera el saldo pendiente', async () => {
    const user = userEvent.setup();
    useSesion.setState({ operador: { id: 1, nombre: 'Ana', rol: 'admin', activo: true }, tasa: 1 });
    render(<DeudoresPage />);
    await user.click(await screen.findByText('Café del Centro'));
    await user.click(await screen.findByRole('button', { name: /Abono/ }));

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Monto abono 1/), '300');
    expect(within(dialog).getByText(/supera el saldo pendiente/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Guardar abono' })).toBeDisabled();
    expect(registrarAbono).not.toHaveBeenCalled();
  });

  it('muestra en el abono el saldo pendiente y lo que queda por pagar en US$ y Bs', async () => {
    const user = userEvent.setup();
    useSesion.setState({ operador: { id: 1, nombre: 'Ana', rol: 'admin', activo: true }, tasa: 1 });
    render(<DeudoresPage />);
    await user.click(await screen.findByText('Café del Centro'));
    await user.click(await screen.findByRole('button', { name: /Abono/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Debe (saldo)')).toBeInTheDocument();
    expect(within(dialog).getByText('Facturado')).toBeInTheDocument();
    expect(within(dialog).getByText('Queda tras este abono')).toBeInTheDocument();
    expect(within(dialog).getAllByText('$200.00')).toHaveLength(2);
    expect(within(dialog).getAllByText('Bs 200,00')).toHaveLength(2);

    await user.type(within(dialog).getByLabelText(/Monto abono 1/), '50');
    expect(within(dialog).getByText('$150.00')).toBeInTheDocument();
    expect(within(dialog).getByText('Bs 150,00')).toBeInTheDocument();
  });

  it('rellena el saldo restante con el botón Abonar restante', async () => {
    const user = userEvent.setup();
    useSesion.setState({ operador: { id: 1, nombre: 'Ana', rol: 'admin', activo: true }, tasa: 1 });
    render(<DeudoresPage />);
    await user.click(await screen.findByText('Café del Centro'));
    await user.click(await screen.findByRole('button', { name: /Abono/ }));

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Abonar restante' }));
    expect(within(dialog).getByLabelText(/Monto abono 1/)).toHaveValue('200,00');
  });
});