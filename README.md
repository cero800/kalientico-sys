# Panadería POS

Sistema de punto de venta para una panadería: catálogo de productos, inventario,
ventas con **moneda dual US$/Bs**, cobros mixtos, caja por moneda, estado de
cuenta por cliente y reporte del día. Monorepo con back end nativo en
**Rust/Tauri** y front end **React + Vite** (escritorio) y **Expo** (móvil).

## Stack

| Pieza        | Tecnología                                                        |
| ------------ | ----------------------------------------------------------------- |
| Escritorio   | Tauri 2 · React 18 · TypeScript · Vite 5 · Tailwind CSS           |
| Móvil        | Expo (React Native) — fuera de alcance por ahora                  |
| Back end     | Rust, 28 comandos Tauri (`#[tauri::command]`)                     |
| Base de datos | SQLite (vía `rusqlite`), esquema versionado con migración         |
| Monorepo     | pnpm workspaces (`packages/*`)                                    |

## Estructura

```
kalientico-sys/
├── packages/
│   ├── core/                  # @panaderia/core — tipos compartidos + helpers de moneda
│   │   └── src/
│   │       ├── types/schema.ts    # todos los tipos del dominio (fuente única)
│   │       ├── lib/money.ts       # conversión US$ ⇄ Bs y clave de la tasa
│   │       └── database/queries.ts
│   ├── desktop/               # @panaderia/desktop — app Tauri + React
│   │   ├── src/
│   │   │   ├── App.tsx            # placeholder (módulos funcionales en construcción)
│   │   │   └── services/db.ts     # wrappers de invoke() hacia los comandos Rust
│   │   └── src-tauri/             # back end Rust
│   │       └── src/
│   │           ├── lib.rs         # registro de comandos y búsqueda de la BD
│   │           ├── db.rs          # esquema SQLite (v2) + migración desde legado
│   │           ├── repo.rs        # catálogo, inventario, usuarios
│   │           ├── ventas.rs      # venta atómica (POS)
│   │           ├── pagos.rs       # pagos, abonos y estado de cuenta
│   │           ├── caja.rs        # arqueo de turno por moneda
│   │           ├── reporte.rs     # configuración clave/valor y reporte del día
│   │           ├── validators.rs  # validaciones centralizadas y conversión a US$
│   │           └── types.rs       # structs del dominio
│   └── mobile/                # @panaderia/mobile — app Expo (placeholder)
└── graphify-out/              # grafo del proyecto (graphify), versionado
```

## Modelo de moneda dual (US$ / Bs)

- **Base**: los precios y totales de venta siempre se guardan en **US$**
  (centavos, `i64`).
- **Tasa**: clave global `tasa_cambio` en la tabla `config` (Bs por 1 US$),
  configurable desde la app.
- **Snapshot**: cada venta, pago o cierre de caja congela la `tasa_cambio`
  vigente, de modo que el histórico es fiel aunque la tasa cambie.
- **Cobros mixtos**: un mismo cobro puede componerse de pagos en US$ y en Bs;
  cada pago guarda su `moneda` y su `tasa_cambio`.
- **Caja por moneda**: el arqueo lleva efectivo inicial/ventas/egresos/final y
  la diferencia derivada **por separado** en US$ y en Bs.
- **Estado de cuenta**: los pagos en Bs se convierten a US$ con su tasa
  congelada para derivar el saldo pendiente.
- Los montos con decimales se manejan en **céntimos** de su moneda
  (centavos US$ / céntimos de Bs).

## Back end

### Esquema SQLite (v2)

`empresas`, `productos`, `precios_cliente`, `stock`, `movimientos_inventario`,
`producciones`, `ventas`, `detalle_ventas`, `pagos`, `usuarios`, `cajas`,
`config`.

- Migración desde el esquema legado (`pedidos` → `ventas`) solo en desarrollo;
  la migración de producción es no destructiva.
- Integridad referencial activa (`PRAGMA foreign_keys = ON`) y transacciones
  para las operaciones compuestas.

### Reglas de negocio

- **Venta atómica**: reserva de correlativo de factura, validación y descuento
  de stock, cabecera + detalle + pagos en una sola transacción con *rollback*.
- **Cobro de contado**: debe cubrir el total (en US$ convertido) sin sobrepasar.
- **Crédito**: la venta se registra sin pagos y el saldo queda derivado.
- **Anulación**: revierte el stock y marca la venta `anulada` (el número de
  factura no se reutiliza; los pagos salen del estado de cuenta).
- **Caja de turno**: una sola abierta a la vez; sin caja abierta no se vende.
- **Saldo pendiente**: siempre derivado (`SUM(ventas) − SUM(pagos)`), nunca
  almacenado.

### Comandos Tauri (28)

Catálogo: `listar_empresas`, `crear_empresa`, `eliminar_empresa`,
`listar_productos`, `crear_producto`, `actualizar_producto`,
`eliminar_producto`, `listar_precios_cliente`, `set_precio_cliente`.

Usuarios: `listar_usuarios`, `crear_usuario`.

Inventario: `listar_stock`, `registrar_produccion`, `registrar_merma`,
`registrar_ajuste`.

Ventas: `crear_venta`, `listar_ventas`, `anular_venta`.

Pagos: `estado_cuenta`, `estado_cuenta_todos`, `registrar_abono`,
`historial_pagos`.

Caja: `caja_abierta`, `abrir_caja`, `cerrar_caja`.

Reporte/config: `resumen_dia`, `get_config`, `set_config`.

### Tests

27 tests unitarios de Rust sobre SQLite en memoria (`#[cfg(test)]`), cubriendo
validaciones, conversión de moneda, ventas (contado/crédito/mixto), rollback por
stock insuficiente, correlativo, anulación con reversión de inventario, caja por
moneda, pagos/abonos y el reporte del día.

## Front end (escritorio — en construcción)

El backend está completo; la UI está en desarrollo. Ya existe:

- Capa de servicios `src/services/db.ts` con *wrappers* tipados de `invoke()`.
- Tipos compartidos y helpers de moneda en `@panaderia/core`, consumidos por la
  app (fuente única; sin duplicación de interfaces).

Módulos planeados: Sesión (login), Venta (POS con grid de productos, carrito y
barra de cobro con monto dual), Caja (apertura/arqueo por moneda), Catálogo,
Reporte.

## Puesta en marcha

Requisitos: Node.js ≥ 18, pnpm ≥ 8, Rust (toolchain estable) y las
dependencias de Tauri 2.

```bash
# Dependencias e instalación
pnpm install

# Tipos compartidos (`@panaderia/core`) — se consumen desde su build
pnpm build:core

# Tests del back end
cd packages/desktop/src-tauri && cargo test
```

### Tasa de cambio

Antes de operar conviene fijar la tasa vigente; se guarda en `config`
(clave `tasa_cambio`, en Bs por 1 US$):

```sql
INSERT INTO config (clave, valor) VALUES ('tasa_cambio', '36.85')
ON CONFLICT(clave) DO UPDATE SET valor = '36.85';
```

Si no existe se asume `1` (sin conversión), y `crear_venta` / `registrar_abono`
/ `cerrar_caja` la congelan como snapshot de cada operación.

## Grafo del proyecto

`graphify-out/` contiene el grafo de conocimiento del código (nodes/edges,
comunidades, reporte y mapa HTML), generado con
[graphify](https://github.com/ciencialatitud0/metric-space-graph) y versionado.