// Generación del PDF de factura con jsPDF. Mismo contenido que el modal
// imprimible: encabezado del negocio, número, cliente, detalle y pagos.

import type { Factura } from '@panaderia/core';
import { TIPO_PAGO_LABELS } from '@panaderia/core';
import { formatCents, formatUsdCents } from './format';

const MARGEN = 12;

/// Nombre del archivo: `factura-0001-2026-09-05.pdf`.
export function nombreArchivoFactura(f: Factura): string {
  const fecha = (f.fecha || '').slice(0, 10) || 'sin-fecha';
  const numero = String(f.numero_factura).padStart(4, '0');
  return `factura-${numero}-${fecha}.pdf`;
}

/// Contenido base64 del PDF (sin el prefijo `data:application/pdf...`).
/// jsPDF se carga bajo demanda para no inflar el bundle inicial.
export async function facturaPdfB64(f: Factura): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
  const w = doc.internal.pageSize.getWidth();
  const centro = w / 2;

  let y = 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text((f.negocio_nombre || 'Mi Negocio').toUpperCase(), centro, y, { align: 'center' });
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (f.negocio_rif) {
    doc.text(`RIF: ${f.negocio_rif}`, centro, y, { align: 'center' });
    y += 4;
  }
  if (f.negocio_telefono) {
    doc.text(`Telf: ${f.negocio_telefono}`, centro, y, { align: 'center' });
    y += 4;
  }
  if (f.negocio_direccion) {
    doc.text(f.negocio_direccion, centro, y, { align: 'center' });
    y += 4;
  }

  y += 3;
  doc.setLineWidth(0.6);
  doc.line(MARGEN, y, w - MARGEN, y);
  y += 7;

  // Número de factura y fecha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`FACTURA N° ${String(f.numero_factura).padStart(4, '0')}`, MARGEN, y);
  doc.text(f.fecha.slice(0, 10), w - MARGEN, y, { align: 'right' });
  y += 9;

  // Cliente
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('CLIENTE', MARGEN, y);
  doc.setFont('helvetica', 'normal');
  doc.text(f.cliente, MARGEN, y + 4);
  if (f.cliente_rif) {
    doc.text(`RIF: ${f.cliente_rif}`, MARGEN, y + 8);
  }
  y += 16;

  // Tabla de detalle
  const colCant = w - 46;
  const colPunit = w - 31;
  const colSub = w - MARGEN;

  doc.setLineWidth(0.3);
  doc.line(MARGEN, y, w - MARGEN, y);
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('PRODUCTO', MARGEN, y);
  doc.text('CANT', colCant, y, { align: 'right' });
  doc.text('P.UNIT', colPunit, y, { align: 'right' });
  doc.text('SUBTOTAL', colSub, y, { align: 'right' });
  y += 2;
  doc.line(MARGEN, y, w - MARGEN, y);
  y += 3;

  doc.setFont('helvetica', 'normal');
  f.detalle.forEach((d) => {
    const nombre = d.producto.length > 34 ? `${d.producto.slice(0, 33)}…` : d.producto;
    doc.text(nombre, MARGEN, y);
    doc.text(String(d.cantidad), colCant, y, { align: 'right' });
    doc.text(formatUsdCents(d.precio_unitario), colPunit, y, { align: 'right' });
    doc.text(formatUsdCents(d.subtotal), colSub, y, { align: 'right' });
    y += 6;
  });

  y += 2;
  // Totales
  doc.setFontSize(9);
  doc.text('Subtotal', MARGEN, y);
  doc.text(formatUsdCents(f.subtotal), colSub, y, { align: 'right' });
  y += 5;
  if (f.descuento > 0) {
    doc.text('Descuento', MARGEN, y);
    doc.text(`-${formatUsdCents(f.descuento)}`, colSub, y, { align: 'right' });
    y += 5;
  }
  doc.setLineWidth(0.6);
  doc.line(MARGEN, y, w - MARGEN, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL', MARGEN, y + 3);
  doc.text(formatUsdCents(f.total), colSub, y + 3, { align: 'right' });
  y += 9;

  // Forma de pago
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setLineWidth(0.3);
  doc.line(MARGEN, y, w - MARGEN, y);
  y += 4;
  doc.text('FORMA DE PAGO', MARGEN, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  f.pagos.forEach((p) => {
    const etiqueta =
      `${TIPO_PAGO_LABELS[p.tipo_pago]} ${p.moneda === 'usd' ? 'US$' : 'Bs'}` +
      (p.numero_referencia ? ` · Ref. ${p.numero_referencia}` : '');
    doc.text(etiqueta, MARGEN, y);
    doc.text(formatCents(p.monto, p.moneda), colSub, y, { align: 'right' });
    y += 5;
  });

  // Devoluciones: qué se devolvió y cómo quedó el saldo neto de la venta.
  if (f.devoluciones.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setLineWidth(0.3);
    doc.line(MARGEN, y, w - MARGEN, y);
    y += 4;
    doc.text('DEVOLUCIONES (PANES DETERIORADOS)', MARGEN, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    f.devoluciones.forEach((dev) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const motivo = dev.motivo ? ` · ${dev.motivo}` : '';
      doc.text(`Devuelto el ${dev.fecha_devolucion.slice(0, 10)}${motivo}`, MARGEN, y);
      doc.text(`-${formatUsdCents(dev.monto)}`, colSub, y, { align: 'right' });
      y += 4;
      doc.setFontSize(7);
      dev.detalle.forEach((p) => {
        const linea = `${p.nombre} x ${p.cantidad}`;
        doc.text(linea.length > 46 ? `${linea.slice(0, 45)}…` : linea, MARGEN + 3, y);
        doc.text(formatUsdCents(p.subtotal), colSub, y, { align: 'right' });
        y += 4;
      });
    });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const neto =
      f.total - f.devoluciones.reduce((s, d) => s + d.monto, 0);
    doc.text('Saldo final de la venta (neto)', MARGEN, y);
    doc.text(formatUsdCents(Math.max(neto, 0)), colSub, y, { align: 'right' });
    y += 5;
  }

  // Tasa
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(
    f.tasa_cambio > 0 ? `Tasa: Bs ${f.tasa_cambio.toFixed(2)} por US$ 1` : 'Gracias por su compra',
    centro,
    doc.internal.pageSize.getHeight() - 12,
    { align: 'center' },
  );

  return doc.output('datauristring').split(',')[1] ?? '';
}