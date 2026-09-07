import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCarrito } from '../../store/carrito';
import { useSesion } from '../../store/sesion';
import CobroModal from './CobroModal';
import type { VentaInput } from '@panaderia/core';

const onConfirmar = vi.fn((_venta: VentaInput) => Promise.resolve());

beforeEach(() => {
  onConfirmar.mockReset();
  useCarrito.getState().vaciar();
  useCarrito.setState({
    lineas: [
      { producto_id: 1, codigo: 'P1', nombre: 'Pan Canilla', unidad: 'unidad', precio: 1000, cantidad: 1 },
    ],
  });
  useSesion.setState({ tasa: 36.85, operador: { id: 1, nombre: 'Ana', rol: 'admin', activo: true } });
});

const renderModal = (total = 1000, sePermiteCredito = true) =>
  render(
    <CobroModal
      abre
      total={total}
      clienteId={2}
      sePermiteCredito={sePermiteCredito}
      onCerrar={() => {}}
      onConfirmar={onConfirmar}
    />,
  );

describe('CobroModal', () => {
  it('confirma venta de contado con pago en US$', async () => {
    const user = userEvent.setup();
    renderModal();

    const montos = screen.getAllByLabelText(/Monto pago/);
    await user.type(montos[0], '10');
    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));

    const venta = onConfirmar.mock.calls[0][0];
    expect(venta.tipo).toBe('contado');
    expect(venta.descuento).toBe(0);
    expect(venta.empresa_id).toBe(2);
    expect(venta.operador_id).toBe(1);
    expect(venta.detalles).toEqual([{ producto_id: 1, cantidad: 1 }]);
    expect(venta.pagos).toEqual([{ monto: 1000, tipo_pago: 'efectivo', moneda: 'usd', numero_referencia: undefined }]);
  });

  it('acepta pago mixto US$ + Bs con la tasa vigente', async () => {
    const user = userEvent.setup();
    renderModal();

    const pago1 = screen.getAllByLabelText(/Monto pago/)[0];
    await user.type(pago1, '5');

    await user.click(screen.getByRole('button', { name: /Agregar pago/ }));
    const pagos = screen.getAllByLabelText(/Monto pago/);
    await user.selectOptions(screen.getAllByLabelText(/Moneda pago/)[1], 'ves');
    await user.type(pagos[1], '184,25');

    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));

    const venta = onConfirmar.mock.calls[0][0];
    expect(venta.pagos).toHaveLength(2);
    expect(venta.pagos[1]).toEqual({ monto: 18425, tipo_pago: 'efectivo', moneda: 'ves', numero_referencia: undefined });
  });

  it('no permite confirmar con pago insuficiente', async () => {
    const user = userEvent.setup();
    renderModal(1000, false);
    const montos = screen.getAllByLabelText(/Monto pago/);
    await user.type(montos[0], '7');
    expect(screen.getByText(/faltan \$3\.00/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar venta' })).toBeDisabled();
  });

  it('guarda venta a crédito sin pagos cuando el cliente lo permite', async () => {
    const user = userEvent.setup();
    renderModal(2000, true);
    await user.selectOptions(screen.getByLabelText(/Tipo de venta/i), 'credito');
    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));
    const venta = onConfirmar.mock.calls[0][0];
    expect(venta.tipo).toBe('credito');
    expect(venta.pagos).toEqual([]);
  });

  it('no ofrece crédito para clientes de mostrador', () => {
    renderModal(1000, false);
    expect(screen.queryByRole('option', { name: 'Crédito' })).not.toBeInTheDocument();
  });

  it('bloquea el botón con monto inválido', async () => {
    const user = userEvent.setup();
    renderModal();
    const montos = screen.getAllByLabelText(/Monto pago/);
    await user.type(montos[0], '10.5.3');
    expect(screen.getByRole('button', { name: 'Confirmar venta' })).toBeDisabled();
  });

  it('acepta pago móvil en Bs con referencia', async () => {
    const user = userEvent.setup();
    renderModal();
    const pagos = screen.getAllByLabelText(/Monto pago/);
    await user.selectOptions(screen.getAllByLabelText(/Moneda pago/)[0], 'ves');
    await user.selectOptions(screen.getAllByLabelText(/Tipo pago/)[0], 'pago_movil');
    await user.type(pagos[0], '368,50');
    await user.type(screen.getByLabelText(/Referencia pago/), 'R-001');

    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));

    const venta = onConfirmar.mock.calls[0][0];
    expect(venta.pagos).toEqual([
      { monto: 36850, tipo_pago: 'pago_movil', moneda: 'ves', numero_referencia: 'R-001' },
    ]);
  });

  it('exige referencia en pago móvil y biopago, no en punto', async () => {
    const user = userEvent.setup();
    renderModal();
    const pagos = screen.getAllByLabelText(/Monto pago/);
    await user.selectOptions(screen.getAllByLabelText(/Moneda pago/)[0], 'ves');
    await user.selectOptions(screen.getAllByLabelText(/Tipo pago/)[0], 'pago_movil');
    await user.type(pagos[0], '368,50');

    expect(screen.getByText(/número de referencia/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar venta' })).toBeDisabled();

    // El punto ya no exige referencia.
    await user.selectOptions(screen.getAllByLabelText(/Tipo pago/)[0], 'punto');
    expect(screen.queryByText(/número de referencia/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar venta' })).not.toBeDisabled();

    // El biopago sí la exige.
    await user.selectOptions(screen.getAllByLabelText(/Tipo pago/)[0], 'biopago');
    expect(screen.getByText(/número de referencia/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar venta' })).toBeDisabled();
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('acepta punto sin número de referencia', async () => {
    const user = userEvent.setup();
    renderModal();
    const pagos = screen.getAllByLabelText(/Monto pago/);
    await user.selectOptions(screen.getAllByLabelText(/Moneda pago/)[0], 'ves');
    await user.selectOptions(screen.getAllByLabelText(/Tipo pago/)[0], 'punto');
    await user.type(pagos[0], '368,50');

    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));

    const venta = onConfirmar.mock.calls[0][0];
    expect(venta.pagos).toEqual([
      { monto: 36850, tipo_pago: 'punto', moneda: 'ves', numero_referencia: undefined },
    ]);
  });

  it('acepta biopago en Bs con referencia', async () => {
    const user = userEvent.setup();
    renderModal();
    const pagos = screen.getAllByLabelText(/Monto pago/);
    await user.selectOptions(screen.getAllByLabelText(/Moneda pago/)[0], 'ves');
    await user.selectOptions(screen.getAllByLabelText(/Tipo pago/)[0], 'biopago');
    await user.type(pagos[0], '368,50');
    await user.type(screen.getByLabelText(/Referencia pago/), 'BIO-01');

    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));

    const venta = onConfirmar.mock.calls[0][0];
    expect(venta.pagos).toEqual([
      { monto: 36850, tipo_pago: 'biopago', moneda: 'ves', numero_referencia: 'BIO-01' },
    ]);
  });

  it('en US$ solo permite efectivo', async () => {
    const user = userEvent.setup();
    renderModal();
    const selectTipo = screen.getAllByLabelText(/Tipo pago/)[0];

    await user.selectOptions(screen.getAllByLabelText(/Moneda pago/)[0], 'ves');
    await user.selectOptions(selectTipo, 'punto');
    expect(selectTipo).not.toBeDisabled();

    await user.selectOptions(screen.getAllByLabelText(/Moneda pago/)[0], 'usd');
    expect(selectTipo).toBeDisabled();
    expect(selectTipo).toHaveValue('efectivo');
  });
});