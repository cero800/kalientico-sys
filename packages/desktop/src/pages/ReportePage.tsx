import { useEffect, useState } from 'react';
import { BarChart3, FileText, RefreshCw } from 'lucide-react';
import type { Factura, ResumenDia } from '@panaderia/core';
import { getFactura, resumenDia } from '../services/db';
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

  if (cargando && !dato) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Reporte del día"
        subtitle="Resumen de producción, ventas y efectivo"
        actions={
          <div className="flex items-center gap-2">
            <DatePicker value={fecha} onChange={setFecha} aria-label="Fecha del reporte" />
            <Button variant="secondary" onClick={() => cargar(fecha)} aria-label="Recargar reporte">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />

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