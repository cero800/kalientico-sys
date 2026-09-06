// Registro de errores del frontend en `app_data/errores.log` a través de Tauri
// y en memoria para mostrarlos en pantalla (OverlayErrores). Evita recursión:
// solo invoca el backend, no toca consola.

import { useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface ErrorRegistro {
  id: number;
  hora: string;
  origen: string;
  texto: string;
}

let activo = false;
let siguienteId = 1;
let errores: ErrorRegistro[] = [];
const suscriptores = new Set<() => void>();

function notificar() {
  suscriptores.forEach((fn) => fn());
}

function agregarError(origen: string, error: unknown) {
  const texto = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  errores = [
    ...errores,
    { id: siguienteId++, hora: new Date().toLocaleString(), origen, texto },
  ];
  notificar();
  invoke('log_error', { origen, mensaje: texto }).catch(() => {
    /* sin backend (navegador) no se registra */
  });
}

export function iniciarRegistroErrores() {
  if (activo || typeof window === 'undefined') return;
  activo = true;

  window.addEventListener('error', (e) => {
    agregarError('window', e.error ?? e.message);
  });

  window.addEventListener('unhandledrejection', (e) => {
    agregarError('promesa', e.reason);
  });
}

export function useErrores(): ErrorRegistro[] {
  return useSyncExternalStore(
    (fn) => {
      suscriptores.add(fn);
      return () => suscriptores.delete(fn);
    },
    () => errores,
  );
}

export function reportarError(origen: string, error: unknown) {
  agregarError(origen, error);
}

export function trazar(origen: string, mensaje: string): void {
  invoke('log_evento', { origen, mensaje }).catch(() => {
    /* sin backend (navegador) no se registra */
  });
}

export function limpiarErrores() {
  errores = [];
  notificar();
}