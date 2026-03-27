import { useEffect } from "react";
import { useSetPageHeader } from "@/hooks/page-header-context";

interface Crumb {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  crumbs: Crumb[];
  right?: React.ReactNode;
}

export function PageHeader({ crumbs, right }: PageHeaderProps) {
  const set = useSetPageHeader();
  const key = crumbs.map((c) => `${c.label}:${c.to ?? ""}`).join("|");

  useEffect(() => {
    set({ crumbs, right });
    return () => set({ crumbs: [] });
  }, [set, key]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
