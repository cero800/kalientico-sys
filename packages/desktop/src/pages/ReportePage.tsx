import { useEffect, useState } from 'react';
import { BarChart3, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import type { Factura, ResumenDia } from '@panaderia/core';
import { getFactura, guardarReporteExcel, resumenDia } from '../services/db';
import { formatUsdCents } from '../lib/format';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table, THead, Th, Td } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { EmptyState, PageHeader } from '../components/ui/Page';
import { PageLoader } from '../components/ui/Spinner';
import { FacturaModal } from '../components/ui/FacturaModal';
import { DatePicker } from '../components/ui/DatePicker';

export default function ReportePage() {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [dato, setDato] = useState<ResumenDia | null>(null);
  const [cargando, setCargando] = useState(true);
  const [factura, setFactura] = useState<Factura | null>(null);
  const [cargandoFactura, setCargandoFactura] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [exportOk, setExportOk] = useState<string | null>(null);

  const cargar = (f: string) => {
    setCargando(true);
    resumenDia(f)
      .then(setDato)
      .catch(() => setDato(null))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargar(fecha);
  }, [fecha]);

  const ventasEntregadas = (dato?.ventas ?? []).filter((v) => v.estado === 'entregada');
  const totalVentas = ventasEntregadas.reduce((acc, v) => acc + v.monto, 0);
  const totalVentasBs = Math.round(ventasEntregadas.reduce((acc, v) => acc + v.monto * v.tasa_cambio, 0));

  const abrirFactura = async (ventaId: number) => {
    setCargandoFactura(true);
    try {
      setFactura(await getFactura(ventaId));
    } catch {
      setFactura(null);
    } finally {
      setCargandoFactura(false);
    }
  };

  const exportarExcel = async () => {
    if (!dato) return;
    setExportando(true);
    setExportOk(null);
    try {
      const { default: ExcelJS } = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      wb.created = new Date();
      const ws = wb.addWorksheet('Reporte');

      ws.addRow(['Kalientico — Reporte del día', fecha]).font = { bold: true, size: 14 };
      ws.addRow([]);
      ws.addRow(['Ventas entregadas', (totalVentas / 100).toFixed(2), 'US$']);
      ws.addRow(['Ventas en Bs', (totalVentasBs / 100).toFixed(2), 'Bs']);
      ws.addRow(['Efectivo US$', (dato.pagos_efectivo_usd / 100).toFixed(2), 'US$']);
      ws.addRow(['Efectivo Bs', (dato.pagos_efectivo_ves / 100).toFixed(2), 'Bs']);
      ws.addRow([]);

      ws.addRow(['Ventas']).font = { bold: true };
      ws.addRow(['Factura', 'Cliente', 'Tipo', 'Monto (US$)', 'Tasa']);
      ventasEntregadas.forEach((v) =>
        ws.addRow([v.numero_factura, v.cliente, v.tipo, (v.monto / 100).toFixed(2), v.tasa_cambio]),
      );
      ws.addRow([]);

      ws.addRow(['Producción']).font = { bold: true };
      ws.addRow(['Producto', 'Cantidad', 'Costo unit. (US$)']);
      dato.producciones.forEach((m) => ws.addRow([m.producto, m.cantidad, (m.costo_unitario / 100).toFixed(2)]));

      ws.columns.forEach((col) => {
        if (col && typeof col.eachCell === 'function') col.width = 24;
      });

      const buffer = await wb.xlsx.writeBuffer();
      const contenido_b64 = arrayBufferABase64(buffer);
      const ruta = await guardarReporteExcel(`reporte-${fecha}.xlsx`, contenido_b64);
      setExportOk(`Reporte guardado en: ${ruta}`);
    } catch (e) {
      setExportOk(null);
      window.alert(`No se pudo exportar el reporte: ${String(e)}`);
    } finally {
      setExportando(false);
    }
  };

  if (cargando && !dato) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Reporte del día"
        subtitle="Resumen de producción, ventas y efectivo"
        actions={
          <div className="flex items-center gap-2">
            <DatePicker value={fecha} onChange={setFecha} aria-label="Fecha del reporte" />
            <Button
              variant="secondary"
              onClick={exportarExcel}
              disabled={exportando || !dato}
              aria-label="Exportar reporte a Excel"
            >
              <FileSpreadsheet className="h-4 w-4" /> {exportando ? 'Exportando…' : 'Excel'}
            </Button>
            <Button variant="secondary" onClick={() => cargar(fecha)} aria-label="Recargar reporte">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {exportOk && (
        <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{exportOk}</div>
      )}

      {!dato ? (
        <Card>
          <EmptyState icon={<BarChart3 className="h-8 w-8" />} message="Sin datos para esta fecha" />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-5">
              <Stat label="Ventas entregadas" valor={totalVentas ? formatUsdCents(totalVentas) : '—'} />
              <Stat label="Ventas Bs" valor={totalVentasBs ? formatUsdCents(totalVentasBs) : '—'} />
              <Stat label="Efectivo US$" valor={formatUsdCents(dato.pagos_efectivo_usd)} />
              <Stat label="Efectivo Bs" valor={formatUsdCents(dato.pagos_efectivo_ves)} />
              <Stat label="Ventas" valor={String(ventasEntregadas.length)} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Producción" subtitle={`${dato.producciones.length} registros`} />
            {dato.producciones.length === 0 ? (
              <EmptyState message="Sin producción" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Producto</Th>
                    <Th className="text-right">Cantidad</Th>
                    <Th className="text-right">Costo unit.</Th>
                  </tr>
                </THead>
                <tbody>
                  {dato.producciones.map((m, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <Td>{m.producto}</Td>
                      <Td className="text-right">{m.cantidad}</Td>
                      <Td className="text-right">{formatUsdCents(m.costo_unitario)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="Ventas" subtitle={`${ventasEntregadas.length} facturas`} />
            {ventasEntregadas.length === 0 ? (
              <EmptyState message="Sin ventas" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Factura</Th>
                    <Th>Cliente</Th>
                    <Th>Tipo</Th>
                    <Th className="text-right">Monto</Th>
                    <Th className="text-right">Acciones</Th>
                  </tr>
                </THead>
                <tbody>
                  {ventasEntregadas.map((v) => (
                    <tr key={v.numero_factura} className="border-b border-gray-50 last:border-0">
                      <Td className="font-mono text-xs">#{v.numero_factura}</Td>
                      <Td>{v.cliente}</Td>
                      <Td>
                        <Badge tone={v.tipo === 'contado' ? 'green' : 'blue'}>{v.tipo}</Badge>
                      </Td>
                      <Td className="text-right">{formatUsdCents(v.monto)}</Td>
                      <Td className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Ver factura ${v.numero_factura}`}
                          onClick={() => abrirFactura(v.venta_id)}
                          disabled={cargandoFactura}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      )}
      <FacturaModal factura={factura} onClose={() => setFactura(null)} />
    </div>
  );
}

function Stat({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-900">{valor}</p>
    </div>
  );
}

function arrayBufferABase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binario = '';
  const trozos = 0x8000;
  for (let i = 0; i < bytes.length; i += trozos) {
    binario += String.fromCharCode(...bytes.subarray(i, i + trozos));
  }
  return btoa(binario);
}