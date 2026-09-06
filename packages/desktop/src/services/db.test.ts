import { describe, expect, it, vi } from 'vitest';

// El contrato IPC de Tauri v2 es camelCase por defecto (a menos que el comando
// Rust use rename_all = "snake_case"). Este test protege los nombres de claves
// exactos que se envían, para no repetir el bug de `verificar_pin` que fallaba
// con "missing required key usuarioId".

const invoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args?: unknown) => invoke(cmd, args),
}));

import {
  verificarPin,
  eliminarBackup,
  cambiarPin,
  registrarProduccion,
  getFactura,
} from './db';

describe('Contrato IPC (claves de argumentos)', () => {
  it('verificar_pin envía usuarioId (camelCase, comando sin rename_all)', () => {
    verificarPin(1, '1234');
    expect(invoke).toHaveBeenCalledWith('verificar_pin', { usuarioId: 1, pin: '1234' });
  });

  it('eliminar_backup envía nombreArchivo (camelCase, comando sin rename_all)', () => {
    eliminarBackup('x.db');
    expect(invoke).toHaveBeenCalledWith('eliminar_backup', { nombreArchivo: 'x.db' });
  });

  it('obtener_factura envía ventaId (camelCase)', () => {
    getFactura(7);
    expect(invoke).toHaveBeenCalledWith('obtener_factura', { ventaId: 7 });
  });

  it('cambiar_pin envía snake_case (comando con rename_all = "snake_case")', () => {
    cambiarPin(1, '1111', '2222');
    expect(invoke).toHaveBeenCalledWith('cambiar_pin', {
      usuario_id: 1,
      pin_actual: '1111',
      pin_nuevo: '2222',
    });
  });

  it('registrar_produccion envía snake_case (comando con rename_all = "snake_case")', () => {
    registrarProduccion({
      producto_id: 3,
      cantidad: 12,
      costo_unitario: 500,
      operador_id: 1,
      fecha: '2026-09-06',
    });
    expect(invoke).toHaveBeenCalledWith('registrar_produccion', {
      producto_id: 3,
      cantidad: 12,
      costo_unitario: 500,
      operador_id: 1,
      fecha: '2026-09-06',
    });
  });
});