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
        <div className="min-h-screen flex items-center justify-center bg-main dark:bg-main p-6">
          <div className="max-w-md w-full rounded-xl border border-border dark:border-border bg-elevated dark:bg-elevated p-6 text-link space-y-4">
            <div className="mx-auto w-12 h-12 rounded-xl bg-danger/15 text-danger flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-link font-semibold text-text dark:text-text">
              Something went wrong
            </h1>
            <p className="text-link text-text dark:text-text break-words">
              {friendly}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-majlis-hover text-text text-link font-medium transition-colors"
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
