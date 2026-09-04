// M8 - Caja / Arqueo de turno.
// Máquina de estados: solo puede haber UNA caja abierta a la vez. No se puede
// vender/abonar sin caja abierta. El arqueo es POR MONEDA (US$ y Bs separados):
// el efectivo esperado y la diferencia se calculan por separado. El cierre NO
// toca el stock (el inventario es acumulativo y persiste entre días).

use crate::types::{Caja, CajaAbrirInput, CajaCerrarInput};
use crate::validators;
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

/// Abre una nueva caja de turno con su efectivo inicial por moneda.
pub fn abrir_caja(conn: &Connection, i: &CajaAbrirInput) -> Result<(), String> {
    if caja_abierta(conn)?.is_some() {
        return Err("Ya hay una caja abierta. Ciérrala antes de abrir otra.".to_string());
    }
    validators::validar_monto(i.efectivo_inicial_usd, "Efectivo inicial US$")?;
    validators::validar_monto(i.efectivo_inicial_ves, "Efectivo inicial Bs")?;
    conn.execute(
        "INSERT INTO cajas (fecha, operador_id,
                            efectivo_inicial_usd, efectivo_esperado_usd,
                            efectivo_inicial_ves, efectivo_esperado_ves)
         VALUES (date('now'), ?1, ?2, ?2, ?3, ?3)",
        params![i.operador_id, i.efectivo_inicial_usd, i.efectivo_inicial_ves],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Cierra la caja: recalcula el efectivo de ventas y la diferencia POR MONEDA.
pub fn cerrar_caja(conn: &Connection, i: &CajaCerrarInput) -> Result<(), String> {
    let actual = caja_abierta(conn)?;
    match actual {
        None => return Err("No hay caja abierta para cerrar".to_string()),
        Some(c) if c.id != i.caja_id => {
            return Err("La caja a cerrar no coincide con la abierta".to_string())
        }
        Some(c) if c.operador_id != i.operador_id => {
            return Err("Solo el operador que abrió la caja puede cerrarla".to_string())
        }
        _ => {}
    }
    validators::validar_monto(i.efectivo_final_usd, "Efectivo final US$")?;
    validators::validar_monto(i.efectivo_final_ves, "Efectivo final Bs")?;

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
    let diferencia_usd = i.efectivo_final_usd - esperado_usd;
    let diferencia_ves = i.efectivo_final_ves - esperado_ves;
    let tasa_cierre = crate::reporte::get_tasa_cambio(conn)?;

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
            i.efectivo_final_usd,
            i.efectivo_final_ves,
            esperado_usd,
            esperado_ves,
            diferencia_usd,
            diferencia_ves,
            tasa_cierre,
            i.caja_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
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
    fn abrir_caja_dual_y_consulta() {
        let conn = conn();
        let uid = usuario(&conn);
        abrir(&conn, uid, 100_00, 5_000_00); // $100 + Bs 500
        let c = caja_abierta(&conn).unwrap().expect("hay caja abierta");
        assert_eq!(c.efectivo_inicial_usd, 100_00);
        assert_eq!(c.efectivo_inicial_ves, 5_000_00);
        assert_eq!(c.estado, "abierta");
    }

    #[test]
    fn doble_apertura_rechazada() {
        let conn = conn();
        let uid = usuario(&conn);
        abrir(&conn, uid, 0, 0);
        let err = abrir_caja(
            &conn,
            &CajaAbrirInput {
                operador_id: uid,
                efectivo_inicial_usd: 0,
                efectivo_inicial_ves: 0,
            },
        )
        .unwrap_err();
        assert!(err.contains("Ya hay una caja abierta"), "{err}");
    }

    #[test]
    fn exigir_exige_caja() {
        let conn = conn();
        assert!(exigir_caja_abierta(&conn).is_err());
        let uid = usuario(&conn);
        abrir(&conn, uid, 0, 0);
        assert!(exigir_caja_abierta(&conn).is_ok());
    }

    #[test]
    fn cerrar_deriva_diferencia_por_moneda() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid, 100_00, 0); // abre con $100, Bs 0
        let eid = empresa(&conn);
        let pid = producto(&conn, 10_00);
        stock(&conn, pid, 20.0);

        // $10 en efectivo US$ + $10 en efectivo Bs (Bs 368.50)
        crate::ventas::crear_venta(&mut conn, &venta_usd(eid, pid, uid)).unwrap();
        crate::ventas::crear_venta(&mut conn, &venta_ves(eid, pid, uid)).unwrap();

        let caja_id = caja_abierta(&conn).unwrap().unwrap().id;
        cerrar_caja(
            &conn,
            &CajaCerrarInput {
                caja_id,
                operador_id: uid,
                efectivo_final_usd: 110_00,  // esperado 100+10 = 110 → dif 0
                efectivo_final_ves: 36_850,  // esperado 0+368.50 → dif 0
            },
        )
        .unwrap();

        assert!(caja_abierta(&conn).unwrap().is_none(), "caja cerrada");

        let row = conn
            .query_row(
                "SELECT efectivo_esperado_usd, efectivo_esperado_ves, diferencia_usd, diferencia_ves, estado
                 FROM cajas WHERE id = ?1",
                params![caja_id],
                |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, i64>(1)?,
                        r.get::<_, i64>(2)?,
                        r.get::<_, i64>(3)?,
                        r.get::<_, String>(4)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(row.0, 110_00);
        assert_eq!(row.1, 36_850);
        assert_eq!(row.2, 0);
        assert_eq!(row.3, 0);
        assert_eq!(row.4, "cerrada");
    }

    #[test]
    fn cerrar_solo_el_mismo_operador_y_la_misma_caja() {
        let conn = conn();
        let uid_a = usuario(&conn);
        let uid_b = usuario(&conn);
        abrir(&conn, uid_a, 0, 0);
        let caja_id = caja_abierta(&conn).unwrap().unwrap().id;

        let err_otra = cerrar_caja(
            &conn,
            &CajaCerrarInput {
                caja_id: caja_id + 999,
                operador_id: uid_a,
                efectivo_final_usd: 0,
                efectivo_final_ves: 0,
            },
        )
        .unwrap_err();
        assert!(err_otra.contains("no coincide"), "{err_otra}");

        let err_otro_op = cerrar_caja(
            &conn,
            &CajaCerrarInput {
                caja_id,
                operador_id: uid_b,
                efectivo_final_usd: 0,
                efectivo_final_ves: 0,
            },
        )
        .unwrap_err();
        assert!(err_otro_op.contains("operador"), "{err_otro_op}");
    }
}