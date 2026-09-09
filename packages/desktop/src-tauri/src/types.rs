// Tipos de dominio. Todos los montos están expresados en CENTAVOS de su moneda (i64).
// La moneda base de precios es US$; los pagos/cajas pueden ser US$ o Bs.
// `tasa_cambio` = Bs por 1 US$.

use serde::{Deserialize, Serialize};

//---------------------------------------------------------------------------
// Catálogo
//---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct Empresa {
    pub id: i64,
    pub rut_nit: String,
    pub nombre_comercial: String,
    pub razon_social: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub dias_credito: i64,
    pub limite_credito: i64,
    pub activo: bool,
    pub creado_en: Option<String>,
}

#[derive(Deserialize)]
pub struct EmpresaInput {
    pub rut_nit: String,
    pub nombre_comercial: String,
    pub razon_social: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub dias_credito: i64,
    pub limite_credito: i64,
    pub activo: bool,
}

#[derive(Serialize)]
pub struct Producto {
    pub id: i64,
    pub codigo: String,
    pub nombre: String,
    pub descripcion: Option<String>,
    pub unidad_medida: String,
    pub precio_base: i64,
    pub activo: bool,
    pub creado_en: Option<String>,
}

#[derive(Deserialize)]
pub struct ProductoInput {
    pub codigo: String,
    pub nombre: String,
    pub descripcion: Option<String>,
    pub unidad_medida: String,
    pub precio_base: i64,
    pub activo: bool,
}

#[derive(Serialize)]
pub struct PrecioCliente {
    pub id: i64,
    pub empresa_id: i64,
    pub producto_id: i64,
    pub precio_especial: i64,
}

#[derive(Deserialize)]
pub struct PrecioClienteInput {
    pub empresa_id: i64,
    pub producto_id: i64,
    pub precio_especial: i64,
}

// ---- Inventario ----

#[derive(Serialize)]
pub struct StockItem {
    pub producto_id: i64,
    pub nombre: String,
    pub codigo: String,
    pub cantidad_disponible: f64,
    pub unidad_medida: String,
}

// ---- Ventas ----
// El total de la venta siempre se registra en US$ (moneda base);
// `moneda` y `tasa_cambio` (snapshot) permiten mostrar el equivalente en Bs.

#[derive(Serialize, Debug)]
pub struct Venta {
    pub id: i64,
    pub empresa_id: i64,
    pub numero_factura: i64,
    pub tipo: String,
    pub estado: String,
    pub fecha: String,
    pub subtotal: i64,
    pub descuento: i64,
    pub impuesto: i64,
    pub total: i64,
    pub operador_id: i64,
    pub moneda: String,
    pub tasa_cambio: f64,
}

#[derive(Deserialize)]
pub struct DetalleVentaInput {
    pub producto_id: i64,
    pub cantidad: f64,
}

#[derive(Deserialize)]
pub struct VentaInput {
    pub empresa_id: i64,
    pub tipo: String, // contado | credito
    pub descuento: i64,
    pub detalles: Vec<DetalleVentaInput>,
    pub pagos: Vec<PagoInput>, // en contado normalmente 1
    pub operador_id: i64,
}

// ---- Pagos ----
// Cada pago lleva su propia moneda (usd | ves) → permite cobros mixtos.
// `tasa_cambio` es el snapshot del día al momento de registrar el pago.

#[derive(Deserialize)]
pub struct PagoInput {
    pub monto: i64,
    pub tipo_pago: String,
    pub moneda: String,
    pub numero_referencia: Option<String>,
}

#[derive(Serialize)]
pub struct EstadoCuenta {
    pub empresa_id: i64,
    pub nombre_comercial: String,
    pub total_facturado: i64,
    pub total_pagado: i64,
    pub saldo_pendiente: i64,
    /// Parte del saldo cuya fecha límite de pago ya venció (días naturales).
    pub total_vencido: i64,
    /// Resto del saldo aún dentro del plazo (`saldo_pendiente - total_vencido`).
    pub total_al_dia: i64,
    /// Plazo en días que el cliente tiene para pagar sus ventas a crédito (0 = al contado).
    pub dias_credito: i64,
}

/// Abono a cuenta de un cliente (sin vincular a una factura concreta).
/// Admite varios pagos (mixtos) que en conjunto no superan el saldo pendiente.
#[derive(Deserialize)]
pub struct AbonoInput {
    pub empresa_id: i64,
    pub pagos: Vec<PagoInput>,
    pub operador_id: i64,
}

/// Una línea del historial de pagos de una empresa.
#[derive(Serialize)]
pub struct PagoLinea {
    pub id: i64,
    pub venta_id: Option<i64>,
    pub numero_factura: Option<i64>,
    pub monto: i64,
    pub tipo_pago: String,
    pub moneda: String,
    pub tasa_cambio: f64,
    pub numero_referencia: Option<String>,
    pub fecha_pago: Option<String>,
}

// ---- Devoluciones ----
// Ajuste por panes deteriorados/extraviados devueltos por el cliente. Resta del
// total facturado de la empresa (baja el saldo si hay deuda); no toca stock ni caja.

/// Línea de detalle que el usuario elige devolver (solo los productos con
/// cantidad > 0 van en el detalle enviado).
#[derive(Deserialize, Clone)]
pub struct DetalleDevolucionInput {
    pub producto_id: i64,
    pub cantidad: f64,
    pub precio_unitario: i64, // centavos US$ (lo que se facturo en la venta)
}

/// Input para registrar una devolución vinculada a una factura concreta.
/// `detalle` (opcional por compatibilidad) identifica qué productos/cantidades
/// se devolvieron; si viene, la suma de subtotales debe igualar `monto`.
#[derive(Deserialize, Clone)]
pub struct DevolucionInput {
    pub empresa_id: i64,
    pub venta_id: i64,
    pub monto: i64, // centavos US$
    pub motivo: Option<String>,
    pub operador_id: i64,
    pub detalle: Option<Vec<DetalleDevolucionInput>>,
}

/// Producto devuelto dentro de una devolución.
#[derive(Serialize, Debug, PartialEq)]
pub struct DetalleDevolucion {
    pub producto_id: i64,
    pub nombre: String,
    pub cantidad: f64,
    pub precio_unitario: i64,
    pub subtotal: i64,
}

/// Devolución registrada (para el historial, junto con sus productos).
#[derive(Serialize, Debug)]
pub struct Devolucion {
    pub id: i64,
    pub empresa_id: i64,
    pub venta_id: i64,
    pub numero_factura: i64,
    pub monto: i64,
    pub motivo: Option<String>,
    pub operador_id: i64,
    pub fecha_devolucion: Option<String>,
    pub detalle: Vec<DetalleDevolucion>,
}

/// Una factura entregada con lo ya devuelto, para saber cuánto queda por devolver.
#[derive(Serialize)]
pub struct VentaDevolucion {
    pub venta_id: i64,
    pub numero_factura: i64,
    pub tipo: String,
    pub fecha: String,
    pub total: i64,
    pub devuelto: i64,
}

/// Línea del detalle de una venta para el modal de devolución.
#[derive(Serialize)]
pub struct DetalleVentaDevolucion {
    pub producto_id: i64,
    pub nombre: String,
    pub cantidad: f64,
    pub precio_unitario: i64,
    pub subtotal: i64,
}

// ---- Caja ----
// Arqueo por moneda: cada caja registra efectivo US$ y Bs por separado.
// La diferencia es siempre derivada (final - esperado) por moneda.

#[derive(Serialize)]
pub struct Caja {
    pub id: i64,
    pub fecha: String,
    pub operador_id: i64,
    pub operador_nombre: String,
    pub efectivo_inicial_usd: i64,
    pub efectivo_inicial_ves: i64,
    pub efectivo_ventas_usd: i64,
    pub efectivo_ventas_ves: i64,
    pub efectivo_egresos_usd: i64,
    pub efectivo_egresos_ves: i64,
    pub efectivo_final_usd: i64,
    pub efectivo_final_ves: i64,
    pub efectivo_esperado_usd: i64,
    pub efectivo_esperado_ves: i64,
    pub diferencia_usd: i64,
    pub diferencia_ves: i64,
    pub tasa_cierre: f64,
    pub estado: String,
}

#[derive(Deserialize)]
pub struct CajaAbrirInput {
    pub operador_id: i64,
}

#[derive(Deserialize)]
pub struct CajaCerrarInput {
    pub caja_id: i64,
    pub operador_id: i64,
    pub tasa_cierre: f64,
}

// ---- Usuarios ----

#[derive(Serialize)]
pub struct Usuario {
    pub id: i64,
    pub nombre: String,
    pub rol: String,
    pub activo: bool,
}

#[derive(Deserialize)]
pub struct UsuarioInput {
    pub nombre: String,
    pub rol: String,
    pub activo: bool,
    pub pin: Option<String>,
}

/// Datos del primer arranque: crear/ajustar el administrador y su PIN.
#[derive(Deserialize)]
pub struct ConfigurarAdminInput {
    pub nombre: String,
    pub pin: String,
}

/// Información de una copia de seguridad de la base de datos.
#[derive(Serialize)]
pub struct BackupItem {
    pub nombre: String,
    pub ruta: String,
    pub tamano_bytes: u64,
    pub fecha: String,
}

// ---- Reporte / config ----

#[derive(Serialize, Debug)]
pub struct ResumenDiaVenta {
    pub venta_id: i64,
    pub numero_factura: i64,
    pub cliente: String,
    pub tipo: String,
    pub monto: i64,
    pub devuelto: i64,
    pub estado: String,
    pub tasa_cambio: f64,
}

/// Devolución registrada durante el día (panes deteriorados/extraviados),
/// con el detalle de los productos devueltos.
#[derive(Serialize, Debug, PartialEq)]
pub struct ResumenDiaDevolucion {
    pub id: i64,
    pub venta_id: i64,
    pub numero_factura: i64,
    pub cliente: String,
    pub monto: i64,
    pub motivo: Option<String>,
    pub operador_nombre: String,
    pub fecha_devolucion: String,
    pub detalle: Vec<DetalleDevolucion>,
}

#[derive(Serialize)]
pub struct ResumenDia {
    pub producciones: Vec<MovimientoResumen>,
    pub ventas: Vec<ResumenDiaVenta>,
    pub pagos_efectivo_usd: i64,
    pub pagos_efectivo_ves: i64,
    pub devoluciones: Vec<ResumenDiaDevolucion>,
    pub deudores: Vec<EstadoCuenta>,
}

#[derive(Serialize)]
pub struct MovimientoResumen {
    pub producto: String,
    pub cantidad: f64,
    pub costo_unitario: i64,
}

// ---- Factura (comprobante imprimible) ----

#[derive(Serialize)]
pub struct FacturaDetalle {
    pub producto: String,
    pub cantidad: f64,
    pub precio_unitario: i64,
    pub subtotal: i64,
}

#[derive(Serialize)]
pub struct FacturaPago {
    pub tipo_pago: String,
    pub moneda: String,
    pub monto: i64,
    pub numero_referencia: Option<String>,
}

/// Factura completa de una venta: cabecera + cliente + detalle + pagos +
/// devoluciones registradas (qué se devolvió y cuánto — "cómo quedó la venta")
/// + datos del negocio emisor (desde `config`) para el comprobante imprimible.
#[derive(Serialize)]
pub struct Factura {
    pub venta_id: i64,
    pub numero_factura: i64,
    pub tipo: String,
    pub estado: String,
    pub fecha: String,
    pub cliente: String,
    pub cliente_rif: String,
    pub negocio_nombre: String,
    pub negocio_rif: String,
    pub negocio_telefono: String,
    pub negocio_direccion: String,
    pub subtotal: i64,
    pub descuento: i64,
    pub impuesto: i64,
    pub total: i64,
    pub tasa_cambio: f64,
    pub detalle: Vec<FacturaDetalle>,
    pub pagos: Vec<FacturaPago>,
    pub devoluciones: Vec<ResumenDiaDevolucion>,
}

// ---- Cierre de caja (comprobante del día) ----

/// Abono a cuenta registrado durante el día (venta_id nulo).
#[derive(Serialize, Debug)]
pub struct CierreAbono {
    pub empresa_id: i64,
    pub cliente: String,
    pub tipo_pago: String,
    pub moneda: String,
    pub monto: i64,
    pub tasa_cambio: f64,
    pub fecha_pago: String,
}

/// Comprobante que se imprime al cerrar la caja: la cuenta del día con todas
/// las ventas, los abonos y el efectivo esperado por moneda.
#[derive(Serialize, Debug)]
pub struct CierreDia {
    pub caja_id: i64,
    pub fecha: String,
    pub operador_nombre: String,
    pub negocio_nombre: String,
    pub negocio_rif: String,
    pub negocio_telefono: String,
    pub negocio_direccion: String,
    pub efectivo_inicial_usd: i64,
    pub efectivo_inicial_ves: i64,
    pub efectivo_ventas_usd: i64,
    pub efectivo_ventas_ves: i64,
    pub abonos_efectivo_usd: i64,
    pub abonos_efectivo_ves: i64,
    pub efectivo_esperado_usd: i64,
    pub efectivo_esperado_ves: i64,
    pub ventas: Vec<ResumenDiaVenta>,
    pub abonos: Vec<CierreAbono>,
    pub devoluciones: Vec<ResumenDiaDevolucion>,
    pub total_ventas_usd: i64,
    pub total_ventas_bs: i64,
    pub total_abonos_usd: i64,
    pub total_abonos_bs: i64,
    pub total_devoluciones_usd: i64,
    pub total_devoluciones_bs: i64,
    pub tasa_cierre: f64,
}
