# Contribuir

Gracias por colaborar con Kalientico. Este documento describe el flujo y el
estándar de calidad del proyecto.

## Pila técnica

- Monorepo pnpm: `packages/core` (tipos/lógica compartida), `packages/desktop`
  (app de escritorio Tauri 2 + React + Vite).
- Backend nativo en Rust (SQLite con rusqlite).
- Frontend en TypeScript + React 18, Tailwind CSS y Zustand.
- Pruebas: Vitest (frontend) y `cargo test` (Rust).

## Flujo de trabajo

1. Crea una rama descriptiva: `fix/nombre`, `feat/nombre`.
2. Haz cambios pequeños y enfocados.
3. Cubre con pruebas cuando aplique.
4. Verifica en local antes del pull request:

   ```bash
   pnpm --filter @panaderia/core build
   pnpm --filter @panaderia/desktop build      # typecheck + vite
   pnpm --filter @panaderia/desktop lint
   pnpm --filter @panaderia/desktop test
   cd packages/desktop/src-tauri
   cargo fmt --all --check
   cargo clippy --all-targets -- -D warnings
   cargo test
   ```

5. Asegúrate de que el CI pase (corre las mismas comprobaciones).
6. Abre el pull request contra `main` describiendo qué hace y cómo se probó.

## Estándares

- No introducir comentarios salvo que aporten contexto (el código debe ser
  autoexplicativo).
- Seguir los formatos de `cargo fmt` y `prettier`/ESLint del repo.
- Nunca subir datos de negocio, bases de datos reales ni secretos.
- Mantener `CHANGELOG.md` al día en `[Unreleased]`.