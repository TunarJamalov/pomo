"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Rocket, TerminalSquare, Leaf, ShoppingCart, Users, Shield, Coins, HeartHandshake, CalendarCheck } from "lucide-react";

const links = [
  { href: "/tutorials", label: "Introduction", icon: BookOpen },
  { href: "/tutorials/getting-started", label: "Getting Started", icon: Rocket },
  { href: "/tutorials/commands", label: "Commands List", icon: TerminalSquare },
  { href: "/tutorials/habits", label: "Habit Tracker", icon: CalendarCheck },
  { href: "/tutorials/garden", label: "Virtual Garden", icon: Leaf },
  { href: "/tutorials/pets-market", label: "Pets & Market", icon: ShoppingCart },
  { href: "/tutorials/team-sessions", label: "Team Sessions", icon: Users },
  { href: "/tutorials/study-buddy", label: "Study Buddy", icon: HeartHandshake },
  { href: "/tutorials/clans", label: "Clans & Leagues", icon: Shield },
  { href: "/tutorials/economy", label: "Water Economy", icon: Coins },
];

export default function TutorialSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full shrink-0 lg:w-56">
      <div className="lg:sticky lg:top-28">
        <p className="mb-3 px-2.5 text-[13px] font-bold text-[var(--site-fg)]">Guide</p>
        <nav className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          {links.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px] transition-colors ${
                  isActive
                    ? "bg-[var(--tomato-soft)] font-semibold text-[var(--tomato)]"
                    : "text-[var(--site-muted)] hover:bg-white/[0.04] hover:text-[var(--site-fg)]"
                }`}
              >
                <Icon size={16} className={isActive ? "text-[var(--tomato)]" : "text-[var(--site-subtle)]"} />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
