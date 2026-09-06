# Changelog

Todos los cambios notables del proyecto se documentan aquí. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/).

## [Unreleased]

### Agregado

- Seguridad: PIN numérico de 4 dígitos por operador al iniciar turno.
- Roles `admin`/`cajero`: la Configuración y las mermas/ajustes de inventario
  ahora son exclusivos del administrador.
- Cambio de PIN propio desde Configuración (admin).
- Copias de seguridad de la base de datos: copia automática diaria y copia
  manual, en `Documentos/kalientico/backups`, con retención de las 30 más
  recientes.
- Registro de errores de la interfaz en `app_data/errores.log`.
- Exportación del Reporte del día a Excel
  (`Documentos/kalientico/excel/reporte-AAAA-MM-DD.xlsx`).
- Política de seguridad de contenido (CSP) para la ventana de escritorio.
- CI en pull requests: typecheck, build, tests frontend, ESLint, `cargo fmt`,
  `cargo clippy` y `cargo test`.
- Análisis estático de seguridad (CodeQL) y Dependabot.
- Plantillas de issues/PR, CONTRIBUTING, CHANGELOG y SECURITY.
- Flujo de releases: instaladores Linux (deb/rpm/AppImage) y Windows
  (NSIS/MSI) al etiquetar `v*`.

### Cambiado

- En builds de producción la base de datos ya no se recrea ante cambios de
  esquema (migración no destructiva).
- El bundle inicial bajó de ~625 KB a ~200 KB al cargar jsPDF/ExcelJS de forma
  diferida (lazy loading de páginas).

### Arreglado

- Varios avisos de ESLint/clippy (código sin usos, simplificaciones).

## [1.0.0] - 2026-09-05

### Agregado

- Guardado automático de cada factura en PDF
  (`Documentos/kalientico/facturas/factura-NNNN-AAAA-MM-DD.pdf`).
- Cobro y deuda con monto total fijo en US$ y Bs, válido para la nueva
  modalidad de precios (montos redondeados al céntimo).
- Barrido de precios especiales, número de caja y arqueo del código.
- Identidad visual en la barra lateral: «Kalientico».

### Cambiado

- La caja pasa a arqueo independiente por moneda (US$/Bs).

### Fijado

- Cierre de caja y reportes con la nueva moneda dual.