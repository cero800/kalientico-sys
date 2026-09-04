import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSesion } from '../store/sesion';

const abrirCaja = vi.fn();
const setTasaCambio = vi.fn();

vi.mock('../services/db', () => ({
  getTasaCambio: vi.fn().mockResolvedValue(36.85),
  cajaAbierta: vi.fn().mockResolvedValue({ id: 7, fecha: 'hoy', operador_id: 1 }),
  abrirCaja: (...args: unknown[]) => abrirCaja(...args),
  setTasaCambio: (...args: unknown[]) => setTasaCambio(...args),
}));

import AbrirCajaPage from './AbrirCajaPage';

beforeEach(() => {
  abrirCaja.mockReset();
  setTasaCambio.mockReset();
});

const renderPagina = () =>
  render(
    <MemoryRouter initialEntries={['/abrir-caja']}>
      <Routes>
        <Route path="/abrir-caja" element={<AbrirCajaPage />} />
        <Route path="/venta" element={<div>Caja de ventas</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('AbrirCajaPage', () => {
  it('pre-carga la última tasa guardada', async () => {
    useSesion.getState().login({ id: 1, nombre: 'Ana', rol: 'admin', activo: true });
    renderPagina();
    const tasa = await screen.findByLabelText(/Tasa del día/i);
    expect(await waitFor(() => (tasa as HTMLInputElement).value)).toBe('36.85');
    useSesion.getState().logout();
  });

  it('abre caja con tasa y efectivos iniciales y navega a venta', async () => {
    const user = userEvent.setup();
    useSesion.getState().login({ id: 1, nombre: 'Ana', rol: 'admin', activo: true });
    abrirCaja.mockResolvedValue({ id: 7, fecha: 'hoy', operador_id: 1 } as never);

    renderPagina();
    const tasa = await screen.findByLabelText(/Tasa del día/i);
    await user.clear(tasa);
    await user.type(tasa, '40');
    await user.type(await screen.findByLabelText(/Efectivo inicial en US/i), '10');
    await user.type(await screen.findByLabelText(/Efectivo inicial en Bs/i), '368,50');
    await user.click(screen.getByRole('button', { name: /Abrir caja/i }));

    await waitFor(() => expect(setTasaCambio).toHaveBeenCalledWith(40));
    await waitFor(() =>
      expect(abrirCaja).toHaveBeenCalledWith({
        operador_id: 1,
        efectivo_inicial_usd: 1000,
        efectivo_inicial_ves: 36850,
      }),
    );
    expect(await screen.findByText('Caja de ventas')).toBeInTheDocument();
    useSesion.getState().logout();
  });

  it('valida la tasa antes de abrir', async () => {
    const user = userEvent.setup();
    useSesion.getState().login({ id: 1, nombre: 'Ana', rol: 'admin', activo: true });
    renderPagina();
    const tasa = await screen.findByLabelText(/Tasa del día/i);
    await user.clear(tasa);
    await user.type(tasa, '0');
    await user.click(screen.getByRole('button', { name: /Abrir caja/i }));
    expect(await screen.findByText(/tasa válida/i)).toBeInTheDocument();
    expect(abrirCaja).not.toHaveBeenCalled();
    useSesion.getState().logout();
  });
});