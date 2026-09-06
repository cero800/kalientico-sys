import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { cerrarCaja, resumenDia } from '../services/db';
import { useSesion } from '../store/sesion';
import CerrarCajaPage from './CerrarCajaPage';

vi.mock('../services/db', () => ({
  cerrarCaja: vi.fn(),
  resumenDia: vi.fn(),
}));

const caja = {
  id: 7,
  fecha: '2026-09-04',
  operador_id: 1,
  operador_nombre: 'Ana',
  efectivo_inicial_usd: 5000,
  efectivo_inicial_ves: 0,
  efectivo_ventas_usd: 5000,
  efectivo_ventas_ves: 36850,
  efectivo_egresos_usd: 0,
  efectivo_egresos_ves: 0,
  efectivo_final_usd: 10000,
  efectivo_final_ves: 36850,
  efectivo_esperado_usd: 10000,
  efectivo_esperado_ves: 36850,
  diferencia_usd: 0,
  diferencia_ves: 0,
  tasa_cierre: 0,
  estado: 'abierta',
};

const resumen = {
  producciones: [],
  ventas: [
    { venta_id: 1, numero_factura: 1, cliente: 'Mostrador', tipo: 'contado', monto: 5000, estado: 'entregada', tasa_cambio: 36.85 },
    { venta_id: 2, numero_factura: 2, cliente: 'Pan S.A.', tipo: 'credito', monto: 3000, estado: 'entregada', tasa_cambio: 36.85 },
  ],
  pagos_efectivo_usd: 5000,
  pagos_efectivo_ves: 36850,
  deudores: [],
};

const cierre = {
  caja_id: 7,
  fecha: '2026-09-04',
  operador_nombre: 'Ana',
  negocio_nombre: 'Panadería El Trigal',
  negocio_rif: '',
  negocio_telefono: '',
  negocio_direccion: '',
  efectivo_inicial_usd: 5000,
  efectivo_inicial_ves: 0,
  efectivo_ventas_usd: 5000,
  efectivo_ventas_ves: 36850,
  abonos_efectivo_usd: 0,
  abonos_efectivo_ves: 0,
  efectivo_esperado_usd: 10000,
  efectivo_esperado_ves: 36850,
  ventas: resumen.ventas,
  abonos: [],
  total_ventas_usd: 8000,
  total_ventas_bs: 294800,
  total_abonos_usd: 0,
  total_abonos_bs: 0,
  tasa_cierre: 36.85,
};

const renderPagina = () =>
  render(
    <MemoryRouter initialEntries={['/cerrar-caja']}>
      <Routes>
        <Route path="/cerrar-caja" element={<CerrarCajaPage />} />
        <Route path="/" element={<div>Inicio</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.mocked(cerrarCaja).mockReset();
  vi.mocked(cerrarCaja).mockResolvedValue(cierre as never);
  vi.mocked(resumenDia).mockReset();
  vi.mocked(resumenDia).mockResolvedValue(resumen as never);
  useSesion.setState({
    operador: { id: 1, nombre: 'Ana', rol: 'admin', activo: true },
    caja: caja as never,
    tasa: 36.85,
  });
});

describe('CerrarCajaPage', () => {
  it('muestra solo la cuenta del día para el cierre, sin arqueo', async () => {
    renderPagina();
    expect(await screen.findByText('Cuenta del día')).toBeInTheDocument();
    expect(screen.getByText(/#0001/)).toBeInTheDocument();
    expect(screen.getByText('Mostrador')).toBeInTheDocument();
    expect(screen.getByText('Pan S.A.')).toBeInTheDocument();
    expect(screen.getAllByText('$50.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Bs 1.842,50')).toBeInTheDocument();
    expect(screen.getByLabelText(/Tasa de cierre/)).toHaveValue(36.85);
    expect(screen.queryByLabelText(/Efectivo final US/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Efectivo final Bs/)).not.toBeInTheDocument();
  });

  it('cierra la caja sin efectivo final y abre el comprobante del día', async () => {
    const user = userEvent.setup();
    renderPagina();
    await screen.findByText('Cuenta del día');

    await user.click(screen.getByRole('button', { name: /Cerrar caja/ }));
    expect(screen.getByText(/Tasa de cierre:/)).toHaveTextContent('36.85 Bs');
    await user.click(screen.getByRole('button', { name: /Sí, cerrar/ }));

    expect(cerrarCaja).toHaveBeenCalledWith({
      caja_id: 7,
      operador_id: 1,
      tasa_cierre: 36.85,
    });
    expect(useSesion.getState().caja).toBeNull();

    const dialog = await screen.findByRole('dialog', { name: /Cierre de caja/ });
    expect(within(dialog).getByText(/Panadería El Trigal/)).toBeInTheDocument();
    expect(within(dialog).getByText('Total del día')).toBeInTheDocument();
    expect(within(dialog).getByText('$80.00')).toBeInTheDocument();
    expect(within(dialog).getByText('Bs 2.948,00')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(await screen.findByText('Inicio')).toBeInTheDocument();
  });

  it('bloquea el cierre si la tasa es inválida', async () => {
    const user = userEvent.setup();
    renderPagina();
    const tasaInput = await screen.findByLabelText(/Tasa de cierre/);
    await user.clear(tasaInput);
    await user.type(tasaInput, '0');
    expect(screen.getByText('Tasa inválida')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cerrar caja/ })).toBeDisabled();
  });
});