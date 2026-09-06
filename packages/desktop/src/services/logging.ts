// Registro de errores del frontend en `app_data/errores.log` a través de Tauri.
// Evita recursión: solo invoca el backend, no toca consola.

import { invoke } from '@tauri-apps/api/core';

let activo = false;

export function iniciarRegistroErrores() {
  if (activo || typeof window === 'undefined') return;
  activo = true;

  window.addEventListener('error', (e) => {
    void logError('window', e.error ?? e.message);
  });

  window.addEventListener('unhandledrejection', (e) => {
    void logError('promesa', e.reason);
  });
}

export function logError(origen: string, error: unknown): void {
  const mensaje = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  invoke('log_error', { origen, mensaje }).catch(() => {
    /* sin backend (navegador) no se registra */
  });
}