import * as React from "react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, children, ...props }, ref) => {
  return (
    <select
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-xl border border-white/[0.08] bg-[#0c0d12]/50 px-3.5 py-2 text-sm text-slate-100 outline-none transition-all duration-200 focus-visible:border-accent/40 focus-visible:ring-1 focus-visible:ring-accent/30 focus-visible:shadow-glow-accent disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
});
Select.displayName = "Select";

export { Select };
