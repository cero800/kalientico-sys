import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportarError } from '../services/logging';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Captura errores de render/página para no mostrar una pantalla en blanco. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportarError('render', error);
    console.error('Error de interfaz:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const texto = `${this.state.error.message}\n${this.state.error.stack ?? ''}`;
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
        <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-bold text-red-700">Algo salió mal</h1>
          <p className="mt-1 text-sm text-gray-500">
            Se produjo un error de interfaz. Este mensaje reemplaza la pantalla en blanco para que
            puedas reportarlo.
          </p>
          <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-xs text-red-800">
            {texto}
          </pre>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              onClick={() => window.location.reload()}
            >
              Reiniciar la app
            </button>
            <button
              type="button"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => this.setState({ error: null })}
            >
              Intentar continuar
            </button>
          </div>
        </div>
      </div>
    );
  }
}