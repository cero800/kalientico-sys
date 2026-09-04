import { create } from 'zustand';

export interface LineaCarrito {
  producto_id: number;
  codigo: string;
  nombre: string;
  unidad: string;
  precio: number;
  cantidad: number;
}

/** Precio * cantidad, redondeado a céntimos. */
export function totalLinea(linea: LineaCarrito): number {
  return Math.round(linea.precio * linea.cantidad);
}

/** Subtotal del carrito en céntimos. */
export function subtotalCarrito(lineas: LineaCarrito[]): number {
  return lineas.reduce((acc, l) => acc + totalLinea(l), 0);
}

interface CarritoState {
  lineas: LineaCarrito[];
  agregar: (linea: LineaCarrito) => void;
  setCantidad: (producto_id: number, cantidad: number) => void;
  quitar: (producto_id: number) => void;
  vaciar: () => void;
  /** Recalcula los precios según un mapa producto_id -> precio efectivo. */
  aplicarPrecios: (precios: Map<number, number>) => void;
}

export const useCarrito = create<CarritoState>((set) => ({
  lineas: [],

  agregar: (linea) =>
    set((state) => {
      const existente = state.lineas.find((l) => l.producto_id === linea.producto_id);
      if (existente) {
        return {
          lineas: state.lineas.map((l) =>
            l.producto_id === linea.producto_id ? { ...l, cantidad: l.cantidad + linea.cantidad } : l,
          ),
        };
      }
      return { lineas: [...state.lineas, linea] };
    }),

  setCantidad: (producto_id, cantidad) =>
    set((state) => ({
      lineas: cantidad <= 0
        ? state.lineas.filter((l) => l.producto_id !== producto_id)
        : state.lineas.map((l) => (l.producto_id === producto_id ? { ...l, cantidad } : l)),
    })),

  quitar: (producto_id) =>
    set((state) => ({ lineas: state.lineas.filter((l) => l.producto_id !== producto_id) })),

  vaciar: () => set({ lineas: [] }),

  aplicarPrecios: (precios) =>
    set((state) => ({
      lineas: state.lineas.map((l) => ({ ...l, precio: precios.get(l.producto_id) ?? l.precio })),
    })),
}));