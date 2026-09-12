import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import type { Empresa } from '@panaderia/core';

export function esMostrador(e: Empresa) {
  return e.rut_nit === '0';
}

interface Props {
  empresas: Empresa[];
  clienteId: number | null;
  onChange: (id: number) => void;
}

/** Autocomplete del carrito: busca el cliente por nombre comercial o RIF/DNI. */
export default function ClienteAutocomplete({ empresas, clienteId, onChange }: Props) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [selecciono, setSelecciono] = useState(false);

  const clienteActual = empresas.find((e) => e.id === clienteId) ?? null;

  const filtrados = useMemo(() => {
    const q = texto.trim().toLowerCase();
    const base = q
      ? empresas.filter(
          (e) =>
            e.nombre_comercial.toLowerCase().includes(q) ||
            e.rut_nit.toLowerCase().includes(q),
        )
      : empresas;
    return [...base].sort((a, b) => Number(esMostrador(b)) - Number(esMostrador(a)));
  }, [empresas, texto]);

  const seleccionar = (e: Empresa) => {
    setTexto(e.nombre_comercial);
    setSelecciono(true);
    setAbierto(false);
    onChange(e.id);
  };

  const reiniciar = () => {
    if (selecciono) {
      setSelecciono(false);
      return;
    }
    if (clienteActual) setTexto(clienteActual.nombre_comercial);
  };

  const mostrado = abierto ? texto : clienteActual?.nombre_comercial ?? texto;

  return (
    <div>
      <label htmlFor="cliente-venta" className="mb-1 block text-xs font-medium text-gray-500">
        <span className="inline-flex items-center gap-1">
          <Users className="h-3 w-3" /> Cliente
        </span>
      </label>
      <div className="relative">
        <input
          id="cliente-venta"
          role="combobox"
          aria-expanded={abierto}
          aria-autocomplete="list"
          aria-label="Cliente"
          value={mostrado}
          onChange={(e) => {
            setTexto(e.target.value);
            setSelecciono(false);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => window.setTimeout(reiniciar, 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const primero = filtrados[0];
              if (primero) seleccionar(primero);
              e.preventDefault();
            }
            if (e.key === 'Escape') setAbierto(false);
          }}
          placeholder="Buscar por nombre o RIF/DNI…"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
        />
        {abierto && (
          <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {filtrados.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500">Sin resultados</li>
            ) : (
              filtrados.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => seleccionar(c)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-emerald-50 focus:outline-none"
                  >
                    <span className="font-medium text-gray-800">{c.nombre_comercial}</span>
                    {esMostrador(c) && <span className="ml-1 text-xs text-gray-400">(mostrador)</span>}
                    <span className="ml-2 font-mono text-xs text-gray-400">{c.rut_nit}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}