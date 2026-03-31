import { StrictMode, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
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

const router = createBrowserRouter([
  {
    Component: RootLayout,
    children: [
      { index: true, lazy: () => import("@/routes/dashboard") },
      { path: "projects", lazy: () => import("@/routes/projects/list") },
      { path: "agents", lazy: () => import("@/routes/agents/list") },
      { path: "agents/:id", lazy: () => import("@/routes/agents/detail") },
      { path: "events", lazy: () => import("@/routes/events") },
      { path: "checklists", lazy: () => import("@/routes/checklists/index") },
      { path: "checklists/:id", lazy: () => import("@/routes/checklists/template") },
      { path: "checklists/assignments", lazy: () => import("@/routes/checklists/assignments") },
    ],
  },
  {
    path: "projects/:name",
    Component: ProjectLayout,
    children: [
      { index: true, lazy: () => import("@/routes/projects/detail") },
      { path: "crafts/new", lazy: () => import("@/routes/crafts/create") },
      { path: "crafts/:callsign", lazy: () => import("@/routes/crafts/detail") },
      { path: "tower", lazy: () => import("@/routes/tower") },
    ],
  },
]);

function App() {
  const wsUrl = getWsUrl();
  const wsManager = useWebSocket(wsUrl);

  useEffect(() => {
    return wsManager.onEvent((event) => {
      window.dispatchEvent(new CustomEvent("atc-ws-event", { detail: event }));
    });
  }, [wsManager]);

  const wsContext = useMemo(() => ({ manager: wsManager, url: wsUrl }), [wsManager, wsUrl]);

  return (
    <WsProvider value={wsContext}>
      <RouterProvider router={router} />
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
