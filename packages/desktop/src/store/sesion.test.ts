import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Caja, Usuario } from '@panaderia/core';
import { useSesion } from '../store/sesion';

const cajaAbierta = vi.fn();
const getTasaCambio = vi.fn();

vi.mock('../services/db', () => ({
  cajaAbierta: (...args: unknown[]) => cajaAbierta(...args),
  getTasaCambio: (...args: unknown[]) => getTasaCambio(...args),
}));

const ana: Usuario = { id: 1, nombre: 'Ana', rol: 'admin', activo: true };
const cajaAbiertaFixture: Caja = {
  id: 7,
  fecha: '2026-09-04',
  operador_id: 1,
  operador_nombre: 'Ana',
  estado: 'abierta',
  efectivo_inicial_usd: 0,
  efectivo_inicial_ves: 0,
  efectivo_ventas_usd: 0,
  efectivo_ventas_ves: 0,
  efectivo_egresos_usd: 0,
  efectivo_egresos_ves: 0,
  efectivo_final_usd: 0,
  efectivo_final_ves: 0,
  efectivo_esperado_usd: 0,
  efectivo_esperado_ves: 0,
  diferencia_usd: 0,
  diferencia_ves: 0,
  tasa_cierre: 0,
};

describe('store/sesion', () => {
  beforeEach(() => {
    cajaAbierta.mockReset();
    getTasaCambio.mockReset();
    useSesion.setState({ operador: null, caja: null, tasa: 1, inicializado: false });
  });

  it('logout cierra el turno pero conserva la caja abierta', async () => {
    cajaAbierta.mockResolvedValue(cajaAbiertaFixture);
    getTasaCambio.mockResolvedValue(36.85);
    await useSesion.getState().login(ana);

    expect(useSesion.getState().operador?.nombre).toBe('Ana');
    expect(useSesion.getState().caja?.id).toBe(7);

    useSesion.getState().logout();
    expect(useSesion.getState().operador).toBeNull();
    expect(useSesion.getState().caja).not.toBeNull();
  });

  it('login re-sincroniza caja y tasa con el backend', async () => {
    cajaAbierta.mockResolvedValue(null);
    getTasaCambio.mockResolvedValue(40.5);
    useSesion.setState({ caja: cajaAbiertaFixture as Caja, tasa: 1 });

    await useSesion.getState().login(ana);

    expect(useSesion.getState().caja).toBeNull();
    expect(useSesion.getState().tasa).toBe(40.5);
    expect(useSesion.getState().inicializado).toBe(true);
  });
});