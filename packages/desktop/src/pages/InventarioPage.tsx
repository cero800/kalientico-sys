import { useEffect, useMemo, useState } from 'react';
import { Boxes, Hammer, MinusCircle, Plus, Settings2 } from 'lucide-react';
import type { StockItem } from '@panaderia/core';
import { listarProductos, listarStock, registrarAjuste, registrarMerma, registrarProduccion } from '../services/db';
import { parseCentsInput } from '../lib/format';
import type { Producto } from '@panaderia/core';
import { useSesion } from '../store/sesion';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Table, THead, Th, Td } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { EmptyState, PageHeader } from '../components/ui/Page';
import { PageLoader } from '../components/ui/Spinner';
import { DatePicker } from '../components/ui/DatePicker';

type Accion = 'produccion' | 'merma' | 'ajuste';

export default function InventarioPage() {
  const operadorId = useSesion((s) => s.operador?.id ?? 0);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [costo, setCosto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = () => listarStock().then(setStock).finally(() => setCargando(false));
  useEffect(() => {
    cargar();
    listarProductos()
      .then((ps) => setProductos(ps.filter((p) => p.activo)))
      .catch(() => {});
  }, []);

  const pendientes = useMemo(() => stock.filter((s) => s.cantidad_disponible <= 0), [stock]);

  const abrir = (a: Accion, productoIdDefault?: number) => {
    setAccion(a);
    setProductoId(productoIdDefault != null ? String(productoIdDefault) : '');
    setCantidad('');
    setCosto('');
    setMotivo('');
    setFecha(new Date().toISOString().slice(0, 10));
    setError(null);
    if (a === 'produccion' && productoIdDefault != null) {
      const p = productos.find((x) => x.id === productoIdDefault);
      if (p) setCosto((p.precio_base / 100).toFixed(2));
    }
  };

  const elegirProducto = (id: string) => {
    setProductoId(id);
    if (accion === 'produccion') {
      const p = productos.find((x) => x.id === Number(id));
      if (p) setCosto((p.precio_base / 100).toFixed(2));
    }
  };

  const ejecutar = async () => {
    const pid = Number(productoId);
    const cant = Number(cantidad.replace(',', '.'));
    const esAjuste = accion === 'ajuste';
    if (!productoId || !Number.isFinite(cant) || (esAjuste ? cant === 0 : cant <= 0)) {
      setError('Selecciona el producto e ingresa una cantidad válida');
      return;
    }
    if (accion === 'merma' && !motivo.trim()) {
      setError('La merma requiere un motivo');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      if (accion === 'produccion') {
        await registrarProduccion({
          producto_id: pid,
          cantidad: cant,
          costo_unitario: parseCentsInput(costo, 'usd') ?? 0,
          operador_id: operadorId,
          fecha,
        });
      } else if (accion === 'merma') {
        await registrarMerma({ producto_id: pid, cantidad: cant, motivo: motivo.trim(), operador_id: operadorId });
      } else {
        await registrarAjuste({
          producto_id: pid,
          cantidad_delta: Number(cantidad.replace(',', '.')),
          motivo: motivo.trim() || 'Ajuste manual',
          operador_id: operadorId,
        });
      }
      setAccion(null);
      cargar();
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Inventario"
        subtitle={`${stock.length} productos`}
        actions={
          <>
            <Button variant="secondary" onClick={() => abrir('merma')}>
              <MinusCircle className="h-4 w-4" /> Merma
            </Button>
            <Button variant="secondary" onClick={() => abrir('ajuste')}>
              <Settings2 className="h-4 w-4" /> Ajuste
            </Button>
            <Button onClick={() => abrir('produccion')}>
              <Plus className="h-4 w-4" /> Producción
            </Button>
          </>
        }
      />

      {pendientes.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          ¡Ojo! {pendientes.length} producto(s) con stock agotado o negativo:
          {pendientes.map((p) => p.nombre).join(', ')}.
        </div>
      )}

      {stock.length === 0 ? (
        <Card>
          <EmptyState icon={<Boxes className="h-8 w-8" />} message="Sin movimientos de inventario aún" />
        </Card>
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <Th>Código</Th>
                <Th>Producto</Th>
                <Th className="text-right">Disponible</Th>
                <Th>Unidad</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acción</Th>
              </tr>
            </THead>
            <tbody>
              {stock.map((s) => (
                <tr key={s.producto_id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <Td className="font-mono text-xs text-gray-500">{s.codigo}</Td>
                  <Td className="font-medium text-gray-900">{s.nombre}</Td>
                  <Td className="text-right font-semibold">{s.cantidad_disponible}</Td>
                  <Td>{s.unidad_medida}</Td>
                  <Td>
                    <Badge tone={s.cantidad_disponible <= 0 ? 'red' : 'green'}>
                      {s.cantidad_disponible <= 0 ? 'Agotado' : 'Disponible'}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => abrir('produccion', s.producto_id)}>
                      <Hammer className="h-4 w-4" />
                      <span className="ml-1">Producir</span>
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <Modal
        open={accion != null}
        title={
          accion === 'produccion' ? 'Registrar producción' : accion === 'merma' ? 'Registrar merma' : 'Ajuste de inventario'
        }
        onClose={() => setAccion(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAccion(null)}>
              Cancelar
            </Button>
            <Button onClick={ejecutar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <Select label="Producto" value={productoId} onChange={(e) => elegirProducto(e.target.value)}>
            <option value="">— Seleccionar —</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>

          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                label="Cantidad"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="1.5"
                hint={accion === 'ajuste' ? 'Negativo para restar' : undefined}
              />
            </div>
            {accion === 'produccion' && (
              <div className="flex-1">
                <Input
                  label="Costo unitario (US$)"
                  prefix="$"
                  value={costo}
                  onChange={(e) => setCosto(e.target.value)}
                  placeholder="0.00"
                  hint="Pre-cargado con el precio base del producto (editable)"
                />
              </div>
            )}
          </div>

          {accion === 'produccion' && (
            <div>
              <span className="mb-1 block text-sm font-medium text-gray-700">Fecha</span>
              <DatePicker value={fecha} onChange={setFecha} aria-label="Fecha de producción" />
            </div>
          )}

          {accion !== 'produccion' && (
            <Input
              label={accion === 'merma' ? 'Motivo *' : 'Motivo'}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej.: pan quemado"
            />
          )}
        </div>
      </Modal>
    </div>
  );
}