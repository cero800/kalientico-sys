// Acceso a datos. Cada función recibe &Connection y devuelve Result<_, String>.

use crate::types::{
    Empresa, EmpresaInput, PrecioCliente, PrecioClienteInput, Producto, ProductoInput, Usuario,
    UsuarioInput,
};
use crate::validators;
use rusqlite::{params, Connection, OptionalExtension, Result as SqlResult};

//---------------------------------------------------------------------------
// Empresas
//---------------------------------------------------------------------------

pub fn listar_empresas(conn: &Connection) -> Result<Vec<Empresa>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, rut_nit, nombre_comercial, razon_social, telefono, email, direccion,
                    dias_credito, limite_credito, activo, creado_en
             FROM empresas WHERE activo = 1 ORDER BY nombre_comercial ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Empresa {
                id: r.get(0)?,
                rut_nit: r.get(1)?,
                nombre_comercial: r.get(2)?,
                razon_social: r.get(3)?,
                telefono: r.get(4)?,
                email: r.get(5)?,
                direccion: r.get(6)?,
                dias_credito: r.get(7)?,
                limite_credito: r.get(8)?,
                activo: r.get(9)?,
                creado_en: r.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<SqlResult<Vec<Empresa>>>()
        .map_err(|e| e.to_string())
}

pub fn crear_empresa(conn: &Connection, e: &EmpresaInput) -> Result<i64, String> {
    let rut = validators::normalizar_clave(&e.rut_nit);
    if rut.len() < 3 {
        return Err("RUT/NIT inválido".to_string());
    }
    if e.dias_credito < 0 {
        return Err("Los días de crédito no pueden ser negativos".to_string());
    }
    validators::validar_monto(e.limite_credito, "Límite de crédito")?;

    conn.execute(
        "INSERT INTO empresas (rut_nit, nombre_comercial, razon_social, telefono, email,
                              direccion, dias_credito, limite_credito, activo)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            rut,
            e.nombre_comercial.trim(),
            e.razon_social,
            e.telefono,
            e.email,
            e.direccion,
            e.dias_credito,
            e.limite_credito,
            e.activo,
        ],
    )
    .map_err(|e| duplicado_a_error(e, "empresa"))?;
    Ok(conn.last_insert_rowid())
}

/// Desactiva (soft delete) — nunca borrar el historial.
pub fn eliminar_empresa(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("UPDATE empresas SET activo = 0 WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ------------------------------------------------------------
// Productos
// ------------------------------------------------------------

pub fn listar_productos(conn: &Connection) -> Result<Vec<Producto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, codigo, nombre, descripcion, unidad_medida, precio_base,
                    precio_mayoreo, activo, creado_en
             FROM productos WHERE activo = 1 ORDER BY nombre ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Producto {
                id: r.get(0)?,
                codigo: r.get(1)?,
                nombre: r.get(2)?,
                descripcion: r.get(3)?,
                unidad_medida: r.get(4)?,
                precio_base: r.get(5)?,
                precio_mayoreo: r.get(6)?,
                activo: r.get(7)?,
                creado_en: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<SqlResult<Vec<Producto>>>()
        .map_err(|e| e.to_string())
}

pub fn crear_producto(conn: &Connection, p: &ProductoInput) -> Result<i64, String> {
    let codigo = validators::normalizar_clave(&p.codigo);
    if codigo.is_empty() {
        return Err("El código del producto no puede estar vacío".to_string());
    }
    validators::validar_monto_positivo(p.precio_base, "Precio base")?;
    validators::validar_monto(p.precio_mayoreo, "Precio mayoreo")?;
    // Impuesto eliminado del negocio: siempre se guarda 0 (la columna se conserva).
    let impuesto_porcentaje = 0.0;
    validators::validar_unidad_medida(&p.unidad_medida)?;

    conn.execute(
        "INSERT INTO productos (codigo, nombre, descripcion, unidad_medida, precio_base,
                                precio_mayoreo, impuesto_porcentaje, activo)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            codigo,
            p.nombre.trim(),
            p.descripcion,
            p.unidad_medida,
            p.precio_base,
            p.precio_mayoreo,
            impuesto_porcentaje,
            p.activo,
        ],
    )
    .map_err(|e| duplicado_a_error(e, "producto"))?;

    let id = conn.last_insert_rowid();
    // Todo producto nuevo inicia sin stock.
    conn.execute(
        "INSERT INTO stock (producto_id, cantidad_disponible) VALUES (?1, 0)",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

pub fn actualizar_producto(conn: &Connection, id: i64, p: &ProductoInput) -> Result<(), String> {
    validators::validar_monto_positivo(p.precio_base, "Precio base")?;
    // Impuesto eliminado del negocio: siempre se guarda 0 (la columna se conserva).
    let impuesto_porcentaje = 0.0;
    validators::validar_unidad_medida(&p.unidad_medida)?;
    conn.execute(
        "UPDATE productos SET codigo=?1, nombre=?2, descripcion=?3, unidad_medida=?4,
                precio_base=?5, precio_mayoreo=?6, impuesto_porcentaje=?7, activo=?8
         WHERE id=?9",
        params![
            validators::normalizar_clave(&p.codigo),
            p.nombre.trim(),
            p.descripcion,
            p.unidad_medida,
            p.precio_base,
            p.precio_mayoreo,
            impuesto_porcentaje,
            p.activo,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn eliminar_producto(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("UPDATE productos SET activo = 0 WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn obtener_unidad(conn: &Connection, producto_id: i64) -> Result<String, String> {
    conn.query_row(
        "SELECT unidad_medida FROM productos WHERE id = ?1 AND activo = 1",
        params![producto_id],
        |r| r.get(0),
    )
    .map_err(|_| "Producto no encontrado".to_string())
}

/// Valida que la empresa exista y esté activa.
pub fn empresa_existe(conn: &Connection, empresa_id: i64) -> Result<(), String> {
    let n: Option<i64> = conn
        .query_row(
            "SELECT id FROM empresas WHERE id = ?1 AND activo = 1",
            params![empresa_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if n.is_none() {
        return Err("Empresa no encontrada".to_string());
    }
    Ok(())
}

/// Resuelve el precio de venta efectivo de un producto para una empresa
/// (precio especial del cliente si existe, si no el precio base), junto con
/// la unidad de medida. El porcentaje de impuesto ya no se aplica (siempre 0).
pub fn precio_efectivo(
    conn: &Connection,
    producto_id: i64,
    empresa_id: i64,
) -> Result<(i64, f64, String), String> {
    conn.query_row(
        "SELECT p.unidad_medida,
                COALESCE(pc.precio_especial, p.precio_base)
         FROM productos p
         LEFT JOIN precios_cliente pc
           ON pc.producto_id = p.id AND pc.empresa_id = ?2
         WHERE p.id = ?1 AND p.activo = 1",
        params![producto_id, empresa_id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)),
    )
    // El impuesto quedó eliminado: la venta nunca aplica porcentaje.
    .map(|(unidad, precio)| (precio, 0.0, unidad))
    .map_err(|_| "Producto no encontrado".to_string())
}

/// Verifica que haya stock y lo descuenta (salida por venta) dentro de una tx.
/// Devuelve error si el stock sería insuficiente → el llamador hace rollback.
pub fn descontar_stock(
    tx: &rusqlite::Transaction,
    producto_id: i64,
    cantidad: f64,
    venta_id: i64,
    operador_id: i64,
) -> Result<(), String> {
    aplicar_movimiento_in_tx(
        tx,
        producto_id,
        "salida_venta",
        cantidad,
        Some("Venta"),
        Some(venta_id),
        operador_id,
    )
}

/// Respende stock de una venta anulada (entrada compensatoria, tipo 'ajuste').
pub fn reponer_stock(
    tx: &rusqlite::Transaction,
    producto_id: i64,
    cantidad: f64,
    venta_id: i64,
    operador_id: i64,
) -> Result<(), String> {
    aplicar_movimiento_in_tx(
        tx,
        producto_id,
        "ajuste",
        cantidad,
        Some("Anulación de venta"),
        Some(venta_id),
        operador_id,
    )
}

// ------------------------------------------------------------
// Inventario (stock, producciones, mermas, ajustes)
// ------------------------------------------------------------

pub fn listar_stock(conn: &Connection) -> Result<Vec<crate::types::StockItem>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT s.producto_id, p.nombre, p.codigo, s.cantidad_disponible, p.unidad_medida
             FROM stock s
             JOIN productos p ON p.id = s.producto_id
             WHERE p.activo = 1
             ORDER BY p.nombre ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(crate::types::StockItem {
                producto_id: r.get(0)?,
                nombre: r.get(1)?,
                codigo: r.get(2)?,
                cantidad_disponible: r.get(3)?,
                unidad_medida: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<SqlResult<Vec<crate::types::StockItem>>>()
        .map_err(|e| e.to_string())
}

/// Entrada de producción: agrega pan al inventario y registra la producción.
pub fn registrar_produccion(
    conn: &mut Connection,
    producto_id: i64,
    cantidad: f64,
    costo_unitario: i64,
    operador_id: i64,
    fecha: &str,
) -> Result<(), String> {
    validators::validar_monto(costo_unitario, "Costo unitario")?;
    let unidad = crate::repo::obtener_unidad(conn, producto_id)?;
    validators::validar_cantidad(cantidad, &unidad)?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        // entradas dentro de la transacción
        aplicar_movimiento_in_tx(
            &tx,
            producto_id,
            "entrada_produccion",
            cantidad,
            Some("Producción"),
            None,
            operador_id,
        )?;
        tx.execute(
            "INSERT INTO producciones (fecha, producto_id, cantidad, costo_unitario, operador_id)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![fecha, producto_id, cantidad, costo_unitario, operador_id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

/// Versión de aplicar_movimiento que trabaja sobre una transaction.
fn aplicar_movimiento_in_tx(
    tx: &rusqlite::Transaction,
    producto_id: i64,
    tipo: &str,
    cantidad: f64,
    motivo: Option<&str>,
    venta_id: Option<i64>,
    operador_id: i64,
) -> Result<(), String> {
    let unidad = crate::repo::obtener_unidad(tx, producto_id)?;
    validators::validar_cantidad(cantidad, &unidad)?;
    let delta = match tipo {
        "entrada_produccion" | "ajuste" => cantidad,
        "salida_venta" | "merma" => -cantidad,
        _ => return Err(format!("Tipo de movimiento inválido: {tipo}")),
    };

    // asegurar fila de stock dentro de la tx
    let existe: Option<i64> = tx
        .query_row(
            "SELECT producto_id FROM stock WHERE producto_id = ?1",
            params![producto_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if existe.is_none() {
        tx.execute(
            "INSERT INTO stock (producto_id, cantidad_disponible) VALUES (?1, 0)",
            params![producto_id],
        )
        .map_err(|e| e.to_string())?;
    }

    let actual: f64 = tx
        .query_row(
            "SELECT cantidad_disponible FROM stock WHERE producto_id = ?1",
            params![producto_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let nueva = actual + delta;
    if nueva < 0.0 {
        return Err("Stock insuficiente".to_string());
    }
    tx.execute(
        "UPDATE stock SET cantidad_disponible = ?1 WHERE producto_id = ?2",
        params![nueva, producto_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, motivo, venta_id, operador_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![producto_id, tipo, delta, motivo, venta_id, operador_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Registra una merma (stock no vendido). Motivo obligatorio por sanidad.
pub fn registrar_merma(
    conn: &mut Connection,
    producto_id: i64,
    cantidad: f64,
    motivo: &str,
    operador_id: i64,
) -> Result<(), String> {
    if motivo.trim().is_empty() {
        return Err("La merma requiere un motivo".to_string());
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    aplicar_movimiento_in_tx(
        &tx,
        producto_id,
        "merma",
        cantidad,
        Some(motivo),
        None,
        operador_id,
    )?;
    tx.commit().map_err(|e| e.to_string())
}

/// Ajuste de inventario por conteo físico. Permite subir o bajar.
/// Un ajuste a la baja (negativo) nunca deja el stock por debajo de cero.
pub fn registrar_ajuste(
    conn: &mut Connection,
    producto_id: i64,
    cantidad_delta: f64,
    motivo: &str,
    operador_id: i64,
) -> Result<(), String> {
    if motivo.trim().is_empty() {
        return Err("El ajuste requiere un motivo".to_string());
    }
    if cantidad_delta == 0.0 {
        return Err("El ajuste no puede ser cero".to_string());
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    // aplicar_movimiento_in_tx solo acepta cantidades positivas con signo por tipo;
    // para el ajuste aceptamos delta firmado reutilizando la lógica genérica.
    aplicar_ajuste_in_tx(&tx, producto_id, cantidad_delta, motivo, operador_id)?;
    tx.commit().map_err(|e| e.to_string())
}

fn aplicar_ajuste_in_tx(
    tx: &rusqlite::Transaction,
    producto_id: i64,
    delta: f64,
    motivo: &str,
    operador_id: i64,
) -> Result<(), String> {
    if !delta.is_finite() || delta.abs() > validators::MAX_CANTIDAD {
        return Err("Ajuste fuera de rango".to_string());
    }
    let actual: f64 = tx
        .query_row(
            "SELECT COALESCE((SELECT cantidad_disponible FROM stock WHERE producto_id = ?1), 0)",
            params![producto_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let nueva = actual + delta;
    if nueva < 0.0 {
        return Err("El ajuste dejaría el stock en negativo".to_string());
    }
    if tx
        .query_row(
            "SELECT COUNT(*) FROM stock WHERE producto_id = ?1",
            params![producto_id],
            |r| r.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        == 0
    {
        tx.execute(
            "INSERT INTO stock (producto_id, cantidad_disponible) VALUES (?1, 0)",
            params![producto_id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.execute(
        "UPDATE stock SET cantidad_disponible = ?1 WHERE producto_id = ?2",
        params![nueva, producto_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, motivo, venta_id, operador_id)
         VALUES (?1, 'ajuste', ?2, ?3, NULL, ?4)",
        params![producto_id, delta, motivo, operador_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ------------------------------------------------------------
// Precios del cliente
// ------------------------------------------------------------

pub fn listar_precios_cliente(
    conn: &Connection,
    empresa_id: i64,
) -> Result<Vec<PrecioCliente>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, empresa_id, producto_id, precio_especial
             FROM precios_cliente WHERE empresa_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![empresa_id], |r| {
            Ok(PrecioCliente {
                id: r.get(0)?,
                empresa_id: r.get(1)?,
                producto_id: r.get(2)?,
                precio_especial: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<SqlResult<Vec<PrecioCliente>>>()
        .map_err(|e| e.to_string())
}

pub fn set_precio_cliente(conn: &Connection, p: &PrecioClienteInput) -> Result<(), String> {
    validators::validar_monto_positivo(p.precio_especial, "Precio especial")?;
    conn.execute(
        "INSERT INTO precios_cliente (empresa_id, producto_id, precio_especial)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(empresa_id, producto_id)
         DO UPDATE SET precio_especial = ?3, actualizado_en = CURRENT_TIMESTAMP",
        params![p.empresa_id, p.producto_id, p.precio_especial],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ------------------------------------------------------------
// Usuarios (seed admin al arrancar)
// ------------------------------------------------------------

pub fn listar_usuarios(conn: &Connection) -> Result<Vec<Usuario>, String> {
    let mut stmt = conn
        .prepare("SELECT id, nombre, rol, activo FROM usuarios WHERE activo = 1 ORDER BY nombre")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Usuario {
                id: r.get(0)?,
                nombre: r.get(1)?,
                rol: r.get(2)?,
                activo: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<SqlResult<Vec<Usuario>>>()
        .map_err(|e| e.to_string())
}

pub fn crear_usuario(conn: &Connection, u: &UsuarioInput) -> Result<i64, String> {
    if u.nombre.trim().is_empty() {
        return Err("El nombre del usuario es obligatorio".to_string());
    }
    validators::validar_rol(&u.rol)?;
    let pin = u
        .pin
        .as_deref()
        .filter(|p| !p.trim().is_empty())
        .unwrap_or("1234");
    validators::validar_pin(pin)?;
    conn.execute(
        "INSERT INTO usuarios (nombre, rol, activo, pin) VALUES (?1, ?2, ?3, ?4)",
        params![u.nombre.trim(), u.rol, u.activo, pin],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

pub fn seed_usuario_admin(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM usuarios", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if count == 0 {
        conn.execute(
            "INSERT INTO usuarios (nombre, rol, pin) VALUES ('Administrador', 'admin', '1234')",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Verifica que `pin` corresponda a un usuario activo. Nunca expone el PIN.
pub fn verificar_pin(conn: &Connection, usuario_id: i64, pin: &str) -> Result<bool, String> {
    let guardado: Option<String> = conn
        .query_row(
            "SELECT pin FROM usuarios WHERE id = ?1 AND activo = 1",
            params![usuario_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match guardado {
        None => Err("Usuario no encontrado".to_string()),
        Some(p) => Ok(p == pin.trim()),
    }
}

/// Cambia el PIN de un usuario verificando el actual.
pub fn cambiar_pin(
    conn: &Connection,
    usuario_id: i64,
    pin_actual: &str,
    pin_nuevo: &str,
) -> Result<(), String> {
    validators::validar_pin(pin_nuevo)?;
    if !verificar_pin(conn, usuario_id, pin_actual)? {
        return Err("El PIN actual no es correcto".to_string());
    }
    conn.execute(
        "UPDATE usuarios SET pin = ?2 WHERE id = ?1",
        params![usuario_id, pin_nuevo.trim()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Seed: cliente por defecto para ventas de mostrador (sin cliente explícito).
/// Se crea solo en el primer arranque (cuando no existe ninguna empresa).
pub fn seed_cliente_mostrador(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM empresas", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if count == 0 {
        conn.execute(
            "INSERT INTO empresas (rut_nit, nombre_comercial, dias_credito, limite_credito, activo)
             VALUES ('0', 'Consumidor Final', 0, 0, 1)",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// True si no existe ningún administrador activo con PIN, es decir, la app
/// necesita la primera configuración (crear/ajustar el admin y su clave).
pub fn necesita_configuracion(conn: &Connection) -> Result<bool, String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM usuarios \
             WHERE activo = 1 AND rol = 'admin' AND pin IS NOT NULL AND pin != ''",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count == 0)
}

/// Pantalla de primer arranque: garantiza un administrador activo con el nombre
/// y PIN elegidos. Unifica el estado heredado de bases antiguas (se actualizan
/// todos los admins activos); si no existe ninguno, crea uno nuevo.
pub fn configurar_admin(conn: &Connection, nombre: &str, pin: &str) -> Result<(), String> {
    if nombre.trim().is_empty() {
        return Err("El nombre del administrador es obligatorio".to_string());
    }
    validators::validar_pin(pin)?;
    let actualizados = conn
        .execute(
            "UPDATE usuarios SET nombre = ?1, pin = ?2, activo = 1 WHERE rol = 'admin'",
            params![nombre.trim(), pin.trim()],
        )
        .map_err(|e| e.to_string())?;
    if actualizados == 0 {
        conn.execute(
            "INSERT INTO usuarios (nombre, rol, activo, pin) VALUES (?1, 'admin', 1, ?2)",
            params![nombre.trim(), pin.trim()],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/// Mapea errores de constraint UNIQUE de SQLite a mensajes legibles.
fn duplicado_a_error(e: rusqlite::Error, entidad: &str) -> String {
    match e {
        rusqlite::Error::SqliteFailure(e, _)
            if e.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            format!("Ya existe una {entidad}")
        }
        _ => e.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::*;

    #[test]
    fn seed_crea_consumidor_final_y_es_idempotente() {
        let conn = conn();
        seed_cliente_mostrador(&conn).unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM empresas", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
        // segunda llamada no duplica
        seed_cliente_mostrador(&conn).unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM empresas", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
        let nombre: String = conn
            .query_row(
                "SELECT nombre_comercial FROM empresas WHERE rut_nit='0'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(nombre, "Consumidor Final");
    }

    #[test]
    fn setup_repara_admin_activo_sin_pin() {
        let conn = conn();
        // Admin heredado de una base antigua, sin PIN.
        conn.execute(
            "INSERT INTO usuarios (nombre, rol, activo) VALUES ('Jefe', 'admin', 1)",
            [],
        )
        .unwrap();
        assert!(necesita_configuracion(&conn).unwrap());
        configurar_admin(&conn, "Jefe", "9876").unwrap();
        assert!(!necesita_configuracion(&conn).unwrap());
        // El login con el PIN elegido funciona; un PIN ajeno no.
        assert!(verificar_pin(&conn, 1, "9876").unwrap());
        assert!(!verificar_pin(&conn, 1, "1234").unwrap());
        let nombre: String = conn
            .query_row("SELECT nombre FROM usuarios WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(nombre, "Jefe");
    }

    #[test]
    fn setup_crea_admin_si_no_existe_ninguno() {
        let conn = conn();
        assert!(necesita_configuracion(&conn).unwrap());
        configurar_admin(&conn, "Administrador", "4321").unwrap();
        assert!(!necesita_configuracion(&conn).unwrap());
        assert!(verificar_pin(&conn, 1, "4321").unwrap());
        assert!(!verificar_pin(&conn, 1, "0000").unwrap());
    }

    #[test]
    fn producto_nunca_guarda_impuesto() {
        let conn = conn();
        let p = ProductoInput {
            codigo: "P1".into(),
            nombre: "Pan".into(),
            descripcion: None,
            unidad_medida: "unidad".into(),
            precio_base: 500,
            precio_mayoreo: 0,
            activo: true,
        };
        let id = crear_producto(&conn, &p).unwrap();
        let pct: f64 = conn
            .query_row(
                "SELECT impuesto_porcentaje FROM productos WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(pct, 0.0);

        let p_mut = ProductoInput {
            precio_base: 600,
            ..p
        };
        actualizar_producto(&conn, id, &p_mut).unwrap();
        let pct: f64 = conn
            .query_row(
                "SELECT impuesto_porcentaje FROM productos WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(pct, 0.0);

        let (precio, pct, unidad) = precio_efectivo(&conn, id, 1).unwrap();
        assert_eq!(precio, 600);
        assert_eq!(pct, 0.0);
        assert_eq!(unidad, "unidad");
    }

    #[test]
    fn admin_seed_tiene_pin_por_defecto() {
        let conn = conn();
        seed_usuario_admin(&conn).unwrap();
        let (rol, pin): (String, Option<String>) = conn
            .query_row("SELECT rol, pin FROM usuarios WHERE id = 1", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(rol, "admin");
        assert_eq!(pin.as_deref(), Some("1234"));
    }

    #[test]
    fn verificar_pin_acepta_y_rechaza() {
        let conn = conn();
        let id = crear_usuario(
            &conn,
            &UsuarioInput {
                nombre: "Alex".into(),
                rol: "cajero".into(),
                activo: true,
                pin: Some("4821".into()),
            },
        )
        .unwrap();
        assert!(verificar_pin(&conn, id, "4821").unwrap());
        assert!(!verificar_pin(&conn, id, "0000").unwrap());
        // usuario inactivo no puede validarse
        conn.execute("UPDATE usuarios SET activo = 0 WHERE id = ?1", params![id])
            .unwrap();
        assert!(verificar_pin(&conn, id, "4821").is_err());
    }

    #[test]
    fn cambiar_pin_verifica_actual_y_valida_formato() {
        let conn = conn();
        seed_usuario_admin(&conn).unwrap();
        assert!(cambiar_pin(&conn, 1, "1234", "9999").is_ok());
        assert!(verificar_pin(&conn, 1, "9999").unwrap());
        // PIN actual incorrecto
        assert!(cambiar_pin(&conn, 1, "1234", "7777").is_err());
        // formato inválido
        assert!(cambiar_pin(&conn, 1, "9999", "12").is_err());
        assert!(cambiar_pin(&conn, 1, "9999", "abcd").is_err());
        assert!(verificar_pin(&conn, 1, "9999").unwrap());
    }

    #[test]
    fn crear_usuario_sin_pin_usa_default() {
        let conn = conn();
        let id = crear_usuario(
            &conn,
            &UsuarioInput {
                nombre: "Bety".into(),
                rol: "cajero".into(),
                activo: true,
                pin: None,
            },
        )
        .unwrap();
        let pin: Option<String> = conn
            .query_row("SELECT pin FROM usuarios WHERE id = ?1", params![id], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(pin.as_deref(), Some("1234"));
    }
}
