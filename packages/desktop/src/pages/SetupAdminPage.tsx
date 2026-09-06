import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { configurarAdmin, necesitaConfiguracion } from '../services/db';
import { Card } from '../components/ui/Card';
import { PageLoader, Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export default function SetupAdminPage() {
  const navegar = useNavigate();
  const [cargando, setCargando] = useState(true);
  const [necesita, setNecesita] = useState(true);
  const [nombre, setNombre] = useState('Administrador');
  const [pin, setPin] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    necesitaConfiguracion()
      .then((es) => {
        setNecesita(es);
        setCargando(false);
      })
      .catch((e) => {
        setError(String(e));
        setCargando(false);
      });
  }, []);

  const guardar = async () => {
    setError(null);
    if (nombre.trim().length === 0) {
      setError('El nombre del administrador es obligatorio.');
      return;
    }
    if (pin.length !== 4) {
      setError('El PIN debe tener exactamente 4 dígitos.');
      return;
    }
    if (pin !== confirmar) {
      setError('Los PIN no coinciden.');
      return;
    }
    setGuardando(true);
    try {
      await configurarAdmin({ nombre: nombre.trim(), pin });
      navegar('/login', { replace: true });
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <PageLoader />;

  if (!necesita) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 text-center">
          <ShieldCheck className="mx-auto mb-2 h-10 w-10 text-emerald-600" />
          <h1 className="text-lg font-bold text-gray-900">Primera configuración</h1>
          <p className="mt-1 text-sm text-gray-500">
            Crea el usuario administrador y asígnale un PIN de 4 dígitos
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <div className="grid gap-3">
            <Input
              label="Nombre del administrador"
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Administrador"
            />
            <Input
              label="PIN"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
            />
            <Input
              label="Confirmar PIN"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
            />
          </div>

          {error && (
            <p role="alert" className="mt-2 text-center text-sm text-red-600">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="mt-5 w-full"
            disabled={guardando || pin.length !== 4 || confirmar.length !== 4}
          >
            {guardando ? <Spinner /> : <KeyRound className="h-4 w-4" />}
            <span className="ml-2">Guardar y continuar</span>
          </Button>
        </form>
      </Card>
    </div>
  );
}