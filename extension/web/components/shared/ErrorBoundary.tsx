import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary
 * Catches unhandled React render errors and displays a recovery UI.
 * Wrap any page or section that might fail (e.g. FHE / ZK components).
 *
 * Usage:
 *   <ErrorBoundary>
 *     <PrivacyPool />
 *   </ErrorBoundary>
 *
 *   <ErrorBoundary fallback={<p>Something went wrong.</p>}>
 *     <CrossSwap />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-5 animate-fade-in px-4">
          <div className="text-5xl">⚠️</div>
          <div className="text-center max-w-md">
            <h2 className="text-lg font-bold text-neutral-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-neutral-600 mb-1">
              An unexpected error occurred while rendering this component.
            </p>
            {this.state.error && (
              <pre className="mt-3 text-xs text-red-600 bg-red-900/20 border border-red-800/40 rounded-lg p-3 text-left overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
          </div>
          <button onClick={this.handleReset} className="btn-secondary">
            Try Again
          </button>
        </div>
      );
    }

    return <>{this.props.children}</>;
  }
}
