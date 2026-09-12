import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { crearEmpresa, eliminarEmpresa } from '../services/db';
import ClientesPage from './ClientesPage';

vi.mock('../services/db', () => ({
  listarEmpresas: vi.fn().mockResolvedValue([
    { id: 1, rut_nit: '0', nombre_comercial: 'Consumidor Final', razon_social: null, telefono: null, email: null, direccion: null, dias_credito: 0, limite_credito: 0, activo: true, creado_en: null },
    { id: 2, rut_nit: 'J-123', nombre_comercial: 'Café del Centro', razon_social: null, telefono: null, email: null, direccion: null, dias_credito: 15, limite_credito: 5000, activo: true, creado_en: null },
  ]),
  crearEmpresa: vi.fn(),
  eliminarEmpresa: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(crearEmpresa).mockReset();
  vi.mocked(eliminarEmpresa).mockReset();
  vi.stubGlobal('confirm', vi.fn(() => true));
});

describe('ClientesPage', () => {
  it('no muestra a Consumidor Final como cliente', async () => {
    render(<ClientesPage />);
    await screen.findByText('Café del Centro');
    expect(screen.queryByText('Consumidor Final')).not.toBeInTheDocument();
    expect(screen.getByText('J-123')).toBeInTheDocument();
  });

  it('crea un cliente nuevo', async () => {
    const user = userEvent.setup();
    vi.mocked(crearEmpresa).mockResolvedValue(9 as never);
    render(<ClientesPage />);
    await screen.findByText('Café del Centro');

    await user.click(screen.getByRole('button', { name: /Nuevo cliente/ }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Nombre/), 'Panadería La Esquina');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(crearEmpresa).toHaveBeenCalledWith(
      expect.objectContaining({ nombre_comercial: 'Panadería La Esquina', dias_credito: 0, activo: true }),
    );
  });

  it('guarda un límite de crédito mayor que 9 dólares', async () => {
    const user = userEvent.setup();
    vi.mocked(crearEmpresa).mockResolvedValue(9 as never);
    render(<ClientesPage />);
    await screen.findByText('Café del Centro');

    await user.click(screen.getByRole('button', { name: /Nuevo cliente/ }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Nombre/), 'Panadería La Esquina');
    await user.type(within(dialog).getByLabelText(/Límite de crédito/), '25');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(crearEmpresa).toHaveBeenCalledWith(expect.objectContaining({ limite_credito: 2500 }));
  });

  it('elimina un cliente con confirmación', async () => {
    const user = userEvent.setup();
    render(<ClientesPage />);
    await screen.findByText('Café del Centro');
    await user.click(screen.getByRole('button', { name: /Eliminar Café del Centro/ }));
    expect(confirm).toHaveBeenCalled();
    expect(eliminarEmpresa).toHaveBeenCalledWith(2);
  });
});