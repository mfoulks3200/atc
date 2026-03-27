import { Outlet } from "react-router";
import { Header } from "./header";
import { PageHeaderProvider } from "@/hooks/page-header-context";

interface ShellProps {
  sidebar: React.ReactNode;
}

export function Shell({ sidebar }: ShellProps) {
  return (
    <PageHeaderProvider>
      <div className="flex h-screen" style={{ backgroundColor: "var(--bg-base)" }}>
        {sidebar}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto p-5">
            <Outlet />
          </main>
        </div>
      </div>
    </PageHeaderProvider>
  );
}
