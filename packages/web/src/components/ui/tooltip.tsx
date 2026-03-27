import * as React from "react";
import { cn } from "../../lib/utils.js";

export interface TooltipProviderProps {
  children: React.ReactNode;
  delayDuration?: number;
}

export function TooltipProvider({ children }: TooltipProviderProps) {
  return <>{children}</>;
}

export interface TooltipProps {
  children: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Tooltip({ children }: TooltipProps) {
  return <>{children}</>;
}

export interface TooltipTriggerProps extends React.HTMLAttributes<HTMLSpanElement> {
  asChild?: boolean;
}

export const TooltipTrigger = React.forwardRef<HTMLSpanElement, TooltipTriggerProps>(
  ({ className, children, asChild: _asChild, ...props }, ref) => (
    <span ref={ref} className={cn("inline-flex", className)} {...props}>
      {children}
    </span>
  ),
);
TooltipTrigger.displayName = "TooltipTrigger";

export interface TooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

export const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ className, side: _side, align: _align, sideOffset: _sideOffset, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95",
        className,
      )}
      {...props}
    />
  ),
);
TooltipContent.displayName = "TooltipContent";
