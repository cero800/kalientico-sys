// M6 - Ventas / Punto de Venta.
// La creación de una venta es ATÓMICA: reserva nº de factura, valida stock,
// descuenta inventario, inserta cabecera + detalle + pagos. Un error a mitad
// revierte todo (rollback), de modo que nunca se compromete pan sin stock ni
// se pierde un número de factura.

use crate::repo;
use crate::types::{Venta, VentaInput};
use crate::validators;
use rusqlite::{Connection, OptionalExtension};

const KEY_ULTIMA_FACTURA: &str = "ultimo_numero_factura";

pub fn crear_venta(conn: &mut Connection, v: &VentaInput) -> Result<Venta, String> {
    validators::validar_tipo_venta(&v.tipo)?;
    if v.detalles.is_empty() {
        return Err("La venta debe tener al menos un producto".to_string());
    }
    if v.tipo == "contado" && v.pagos.is_empty() {
        return Err("Una venta de contado requiere el registro del pago".to_string());
    }
    crate::caja::exigir_caja_abierta(conn)?;

    // Snapshot de la tasa de cambio (Bs por 1 US$) que se congela en la venta
    // y en cada pago. Válida para todo el turno (o se actualiza antes de vender).
    let tasa_cambio = crate::reporte::get_tasa_cambio(conn)?;

    // Precalcular totales para verificar que pagos de contado cuadran.
    let mut subtotal_gross = 0i64;
    let mut impuesto_total = 0i64;
    for d in &v.detalles {
        let (precio, pct, unidad) = repo::precio_efectivo(conn, d.producto_id, v.empresa_id)?;
        validators::validar_cantidad_venta(d.cantidad, &unidad)?;
        let line_subtotal = (d.cantidad * precio as f64).round() as i64;
        let line_impuesto = ((line_subtotal as f64) * (pct / 100.0)).round() as i64;
        subtotal_gross += line_subtotal;
        impuesto_total += line_impuesto;
    }
    validators::validar_descuento(v.descuento, subtotal_gross)?;
    let total = subtotal_gross - v.descuento + impuesto_total;
    validators::validar_monto(total, "Total")?;
    if total < 0 {
        return Err("El total no puede ser negativo".to_string());
    }

    // Pagos convertidos a US$ (base) para verificar cobertura del total.
    let mut pagado_usd: i64 = 0;
    for p in &v.pagos {
        validators::validar_monto_positivo(p.monto, "Monto del pago")?;
        validators::validar_tipo_pago(&p.tipo_pago)?;
        validators::validar_combinacion_pago(&p.tipo_pago, &p.moneda, p.numero_referencia.as_deref())?;
        pagado_usd += validators::a_usd(p.monto, &p.moneda, tasa_cambio)?;
    }
    if v.tipo == "contado" && pagado_usd < total {
        return Err(format!(
            "El pago ({pagado_usd} centavos US$) no cubre el total ({total} centavos US$)"
        ));
    }
    if pagado_usd > total.max(0) + 1 {
        return Err("El pago supera el total de la venta (sin sobrepago)".to_string());
    }

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?; // BEGIN
    let res: Result<_, String> = (|| -> Result<Venta, String> {
        let numero = reservar_numero_factura(&tx)?;

        // Insertar cabecera
        tx.execute(
            "INSERT INTO ventas (empresa_id, numero_factura, tipo, fecha, subtotal, descuento, impuesto, total, moneda, tasa_cambio, operador_id)
             VALUES (?1, ?2, ?3, date('now'), ?4, ?5, ?6, ?7, 'usd', ?8, ?9)",
            rusqlite::params![
                v.empresa_id,
                numero,
                v.tipo,
                total - v.descuento, // subtotal
                v.descuento,
                0, // impuesto se acumula por línea
                total,
                tasa_cambio,
                v.operador_id,
            ],
        )
        .map_err(|e| e.to_string())?;
        let venta_id = tx.last_insert_rowid();

        let mut subtotal_venta: i64 = 0;
        let mut impuesto_venta: i64 = 0;
        for d in &v.detalles {
            let (precio, pct, unidad) = repo::precio_efectivo(&tx, d.producto_id, v.empresa_id)?;
            validators::validar_cantidad_venta(d.cantidad, &unidad)?;
            let line_subtotal = (d.cantidad * precio as f64).round() as i64;
            let line_impuesto = ((line_subtotal as f64) * (pct / 100.0)).round() as i64;
            subtotal_venta += line_subtotal;
            impuesto_venta += line_impuesto;

            // Descontar stock ANTES de grabar la línea: si no hay, rollback.
            repo::descontar_stock(&tx, d.producto_id, d.cantidad, venta_id, v.operador_id)?;

            tx.execute(
                "INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![venta_id, d.producto_id, d.cantidad, precio, line_subtotal],
            )
            .map_err(|e| e.to_string())?;
        }

        // Descuento sobre el subtotal de bienes (no afecta el IVA por línea).
        let subtotal_final = subtotal_venta - v.descuento;
        let total_final = subtotal_final + impuesto_venta;
        if total_final < 0 {
            return Err("El total no puede ser negativo".to_string());
        }

        tx.execute(
            "UPDATE ventas SET subtotal = ?1, impuesto = ?2, total = ?3 WHERE id = ?4",
            rusqlite::params![subtotal_final, impuesto_venta, total_final, venta_id],
        )
        .map_err(|e| e.to_string())?;

        // Grabar pagos (cada uno con su moneda y el snapshot de la tasa)
        for p in &v.pagos {
            validators::validar_monto_positivo(p.monto, "Monto del pago")?;
            validators::validar_tipo_pago(&p.tipo_pago)?;
            validators::validar_moneda(&p.moneda)?;
            validators::validar_combinacion_pago(&p.tipo_pago, &p.moneda, p.numero_referencia.as_deref())?;
            tx.execute(
                "INSERT INTO pagos (empresa_id, venta_id, monto, tipo_pago, moneda, tasa_cambio, numero_referencia, operador_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    v.empresa_id,
                    venta_id,
                    p.monto,
                    p.tipo_pago,
                    p.moneda,
                    tasa_cambio,
                    p.numero_referencia,
                    v.operador_id,
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        Ok(Venta {
            id: venta_id,
            empresa_id: v.empresa_id,
            numero_factura: numero,
            tipo: v.tipo.clone(),
            estado: "entregada".to_string(),
            fecha: "".to_string(),
            subtotal: subtotal_final,
            descuento: v.descuento,
            impuesto: impuesto_venta,
            total: total_final,
            operador_id: v.operador_id,
            moneda: "usd".to_string(),
            tasa_cambio,
        })
    })();

    match res {
        Ok(v) => {
            tx.commit().map_err(|e| e.to_string())?;
            Ok(v)
        }
        Err(e) => {
            // rollback implícito al dropear tx
            Err(e)
        }
    }
}

/// Reserva (e incrementa) el correlativo de facturas de forma atómica.
fn reservar_numero_factura(conn: &Connection) -> Result<i64, String> {
    let actual: i64 = conn
        .query_row(
            "SELECT COALESCE((SELECT CAST(valor AS INTEGER) FROM config WHERE clave = ?1), 0)",
            rusqlite::params![KEY_ULTIMA_FACTURA],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let nuevo = actual + 1;
    conn.execute(
        "INSERT INTO config (clave, valor) VALUES (?1, ?2)
         ON CONFLICT(clave) DO UPDATE SET valor = ?2",
        rusqlite::params![KEY_ULTIMA_FACTURA, nuevo.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(nuevo)
}

/// Lista ventas (historial de facturas).
pub fn listar_ventas(conn: &Connection) -> Result<Vec<Venta>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, empresa_id, numero_factura, tipo, estado, fecha, subtotal, descuento, impuesto, total, operador_id, moneda, tasa_cambio
             FROM ventas ORDER BY fecha DESC, id DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Venta {
                id: r.get(0)?,
                empresa_id: r.get(1)?,
                numero_factura: r.get(2)?,
                tipo: r.get(3)?,
                estado: r.get(4)?,
                fecha: r.get(5)?,
                subtotal: r.get(6)?,
                descuento: r.get(7)?,
                impuesto: r.get(8)?,
                total: r.get(9)?,
                operador_id: r.get(10)?,
                moneda: r.get(11)?,
                tasa_cambio: r.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<Venta>>>().map_err(|e| e.to_string())
}

/// Anula una venta: revierte el stock de cada detalle y marca la venta como
/// anulada (conserva su número de factura; no se reutiliza).
pub fn anular_venta(
    conn: &mut Connection,
    venta_id: i64,
    motivo: &str,
    operador_id: i64,
) -> Result<(), String> {
    if motivo.trim().is_empty() {
        return Err("La anulación requiere un motivo".to_string());
    }
    let estado: Option<String> = conn
        .query_row(
            "SELECT estado FROM ventas WHERE id = ?1",
            rusqlite::params![venta_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match estado.as_deref() {
        None => return Err("Venta no encontrada".to_string()),
        Some("anulada") => return Err("La venta ya está anulada".to_string()),
        _ => {}
    }

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let res: Result<_, String> = (|| -> Result<(), String> {
        // Revertir stock por cada línea de detalle.
        let mut stmt = tx
            .prepare("SELECT producto_id, cantidad FROM detalle_ventas WHERE venta_id = ?1")
            .map_err(|e| e.to_string())?;
        let lineas: Vec<(i64, f64)> = stmt
            .query_map(rusqlite::params![venta_id], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);

        for (producto_id, cantidad) in lineas {
            repo::reponer_stock(&tx, producto_id, cantidad, venta_id, operador_id)?;
        }

        // Si la venta tenía pagos, NO los borra: salen del cálculo de estado de
        // cuenta al quedar la venta anulada (SUM solo cuenta 'entregada').
        tx.execute(
            "UPDATE ventas SET estado = 'anulada', anulada_motivo = ?2 WHERE id = ?1",
            rusqlite::params![venta_id, motivo.trim()],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })();

    match res {
        Ok(()) => tx.commit().map_err(|e| e.to_string()),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::*;
    use crate::types::{DetalleVentaInput, PagoInput, VentaInput};

    fn venta(empresa_id: i64, producto_id: i64, operador_id: i64, tipo: &str, pagos: Vec<PagoInput>) -> VentaInput {
        VentaInput {
            empresa_id,
            tipo: tipo.into(),
            descuento: 0,
            detalles: vec![DetalleVentaInput {
                producto_id,
                cantidad: 1.0,
            }],
            pagos,
            operador_id,
        }
    }

    fn pago_usd(monto: i64) -> PagoInput {
        PagoInput {
            monto,
            tipo_pago: "efectivo".into(),
            moneda: "usd".into(),
            numero_referencia: None,
        }
    }

    fn pago_ves(monto: i64) -> PagoInput {
        PagoInput {
            monto,
            tipo_pago: "efectivo".into(),
            moneda: "ves".into(),
            numero_referencia: None,
        }
    }

    #[test]
    fn venta_contado_usd_completa_y_descarta_stock() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let pid = producto(&conn, 10_00); // $10.00
        stock(&conn, pid, 5.0);

        let v = crear_venta(&mut conn, &venta(eid, pid, uid, "contado", vec![pago_usd(10_00)]))
            .unwrap();
        assert_eq!(v.total, 10_00);
        assert_eq!(v.moneda, "usd");
        assert_eq!(v.tasa_cambio, 36.85);
        assert_eq!(v.numero_factura, 1);

        // stock descontado 5 -> 4
        let stock: f64 = conn
            .query_row(
                "SELECT cantidad_disponible FROM stock WHERE producto_id = ?1",
                rusqlite::params![pid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(stock, 4.0);

        // el pago se guardó en su moneda con el snapshot de tasa
        let (moneda, tasa): (String, f64) = conn
            .query_row("SELECT moneda, tasa_cambio FROM pagos", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(moneda, "usd");
        assert_eq!(tasa, 36.85);
    }

    #[test]
    fn venta_mixta_usd_y_ves() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let pid = producto(&conn, 10_00); // $10.00

        // $5.00 en US$ + Bs 184.25 (18.425 céntimos) = $5.00 → total cubierto
        stock(&conn, pid, 10.0);
        let v = crear_venta(
            &mut conn,
            &venta(eid, pid, uid, "contado", vec![pago_usd(500), pago_ves(18_425)]),
        )
        .unwrap();
        assert_eq!(v.total, 10_00);

        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM pagos WHERE moneda='usd'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM pagos WHERE moneda='ves' AND tasa_cambio=36.85", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn venta_contado_pago_insuficiente_falla() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let pid = producto(&conn, 10_00);

        let err = crear_venta(&mut conn, &venta(eid, pid, uid, "contado", vec![pago_usd(500)]))
            .unwrap_err();
        assert!(err.contains("no cubre"), "{err}");

        // nada se persistió (rollback)
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM ventas", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn venta_contado_sobrepago_falla() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let pid = producto(&conn, 10_00);

        let err = crear_venta(&mut conn, &venta(eid, pid, uid, "contado", vec![pago_usd(10_02)]))
            .unwrap_err();
        assert!(err.contains("supera"), "{err}");
    }

    #[test]
    fn venta_usd_con_pago_movil_falla() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let pid = producto(&conn, 10_00);

        let v = VentaInput {
            empresa_id: eid,
            tipo: "contado".into(),
            descuento: 0,
            detalles: vec![DetalleVentaInput {
                producto_id: pid,
                cantidad: 1.0,
            }],
            pagos: vec![PagoInput {
                monto: 10_00,
                tipo_pago: "pago_movil".into(),
                moneda: "usd".into(),
                numero_referencia: Some("R-1".into()),
            }],
            operador_id: uid,
        };
        let err = crear_venta(&mut conn, &v).unwrap_err();
        assert!(err.contains("US$"), "{err}");
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM ventas", [], |r| r.get::<_, i64>(0)).unwrap(),
            0
        );
    }

    #[test]
    fn venta_pago_movil_sin_referencia_falla() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let pid = producto(&conn, 10_00);

        let v = VentaInput {
            empresa_id: eid,
            tipo: "contado".into(),
            descuento: 0,
            detalles: vec![DetalleVentaInput {
                producto_id: pid,
                cantidad: 1.0,
            }],
            pagos: vec![PagoInput {
                monto: 36_850,
                tipo_pago: "pago_movil".into(),
                moneda: "ves".into(),
                numero_referencia: None,
            }],
            operador_id: uid,
        };
        let err = crear_venta(&mut conn, &v).unwrap_err();
        assert!(err.contains("referencia"), "{err}");
    }

    #[test]
    fn venta_pago_movil_en_bs_con_referencia_ok() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let pid = producto(&conn, 10_00);
        stock(&conn, pid, 10.0);

        let v = crear_venta(
            &mut conn,
            &VentaInput {
                empresa_id: eid,
                tipo: "contado".into(),
                descuento: 0,
                detalles: vec![DetalleVentaInput {
                    producto_id: pid,
                    cantidad: 1.0,
                }],
                pagos: vec![PagoInput {
                    monto: 36_850, // Bs 368.50 = $10.00
                    tipo_pago: "pago_movil".into(),
                    moneda: "ves".into(),
                    numero_referencia: Some("R-1".into()),
                }],
                operador_id: uid,
            },
        )
        .unwrap();
        assert_eq!(v.total, 10_00);
        let (tipo, refe): (String, String) = conn
            .query_row("SELECT tipo_pago, numero_referencia FROM pagos", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(tipo, "pago_movil");
        assert_eq!(refe, "R-1");
    }

    #[test]
    fn venta_credito_sin_pagos() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let pid = producto(&conn, 10_00);
        stock(&conn, pid, 10.0);

        let v = crear_venta(&mut conn, &venta(eid, pid, uid, "credito", vec![])).unwrap();
        assert_eq!(v.tipo, "credito");
        assert_eq!(v.total, 10_00);
    }

    #[test]
    fn stock_insuficiente_rollback() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let pid = producto(&conn, 10_00);
        stock(&conn, pid, 0.5);

        let mut v = venta(eid, pid, uid, "contado", vec![pago_usd(20_00)]); // cubre $20 (2 panes)
        v.detalles[0].cantidad = 2.0; // se piden 2 panes, hay 0.5
        let err = crear_venta(&mut conn, &v).unwrap_err();
        assert!(err.contains("Stock insuficiente"), "{err}");

        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM ventas", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
        // el correlativo no se consume
        let n: Option<i64> = conn
            .query_row(
                "SELECT CAST(valor AS INTEGER) FROM config WHERE clave = 'ultimo_numero_factura'",
                [],
                |r| r.get(0),
            )
            .optional()
            .unwrap();
        assert_eq!(n, None);
    }

    #[test]
    fn correlativo_incremental() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let pid = producto(&conn, 10_00);
        stock(&conn, pid, 50.0);

        let a = crear_venta(&mut conn, &venta(eid, pid, uid, "contado", vec![pago_usd(10_00)])).unwrap();
        let b = crear_venta(&mut conn, &venta(eid, pid, uid, "contado", vec![pago_usd(10_00)])).unwrap();
        assert_eq!(a.numero_factura, 1);
        assert_eq!(b.numero_factura, 2);
    }

    #[test]
    fn anular_venta_revierte_stock() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let pid = producto(&conn, 10_00);
        stock(&conn, pid, 5.0);

        let v = crear_venta(&mut conn, &venta(eid, pid, uid, "contado", vec![pago_usd(10_00)])).unwrap();
        let stock_tras_venta: f64 = conn
            .query_row(
                "SELECT cantidad_disponible FROM stock WHERE producto_id = ?1",
                rusqlite::params![pid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(stock_tras_venta, 4.0);

        anular_venta(&mut conn, v.id, "prueba de anulación", uid).unwrap();

        let stock_tras_anular: f64 = conn
            .query_row(
                "SELECT cantidad_disponible FROM stock WHERE producto_id = ?1",
                rusqlite::params![pid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(stock_tras_anular, 5.0);

        let estado: String = conn
            .query_row("SELECT estado FROM ventas WHERE id = ?1", rusqlite::params![v.id], |r| r.get(0))
            .unwrap();
        assert_eq!(estado, "anulada");
    }

    #[test]
    fn venta_requiere_moneda_valida() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let pid = producto(&conn, 10_00);

        let v = VentaInput {
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
                moneda: "eur".into(),
                numero_referencia: None,
            }],
            operador_id: uid,
        };
        assert!(crear_venta(&mut conn, &v).is_err());
    }

    #[test]
    fn sin_caja_abierta_no_se_vende() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        let eid = empresa(&conn);
        let pid = producto(&conn, 10_00);

        let err = crear_venta(&mut conn, &venta(eid, pid, uid, "contado", vec![pago_usd(10_00)]))
            .unwrap_err();
        assert!(err.contains("abrir la caja"), "{err}");
    }
}