// Capa de acceso al backend Tauri. Los TIPOS no viven aquí: se comparten desde
// @panaderia/core (fuente única) y se re-exportan por comodidad.

import { invoke } from '@tauri-apps/api/core';
import { TASA_CAMBIO_KEY } from '@panaderia/core';
import type {
  AbonoInput,
  Caja,
  CajaAbrirInput,
  CajaCerrarInput,
  Empresa,
  EmpresaInput,
  EstadoCuenta,
  PagoLinea,
  PrecioCliente,
  PrecioClienteInput,
  Producto,
  ProductoInput,
  ResumenDia,
  StockItem,
  Usuario,
  UsuarioInput,
  Venta,
  VentaInput,
} from '@panaderia/core';

export type {
  AbonoInput,
  Caja,
  CajaAbrirInput,
  CajaCerrarInput,
  DetalleVentaInput,
  Empresa,
  EmpresaInput,
  EstadoCuenta,
  Moneda,
  MovimientoResumen,
  PagoInput,
  PagoLinea,
  PrecioCliente,
  PrecioClienteInput,
  Producto,
  ProductoInput,
  ResumenDia,
  ResumenDiaVenta,
  StockItem,
  UnidadMedida,
  Usuario,
  UsuarioInput,
  Venta,
  VentaInput,
} from '@panaderia/core';

// ============================================================
// Funciones de invocación
// ============================================================

// Catálogo
export const listarEmpresas = () => invoke<Empresa[]>('listar_empresas');
export const crearEmpresa = (empresa: EmpresaInput) => invoke<number>('crear_empresa', { empresa });
export const eliminarEmpresa = (id: number) => invoke('eliminar_empresa', { id });

export const listarProductos = () => invoke<Producto[]>('listar_productos');
export const crearProducto = (producto: ProductoInput) => invoke<number>('crear_producto', { producto });
export const actualizarProducto = (id: number, producto: ProductoInput) => invoke('actualizar_producto', { id, producto });
export const eliminarProducto = (id: number) => invoke('eliminar_producto', { id });

export const listarPreciosCliente = (empresa_id: number) => invoke<PrecioCliente[]>('listar_precios_cliente', { empresa_id });
export const setPrecioCliente = (precio: PrecioClienteInput) => invoke('set_precio_cliente', { precio });

// Usuarios
export const listarUsuarios = () => invoke<Usuario[]>('listar_usuarios');
export const crearUsuario = (usuario: UsuarioInput) => invoke<number>('crear_usuario', { usuario });

// Inventario
export const listarStock = () => invoke<StockItem[]>('listar_stock');
export const registrarProduccion = (args: { producto_id: number; cantidad: number; costo_unitario: number; operador_id: number; fecha: string }) =>
  invoke('registrar_produccion', args);
export const registrarMerma = (args: { producto_id: number; cantidad: number; motivo: string; operador_id: number }) =>
  invoke('registrar_merma', args);
export const registrarAjuste = (args: { producto_id: number; cantidad_delta: number; motivo: string; operador_id: number }) =>
  invoke('registrar_ajuste', args);

// Ventas
export const crearVenta = (venta: VentaInput) => invoke<Venta>('crear_venta', { venta });
export const listarVentas = () => invoke<Venta[]>('listar_ventas');
export const anularVenta = (args: { venta_id: number; motivo: string; operador_id: number }) =>
  invoke('anular_venta', args);

// Pagos / Estado de cuenta
export const estadoCuenta = (empresa_id: number) => invoke<EstadoCuenta>('estado_cuenta', { empresa_id });
export const estadoCuentaTodos = () => invoke<EstadoCuenta[]>('estado_cuenta_todos');
export const registrarAbono = (abono: AbonoInput) => invoke('registrar_abono', { abono });
export const historialPagos = (empresa_id: number) => invoke<PagoLinea[]>('historial_pagos', { empresa_id });

// Caja
export const cajaAbierta = () => invoke<Caja | null>('caja_abierta');
export const abrirCaja = (caja: CajaAbrirInput) => invoke<void>('abrir_caja', { caja });
export const cerrarCaja = (caja: CajaCerrarInput) => invoke('cerrar_caja', { caja });

// Reporte y config
export const resumenDia = (fecha?: string) => invoke<ResumenDia>('resumen_dia', { fecha: fecha ?? null });
export const getConfig = (clave: string) => invoke<string | null>('get_config', { clave });
export const setConfig = (clave: string, valor: string) => invoke('set_config', { clave, valor });

// Tasa de cambio (Bs por 1 US$) — conveniencia sobre get/setConfig.
export const getTasaCambio = async (): Promise<number> => {
  const valor = await getConfig(TASA_CAMBIO_KEY);
  const tasa = Number(valor);
  return Number.isFinite(tasa) && tasa > 0 ? tasa : 1;
};
export const setTasaCambio = (tasa: number) => setConfig(TASA_CAMBIO_KEY, String(tasa));