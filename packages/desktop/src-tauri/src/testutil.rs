// Utilidades para tests unitarios. Solo se compila bajo #[cfg(test)].

use crate::caja;
use crate::repo;
use crate::reporte;
use crate::types::*;
use rusqlite::Connection;

pub fn conn() -> Connection {
    crate::db::test_conn()
}

pub fn tasa(conn: &Connection, v: f64) {
    reporte::set_config(conn, reporte::KEY_TASA_CAMBIO, &v.to_string()).unwrap();
}

pub fn usuario(conn: &Connection) -> i64 {
    repo::crear_usuario(
        conn,
        &UsuarioInput {
            nombre: "Test".into(),
            rol: "admin".into(),
            activo: true,
        },
    )
    .unwrap()
}

pub fn empresa(conn: &Connection) -> i64 {
    repo::crear_empresa(
        conn,
        &EmpresaInput {
            rut_nit: "12345".into(),
            nombre_comercial: "Pan S.A.".into(),
            razon_social: None,
            telefono: None,
            email: None,
            direccion: None,
            dias_credito: 30,
            limite_credito: 0,
            activo: true,
        },
    )
    .unwrap()
}

pub fn producto(conn: &Connection, precio: i64) -> i64 {
    repo::crear_producto(
        conn,
        &ProductoInput {
            codigo: format!("P{precio}"),
            nombre: format!("Pan {precio}"),
            descripcion: None,
            unidad_medida: "unidad".into(),
            precio_base: precio,
            precio_mayoreo: 0,
            impuesto_porcentaje: 0.0,
            activo: true,
        },
    )
    .unwrap()
}

pub fn stock(conn: &Connection, producto_id: i64, cantidad: f64) {
    conn.execute(
        "UPDATE stock SET cantidad_disponible = ?1 WHERE producto_id = ?2",
        rusqlite::params![cantidad, producto_id],
    )
    .unwrap();
}

pub fn abrir(conn: &Connection, operador_id: i64, usd: i64, ves: i64) {
    caja::abrir_caja(
        conn,
        &CajaAbrirInput {
            operador_id,
            efectivo_inicial_usd: usd,
            efectivo_inicial_ves: ves,
        },
    )
    .unwrap();
}
