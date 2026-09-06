mod backup;
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
    AbonoInput, CajaAbrirInput, CajaCerrarInput, ConfigurarAdminInput, EmpresaInput,
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
    // Solo en desarrollo se recrea la BD si el esquema cambió; en un build de
    // release NUNCA se destruye la base (aviso de pérdida de datos).
    let recrear_si_desactualizada = cfg!(debug_assertions);
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
fn actualizar_producto(
    state: State<'_, Db>,
    id: i64,
    producto: ProductoInput,
) -> Result<(), String> {
    repo::actualizar_producto(&*lock(&state)?, id, &producto)
}

#[tauri::command]
fn eliminar_producto(state: State<'_, Db>, id: i64) -> Result<(), String> {
    repo::eliminar_producto(&*lock(&state)?, id)
}

#[tauri::command(rename_all = "snake_case")]
fn listar_precios_cliente(
    state: State<'_, Db>,
    empresa_id: i64,
) -> Result<Vec<types::PrecioCliente>, String> {
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

#[tauri::command]
fn verificar_pin(state: State<'_, Db>, usuario_id: i64, pin: String) -> Result<bool, String> {
    repo::verificar_pin(&*lock(&state)?, usuario_id, &pin)
}

#[tauri::command(rename_all = "snake_case")]
fn cambiar_pin(
    state: State<'_, Db>,
    usuario_id: i64,
    pin_actual: String,
    pin_nuevo: String,
) -> Result<(), String> {
    repo::cambiar_pin(&*lock(&state)?, usuario_id, &pin_actual, &pin_nuevo)
}

/// Primer arranque: true si falta crear/ajustar el administrador con su PIN.
#[tauri::command]
fn necesita_configuracion(state: State<'_, Db>) -> Result<bool, String> {
    repo::necesita_configuracion(&*lock(&state)?)
}

/// Primer arranque: crea/ajusta el administrador y su PIN desde `/setup`.
#[tauri::command]
fn configurar_admin(state: State<'_, Db>, admin: ConfigurarAdminInput) -> Result<(), String> {
    repo::configurar_admin(&*lock(&state)?, &admin.nombre, &admin.pin)
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
    repo::registrar_produccion(
        &mut conn,
        producto_id,
        cantidad,
        costo_unitario,
        operador_id,
        &fecha,
    )
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
fn anular_venta(
    state: State<'_, Db>,
    venta_id: i64,
    motivo: String,
    operador_id: i64,
) -> Result<(), String> {
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

/// Guarda un PDF en `Documentos/kalientico/facturas/` (o en los datos de la app
/// si no hay carpeta Documentos) y devuelve la ruta completa del archivo.
#[tauri::command]
fn guardar_factura_pdf(
    app: tauri::AppHandle,
    nombre_archivo: String,
    contenido_b64: String,
) -> Result<String, String> {
    use base64::engine::general_purpose::STANDARD as B64;
    use base64::Engine as _;
    use std::io::Write;

    let bytes = B64
        .decode(contenido_b64.trim())
        .map_err(|e| format!("Contenido PDF inválido: {e}"))?;

    // Saneamiento del nombre: solo alfanuméricos, guiones, guion bajo y punto.
    let nombre: String = nombre_archivo
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if nombre.trim().is_empty() {
        return Err("Nombre de archivo vacío".to_string());
    }

    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("No se pudo obtener el directorio de documentos: {e}"))?;
    let dir = base.join("kalientico").join("facturas");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("No se pudo crear la carpeta de facturas: {e}"))?;
    let ruta = dir.join(nombre);
    let mut archivo =
        std::fs::File::create(&ruta).map_err(|e| format!("No se pudo crear el archivo: {e}"))?;
    archivo
        .write_all(&bytes)
        .map_err(|e| format!("No se pudo escribir el archivo: {e}"))?;
    Ok(ruta.to_string_lossy().to_string())
}

#[tauri::command]
fn crear_backup(state: State<'_, Db>, app: tauri::AppHandle) -> Result<types::BackupItem, String> {
    let item = backup::crear_backup(&*lock(&state)?, &app)?;
    Ok(item)
}

#[tauri::command]
fn listar_backups(app: tauri::AppHandle) -> Result<Vec<types::BackupItem>, String> {
    backup::listar_backups(&app)
}

#[tauri::command]
fn eliminar_backup(app: tauri::AppHandle, nombre_archivo: String) -> Result<(), String> {
    backup::eliminar_backup(&app, &nombre_archivo)
}

/// Registra un error del frontend en `app_data/errores.log` (una línea por
/// error, con fecha UTC) para diagnóstico sin consola.
#[tauri::command]
fn log_error(app: tauri::AppHandle, origen: String, mensaje: String) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::io::Write;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No se pudo obtener la carpeta de datos: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let ruta = dir.join("errores.log");

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut archivo = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&ruta)
        .map_err(|e| format!("No se pudo abrir el log: {e}"))?;
    let linea = format!("{ts} [{origen}] {mensaje}\n");
    archivo
        .write_all(linea.as_bytes())
        .map_err(|e| format!("No se pudo escribir el log: {e}"))?;
    Ok(())
}

/// Registra un evento de la interfaz (montaje, login, navegación) en
/// `app_data/traza.log` para trazar en qué punto se queda colgada la app.
#[tauri::command]
fn log_evento(app: tauri::AppHandle, origen: String, mensaje: String) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::io::Write;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No se pudo obtener la carpeta de datos: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let ruta = dir.join("traza.log");

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let mut archivo = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&ruta)
        .map_err(|e| format!("No se pudo abrir la traza: {e}"))?;
    let linea = format!("{ts} [{origen}] {mensaje}\n");
    archivo
        .write_all(linea.as_bytes())
        .map_err(|e| format!("No se pudo escribir la traza: {e}"))?;
    Ok(())
}

/// Guarda un reporte XML/XLSX en `Documentos/kalientico/excel/` (o app-data si
/// no hay carpeta Documentos) y devuelve la ruta completa del archivo.
#[tauri::command]
fn guardar_reporte_excel(
    app: tauri::AppHandle,
    nombre_archivo: String,
    contenido_b64: String,
) -> Result<String, String> {
    use base64::engine::general_purpose::STANDARD as B64;
    use base64::Engine as _;
    use std::io::Write;

    let bytes = B64
        .decode(contenido_b64.trim())
        .map_err(|e| format!("Contenido del reporte inválido: {e}"))?;

    // Saneamiento del nombre: solo alfanuméricos, guiones, guion bajo y punto.
    let nombre: String = nombre_archivo
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if nombre.trim().is_empty() {
        return Err("Nombre de archivo vacío".to_string());
    }

    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("No se pudo obtener el directorio de documentos: {e}"))?;
    let dir = base.join("kalientico").join("excel");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("No se pudo crear la carpeta de reportes: {e}"))?;
    let ruta = dir.join(nombre);
    let mut archivo =
        std::fs::File::create(&ruta).map_err(|e| format!("No se pudo crear el archivo: {e}"))?;
    archivo
        .write_all(&bytes)
        .map_err(|e| format!("No se pudo escribir el archivo: {e}"))?;
    Ok(ruta.to_string_lossy().to_string())
}

/// Registra el mensaje de cualquier `panic` del lado Rust en un archivo de
/// texto, porque el release oculta la consola y los crashes se quedan sin
/// pista. La ruta es `%TEMP%\kalientico-panic.log` (Windows) o `/tmp/...`.
fn setup_panic_log() {
    use std::io::Write;
    let ruta = std::env::temp_dir().join("kalientico-panic.log");
    std::panic::set_hook(Box::new(move |info| {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let linea = format!("=== {ts} ===\n{info}\n");
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&ruta)
        {
            let _ = writeln!(f, "{linea}");
        }
    }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    setup_panic_log();
    tauri::Builder::default()
        .setup(|app| {
            let conn = open_database(app)?;
            repo::seed_usuario_admin(&conn)?;
            repo::seed_cliente_mostrador(&conn)?;
            // Backup automático: uno por día, no estorba si ya existe.
            if !backup::hay_backup_hoy(app.handle()).unwrap_or(false) {
                let _ = backup::crear_backup(&conn, app.handle());
            }
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
            verificar_pin,
            cambiar_pin,
            necesita_configuracion,
            configurar_admin,
            crear_backup,
            listar_backups,
            eliminar_backup,
            log_error,
            log_evento,
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
            guardar_factura_pdf,
            guardar_reporte_excel,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar la app Tauri");
}
