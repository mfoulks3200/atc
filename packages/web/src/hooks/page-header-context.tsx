import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface Crumb {
  label: string;
  to?: string;
}

interface PageHeaderState {
  crumbs: Crumb[];
  right?: ReactNode;
}

interface PageHeaderContextValue {
  state: PageHeaderState;
  set: (state: PageHeaderState) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue | null>(null);

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PageHeaderState>({ crumbs: [] });
  const set = useCallback((s: PageHeaderState) => setState(s), []);

  return (
    <PageHeaderContext.Provider value={{ state, set }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeaderState(): PageHeaderState {
  const ctx = useContext(PageHeaderContext);
  if (!ctx) throw new Error("usePageHeaderState must be used within PageHeaderProvider");
  return ctx.state;
}

export function useSetPageHeader(): (state: PageHeaderState) => void {
  const ctx = useContext(PageHeaderContext);
  if (!ctx) throw new Error("useSetPageHeader must be used within PageHeaderProvider");
  return ctx.set;
}
