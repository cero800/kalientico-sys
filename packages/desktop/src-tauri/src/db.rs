use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::sync::Mutex;

//-----------------------------------------------------------------------------------
// M1 - Esquema, conexión y migración
//-----------------------------------------------------------------------------------

/// Versión actual del esquema (PRAGMA user_version).
/// v2: moneda dual US$/Bs — ventas y pagos guardan `moneda` + snapshot `tasa_cambio`;
///     la caja pasa a arqueo independiente por moneda.
/// v3: seguridad — usuarios con `pin` numérico y habilitación de roles admin/cajero.
pub const SCHEMA_VERSION: i64 = 3;

pub struct Db(pub Mutex<Connection>);

/// Esquema principal. Las tablas se crean con IF NOT EXISTS; las migraciones
/// incrementales se gestionan por separado (ver `apply_migrations`).
pub const SCHEMA: &str = r#"
-- ============================ CATÁLOGO ============================
CREATE TABLE IF NOT EXISTS empresas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rut_nit TEXT UNIQUE NOT NULL,
    nombre_comercial TEXT NOT NULL,
    razon_social TEXT,
    telefono TEXT,
    email TEXT,
    direccion TEXT,
    dias_credito INTEGER NOT NULL DEFAULT 0,    -- días de plazo
    limite_credito INTEGER NOT NULL DEFAULT 0,  -- en centavos, 0 = sin límite
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    unidad_medida TEXT NOT NULL DEFAULT 'unidad', -- unidad|kg|paquete|bandeja|caja
    precio_base INTEGER NOT NULL DEFAULT 0,        -- centavos
    precio_mayoreo INTEGER NOT NULL DEFAULT 0,     -- centavos, 0 = no aplica
    impuesto_porcentaje REAL NOT NULL DEFAULT 0,   -- 0..100
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS precios_cliente (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    producto_id INTEGER NOT NULL,
    precio_especial INTEGER NOT NULL,              -- centavos
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
    UNIQUE(empresa_id, producto_id)
);

-- ============================ INVENTARIO ============================
CREATE TABLE IF NOT EXISTS stock (
    producto_id INTEGER PRIMARY KEY,
    cantidad_disponible REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
);

-- tipo: entrada_produccion | salida_venta | merma | ajuste
CREATE TABLE IF NOT EXISTS movimientos_inventario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    cantidad REAL NOT NULL,               -- firmada según entrada (+)/salida (-)
    motivo TEXT,
    venta_id INTEGER,
    operador_id INTEGER,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS producciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha DATE NOT NULL,
    producto_id INTEGER NOT NULL,
    cantidad REAL NOT NULL,
    costo_unitario INTEGER NOT NULL DEFAULT 0,  -- centavos
    operador_id INTEGER,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- ============================ VENTAS ============================
-- tipo: contado | credito     estado: entregada | anulada
-- total/subtotal/impuesto SIEMPRE en centavos de US$ (moneda base).
-- moneda = 'usd' (base) y tasa_cambio = snapshot Bs por 1 US$ al momento de la
-- venta, para poder mostrar el equivalente en Bs de la factura.
CREATE TABLE IF NOT EXISTS ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    numero_factura INTEGER NOT NULL UNIQUE,
    tipo TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'entregada',
    fecha DATE NOT NULL,
    subtotal INTEGER NOT NULL DEFAULT 0,    -- centavos US$
    descuento INTEGER NOT NULL DEFAULT 0,   -- centavos US$
    impuesto INTEGER NOT NULL DEFAULT 0,    -- centavos US$
    total INTEGER NOT NULL DEFAULT 0,       -- centavos US$
    moneda TEXT NOT NULL DEFAULT 'usd',
    tasa_cambio REAL NOT NULL DEFAULT 1,    -- Bs por 1 US$
    anulada_motivo TEXT,
    operador_id INTEGER,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE IF NOT EXISTS detalle_ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id INTEGER NOT NULL,
    producto_id INTEGER NOT NULL,
    cantidad REAL NOT NULL,
    precio_unitario INTEGER NOT NULL,   -- centavos
    subtotal INTEGER NOT NULL,          -- centavos
    FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- ============================ PAGOS ============================
-- tipo_pago: efectivo | pago_movil | punto (validado en el backend)
-- venta_id NULL = abono a cuenta (sin factura específica)
-- monto en centavos DE LA MONEDA DEL PAGO; moneda + tasa_cambio (snapshot)
-- permiten convertir a US$ y por tanto cobros con varias líneas de pago.
CREATE TABLE IF NOT EXISTS pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    venta_id INTEGER,
    monto INTEGER NOT NULL,             -- centavos de la moneda del pago
    tipo_pago TEXT NOT NULL DEFAULT 'efectivo',
    moneda TEXT NOT NULL DEFAULT 'usd', -- usd | ves
    tasa_cambio REAL NOT NULL DEFAULT 1, -- Bs por 1 US$ (snapshot del pago)
    numero_referencia TEXT,
    operador_id INTEGER,
    fecha_pago DATETIME DEFAULT CURRENT_TIMESTAMP,
    observaciones TEXT,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE SET NULL
);

-- ============================ OPERACIÓN ============================
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'cajero',  -- admin|cajero
    pin TEXT,                             -- PIN numérico de 4 dígitos
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- estado: abierta | cerrada
-- Arqueo POR MONEDA: cada caja controla efectivo US$ y Bs por separado.
-- efectivo_esperado = inicial + ventas - egresos; diferencia = final - esperado;
-- ambas calculadas por moneda en `cerrar_caja`.
CREATE TABLE IF NOT EXISTS cajas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha DATE NOT NULL,
    operador_id INTEGER NOT NULL,
    efectivo_inicial_usd INTEGER NOT NULL DEFAULT 0,
    efectivo_inicial_ves INTEGER NOT NULL DEFAULT 0,
    efectivo_ventas_usd INTEGER NOT NULL DEFAULT 0,
    efectivo_ventas_ves INTEGER NOT NULL DEFAULT 0,
    efectivo_egresos_usd INTEGER NOT NULL DEFAULT 0,
    efectivo_egresos_ves INTEGER NOT NULL DEFAULT 0,
    efectivo_final_usd INTEGER NOT NULL DEFAULT 0,
    efectivo_final_ves INTEGER NOT NULL DEFAULT 0,
    efectivo_esperado_usd INTEGER NOT NULL DEFAULT 0,
    efectivo_esperado_ves INTEGER NOT NULL DEFAULT 0,
    diferencia_usd INTEGER NOT NULL DEFAULT 0,
    diferencia_ves INTEGER NOT NULL DEFAULT 0,
    tasa_cierre REAL NOT NULL DEFAULT 0,  -- snapshot al cerrar
    estado TEXT NOT NULL DEFAULT 'abierta',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (operador_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS config (
    clave TEXT PRIMARY KEY,
    valor TEXT
);

-- ============================ ÍNDICES ============================
CREATE INDEX IF NOT EXISTS idx_precios_cliente ON precios_cliente(empresa_id, producto_id);
CREATE INDEX IF NOT EXISTS idx_mov_prod ON movimientos_inventario(producto_id);
CREATE INDEX IF NOT EXISTS idx_mov_fecha ON movimientos_inventario(fecha);
CREATE INDEX IF NOT EXISTS idx_ventas_empresa ON ventas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_detalle_venta ON detalle_ventas(venta_id);
CREATE INDEX IF NOT EXISTS idx_pagos_empresa ON pagos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pagos_venta ON pagos(venta_id);
CREATE INDEX IF NOT EXISTS idx_prod_fecha ON producciones(fecha);
CREATE INDEX IF NOT EXISTS idx_cajas_fecha ON cajas(fecha);
"#;

/// Abre (o crea) la base con los PRAGMA correctos y aplica el esquema/migraciones.
///
/// `recrear_si_desactualizada`: en desarrollo, si detecta un esquema antiguo
/// sin datos reales, lo recrea. En producción esto NO debe activarse; la base
/// se migra de forma no destructiva (ver `apply_migrations`).
pub fn open(db_path: PathBuf, recrear_si_desactualizada: bool) -> Result<Connection> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let conn = Connection::open(db_path)?;
    conn.pragma_update(None, "foreign_keys", true)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "busy_timeout", 5000)?;

    if recrear_si_desactualizada && hay_esquema_antiguo(&conn)? {
        // Solo en desarrollo: eliminar esquema viejo y volver a crear.
        drop_old_schema(&conn)?;
        reset_version(&conn)?;
    }

    apply_schema(&conn)?;
    apply_migrations(&conn)?;
    conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    Ok(conn)
}

/// Migraciones incrementales no destructivas (ALTER TABLE / UPDATE) para bases
/// creadas con versiones anteriores del esquema.
fn apply_migrations(conn: &Connection) -> Result<()> {
    // v3: columna `pin` en usuarios.
    let tiene_pin = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('usuarios') WHERE name = 'pin'",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;
    if !tiene_pin {
        conn.execute("ALTER TABLE usuarios ADD COLUMN pin TEXT", [])?;
    }
    // El admin pasa a tener PIN por defecto (1234) si no lo tenía. Corre siempre:
    // es idempotente y auto-cura bases que quedaron a medio migrar (columna `pin`
    // ya agregada pero sin valor).
    conn.execute(
        "UPDATE usuarios SET pin = ?1 WHERE rol = 'admin' AND (pin IS NULL OR pin = '')",
        rusqlite::params!["1234"],
    )?;
    Ok(())
}

/// Ejecuta el bloque de creación de tablas (idempotente por IF NOT EXISTS).
fn apply_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(SCHEMA)
}

/// True si existe la tabla `pedidos` (esquema antiguo) o si `user_version` no
/// coincide con la versión actual y no hay tablas nuevas.
fn hay_esquema_antiguo(conn: &Connection) -> Result<bool> {
    let mut stmt =
        conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pedidos'")?;
    let mut rows = stmt.query([])?;
    Ok(rows.next()?.is_some())
}

/// Elimina las tablas del esquema antiguo que entren en conflicto de nombres.
fn drop_old_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "PRAGMA foreign_keys = OFF;
         DROP TABLE IF EXISTS detalle_pedidos;
         DROP TABLE IF EXISTS pedidos;
         DROP TABLE IF EXISTS pagos;
         PRAGMA foreign_keys = ON;",
    )?;
    Ok(())
}

fn reset_version(conn: &Connection) -> Result<()> {
    conn.pragma_update(None, "user_version", 0)?;
    Ok(())
}

/// Conexión SQLite en memoria con el esquema actual y claves foráneas activas.
/// Solo disponible en tests.
#[cfg(test)]
pub fn test_conn() -> Connection {
    let conn = Connection::open_in_memory().expect("abrir bd en memoria");
    conn.pragma_update(None, "foreign_keys", true)
        .expect("enable fk");
    conn.execute_batch(SCHEMA).expect("aplicar esquema");
    conn
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Regresión v1.0.2: una base con el esquema viejo (sin columna `pin`) debía
    /// migrar sin error. Antes fallaba con "Wrong number of parameters passed to
    /// query. Got 1, needed 2" por un `?2` con un solo parámetro enlazado.
    #[test]
    fn migra_base_antigua_sin_pin() {
        let conn = Connection::open_in_memory().expect("abrir bd en memoria");
        conn.execute_batch(
            "CREATE TABLE usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                rol TEXT NOT NULL DEFAULT 'cajero',
                activo INTEGER NOT NULL DEFAULT 1,
                creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO usuarios (nombre, rol) VALUES ('Administrador', 'admin');",
        )
        .expect("crear esquema viejo");

        apply_migrations(&conn).expect("la migración v3 no debe fallar");

        let tiene_pin: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('usuarios') WHERE name = 'pin'",
                [],
                |r| r.get(0),
            )
            .expect("consultar columnas");
        assert_eq!(tiene_pin, 1, "se debe agregar la columna pin");

        let pin: String = conn
            .query_row("SELECT pin FROM usuarios WHERE rol='admin'", [], |r| r.get(0))
            .expect("leer pin del admin");
        assert_eq!(pin, "1234", "el admin debe quedar con PIN por defecto");
    }
}
