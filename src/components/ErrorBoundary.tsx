import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Unexpected application error' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Majlis ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error) {
          friendly = `${parsed.error} (${parsed.operationType} on ${parsed.path || 'database'})`;
        }
      } catch {
        // Not JSON
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-[#1E1F22] p-6">
          <div className="max-w-md w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] p-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-xl bg-rose-500/15 text-rose-500 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
              Something went wrong
            </h1>
            <p className="text-sm text-slate-600 dark:text-zinc-300 break-words">
              {friendly}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-nexus hover:bg-nexus-hover text-white text-sm font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reload MAJLIS</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
