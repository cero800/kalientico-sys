// M10 - Factura / comprobante imprimible de una venta.
// Reúne la cabecera de la venta, los datos del cliente, el detalle de productos,
// los pagos registrados y los datos del negocio emisor (desde `config`),
// para mostrarse y enviarse a imprimir después de cada compra.

use crate::reporte::get_config;
use crate::types::{Factura, FacturaDetalle, FacturaPago};
use rusqlite::{params, Connection, OptionalExtension};

/// Claves de configuración de los datos del negocio que encabeza la factura.
pub const KEY_NEGOCIO_NOMBRE: &str = "negocio_nombre";
pub const KEY_NEGOCIO_RIF: &str = "negocio_rif";
pub const KEY_NEGOCIO_TELEFONO: &str = "negocio_telefono";
pub const KEY_NEGOCIO_DIRECCION: &str = "negocio_direccion";

/// Factura completa de una venta (cabecera + cliente + detalle + pagos).
pub fn factura_venta(conn: &Connection, venta_id: i64) -> Result<Factura, String> {
    let (
        empresa_id,
        numero_factura,
        tipo,
        estado,
        fecha,
        subtotal,
        descuento,
        impuesto,
        total,
        tasa_cambio,
    ): (i64, i64, String, String, String, i64, i64, i64, i64, f64) = conn
        .query_row(
            "SELECT empresa_id, numero_factura, tipo, estado, fecha,
                    subtotal, descuento, impuesto, total, tasa_cambio
             FROM ventas WHERE id = ?1",
            params![venta_id],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                    r.get(8)?,
                    r.get(9)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Venta no encontrada".to_string())?;

    let (cliente, cliente_rif): (String, String) = conn
        .query_row(
            "SELECT nombre_comercial, rut_nit FROM empresas WHERE id = ?1",
            params![empresa_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "Cliente no encontrado".to_string())?;

    let negocio = |clave: &str| get_config(conn, clave).unwrap_or(None).unwrap_or_default();

    let mut detalle = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT p.nombre, d.cantidad, d.precio_unitario, d.subtotal
                 FROM detalle_ventas d
                 JOIN productos p ON p.id = d.producto_id
                 WHERE d.venta_id = ?1
                 ORDER BY d.id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![venta_id], |r| {
                Ok(FacturaDetalle {
                    producto: r.get(0)?,
                    cantidad: r.get(1)?,
                    precio_unitario: r.get(2)?,
                    subtotal: r.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for det in rows {
            detalle.push(det.map_err(|e| e.to_string())?);
        }
    }

    let mut pagos = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT tipo_pago, moneda, monto, numero_referencia
                 FROM pagos WHERE venta_id = ?1 ORDER BY id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![venta_id], |r| {
                Ok(FacturaPago {
                    tipo_pago: r.get(0)?,
                    moneda: r.get(1)?,
                    monto: r.get(2)?,
                    numero_referencia: r.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for p in rows {
            pagos.push(p.map_err(|e| e.to_string())?);
        }
    }

    // Devoluciones de la venta (qué se devolvió y cuánto): muestra cómo quedó
    // la venta tras los ajustes por panes deteriorados.
    let mut devoluciones = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT d.id, d.venta_id, v.numero_factura, e.nombre_comercial, d.monto,
                        d.motivo, COALESCE(u.nombre, ''), d.fecha_devolucion
                 FROM devoluciones d
                 JOIN ventas v ON v.id = d.venta_id
                 JOIN empresas e ON e.id = d.empresa_id
                 LEFT JOIN usuarios u ON u.id = d.operador_id
                 WHERE d.venta_id = ?1
                 ORDER BY d.id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![venta_id], |r| {
                Ok(crate::types::ResumenDiaDevolucion {
                    id: r.get(0)?,
                    venta_id: r.get(1)?,
                    numero_factura: r.get(2)?,
                    cliente: r.get(3)?,
                    monto: r.get(4)?,
                    motivo: r.get(5)?,
                    operador_nombre: r.get(6)?,
                    fecha_devolucion: r.get(7)?,
                    detalle: Vec::new(),
                })
            })
            .map_err(|e| e.to_string())?;
        for dev in rows {
            let mut dev = dev.map_err(|e| e.to_string())?;
            dev.detalle = crate::devoluciones::detalle_devolucion(conn, dev.id)?;
            devoluciones.push(dev);
        }
    }

    Ok(Factura {
        venta_id,
        numero_factura,
        tipo,
        estado,
        fecha,
        cliente,
        cliente_rif,
        negocio_nombre: negocio(KEY_NEGOCIO_NOMBRE),
        negocio_rif: negocio(KEY_NEGOCIO_RIF),
        negocio_telefono: negocio(KEY_NEGOCIO_TELEFONO),
        negocio_direccion: negocio(KEY_NEGOCIO_DIRECCION),
        subtotal,
        descuento,
        impuesto,
        total,
        tasa_cambio,
        detalle,
        pagos,
        devoluciones,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::*;
    use crate::types::{DetalleVentaInput, PagoInput, VentaInput};
    use crate::ventas::crear_venta;

    #[test]
    fn factura_devuelve_cabecera_detalle_pagos_y_negocio() {
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
                    cantidad: 2.0,
                }],
                pagos: vec![PagoInput {
                    monto: 20_00,
                    tipo_pago: "efectivo".into(),
                    moneda: "usd".into(),
                    numero_referencia: None,
                }],
                operador_id: uid,
            },
        )
        .unwrap();

        set_config_negocio(&conn);

        let f = factura_venta(&conn, v.id).unwrap();
        assert_eq!(f.numero_factura, 1);
        assert_eq!(f.cliente, "Pan S.A.");
        assert_eq!(f.negocio_nombre, "Panadería El Trigal");
        assert_eq!(f.negocio_rif, "J-99999999-9");
        assert_eq!(f.total, 20_00);
        assert_eq!(f.detalle.len(), 1);
        assert_eq!(f.detalle[0].cantidad, 2.0);
        assert_eq!(f.detalle[0].subtotal, 20_00);
        assert!((f.tasa_cambio - 36.85).abs() < 1e-9);
        assert_eq!(f.pagos.len(), 1);
        assert_eq!(f.pagos[0].moneda, "usd");
    }

    #[test]
    fn factura_inexistente_falla() {
        let conn = conn();
        assert!(factura_venta(&conn, 999).is_err());
    }

    #[test]
    fn factura_muestra_las_devoluciones_y_como_quedo_la_venta() {
        let mut conn = conn();
        tasa(&conn, 36.85);
        let uid = usuario(&conn);
        abrir(&conn, uid);
        let eid = empresa(&conn);
        let pid = producto(&conn, 5_00);
        stock(&conn, pid, 20.0);

        let v = crear_venta(
            &mut conn,
            &VentaInput {
                empresa_id: eid,
                tipo: "credito".into(),
                descuento: 0,
                detalles: vec![DetalleVentaInput {
                    producto_id: pid,
                    cantidad: 4.0,
                }],
                pagos: vec![],
                operador_id: uid,
            },
        )
        .unwrap();

        // Se devuelven 2 unidades a $5 → $10.
        crate::devoluciones::registrar_devolucion(
            &mut conn,
            &crate::types::DevolucionInput {
                empresa_id: eid,
                venta_id: v.id,
                monto: 10_00,
                motivo: Some("Pan duro".into()),
                operador_id: uid,
                detalle: Some(vec![crate::types::DetalleDevolucionInput {
                    producto_id: pid,
                    cantidad: 2.0,
                    precio_unitario: 5_00,
                }]),
            },
        )
        .unwrap();

        let f = factura_venta(&conn, v.id).unwrap();
        assert_eq!(f.total, 20_00);
        assert_eq!(f.devoluciones.len(), 1);
        assert_eq!(f.devoluciones[0].monto, 10_00);
        assert_eq!(f.devoluciones[0].motivo.as_deref(), Some("Pan duro"));
        assert_eq!(f.devoluciones[0].detalle.len(), 1);
        assert_eq!(f.devoluciones[0].detalle[0].nombre, "Pan 500");
        assert_eq!(f.devoluciones[0].detalle[0].cantidad, 2.0);
    }

    fn set_config_negocio(conn: &Connection) {
        crate::reporte::set_config(conn, KEY_NEGOCIO_NOMBRE, "Panadería El Trigal").unwrap();
        crate::reporte::set_config(conn, KEY_NEGOCIO_RIF, "J-99999999-9").unwrap();
        crate::reporte::set_config(conn, KEY_NEGOCIO_TELEFONO, "0412-000-0000").unwrap();
        crate::reporte::set_config(conn, KEY_NEGOCIO_DIRECCION, "Av. Principal").unwrap();
    }
}
