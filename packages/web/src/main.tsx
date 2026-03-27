import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getWsUrl } from "@/lib/api-client";
import { useWebSocket } from "@/hooks/use-websocket";
import { WsProvider } from "@/hooks/ws-context";
import { RootLayout } from "@/routes/root";
import { ProjectLayout } from "@/routes/project-layout";
import "./theme/globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
    },
  },
});

function App() {
  const wsUrl = getWsUrl();
  const wsManager = useWebSocket(wsUrl);

  useEffect(() => {
    return wsManager.onEvent((event) => {
      window.dispatchEvent(new CustomEvent("atc-ws-event", { detail: event }));
    });
  }, [wsManager]);

  return (
    <WsProvider value={wsManager}>
      <BrowserRouter>
        <Routes>
          <Route element={<RootLayout wsManager={wsManager} wsUrl={wsUrl} />}>
            <Route index lazy={() => import("@/routes/dashboard")} />
            <Route path="projects" lazy={() => import("@/routes/projects/list")} />
            <Route path="agents" lazy={() => import("@/routes/agents/list")} />
            <Route path="agents/:id" lazy={() => import("@/routes/agents/detail")} />
            <Route path="events" lazy={() => import("@/routes/events")} />
          </Route>
          <Route
            path="projects/:name"
            element={<ProjectLayout wsManager={wsManager} wsUrl={wsUrl} />}
          >
            <Route index lazy={() => import("@/routes/projects/detail")} />
            <Route path="crafts/:callsign" lazy={() => import("@/routes/crafts/detail")} />
            <Route path="tower" lazy={() => import("@/routes/tower")} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WsProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
