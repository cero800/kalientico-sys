import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

interface Props {
  value: string;
  onChange: (fecha: string) => void;
  'aria-label'?: string;
}

const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function aPartes(fecha: string): { y: number; m: number; d: number } {
  if (fecha === '') {
    const hoy = new Date();
    return { y: hoy.getFullYear(), m: hoy.getMonth(), d: hoy.getDate() };
  }
  const [y, m, d] = fecha.split('-').map(Number);
  return { y: Number.isFinite(y) ? y : new Date().getFullYear(), m: (Number.isFinite(m) ? m : 1) - 1, d: Number.isFinite(d) ? d : 1 };
}

function aIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function DatePicker({ value, onChange, 'aria-label': ariaLabel }: Props) {
  const { y, m, d } = aPartes(value);
  const [mes, setMes] = useState(m);
  const [anio, setAnio] = useState(y);
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMes(m);
    setAnio(y);
  }, [y, m]);

  useEffect(() => {
    if (!abierto) return;
    const onMousedown = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', onMousedown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMousedown);
      document.removeEventListener('keydown', onKey);
    };
  }, [abierto]);

  const primerDia = new Date(anio, mes, 1);
  const offset = (primerDia.getDay() + 6) % 7;
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();

  const celdas = useMemo(() => {
    const celdas: Array<number | null> = Array(offset).fill(null);
    for (let i = 1; i <= diasEnMes; i++) celdas.push(i);
    while (celdas.length % 7 !== 0) celdas.push(null);
    return celdas;
  }, [offset, diasEnMes]);

  const cambiarMes = (delta: number) => {
    let nuevoMes = mes + delta;
    let nuevoAnio = anio;
    if (nuevoMes < 0) {
      nuevoMes = 11;
      nuevoAnio -= 1;
    } else if (nuevoMes > 11) {
      nuevoMes = 0;
      nuevoAnio += 1;
    }
    setMes(nuevoMes);
    setAnio(nuevoAnio);
  };

  const hoy = new Date();
  const hoyIso = aIso(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="flex w-44 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        <CalendarDays className="h-4 w-4 text-gray-400" />
        <span>{value}</span>
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Calendario"
          className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Mes anterior"
              onClick={() => cambiarMes(-1)}
              className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-gray-800">
              {MESES[mes]} {anio}
            </span>
            <button
              type="button"
              aria-label="Mes siguiente"
              onClick={() => cambiarMes(1)}
              className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {DIAS.map((dia) => (
              <span key={dia} className="text-[10px] font-medium text-gray-400">
                {dia}
              </span>
            ))}
            {celdas.map((dia, i) =>
              dia == null ? (
                <span key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onChange(aIso(anio, mes, dia));
                    setAbierto(false);
                  }}
                  className={cn(
                    'rounded-md py-1 text-xs text-gray-700 hover:bg-emerald-50 hover:text-emerald-700',
                    dia === d && mes === m && anio === y && 'bg-emerald-600 font-semibold text-white hover:bg-emerald-600 hover:text-white',
                    aIso(anio, mes, dia) === hoyIso && dia !== d && 'font-semibold text-emerald-700',
                  )}
                >
                  {dia}
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}