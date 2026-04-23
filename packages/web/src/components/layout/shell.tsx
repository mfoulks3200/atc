import { Outlet } from "react-router";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { TfrBanner } from "./tfr-banner";
import { PageHeaderProvider } from "@/hooks/page-header-context";
import { ToastProvider } from "@/hooks/use-toast";
import { ToastContainer } from "@/components/ui/toast";
import { WsToastBridge } from "@/hooks/use-ws-toasts";

export function Shell() {
  return (
    <PageHeaderProvider>
      <ToastProvider>
        <div className="flex h-screen" style={{ backgroundColor: "var(--bg-base)" }}>
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header />
            <TfrBanner />
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
