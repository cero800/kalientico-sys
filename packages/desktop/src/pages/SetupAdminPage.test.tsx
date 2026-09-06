import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../services/db', () => ({
  necesitaConfiguracion: vi.fn(),
  configurarAdmin: vi.fn().mockResolvedValue(undefined),
}));

import SetupAdminPage from './SetupAdminPage';

const renderConRouter = () =>
  render(
    <MemoryRouter initialEntries={['/setup']}>
      <Routes>
        <Route path="/setup" element={<SetupAdminPage />} />
        <Route path="/login" element={<div>Login</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('SetupAdminPage', () => {
  it('muestra el formulario cuando falta configurar el admin', async () => {
    const { necesitaConfiguracion } = await import('../services/db');
    vi.mocked(necesitaConfiguracion).mockResolvedValue(true);
    renderConRouter();
    expect(await screen.findByRole('button', { name: /Guardar y continuar/i })).toBeInTheDocument();
  });

  it('redirige a /login cuando el admin ya está configurado', async () => {
    const { necesitaConfiguracion } = await import('../services/db');
    vi.mocked(necesitaConfiguracion).mockResolvedValue(false);
    renderConRouter();
    expect(await screen.findByText(/Login/)).toBeInTheDocument();
  });

  it('guarda el admin y navega al login con PIN coincidente', async () => {
    const { necesitaConfiguracion, configurarAdmin } = await import('../services/db');
    vi.mocked(necesitaConfiguracion).mockResolvedValue(true);
    const user = userEvent.setup();
    renderConRouter();
    await screen.findByRole('button', { name: /Guardar y continuar/i });
    await user.clear(screen.getByLabelText(/Nombre del administrador/i));
    await user.type(screen.getByLabelText(/Nombre del administrador/i), 'Kali');
    await user.type(screen.getByLabelText(/^PIN$/i), '8421');
    await user.type(screen.getByLabelText(/Confirmar PIN/i), '8421');
    await user.click(screen.getByRole('button', { name: /Guardar y continuar/i }));
    expect(vi.mocked(configurarAdmin)).toHaveBeenCalledWith({ nombre: 'Kali', pin: '8421' });
    expect(await screen.findByText(/Login/)).toBeInTheDocument();
  });

  it('muestra error cuando los PIN no coinciden', async () => {
    const { necesitaConfiguracion } = await import('../services/db');
    vi.mocked(necesitaConfiguracion).mockResolvedValue(true);
    const user = userEvent.setup();
    renderConRouter();
    await screen.findByRole('button', { name: /Guardar y continuar/i });
    await user.type(screen.getByLabelText(/^PIN$/i), '1234');
    await user.type(screen.getByLabelText(/Confirmar PIN/i), '4321');
    await user.click(screen.getByRole('button', { name: /Guardar y continuar/i }));
    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument();
  });
});