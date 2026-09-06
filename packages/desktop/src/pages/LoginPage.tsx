import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, CircleUserRound } from 'lucide-react';
import type { Usuario } from '@panaderia/core';
import { listarUsuarios, necesitaConfiguracion, verificarPin } from '../services/db';
import { trazar } from '../services/logging';
import { useSesion } from '../store/sesion';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export default function LoginPage() {
  const navegar = useNavigate();
  const operador = useSesion((s) => s.operador);
  const login = useSesion((s) => s.login);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<Usuario | null>(null);
  const [pin, setPin] = useState('');
  const [validando, setValidando] = useState(false);

  useEffect(() => {
    necesitaConfiguracion()
      .then((necesitaSetup) => {
        if (necesitaSetup) {
          navegar('/setup', { replace: true });
          return;
        }
        return listarUsuarios()
          .then((u) => setUsuarios(u.filter((x) => x.activo)))
          .catch((e) => setError(String(e)));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  }, [navegar]);

  const completarLogin = async (usuario: Usuario) => {
    await login(usuario);
    navegar('/');
  };

  const validarPin = async () => {
    if (!seleccionado) return;
    setValidando(true);
    setError(null);
    try {
      const ok = await verificarPin(seleccionado.id, pin);
      trazar('login', `PIN valido=${ok}`);
      if (ok) {
        await completarLogin(seleccionado);
        trazar('login', 'navegando a /');
      } else {
        setPin('');
        setError('PIN incorrecto. Intenta de nuevo.');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setValidando(false);
    }
  };

  if (operador) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <Card className="w-full max-w-sm p-6">
        {!seleccionado ? (
          <>
            <div className="mb-5 text-center">
              <CircleUserRound className="mx-auto mb-2 h-10 w-10 text-emerald-600" />
              <h1 className="text-lg font-bold text-gray-900">Elige tu operador</h1>
              <p className="mt-1 text-sm text-gray-500">Inicia turno seleccionando tu nombre</p>
            </div>

            {cargando ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : error ? (
              <p role="alert" className="text-center text-sm text-red-600">
                {error}
              </p>
            ) : (
              <ul className="grid gap-2">
                {usuarios.length === 0 && (
                  <li className="text-center text-sm text-gray-500">No hay operadores activos.</li>
                )}
                {usuarios.map((u) => (
                  <li key={u.id}>
                    <Button
                      variant="secondary"
                      className="w-full justify-start px-4 py-3 text-left"
                      onClick={() => {
                        setSeleccionado(u);
                        setError(null);
                        setPin('');
                      }}
                    >
                      <span className="font-medium">{u.nombre}</span>
                      <span className="ml-auto text-xs uppercase tracking-wide text-gray-400">{u.rol}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="mb-5 text-center">
              <CircleUserRound className="mx-auto mb-2 h-10 w-10 text-emerald-600" />
              <h1 className="text-lg font-bold text-gray-900">{seleccionado.nombre}</h1>
              <p className="mt-1 text-sm text-gray-500">Ingresa tu PIN de 4 dígitos</p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void validarPin();
              }}
            >
              <Input
                type="password"
                inputMode="numeric"
                autoFocus
                label="PIN"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
              />
              {error && (
                <p role="alert" className="mt-2 text-center text-sm text-red-600">
                  {error}
                </p>
              )}
              <div className="mt-5 flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setSeleccionado(null);
                    setError(null);
                    setPin('');
                  }}
                >
                  <ArrowLeft className="h-4 w-4" /> Volver
                </Button>
                <Button type="submit" disabled={validando || pin.length !== 4}>
                  {validando ? <Spinner /> : 'Entrar'}
                </Button>
              </div>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}