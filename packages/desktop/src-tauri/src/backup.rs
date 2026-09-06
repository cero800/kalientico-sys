// Copias de seguridad de la base de datos.
//
// Se guardan como copias del archivo `panaderia.db` en
// `Documentos/kalientico/backups/` (o en app-data si no hay carpeta
// Documentos), con nombre `panaderia-YYYY-MM-DD-HHMMSS.db`.

use crate::types::BackupItem;
use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

/// Número máximo de backups conservados (los más nuevos); los más viejos se purgan.
const RETENCION: usize = 30;

/// Carpeta donde se guardan las copias de seguridad.
pub fn carpeta_backups(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("No se pudo obtener el directorio de documentos: {e}"))?;
    let dir = base.join("kalientico").join("backups");
    fs::create_dir_all(&dir).map_err(|e| format!("No se pudo crear la carpeta de backups: {e}"))?;
    Ok(dir)
}

/// Ruta de la base de datos en ejecución.
fn path_bd(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("panaderia.db"))
        .map_err(|e| format!("No se pudo obtener la carpeta de datos: {e}"))
}

/// Crea una copia de seguridad y devuelve la información del archivo creado.
pub fn crear_backup(conn: &Connection, app: &tauri::AppHandle) -> Result<BackupItem, String> {
    // Vuelca el WAL al archivo .db para que la copia incluya todo.
    conn.execute_batch("PRAGMA wal_checkpoint(FULL);")
        .map_err(|e| format!("No se pudo sincronizar la base de datos: {e}"))?;
    let origen = path_bd(app)?;
    if !origen.exists() {
        return Err("No se encontró la base de datos".to_string());
    }
    let nombre = format!("panaderia-{}.db", fecha_hora_utc());
    let destino = carpeta_backups(app)?.join(&nombre);
    fs::copy(&origen, &destino).map_err(|e| format!("No se pudo copiar la base de datos: {e}"))?;
    let item = item_desde(destino)?;
    purgar(app, RETENCION)?;
    Ok(item)
}

/// Lista las copias de seguridad existentes, de la más nueva a la más vieja.
pub fn listar_backups(app: &tauri::AppHandle) -> Result<Vec<BackupItem>, String> {
    let dir = carpeta_backups(app)?;
    let mut items = Vec::new();
    for entrada in
        fs::read_dir(&dir).map_err(|e| format!("No se pudo leer la carpeta de backups: {e}"))?
    {
        let entrada = entrada.map_err(|e| e.to_string())?;
        if entrada.path().is_file() {
            if let Ok(item) = item_desde(entrada.path()) {
                items.push(item);
            }
        }
    }
    items.sort_by(|a, b| b.nombre.cmp(&a.nombre));
    Ok(items)
}

/// Elimina una copia de seguridad por su nombre de archivo.
pub fn eliminar_backup(app: &tauri::AppHandle, nombre: &str) -> Result<(), String> {
    let nombre = PathBuf::from(nombre);
    if nombre.components().count() != 1 || nombre.extension().is_some_and(|e| e != "db") {
        return Err("Nombre de backup inválido".to_string());
    }
    let ruta = carpeta_backups(app)?.join(&nombre);
    fs::remove_file(&ruta).map_err(|e| format!("No se pudo eliminar el backup: {e}"))
}

/// Indica si ya existe al menos un backup con la fecha de hoy.
pub fn hay_backup_hoy(app: &tauri::AppHandle) -> Result<bool, String> {
    let prefijo = format!("panaderia-{}-", fecha_hm());
    Ok(listar_backups(app)?
        .iter()
        .any(|b| b.nombre.starts_with(&prefijo)))
}

/// Purga los backups más viejos dejando solo los `conservar` más recientes.
pub fn purgar(app: &tauri::AppHandle, conservar: usize) -> Result<(), String> {
    let items = listar_backups(app)?;
    for item in items.into_iter().skip(conservar) {
        let _ = fs::remove_file(&item.ruta);
    }
    Ok(())
}

/// Convierte una ruta en la información del backup (nombre, tamaño, fecha).
fn item_desde(ruta: PathBuf) -> Result<BackupItem, String> {
    let meta = fs::metadata(&ruta).map_err(|e| e.to_string())?;
    let nombre = ruta
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let fecha = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .map(ts_a_fecha)
        .unwrap_or_default();
    Ok(BackupItem {
        nombre,
        ruta: ruta.to_string_lossy().to_string(),
        tamano_bytes: meta.len(),
        fecha,
    })
}

/// Timestamp `YYYYMMDD-HHMMSS` en UTC.
fn fecha_hora_utc() -> String {
    ts_a_fecha(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    )
}

/// Timestamp `YYYYMMDD` en UTC.
fn fecha_hm() -> String {
    let ts = ts_a_fecha(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    );
    ts[..8].to_string()
}

/// Convierte segundos desde UNIX_EPOCH a `YYYYMMDD-HHMMSS` (UTC) por
/// aritmética civil, sin depender de librerías externas.
fn ts_a_fecha(seg: u64) -> String {
    let dias = seg / 86400;
    let resto = seg % 86400;
    let (anio, mes, dia) = civil_desde_dias(dias as i64);
    let h = resto / 3600;
    let m = (resto % 3600) / 60;
    let s = resto % 60;
    format!("{anio:04}{mes:02}{dia:02}-{h:02}{m:02}{s:02}")
}

/// Convierte días desde la época en (año, mes, día) del calendario gregoriano.
/// Algoritmo "civil from days" (Howard Hinnant).
fn civil_desde_dias(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32; // [1, 12]
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ts_a_fecha_formatea_utc() {
        // 2000-01-01T00:00:00Z = 946684800
        assert_eq!(ts_a_fecha(946_684_800), "20000101-000000");
        // 2026-11-30T00:53:20Z
        assert_eq!(ts_a_fecha(1_796_000_000), "20261130-005320");
    }

    #[test]
    fn civil_redondea_correctamente() {
        assert_eq!(civil_desde_dias(0), (1970, 1, 1));
        assert_eq!(civil_desde_dias(17_756), (2018, 8, 13));
    }
}
