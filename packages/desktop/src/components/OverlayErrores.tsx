import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { limpiarErrores, useErrores } from '../services/logging';

/** Muestra en pantalla los errores de la app (IPC, promesas, etc.) para poder
 *  diagnosticarlos sin necesitar DevTools. Descartable y no intercepta clics. */
export default function OverlayErrores() {
  const errores = useErrores();
  const [abierto, setAbierto] = useState(false);

  if (errores.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-50 flex flex-col items-end gap-2">
      {abierto && (
        <div className="pointer-events-auto w-80 max-h-72 overflow-auto rounded-xl border border-red-200 bg-white p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-red-700">{errores.length} error(es)</p>
            <div className="flex gap-1">
              <button
                type="button"
                className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
                onClick={limpiarErrores}
              >
                Limpiar
              </button>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-gray-400 hover:bg-gray-100"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {errores.map((e) => (
            <div key={e.id} className="mt-2 rounded-lg bg-red-50 p-2 text-xs">
              <p className="font-medium text-red-800">
                [{e.hora}] {e.origen}
              </p>
              <pre className="mt-1 whitespace-pre-wrap break-words text-red-700">{e.texto}</pre>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-red-700"
        onClick={() => setAbierto(!abierto)}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {errores.length} error(es)
      </button>
    </div>
  );
}