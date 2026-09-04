import { describe, expect, it } from 'vitest';
import { subtotalCarrito, totalLinea, useCarrito } from './carrito';

const linea = (producto_id: number, precio: number, cantidad: number) => ({
  producto_id,
  codigo: `P${producto_id}`,
  nombre: `Producto ${producto_id}`,
  unidad: 'unidad',
  precio,
  cantidad,
});

describe('totalLinea / subtotalCarrito', () => {
  it('calcula totales redondeando a céntimos', () => {
    expect(totalLinea(linea(1, 250, 3))).toBe(750);
    expect(totalLinea(linea(2, 33, 0.15))).toBe(5);
    expect(subtotalCarrito([linea(1, 250, 2), linea(2, 100, 1)])).toBe(600);
    expect(subtotalCarrito([])).toBe(0);
  });
});

describe('useCarrito', () => {
  it('agrega productos y acumula cantidades', () => {
    useCarrito.getState().agregar(linea(1, 250, 1));
    useCarrito.getState().agregar(linea(1, 250, 2));
    expect(useCarrito.getState().lineas).toHaveLength(1);
    expect(useCarrito.getState().lineas[0].cantidad).toBe(3);
    useCarrito.getState().vaciar();
  });

  it('modifica y elimina cantidades', () => {
    useCarrito.getState().agregar(linea(1, 250, 1));
    useCarrito.getState().agregar(linea(2, 100, 5));
    useCarrito.getState().setCantidad(1, 4);
    expect(useCarrito.getState().lineas.find((l) => l.producto_id === 1)?.cantidad).toBe(4);
    useCarrito.getState().setCantidad(2, 0);
    expect(useCarrito.getState().lineas).toHaveLength(1);
    useCarrito.getState().vaciar();
  });

  it('aplica precios especiales por cliente', () => {
    useCarrito.getState().agregar(linea(1, 250, 1));
    useCarrito.getState().aplicarPrecios(new Map([[1, 220]]));
    expect(useCarrito.getState().lineas[0].precio).toBe(220);
    useCarrito.getState().vaciar();
  });
});