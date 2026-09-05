import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { NEGOCIO_CONFIG_KEYS } from '@panaderia/core';
import { getConfig, setConfig } from '../services/db';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { PageHeader } from '../components/ui/Page';
import { PageLoader } from '../components/ui/Spinner';

export default function ConfiguracionPage() {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [nombre, setNombre] = useState('');
  const [rif, setRif] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');

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
  }, []);

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
    </div>
  );
}