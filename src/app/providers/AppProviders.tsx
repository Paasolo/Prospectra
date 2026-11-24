import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { ThemeProvider } from "@/app/providers/ThemeProvider";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
