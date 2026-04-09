import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface SidebarSlotContextValue {
  slotContent: ReactNode;
  setSlotContent: (content: ReactNode) => void;
}

const SidebarSlotContext = createContext<SidebarSlotContextValue | null>(null);

export function SidebarSlotProvider({ children }: { children: ReactNode }) {
  const [slotContent, setSlotContent] = useState<ReactNode>(null);
  return (
    <SidebarSlotContext.Provider value={{ slotContent, setSlotContent }}>
      {children}
    </SidebarSlotContext.Provider>
  );
}

/**
 * Injects content into the sidebar slot. Content is cleared on unmount.
 */
export function useSidebarSlot(content: ReactNode) {
  const ctx = useContext(SidebarSlotContext);
  if (!ctx) throw new Error("useSidebarSlot must be used within SidebarSlotProvider");

  useEffect(() => {
    ctx.setSlotContent(content);
    return () => ctx.setSlotContent(null);
  }, [content]);
}

export function useSidebarSlotContent() {
  const ctx = useContext(SidebarSlotContext);
  if (!ctx) throw new Error("useSidebarSlotContent must be used within SidebarSlotProvider");
  return ctx.slotContent;
}
