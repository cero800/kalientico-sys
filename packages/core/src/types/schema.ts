// Tipos compartidos — alineados con el esquema SQLite en Rust (src-tauri/src/types.rs).
// Los montos están en CENTAVOS de la moneda correspondiente (i64).
// Puede ser en US$ (base) o en Bs. La conversión usa la tasa de cambio
// `tasa_cambio` (Bs por 1 US$) congelada como snapshot por venta/pago/caja.

export type Moneda = 'usd' | 'ves';

export const MONEDAS: readonly Moneda[] = ['usd', 'ves'];

// Tipos de venta y pago (enumerados cerrados en el backend).
export type TipoVenta = 'contado' | 'credito';
export type TipoPago = 'efectivo' | 'transferencia' | 'cheque' | 'mixto';
export type Rol = 'admin' | 'cajero';
export type UnidadMedida = 'unidad' | 'kg' | 'paquete' | 'bandeja' | 'caja';
export type EstadoCaja = 'abierta' | 'cerrada';
export type EstadoVenta = 'entregada' | 'anulada';

//---------------------------------------------------------------------------
// Catálogo
//---------------------------------------------------------------------------

export interface Empresa {
  id: number;
  rut_nit: string;
  nombre_comercial: string;
  razon_social: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  dias_credito: number;
  limite_credito: number;
  activo: boolean;
  creado_en: string | null;
}

export interface EmpresaInput {
  rut_nit: string;
  nombre_comercial: string;
  razon_social?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  dias_credito: number;
  limite_credito: number;
  activo: boolean;
}

export interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  unidad_medida: UnidadMedida;
  precio_base: number;
  precio_mayoreo: number;
  impuesto_porcentaje: number;
  activo: boolean;
  creado_en: string | null;
}

export interface ProductoInput {
  codigo: string;
  nombre: string;
  descripcion?: string;
  unidad_medida: UnidadMedida;
  precio_base: number;
  precio_mayoreo: number;
  impuesto_porcentaje: number;
  activo: boolean;
}

export interface PrecioCliente {
  id: number;
  empresa_id: number;
  producto_id: number;
  precio_especial: number;
}

export interface PrecioClienteInput {
  empresa_id: number;
  producto_id: number;
  precio_especial: number;
}

//---------------------------------------------------------------------------
// Inventario
//---------------------------------------------------------------------------

export interface StockItem {
  producto_id: number;
  nombre: string;
  codigo: string;
  cantidad_disponible: number;
  unidad_medida: UnidadMedida;
}

//---------------------------------------------------------------------------
// Ventas
//---------------------------------------------------------------------------

export interface DetalleVentaInput {
  producto_id: number;
  cantidad: number;
}

export interface PagoInput {
  monto: number;
  tipo_pago: TipoPago;
  moneda: Moneda;
  numero_referencia?: string;
}

export interface VentaInput {
  empresa_id: number;
  tipo: TipoVenta;
  descuento: number;
  detalles: DetalleVentaInput[];
  pagos: PagoInput[];
  operador_id: number;
}

export interface Venta {
  id: number;
  empresa_id: number;
  numero_factura: number;
  tipo: TipoVenta;
  estado: EstadoVenta;
  fecha: string;
  subtotal: number;
  descuento: number;
  impuesto: number;
  total: number;
  operador_id: number;
  moneda: Moneda;
  tasa_cambio: number;
}

//---------------------------------------------------------------------------
// Pagos / Estado de cuenta
//---------------------------------------------------------------------------

export interface AbonoInput {
  empresa_id: number;
  monto: number;
  tipo_pago: TipoPago;
  moneda: Moneda;
  numero_referencia?: string;
  operador_id: number;
}

export interface EstadoCuenta {
  empresa_id: number;
  nombre_comercial: string;
  total_facturado: number;
  total_pagado: number;
  saldo_pendiente: number;
}

export interface PagoLinea {
  id: number;
  venta_id: number | null;
  numero_factura: number | null;
  monto: number;
  tipo_pago: TipoPago;
  moneda: Moneda;
  tasa_cambio: number;
  fecha_pago: string | null;
}

//---------------------------------------------------------------------------
// Usuarios
//---------------------------------------------------------------------------

export interface Usuario {
  id: number;
  nombre: string;
  rol: Rol;
  activo: boolean;
}

export interface UsuarioInput {
  nombre: string;
  rol: Rol;
  activo: boolean;
}

//---------------------------------------------------------------------------
// Caja (arqueo por moneda)
//---------------------------------------------------------------------------

export interface Caja {
  id: number;
  fecha: string;
  operador_id: number;
  operador_nombre: string;
  efectivo_inicial_usd: number;
  efectivo_inicial_ves: number;
  efectivo_ventas_usd: number;
  efectivo_ventas_ves: number;
  efectivo_egresos_usd: number;
  efectivo_egresos_ves: number;
  efectivo_final_usd: number;
  efectivo_final_ves: number;
  efectivo_esperado_usd: number;
  efectivo_esperado_ves: number;
  diferencia_usd: number;
  diferencia_ves: number;
  tasa_cierre: number;
  estado: EstadoCaja;
}

export interface CajaAbrirInput {
  operador_id: number;
  efectivo_inicial_usd: number;
  efectivo_inicial_ves: number;
}

export interface CajaCerrarInput {
  caja_id: number;
  operador_id: number;
  efectivo_final_usd: number;
  efectivo_final_ves: number;
  tasa_cierre: number;
}

//---------------------------------------------------------------------------
// Reporte
//---------------------------------------------------------------------------

export interface ResumenDiaVenta {
  numero_factura: number;
  cliente: string;
  tipo: TipoVenta;
  monto: number;
  estado: EstadoVenta;
  tasa_cambio: number;
}

export interface MovimientoResumen {
  producto: string;
  cantidad: number;
  costo_unitario: number;
}

export interface ResumenDia {
  producciones: MovimientoResumen[];
  ventas: ResumenDiaVenta[];
  pagos_efectivo_usd: number;
  pagos_efectivo_ves: number;
  deudores: EstadoCuenta[];
}