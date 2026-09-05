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
    rows.collect::<rusqlite::Result<Vec<EstadoCuenta>>>().map_err(|e| e.to_string())
}

/// Registra un abono a cuenta (no asociado a una factura).
pub fn registrar_abono(conn: &Connection, a: &AbonoInput) -> Result<(), String> {
    crate::caja::exigir_caja_abierta(conn)?;
    validators::validar_monto_positivo(a.monto, "Monto del abono")?;
    validators::validar_tipo_pago(&a.tipo_pago)?;
    validators::validar_moneda(&a.moneda)?;
    validators::validar_combinacion_pago(&a.tipo_pago, &a.moneda, a.numero_referencia.as_deref())?;
    repo::empresa_existe(conn, a.empresa_id)?;
    let tasa_cambio = crate::reporte::get_tasa_cambio(conn)?;
    conn.execute(
        "INSERT INTO pagos (empresa_id, venta_id, monto, tipo_pago, moneda, tasa_cambio, numero_referencia, operador_id)
         VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            a.empresa_id,
            a.monto,
            a.tipo_pago,
            a.moneda,
            tasa_cambio,
            a.numero_referencia,
            a.operador_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
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
    rows.collect::<rusqlite::Result<Vec<PagoLinea>>>().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::*;
    use crate::types::AbonoInput;

    fn abono(eid: i64, uid: i64, monto: i64, moneda: &str) -> AbonoInput {
        AbonoInput {
            empresa_id: eid,
            monto,
            tipo_pago: "efectivo".into(),
            moneda: moneda.into(),
            numero_referencia: None,
            operador_id: uid,
        }
    }

    #[test]
    fn abono_en_ves_se_convierte_a_usd_en_estado_cuenta() {
        let conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);

        registrar_abono(&conn, &abono(eid, uid, 36_850, "ves")).unwrap(); // Bs 368.50 = $10

        let ec = estado_cuenta(&conn, eid).unwrap();
        assert_eq!(ec.total_pagado, 10_00);
        assert_eq!(ec.saldo_pendiente, -10_00); // abono sin factura previa
    }

    #[test]
    fn historial_incluye_moneda_y_tasa() {
        let conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);

        registrar_abono(&conn, &abono(eid, uid, 10_00, "usd")).unwrap();
        registrar_abono(&conn, &abono(eid, uid, 36_850, "ves")).unwrap();

        let historial = historial_pagos(&conn, eid).unwrap();
        assert_eq!(historial.len(), 2);
        assert!(historial.iter().any(|p| p.moneda == "usd"));
        assert!(historial.iter().any(|p| p.moneda == "ves" && p.tasa_cambio == 36.85));
    }

    #[test]
    fn abono_con_moneda_invalida_falla() {
        let conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);

        let err = registrar_abono(&conn, &abono(eid, uid, 100, "eur")).unwrap_err();
        assert!(err.contains("Moneda inválida"), "{err}");
    }

    #[test]
    fn abono_pago_movil_sin_referencia_falla() {
        let conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);

        let a = AbonoInput {
            empresa_id: eid,
            monto: 36_850,
            tipo_pago: "pago_movil".into(),
            moneda: "ves".into(),
            numero_referencia: None,
            operador_id: uid,
        };
        let err = registrar_abono(&conn, &a).unwrap_err();
        assert!(err.contains("referencia"), "{err}");
    }

    #[test]
    fn abono_pago_movil_en_bs_con_referencia_ok() {
        let conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);

        let a = AbonoInput {
            empresa_id: eid,
            monto: 36_850,
            tipo_pago: "pago_movil".into(),
            moneda: "ves".into(),
            numero_referencia: Some("R-99".into()),
            operador_id: uid,
        };
        registrar_abono(&conn, &a).unwrap();
        let (tipo, refe): (String, String) = conn
            .query_row("SELECT tipo_pago, numero_referencia FROM pagos", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(tipo, "pago_movil");
        assert_eq!(refe, "R-99");
    }
}

// Anulación se agrega en M7c junto con la reversión de stock (depende de repo::reponer_stock).