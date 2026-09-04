import { describe, expect, it } from 'vitest';
import { formatCents, formatUsdCents, formatVesCents, parseCentsInput } from './format';

describe('formatUsdCents', () => {
  it('formatea con miles por coma y punto decimal', () => {
    expect(formatUsdCents(123456)).toBe('$1,234.56');
    expect(formatUsdCents(100)).toBe('$1.00');
    expect(formatUsdCents(0)).toBe('$0.00');
  });

  it('maneja redondeo y negativos', () => {
    expect(formatUsdCents(99_995)).toBe('$999.95');
    expect(formatUsdCents(-250)).toBe('-$2.50');
  });
});

describe('formatVesCents', () => {
  it('formatea con miles por punto y coma decimal', () => {
    expect(formatVesCents(123456)).toBe('Bs 1.234,56');
    expect(formatVesCents(36850)).toBe('Bs 368,50');
    expect(formatVesCents(0)).toBe('Bs 0,00');
  });
});

describe('formatCents', () => {
  it('elige según la moneda', () => {
    expect(formatCents(500, 'usd')).toBe('$5.00');
    expect(formatCents(500, 'ves')).toBe('Bs 5,00');
  });
});

describe('parseCentsInput', () => {
  it('parsea entradas US$', () => {
    expect(parseCentsInput('1,234.56', 'usd')).toBe(123456);
    expect(parseCentsInput('1234', 'usd')).toBe(123400);
    expect(parseCentsInput('$ 10.5', 'usd')).toBe(1050);
  });

  it('parsea entradas Bs', () => {
    expect(parseCentsInput('1.234,56', 'ves')).toBe(123456);
    expect(parseCentsInput('368,50', 'ves')).toBe(36850);
    expect(parseCentsInput('1234', 'ves')).toBe(123400);
  });

  it('rechaza textos inválidos', () => {
    expect(parseCentsInput('', 'usd')).toBeNull();
    expect(parseCentsInput('abc', 'usd')).toBeNull();
    expect(parseCentsInput('10,5', 'usd')).toBeNull(); // coma como decimal en US$
    expect(parseCentsInput('10.5', 'ves')).toBeNull(); // punto como decimal en Bs
    expect(parseCentsInput('10.123', 'usd')).toBeNull(); // 3 decimales
    expect(parseCentsInput('-5', 'usd')).toBeNull();
  });
});