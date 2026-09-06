import { useEffect, useState } from 'react';
import { DatabaseBackup, KeyRound, RefreshCw, Save, Trash2 } from 'lucide-react';
import { NEGOCIO_CONFIG_KEYS } from '@panaderia/core';
import {
  cambiarPin,
  crearBackup,
  eliminarBackup,
  getConfig,
  listarBackups,
  setConfig,
  type BackupItem,
} from '../services/db';
import { useSesion } from '../store/sesion';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { PageHeader } from '../components/ui/Page';
import { PageLoader } from '../components/ui/Spinner';

export default function ConfiguracionPage() {
  const operadorId = useSesion((s) => s.operador?.id ?? 0);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [nombre, setNombre] = useState('');
  const [rif, setRif] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');

  const [pinActual, setPinActual] = useState('');
  const [pinNuevo, setPinNuevo] = useState('');
  const [pinConfirmo, setPinConfirmo] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinOk, setPinOk] = useState(false);
  const [pinGuardando, setPinGuardando] = useState(false);

  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [backupMsj, setBackupMsj] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupCreando, setBackupCreando] = useState(false);

  useEffect(() => {
    Promise.all([
      getConfig(NEGOCIO_CONFIG_KEYS.nombre),
      getConfig(NEGOCIO_CONFIG_KEYS.rif),
      getConfig(NEGOCIO_CONFIG_KEYS.telefono),
      getConfig(NEGOCIO_CONFIG_KEYS.direccion),
    ])
      .then(([n, r, t, d]) => {
        setNombre(n ?? '');
        setRif(r ?? '');
        setTelefono(t ?? '');
        setDireccion(d ?? '');
      })
      .catch(() => undefined)
      .finally(() => setCargando(false));
    void cargarBackups();
  }, []);

  const cargarBackups = async () => {
    try {
      setBackups(await listarBackups());
    } catch {
      setBackups([]);
    }
  };

  const guardar = async () => {
    setGuardando(true);
    setGuardado(false);
    try {
      await Promise.all([
        setConfig(NEGOCIO_CONFIG_KEYS.nombre, nombre.trim()),
        setConfig(NEGOCIO_CONFIG_KEYS.rif, rif.trim()),
        setConfig(NEGOCIO_CONFIG_KEYS.telefono, telefono.trim()),
        setConfig(NEGOCIO_CONFIG_KEYS.direccion, direccion.trim()),
      ]);
      setGuardado(true);
    } catch {
      setGuardado(false);
    } finally {
      setGuardando(false);
    }
  };

  const guardarPin = async () => {
    setPinError(null);
    setPinOk(false);
    if (pinNuevo.length !== 4 || pinConfirmo.length !== 4) {
      setPinError('El PIN debe tener 4 dígitos');
      return;
    }
    if (pinNuevo !== pinConfirmo) {
      setPinError('Los PINs nuevos no coinciden');
      return;
    }
    setPinGuardando(true);
    try {
      await cambiarPin(operadorId, pinActual, pinNuevo);
      setPinOk(true);
      setPinActual('');
      setPinNuevo('');
      setPinConfirmo('');
    } catch (e) {
      setPinError(String(e));
    } finally {
      setPinGuardando(false);
    }
  };

  const hacerCopia = async () => {
    setBackupCreando(true);
    setBackupMsj(null);
    setBackupError(null);
    try {
      const item = await crearBackup();
      setBackupMsj(`Copia creada: ${item.nombre}`);
      cargarBackups();
    } catch (e) {
      setBackupError(String(e));
    } finally {
      setBackupCreando(false);
    }
  };

  const borrarCopia = async (b: BackupItem) => {
    setBackupError(null);
    setBackupMsj(null);
    try {
      await eliminarBackup(b.nombre);
      cargarBackups();
    } catch (e) {
      setBackupError(String(e));
    }
  };

  if (cargando) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Configuración"
        subtitle="Datos del negocio que encabezan las facturas"
        actions={
          <Button onClick={guardar} disabled={guardando}>
            <Save className="h-4 w-4" /> Guardar
          </Button>
        }
      />

      <Card className="max-w-xl p-4">
        {guardado && (
          <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            Datos guardados correctamente
          </p>
        )}
        <div className="space-y-3">
          <Input
            label="Nombre del negocio"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Panadería Kalientico"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="RIF" value={rif} onChange={(e) => setRif(e.target.value)} placeholder="J-12345678-9" />
            <Input label="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="0414-0000000" />
          </div>
          <Input label="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Ciudad, estado" />
        </div>

        <div className="mt-6 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
          Estos datos aparecen en el encabezado de cada factura al imprimirla.
        </div>
      </Card>

      <Card className="mt-4 max-w-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Cambiar mi PIN</h2>
        </div>
        {pinOk && (
          <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            PIN actualizado correctamente
          </p>
        )}
        {pinError && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {pinError}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="PIN actual"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pinActual}
            onChange={(e) => setPinActual(e.target.value.replace(/\D/g, ''))}
          />
          <Input
            label="PIN nuevo"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pinNuevo}
            onChange={(e) => setPinNuevo(e.target.value.replace(/\D/g, ''))}
          />
          <Input
            label="Confirmar PIN"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pinConfirmo}
            onChange={(e) => setPinConfirmo(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div className="mt-3">
          <Button onClick={guardarPin} disabled={pinGuardando}>
            {pinGuardando ? 'Guardando…' : 'Actualizar PIN'}
          </Button>
        </div>
      </Card>

      <Card className="mt-4 max-w-xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DatabaseBackup className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900">Copias de seguridad</h2>
          </div>
          <Button variant="secondary" size="sm" onClick={hacerCopia} disabled={backupCreando}>
            <RefreshCw className="h-4 w-4" /> {backupCreando ? 'Creando…' : 'Crear copia'}
          </Button>
        </div>

        {backupMsj && (
          <p role="status" className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            {backupMsj}
          </p>
        )}
        {backupError && (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {backupError}
          </p>
        )}

        {backups.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no hay copias de seguridad.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {backups.map((b) => (
              <li key={b.nombre} className="flex items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-800">{b.nombre}</p>
                  <p className="text-xs text-gray-500">
                    {formatearFecha(b.fecha)} · {formatearBytes(b.tamano_bytes)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => borrarCopia(b)}
                  aria-label={`Eliminar ${b.nombre}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
          Se guarda una copia automática cada día en tu carpeta de Documentos, dentro de{' '}
          <span className="font-mono">kalientico/backups</span>. Las copias manuales se suman a las automáticas y
          se conservan las 30 más recientes.
        </div>
      </Card>
    </div>
  );
}

function formatearBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatearFecha(ts: string): string {
  if (!/\d{8}-\d{6}/.test(ts)) return ts;
  const fecha = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
  const hora = `${ts.slice(9, 11)}:${ts.slice(11, 13)}`;
  return `${fecha} ${hora} UTC`;
}