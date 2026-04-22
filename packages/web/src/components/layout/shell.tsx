import { Outlet } from "react-router";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { PageHeaderProvider } from "@/hooks/page-header-context";
import { ToastProvider } from "@/hooks/use-toast.js";
import { ToastContainer } from "@/components/ui/toast.js";
import { WsToastBridge } from "@/hooks/use-ws-toasts.js";

export function Shell() {
  return (
    <PageHeaderProvider>
      <ToastProvider>
        <div className="flex h-screen" style={{ backgroundColor: "var(--bg-base)" }}>
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-auto p-5">
              <Outlet />
            </main>
          </div>
        </div>
        <ToastContainer />
        <WsToastBridge />
      </ToastProvider>
    </PageHeaderProvider>
  );
}
