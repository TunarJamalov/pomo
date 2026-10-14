"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useSession, signIn } from "next-auth/react";
import { BOT_INVITE_URL, SUPPORT_SERVER_URL } from "@/lib/links";

const NAV_LINKS = [
  { href: "/tutorials", label: "Guide" },
  { href: "/tutorials/commands", label: "Commands" },
  { href: "/desktop", label: "Desktop" },
  { href: SUPPORT_SERVER_URL, label: "Community", external: true },
  { href: "/pricing", label: "Pricing" },
];

export default function Navbar() {
  const { data: session } = useSession();
  const [scrolled, setScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isActivity =
    typeof window !== "undefined" &&
    (window.location.hostname.includes("discordsays.com") || window.location.search.includes("frame_id"));

  if (pathname?.startsWith("/activity") || isActivity) return null;

  // "Guide" covers every tutorial except the commands page, which has its own link
  const isActive = (href: string) => {
    if (!href.startsWith("/") || !pathname) return false;
    if (href === "/tutorials") return pathname.startsWith("/tutorials") && pathname !== "/tutorials/commands";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      <nav
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-200 ${
          scrolled || isOpen ? "border-b border-[var(--site-line)] bg-[var(--site-bg)]" : "border-b border-transparent"
        }`}
      >
        <div
          className={`site-container flex h-16 items-center justify-between gap-6 ${
            pathname?.startsWith("/dashboard") ? "max-w-[1400px] sm:px-4" : ""
          }`}
        >
          <Link href="/" className="flex items-center gap-2.5" aria-label="Pomo home">
            <span className="h-8 w-8 overflow-hidden rounded-full">
              <Image src="/logo.png" alt="" width={32} height={32} className="h-full w-full scale-[1.55] object-cover" />
            </span>
            <span className="font-[family-name:var(--font-display-face)] text-[19px] font-bold tracking-[-0.02em] text-[var(--site-fg)]">
              Pomo
            </span>
          </Link>

          <div className="hidden flex-1 items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target={link.external ? "_blank" : undefined}
                rel={link.external ? "noopener noreferrer" : undefined}
                className={`rounded-md px-3 py-1.5 text-[15px] font-medium transition-colors ${
                  isActive(link.href)
                    ? "text-[var(--site-fg)]"
                    : "text-[var(--site-muted)] hover:bg-white/[0.04] hover:text-[var(--site-fg)]"
                }`}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {session ? (
              <Link href="/dashboard" className="btn h-9 px-3 text-[14px] text-[var(--site-fg-2)] hover:text-[var(--site-fg)]">
                Dashboard
              </Link>
            ) : (
              <button
                onClick={() => signIn("discord")}
                className="btn h-9 px-3 text-[14px] text-[var(--site-fg-2)] hover:text-[var(--site-fg)]"
              >
                Log in
              </button>
            )}
            <a href={BOT_INVITE_URL} className="btn btn-tomato h-9 px-4 text-[14px]">
              Add to Discord
            </a>
          </div>

          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--site-fg-2)] hover:bg-white/[0.05] md:hidden"
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? "Close menu" : "Open menu"}
            aria-expanded={isOpen}
          >
            {isOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {isOpen && (
        <div className="fixed inset-0 z-40 bg-[var(--site-bg)] pt-16 md:hidden">
          <div className="site-container flex flex-col pt-2">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target={link.external ? "_blank" : undefined}
                rel={link.external ? "noopener noreferrer" : undefined}
                onClick={() => setIsOpen(false)}
                className="rounded-lg px-3 py-3.5 text-[18px] font-medium text-[var(--site-fg-2)] hover:bg-white/[0.04]"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-6 flex flex-col gap-3">
              <a href={BOT_INVITE_URL} className="btn btn-tomato h-12 w-full">
                Add to Discord
              </a>
              {session ? (
                <Link href="/dashboard" className="btn btn-grey h-12 w-full">
                  Dashboard
                </Link>
              ) : (
                <button onClick={() => signIn("discord")} className="btn btn-grey h-12 w-full">
                  Log in with Discord
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
