import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins } from 'lucide-react';
import { cerrarCaja } from '../services/db';
import { useSesion } from '../store/sesion';
import { formatUsdCents, formatVesCents, parseCentsInput } from '../lib/format';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { PageLoader } from '../components/ui/Spinner';

export default function CerrarCajaPage() {
  const navegar = useNavigate();
  const caja = useSesion((s) => s.caja);
  const operador = useSesion((s) => s.operador);
  const setCaja = useSesion((s) => s.setCaja);

  const [efectivoUsd, setEfectivoUsd] = useState('');
  const [efectivoVes, setEfectivoVes] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (caja) {
      setEfectivoUsd(formatUsdCents(caja.efectivo_esperado_usd));
      setEfectivoVes(() => {
        const s = formatVesCents(caja.efectivo_esperado_ves);
        // formato Bs para editor
        return s.replace(/^Bs /, '');
      });
    }
  }, [caja]);

  const ingresadoUsd = parseCentsInput(efectivoUsd, 'usd');
  const ingresadoVes = parseCentsInput(efectivoVes, 'ves');

  const diferenciaUsd = caja ? (ingresadoUsd ?? 0) - caja.efectivo_esperado_usd : 0;
  const diferenciaVes = caja ? (ingresadoVes ?? 0) - caja.efectivo_esperado_ves : 0;

  const montosValidos =
    efectivoUsd.trim() === '' || ingresadoUsd !== null ? true : false;
  const vesValido = efectivoVes.trim() === '' || ingresadoVes !== null ? true : false;
  const puedeCerrar = montosValidos && vesValido && caja != null;

  const cerrar = async () => {
    if (!caja) return;
    setGuardando(true);
    setError(null);
    try {
      await cerrarCaja({
        caja_id: caja.id,
        operador_id: operador!.id,
        efectivo_final_usd: ingresadoUsd ?? caja.efectivo_esperado_usd,
        efectivo_final_ves: ingresadoVes ?? caja.efectivo_esperado_ves,
      });
      setCaja(null);
      navegar('/');
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  if (!caja) return <PageLoader />;

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader title="Cerrar caja" subtitle={`Caja #${caja.id} · ${operador?.nombre}`} />
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Esperado US$</p>
              <p className="text-lg font-bold text-gray-900">{formatUsdCents(caja.efectivo_esperado_usd)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Esperado Bs</p>
              <p className="text-lg font-bold text-gray-900">{formatVesCents(caja.efectivo_esperado_ves)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Efectivo ventas US$</p>
              <p className="font-semibold text-gray-800">{formatUsdCents(caja.efectivo_ventas_usd)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Efectivo ventas Bs</p>
              <p className="font-semibold text-gray-800">{formatVesCents(caja.efectivo_ventas_ves)}</p>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Arqueo real</h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  label="Efectivo final US$"
                  prefix="$"
                  value={efectivoUsd}
                  onChange={(e) => setEfectivoUsd(e.target.value)}
                  error={!montosValidos ? 'Monto no válido' : undefined}
                />
              </div>
              <div className="flex-1">
                <Input
                  label="Efectivo final Bs"
                  prefix="Bs"
                  value={efectivoVes}
                  onChange={(e) => setEfectivoVes(e.target.value)}
                  error={!vesValido ? 'Monto no válido' : undefined}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg bg-amber-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-amber-700">Diferencia US$</span>
              <strong className={diferenciaUsd === 0 ? 'text-gray-900' : diferenciaUsd > 0 ? 'text-emerald-700' : 'text-red-600'}>
                {formatUsdCents(diferenciaUsd)}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-amber-700">Diferencia Bs</span>
              <strong className={diferenciaVes === 0 ? 'text-gray-900' : diferenciaVes > 0 ? 'text-emerald-700' : 'text-red-600'}>
                {formatVesCents(diferenciaVes)}
              </strong>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {!confirmar ? (
            <Button className="w-full" size="lg" disabled={!puedeCerrar} onClick={() => setConfirmar(true)}>
              <Coins className="h-4 w-4" /> Cerrar caja
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-center text-sm text-gray-600">
                ¿Confirmas el cierre? Se bloquea el punto de venta hasta abrir una nueva caja.
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setConfirmar(false)}>
                  Volver
                </Button>
                <Button variant="danger" className="flex-1" disabled={guardando} onClick={cerrar}>
                  {guardando ? 'Cerrando…' : 'Sí, cerrar'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}