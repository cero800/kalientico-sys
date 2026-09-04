# Graph Report - kalientico-sys  (2026-09-04)

## Corpus Check
- Corpus is ~31,557 words - fits in a single context window. You may not need a graph.

## Summary
- 621 nodes · 955 edges · 48 communities (39 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Comandos Tauri
- Servicios Frontend TS
- Dependencias Desktop
- Capa de Datos (repo.rs)
- Dependencias Mobile
- Tipos de Dominio
- Config Monorepo
- Config App Expo
- Config Tauri
- Paquete Core
- Validadores Negocio
- TS Desktop Config
- Core Build
- Schemas Tauri (desktop)
- Schemas Tauri (linux)
- Schemas Tauri Linux
- Schemas Tauri Desktop
- Schemas Permisos Desktop
- Schemas Permisos Linux
- Caja y Turno
- Pagos y Credito
- Ventas POS
- Esquema Base de Datos
- Schemas Ventanas Desktop
- Schemas Ventanas Linux
- Reporte Diario
- TS Root Config
- TS Core Config
- Schemas CapabilityRemote D
- Schemas CapabilityRemote L
- Capabilities Tauri
- TS Mobile Config
- Schemas Capability D
- Schemas Capability L
- Schema Desktop
- Schema Linux
- Script Monorepo
- Entry Desktop App
- Schemas Local D
- Schemas Local L
- App Móvil
- Workspace Monorepo
- App Shell HTML
- Crate Tauri

## God Nodes (most connected - your core abstractions)
1. `Db` - 34 edges
2. `lock()` - 34 edges
3. `expo` - 11 edges
4. `aplicar_movimiento_in_tx()` - 10 edges
5. `caja_abierta()` - 9 edges
6. `compilerOptions` - 9 edges
7. `definitions` - 8 edges
8. `definitions` - 8 edges
9. `open()` - 8 edges
10. `listar_empresas()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `set_precio_cliente()` --references--> `PrecioClienteInput`  [EXTRACTED]
  packages/desktop/src-tauri/src/lib.rs → packages/desktop/src-tauri/src/types.rs
- `set_precio_cliente()` --references--> `PrecioClienteInput`  [EXTRACTED]
  packages/desktop/src-tauri/src/repo.rs → packages/desktop/src-tauri/src/types.rs
- `abrir_caja()` --references--> `Db`  [EXTRACTED]
  packages/desktop/src-tauri/src/lib.rs → packages/desktop/src-tauri/src/db.rs
- `actualizar_producto()` --references--> `Db`  [EXTRACTED]
  packages/desktop/src-tauri/src/lib.rs → packages/desktop/src-tauri/src/db.rs
- `anular_venta()` --references--> `Db`  [EXTRACTED]
  packages/desktop/src-tauri/src/lib.rs → packages/desktop/src-tauri/src/db.rs

## Import Cycles
- None detected.

## Communities (48 total, 5 thin omitted)

### Community 0 - "Comandos Tauri"
Cohesion: 0.13
Nodes (57): App, MutexGuard, Db, abrir_caja(), actualizar_producto(), anular_venta(), caja_abierta(), cerrar_caja() (+49 more)

### Community 1 - "Servicios Frontend TS"
Cohesion: 0.04
Nodes (21): AbonoInput, Caja, CajaAbrirInput, CajaCerrarInput, DetalleVentaInput, Empresa, EmpresaInput, EstadoCuenta (+13 more)

### Community 2 - "Dependencias Desktop"
Cohesion: 0.05
Nodes (42): autoprefixer, exceljs, jspdf, lucide-react, dependencies, exceljs, jspdf, lucide-react (+34 more)

### Community 3 - "Capa de Datos (repo.rs)"
Cohesion: 0.15
Nodes (39): Error, actualizar_producto(), aplicar_ajuste_in_tx(), aplicar_movimiento_in_tx(), crear_empresa(), crear_producto(), crear_usuario(), descontar_stock() (+31 more)

### Community 4 - "Dependencias Mobile"
Cohesion: 0.07
Nodes (28): @babel/core, expo, expo-status-bar, dependencies, expo, expo-status-bar, @panaderia/core, @powersync/react-native (+20 more)

### Community 5 - "Tipos de Dominio"
Cohesion: 0.14
Nodes (27): MovimientoResumen, AbonoInput, Caja, CajaAbrirInput, CajaCerrarInput, DetalleVentaInput, Empresa, EmpresaInput (+19 more)

### Community 6 - "Config Monorepo"
Cohesion: 0.08
Nodes (23): eslint, devDependencies, eslint, typescript, engines, node, pnpm, typescript (+15 more)

### Community 7 - "Config App Expo"
Cohesion: 0.10
Nodes (19): backgroundColor, foregroundImage, adaptiveIcon, expo, android, assetBundlePatterns, icon, ios (+11 more)

### Community 8 - "Config Tauri"
Cohesion: 0.11
Nodes (18): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+10 more)

### Community 9 - "Paquete Core"
Cohesion: 0.14
Nodes (11): QUERIES, Caja, Empresa, EstadoCuenta, PagoLinea, PrecioCliente, Producto, ResumenDia (+3 more)

### Community 10 - "Validadores Negocio"
Cohesion: 0.38
Nodes (13): normalizar_clave(), Result, String, validar_cantidad(), validar_cantidad_venta(), validar_descuento(), validar_iva(), validar_monto() (+5 more)

### Community 11 - "TS Desktop Config"
Cohesion: 0.14
Nodes (13): compilerOptions, jsx, lib, module, moduleResolution, noEmit, extends, include (+5 more)

### Community 12 - "Core Build"
Cohesion: 0.15
Nodes (12): dependencies, devDependencies, typescript, typescript, main, name, private, scripts (+4 more)

### Community 13 - "Schemas Tauri (desktop)"
Cohesion: 0.15
Nodes (13): properties, Identifier, default, description, type, description, oneOf, type (+5 more)

### Community 14 - "Schemas Tauri (linux)"
Cohesion: 0.15
Nodes (13): definitions, Number, PermissionEntry, Target, Value, anyOf, description, anyOf (+5 more)

### Community 15 - "Schemas Tauri Linux"
Cohesion: 0.15
Nodes (13): properties, Identifier, default, description, type, description, oneOf, type (+5 more)

### Community 16 - "Schemas Tauri Desktop"
Cohesion: 0.15
Nodes (13): definitions, Number, PermissionEntry, Target, Value, anyOf, description, anyOf (+5 more)

### Community 17 - "Schemas Permisos Desktop"
Cohesion: 0.17
Nodes (12): $ref, array, null, description, items, type, uniqueItems, description (+4 more)

### Community 18 - "Schemas Permisos Linux"
Cohesion: 0.17
Nodes (12): $ref, array, null, description, items, type, uniqueItems, description (+4 more)

### Community 19 - "Caja y Turno"
Cohesion: 0.35
Nodes (11): abrir_caja(), caja_abierta(), cerrar_caja(), exigir_caja_abierta(), Caja, CajaAbrirInput, CajaCerrarInput, Connection (+3 more)

### Community 20 - "Pagos y Credito"
Cohesion: 0.33
Nodes (11): estado_cuenta(), estado_cuenta_todos(), historial_pagos(), registrar_abono(), AbonoInput, Connection, EstadoCuenta, PagoLinea (+3 more)

### Community 21 - "Ventas POS"
Cohesion: 0.38
Nodes (10): anular_venta(), crear_venta(), listar_ventas(), reservar_numero_factura(), Connection, Result, String, Vec (+2 more)

### Community 22 - "Esquema Base de Datos"
Cohesion: 0.49
Nodes (9): Mutex, apply_schema(), drop_old_schema(), hay_esquema_antiguo(), open(), reset_version(), Connection, Result (+1 more)

### Community 23 - "Schemas Ventanas Desktop"
Cohesion: 0.20
Nodes (10): type, webviews, windows, items, description, items, type, description (+2 more)

### Community 24 - "Schemas Ventanas Linux"
Cohesion: 0.20
Nodes (10): type, webviews, windows, items, description, items, type, description (+2 more)

### Community 25 - "Reporte Diario"
Cohesion: 0.42
Nodes (9): filtro_fecha(), get_config(), resumen_dia(), Connection, Option, Result, ResumenDia, String (+1 more)

### Community 26 - "TS Root Config"
Cohesion: 0.20
Nodes (9): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, module, moduleResolution, skipLibCheck, strict (+1 more)

### Community 27 - "TS Core Config"
Cohesion: 0.22
Nodes (8): compilerOptions, declaration, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.json

### Community 28 - "Schemas CapabilityRemote D"
Cohesion: 0.22
Nodes (9): description, properties, required, type, CapabilityRemote, urls, urls, description (+1 more)

### Community 29 - "Schemas CapabilityRemote L"
Cohesion: 0.22
Nodes (9): description, properties, required, type, CapabilityRemote, urls, urls, description (+1 more)

### Community 30 - "Capabilities Tauri"
Cohesion: 0.25
Nodes (7): description, identifier, permissions, $schema, windows, core:default, main

### Community 31 - "TS Mobile Config"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, extends, include, src/**/*, ../../tsconfig.json, App.tsx

### Community 32 - "Schemas Capability D"
Cohesion: 0.33
Nodes (6): description, required, type, Capability, identifier, permissions

### Community 33 - "Schemas Capability L"
Cohesion: 0.33
Nodes (6): description, required, type, Capability, identifier, permissions

### Community 34 - "Schema Desktop"
Cohesion: 0.40
Nodes (4): anyOf, description, $schema, title

### Community 35 - "Schema Linux"
Cohesion: 0.40
Nodes (4): anyOf, description, $schema, title

### Community 36 - "Script Monorepo"
Cohesion: 0.40
Nodes (3): fs, path, workspaceStructure

### Community 38 - "Schemas Local D"
Cohesion: 0.50
Nodes (4): default, description, type, local

### Community 39 - "Schemas Local L"
Cohesion: 0.50
Nodes (4): default, description, type, local

## Knowledge Gaps
- **247 isolated node(s):** `name`, `private`, `node`, `pnpm`, `dev:desktop` (+242 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 324 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Db` connect `Comandos Tauri` to `Esquema Base de Datos`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `properties` connect `Schemas Tauri (desktop)` to `Schemas Capability D`, `Schemas Permisos Desktop`, `Schemas Local D`, `Schemas Ventanas Desktop`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `properties` connect `Schemas Tauri Linux` to `Schemas Ventanas Linux`, `Schemas Capability L`, `Schemas Permisos Linux`, `Schemas Local L`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `name`, `private`, `node` to the rest of the system?**
  _247 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Comandos Tauri` be split into smaller, more focused modules?**
  _Cohesion score 0.13006654567453116 - nodes in this community are weakly interconnected._
- **Should `Servicios Frontend TS` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `Dependencias Desktop` be split into smaller, more focused modules?**
  _Cohesion score 0.046511627906976744 - nodes in this community are weakly interconnected._