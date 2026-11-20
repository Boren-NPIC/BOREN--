import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    let message = error.message || 'An unexpected application error occurred.';
    try {
      const parsed = JSON.parse(message) as { error?: string; operationType?: string; path?: string };
      if (parsed && parsed.error) {
        message = `Database permission or sync error (${parsed.operationType || 'operation'} on ${parsed.path || 'resource'}): ${parsed.error}`;
      }
    } catch {
      // keep raw message
    }
    return { hasError: true, message };
  }

  componentDidCatch(error: Error) {
    console.error('BORINA TV ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#07070b] text-zinc-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full border border-white/10 bg-[#111119] rounded-xl p-8 space-y-5">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h1 className="text-xl font-semibold text-white">Something went wrong</h1>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.href = '/';
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Return to BORINA TV
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
