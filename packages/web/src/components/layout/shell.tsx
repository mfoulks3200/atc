import { Outlet } from "react-router";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { PageHeaderProvider } from "@/hooks/page-header-context";
import { SidebarSlotProvider } from "@/hooks/sidebar-slot-context";

export function Shell() {
  return (
    <SidebarSlotProvider>
      <PageHeaderProvider>
        <div className="flex h-screen" style={{ backgroundColor: "var(--bg-base)" }}>
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-auto p-5">
              <Outlet />
            </main>
          </div>
        </div>
      </PageHeaderProvider>
    </SidebarSlotProvider>
  );
}
