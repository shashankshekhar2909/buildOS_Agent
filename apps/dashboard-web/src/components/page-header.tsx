import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/[0.06] bg-slate-950/40 p-6 md:p-8 backdrop-blur-md",
        className
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,92,255,0.12),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.05),transparent_35%)]" />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl space-y-2">
          {eyebrow && (
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent">
              {eyebrow}
            </span>
          )}
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white font-sans">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-slate-400 leading-relaxed font-sans">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap gap-2 relative z-10 shrink-0 sm:flex-nowrap">
            {actions}
          </div>
        )}
      </div>
    </section>
  );
}
