import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSesion } from '../store/sesion';

vi.mock('../services/db', () => ({
  listarUsuarios: vi.fn().mockResolvedValue([
    { id: 1, nombre: 'Ana', rol: 'admin', activo: true },
    { id: 2, nombre: 'Luis', rol: 'cajero', activo: false },
  ]),
}));

import LoginPage from './LoginPage';

const Home = () => (
  <div>
    Home
    <span data-testid="operador">{useSesion.getState().operador?.nombre}</span>
  </div>
);

const renderConRouter = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Home />} />
      </Routes>
    </MemoryRouter>,
  );

describe('LoginPage', () => {
  it('muestra solo operadores activos', async () => {
    renderConRouter();
    expect(await screen.findByRole('button', { name: /Ana/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Luis/i })).not.toBeInTheDocument();
  });

  it('inicia sesión al elegir operador y navega al inicio', async () => {
    const user = userEvent.setup();
    renderConRouter();
    await user.click(await screen.findByRole('button', { name: /Ana/i }));
    expect(useSesion.getState().operador?.nombre).toBe('Ana');
    expect(await screen.findByText(/Home/)).toBeInTheDocument();
    expect(screen.getByTestId('operador')).toHaveTextContent('Ana');
    useSesion.getState().logout();
  });
});