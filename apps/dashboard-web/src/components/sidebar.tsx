"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Box, Cpu, FileClock, Brain, Settings, Workflow, Wrench, ShieldCheck } from "lucide-react";

const items = [
  { href: "/", label: "Overview", icon: Activity },
  { href: "/nodes", label: "Nodes", icon: Cpu },
  { href: "/agents", label: "Agents", icon: Workflow },
  { href: "/skills", label: "Skills", icon: Wrench },
  { href: "/tasks", label: "Tasks", icon: Box },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck },
  { href: "/logs", label: "Logs", icon: FileClock },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="w-56 border-r border-border bg-panel p-4 flex flex-col gap-1">
      <div className="text-lg font-semibold mb-4 text-accent">BuildAgent</div>
      {items.map(({ href, label, icon: Icon }) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${
              active ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-white hover:bg-neutral-900"
            }`}
          >
            <Icon size={16} />
            {label}
          </Link>
        );
      })}
    </aside>
  );
}
