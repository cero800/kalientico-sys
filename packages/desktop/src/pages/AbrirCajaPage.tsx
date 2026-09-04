import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banknote, Landmark } from 'lucide-react';
import { abrirCaja, getTasaCambio, setTasaCambio } from '../services/db';
import { useSesion } from '../store/sesion';
import { Card, CardHeader } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { parseCentsInput } from '../lib/format';

export default function AbrirCajaPage() {
  const navegar = useNavigate();
  const operador = useSesion((s) => s.operador);
  const refrescar = useSesion((s) => s.refrescar);

  const [tasa, setTasa] = useState('');
  const [efectivoUsd, setEfectivoUsd] = useState('');
  const [efectivoVes, setEfectivoVes] = useState('');
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
    const fUsd = parseCentsInput(efectivoUsd, 'usd') ?? 0;
    const fVes = parseCentsInput(efectivoVes, 'ves') ?? 0;
    if (efectivoUsd.trim() !== '' && parseCentsInput(efectivoUsd, 'usd') === null) {
      setCampoError('usd');
      return;
    }
    if (efectivoVes.trim() !== '' && parseCentsInput(efectivoVes, 'ves') === null) {
      setCampoError('ves');
      return;
    }

    setGuardando(true);
    setError(null);
    setCampoError(null);
    try {
      await setTasaCambio(tasaNum);
      await abrirCaja({
        operador_id: operador!.id,
        efectivo_inicial_usd: fUsd,
        efectivo_inicial_ves: fVes,
      });
      await refrescar();
      navegar('/venta');
    } catch (e) {
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
            label="Tasa del día (Bs por US$)"
            hint="Se pre-carga con la última tasa guardada. Úsala para todas las ventas de hoy."
            value={tasa}
            onChange={(e) => setTasa(e.target.value)}
            inputMode="decimal"
            error={campoError === 'tasa' ? 'Ingresa una tasa válida mayor que cero' : undefined}
          />
          <Input
            label="Efectivo inicial en US$"
            prefix={<Banknote className="h-4 w-4" />}
            value={efectivoUsd}
            onChange={(e) => setEfectivoUsd(e.target.value)}
            placeholder="0.00"
            error={campoError === 'usd' ? 'Monto no válido' : undefined}
          />
          <Input
            label="Efectivo inicial en Bs"
            prefix={<Landmark className="h-4 w-4" />}
            value={efectivoVes}
            onChange={(e) => setEfectivoVes(e.target.value)}
            placeholder="0,00"
            error={campoError === 'ves' ? 'Monto no válido' : undefined}
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