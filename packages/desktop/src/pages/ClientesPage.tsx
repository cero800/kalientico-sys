import { useEffect, useState } from 'react';
import { Plus, Settings2, Trash2, Users } from 'lucide-react';
import type { Empresa, EmpresaInput, Producto } from '@panaderia/core';
import { crearEmpresa, eliminarEmpresa, listarEmpresas, listarPreciosCliente, listarProductos, setPrecioCliente } from '../services/db';
import { formatUsdCents, parseCentsInput } from '../lib/format';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, THead, Th, Td } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { EmptyState, PageHeader } from '../components/ui/Page';
import { PageLoader } from '../components/ui/Spinner';

function empresaVacia(): EmpresaInput {
  return {
    rut_nit: '',
    nombre_comercial: '',
    dias_credito: 0,
    limite_credito: 0,
    activo: true,
  };
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Empresa[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [form, setForm] = useState<EmpresaInput>(empresaVacia());
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [preciosDe, setPreciosDe] = useState<Empresa | null>(null);
  const [precios, setPrecios] = useState<Record<number, string>>({});
  const [existentes, setExistentes] = useState<Record<number, number>>({});

  const cargar = () => listarEmpresas().then(setClientes).finally(() => setCargando(false));
  useEffect(() => {
    cargar();
    listarProductos()
      .then((ps) => setProductos(ps.filter((p) => p.activo)))
      .catch(() => {});
  }, []);

  const crear = async () => {
    if (!form.nombre_comercial.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await crearEmpresa(form);
      setModalNuevo(false);
      setForm(empresaVacia());
      cargar();
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (c: Empresa) => {
    if (!window.confirm(`¿Eliminar "${c.nombre_comercial}"?`)) return;
    try {
      await eliminarEmpresa(c.id);
      cargar();
    } catch (e) {
      window.alert(String(e));
    }
  };

  const abrirPrecios = async (c: Empresa) => {
    setPreciosDe(c);
    setPrecios({});
    try {
      const existentes = await listarPreciosCliente(c.id);
      setExistentes(Object.fromEntries(existentes.map((p) => [p.producto_id, p.precio_especial])));
      setPrecios(Object.fromEntries(existentes.map((p) => [p.producto_id, formatUsdCents(p.precio_especial)])));
    } catch {
      setExistentes({});
    }
  };

  const guardarPrecios = async () => {
    if (!preciosDe) return;
    setGuardando(true);
    setError(null);
    try {
      const operaciones: Promise<unknown>[] = [];
      for (const p of productos) {
        const texto = precios[p.id]?.trim();
        if (!texto) continue;
        const valor = parseCentsInput(texto, 'usd');
        if (valor === null || valor === p.precio_base) continue;
        if (existentes[p.id] === valor) continue;
        operaciones.push(
          setPrecioCliente({ empresa_id: preciosDe.id, producto_id: p.id, precio_especial: valor }),
        );
      }
      await Promise.all(operaciones);
      setPreciosDe(null);
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
        title="Clientes"
        subtitle={`${clientes.length} registrados`}
        actions={
          <Button onClick={() => { setError(null); setForm(empresaVacia()); setModalNuevo(true); }}>
            <Plus className="h-4 w-4" /> Nuevo cliente
          </Button>
        }
      />

      {clientes.filter((c) => c.rut_nit !== '0').length === 0 ? (
        <Card>
          <EmptyState icon={<Users className="h-8 w-8" />} message="Aún no hay clientes" />
        </Card>
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <Th>RIF/NIT</Th>
                <Th>Nombre</Th>
                <Th>Crédito</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </THead>
            <tbody>
              {clientes
                .filter((c) => c.rut_nit !== '0')
                .map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <Td className="font-mono text-xs text-gray-500">{c.rut_nit}</Td>
                    <Td>
                      <span className="font-medium text-gray-900">{c.nombre_comercial}</span>
                      <span className="block text-xs text-gray-400">{c.dias_credito} días</span>
                    </Td>
                    <Td>{formatUsdCents(c.limite_credito)}</Td>
                    <Td>
                      <Badge tone={c.activo ? 'green' : 'gray'}>{c.activo ? 'Activo' : 'Inactivo'}</Badge>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" aria-label={`Precios de ${c.nombre_comercial}`} onClick={() => abrirPrecios(c)}>
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" aria-label={`Eliminar ${c.nombre_comercial}`} onClick={() => eliminar(c)}>
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

      {/* Nuevo cliente */}
      <Modal open={modalNuevo} title="Nuevo cliente" onClose={() => setModalNuevo(false)} footer={<>
        <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
        <Button onClick={crear} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
      </>}>
        <div className="space-y-3">
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <Input label="Nombre *" value={form.nombre_comercial} onChange={(e) => setForm({ ...form, nombre_comercial: e.target.value })} />
          <div className="flex gap-3">
            <div className="flex-1">
              <Input label="RIF/NIT" value={form.rut_nit} onChange={(e) => setForm({ ...form, rut_nit: e.target.value })} />
            </div>
            <div className="flex-1">
              <Input
                label="Días de crédito"
                type="number"
                min={0}
                value={form.dias_credito}
                onChange={(e) => setForm({ ...form, dias_credito: Number(e.target.value) })}
              />
            </div>
          </div>
          <Input
            label="Límite de crédito (US$)"
            prefix="$"
            value={form.limite_credito ? formatUsdCents(form.limite_credito) : ''}
            onChange={(e) => setForm({ ...form, limite_credito: parseCentsInput(e.target.value, 'usd') ?? 0 })}
          />
        </div>
      </Modal>

      {/* Precios especiales por cliente */}
      <Modal
        open={preciosDe != null}
        title={`Precios especiales — ${preciosDe?.nombre_comercial ?? ''}`}
        onClose={() => setPreciosDe(null)}
        footer={<>
          <Button variant="secondary" onClick={() => setPreciosDe(null)}>Cancelar</Button>
          <Button onClick={guardarPrecios} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
        </>}
      >
        <div className="space-y-3">
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <p className="text-xs text-gray-500">Deja vacío para usar el precio base. Los cambios aplican desde el punto de venta.</p>
          {productos.length === 0 ? (
            <p className="text-sm text-gray-500">No hay productos activos.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {productos.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">{p.nombre}</p>
                    <p className="text-xs text-gray-400">Base: {formatUsdCents(p.precio_base)}</p>
                  </div>
                  <Input
                    aria-label={`Precio especial de ${p.nombre}`}
                    prefix="$"
                    value={precios[p.id] ?? ''}
                    placeholder={formatUsdCents(p.precio_base)}
                    className="w-32"
                    onChange={(e) => setPrecios({ ...precios, [p.id]: e.target.value })}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  );
}