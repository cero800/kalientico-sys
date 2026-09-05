import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { registrarAjuste, registrarMerma, registrarProduccion } from '../services/db';
import { useSesion } from '../store/sesion';
import InventarioPage from './InventarioPage';

vi.mock('../services/db', () => ({
  listarStock: vi.fn().mockResolvedValue([
    { producto_id: 1, nombre: 'Pan Canilla', codigo: 'P1', cantidad_disponible: 10, unidad_medida: 'unidad' },
    { producto_id: 2, nombre: 'Croissant', codigo: 'P2', cantidad_disponible: 0, unidad_medida: 'unidad' },
  ]),
  listarProductos: vi.fn().mockResolvedValue([
    { id: 1, codigo: 'P1', nombre: 'Pan Canilla', descripcion: null, unidad_medida: 'unidad', precio_base: 500, precio_mayoreo: 450, impuesto_porcentaje: 0, activo: true, creado_en: null },
    { id: 2, codigo: 'P2', nombre: 'Croissant', descripcion: null, unidad_medida: 'unidad', precio_base: 800, precio_mayoreo: 700, impuesto_porcentaje: 0, activo: true, creado_en: null },
  ]),
  registrarProduccion: vi.fn(),
  registrarMerma: vi.fn(),
  registrarAjuste: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(registrarProduccion).mockReset();
  vi.mocked(registrarMerma).mockReset();
  vi.mocked(registrarAjuste).mockReset();
  useSesion.setState({ operador: { id: 1, nombre: 'Ana', rol: 'admin', activo: true } });
});

describe('InventarioPage', () => {
  it('muestra stock y alerta de agotados', async () => {
    render(<InventarioPage />);
    await screen.findByText('Pan Canilla');
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText(/stock agotado o negativo/)).toHaveTextContent('Croissant');
  });

  it('registra producción con fecha y costo pre-cargado', async () => {
    const user = userEvent.setup();
    vi.mocked(registrarProduccion).mockResolvedValue(undefined as never);
    render(<InventarioPage />);
    await screen.findByText('Pan Canilla');

    await user.click(screen.getByRole('button', { name: /Producción/ }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText(/Producto/), '1');
    const costoInput = within(dialog).getByLabelText(/Costo unitario/) as HTMLInputElement;
    expect(costoInput.value).toBe('5.00');
    await user.type(within(dialog).getByLabelText(/Cantidad/), '2.5');
    await user.clear(costoInput);
    await user.type(costoInput, '1.2');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(registrarProduccion).toHaveBeenCalledWith(
      expect.objectContaining({
        producto_id: 1,
        cantidad: 2.5,
        costo_unitario: 120,
        operador_id: 1,
        fecha: expect.any(String),
      }),
    );
  });

  it('pre-carga el costo unitario con el precio base al usar el botón Producir', async () => {
    const user = userEvent.setup();
    render(<InventarioPage />);
    await screen.findByText('Pan Canilla');

    await user.click(screen.getAllByRole('button', { name: /Producir/ })[0]);
    const dialog = screen.getByRole('dialog');
    expect((within(dialog).getByLabelText(/Producto/) as HTMLSelectElement).value).toBe('1');
    expect((within(dialog).getByLabelText(/Costo unitario/) as HTMLInputElement).value).toBe('5.00');
  });

  it('exige motivo en la merma', async () => {
    const user = userEvent.setup();
    render(<InventarioPage />);
    await screen.findByText('Pan Canilla');

    await user.click(screen.getByRole('button', { name: /Merma/ }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText(/Producto/), '2');
    await user.type(within(dialog).getByLabelText(/Cantidad/), '1');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('motivo');
    expect(registrarMerma).not.toHaveBeenCalled();
  });

  it('registra un ajuste con delta', async () => {
    const user = userEvent.setup();
    vi.mocked(registrarAjuste).mockResolvedValue(undefined as never);
    render(<InventarioPage />);
    await screen.findByText('Pan Canilla');

    await user.click(screen.getByRole('button', { name: /Ajuste/ }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText(/Producto/), '1');
    await user.type(within(dialog).getByLabelText(/Cantidad/), '-2');
    await user.type(within(dialog).getByLabelText(/Motivo/), 'Inventario físico');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(registrarAjuste).toHaveBeenCalledWith({
      producto_id: 1,
      cantidad_delta: -2,
      motivo: 'Inventario físico',
      operador_id: 1,
    });
  });
});