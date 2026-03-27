import * as React from "react";
import { cn } from "../../lib/utils.js";

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "vertical" | "horizontal" | "both";
}

export const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, orientation = "vertical", ...props }, ref) => {
    const overflowClass =
      orientation === "both"
        ? "overflow-auto"
        : orientation === "horizontal"
          ? "overflow-x-auto overflow-y-hidden"
          : "overflow-y-auto overflow-x-hidden";

    return (
      <div
        ref={ref}
        className={cn("relative", overflowClass, className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
ScrollArea.displayName = "ScrollArea";

export const ScrollBar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex touch-none select-none", className)} {...props} />
  ),
);
ScrollBar.displayName = "ScrollBar";
