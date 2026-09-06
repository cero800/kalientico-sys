import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from './ErrorBoundary';
import OverlayErrores from './OverlayErrores';
import { limpiarErrores, reportarError } from '../services/logging';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockRejectedValue(new Error('no tauri')),
}));

function Bomba(): ReactNode {
  throw new Error('error simulado de render');
}

describe('ErrorBoundary', () => {
  it('sustituye la pantalla en blanco por el mensaje de error', () => {
    const { container } = render(
      <ErrorBoundary>
        <Bomba />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Algo salió mal/)).toBeInTheDocument();
    expect(screen.getByText(/error simulado de render/)).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('no tauri');
  });

  it('no interfiere cuando no hay errores', () => {
    render(
      <ErrorBoundary>
        <div>contenido normal</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('contenido normal')).toBeInTheDocument();
  });
});

describe('OverlayErrores', () => {
  afterEach(() => cleanup());

  beforeEach(() => limpiarErrores());

  it('no se muestra sin errores', () => {
    const { container } = render(<OverlayErrores />);
    expect(container).toBeEmptyDOMElement();
  });

  it('se muestra al reportar un error y permite limpiarlo', async () => {
    const usuario = userEvent.setup();
    reportarError('test', new Error('fallo de prueba'));
    render(<OverlayErrores />);
    expect(screen.getByRole('button', { name: /error\(es\)/ })).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: /error\(es\)/ }));
    expect(screen.getByText(/fallo de prueba/)).toBeInTheDocument();
    limpiarErrores();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /error\(es\)/ })).not.toBeInTheDocument(),
    );
  });
});