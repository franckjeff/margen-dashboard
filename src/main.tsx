import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { NoticeProvider } from "./components/Notice";
import { isExpected, logBackgroundErrors, logError } from "./lib/errorLog";
import "./styles.css";

logBackgroundErrors();

const queryClient = new QueryClient({
  // Every failed load or save is logged for admins, except the ones the user can fix themselves.
  queryCache: new QueryCache({ onError: (error) => isExpected(error) || logError("database", error) }),
  mutationCache: new MutationCache({ onError: (error) => isExpected(error) || logError("database", error) }),
  defaultOptions: {
    queries: {
      // Data counts as fresh for 30 seconds; after that, coming back to the tab or a page
      // refetches it in the background, so changes made by other users show up.
      staleTime: 30_000,
      retry: 1,
    },
  },
});

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <ErrorBoundary whole>
      <QueryClientProvider client={queryClient}>
        <NoticeProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </NoticeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
