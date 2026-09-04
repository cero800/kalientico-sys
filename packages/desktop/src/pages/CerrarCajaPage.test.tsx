import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { cerrarCaja } from '../services/db';
import { useSesion } from '../store/sesion';
import CerrarCajaPage from './CerrarCajaPage';

vi.mock('../services/db', () => ({
  cerrarCaja: vi.fn(),
}));

const caja = {
  id: 7,
  fecha: '2026-09-04',
  operador_id: 1,
  operador_nombre: 'Ana',
  efectivo_inicial_usd: 5000,
  efectivo_inicial_ves: 0,
  efectivo_ventas_usd: 5000,
  efectivo_ventas_ves: 36850,
  efectivo_egresos_usd: 0,
  efectivo_egresos_ves: 0,
  efectivo_final_usd: 10000,
  efectivo_final_ves: 36850,
  efectivo_esperado_usd: 10000,
  efectivo_esperado_ves: 36850,
  diferencia_usd: 0,
  diferencia_ves: 0,
  tasa_cierre: 0,
  estado: 'abierta',
};

const renderPagina = () =>
  render(
    <MemoryRouter initialEntries={['/cerrar-caja']}>
      <Routes>
        <Route path="/cerrar-caja" element={<CerrarCajaPage />} />
        <Route path="/" element={<div>Inicio</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.mocked(cerrarCaja).mockReset();
  vi.mocked(cerrarCaja).mockResolvedValue(undefined as never);
  useSesion.setState({
    operador: { id: 1, nombre: 'Ana', rol: 'admin', activo: true },
    caja: caja as never,
  });
});

describe('CerrarCajaPage', () => {
  it('pre-carga el arqueo con lo esperado y muestra diferencia cero', async () => {
    renderPagina();
    expect(await screen.findByLabelText(/Efectivo final US/)).toHaveValue('$100.00');
    expect(screen.getByLabelText(/Efectivo final Bs/)).toHaveValue('368,50');
    expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
  });

  it('muestra diferencias al editar el arqueo', async () => {
    const user = userEvent.setup();
    renderPagina();
    const usd = await screen.findByLabelText(/Efectivo final US/);
    await user.clear(usd);
    await user.type(usd, '90');
    expect(screen.getByText('-$10.00')).toBeInTheDocument();
  });

  it('cierra la caja y navega al inicio', async () => {
    const user = userEvent.setup();
    renderPagina();
    await screen.findByLabelText(/Efectivo final US/);

    await user.click(screen.getByRole('button', { name: /Cerrar caja/ }));
    await user.click(screen.getByRole('button', { name: /Sí, cerrar/ }));

    expect(cerrarCaja).toHaveBeenCalledWith({
      caja_id: 7,
      operador_id: 1,
      efectivo_final_usd: 10000,
      efectivo_final_ves: 36850,
    });
    expect(useSesion.getState().caja).toBeNull();
    expect(await screen.findByText('Inicio')).toBeInTheDocument();
  });
});