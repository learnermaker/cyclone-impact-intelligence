"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MODES = [
  { href: "/app/live",   label: "LIVE",   description: "Active event monitoring" },
  { href: "/app/impact", label: "IMPACT", description: "Hazard × exposure map" },
  { href: "/app/action", label: "ACTION", description: "Priority recommendations" },
  { href: "/app/replay", label: "REPLAY", description: "Fani 2019 historical replay" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex items-center border-b border-[#2e3450] bg-[#1a1d27] px-4"
      role="navigation"
      aria-label="Application mode navigation"
    >
      {MODES.map((mode) => {
        const isActive = pathname.startsWith(mode.href);
        return (
          <Link
            key={mode.href}
            href={mode.href}
            className={[
              "relative px-4 py-3 text-xs font-semibold tracking-widest transition-colors",
              isActive
                ? "text-slate-100 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-blue-500"
                : "text-slate-500 hover:text-slate-300",
            ].join(" ")}
            aria-current={isActive ? "page" : undefined}
            title={mode.description}
          >
            {mode.label}
          </Link>
        );
      })}
    </nav>
  );
}
