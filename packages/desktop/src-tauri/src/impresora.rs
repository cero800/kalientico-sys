// Envío de tickets a la impresora térmica. El destino sale de `config`
// (`impresora_termica`): puede ser una ruta de dispositivo (/dev/usb/lp0) o
// una cola de CUPS. Con CUPS se usa `lp -o raw` (pasa los bytes tal cual, sin
// rasterizar); con dispositivo se escribe directo al puerto de la impresora.

use std::io::Write;
use std::process::{Command, Stdio};

use rusqlite::Connection;

use crate::reporte::get_config;
use crate::ticket;
use crate::types::TicketInput;

pub const CLAVE_IMPRESORA: &str = "impresora_termica";

pub const MSG_FALTA_IMPRESORA: &str =
    "No hay impresora térmica configurada: abra una factura → botón Térmica → 'Configurar impresora'.";

/// Destino configurado (ruta de dispositivo o cola CUPS).
pub fn destino(conn: &Connection) -> Result<String, String> {
    get_config(conn, CLAVE_IMPRESORA)?
        .filter(|v| !v.trim().is_empty())
        .map(|v| v.trim().to_string())
        .ok_or_else(|| MSG_FALTA_IMPRESORA.to_string())
}

/// Envía bytes crudos a la impresora configurada.
pub fn imprimir(conn: &Connection, bytes: &[u8]) -> Result<(), String> {
    let dtor = destino(conn)?;

    if dtor.starts_with('/') {
        let ruta = &dtor;
        let mut archivo = std::fs::OpenOptions::new()
            .write(true)
            .open(ruta)
            .map_err(|e| {
                format!(
                    "No se pudo abrir la impresora {ruta}: {e}. ¿Está conectada? (pruebe `sudo modprobe usblp`)"
                )
            })?;
        archivo
            .write_all(bytes)
            .map_err(|e| format!("No se pudo escribir en {ruta}: {e}"))?;
        return Ok(());
    }

    // Cola CUPS: lp -o raw con los bytes por stdin.
    let mut child = Command::new("lp")
        .args(["-d", &dtor, "-o", "raw"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("No se pudo ejecutar `lp` (impresora {dtor}): {e}"))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Sin canal de entrada para lp".to_string())?;
    stdin
        .write_all(bytes)
        .map_err(|e| format!("No se pudo enviar el ticket a lp: {e}"))?;
    drop(stdin);

    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let detalle = if err.is_empty() {
            "sin detalle".to_string()
        } else {
            err
        };
        return Err(format!("lp falló al imprimir en {dtor}: {detalle}"));
    }
    Ok(())
}

/// Candidatos de impresora: colas de CUPS (`lpstat -p`) y puertos `/dev/usb/lp*`.
pub fn listar_impresoras() -> Vec<String> {
    let mut candidatas: Vec<String> = Vec::new();

    if let Ok(output) = Command::new("lpstat").arg("-p").output() {
        for linea in String::from_utf8_lossy(&output.stdout).lines() {
            if let Some(resto) = linea.strip_prefix("printer ") {
                if let Some(nombre) = resto.split_whitespace().next() {
                    if !candidatas.contains(&nombre.to_string()) {
                        candidatas.push(nombre.to_string());
                    }
                }
            }
        }
    }

    if let Ok(dir) = std::fs::read_dir("/dev/usb") {
        let mut puertos: Vec<String> = dir
            .filter_map(|e| e.ok())
            .map(|e| e.path().to_string_lossy().to_string())
            .filter(|p| p.starts_with("/dev/usb/lp"))
            .collect();
        puertos.sort();
        for puerto in puertos {
            if !candidatas.contains(&puerto) {
                candidatas.push(puerto);
            }
        }
    }

    candidatas
}

/// Imprime un ticket corto de prueba.
pub fn probar(conn: &Connection) -> Result<(), String> {
    let prueba = TicketInput {
        negocio_nombre: "KALIENTICO — PRUEBA".to_string(),
        negocio_rif: String::new(),
        negocio_telefono: String::new(),
        negocio_direccion: String::new(),
        numero_factura: 0,
        fecha: String::new(),
        cliente: String::new(),
        cliente_rif: String::new(),
        subtotal: 0,
        descuento: 0,
        total: 0,
        tasa_cambio: 0.0,
        detalle: vec![],
        pagos: vec![],
        devoluciones: vec![],
        recordatorio: None,
    };
    imprimir(conn, &ticket::ticket_factura(&prueba))
}
