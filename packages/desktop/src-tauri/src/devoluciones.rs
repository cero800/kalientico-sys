// Ajustes por panes deteriorados/extraviados que el cliente devuelve y la
// panadería descuenta de su cuenta. La devolución resta del total facturado de
// la empresa (baja el saldo si hay deuda); NO toca stock, caja ni la factura
// original. Saldo = facturado - pagado - devoluciones (sin saldos negativos).

use crate::repo;
use crate::types::{DetalleVentaDevolucion, Devolucion, DevolucionInput, VentaDevolucion};
use crate::validators;
use rusqlite::{params, Connection, OptionalExtension};

/// Registra una devolución vinculada a una factura entregada.
/// Regla: lo devuelto de una factura no puede superar su total original
/// (ni lo ya devuelto con anterioridad).
pub fn registrar_devolucion(
    conn: &mut Connection,
    d: &DevolucionInput,
) -> Result<Devolucion, String> {
    validators::validar_monto_positivo(d.monto, "Monto de la devolución")?;
    repo::empresa_existe(conn, d.empresa_id)?;

    let venta: (i64, i64, String) = conn
        .query_row(
            "SELECT id, total, estado FROM ventas WHERE id = ?1 AND empresa_id = ?2",
            params![d.venta_id, d.empresa_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or("Venta no encontrada para esta empresa")?;
    if venta.2 != "entregada" {
        return Err("Solo se pueden devolver ventas entregadas".to_string());
    }

    let ya_devuelto: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(monto), 0) FROM devoluciones WHERE venta_id = ?1",
            params![d.venta_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if d.monto > venta.1 - ya_devuelto {
        return Err(format!(
            "La devolución ({} centavos US$) supera el saldo devoluble de la factura ({} centavos US$)",
            d.monto,
            venta.1 - ya_devuelto
        ));
    }

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO devoluciones (empresa_id, venta_id, monto, motivo, operador_id)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![d.empresa_id, d.venta_id, d.monto, d.motivo, d.operador_id],
    )
    .map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();
    tx.commit().map_err(|e| e.to_string())?;

    Ok(Devolucion {
        id,
        empresa_id: d.empresa_id,
        venta_id: d.venta_id,
        numero_factura: conn
            .query_row(
                "SELECT numero_factura FROM ventas WHERE id = ?1",
                params![d.venta_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?,
        monto: d.monto,
        motivo: d.motivo.clone(),
        operador_id: d.operador_id,
        fecha_devolucion: None,
    })
}

/// Facturas entregadas de una empresa con lo ya devuelto (para el historial
/// y saber cuánto queda por devolver → `total - devuelto`).
pub fn listar_ventas_empresa(
    conn: &Connection,
    empresa_id: i64,
) -> Result<Vec<VentaDevolucion>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT v.id, v.numero_factura, v.tipo, v.fecha, v.total,
                    COALESCE((SELECT SUM(monto) FROM devoluciones WHERE venta_id = v.id), 0)
             FROM ventas v
             WHERE v.empresa_id = ?1 AND v.estado = 'entregada'
             ORDER BY v.fecha ASC, v.id ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![empresa_id], |r| {
            Ok(VentaDevolucion {
                venta_id: r.get(0)?,
                numero_factura: r.get(1)?,
                tipo: r.get(2)?,
                fecha: r.get(3)?,
                total: r.get(4)?,
                devuelto: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<VentaDevolucion>>>()
        .map_err(|e| e.to_string())
}

/// Líneas de una factura con producto, cantidad y precio (para el modal).
pub fn detalle_venta(
    conn: &Connection,
    venta_id: i64,
) -> Result<Vec<DetalleVentaDevolucion>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT d.producto_id, p.nombre, d.cantidad, d.precio_unitario, d.subtotal
             FROM detalle_ventas d
             JOIN productos p ON p.id = d.producto_id
             WHERE d.venta_id = ?1
             ORDER BY d.id ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![venta_id], |r| {
            Ok(DetalleVentaDevolucion {
                producto_id: r.get(0)?,
                nombre: r.get(1)?,
                cantidad: r.get(2)?,
                precio_unitario: r.get(3)?,
                subtotal: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<DetalleVentaDevolucion>>>()
        .map_err(|e| e.to_string())
}

/// Historial de devoluciones de una empresa.
pub fn listar_devoluciones(conn: &Connection, empresa_id: i64) -> Result<Vec<Devolucion>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT d.id, d.empresa_id, d.venta_id, v.numero_factura, d.monto, d.motivo, d.operador_id, d.fecha_devolucion
             FROM devoluciones d
             LEFT JOIN ventas v ON v.id = d.venta_id
             WHERE d.empresa_id = ?1
             ORDER BY d.fecha_devolucion DESC, d.id DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![empresa_id], |r| {
            Ok(Devolucion {
                id: r.get(0)?,
                empresa_id: r.get(1)?,
                venta_id: r.get(2)?,
                numero_factura: r.get(3)?,
                monto: r.get(4)?,
                motivo: r.get(5)?,
                operador_id: r.get(6)?,
                fecha_devolucion: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<Devolucion>>>()
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::*;
    use crate::types::{DetalleVentaInput, VentaInput};

    fn venta_entregada(conn: &mut Connection, eid: i64, uid: i64, precio: i64) -> i64 {
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

    fn devolucion(
        eid: i64,
        vid: i64,
        monto: i64,
        motivo: Option<&str>,
        uid: i64,
    ) -> DevolucionInput {
        DevolucionInput {
            empresa_id: eid,
            venta_id: vid,
            monto,
            motivo: motivo.map(String::from),
            operador_id: uid,
        }
    }

    #[test]
    fn registrar_devolucion_reduce_el_saldo() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let vid = venta_entregada(&mut conn, eid, uid, 10_00); // $10

        registrar_devolucion(
            &mut conn,
            &devolucion(eid, vid, 2_50, Some("Pan agrio"), uid),
        )
        .unwrap();
        let ec = crate::pagos::estado_cuenta(&conn, eid).unwrap();
        assert_eq!(ec.total_facturado, 7_50);
        assert_eq!(ec.saldo_pendiente, 7_50);
    }

    #[test]
    fn devolucion_no_puede_superar_el_total_facturado_ni_repetirse() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let vid = venta_entregada(&mut conn, eid, uid, 10_00);

        registrar_devolucion(&mut conn, &devolucion(eid, vid, 10_00, None, uid)).unwrap();
        // Segunda devolución sobre lo ya devuelto → falla.
        let err =
            registrar_devolucion(&mut conn, &devolucion(eid, vid, 1_00, None, uid)).unwrap_err();
        assert!(err.contains("supera"), "{err}");

        let err =
            registrar_devolucion(&mut conn, &devolucion(eid, vid, 20_00, None, uid)).unwrap_err();
        assert!(err.contains("supera"), "{err}");
        assert_eq!(listar_devoluciones(&conn, eid).unwrap().len(), 1);
    }

    #[test]
    fn solo_se_devuelven_ventas_entregadas_de_la_misma_empresa() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let otro = repo::crear_empresa(
            &conn,
            &crate::types::EmpresaInput {
                rut_nit: "99999".into(),
                nombre_comercial: "Otra S.A.".into(),
                razon_social: None,
                telefono: None,
                email: None,
                direccion: None,
                dias_credito: 30,
                limite_credito: 0,
                activo: true,
            },
        )
        .unwrap();
        let vid = venta_entregada(&mut conn, eid, uid, 10_00);

        let err =
            registrar_devolucion(&mut conn, &devolucion(otro, vid, 1_00, None, uid)).unwrap_err();
        assert!(err.contains("Venta no encontrada"), "{err}");
    }

    #[test]
    fn listar_ventas_empresa_muestra_devuelto_y_saldo_devoluble() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let vid = venta_entregada(&mut conn, eid, uid, 10_00);
        registrar_devolucion(&mut conn, &devolucion(eid, vid, 4_00, None, uid)).unwrap();

        let filas = listar_ventas_empresa(&conn, eid).unwrap();
        assert_eq!(filas.len(), 1);
        assert_eq!(filas[0].total, 10_00);
        assert_eq!(filas[0].devuelto, 4_00);
        assert_eq!(filas[0].total - filas[0].devuelto, 6_00);
    }

    #[test]
    fn detalle_venta_retorna_lineas_con_producto() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let pid = producto(&conn, 5_00);
        stock(&conn, pid, 20.0);
        let vid = crate::ventas::crear_venta(
            &mut conn,
            &VentaInput {
                empresa_id: eid,
                tipo: "contado".into(),
                descuento: 0,
                detalles: vec![DetalleVentaInput {
                    producto_id: pid,
                    cantidad: 4.0,
                }],
                pagos: vec![crate::types::PagoInput {
                    monto: 20_00,
                    tipo_pago: "efectivo".into(),
                    moneda: "usd".into(),
                    numero_referencia: None,
                }],
                operador_id: uid,
            },
        )
        .unwrap()
        .id;

        let lineas = detalle_venta(&conn, vid).unwrap();
        assert_eq!(lineas.len(), 1);
        assert_eq!(lineas[0].nombre, "Pan 500");
        assert_eq!(lineas[0].cantidad, 4.0);
        assert_eq!(lineas[0].precio_unitario, 5_00);
        assert_eq!(lineas[0].subtotal, 20_00);
    }

    #[test]
    fn devolucion_validada_si_monto_invalido() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let vid = venta_entregada(&mut conn, eid, uid, 10_00);

        let err =
            registrar_devolucion(&mut conn, &devolucion(eid, vid, -5, None, uid)).unwrap_err();
        assert!(err.contains("mayor que 0"), "{err}");
    }
}
