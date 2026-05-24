import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-xl border border-white/[0.08] bg-[#0c0d12]/50 px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all duration-200 focus-visible:border-accent/40 focus-visible:ring-1 focus-visible:ring-accent/30 focus-visible:shadow-glow-accent disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
