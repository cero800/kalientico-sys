// Ticket térmico ESC/POS de 80 mm. Genera los bytes crudos (sin driver): la
// impresora los recibe tal cual por CUPS (`lp -o raw`) o por el puerto (/dev/usb/lp*).

use crate::types::{TicketDevolucion, TicketInput, TicketPago};

/// Ancho en caracteres de 80 mm con fuente A (12 CPI).
const ANCHO: usize = 42;

const ESC: u8 = 0x1B;
const GS: u8 = 0x1D;

fn init() -> Vec<u8> {
    vec![ESC, 0x40]
}

fn negrita(on: bool) -> Vec<u8> {
    vec![ESC, 0x45, if on { 0x01 } else { 0x00 }]
}

fn fuente_doble() -> Vec<u8> {
    vec![ESC, 0x21, 0x11]
}

fn fuente_normal() -> Vec<u8> {
    vec![ESC, 0x21, 0x00]
}

fn corte() -> Vec<u8> {
    vec![GS, 0x56, 0x00]
}

fn linea(texto: &str) -> Vec<u8> {
    let mut v = texto.as_bytes().to_vec();
    v.push(0x0A);
    v
}

fn separador() -> String {
    "-".repeat(ANCHO)
}

fn centrar(texto: &str) -> String {
    let n = texto.chars().count();
    if n >= ANCHO {
        return texto.chars().take(ANCHO).collect();
    }
    let izq = (ANCHO - n) / 2;
    format!(
        "{}{}{}",
        " ".repeat(izq),
        texto,
        " ".repeat(ANCHO - izq - n)
    )
}

/// Fila de dos columnas: texto a la izquierda y monto a la derecha.
fn fila(izq: &str, der: &str) -> String {
    let n_izq = izq.chars().count();
    let n_der = der.chars().count();
    if n_izq + n_der >= ANCHO {
        return format!("{}{}", izq, der);
    }
    format!("{}{}{}", izq, " ".repeat(ANCHO - n_izq - n_der), der)
}

/// Trunca si hace falta para no desbordar la línea.
fn trunca(texto: &str, max: usize) -> String {
    let n = texto.chars().count();
    if n <= max {
        return texto.to_string();
    }
    let base: String = texto.chars().take(max.saturating_sub(1)).collect();
    format!("{}…", base)
}

// ---- Formato de montos (mismo criterio que el frontend) ----
// US$ → $1,234.56; Bs → Bs 1.234,56; cantidad sin separadores (5 o 2,5).

fn agrupar(numero: &str, sep: &str) -> String {
    let mut out = String::new();
    let bytes = numero.as_bytes();
    let n = bytes.len();
    for (i, b) in bytes.iter().enumerate() {
        if i > 0 && (n - i).is_multiple_of(3) {
            out.push_str(sep);
        }
        out.push(*b as char);
    }
    out
}

fn fmt_usd(cents: i64) -> String {
    let neg = if cents < 0 { "-" } else { "" };
    let abs = cents.abs();
    let entero = agrupar(&(abs / 100).to_string(), ",");
    format!("{neg}${entero}.{:02}", abs % 100)
}

fn fmt_ves(cents: i64) -> String {
    let neg = if cents < 0 { "-" } else { "" };
    let abs = cents.abs();
    let entero = agrupar(&(abs / 100).to_string(), ".");
    format!("{neg}Bs {entero},{:02}", abs % 100)
}

fn fmt_cantidad(c: f64) -> String {
    if !c.is_finite() {
        return "0".to_string();
    }
    if c.fract() == 0.0 {
        return (c as i64).to_string();
    }
    format!("{c}")
}

fn fmt_tasa(t: f64) -> String {
    if !t.is_finite() || t <= 0.0 {
        return "0,00".to_string();
    }
    let entero = t.trunc() as i64;
    let dec = (t.fract() * 100.0).round() as i64;
    format!("{},{:02}", agrupar(&entero.to_string(), "."), dec)
}

fn etiqueta_pago(p: &TicketPago) -> String {
    let tipo = match p.tipo_pago.as_str() {
        "pago_movil" => "Pago móvil",
        "punto" => "Punto",
        "tarjeta" => "Tarjeta",
        "biopago" => "Biopago",
        _ => "Efectivo",
    };
    let moneda = if p.moneda == "usd" { "US$" } else { "Bs" };
    match p.numero_referencia.as_deref() {
        Some(ref_x) => format!("{tipo} {moneda} · Ref. {ref_x}"),
        None => format!("{tipo} {moneda}"),
    }
}

fn monto_pago(p: &TicketPago) -> String {
    if p.moneda == "usd" {
        fmt_usd(p.monto)
    } else {
        fmt_ves(p.monto)
    }
}

fn fecha_corta(fecha: &str) -> String {
    trunca(fecha.trim(), 10)
}

/// Genera el ticket completo de una factura en bytes ESC/POS.
pub fn ticket_factura(f: &TicketInput) -> Vec<u8> {
    let mut out = init();

    // Encabezado del negocio (centrado, nombre en negrita).
    out.extend(negrita(true));
    out.extend(linea(&centrar(&f.negocio_nombre.to_uppercase())));
    out.extend(negrita(false));
    if !f.negocio_rif.is_empty() {
        out.extend(linea(&centrar(&format!("RIF: {}", f.negocio_rif))));
    }
    if !f.negocio_telefono.is_empty() {
        out.extend(linea(&centrar(&format!("Telf: {}", f.negocio_telefono))));
    }
    if !f.negocio_direccion.is_empty() {
        out.extend(linea(&centrar(&f.negocio_direccion)));
    }
    out.extend(linea(&separador()));

    out.extend(negrita(true));
    out.extend(linea(&fila(
        &format!("FACTURA N° {:04}", f.numero_factura),
        &fecha_corta(&f.fecha),
    )));
    out.extend(negrita(false));
    out.extend(linea(&fila("Cliente:", "")));
    out.extend(linea(&trunca(&f.cliente, ANCHO)));
    if !f.cliente_rif.is_empty() {
        out.extend(linea(&fila("RIF:", &trunca(&f.cliente_rif, ANCHO - 4))));
    }
    out.extend(linea(&separador()));

    // Detalle: producto a la izquierda, cantidad y subtotal a la derecha.
    out.extend(negrita(true));
    out.extend(linea(&fila("PRODUCTO", "CANT  SUBTOTAL")));
    out.extend(negrita(false));
    for d in &f.detalle {
        let der = format!("{:<2} {}", fmt_cantidad(d.cantidad), fmt_usd(d.subtotal));
        out.extend(linea(&fila(
            &trunca(&d.producto, ANCHO - der.chars().count()),
            &der,
        )));
    }
    out.extend(linea(&separador()));

    out.extend(linea(&fila("Subtotal", &fmt_usd(f.subtotal))));
    if f.descuento > 0 {
        out.extend(linea(&fila(
            "Descuento",
            &format!("-{}", fmt_usd(f.descuento)),
        )));
    }
    out.extend(fuente_doble());
    out.extend(negrita(true));
    out.extend(linea(&fila("TOTAL", &fmt_usd(f.total))));
    out.extend(negrita(false));
    out.extend(fuente_normal());

    // Forma de pago.
    out.extend(linea(&separador()));
    out.extend(negrita(true));
    out.extend(linea("FORMA DE PAGO"));
    out.extend(negrita(false));
    for p in &f.pagos {
        let etiqueta = fila(&etiqueta_pago(p), &monto_pago(p));
        out.extend(linea(&trunca(&etiqueta, ANCHO)));
    }

    // Recordatorio de pago (factura a crédito próxima a vencer).
    if let Some(r) = f.recordatorio.as_deref() {
        if !r.trim().is_empty() {
            out.extend(linea(&separador()));
            out.extend(linea(&centrar(&trunca(r, ANCHO))));
        }
    }

    // NOTA: (espacio para anotaciones a mano sobre el comprobante).
    out.extend(linea(&separador()));
    out.extend(linea("NOTA:"));

    // DEVOLUCION: (informativo si hay devoluciones registradas, si no queda en blanco).
    out.extend(linea(&separador()));
    out.extend(negrita(true));
    out.extend(linea("DEVOLUCION:"));
    out.extend(negrita(false));
    for dev in &f.devoluciones {
        let meta = formato_devolucion(dev);
        out.extend(linea(&trunca(&fila(&meta, &fmt_usd(dev.monto)), ANCHO)));
        for dl in &dev.detalle {
            let der = fmt_usd(dl.subtotal);
            let izq = format!("  {} × {}", dl.nombre, fmt_cantidad(dl.cantidad));
            out.extend(linea(&fila(
                &trunca(&izq, ANCHO - der.chars().count()),
                &der,
            )));
        }
    }
    if !f.devoluciones.is_empty() {
        let neto = (f.total - f.devoluciones.iter().map(|d| d.monto).sum::<i64>()).max(0);
        out.extend(negrita(true));
        out.extend(linea(&fila("Saldo final (neto)", &fmt_usd(neto))));
        out.extend(negrita(false));
    }

    // Pie: tasa (si aplica) y el agradecimiento.
    out.extend(linea(&separador()));
    if f.tasa_cambio > 0.0 {
        out.extend(linea(&centrar(&format!(
            "Tasa: Bs {} por US$ 1",
            fmt_tasa(f.tasa_cambio)
        ))));
    }
    out.extend(linea(&centrar("Gracias por su compra!!")));
    out.extend(linea(""));
    out.extend(linea(""));

    out.extend(corte());
    out
}

/// Cabecera de una devolución dentro del ticket.
fn formato_devolucion(dev: &TicketDevolucion) -> String {
    let meta = format!("Devuelto el {}", fecha_corta(&dev.fecha_devolucion));
    match dev.motivo.as_deref() {
        Some(m) if !m.trim().is_empty() => format!("{meta} · {m}"),
        _ => meta,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{TicketDevolucionLinea, TicketLinea};

    fn ticket() -> TicketInput {
        TicketInput {
            negocio_nombre: "Panadería El Trigal".to_string(),
            negocio_rif: "J-99999999-9".to_string(),
            negocio_telefono: "0412-000-0000".to_string(),
            negocio_direccion: "Av. Principal".to_string(),
            numero_factura: 3,
            fecha: "2026-09-05".to_string(),
            cliente: "Café del Centro".to_string(),
            cliente_rif: "J-11111111-1".to_string(),
            subtotal: 1500,
            descuento: 0,
            total: 1500,
            tasa_cambio: 36.85,
            detalle: vec![TicketLinea {
                producto: "Pan Canilla".to_string(),
                cantidad: 5.0,
                subtotal: 1500,
            }],
            pagos: vec![TicketPago {
                tipo_pago: "pago_movil".to_string(),
                moneda: "ves".to_string(),
                monto: 55275,
                numero_referencia: Some("R-001".to_string()),
            }],
            devoluciones: vec![],
            recordatorio: None,
        }
    }

    /// Extrae solo el texto (quita los comandos ESC/POS) para las aserciones.
    fn texto(bytes: &[u8]) -> String {
        let mut limpio = Vec::new();
        let mut i = 0;
        while i < bytes.len() {
            match bytes[i] {
                0x1B => {
                    i += 1; // ESC
                    if matches!(
                        bytes.get(i),
                        Some(0x40) | Some(0x45) | Some(0x61) | Some(0x21)
                    ) {
                        i += 1;
                    }
                }
                0x1D => i += 2, // GS V 0 (corte)
                b => {
                    limpio.push(b);
                    i += 1;
                }
            }
        }
        String::from_utf8_lossy(&limpio).into_owned()
    }

    #[test]
    fn ticket_incluye_datos_de_la_factura() {
        let bytes = ticket_factura(&ticket());
        let texto = texto(&bytes);

        assert!(
            texto.contains("PANADERÍA EL TRIGAL"),
            "nombre del negocio en mayúsculas"
        );
        assert!(texto.contains("RIF: J-99999999-9"));
        assert!(texto.contains("FACTURA N° 0003"));
        assert!(texto.contains("Café del Centro"));
        assert!(texto.contains("Pan Canilla"));
        assert!(texto.contains("$15.00"));
        assert!(texto.contains("TOTAL"));
        assert!(texto.contains("Pago móvil Bs · Ref. R-001"));
        assert!(texto.contains("Bs 552,75"));
        assert!(texto.contains("Tasa: Bs 36,85 por US$ 1"));
        assert!(texto.contains("NOTA:"));
        assert!(texto.contains("DEVOLUCION:"));
        assert!(texto.contains("Gracias por su compra!!"));
    }

    #[test]
    fn ticket_inicia_con_reset_y_termina_con_corte() {
        let bytes = ticket_factura(&ticket());
        assert_eq!(&bytes[..3], &[0x1B, 0x40, 0x1B], "inicia con ESC @");
        let cola = &bytes[bytes.len() - 3..];
        assert_eq!(cola, &[0x1D, 0x56, 0x00], "termina con corte GS V 0");
    }

    #[test]
    fn ticket_muestra_devoluciones_y_saldo_neto() {
        let mut t = ticket();
        t.devoluciones = vec![crate::types::TicketDevolucion {
            fecha_devolucion: "2026-09-09".to_string(),
            motivo: Some("pan deteriorado".to_string()),
            monto: 500,
            detalle: vec![TicketDevolucionLinea {
                nombre: "Pan Canilla".to_string(),
                cantidad: 2.0,
                subtotal: 600,
            }],
        }];
        t.total = 1500;
        let texto = texto(&ticket_factura(&t));

        assert!(texto.contains("DEVOLUCION:"));
        assert!(texto.contains("pan deteriorado"));
        assert!(texto.contains("Saldo final (neto)"));
        assert!(texto.contains("$10.00"), "neto = 15 - 5");
    }

    #[test]
    fn ticket_muestra_el_recordatorio_de_pago() {
        let mut t = ticket();
        t.recordatorio = Some("Recuerde: su pago vence el 10/09/2026".to_string());
        let texto = texto(&ticket_factura(&t));

        assert!(texto.contains("Recuerde: su pago vence el 10/09/2026"));
    }

    #[test]
    fn formatea_montos_como_el_frontend() {
        assert_eq!(fmt_usd(123456), "$1,234.56");
        assert_eq!(fmt_usd(-500), "-$5.00");
        assert_eq!(fmt_ves(123456), "Bs 1.234,56");
        assert_eq!(fmt_cantidad(5.0), "5");
        assert_eq!(fmt_cantidad(2.5), "2.5");
        assert_eq!(fmt_tasa(36.85), "36,85");
    }
}
