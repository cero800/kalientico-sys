// M7 - Pagos, estado de cuenta y anulación de ventas.
// El saldo pendiente SIEMPRE se deriva (SUM(ventas) - SUM(pagos)) — nunca se
// guarda — para que no se desincronice. Admite abonos a cuenta (sin factura).

use std::collections::HashMap;

use crate::repo;
use crate::types::{AbonoInput, EstadoCuenta, PagoLinea};
use crate::validators;
use rusqlite::{params, Connection, OptionalExtension};

/// Estado de cuenta de un cliente: facturado, pagado y saldo derivado.
/// El total facturado es en US$ (base); las devoluciones lo reducen; los pagos
/// (que pueden ser en Bs) se convierten a US$ usando la tasa congelada de CADA
/// pago. El saldo nunca es negativo (devoluciones de contado no generan
/// "crédito a favor").
pub fn estado_cuenta(conn: &Connection, empresa_id: i64) -> Result<EstadoCuenta, String> {
    let (nombre, dias_credito): (String, i64) = conn
        .query_row(
            "SELECT nombre_comercial, dias_credito FROM empresas WHERE id = ?1 AND activo = 1",
            params![empresa_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or("Empresa no encontrada")?;

    let (ventas, devuelto, pagado_f): (i64, i64, f64) = conn
        .query_row(
            "SELECT
                COALESCE((SELECT SUM(total) FROM ventas WHERE empresa_id = ?1 AND estado = 'entregada'), 0),
                COALESCE((SELECT SUM(monto) FROM devoluciones WHERE empresa_id = ?1), 0),
                COALESCE((SELECT SUM(CASE WHEN moneda = 'usd' THEN monto
                                          ELSE monto / tasa_cambio END)
                          FROM pagos WHERE empresa_id = ?1), 0)",
            params![empresa_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;
    let facturado = ventas - devuelto;
    let pagado = pagado_f.round() as i64;
    let saldo = (facturado - pagado).max(0);
    let vencido = vencido_fifo(conn, empresa_id, dias_credito, pagado)?;

    Ok(EstadoCuenta {
        empresa_id,
        nombre_comercial: nombre,
        total_facturado: facturado,
        total_pagado: pagado,
        saldo_pendiente: saldo,
        total_vencido: vencido,
        total_al_dia: (saldo - vencido).max(0),
        dias_credito,
    })
}

/// Estados de cuenta de todos los clientes (deudores o no). Los pagos en Bs se
/// convierten a US$ con la tasa congelada de cada pago. Las devoluciones reducen
/// el facturado y el saldo nunca es negativo.
pub fn estado_cuenta_todos(conn: &Connection) -> Result<Vec<EstadoCuenta>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.nombre_comercial, e.dias_credito,
                    COALESCE((SELECT SUM(total) FROM ventas WHERE empresa_id = e.id AND estado='entregada'), 0) as fact,
                    COALESCE((SELECT SUM(monto) FROM devoluciones WHERE empresa_id = e.id), 0) as dev,
                    COALESCE((SELECT SUM(CASE WHEN moneda = 'usd' THEN monto
                                              ELSE monto / tasa_cambio END)
                              FROM pagos WHERE empresa_id = e.id), 0) as pag
             FROM empresas e WHERE e.activo = 1 ORDER BY (fact - dev - pag) DESC",
        )
        .map_err(|e| e.to_string())?;
    let filas = stmt
        .query_map([], |r| {
            let fact: i64 = r.get(3)?;
            let dev: i64 = r.get(4)?;
            let pag_f: f64 = r.get(5)?;
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                fact - dev,
                pag_f.round() as i64,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    let mut ventas: HashMap<i64, Vec<(i64, bool)>> = HashMap::new();
    let mut stmt2 = conn
        .prepare(
            "SELECT v.empresa_id,
                    v.total - COALESCE((SELECT SUM(monto) FROM devoluciones WHERE venta_id = v.id), 0),
                    (date('now') <= date(v.fecha, '+' || e.dias_credito || ' days'))
             FROM ventas v JOIN empresas e ON e.id = v.empresa_id
             WHERE v.estado = 'entregada' AND e.activo = 1
             ORDER BY v.empresa_id, v.fecha ASC, v.id ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows2 = stmt2
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, bool>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for v in rows2 {
        let (eid, total, en_plazo) = v.map_err(|e| e.to_string())?;
        ventas.entry(eid).or_default().push((total, en_plazo));
    }

    Ok(filas
        .into_iter()
        .map(|(empresa_id, nombre_comercial, dias_credito, fact, pag)| {
            let saldo = (fact - pag).max(0);
            let vencido = calcular_vencido(
                ventas.get(&empresa_id).map(Vec::as_slice).unwrap_or(&[]),
                pag,
            );
            EstadoCuenta {
                empresa_id,
                nombre_comercial,
                total_facturado: fact,
                total_pagado: pag,
                saldo_pendiente: saldo,
                total_vencido: vencido,
                total_al_dia: (saldo - vencido).max(0),
                dias_credito,
            }
        })
        .collect())
}

/// Vencido de un solo cliente (para `estado_cuenta`).
/// `fecha` si vence: la venta está "al día" si `hoy <= fecha + dias_credito`.
/// Cada factura entra al FIFO por su saldo ajustado (total menos lo devuelto).
fn vencido_fifo(
    conn: &Connection,
    empresa_id: i64,
    dias_credito: i64,
    pagado: i64,
) -> Result<i64, String> {
    let mut stmt = conn
        .prepare(
            "SELECT v.total - COALESCE((SELECT SUM(monto) FROM devoluciones WHERE venta_id = v.id), 0),
                    (date('now') <= date(v.fecha, '+' || ?1 || ' days'))
             FROM ventas v WHERE v.empresa_id = ?2 AND v.estado = 'entregada'
             ORDER BY v.fecha ASC, v.id ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![dias_credito, empresa_id], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, bool>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut lineas: Vec<(i64, bool)> = Vec::new();
    for r in rows {
        lineas.push(r.map_err(|e| e.to_string())?);
    }
    Ok(calcular_vencido(&lineas, pagado))
}

/// Reparte los pagos acumulados (FIFO) sobre las ventas entregadas más antiguas:
/// lo que no queda cubierto y ya pasó su fecha límite (hoy > fecha + plazo)
/// es el total vencido.
fn calcular_vencido(lineas: &[(i64, bool)], pagado: i64) -> i64 {
    let mut por_pagar = pagado;
    let mut vencido = 0i64;
    for &(total, en_plazo) in lineas {
        if total <= 0 {
            continue;
        }
        if por_pagar >= total {
            por_pagar -= total;
        } else if por_pagar > 0 {
            if !en_plazo {
                vencido += total - por_pagar;
            }
            por_pagar = 0;
        } else if !en_plazo {
            vencido += total;
        }
    }
    vencido
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

    /// Venta a crédito; devuelve el id para poder retroceder la fecha.
    fn venta_credito_id(conn: &mut Connection, eid: i64, uid: i64, precio: i64) -> i64 {
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
        .unwrap()
        .id
    }

    fn fijar_plazo(conn: &Connection, eid: i64, dias: i64) {
        conn.execute(
            "UPDATE empresas SET dias_credito = ?1 WHERE id = ?2",
            params![dias, eid],
        )
        .unwrap();
    }

    fn retroceder(conn: &Connection, venta_id: i64, expr: &str) {
        conn.execute(
            "UPDATE ventas SET fecha = date('now', ?1) WHERE id = ?2",
            params![expr, venta_id],
        )
        .unwrap();
    }

    #[test]
    fn venta_fuera_de_plazo_quede_vencida() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        fijar_plazo(&conn, eid, 30);
        let vid = venta_credito_id(&mut conn, eid, uid, 10_00);
        retroceder(&conn, vid, "-40 days"); // vence a los 30, hoy pasó 40

        let ec = estado_cuenta(&conn, eid).unwrap();
        assert_eq!(ec.total_facturado, 10_00);
        assert_eq!(ec.saldo_pendiente, 10_00);
        assert_eq!(ec.total_vencido, 10_00);
        assert_eq!(ec.total_al_dia, 0);
        assert_eq!(ec.dias_credito, 30);
    }

    #[test]
    fn venta_dentro_de_plazo_queda_al_dia() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        fijar_plazo(&conn, eid, 30);
        venta_credito_id(&mut conn, eid, uid, 10_00); // hoy, vence en 30 días

        let ec = estado_cuenta(&conn, eid).unwrap();
        assert_eq!(ec.total_vencido, 0);
        assert_eq!(ec.total_al_dia, 10_00);
    }

    #[test]
    fn abono_saldo_la_factura_mas_antigua_fifo() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        fijar_plazo(&conn, eid, 30);
        let vieja = venta_credito_id(&mut conn, eid, uid, 10_00);
        retroceder(&conn, vieja, "-40 days"); // vencería a los 30
        venta_credito_id(&mut conn, eid, uid, 5_00); // reciente, al día

        // Abona $10: cubre la vieja; queda pendiente la nueva ($5, al día).
        registrar_abono(
            &mut conn,
            &abono(eid, uid, vec![pago(10_00, "efectivo", "usd", None)]),
        )
        .unwrap();
        let ec = estado_cuenta(&conn, eid).unwrap();
        assert_eq!(ec.saldo_pendiente, 5_00);
        assert_eq!(ec.total_vencido, 0);
        assert_eq!(ec.total_al_dia, 5_00);
    }

    #[test]
    fn abono_parcial_deja_factura_antigua_vencida() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        fijar_plazo(&conn, eid, 30);
        let vieja = venta_credito_id(&mut conn, eid, uid, 10_00);
        retroceder(&conn, vieja, "-40 days");
        venta_credito_id(&mut conn, eid, uid, 5_00); // reciente

        // Abona solo $5: la vieja queda con $5 vencidos, la nueva al día.
        registrar_abono(
            &mut conn,
            &abono(eid, uid, vec![pago(5_00, "efectivo", "usd", None)]),
        )
        .unwrap();
        let ec = estado_cuenta(&conn, eid).unwrap();
        assert_eq!(ec.saldo_pendiente, 10_00);
        assert_eq!(ec.total_vencido, 5_00);
        assert_eq!(ec.total_al_dia, 5_00);
    }

    #[test]
    fn plazo_cero_deja_vencida_la_venta_de_ayer() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        fijar_plazo(&conn, eid, 0);
        let vid = venta_credito_id(&mut conn, eid, uid, 10_00);
        retroceder(&conn, vid, "-1 day"); // venció ayer (plazo = 0)

        let ec = estado_cuenta(&conn, eid).unwrap();
        assert_eq!(ec.total_vencido, 10_00);
        assert_eq!(ec.total_al_dia, 0);
    }

    #[test]
    fn estado_cuenta_todos_incluye_vencido_y_al_dia() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        fijar_plazo(&conn, eid, 30);
        let vid = venta_credito_id(&mut conn, eid, uid, 10_00);
        retroceder(&conn, vid, "-40 days");

        let todos = estado_cuenta_todos(&conn).unwrap();
        let ec = todos.iter().find(|e| e.empresa_id == eid).unwrap();
        assert_eq!(ec.total_vencido, 10_00);
        assert_eq!(ec.total_al_dia, 0);
    }
}

// Anulación se agrega en M7c junto con la reversión de stock (depende de repo::reponer_stock).
