import { useEffect, useState } from 'react';
import {
  IMPRESORA_TERMICA_KEY,
  getConfig,
  listarImpresoras,
  probarImpresora,
  setConfig,
} from '../../services/db';
import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onGuardado: (valor: string) => void;
}

type Mensaje = { tipo: 'ok' | 'error'; texto: string } | null;

/// Configura la impresora térmica: detecta colas CUPS y puertos /dev/usb/lp*,
/// permite probar la impresión y guarda el destino en `config.impresora_termica`.
export function ConfigurarImpresoraModal({ open, onClose, onGuardado }: Props) {
  const [valor, setValor] = useState('');
  const [candidatas, setCandidatas] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje>(null);

  useEffect(() => {
    if (!open) return;
    setMensaje(null);
    setCargando(true);
    Promise.all([getConfig(IMPRESORA_TERMICA_KEY), listarImpresoras()])
      .then(([actual, lista]) => {
        if (actual) setValor(actual);
        setCandidatas(lista.map(String));
      })
      .catch(() => setCandidatas([]))
      .finally(() => setCargando(false));
  }, [open]);

  const probar = async () => {
    setProbando(true);
    setMensaje(null);
    try {
      await probarImpresora();
      setMensaje({ tipo: 'ok', texto: 'Prueba enviada correctamente a la impresora.' });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: String(e) });
    } finally {
      setProbando(false);
    }
  };

  const guardar = async () => {
    const destino = valor.trim();
    if (!destino) {
      setMensaje({ tipo: 'error', texto: 'Escribe un destino (ruta o cola CUPS) o elige una detectada.' });
      return;
    }
    try {
      await setConfig(IMPRESORA_TERMICA_KEY, destino);
      onGuardado(destino);
      onClose();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: String(e) });
    }
  };

  return (
    <Modal
      open={open}
      title="Configurar impresora térmica"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="secondary" onClick={probar} disabled={probando || !valor.trim()}>
            {probando ? 'Probando…' : 'Probar impresión'}
          </Button>
          <Button onClick={guardar}>Guardar</Button>
        </>
      }
    >
      <div className="space-y-4">
        {mensaje && (
          <p
            role="alert"
            className={`rounded-lg p-3 text-sm ${mensaje.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
          >
            {mensaje.texto}
          </p>
        )}

        <div>
          <p className="mb-1 text-xs font-medium text-gray-500">Impresoras detectadas</p>
          {cargando ? (
            <p className="text-sm text-gray-400">Buscando…</p>
          ) : candidatas.length === 0 ? (
            <p className="text-sm text-gray-500">
              No se detectaron impresoras. Conecta la térmica (o agrégala en CUPS) y vuelve a intentar.
            </p>
          ) : (
            <ul className="space-y-1">
              {candidatas.map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    onClick={() => setValor(c)}
                    className={`w-full rounded-lg border px-3 py-2 text-left font-mono text-sm ${valor === c ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                  >
                    {c}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500" htmlFor="destino-impresora">
            Destino (ruta /dev/usb/lp0 o cola CUPS)
          </label>
          <Input
            id="destino-impresora"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="/dev/usb/lp0"
          />
        </div>
      </div>
    </Modal>
  );
}