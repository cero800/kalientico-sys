import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CircleUserRound } from 'lucide-react';
import type { Usuario } from '@panaderia/core';
import { listarUsuarios } from '../services/db';
import { useSesion } from '../store/sesion';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';

export default function LoginPage() {
  const navegar = useNavigate();
  const operador = useSesion((s) => s.operador);
  const login = useSesion((s) => s.login);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listarUsuarios()
      .then((u) => setUsuarios(u.filter((x) => x.activo)))
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  }, []);

  const elegir = async (usuario: Usuario) => {
    try {
      await login(usuario);
      navegar('/');
    } catch (e) {
      setError(String(e));
    }
  };

  if (operador) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <Card className="w-full max-w-sm p-6">
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
                  onClick={() => elegir(u)}
                >
                  <span className="font-medium">{u.nombre}</span>
                  <span className="ml-auto text-xs uppercase tracking-wide text-gray-400">{u.rol}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}