// M9 - Configuración (clave-valor) y reporte/día.

use crate::pagos::estado_cuenta_todos;
use crate::types::{MovimientoResumen, ResumenDia, ResumenDiaVenta};
use rusqlite::{params, Connection, OptionalExtension};

// ------------------------------------------------------------
// Config
// ------------------------------------------------------------

/// Clave de la tasa de cambio global (Bs por 1 US$). Si no está configurada,
/// se asume 1 (sin conversión) para no bloquear el POS.
pub const KEY_TASA_CAMBIO: &str = "tasa_cambio";

pub fn get_config(conn: &Connection, clave: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT valor FROM config WHERE clave = ?1",
        params![clave],
        |r| r.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn set_config(conn: &Connection, clave: &str, valor: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO config (clave, valor) VALUES (?1, ?2)
         ON CONFLICT(clave) DO UPDATE SET valor = ?2",
        params![clave, valor],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Tasa de cambio global vigente (Bs por 1 US$). Lee `tasa_cambio` de config;
/// si no existe o es inválida devuelve error (el POS exige una tasa válida).
pub fn get_tasa_cambio(conn: &Connection) -> Result<f64, String> {
    let raw = get_config(conn, KEY_TASA_CAMBIO)?.unwrap_or_else(|| "1".to_string());
    let tasa: f64 = raw
        .trim()
        .parse()
        .map_err(|_| "La tasa de cambio configurada no es un número válido".to_string())?;
    if !tasa.is_finite() || tasa <= 0.0 {
        return Err("La tasa de cambio debe ser mayor que 0".to_string());
    }
    Ok(tasa)
}

// ------------------------------------------------------------
// Reporte del día
// ------------------------------------------------------------

/// Ajusta la cláusula de fecha según si viene una fecha o se usa hoy.
/// `col` es la columna de fecha (p.ej. `pr.fecha`, `v.fecha`, `fecha_pago`).
fn filtro_fecha(col: &str, fecha_opt: Option<&str>) -> (String, String) {
    match fecha_opt {
        Some(f) => (format!("date({col}) = date(?1)"), f.to_string()),
        None => (format!("date({col}) = date('now')"), String::new()),
    }
}

/// Reporte consolidado de una fecha (o de hoy si no se pasa ninguna).
pub fn resumen_dia(conn: &Connection, fecha_opt: Option<&str>) -> Result<ResumenDia, String> {
    let (cond_f, fecha_param) = filtro_fecha("pr.fecha", fecha_opt);

    // Producciones del día
    let sql_prod = format!(
        "SELECT p.nombre, pr.cantidad, pr.costo_unitario
         FROM producciones pr JOIN productos p ON p.id = pr.producto_id
         WHERE {cond_f}
         ORDER BY pr.id DESC"
    );
    let producciones = if fecha_param.is_empty() {
        conn.prepare(&sql_prod)
            .map_err(|e| e.to_string())?
            .query_map([], |r| {
                Ok(MovimientoResumen {
                    producto: r.get(0)?,
                    cantidad: r.get(1)?,
                    costo_unitario: r.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<MovimientoResumen>>>()
            .map_err(|e| e.to_string())?
    } else {
        conn.prepare(&sql_prod)
            .map_err(|e| e.to_string())?
            .query_map(params![fecha_param], |r| {
                Ok(MovimientoResumen {
                    producto: r.get(0)?,
                    cantidad: r.get(1)?,
                    costo_unitario: r.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<MovimientoResumen>>>()
            .map_err(|e| e.to_string())?
    };

    // Ventas entregadas del día
    let (cond_ventas, fecha_ventas) = filtro_fecha("v.fecha", fecha_opt);
    let sql_ventas = format!(
        "SELECT v.id, v.numero_factura, e.nombre_comercial, v.tipo, v.total, v.estado, v.tasa_cambio
         FROM ventas v JOIN empresas e ON e.id = v.empresa_id
         WHERE {cond_ventas} AND v.estado = 'entregada'
         ORDER BY v.id"
    );
    let ventas = if fecha_ventas.is_empty() {
        conn.prepare(&sql_ventas)
            .map_err(|e| e.to_string())?
            .query_map([], |r| {
                Ok(ResumenDiaVenta {
                    venta_id: r.get(0)?,
                    numero_factura: r.get(1)?,
                    cliente: r.get(2)?,
                    tipo: r.get(3)?,
                    monto: r.get(4)?,
                    estado: r.get(5)?,
                    tasa_cambio: r.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<ResumenDiaVenta>>>()
            .map_err(|e| e.to_string())?
    } else {
        conn.prepare(&sql_ventas)
            .map_err(|e| e.to_string())?
            .query_map(params![fecha_ventas.clone()], |r| {
                Ok(ResumenDiaVenta {
                    venta_id: r.get(0)?,
                    numero_factura: r.get(1)?,
                    cliente: r.get(2)?,
                    tipo: r.get(3)?,
                    monto: r.get(4)?,
                    estado: r.get(5)?,
                    tasa_cambio: r.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<ResumenDiaVenta>>>()
            .map_err(|e| e.to_string())?
    };

    // Pagos en efectivo del día, separados por moneda
    let (cond_pagos, fecha_pagos) = filtro_fecha("fecha_pago", fecha_opt);
    let sql_pagos = format!(
        "SELECT
            COALESCE(SUM(CASE WHEN moneda = 'usd' THEN monto ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN moneda = 'ves' THEN monto ELSE 0 END), 0)
         FROM pagos
         WHERE tipo_pago = 'efectivo' AND {cond_pagos}"
    );
    let (pagos_efectivo_usd, pagos_efectivo_ves): (i64, i64) = if fecha_pagos.is_empty() {
        conn.query_row(&sql_pagos, [], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
    } else {
        conn.query_row(&sql_pagos, params![fecha_pagos], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .map_err(|e| e.to_string())?
    };

    // Deudores: todos los clientes con saldo pendiente > 0
    let deudores = estado_cuenta_todos(conn)?
        .into_iter()
        .filter(|d| d.saldo_pendiente > 0)
        .collect();

    Ok(ResumenDia {
        producciones,
        ventas,
        pagos_efectivo_usd,
        pagos_efectivo_ves,
        deudores,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::*;
    use crate::types::{DetalleVentaInput, PagoInput, VentaInput};

    #[test]
    fn tasa_por_defecto_es_una() {
        let conn = conn();
        assert_eq!(get_tasa_cambio(&conn).unwrap(), 1.0);
    }

    #[test]
    fn tasa_configurada_se_lee() {
        let conn = conn();
        set_config(&conn, KEY_TASA_CAMBIO, "36.85").unwrap();
        assert_eq!(get_tasa_cambio(&conn).unwrap(), 36.85);
    }

    #[test]
    fn tasa_invalida_falla() {
        let conn = conn();
        set_config(&conn, KEY_TASA_CAMBIO, "abc").unwrap();
        assert!(get_tasa_cambio(&conn).is_err());
        set_config(&conn, KEY_TASA_CAMBIO, "-1").unwrap();
        assert!(get_tasa_cambio(&conn).is_err());
    }

    #[test]
    fn resumen_dia_separa_efectivo_por_moneda() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let pid = producto(&conn, 10_00);
        stock(&conn, pid, 20.0);

        let venta_usd = VentaInput {
            empresa_id: eid,
            tipo: "contado".into(),
            descuento: 0,
            detalles: vec![DetalleVentaInput {
                producto_id: pid,
                cantidad: 1.0,
            }],
            pagos: vec![PagoInput {
                monto: 10_00,
                tipo_pago: "efectivo".into(),
                moneda: "usd".into(),
                numero_referencia: None,
            }],
            operador_id: uid,
        };
        let venta_ves = VentaInput {
            empresa_id: eid,
            tipo: "contado".into(),
            descuento: 0,
            detalles: vec![DetalleVentaInput {
                producto_id: pid,
                cantidad: 1.0,
            }],
            pagos: vec![PagoInput {
                monto: 36_850,
                tipo_pago: "efectivo".into(),
                moneda: "ves".into(),
                numero_referencia: None,
            }],
            operador_id: uid,
        };
        crate::ventas::crear_venta(&mut conn, &venta_usd).unwrap();
        crate::ventas::crear_venta(&mut conn, &venta_ves).unwrap();

        let r = resumen_dia(&conn, None).unwrap();
        assert_eq!(r.pagos_efectivo_usd, 10_00);
        assert_eq!(r.pagos_efectivo_ves, 36_850);
        assert_eq!(r.ventas.len(), 2);
        assert!(r.ventas.iter().all(|v| v.tasa_cambio == 36.85));
    }
}
