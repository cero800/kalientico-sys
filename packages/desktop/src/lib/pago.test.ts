import { describe, expect, it } from 'vitest';
import { aMontoPago, pagadoEnUsd, validarCobertura } from './pago';
import type { MontoPago } from './pago';

const TASA = 36.85;

const usd = (monto: number): MontoPago => ({ monto, tipo_pago: 'efectivo', moneda: 'usd' });
const ves = (monto: number): MontoPago => ({ monto, tipo_pago: 'efectivo', moneda: 'ves' });

describe('pagadoEnUsd', () => {
  it('suma en US$ convirtiendo Bs', () => {
    const p = [usd(500), ves(18_425)]; // $5.00 + Bs 184.25 (= $5.00)
    expect(pagadoEnUsd(p, TASA)).toBe(1000);
  });

  it('suma con un solo pago', () => {
    expect(pagadoEnUsd([usd(750)], TASA)).toBe(750);
  });
});

describe('validarCobertura', () => {
  it('cubre el total', () => {
    const r = validarCobertura(1000, [usd(500), ves(18_425)], TASA);
    expect(r.pagadoUsd).toBe(1000);
    expect(r.faltanteUsd).toBe(0);
    expect(r.valido).toBe(true);
  });

  it('detecta pago insuficiente', () => {
    const r = validarCobertura(1000, [usd(700)], TASA);
    expect(r.valido).toBe(false);
    expect(r.faltanteUsd).toBe(300);
  });

  it('rechaza sobrepago mayor a total+1', () => {
    expect(validarCobertura(1000, [usd(1001)], TASA).valido).toBe(true);
    expect(validarCobertura(1000, [usd(1002)], TASA).valido).toBe(false);
  });
});

describe('aMontoPago', () => {
  it('mapea desde PagoInput', () => {
    expect(
      aMontoPago({ monto: 100, tipo_pago: 'transferencia', moneda: 'ves', numero_referencia: 'R-01' }),
    ).toEqual({ monto: 100, tipo_pago: 'transferencia', moneda: 'ves', numero_referencia: 'R-01' });
  });
});