import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  BellRing,
  Clock3,
  Download,
  ExternalLink,
  History,
  KeyRound,
  Monitor,
  ShieldCheck,
} from "lucide-react";
import Footer from "@/components/Footer";
import { DESKTOP_DOWNLOAD_URL, LINUX_APPIMAGE_URL, LINUX_DEB_URL, MICROSOFT_STORE_URL } from "@/lib/links";

export const metadata: Metadata = {
  title: { absolute: "Pomo Focus Desktop | Pomodoro Timer for Windows and Linux" },
  description:
    "Download Pomo Focus Desktop for Windows and Linux. Start Pomodoro sessions, use tray controls and mini mode, and sync completed focus sessions with PomoBot.",
  alternates: { canonical: "/desktop" },
  openGraph: {
    title: "Pomo Focus Desktop",
    description:
      "A clean Pomodoro timer for Windows and Linux with tray controls, mini mode, reminders, and optional PomoBot sync.",
    url: "https://pomofocus.online/desktop",
    images: [{ url: "/screenshots/dashboard.png", width: 1200, height: 630, alt: "Pomo Focus Desktop" }],
  },
};

const features = [
  {
    icon: Clock3,
    title: "Clean focus timer",
    body: "Start Pomodoro, short break, and long break sessions from a quiet desktop interface.",
  },
  {
    icon: Monitor,
    title: "Mini mode",
    body: "Keep a compact always-on-top timer visible while you study, work, or watch lessons.",
  },
  {
    icon: BellRing,
    title: "Desktop reminders",
    body: "Get notified when your focus or break session finishes, even when the app is in the tray.",
  },
  {
    icon: History,
    title: "Session history",
    body: "Review recent sessions and retry sync if your internet connection drops.",
  },
  {
    icon: KeyRound,
    title: "PomoBot sync",
    body: "Press Connect with Discord in the app to sync completed focus sessions to your Discord profile.",
  },
  {
    icon: ShieldCheck,
    title: "Safe connection",
    body: "Pomo Focus never asks for your Discord password or bot token.",
  },
];

const steps = [
  "Download and install Pomo Focus for Windows or Linux.",
  "Open the app and start focusing immediately.",
  "Optional: press Connect with Discord in the app and sign in to sync your sessions.",
];

export default function DesktopDownloadPage() {
  return (
    <main className="site min-h-screen overflow-hidden">
      <section className="pb-16 pt-28 md:pb-24 md:pt-36">
        <div className="site-container grid items-center gap-12 md:grid-cols-[1fr_1fr] md:gap-16">
          <div>
            <p className="kicker mb-6">Pomo Focus for Windows and Linux</p>
            <h1 className="site-heading text-[clamp(40px,6.5vw,72px)]">Focus without typing a command.</h1>
            <p className="mt-6 max-w-[560px] text-[17px] leading-relaxed text-[var(--site-muted)]">
              A clean Pomodoro timer for Windows and Linux. Use it on its own, or connect it to PomoBot to sync finished
              sessions, rewards, streaks and history.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href={DESKTOP_DOWNLOAD_URL} className="btn btn-tomato h-11 px-6">
                <Download size={16} />
                Download for Windows
              </a>
              <a href={MICROSOFT_STORE_URL} target="_blank" rel="noreferrer" className="btn btn-outline h-11 px-6">
                Microsoft Store
                <ExternalLink size={14} />
              </a>
            </div>
            <p className="mt-5 text-[13px] text-[var(--site-subtle)]">
              On Linux:{" "}
              <a href={LINUX_APPIMAGE_URL} className="underline underline-offset-4 hover:text-[var(--site-fg)]">
                AppImage
              </a>{" "}
              (any distro) or{" "}
              <a href={LINUX_DEB_URL} className="underline underline-offset-4 hover:text-[var(--site-fg)]">
                .deb
              </a>{" "}
              (Ubuntu, Debian, Mint). Make the AppImage executable, then open it.
            </p>
          </div>

          <div className="panel overflow-hidden">
            <div className="flex items-center gap-2 border-b border-[var(--site-line)] px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="ml-3 text-[12px] font-semibold text-[var(--site-subtle)]">Pomo Focus</span>
            </div>
            <div className="p-8 text-center md:p-12">
              <p className="text-[13px] font-semibold text-[var(--tomato)]">Focus · 1 of 4</p>
              <div className="mt-6 font-mono text-[clamp(56px,9vw,96px)] font-medium leading-none tracking-[-0.04em] text-[var(--site-fg)]">
                25:00
              </div>
              <div className="mx-auto mt-8 grid max-w-[320px] grid-cols-3 rounded-full border border-[var(--site-line)] p-1 text-[12px]">
                <span className="rounded-full bg-white/[0.07] py-1.5 text-[var(--site-fg)]">Focus</span>
                <span className="py-1.5 text-[var(--site-muted)]">Break</span>
                <span className="py-1.5 text-[var(--site-muted)]">Long</span>
              </div>
              <span className="btn btn-tomato mt-8 h-10 w-full max-w-[320px]">Start focus session</span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--site-line)] py-20 md:py-28">
        <div className="site-container">
          <p className="kicker mb-5">Features</p>
          <h2 className="site-heading max-w-[640px] text-[clamp(30px,4.2vw,48px)]">Small app, useful focus flow.</h2>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="panel p-7">
                  <Icon size={18} className="text-[var(--site-fg-2)]" />
                  <h3 className="mt-5 text-[16px] font-medium tracking-[-0.01em] text-[var(--site-fg)]">{feature.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-[var(--site-muted)]">{feature.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--site-line)] py-20 md:py-28">
        <div className="site-container grid gap-10 md:grid-cols-[1fr_1.2fr] md:gap-16">
          <div>
            <p className="kicker mb-5">How to start</p>
            <h2 className="site-heading text-[clamp(30px,4.2vw,48px)]">Install, focus, sync.</h2>
            <p className="mt-5 text-[16px] leading-relaxed text-[var(--site-muted)]">
              Pomo Focus works on its own. Connecting your Discord account is optional and only needed if you want
              desktop sessions to count toward your PomoBot progress.
            </p>
          </div>

          <div>
            <ol className="border-t border-[var(--site-line)]">
              {steps.map((step, index) => (
                <li key={step} className="flex gap-6 border-b border-[var(--site-line)] py-5">
                  <span className="font-mono text-[13px] text-[var(--site-subtle)]">0{index + 1}</span>
                  <p className="text-[15px] leading-relaxed text-[var(--site-fg-2)]">{step}</p>
                </li>
              ))}
            </ol>
            <Link href="/dashboard/desktop" className="btn btn-outline mt-6 h-11 px-6">
              Connect from dashboard
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
