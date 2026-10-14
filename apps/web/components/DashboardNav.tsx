"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, LayoutDashboard, Trophy, Leaf, CheckSquare, Clock, Users, PawPrint, UserCircle, Radio, Store, Crown, Flag, Monitor, ShieldAlert, BookOpen, FileText, Target, Folder, Server } from "lucide-react";

const personalWorkspace = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/timer", label: "Focus Timer", icon: Clock },
  { href: "/dashboard/subjects", label: "Subjects", icon: Folder },
  { href: "/dashboard/notes", label: "Notes", icon: FileText },
  { href: "/dashboard/todos", label: "To-Do List", icon: CheckSquare },
  { href: "/dashboard/goals", label: "Goals", icon: Target },
];

const pomoWorld = [
  { href: "/dashboard/profile", label: "Profile", icon: UserCircle },
  { href: "/dashboard/pets", label: "Pets", icon: PawPrint },
  { href: "/dashboard/store", label: "Store", icon: Store },
  { href: "/dashboard/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/dashboard/clans", label: "Clans", icon: Flag },
  { href: "/dashboard/garden", label: "Garden", icon: Leaf },
  { href: "/dashboard/history", label: "History", icon: History },
  { href: "/dashboard/live", label: "Live Rooms", icon: Radio },
  { href: "/dashboard/friends", label: "Friends", icon: Users },
  { href: "/dashboard/servers", label: "My Servers", icon: Server },
  { href: "/dashboard/desktop", label: "Desktop App", icon: Monitor },
];

export default function DashboardNav() {
  const pathname = usePathname();

  // Sub-pages (e.g. /dashboard/servers/123) keep their section highlighted
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname === href || pathname?.startsWith(`${href}/`);

  // Styled like a Discord channel list: uppercase categories, grey active row
  const renderNavGroup = (title: string, items: typeof personalWorkspace) => (
    <div className="mb-5">
      <h3 className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--text-muted)]">{title}</h3>
      <div className="hide-scrollbar flex gap-0.5 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 whitespace-nowrap rounded-md px-2 py-1.5 text-[15px] font-medium transition-colors lg:whitespace-normal ${
                active
                  ? "bg-[#404249] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[#35373c] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icon size={18} className={active ? "text-[var(--blurple)]" : "text-[var(--text-muted)]"} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="custom-scrollbar h-full w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
      {renderNavGroup("Personal workspace", personalWorkspace)}
      {renderNavGroup("Pomo social", pomoWorld)}

      <div className="mt-4 border-t border-[var(--border)] pt-4">
        <Link
          href="/pricing"
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[15px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[#35373c] hover:text-[var(--text-primary)]"
        >
          <Crown size={18} className="text-[var(--blurple)]" />
          Pomo Pro
        </Link>
      </div>
    </div>
  );
}
