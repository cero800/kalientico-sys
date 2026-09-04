import { create } from 'zustand';
import type { Caja, Usuario } from '@panaderia/core';
import { cajaAbierta, getTasaCambio } from '../services/db';

interface SesionState {
  operador: Usuario | null;
  caja: Caja | null;
  tasa: number;
  inicializado: boolean;
  login: (usuario: Usuario) => void;
  logout: () => void;
  refrescar: () => Promise<void>;
  setCaja: (caja: Caja | null) => void;
  setTasaLocal: (tasa: number) => void;
}

/** Estado global de la sesión: operador, caja abierta y tasa de cambio vigente. */
export const useSesion = create<SesionState>((set) => ({
  operador: null,
  caja: null,
  tasa: 1,
  inicializado: false,

  login: (usuario) => set({ operador: usuario }),

  logout: () => set({ operador: null, caja: null }),

  refrescar: async () => {
    const [caja, tasa] = await Promise.all([cajaAbierta(), getTasaCambio()]);
    set({ caja, tasa, inicializado: true });
  },

  setCaja: (caja) => set({ caja }),
  setTasaLocal: (tasa) => set({ tasa }),
}));