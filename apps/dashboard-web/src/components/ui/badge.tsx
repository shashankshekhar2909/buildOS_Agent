import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium transition-all duration-200 focus:outline-none",
  {
    variants: {
      variant: {
        default: "border-accent/20 bg-accent/10 text-white shadow-[0_0_8px_rgba(124,92,255,0.05)]",
        secondary: "border-white/[0.05] bg-white/[0.04] text-slate-300",
        outline: "border-white/[0.08] text-slate-400 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
