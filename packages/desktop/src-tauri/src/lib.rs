mod caja;
mod db;
mod factura;
mod pagos;
mod repo;
mod reporte;
mod types;
mod validators;
mod ventas;

#[cfg(test)]
pub(crate) mod testutil;

use crate::types::{
    AbonoInput, CajaAbrirInput, CajaCerrarInput, EmpresaInput,
    PrecioClienteInput, ProductoInput, UsuarioInput, VentaInput,
};
use db::Db;
use rusqlite::Connection;
use std::sync::{Mutex, MutexGuard};
use tauri::{Manager, State};

fn open_database(app: &tauri::App) -> Result<Connection, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No se pudo obtener el directorio de datos: {e}"))?;
    let db_path = dir.join("panaderia.db");
    // Dev: recrear si el esquema cambió. Producción: migrar sin borrar.
    let recrear_si_desactualizada = true;
    db::open(db_path, recrear_si_desactualizada).map_err(|e| e.to_string())
}

fn lock<'a>(db: &'a Db) -> Result<MutexGuard<'a, Connection>, String> {
    db.0.lock().map_err(|e| e.to_string())
}

//---------------------------------------------------------------------------
// Comandos — Catálogo
//---------------------------------------------------------------------------

#[tauri::command]
fn listar_empresas(state: State<'_, Db>) -> Result<Vec<types::Empresa>, String> {
    repo::listar_empresas(&*lock(&state)?)
}

#[tauri::command]
fn crear_empresa(state: State<'_, Db>, empresa: EmpresaInput) -> Result<i64, String> {
    repo::crear_empresa(&*lock(&state)?, &empresa)
}

#[tauri::command]
fn eliminar_empresa(state: State<'_, Db>, id: i64) -> Result<(), String> {
    repo::eliminar_empresa(&*lock(&state)?, id)
}

#[tauri::command]
fn listar_productos(state: State<'_, Db>) -> Result<Vec<types::Producto>, String> {
    repo::listar_productos(&*lock(&state)?)
}

#[tauri::command]
fn crear_producto(state: State<'_, Db>, producto: ProductoInput) -> Result<i64, String> {
    repo::crear_producto(&*lock(&state)?, &producto)
}

#[tauri::command]
fn actualizar_producto(state: State<'_, Db>, id: i64, producto: ProductoInput) -> Result<(), String> {
    repo::actualizar_producto(&*lock(&state)?, id, &producto)
}

#[tauri::command]
fn eliminar_producto(state: State<'_, Db>, id: i64) -> Result<(), String> {
    repo::eliminar_producto(&*lock(&state)?, id)
}

#[tauri::command(rename_all = "snake_case")]
fn listar_precios_cliente(state: State<'_, Db>, empresa_id: i64) -> Result<Vec<types::PrecioCliente>, String> {
    repo::listar_precios_cliente(&*lock(&state)?, empresa_id)
}

#[tauri::command]
fn set_precio_cliente(state: State<'_, Db>, precio: PrecioClienteInput) -> Result<(), String> {
    repo::set_precio_cliente(&*lock(&state)?, &precio)
}

//---------------------------------------------------------------------------
// Comandos — Usuarios
//---------------------------------------------------------------------------

#[tauri::command]
fn listar_usuarios(state: State<'_, Db>) -> Result<Vec<types::Usuario>, String> {
    repo::listar_usuarios(&*lock(&state)?)
}

#[tauri::command]
fn crear_usuario(state: State<'_, Db>, usuario: UsuarioInput) -> Result<i64, String> {
    repo::crear_usuario(&*lock(&state)?, &usuario)
}

//---------------------------------------------------------------------------
// Comandos — Inventario
//---------------------------------------------------------------------------

#[tauri::command]
fn listar_stock(state: State<'_, Db>) -> Result<Vec<types::StockItem>, String> {
    repo::listar_stock(&*lock(&state)?)
}

#[tauri::command(rename_all = "snake_case")]
fn registrar_produccion(
    state: State<'_, Db>,
    producto_id: i64,
    cantidad: f64,
    costo_unitario: i64,
    operador_id: i64,
    fecha: String,
) -> Result<(), String> {
    let mut conn = lock(&state)?;
    repo::registrar_produccion(&mut conn, producto_id, cantidad, costo_unitario, operador_id, &fecha)
}

#[tauri::command(rename_all = "snake_case")]
fn registrar_merma(
    state: State<'_, Db>,
    producto_id: i64,
    cantidad: f64,
    motivo: String,
    operador_id: i64,
) -> Result<(), String> {
    let mut conn = lock(&state)?;
    repo::registrar_merma(&mut conn, producto_id, cantidad, &motivo, operador_id)
}

#[tauri::command(rename_all = "snake_case")]
fn registrar_ajuste(
    state: State<'_, Db>,
    producto_id: i64,
    cantidad_delta: f64,
    motivo: String,
    operador_id: i64,
) -> Result<(), String> {
    let mut conn = lock(&state)?;
    repo::registrar_ajuste(&mut conn, producto_id, cantidad_delta, &motivo, operador_id)
}

//---------------------------------------------------------------------------
// Comandos — Ventas
//---------------------------------------------------------------------------

#[tauri::command]
fn crear_venta(state: State<'_, Db>, venta: VentaInput) -> Result<types::Venta, String> {
    let mut conn = lock(&state)?;
    ventas::crear_venta(&mut conn, &venta)
}

#[tauri::command]
fn listar_ventas(state: State<'_, Db>) -> Result<Vec<types::Venta>, String> {
    ventas::listar_ventas(&*lock(&state)?)
}

#[tauri::command(rename_all = "snake_case")]
fn anular_venta(state: State<'_, Db>, venta_id: i64, motivo: String, operador_id: i64) -> Result<(), String> {
    let mut conn = lock(&state)?;
    ventas::anular_venta(&mut conn, venta_id, &motivo, operador_id)
}

//---------------------------------------------------------------------------
// Comandos — Pagos y estado de cuenta
//---------------------------------------------------------------------------

#[tauri::command(rename_all = "snake_case")]
fn estado_cuenta(state: State<'_, Db>, empresa_id: i64) -> Result<types::EstadoCuenta, String> {
    pagos::estado_cuenta(&*lock(&state)?, empresa_id)
}

#[tauri::command]
fn estado_cuenta_todos(state: State<'_, Db>) -> Result<Vec<types::EstadoCuenta>, String> {
    pagos::estado_cuenta_todos(&*lock(&state)?)
}

#[tauri::command]
fn registrar_abono(state: State<'_, Db>, abono: AbonoInput) -> Result<(), String> {
    pagos::registrar_abono(&*lock(&state)?, &abono)
}

#[tauri::command(rename_all = "snake_case")]
fn historial_pagos(state: State<'_, Db>, empresa_id: i64) -> Result<Vec<types::PagoLinea>, String> {
    pagos::historial_pagos(&*lock(&state)?, empresa_id)
}

//---------------------------------------------------------------------------
// Comandos — Caja
//---------------------------------------------------------------------------

#[tauri::command]
fn caja_abierta(state: State<'_, Db>) -> Result<Option<types::Caja>, String> {
    caja::caja_abierta(&*lock(&state)?)
}

#[tauri::command]
fn abrir_caja(state: State<'_, Db>, caja: CajaAbrirInput) -> Result<(), String> {
    caja::abrir_caja(&*lock(&state)?, &caja)
}

#[tauri::command]
fn cerrar_caja(state: State<'_, Db>, caja: CajaCerrarInput) -> Result<types::CierreDia, String> {
    caja::cerrar_caja(&*lock(&state)?, &caja)
}

//---------------------------------------------------------------------------
// Comandos — Reporte y configuración
//---------------------------------------------------------------------------

#[tauri::command]
fn resumen_dia(state: State<'_, Db>, fecha: Option<String>) -> Result<types::ResumenDia, String> {
    reporte::resumen_dia(&*lock(&state)?, fecha.as_deref())
}

#[tauri::command]
fn get_config(state: State<'_, Db>, clave: String) -> Result<Option<String>, String> {
    reporte::get_config(&*lock(&state)?, &clave)
}

#[tauri::command]
fn set_config(state: State<'_, Db>, clave: String, valor: String) -> Result<(), String> {
    reporte::set_config(&*lock(&state)?, &clave, &valor)
}

#[tauri::command]
fn obtener_factura(state: State<'_, Db>, venta_id: i64) -> Result<types::Factura, String> {
    factura::factura_venta(&*lock(&state)?, venta_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let conn = open_database(app)?;
            repo::seed_usuario_admin(&conn)?;
            repo::seed_cliente_mostrador(&conn)?;
            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            listar_empresas,
            crear_empresa,
            eliminar_empresa,
            listar_productos,
            crear_producto,
            actualizar_producto,
            eliminar_producto,
            listar_precios_cliente,
            set_precio_cliente,
            listar_usuarios,
            crear_usuario,
            listar_stock,
            registrar_produccion,
            registrar_merma,
            registrar_ajuste,
            crear_venta,
            listar_ventas,
            anular_venta,
            estado_cuenta,
            estado_cuenta_todos,
            registrar_abono,
            historial_pagos,
            caja_abierta,
            abrir_caja,
            cerrar_caja,
            resumen_dia,
            get_config,
            set_config,
            obtener_factura,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar la app Tauri");
}