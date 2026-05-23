import { Component, type ErrorInfo, type ReactNode } from "react";
import { useDiagnosticsStore } from "../store/diagnostics.js";

interface Props {
  children: ReactNode;
  /** Currently-focused tick — attached to the render diagnostic so it appears in byTick. */
  tick?: number;
  /** When this changes, the boundary clears its error state (the next render can try again). */
  resetKey?: string | number;
}
interface State { error: Error | undefined }

export class PreviewErrorBoundary extends Component<Props, State> {
  override state: State = { error: undefined };

  static getDerivedStateFromError(error: unknown): State {
    const err = error instanceof Error ? error : new Error(String(error));
    return { error: err };
  }

  override componentDidCatch(error: unknown, _info: ErrorInfo): void {
    const err = error instanceof Error ? error : new Error(String(error));
    useDiagnosticsStore.getState().add({
      ts: Date.now(),
      tick: this.props.tick,
      category: "render",
      severity: "error",
      code: "preview-threw",
      message: err.message,
      detail: { stack: err.stack },
    });
  }

  override componentDidUpdate(prevProps: Props): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: undefined });
    }
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="rounded border border-edge bg-surface p-3 text-sm text-ink-muted"
        >
          Preview crashed — see Errors panel.
        </div>
      );
    }
    return this.props.children;
  }
}
