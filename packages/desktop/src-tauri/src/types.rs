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
    pub precio_mayoreo: i64,
    pub impuesto_porcentaje: f64,
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
    pub precio_mayoreo: i64,
    pub impuesto_porcentaje: f64,
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
}

/// Abono a cuenta de un cliente (sin vincular a una factura concreta).
#[derive(Deserialize)]
pub struct AbonoInput {
    pub empresa_id: i64,
    pub monto: i64,
    pub tipo_pago: String,
    pub moneda: String,
    pub numero_referencia: Option<String>,
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
    pub fecha_pago: Option<String>,
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
    pub efectivo_inicial_usd: i64,
    pub efectivo_inicial_ves: i64,
}

#[derive(Deserialize)]
pub struct CajaCerrarInput {
    pub caja_id: i64,
    pub operador_id: i64,
    pub efectivo_final_usd: i64,
    pub efectivo_final_ves: i64,
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
}

// ---- Reporte / config ----

#[derive(Serialize)]
pub struct ResumenDiaVenta {
    pub numero_factura: i64,
    pub cliente: String,
    pub tipo: String,
    pub monto: i64,
    pub estado: String,
    pub tasa_cambio: f64,
}

#[derive(Serialize)]
pub struct ResumenDia {
    pub producciones: Vec<MovimientoResumen>,
    pub ventas: Vec<ResumenDiaVenta>,
    pub pagos_efectivo_usd: i64,
    pub pagos_efectivo_ves: i64,
    pub deudores: Vec<EstadoCuenta>,
}

#[derive(Serialize)]
pub struct MovimientoResumen {
    pub producto: String,
    pub cantidad: f64,
    pub costo_unitario: i64,
}