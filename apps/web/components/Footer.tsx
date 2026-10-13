import Image from "next/image";
import Link from "next/link";
import { TimerRuler } from "@/components/site/TimerDial";
import {
  AZEDEV_URL,
  BOT_INVITE_URL,
  GITHUB_URL,
  SUPPORT_SERVER_URL,
  TIKTOK_URL,
  TOPGG_URL,
  USER_INSTALL_URL,
} from "@/lib/links";

const COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string; external?: boolean }> }> = [
  {
    title: "Product",
    links: [
      { label: "Add to a server", href: BOT_INVITE_URL, external: true },
      { label: "Add to my apps", href: USER_INSTALL_URL, external: true },
      { label: "Desktop app", href: "/desktop" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    title: "Guide",
    links: [
      { label: "Getting started", href: "/tutorials/getting-started" },
      { label: "Commands", href: "/tutorials/commands" },
      { label: "Team sessions", href: "/tutorials/team-sessions" },
      { label: "Pets & market", href: "/tutorials/pets-market" },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Support server", href: SUPPORT_SERVER_URL, external: true },
      { label: "Top.gg", href: TOPGG_URL, external: true },
      { label: "GitHub", href: GITHUB_URL, external: true },
      { label: "TikTok", href: TIKTOK_URL, external: true },
      { label: "Pomo Pro", href: "/support" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="site">
      <TimerRuler className="opacity-60" />
      <div className="site-container grid gap-12 pb-10 pt-12 md:grid-cols-[1.3fr_2fr]">
        <div>
          <Link href="/" className="flex items-center gap-2.5">
            <span className="h-9 w-9 overflow-hidden rounded-full">
              <Image src="/logo.png" alt="" width={36} height={36} className="h-full w-full scale-[1.55] object-cover" />
            </span>
            <span className="font-[family-name:var(--font-display-face)] text-[20px] font-bold tracking-[-0.02em] text-[var(--site-fg)]">
              Pomo
            </span>
          </Link>
          <p className="mt-4 max-w-[300px] text-[15px] leading-relaxed text-[var(--site-muted)]">
            The Pomodoro and study bot for Discord. Focus together, one timer at a time.
          </p>
          <a href={BOT_INVITE_URL} className="btn btn-tomato mt-6 h-10 px-4 text-[14px]">
            Add to Discord
          </a>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-[13px] font-bold text-[var(--site-fg)]">{column.title}</p>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noopener noreferrer" : undefined}
                      className="text-[14px] text-[var(--site-muted)] transition-colors hover:text-[var(--site-fg)]"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="site-container flex flex-col gap-2 border-t border-[var(--site-line)] py-6 text-[13px] text-[var(--site-subtle)] sm:flex-row sm:items-center sm:justify-between">
        <p>
          © 2026 Pomo · An{" "}
          <a
            href={AZEDEV_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[var(--site-muted)] transition-colors hover:text-[var(--tomato)]"
          >
            AzeDev
          </a>{" "}
          project ·{" "}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[var(--site-muted)] transition-colors hover:text-[var(--tomato)]"
          >
            Open source
          </a>
        </p>
        <p>Not affiliated with Discord Inc.</p>
      </div>
    </footer>
  );
}
