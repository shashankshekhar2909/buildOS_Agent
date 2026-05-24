import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";

const socials = [
  { label: "X / Twitter", href: "https://x.com/shekharbuilds" },
  { label: "GitHub", href: "https://github.com/shashankshekhar2909" },
  { label: "LinkedIn", href: "https://linkedin.com/in/shashankshekhar2k15" },
  { label: "Reddit", href: "https://www.reddit.com/user/s_shekhar29/" },
  { label: "Website", href: "https://buildwithshashank.com/" },
];

const navLinks = [
  { href: "/", label: "Overview" },
  { href: "/agents", label: "Agents" },
  { href: "/nodes", label: "Nodes" },
  { href: "/tasks", label: "Tasks" },
  { href: "/settings", label: "Settings" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#07080c]/40 backdrop-blur-md">
      <div className="mx-auto max-w-[1600px] px-4 py-12 sm:px-6 md:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr]">
          {/* Brand block */}
          <div>
            <Wordmark size={26} />
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
              AI-native personal OS. Multi-agent orchestration, distributed nodes, approvals, and audit — self-hosted.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              By{" "}
              <Link
                href="https://buildwithshashank.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-slate-300 hover:text-accent transition-colors"
              >
                BuildWithShashank
              </Link>
            </p>
          </div>

          {/* Nav links */}
          <nav aria-label="Footer navigation">
            <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Console
            </p>
            <ul className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-slate-400 hover:text-accent transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Social links */}
          <nav aria-label="Social links">
            <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Connect
            </p>
            <ul className="flex flex-wrap gap-2">
              {socials.map((social) => (
                <li key={social.label}>
                  <Link
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs text-slate-400 hover:border-accent/30 hover:bg-accent/10 hover:text-accent transition-all"
                  >
                    {social.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/[0.06] pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            &copy; {new Date().getFullYear()}{" "}
            <Link
              href="https://buildwithshashank.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-slate-400 hover:text-accent transition-colors"
            >
              BuildWithShashank
            </Link>
            . All rights reserved.
          </span>
          <span className="font-mono text-[11px] text-slate-600">BuildAgent · self-hosted · token-auth</span>
        </div>
      </div>
    </footer>
  );
}
