import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { NoticeProvider } from "./components/Notice";
import "./styles.css";

const queryClient = new QueryClient({
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
    <QueryClientProvider client={queryClient}>
      <NoticeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </NoticeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
