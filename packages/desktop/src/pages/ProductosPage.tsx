import { useEffect, useMemo, useState } from 'react';
import { Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { Producto, ProductoInput, UnidadMedida } from '@panaderia/core';
import { actualizarProducto, crearProducto, eliminarProducto, listarProductos } from '../services/db';
import { formatUsdCents, parseCentsInput } from '../lib/format';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Table, THead, Th, Td } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { EmptyState, PageHeader } from '../components/ui/Page';
import { PageLoader } from '../components/ui/Spinner';

const UNIDADES: UnidadMedida[] = ['unidad', 'kg', 'paquete', 'bandeja', 'caja'];

function vacio(): ProductoInput {
  return {
    codigo: '',
    nombre: '',
    unidad_medida: 'unidad',
    precio_base: 0,
    precio_mayoreo: 0,
    impuesto_porcentaje: 0,
    activo: true,
  };
}

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [form, setForm] = useState<ProductoInput>(vacio());
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = () => listarProductos().then(setProductos).finally(() => setCargando(false));
  useEffect(() => {
    cargar();
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter((p) => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q));
  }, [productos, busqueda]);

  const abrirNuevo = () => {
    setEditando(null);
    setForm(vacio());
    setError(null);
    setModal(true);
  };

  const abrirEdicion = (p: Producto) => {
    setEditando(p);
    setForm({
      codigo: p.codigo,
      nombre: p.nombre,
      unidad_medida: p.unidad_medida,
      precio_base: p.precio_base,
      precio_mayoreo: p.precio_mayoreo,
      impuesto_porcentaje: p.impuesto_porcentaje,
      activo: p.activo,
    });
    setError(null);
    setModal(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      if (editando) {
        await actualizarProducto(editando.id, form);
      } else {
        await crearProducto(form);
      }
      setModal(false);
      cargar();
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (p: Producto) => {
    if (!window.confirm(`¿Eliminar "${p.nombre}"?`)) return;
    try {
      await eliminarProducto(p.id);
      cargar();
    } catch (e) {
      window.alert(String(e));
    }
  };

  if (cargando) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Productos"
        subtitle={`${productos.length} en el catálogo`}
        actions={
          <Button onClick={abrirNuevo}>
            <Plus className="h-4 w-4" /> Nuevo producto
          </Button>
        }
      />

      <Card className="mb-4 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o código…"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>
      </Card>

      {filtrados.length === 0 ? (
        <Card>
          <EmptyState icon={<Package className="h-8 w-8" />} message="Sin productos" />
        </Card>
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <Th>Código</Th>
                <Th>Nombre</Th>
                <Th>Unidad</Th>
                <Th className="text-right">Precio base</Th>
                <Th className="text-right">Mayoreo</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </THead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <Td className="font-mono text-xs text-gray-500">{p.codigo}</Td>
                  <Td>
                    <span className="font-medium text-gray-900">{p.nombre}</span>
                    {p.descripcion && <span className="block text-xs text-gray-400">{p.descripcion}</span>}
                  </Td>
                  <Td>{p.unidad_medida}</Td>
                  <Td className="text-right">{formatUsdCents(p.precio_base)}</Td>
                  <Td className="text-right">{formatUsdCents(p.precio_mayoreo)}</Td>
                  <Td>
                    <Badge tone={p.activo ? 'green' : 'gray'}>{p.activo ? 'Activo' : 'Inactivo'}</Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" aria-label={`Editar ${p.nombre}`} onClick={() => abrirEdicion(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" aria-label={`Eliminar ${p.nombre}`} onClick={() => eliminar(p)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <Modal
        open={modal}
        title={editando ? 'Editar producto' : 'Nuevo producto'}
        onClose={() => setModal(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
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
          <Input label="Código" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="P-001" />
          <Input label="Nombre *" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <div className="flex gap-3">
            <div className="flex-1">
              <Select
                label="Unidad"
                value={form.unidad_medida}
                onChange={(e) => setForm({ ...form, unidad_medida: e.target.value as UnidadMedida })}
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1">
              <Input
                label="Impuesto %"
                type="number"
                min={0}
                max={100}
                value={form.impuesto_porcentaje}
                onChange={(e) => setForm({ ...form, impuesto_porcentaje: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                label="Precio base (US$)"
                prefix="$"
                value={form.precio_base ? formatUsdCents(form.precio_base) : ''}
                onChange={(e) => setForm({ ...form, precio_base: parseCentsInput(e.target.value, 'usd') ?? 0 })}
              />
            </div>
            <div className="flex-1">
              <Input
                label="Precio mayoreo (US$)"
                prefix="$"
                value={form.precio_mayoreo ? formatUsdCents(form.precio_mayoreo) : ''}
                onChange={(e) => setForm({ ...form, precio_mayoreo: parseCentsInput(e.target.value, 'usd') ?? 0 })}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}