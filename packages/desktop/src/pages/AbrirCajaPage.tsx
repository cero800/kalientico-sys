import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { abrirCaja, getTasaCambio, setTasaCambio } from '../services/db';
import { useSesion } from '../store/sesion';
import { Card, CardHeader } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';

export default function AbrirCajaPage() {
  const navegar = useNavigate();
  const operador = useSesion((s) => s.operador);
  const refrescar = useSesion((s) => s.refrescar);

  const [tasa, setTasa] = useState('');
  const [tasaCargada, setTasaCargada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campoError, setCampoError] = useState<string | null>(null);

  useEffect(() => {
    getTasaCambio()
      .then((t) => setTasa(String(t)))
      .finally(() => setTasaCargada(true));
  }, []);

  const abrir = async () => {
    const tasaNum = Number(tasa.replace(',', '.'));
    if (!Number.isFinite(tasaNum) || tasaNum <= 0) {
      setCampoError('tasa');
      return;
    }

    setGuardando(true);
    setError(null);
    setCampoError(null);
    try {
      await setTasaCambio(tasaNum);
      await abrirCaja({ operador_id: operador!.id });
      await refrescar();
      navegar('/venta');
    } catch (e) {
      // Si el backend ya tenía una caja abierta (estado desincronizado),
      // recarga la realidad y continúa a la venta en vez de quedar atrapado.
      await refrescar();
      if (useSesion.getState().caja) {
        navegar('/venta', { replace: true });
        return;
      }
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  if (!tasaCargada) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader
          title="Abrir caja"
          subtitle={`Inicio de turno de ${operador?.nombre ?? ''} — establece la tasa del día`}
        />
        <div className="space-y-4 p-5">
          <Input
            label="Tasa del día"
            prefix={<span className="font-semibold">Bs</span>}
            hint="Se pre-carga con la última tasa guardada (Bs por 1 US$). Úsala para todas las ventas de hoy."
            value={tasa}
            onChange={(e) => setTasa(e.target.value)}
            inputMode="decimal"
            error={campoError === 'tasa' ? 'Ingresa una tasa válida mayor que cero' : undefined}
          />

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <Button className="w-full" size="lg" onClick={abrir} disabled={guardando}>
            {guardando ? 'Abriendo…' : 'Abrir caja y empezar'}
          </Button>
        </div>
      </Card>
    </div>
  );
}