// M7 - Pagos, estado de cuenta y anulación de ventas.
// El saldo pendiente SIEMPRE se deriva (SUM(ventas) - SUM(pagos)) — nunca se
// guarda — para que no se desincronice. Admite abonos a cuenta (sin factura).

use crate::repo;
use crate::types::{AbonoInput, EstadoCuenta, PagoLinea};
use crate::validators;
use rusqlite::{params, Connection, OptionalExtension};

/// Estado de cuenta de un cliente: facturado, pagado y saldo derivado.
/// El total facturado es en US$ (base); los pagos (que pueden ser en Bs) se
/// convierten a US$ usando la tasa congelada de CADA pago.
pub fn estado_cuenta(conn: &Connection, empresa_id: i64) -> Result<EstadoCuenta, String> {
    let nombre: Option<String> = conn
        .query_row(
            "SELECT nombre_comercial FROM empresas WHERE id = ?1 AND activo = 1",
            params![empresa_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let nombre = nombre.ok_or("Empresa no encontrada")?;

    let (facturado, pagado_f): (i64, f64) = conn
        .query_row(
            "SELECT
                COALESCE((SELECT SUM(total) FROM ventas WHERE empresa_id = ?1 AND estado = 'entregada'), 0),
                COALESCE((SELECT SUM(CASE WHEN moneda = 'usd' THEN monto
                                          ELSE monto / tasa_cambio END)
                          FROM pagos WHERE empresa_id = ?1), 0)",
            params![empresa_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let pagado = pagado_f.round() as i64;

    Ok(EstadoCuenta {
        empresa_id,
        nombre_comercial: nombre,
        total_facturado: facturado,
        total_pagado: pagado,
        saldo_pendiente: facturado - pagado,
    })
}

/// Estados de cuenta de todos los clientes (deudores o no). Los pagos en Bs se
/// convierten a US$ con la tasa congelada de cada pago.
pub fn estado_cuenta_todos(conn: &Connection) -> Result<Vec<EstadoCuenta>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.nombre_comercial,
                    COALESCE((SELECT SUM(total) FROM ventas WHERE empresa_id = e.id AND estado='entregada'), 0) as fact,
                    COALESCE((SELECT SUM(CASE WHEN moneda = 'usd' THEN monto
                                              ELSE monto / tasa_cambio END)
                              FROM pagos WHERE empresa_id = e.id), 0) as pag
             FROM empresas e WHERE e.activo = 1 ORDER BY (fact - pag) DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            let fact: i64 = r.get(2)?;
            let pag_f: f64 = r.get(3)?;
            let pag = pag_f.round() as i64;
            Ok(EstadoCuenta {
                empresa_id: r.get(0)?,
                nombre_comercial: r.get(1)?,
                total_facturado: fact,
                total_pagado: pag,
                saldo_pendiente: fact - pag,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<EstadoCuenta>>>()
        .map_err(|e| e.to_string())
}

/// Registra un abono a cuenta (no asociado a una factura).
/// Admite uno o más pagos (mixtos) que en conjunto NO superan el saldo
/// pendiente del cliente (sin sobrepago: no se genera crédito a favor).
/// La inserción de todos los pagos es atómica (una sola transacción).
pub fn registrar_abono(conn: &mut Connection, a: &AbonoInput) -> Result<(), String> {
    crate::caja::exigir_caja_abierta(conn)?;
    if a.pagos.is_empty() {
        return Err("El abono debe tener al menos un pago".to_string());
    }
    repo::empresa_existe(conn, a.empresa_id)?;

    let saldo_pendiente = estado_cuenta(conn, a.empresa_id)?.saldo_pendiente;
    if saldo_pendiente <= 0 {
        return Err("El cliente no tiene saldo pendiente".to_string());
    }

    let tasa_cambio = crate::reporte::get_tasa_cambio(conn)?;
    let mut total_pagado_usd: i64 = 0;
    for p in &a.pagos {
        validators::validar_monto_positivo(p.monto, "Monto del abono")?;
        validators::validar_tipo_pago(&p.tipo_pago)?;
        validators::validar_moneda(&p.moneda)?;
        validators::validar_combinacion_pago(
            &p.tipo_pago,
            &p.moneda,
            p.numero_referencia.as_deref(),
        )?;
        total_pagado_usd += validators::a_usd(p.monto, &p.moneda, tasa_cambio)?;
    }
    if total_pagado_usd > saldo_pendiente {
        return Err(format!(
            "El abono ({total_pagado_usd} centavos US$) supera el saldo pendiente ({saldo_pendiente} centavos US$)"
        ));
    }

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for p in &a.pagos {
        tx.execute(
            "INSERT INTO pagos (empresa_id, venta_id, monto, tipo_pago, moneda, tasa_cambio, numero_referencia, operador_id)
             VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                a.empresa_id,
                p.monto,
                p.tipo_pago,
                p.moneda,
                tasa_cambio,
                p.numero_referencia,
                a.operador_id,
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

/// Historial de pagos (incluidos abonos a cuenta) de una empresa.
pub fn historial_pagos(conn: &Connection, empresa_id: i64) -> Result<Vec<PagoLinea>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.venta_id, v.numero_factura, p.monto, p.tipo_pago, p.moneda, p.tasa_cambio, p.numero_referencia, p.fecha_pago
             FROM pagos p
             LEFT JOIN ventas v ON v.id = p.venta_id
             WHERE p.empresa_id = ?1
             ORDER BY p.fecha_pago DESC, p.id DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![empresa_id], |r| {
            Ok(PagoLinea {
                id: r.get(0)?,
                venta_id: r.get(1)?,
                numero_factura: r.get(2)?,
                monto: r.get(3)?,
                tipo_pago: r.get(4)?,
                moneda: r.get(5)?,
                tasa_cambio: r.get(6)?,
                numero_referencia: r.get(7)?,
                fecha_pago: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<PagoLinea>>>()
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::*;
    use crate::types::{AbonoInput, DetalleVentaInput, PagoInput, VentaInput};

    fn pago(monto: i64, tipo: &str, moneda: &str, refe: Option<&str>) -> PagoInput {
        PagoInput {
            monto,
            tipo_pago: tipo.into(),
            moneda: moneda.into(),
            numero_referencia: refe.map(String::from),
        }
    }

    fn abono(eid: i64, uid: i64, pagos: Vec<PagoInput>) -> AbonoInput {
        AbonoInput {
            empresa_id: eid,
            pagos,
            operador_id: uid,
        }
    }

    /// Deja al cliente con una deuda de `precio` (venta a crédito).
    fn dejar_deuda(conn: &mut Connection, eid: i64, uid: i64, precio: i64) {
        let pid = producto(conn, precio);
        stock(conn, pid, 20.0);
        crate::ventas::crear_venta(
            conn,
            &VentaInput {
                empresa_id: eid,
                tipo: "credito".into(),
                descuento: 0,
                detalles: vec![DetalleVentaInput {
                    producto_id: pid,
                    cantidad: 1.0,
                }],
                pagos: vec![],
                operador_id: uid,
            },
        )
        .unwrap();
    }

    #[test]
    fn abono_en_ves_se_convierte_a_usd_en_estado_cuenta() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        dejar_deuda(&mut conn, eid, uid, 10_00); // debe $10

        registrar_abono(
            &mut conn,
            &abono(eid, uid, vec![pago(36_850, "efectivo", "ves", None)]),
        )
        .unwrap(); // Bs 368.50 = $10

        let ec = estado_cuenta(&conn, eid).unwrap();
        assert_eq!(ec.total_pagado, 10_00);
        assert_eq!(ec.saldo_pendiente, 0);
    }

    #[test]
    fn historial_incluye_moneda_y_tasa() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        dejar_deuda(&mut conn, eid, uid, 10_00); // $10
        dejar_deuda(&mut conn, eid, uid, 15_00); // $15 → debe $25

        registrar_abono(
            &mut conn,
            &abono(eid, uid, vec![pago(10_00, "efectivo", "usd", None)]),
        )
        .unwrap();
        registrar_abono(
            &mut conn,
            &abono(eid, uid, vec![pago(36_850, "efectivo", "ves", None)]),
        )
        .unwrap();

        let historial = historial_pagos(&conn, eid).unwrap();
        assert_eq!(historial.len(), 2);
        assert!(historial.iter().any(|p| p.moneda == "usd"));
        assert!(historial
            .iter()
            .any(|p| p.moneda == "ves" && p.tasa_cambio == 36.85));
    }

    #[test]
    fn abono_con_moneda_invalida_falla() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        dejar_deuda(&mut conn, eid, uid, 10_00);
        let err = registrar_abono(
            &mut conn,
            &abono(eid, uid, vec![pago(100, "efectivo", "eur", None)]),
        )
        .unwrap_err();
        assert!(err.contains("Moneda inválida"), "{err}");
    }

    #[test]
    fn abono_sin_saldo_pendiente_falla() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);

        let err = registrar_abono(
            &mut conn,
            &abono(eid, uid, vec![pago(10_00, "efectivo", "usd", None)]),
        )
        .unwrap_err();
        assert!(err.contains("saldo pendiente"), "{err}");
    }

    #[test]
    fn abono_supera_saldo_falla() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        dejar_deuda(&mut conn, eid, uid, 10_00); // debe $10

        let err = registrar_abono(
            &mut conn,
            &abono(eid, uid, vec![pago(11_00, "efectivo", "usd", None)]),
        )
        .unwrap_err();
        assert!(err.contains("supera"), "{err}");
        // Ningún pago quedó registrado.
        assert_eq!(historial_pagos(&conn, eid).unwrap().len(), 0);
    }

    #[test]
    fn abono_pago_movil_sin_referencia_falla() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        dejar_deuda(&mut conn, eid, uid, 10_00);

        let a = abono(
            eid,
            uid,
            vec![
                pago(36_850, "pago_movil", "ves", None),
                pago(5_00, "efectivo", "usd", None),
            ],
        );
        let err = registrar_abono(&mut conn, &a).unwrap_err();
        assert!(err.contains("referencia"), "{err}");
        assert_eq!(historial_pagos(&conn, eid).unwrap().len(), 0);
    }

    #[test]
    fn abono_mixto_de_varias_formas_ok() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        dejar_deuda(&mut conn, eid, uid, 10_00); // $10
        dejar_deuda(&mut conn, eid, uid, 10_50); // $10.50 → debe $20.50

        registrar_abono(
            &mut conn,
            &abono(
                eid,
                uid,
                vec![
                    pago(5_00, "efectivo", "usd", None),            // $5
                    pago(18_425, "pago_movil", "ves", Some("R-1")), // $5
                    pago(14_740, "punto", "ves", Some("R-2")),      // $4
                ],
            ),
        )
        .unwrap();

        let ec = estado_cuenta(&conn, eid).unwrap();
        assert_eq!(ec.total_pagado, 14_00);
        assert_eq!(ec.saldo_pendiente, 6_50);
        assert_eq!(historial_pagos(&conn, eid).unwrap().len(), 3);
    }

    #[test]
    fn abono_punto_sin_referencia_ok() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        dejar_deuda(&mut conn, eid, uid, 10_00); // debe $10

        registrar_abono(
            &mut conn,
            &abono(eid, uid, vec![pago(36_850, "punto", "ves", None)]),
        )
        .unwrap();
        assert_eq!(estado_cuenta(&conn, eid).unwrap().saldo_pendiente, 0);
    }

    #[test]
    fn abono_pago_movil_en_bs_con_referencia_ok() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        dejar_deuda(&mut conn, eid, uid, 10_00);

        let a = abono(
            eid,
            uid,
            vec![pago(36_850, "pago_movil", "ves", Some("R-99"))],
        );
        registrar_abono(&mut conn, &a).unwrap();
        let (tipo, refe): (String, String) = conn
            .query_row("SELECT tipo_pago, numero_referencia FROM pagos", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(tipo, "pago_movil");
        assert_eq!(refe, "R-99");
    }
}

// Anulación se agrega en M7c junto con la reversión de stock (depende de repo::reponer_stock).
