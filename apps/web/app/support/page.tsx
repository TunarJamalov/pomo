import type { Metadata } from "next";
import { ArrowUpRight, Check, Coffee, Crown, Server, Sparkles, Zap } from "lucide-react";
import Footer from "@/components/Footer";
import { DONATION_URL, SUPPORT_SERVER_URL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Support Pomo",
  description: "Support the Pomo Discord study bot, get help in the support server and see what Pomo Pro includes.",
  alternates: { canonical: "/support" },
};

// Keep in sync with the bot's /premium perks (premiumPerksItems in apps/bot/utils/i18n.js)
const PRO_PERKS = [
  ["2x Water", "On every focus session: solo, team and voice"],
  ["2nd daily reward", "/daily premium: +5 💧 and 5–8 fruits"],
  ["Better quests", "+50% rewards, 2 fruits each, claimed automatically"],
  ["3 Streak Shields a month", "Plus /streak recover once every 30 days"],
  ["Bigger garden", "8 plots instead of 6"],
  ["More habits", "15 habits instead of 5"],
  ["Deeper stats", "/stats advanced, /mygoal and /dataexport"],
  ["Your style", "/proprofile accent and badge, unlimited /persona switches"],
  ["24/7 lofi radio", "/lofi in your voice channel"],
  ["Priority help", "And no upgrade messages"],
];

const COSTS = [
  { icon: Server, title: "Servers", body: "Hosting the Discord bot, the web dashboard and the databases 24/7." },
  { icon: Zap, title: "Reliability", body: "Keeping everything fast and responsive during peak study hours." },
  { icon: Sparkles, title: "New features", body: "Support directly funds new study tools and quality-of-life improvements." },
];

export default function SupportPage() {
  return (
    <main className="site min-h-screen">
      <section className="pb-16 pt-28 md:pb-20 md:pt-36">
        <div className="site-container">
          <p className="kicker mb-6">Support Pomo</p>
          <h1 className="site-heading max-w-[760px] text-[clamp(40px,6.5vw,72px)]">Keep Pomo running.</h1>
          <p className="mt-6 max-w-[600px] text-[17px] leading-relaxed text-[var(--site-muted)]">
            Pomo is built by a solo developer and kept online for study communities around the world. Support it on
            Boosty and unlock Pomo Pro.
          </p>
        </div>
      </section>

      <section className="border-t border-[var(--site-line)] py-16 md:py-24">
        <div className="site-container grid gap-4 md:grid-cols-2">
          <div className="panel flex flex-col justify-between gap-10 p-7 md:p-10">
            <div>
              <div className="mb-6 flex items-center gap-3">
                <Coffee size={18} className="text-[var(--site-fg-2)]" />
                <h2 className="text-[20px] font-medium tracking-[-0.02em] text-[var(--site-fg)]">One-time support</h2>
              </div>
              <p className="text-[15px] leading-relaxed text-[var(--site-muted)]">
                Donations help cover hosting, development time and the services that keep Pomo available 24/7.
              </p>
            </div>
            <a href={DONATION_URL} target="_blank" rel="noreferrer" className="btn btn-outline h-11 w-full">
              Support on Boosty
              <ArrowUpRight size={14} />
            </a>
          </div>

          <div className="panel flex flex-col justify-between gap-10 p-7 md:p-10">
            <div>
              <div className="mb-6 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Crown size={18} className="text-[var(--site-fg-2)]" />
                  <h2 className="text-[20px] font-medium tracking-[-0.02em] text-[var(--site-fg)]">Pomo Pro</h2>
                </div>
                <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--site-muted)]">
                  <span className="status-dot" style={{ background: "var(--status-live)" }} />
                  Available
                </span>
              </div>
              <ul className="border-t border-[var(--site-line)]">
                {PRO_PERKS.map(([title, detail]) => (
                  <li key={title} className="flex items-baseline justify-between gap-4 border-b border-[var(--site-line)] py-2.5">
                    <span className="flex items-center gap-2 text-[14px] text-[var(--site-fg)]">
                      <Check size={13} className="text-[var(--status-live)]" />
                      {title}
                    </span>
                    <span className="text-right text-[13px] text-[var(--site-muted)]">{detail}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-[13px] leading-relaxed text-[var(--site-subtle)]">
                After subscribing on Boosty, run <code className="font-mono">/premium activate</code> in Discord with your
                Boosty email and Pro turns on automatically.
              </p>
            </div>
            <a href={DONATION_URL} target="_blank" rel="noreferrer" className="btn btn-tomato h-11 w-full">
              Get Pomo Pro
              <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--site-line)] py-16 md:py-24">
        <div className="site-container">
          <p className="kicker mb-5">Where the money goes</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {COSTS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="panel p-7">
                <Icon size={18} className="text-[var(--site-fg-2)]" />
                <h3 className="mt-5 text-[16px] font-medium text-[var(--site-fg)]">{title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--site-muted)]">{body}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-[14px] text-[var(--site-muted)]">
            Questions?{" "}
            <a href={SUPPORT_SERVER_URL} target="_blank" rel="noreferrer" className="text-[var(--site-fg)] underline underline-offset-4">
              Ask in the support server
            </a>
            .
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
