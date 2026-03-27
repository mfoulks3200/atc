import { Outlet } from "react-router";

interface ShellProps {
  sidebar: React.ReactNode;
  header: React.ReactNode;
}

export function Shell({ sidebar, header }: ShellProps) {
  return (
    <div className="flex h-screen" style={{ backgroundColor: "var(--bg-base)" }}>
      {sidebar}
      <div className="flex flex-1 flex-col overflow-hidden">
        {header}
        <main className="flex-1 overflow-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
