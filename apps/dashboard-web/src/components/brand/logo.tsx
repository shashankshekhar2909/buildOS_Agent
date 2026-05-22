import { cn } from "@/lib/utils";

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="ba-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c5cff" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#0a0a0a" stroke="url(#ba-grad)" strokeWidth="2" />
      <circle cx="32" cy="32" r="6" fill="url(#ba-grad)" />
      <circle cx="32" cy="12" r="3" fill="#7c5cff" />
      <circle cx="52" cy="32" r="3" fill="#10b981" />
      <circle cx="32" cy="52" r="3" fill="#10b981" />
      <circle cx="12" cy="32" r="3" fill="#7c5cff" />
      <line x1="32" y1="15" x2="32" y2="26" stroke="url(#ba-grad)" strokeWidth="1.5" />
      <line x1="49" y1="32" x2="38" y2="32" stroke="url(#ba-grad)" strokeWidth="1.5" />
      <line x1="32" y1="49" x2="32" y2="38" stroke="url(#ba-grad)" strokeWidth="1.5" />
      <line x1="15" y1="32" x2="26" y2="32" stroke="url(#ba-grad)" strokeWidth="1.5" />
    </svg>
  );
}

export function Wordmark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <div className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold text-white tracking-tight">BuildAgent</span>
        <span className="text-[9px] uppercase tracking-[0.22em] text-slate-500 mt-0.5">Control Room</span>
      </div>
    </div>
  );
}
