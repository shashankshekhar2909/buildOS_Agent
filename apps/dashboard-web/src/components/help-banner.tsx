import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function HelpBanner({
  title,
  description,
  bullets,
  href,
  hrefLabel,
  badge = "Help",
}: {
  title: string;
  description: string;
  bullets?: string[];
  href?: string;
  hrefLabel?: string;
  badge?: string;
}) {
  return (
    <Card className="border border-cyan-500/15 bg-cyan-500/5">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Badge variant="outline" className="border-cyan-500/20 text-cyan-200">
              {badge}
            </Badge>
            <div className="text-sm font-semibold text-white">{title}</div>
            <p className="max-w-3xl text-sm leading-6 text-slate-300">{description}</p>
            {bullets && bullets.length > 0 && (
              <ul className="space-y-1 text-xs text-slate-400">
                {bullets.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            )}
          </div>
          {href && hrefLabel && (
            <Link
              href={href}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-white/[0.08] bg-transparent px-3 text-xs text-slate-300 hover:bg-white/[0.04] hover:text-white"
            >
              {hrefLabel}
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
