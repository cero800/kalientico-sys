import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Search, ShoppingCart, Trash2, Users, X } from 'lucide-react';
import type { Empresa, Producto, Venta, VentaInput } from '@panaderia/core';
import { crearVenta, listarEmpresas, listarPreciosCliente, listarProductos, listarStock } from '../services/db';
import { useCarrito } from '../store/carrito';
import { useSesion } from '../store/sesion';
import { formatUsdCents, formatVesCents } from '../lib/format';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PageLoader } from '../components/ui/Spinner';
import { ProductoCard } from './venta/ProductoCard';
import CobroModal from './venta/CobroModal';

function esMostrador(e: Empresa) {
  return e.rut_nit === '0';
}

export default function VentaPage() {
  const tasa = useSesion((s) => s.tasa);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [stock, setStock] = useState<Record<number, number>>({});
  const [busqueda, setBusqueda] = useState('');
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [preciosEspeciales, setPreciosEspeciales] = useState<Record<number, number>>({});
  const [cargando, setCargando] = useState(true);
  const [cobroAbierto, setCobroAbierto] = useState(false);
  const [ultimaVenta, setUltimaVenta] = useState<Venta | null>(null);

  const lineas = useCarrito((s) => s.lineas);
  const agregar = useCarrito((s) => s.agregar);

  useEffect(() => {
    Promise.all([listarProductos(), listarEmpresas(), listarStock()])
      .then(([ps, es, ss]) => {
        setProductos(ps.filter((p) => p.activo));
        setEmpresas(es);
        const mostrador = es.find(esMostrador);
        setClienteId(mostrador?.id ?? es[0]?.id ?? null);
        setStock(Object.fromEntries(ss.map((s) => [s.producto_id, s.cantidad_disponible])));
      })
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (clienteId == null) return;
    listarPreciosCliente(clienteId)
      .then((precios) => {
        const mapa = Object.fromEntries(precios.map((p) => [p.producto_id, p.precio_especial]));
        setPreciosEspeciales(mapa);
        useCarrito.getState().aplicarPrecios(new Map(Object.entries(mapa).map(([k, v]) => [Number(k), v])));
      })
      .catch(() => setPreciosEspeciales({}));
  }, [clienteId]);

  const clienteActual = empresas.find((e) => e.id === clienteId) ?? null;
  const sePermiteCredito = clienteActual != null && !esMostrador(clienteActual);

  const efectivoDe = (p: Producto) => preciosEspeciales[p.id] ?? p.precio_base;

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter((p) => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q));
  }, [productos, busqueda]);

  const subtotal = useMemo(() => lineas.reduce((acc, l) => acc + Math.round(l.precio * l.cantidad), 0), [lineas]);

  const agregarProducto = (p: Producto) => {
    agregar({ producto_id: p.id, codigo: p.codigo, nombre: p.nombre, unidad: p.unidad_medida, precio: efectivoDe(p), cantidad: 1 });
  };

  const confirmarVenta = async (venta: VentaInput) => {
    const v = await crearVenta(venta);
    setUltimaVenta(v);
    useCarrito.getState().vaciar();
    setCobroAbierto(false);
  };

  if (cargando) return <PageLoader />;

  return (
    <div className="flex h-full gap-4">
      {/* Catálogo */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto por nombre o código…"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
          {busqueda && (
            <Button variant="ghost" size="sm" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {filtrados.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">Sin productos que coincidan.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
            {filtrados.map((p) => (
              <ProductoCard
                key={p.id}
                nombre={p.nombre}
                codigo={p.codigo}
                precio={efectivoDe(p)}
                stock={stock[p.id]}
                onAgregar={() => agregarProducto(p)}
                deshabilitado={(stock[p.id] ?? Infinity) <= 0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Carrito */}
      <Card className="flex w-80 shrink-0 flex-col">
        <CardHeader title="Carrito" subtitle={`Tasa ${formatVesCents(Math.round(tasa * 100))}`} />
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-3 pt-2">
            <label htmlFor="cliente-venta" className="mb-1 block text-xs font-medium text-gray-500">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" /> Cliente
              </span>
            </label>
            <select
              id="cliente-venta"
              value={clienteId ?? ''}
              onChange={(e) => setClienteId(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              {empresas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre_comercial}
                </option>
              ))}
            </select>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {lineas.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
                <ShoppingCart className="h-8 w-8" />
                <p className="text-sm">Agrega productos para comenzar</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {lineas.map((l) => (
                  <li key={l.producto_id} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800">{l.nombre}</p>
                      <p className="text-xs text-gray-500">
                        {formatUsdCents(l.precio)} × {l.cantidad}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        aria-label={`Menos ${l.nombre}`}
                        onClick={() => useCarrito.getState().setCantidad(l.producto_id, l.cantidad - 1)}
                        className="rounded-md border border-gray-200 p-1 text-gray-500 hover:bg-gray-50"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold">{l.cantidad}</span>
                      <button
                        aria-label={`Más ${l.nombre}`}
                        onClick={() => useCarrito.getState().setCantidad(l.producto_id, l.cantidad + 1)}
                        className="rounded-md border border-gray-200 p-1 text-gray-500 hover:bg-gray-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        aria-label={`Quitar ${l.nombre}`}
                        onClick={() => useCarrito.getState().quitar(l.producto_id)}
                        className="ml-1 rounded-md p-1 text-red-400 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <strong className="w-16 text-right text-sm">{formatUsdCents(Math.round(l.precio * l.cantidad))}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-100 px-3 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-gray-500">Total</span>
              <strong className="text-xl text-gray-900">{formatUsdCents(subtotal)}</strong>
            </div>
            <Button className="w-full" size="lg" disabled={lineas.length === 0} onClick={() => setCobroAbierto(true)}>
              Cobrar
            </Button>
          </div>
        </div>
      </Card>

      {clienteId != null && (
        <CobroModal
          abre={cobroAbierto}
          total={subtotal}
          clienteId={clienteId}
          sePermiteCredito={sePermiteCredito}
          onCerrar={() => setCobroAbierto(false)}
          onConfirmar={confirmarVenta}
        />
      )}

      {/* Éxito */}
      {ultimaVenta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
              <span aria-hidden="true">✓</span>
            </div>
            <h2 className="text-lg font-bold text-gray-900">Venta registrada</h2>
            <p className="mt-1 text-sm text-gray-500">
              Factura <strong>#{ultimaVenta.numero_factura}</strong> · total{' '}
              <strong>{formatUsdCents(ultimaVenta.total)}</strong>
            </p>
            <Button className="mt-4 w-full" onClick={() => setUltimaVenta(null)}>
              Aceptar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}