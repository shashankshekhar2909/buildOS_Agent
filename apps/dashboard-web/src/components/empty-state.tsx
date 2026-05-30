import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/[0.06] bg-white/[0.01] p-10 text-center",
        className
      )}
    >
      {Icon && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 text-slate-400">
          <Icon size={20} />
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-200">{title}</p>
        {description && <p className="text-xs text-slate-500 max-w-sm">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
