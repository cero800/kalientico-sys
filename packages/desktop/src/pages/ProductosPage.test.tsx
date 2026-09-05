import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { actualizarProducto, crearProducto, eliminarProducto } from '../services/db';
import ProductosPage from './ProductosPage';

vi.mock('../services/db', () => ({
  listarProductos: vi.fn().mockResolvedValue([
    { id: 1, codigo: 'P1', nombre: 'Pan Canilla', descripcion: null, unidad_medida: 'unidad', precio_base: 500, precio_mayoreo: 450, impuesto_porcentaje: 0, activo: true, creado_en: null },
    { id: 2, codigo: 'P2', nombre: 'Torta Chocolate', descripcion: null, unidad_medida: 'unidad', precio_base: 1500, precio_mayoreo: 1400, impuesto_porcentaje: 15, activo: false, creado_en: null },
  ]),
  crearProducto: vi.fn(),
  actualizarProducto: vi.fn(),
  eliminarProducto: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(crearProducto).mockReset();
  vi.mocked(actualizarProducto).mockReset();
  vi.mocked(eliminarProducto).mockReset();
  vi.stubGlobal('confirm', vi.fn(() => true));
});

describe('ProductosPage', () => {
  it('lista productos con precios formateados', async () => {
    render(<ProductosPage />);
    expect(await screen.findByText('Pan Canilla')).toBeInTheDocument();
    expect(screen.getByText('$5.00')).toBeInTheDocument();
    expect(screen.getByText('Torta Chocolate')).toBeInTheDocument();
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });

  it('filtra por búsqueda', async () => {
    const user = userEvent.setup();
    render(<ProductosPage />);
    await screen.findByText('Pan Canilla');
    await user.type(screen.getByPlaceholderText(/Buscar por nombre/), 'torta');
    expect(screen.queryByText('Pan Canilla')).not.toBeInTheDocument();
    expect(screen.getByText('Torta Chocolate')).toBeInTheDocument();
  });

  it('crea un producto nuevo', async () => {
    const user = userEvent.setup();
    vi.mocked(crearProducto).mockResolvedValue(3 as never);
    render(<ProductosPage />);
    await screen.findByText('Pan Canilla');

    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Nombre/), 'Pie de limón');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(crearProducto).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Pie de limón', precio_base: 0, activo: true }));
  });

  it('acepta precios con decimales', async () => {
    const user = userEvent.setup();
    vi.mocked(crearProducto).mockResolvedValue(4 as never);
    render(<ProductosPage />);
    await screen.findByText('Pan Canilla');

    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Nombre/), 'Pan canilla premium');
    await user.type(within(dialog).getByLabelText(/Precio base/), '1.20');
    await user.type(within(dialog).getByLabelText(/Precio mayoreo/), '54');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(crearProducto).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Pan canilla premium', precio_base: 120, precio_mayoreo: 5400 }),
    );
  });

  it('valida precios mal formados', async () => {
    const user = userEvent.setup();
    render(<ProductosPage />);
    await screen.findByText('Pan Canilla');

    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Nombre/), 'X');
    await user.type(within(dialog).getByLabelText(/Precio base/), '1.2.3');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('precios válidos');
    expect(crearProducto).not.toHaveBeenCalled();
  });

  it('elimina un producto con confirmación', async () => {
    const user = userEvent.setup();
    render(<ProductosPage />);
    await screen.findByText('Pan Canilla');
    await user.click(screen.getByRole('button', { name: /Eliminar Pan Canilla/ }));
    expect(confirm).toHaveBeenCalled();
    expect(eliminarProducto).toHaveBeenCalledWith(1);
  });

  it('valida que el nombre sea obligatorio', async () => {
    const user = userEvent.setup();
    render(<ProductosPage />);
    await screen.findByText('Pan Canilla');
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('nombre es obligatorio');
    expect(crearProducto).not.toHaveBeenCalled();
  });
});