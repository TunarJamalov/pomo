import type { Metadata } from "next";
import { Check } from "lucide-react";
import Footer from "@/components/Footer";
import { SUPPORT_SERVER_URL } from "@/lib/links";
import { PRO_TIERS, type ProTier } from "@/lib/billing";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Pomo Plus ($1.49/month) and Pomo Pro ($1.99/month) unlock extra features in the Pomo Discord bot: 2x water, a bigger garden, more habits, streak shields, advanced stats and 24/7 lofi radio.",
  alternates: { canonical: "/pricing" },
};

// What every account gets without paying, so the line between Free and the paid plans is clear
const FREE_FEATURES = [
  "Focus timers: /study, /pomodoro and group /team sessions",
  "Automatic voice study tracking",
  "Garden with 6 plots, pets and the market",
  "5 habits, streaks and server goals",
  "Stats, weekly recaps and leaderboards",
  "Web dashboard and the desktop app",
];

const FAQ = [
  ["What do I get?", "A subscription for your Discord account. The plan's features unlock in the Pomo bot and on the dashboard for as long as the subscription is active."],
  ["Plus or Pro?", "Plus covers the everyday boosts: more water, a bigger garden and 10 habits. Pro adds streak shields, deeper stats, 15 habits and 24/7 lofi radio."],
  ["How do I cancel?", "Run /premium status in Discord, or use the link in your receipt email. You keep your plan until the end of the period you paid for."],
  ["Refunds", "Every payment has a 14-day money-back guarantee: ask within 14 days for a full refund, no questions asked."],
];

export default function PricingPage() {
  const tiers = (Object.keys(PRO_TIERS) as ProTier[]).map(tier => ({ tier, ...PRO_TIERS[tier] }));

  return (
    <main className="site min-h-screen">
      <section className="pb-16 pt-28 md:pb-20 md:pt-36">
        <div className="site-container">
          <p className="kicker mb-6">Pricing</p>
          <h1 className="site-heading max-w-[760px] text-[clamp(40px,6.5vw,72px)]">Pomo Plus and Pro</h1>
          <p className="mt-6 max-w-[600px] text-[17px] leading-relaxed text-[var(--site-muted)]">
            Two monthly or yearly plans that unlock extra features in the Pomo Discord bot and dashboard. The core
            timers, voice tracking and stats stay free.
          </p>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-24 border-t border-[var(--site-line)] py-16 md:py-24">
        <div className="site-container grid gap-4 md:grid-cols-2">
          {tiers.map(p => (
            <div
              key={p.tier}
              className={`panel flex flex-col justify-between gap-10 p-7 md:p-10 ${p.tier === "pro" ? "ring-1 ring-[var(--tomato)]" : ""}`}
            >
              <div>
                <div className="mb-6 flex items-center justify-between gap-3">
                  <h2 className="text-[20px] font-medium tracking-[-0.02em] text-[var(--site-fg)]">{p.name}</h2>
                  {p.tier === "pro" && (
                    <span className="rounded-full bg-[var(--tomato-soft)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tomato)]">
                      Most features
                    </span>
                  )}
                </div>
                <p className="text-[44px] font-semibold tracking-[-0.03em] text-[var(--site-fg)]">
                  {p.monthly}
                  <span className="ml-1 text-[16px] font-normal text-[var(--site-muted)]">/ month</span>
                </p>
                <p className="mt-2 text-[14px] text-[var(--site-muted)]">
                  or {p.yearly} a year, about {p.yearlyPerMonth} a month
                </p>
                <ul className="mt-8 border-t border-[var(--site-line)]">
                  {p.perks.map(([title, detail]) => (
                    <li key={title} className="flex items-baseline justify-between gap-4 border-b border-[var(--site-line)] py-2.5">
                      <span className="flex items-center gap-2 text-[14px] text-[var(--site-fg)]">
                        <Check size={13} className="shrink-0 text-[var(--status-live)]" />
                        {title}
                      </span>
                      <span className="text-right text-[13px] text-[var(--site-muted)]">{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <span className="btn btn-outline h-11 w-full opacity-60">Coming soon</span>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[var(--site-line)] py-16 md:py-24">
        <div className="site-container grid gap-10 md:grid-cols-2">
          <div>
            <p className="kicker mb-5">Questions</p>
            <dl className="divide-y divide-[var(--site-line)] border-y border-[var(--site-line)]">
              {FAQ.map(([q, a]) => (
                <div key={q} className="py-5">
                  <dt className="text-[15px] font-medium text-[var(--site-fg)]">{q}</dt>
                  <dd className="mt-2 text-[14px] leading-relaxed text-[var(--site-muted)]">{a}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <p className="kicker mb-5">Free forever</p>
            <div className="panel p-6 md:p-8">
              <ul className="grid gap-3">
                {FREE_FEATURES.map(feature => (
                  <li key={feature} className="flex items-start gap-2 text-[14px] leading-relaxed text-[var(--site-fg-2)]">
                    <Check size={13} className="mt-1 shrink-0 text-[var(--status-live)]" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-8 text-[14px] text-[var(--site-muted)]">
              More questions?{" "}
              <a href={SUPPORT_SERVER_URL} target="_blank" rel="noreferrer" className="text-[var(--site-fg)] underline underline-offset-4">
                Ask in the support server
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
