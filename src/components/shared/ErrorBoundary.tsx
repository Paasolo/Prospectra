import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallbackTitle?: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message: string | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: getErrorMessage(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error("React render error", {
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, message: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="font-display text-2xl font-semibold text-foreground">
            {this.props.fallbackTitle ?? "Something went wrong"}
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {this.state.message ?? "An unexpected error interrupted this view."}
          </p>
          <Button type="button" onClick={this.handleReset}>
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
