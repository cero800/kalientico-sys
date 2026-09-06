# Kalientico

> Sistema de punto de venta para panificadoras: ventas en **US$ / Bs**,
> inventario, caja por moneda, deudores y reportes. Aplicación de escritorio
> construida con **Tauri 2 + Rust + React**.

[![CI](https://img.shields.io/github/actions/workflow/status/cero800/kalientico-sys/ci.yml?branch=main&label=CI&logo=github)](https://github.com/cero800/kalientico-sys/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/cero800/kalientico-sys?logo=github)](https://github.com/cero800/kalientico-sys/releases)
[![Licencia](https://img.shields.io/github/license/cero800/kalientico-sys)](./LICENSE)

## Funcionalidades

- **Venta (POS)**: grid de productos, carrito, cobro mixto US$/Bs con
  selección de forma de pago, total fijo por moneda y generación de factura.
- **Factura en PDF**: cada venta se guarda automáticamente en
  `Documentos/kalientico/facturas/`.
- **Inventario**: producción, mermas y ajustes; alertas de stock agotado.
- **Caja por moneda**: apertura de turno y arqueo de efectivo US$/Bs
  independientes, con diferencia derivada.
- **Deudores**: estado de cuenta por cliente con abonos y pagos mixtos.
- **Reporte del día**: resumen de producción, ventas y efectivo, exportable a
  Excel (`Documentos/kalientico/excel/`).
- **Seguridad**: sesión con PIN de 4 dígitos por operador y roles
  `admin`/`cajero`.
- **Copias de seguridad**: respaldo automático diario de la base de datos en
  `Documentos/kalientico/backups/` (retención de 30 copias) + copia manual.

## Stack

| Pieza        | Tecnología                                                    |
| ------------ | ------------------------------------------------------------- |
| Escritorio   | Tauri 2 · React 18 · TypeScript · Vite 5 · Tailwind CSS       |
| Back end     | Rust · 36 comandos Tauri (`#[tauri::command]`)                |
| Base de datos | SQLite (vía `rusqlite`), esquema versionado con migraciones  |
| Monorepo     | pnpm workspaces (`packages/*`)                                |

## Estructura

```
kalientico-sys/
├── packages/
│   ├── core/                  # @panaderia/core — tipos compartidos + moneda
│   │   └── src/
│   │       ├── types/schema.ts    # tipos del dominio (fuente única)
│   │       └── lib/money.ts       # conversión US$ ⇄ Bs y clave de la tasa
│   ├── desktop/               # @panaderia/desktop — app Tauri + React
│   │   ├── src/
│   │   │   ├── App.tsx            # rutas con lazy loading
│   │   │   ├── pages/             # Venta, Productos, Clientes, Inventario…
│   │   │   └── services/db.ts     # wrappers de invoke() → comandos Rust
│   │   └── src-tauri/             # back end Rust
│   │       └── src/
│   │           ├── lib.rs         # registro de comandos y arranque
│   │           ├── db.rs          # esquema SQLite (v3) + migraciones
│   │           ├── repo.rs        # catálogo, inventario, usuarios y PIN
│   │           ├── ventas.rs      # venta atómica (POS)
│   │           ├── pagos.rs       # pagos, abonos y estado de cuenta
│   │           ├── caja.rs        # arqueo de turno por moneda
│   │           ├── reporte.rs     # config clave/valor y reporte del día
│   │           ├── factura.rs     # asamblea de la factura impresa
│   │           ├── backup.rs      # copias de seguridad diarias + manuales
│   │           ├── validators.rs  # validaciones centralizadas
│   │           └── types.rs       # structs del dominio
│   └── mobile/                # @panaderia/mobile — app Expo (fuera de alcance)
└── graphify-out/              # grafo del proyecto (graphify), versionado
```

## Modelo de moneda dual (US$ / Bs)

- **Base**: precios y totales de venta siempre en **US$** (céntimos, `i64`).
- **Tasa**: clave global `tasa_cambio` en `config` (Bs por 1 US$), editable
  desde la app.
- **Snapshot**: cada venta, pago o cierre de caja congela la `tasa_cambio`
  vigente; el histórico queda fiel aunque la tasa cambie.
- **Cobros mixtos**: un cobro se compone de pagos en US$ y Bs; cada pago guarda
  su `moneda` y `tasa_cambio`.
- **Caja por moneda**: arqueo con efectivo inicial/ventas/egresos/final y
  diferencia **por separado** en US$ y en Bs.
- Los montos decimales se manejan en **céntimos** de su moneda.

## Puesta en marcha

Requisitos: Node.js ≥ 18, pnpm ≥ 8, Rust estable y las dependencias de Tauri 2.

```bash
# Dependencias e instalación
pnpm install

# Tipos compartidos (`@panaderia/core`)
pnpm build:core

# Aplicación de escritorio en modo desarrollo
pnpm --filter @panaderia/desktop tauri:dev
```

### Tests y calidad

```bash
pnpm --filter @panaderia/core build
pnpm --filter @panaderia/desktop build      # typecheck + build vite
pnpm --filter @panaderia/desktop lint       # ESLint
pnpm --filter @panaderia/desktop test       # Vitest (60 pruebas)

cd packages/desktop/src-tauri
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test                                  # 47 pruebas Rust
```

## Releases

Los instaladores se generan automáticamente al etiquetar una versión:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Esto crea un *draft release* con binarios de:

- **Windows**: instalador NSIS y MSI.
- **Linux**: `.deb`, `.rpm` y AppImage.

> Los binarios **no están firmados** todavía; ver `SECURITY.md` para firmarlos
> antes de distribuir en producción.

## Licencia

MIT — ver [`LICENSE`](./LICENSE).

## Grafo del proyecto

`graphify-out/` contiene el grafo de conocimiento del código (nodes/edges,
comunidades, reporte y mapa HTML), generado con
[graphify](https://github.com/ciencialatitud0/metric-space-graph) y versionado.