import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FacturaModal } from './FacturaModal';
import { imprimirTicket, listarImpresoras, setConfig } from '../../services/db';
import type { Factura } from '@panaderia/core';

vi.mock('../../lib/facturaPdf', () => ({
  nombreArchivoFactura: vi.fn().mockReturnValue('factura-001.pdf'),
  facturaPdfB64: vi.fn().mockResolvedValue('data'),
}));

vi.mock('../../services/db', () => ({
  guardarFacturaPdf: vi.fn().mockResolvedValue('/tmp/factura-001.pdf'),
  imprimirTicket: vi.fn(),
  listarImpresoras: vi.fn().mockResolvedValue(['/dev/usb/lp0']),
  probarImpresora: vi.fn().mockResolvedValue(undefined),
  getConfig: vi.fn().mockResolvedValue(''),
  setConfig: vi.fn().mockResolvedValue(undefined),
  IMPRESORA_TERMICA_KEY: 'impresora_termica',
}));

const factura: Factura = {
  venta_id: 1,
  numero_factura: 12,
  tipo: 'contado',
  estado: 'entregada',
  fecha: '2026-09-04',
  cliente: 'Consumidor Final',
  cliente_rif: '',
  dias_credito: 0,
  negocio_nombre: 'Panadería Kalientico',
  negocio_rif: 'J-99999999-9',
  negocio_telefono: '',
  negocio_direccion: '',
  subtotal: 500,
  descuento: 0,
  impuesto: 0,
  total: 500,
  tasa_cambio: 36.85,
  detalle: [{ producto: 'Pan Canilla', cantidad: 1, precio_unitario: 500, subtotal: 500 }],
  pagos: [{ tipo_pago: 'efectivo', moneda: 'usd', monto: 500, numero_referencia: null }],
  devoluciones: [],
};

beforeEach(() => {
  vi.mocked(imprimirTicket).mockReset();
  vi.mocked(imprimirTicket).mockResolvedValue(undefined);
  vi.mocked(listarImpresoras).mockResolvedValue(['/dev/usb/lp0']);
  vi.mocked(setConfig).mockReset();
  vi.mocked(setConfig).mockResolvedValue(undefined);
});

describe('FacturaModal: impresión térmica', () => {
  it('envía la factura como ticket a la impresora y confirma el envío', async () => {
    const user = userEvent.setup();
    render(<FacturaModal factura={factura} onClose={() => {}} />);

    await user.click(await screen.findByRole('button', { name: /térmica/i }));

    expect(imprimirTicket).toHaveBeenCalledTimes(1);
    expect(imprimirTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        negocio_nombre: 'Panadería Kalientico',
        negocio_rif: 'J-99999999-9',
        numero_factura: 12,
        cliente: 'Consumidor Final',
        total: 500,
        detalle: expect.arrayContaining([
          expect.objectContaining({ producto: 'Pan Canilla', cantidad: 1, subtotal: 500 }),
        ]),
        pagos: expect.arrayContaining([
          expect.objectContaining({ tipo_pago: 'efectivo', moneda: 'usd', monto: 500 }),
        ]),
      }),
    );
    expect(await screen.findByText(/ticket enviado a la impresora térmica/i)).toBeInTheDocument();
  });

  it('si falla el envío, ofrece configurar la impresora y al guardar reenvía el ticket', async () => {
    vi.mocked(imprimirTicket).mockRejectedValueOnce(new Error('No hay impresora conectada (LP)'));
    const user = userEvent.setup();
    render(<FacturaModal factura={factura} onClose={() => {}} />);

    await user.click(await screen.findByRole('button', { name: /térmica/i }));
    expect(await screen.findByText(/no hay impresora conectada/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /configurar impresora/i }));
    expect(screen.getByText('Configurar impresora térmica')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /dev\/usb\/lp0/i }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(setConfig).toHaveBeenCalledWith('impresora_termica', '/dev/usb/lp0');
    expect(imprimirTicket).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/ticket enviado a la impresora térmica/i)).toBeInTheDocument();
  });
});