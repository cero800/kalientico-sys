// M8 - Caja / Arqueo de turno.
// Máquina de estados: solo puede haber UNA caja abierta a la vez. No se puede
// vender/abonar sin caja abierta. El arqueo es POR MONEDA (US$ y Bs separados):
// el efectivo esperado y la diferencia se calculan por separado. El cierre NO
// toca el stock (el inventario es acumulativo y persiste entre días).

use crate::factura::{
    KEY_NEGOCIO_DIRECCION, KEY_NEGOCIO_NOMBRE, KEY_NEGOCIO_RIF, KEY_NEGOCIO_TELEFONO,
};
use crate::reporte::{get_config, resumen_dia};
use crate::types::{Caja, CajaAbrirInput, CajaCerrarInput, CierreAbono, CierreDia};
use rusqlite::{params, Connection, OptionalExtension};

/// Devuelve la caja abierta actual, si existe.
pub fn caja_abierta(conn: &Connection) -> Result<Option<Caja>, String> {
    let fila = conn
        .query_row(
            "SELECT c.id, c.fecha, c.operador_id, u.nombre,
                    c.efectivo_inicial_usd, c.efectivo_inicial_ves,
                    c.efectivo_ventas_usd, c.efectivo_ventas_ves,
                    c.efectivo_egresos_usd, c.efectivo_egresos_ves,
                    c.efectivo_final_usd, c.efectivo_final_ves,
                    c.efectivo_esperado_usd, c.efectivo_esperado_ves,
                    c.diferencia_usd, c.diferencia_ves, c.tasa_cierre, c.estado
             FROM cajas c JOIN usuarios u ON u.id = c.operador_id
             WHERE c.estado = 'abierta'
             ORDER BY c.id DESC LIMIT 1",
            [],
            |r| {
                Ok(Caja {
                    id: r.get(0)?,
                    fecha: r.get(1)?,
                    operador_id: r.get(2)?,
                    operador_nombre: r.get(3)?,
                    efectivo_inicial_usd: r.get(4)?,
                    efectivo_inicial_ves: r.get(5)?,
                    efectivo_ventas_usd: r.get(6)?,
                    efectivo_ventas_ves: r.get(7)?,
                    efectivo_egresos_usd: r.get(8)?,
                    efectivo_egresos_ves: r.get(9)?,
                    efectivo_final_usd: r.get(10)?,
                    efectivo_final_ves: r.get(11)?,
                    efectivo_esperado_usd: r.get(12)?,
                    efectivo_esperado_ves: r.get(13)?,
                    diferencia_usd: r.get(14)?,
                    diferencia_ves: r.get(15)?,
                    tasa_cierre: r.get(16)?,
                    estado: r.get(17)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(fila)
}

/// Exige que haya una caja abierta. Devuelve su id. Llamado antes de vender.
pub fn exigir_caja_abierta(conn: &Connection) -> Result<i64, String> {
    caja_abierta(conn)?
        .map(|c| c.id)
        .ok_or_else(|| "Debe abrir la caja de turno antes de registrar ventas o pagos".to_string())
}

/// Abre una nueva caja de turno. El efectivo inicial se hereda de la última
/// caja cerrada (el "pico" que quedó en la gaveta); el primer día arranca en 0.
pub fn abrir_caja(conn: &Connection, i: &CajaAbrirInput) -> Result<(), String> {
    if caja_abierta(conn)?.is_some() {
        return Err("Ya hay una caja abierta. Ciérrala antes de abrir otra.".to_string());
    }
    let (pico_usd, pico_ves) = conn
        .query_row(
            "SELECT efectivo_final_usd, efectivo_final_ves FROM cajas
             WHERE estado = 'cerrada' ORDER BY id DESC LIMIT 1",
            [],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or((0, 0));
    conn.execute(
        "INSERT INTO cajas (fecha, operador_id,
                            efectivo_inicial_usd, efectivo_esperado_usd,
                            efectivo_inicial_ves, efectivo_esperado_ves)
         VALUES (date('now'), ?1, ?2, ?2, ?3, ?3)",
        params![i.operador_id, pico_usd, pico_ves],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Cierra la caja y devuelve el comprobante del día (`CierreDia`) para imprimir.
/// El efectivo real no se digita: se reconcilia en persona. Al persistir se
/// asume `efectivo_final = esperado` y `diferencia = 0`.
pub fn cerrar_caja(conn: &Connection, i: &CajaCerrarInput) -> Result<CierreDia, String> {
    let actual = match caja_abierta(conn)? {
        None => return Err("No hay caja abierta para cerrar".to_string()),
        Some(c) => c,
    };
    if actual.id != i.caja_id {
        return Err("La caja a cerrar no coincide con la abierta".to_string());
    }
    if actual.operador_id != i.operador_id {
        return Err("Solo el operador que abrió la caja puede cerrarla".to_string());
    }
    if !i.tasa_cierre.is_finite() || i.tasa_cierre <= 0.0 {
        return Err("La tasa de cambio de cierre debe ser mayor que cero".to_string());
    }

    // Efectivo de ventas del turno (pagos en efectivo de hoy, por moneda).
    let (ventas_usd, ventas_ves): (i64, i64) = conn
        .query_row(
            "SELECT
                COALESCE(SUM(CASE WHEN moneda = 'usd' THEN monto ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN moneda = 'ves' THEN monto ELSE 0 END), 0)
             FROM pagos
             WHERE tipo_pago = 'efectivo' AND date(fecha_pago) = date('now') AND venta_id IS NOT NULL",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    // Abonos en efectivo del día (venta_id nulo) — también entran a la gaveta.
    let (abono_usd, abono_ves): (i64, i64) = conn
        .query_row(
            "SELECT
                COALESCE(SUM(CASE WHEN moneda = 'usd' THEN monto ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN moneda = 'ves' THEN monto ELSE 0 END), 0)
             FROM pagos
             WHERE tipo_pago = 'efectivo' AND date(fecha_pago) = date('now') AND venta_id IS NULL",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    // Ventas entregadas del día y ventas esperadas (reuso el reporte del día).
    let resumen = resumen_dia(conn, None)?;
    let ventas = resumen.ventas;
    let total_ventas_usd: i64 = ventas.iter().map(|v| v.monto).sum();
    let total_ventas_bs: i64 = ventas
        .iter()
        .map(|v| (v.monto as f64 * v.tasa_cambio).round() as i64)
        .sum();

    // Abonos a cuenta del día (todas las monedas y formas de pago).
    let mut abonos = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT p.empresa_id, e.nombre_comercial, p.tipo_pago, p.moneda, p.monto, p.tasa_cambio, p.fecha_pago
                 FROM pagos p JOIN empresas e ON e.id = p.empresa_id
                 WHERE p.venta_id IS NULL AND date(p.fecha_pago) = date('now')
                 ORDER BY p.id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(CierreAbono {
                    empresa_id: r.get(0)?,
                    cliente: r.get(1)?,
                    tipo_pago: r.get(2)?,
                    moneda: r.get(3)?,
                    monto: r.get(4)?,
                    tasa_cambio: r.get(5)?,
                    fecha_pago: r.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for ab in rows {
            abonos.push(ab.map_err(|e| e.to_string())?);
        }
    }
    let total_abonos_usd: i64 = abonos
        .iter()
        .map(|a| {
            if a.moneda == "usd" {
                a.monto
            } else {
                (a.monto as f64 / a.tasa_cambio).round() as i64
            }
        })
        .sum();
    let total_abonos_bs: i64 = abonos
        .iter()
        .map(|a| {
            if a.moneda == "ves" {
                a.monto
            } else {
                (a.monto as f64 * a.tasa_cambio).round() as i64
            }
        })
        .sum();

    // Recalcular lo esperado con la última apertura (no usar lo ya escrito).
    let (inicial_usd, inicial_ves): (i64, i64) = conn
        .query_row(
            "SELECT efectivo_inicial_usd, efectivo_inicial_ves FROM cajas WHERE id = ?1",
            params![i.caja_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let esperado_usd = inicial_usd + ventas_usd;
    let esperado_ves = inicial_ves + ventas_ves;
    let tasa_cierre = i.tasa_cierre;

    conn.execute(
        "UPDATE cajas
         SET efectivo_ventas_usd = ?1, efectivo_ventas_ves = ?2,
             efectivo_final_usd = ?3, efectivo_final_ves = ?4,
             efectivo_esperado_usd = ?5, efectivo_esperado_ves = ?6,
             diferencia_usd = ?7, diferencia_ves = ?8,
             tasa_cierre = ?9, estado = 'cerrada'
         WHERE id = ?10",
        params![
            ventas_usd,
            ventas_ves,
            esperado_usd,
            esperado_ves,
            esperado_usd,
            esperado_ves,
            0,
            0,
            tasa_cierre,
            i.caja_id,
        ],
    )
    .map_err(|e| e.to_string())?;

    let negocio = |clave: &str| get_config(conn, clave).unwrap_or(None).unwrap_or_default();

    Ok(CierreDia {
        caja_id: i.caja_id,
        fecha: actual.fecha,
        operador_nombre: actual.operador_nombre,
        negocio_nombre: negocio(KEY_NEGOCIO_NOMBRE),
        negocio_rif: negocio(KEY_NEGOCIO_RIF),
        negocio_telefono: negocio(KEY_NEGOCIO_TELEFONO),
        negocio_direccion: negocio(KEY_NEGOCIO_DIRECCION),
        efectivo_inicial_usd: inicial_usd,
        efectivo_inicial_ves: inicial_ves,
        efectivo_ventas_usd: ventas_usd,
        efectivo_ventas_ves: ventas_ves,
        abonos_efectivo_usd: abono_usd,
        abonos_efectivo_ves: abono_ves,
        efectivo_esperado_usd: esperado_usd,
        efectivo_esperado_ves: esperado_ves,
        ventas,
        abonos,
        total_ventas_usd,
        total_ventas_bs,
        total_abonos_usd,
        total_abonos_bs,
        tasa_cierre,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::*;
    use crate::types::{DetalleVentaInput, PagoInput, VentaInput};
    use rusqlite::params;

    fn venta_usd(eid: i64, pid: i64, uid: i64) -> VentaInput {
        VentaInput {
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
        }
    }

    fn venta_ves(eid: i64, pid: i64, uid: i64) -> VentaInput {
        VentaInput {
            empresa_id: eid,
            tipo: "contado".into(),
            descuento: 0,
            detalles: vec![DetalleVentaInput {
                producto_id: pid,
                cantidad: 1.0,
            }],
            pagos: vec![PagoInput {
                monto: 36_850, // Bs 368.50 = $10.00 a tasa 36.85
                tipo_pago: "efectivo".into(),
                moneda: "ves".into(),
                numero_referencia: None,
            }],
            operador_id: uid,
        }
    }

    #[test]
    fn abrir_caja_arranca_en_cero() {
        let conn = conn();
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let c = caja_abierta(&conn).unwrap().expect("hay caja abierta");
        assert_eq!(c.efectivo_inicial_usd, 0);
        assert_eq!(c.efectivo_inicial_ves, 0);
        assert_eq!(c.estado, "abierta");
    }

    #[test]
    fn doble_apertura_rechazada() {
        let conn = conn();
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let err = abrir_caja(&conn, &CajaAbrirInput { operador_id: uid }).unwrap_err();
        assert!(err.contains("Ya hay una caja abierta"), "{err}");
    }

    #[test]
    fn exigir_exige_caja() {
        let conn = conn();
        assert!(exigir_caja_abierta(&conn).is_err());
        let uid = usuario(&conn);
        abrir(&conn, uid);
        assert!(exigir_caja_abierta(&conn).is_ok());
    }

    #[test]
    fn cerrar_cierra_con_esperado_del_dia_y_sin_diferencia() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid); // día 1: arranca en 0
        let eid = empresa(&conn);
        let pid = producto(&conn, 10_00);
        stock(&conn, pid, 20.0);

        // $10 en efectivo US$ + $10 en efectivo Bs (Bs 368.50)
        crate::ventas::crear_venta(&mut conn, &venta_usd(eid, pid, uid)).unwrap();
        crate::ventas::crear_venta(&mut conn, &venta_ves(eid, pid, uid)).unwrap();

        let caja_id = caja_abierta(&conn).unwrap().unwrap().id;
        let cierre = cerrar_caja(
            &conn,
            &CajaCerrarInput {
                caja_id,
                operador_id: uid,
                tasa_cierre: 37.5, // se congela la tasa pasada, no la global
            },
        )
        .unwrap();

        assert!(caja_abierta(&conn).unwrap().is_none(), "caja cerrada");

        let row = conn
            .query_row(
                "SELECT efectivo_esperado_usd, efectivo_esperado_ves, diferencia_usd, diferencia_ves, estado, tasa_cierre
                 FROM cajas WHERE id = ?1",
                params![caja_id],
                |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, i64>(1)?,
                        r.get::<_, i64>(2)?,
                        r.get::<_, i64>(3)?,
                        r.get::<_, String>(4)?,
                        r.get::<_, f64>(5)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(row.0, 10_00);
        assert_eq!(row.1, 36_850);
        assert_eq!(row.2, 0);
        assert_eq!(row.3, 0);
        assert_eq!(row.4, "cerrada");
        assert_eq!(row.5, 37.5);

        // El comprobante trae las ventas del día con totales en US$ y Bs.
        assert_eq!(cierre.operador_nombre, "Test");
        assert_eq!(cierre.efectivo_inicial_usd, 0);
        assert_eq!(cierre.efectivo_ventas_usd, 10_00);
        assert_eq!(cierre.efectivo_ventas_ves, 36_850);
        assert_eq!(cierre.efectivo_esperado_usd, 10_00);
        assert_eq!(cierre.ventas.len(), 2);
        assert_eq!(cierre.total_ventas_usd, 20_00);
        assert_eq!(cierre.total_ventas_bs, 73_700); // 20 * 36.85
        assert_eq!(cierre.abonos.len(), 0);
        assert_eq!(cierre.total_abonos_usd, 0);
        assert_eq!(cierre.tasa_cierre, 37.5);
    }

    #[test]
    fn cierre_incluye_abonos_del_dia_y_datos_del_negocio() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let pid = producto(&conn, 10_00);
        stock(&conn, pid, 20.0);

        crate::ventas::crear_venta(&mut conn, &venta_usd(eid, pid, uid)).unwrap();
        crate::pagos::registrar_abono(
            &conn,
            &crate::types::AbonoInput {
                empresa_id: eid,
                monto: 36_850, // Bs 368.50 en efectivo (= $10)
                tipo_pago: "efectivo".into(),
                moneda: "ves".into(),
                numero_referencia: None,
                operador_id: uid,
            },
        )
        .unwrap();
        crate::pagos::registrar_abono(
            &conn,
            &crate::types::AbonoInput {
                empresa_id: eid,
                monto: 18_425, // Bs 184.25 = $5 en pago móvil
                tipo_pago: "pago_movil".into(),
                moneda: "ves".into(),
                numero_referencia: Some("123".into()),
                operador_id: uid,
            },
        )
        .unwrap();

        crate::reporte::set_config(
            &conn,
            crate::factura::KEY_NEGOCIO_NOMBRE,
            "Panadería El Trigal",
        )
        .unwrap();

        let caja_id = caja_abierta(&conn).unwrap().unwrap().id;
        let cierre = cerrar_caja(
            &conn,
            &CajaCerrarInput {
                caja_id,
                operador_id: uid,
                tasa_cierre: 36.85,
            },
        )
        .unwrap();

        assert_eq!(cierre.negocio_nombre, "Panadería El Trigal");
        assert_eq!(cierre.abonos.len(), 2);
        assert_eq!(cierre.abonos[0].cliente, "Pan S.A.");
        assert_eq!(cierre.abonos[0].tipo_pago, "efectivo");
        assert_eq!(cierre.total_abonos_usd, 15_00); // $10 (Bs) + $5 (US$)
        assert_eq!(cierre.total_abonos_bs, 55_275); // Bs 368.50 + $5*36.85 = Bs 552.75
        assert_eq!(cierre.abonos_efectivo_usd, 0);
        assert_eq!(cierre.abonos_efectivo_ves, 36_850);
    }

    #[test]
    fn abrir_hereda_pico_del_cierre_anterior() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        // Día 1: abre en 0, vende $10, cierra dejando pico $10 + Bs 368.50
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let pid = producto(&conn, 10_00);
        stock(&conn, pid, 20.0);
        crate::ventas::crear_venta(&mut conn, &venta_usd(eid, pid, uid)).unwrap();
        crate::ventas::crear_venta(&mut conn, &venta_ves(eid, pid, uid)).unwrap();
        let caja1 = caja_abierta(&conn).unwrap().unwrap().id;
        cerrar_caja(
            &conn,
            &CajaCerrarInput {
                caja_id: caja1,
                operador_id: uid,
                tasa_cierre: 37.0,
            },
        )
        .unwrap();

        // Día 2: el pico queda como efectivo inicial y esperado
        abrir(&conn, uid);
        let caja2 = caja_abierta(&conn).unwrap().expect("caja abierta");
        assert_eq!(caja2.efectivo_inicial_usd, 10_00);
        assert_eq!(caja2.efectivo_inicial_ves, 36_850);
        assert_eq!(caja2.efectivo_esperado_usd, 10_00);
        assert_eq!(caja2.efectivo_esperado_ves, 36_850);

        // Cerrar sin ventas → esperado = pico → diferencia 0
        cerrar_caja(
            &conn,
            &CajaCerrarInput {
                caja_id: caja2.id,
                operador_id: uid,
                tasa_cierre: 37.1,
            },
        )
        .unwrap();
        assert!(caja_abierta(&conn).unwrap().is_none());
    }

    #[test]
    fn cerrar_solo_el_mismo_operador_y_la_misma_caja() {
        let conn = conn();
        let uid_a = usuario(&conn);
        let uid_b = usuario(&conn);
        abrir(&conn, uid_a);
        let caja_id = caja_abierta(&conn).unwrap().unwrap().id;

        let err_otra = cerrar_caja(
            &conn,
            &CajaCerrarInput {
                caja_id: caja_id + 999,
                operador_id: uid_a,
                tasa_cierre: 36.85,
            },
        )
        .unwrap_err();
        assert!(err_otra.contains("no coincide"), "{err_otra}");

        let err_otro_op = cerrar_caja(
            &conn,
            &CajaCerrarInput {
                caja_id,
                operador_id: uid_b,
                tasa_cierre: 36.85,
            },
        )
        .unwrap_err();
        assert!(err_otro_op.contains("operador"), "{err_otro_op}");
    }
}
