import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { ArrowUpRight, Check, Crown } from "lucide-react";
import Footer from "@/components/Footer";
import ProSignInButton from "@/components/site/ProSignInButton";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { SUPPORT_SERVER_URL } from "@/lib/links";
import { checkoutUrl, PRO_PLANS, type ProPlan } from "@/lib/billing";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Pomo Pro is a $2.99/month or $19.99/year subscription that unlocks extra features in the Pomo Discord bot: 2x water, streak shields, a bigger garden, 15 habits, advanced stats and more.",
  alternates: { canonical: "/pricing" },
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

const PLAN_COPY: Record<ProPlan, { title: string; note: string; badge?: string }> = {
  monthly: { title: "Monthly", note: "Billed every month. Cancel any time." },
  yearly: { title: "Yearly", note: "One payment a year, about $1.67 a month.", badge: "Save 44%" },
};

// What every account gets without paying, so the line between Free and Pro is clear
const FREE_FEATURES = [
  "Focus timers: /study, /pomodoro and group /team sessions",
  "Automatic voice study tracking",
  "Garden with 6 plots, pets and the market",
  "5 habits, streaks and server goals",
  "Stats, weekly recaps and leaderboards",
  "Web dashboard and the desktop app",
];

const FAQ = [
  ["What do I get?", "A subscription for your Discord account. The Pro features above unlock in the Pomo bot and on the dashboard for as long as the subscription is active."],
  ["How does Pro turn on?", "Pay with the button on this page or with /premium in Discord. Pro is linked to your Discord account and turns on automatically about a minute later."],
  ["How do I cancel?", "Run /premium status in Discord and press Manage subscription, or use the link in your receipt email. You keep Pro until the end of the period you paid for."],
  ["Refunds", "Every payment has a 14-day money-back guarantee: ask within 14 days for a full refund, no questions asked."],
  ["Who handles the payment?", "Paddle.com, our merchant of record. It processes the payment and handles sales tax, VAT and receipts."],
];

export default async function PricingPage() {
  const session = await getServerSession(authOptions);
  const discordId = (session?.user as { id?: string } | undefined)?.id ?? null;
  // A checkout without a Discord id can't be linked to anyone, so links are only built after sign-in
  const plans = (Object.keys(PRO_PLANS) as ProPlan[]).map(plan => ({
    plan,
    ...PRO_PLANS[plan],
    ...PLAN_COPY[plan],
    configured: Boolean(checkoutUrl(plan)),
    url: discordId ? checkoutUrl(plan, discordId) : null,
  }));

  return (
    <main className="site min-h-screen">
      <section className="pb-16 pt-28 md:pb-20 md:pt-36">
        <div className="site-container">
          <p className="kicker mb-6">Pricing</p>
          <h1 className="site-heading max-w-[760px] text-[clamp(40px,6.5vw,72px)]">Pomo Pro</h1>
          <p className="mt-6 max-w-[600px] text-[17px] leading-relaxed text-[var(--site-muted)]">
            A monthly or yearly subscription that unlocks extra features in the Pomo Discord bot and dashboard. The
            core timers, voice tracking and stats stay free.
          </p>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-24 border-t border-[var(--site-line)] py-16 md:py-24">
        <div className="site-container grid gap-4 lg:grid-cols-[1fr_1fr_1.15fr]">
          {plans.map(p => (
            <div key={p.plan} className="panel flex flex-col justify-between gap-10 p-7 md:p-10">
              <div>
                <div className="mb-6 flex items-center justify-between gap-3">
                  <h2 className="text-[20px] font-medium tracking-[-0.02em] text-[var(--site-fg)]">{p.title}</h2>
                  {p.badge && (
                    <span className="rounded-full bg-[var(--tomato-soft)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tomato)]">
                      {p.badge}
                    </span>
                  )}
                </div>
                <p className="text-[44px] font-semibold tracking-[-0.03em] text-[var(--site-fg)]">
                  {p.price}
                  <span className="ml-1 text-[16px] font-normal text-[var(--site-muted)]">/ {p.period}</span>
                </p>
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--site-muted)]">{p.note}</p>
              </div>
              {p.url ? (
                <a href={p.url} className={`btn h-11 w-full ${p.plan === "yearly" ? "btn-tomato" : "btn-outline"}`}>
                  Get {p.title}
                  <ArrowUpRight size={14} />
                </a>
              ) : p.configured && !discordId ? (
                <ProSignInButton label="Sign in with Discord to subscribe" className={`btn h-11 w-full ${p.plan === "yearly" ? "btn-tomato" : "btn-outline"}`} />
              ) : (
                <span className="btn btn-outline h-11 w-full opacity-60">Coming soon</span>
              )}
            </div>
          ))}

          <div className="panel p-7 md:p-10">
            <div className="mb-6 flex items-center gap-3">
              <Crown size={18} className="text-[var(--site-fg-2)]" />
              <h2 className="text-[20px] font-medium tracking-[-0.02em] text-[var(--site-fg)]">Everything in Pro</h2>
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
              Prefer Discord? Run <code className="font-mono">/premium perks</code> and pay from there.
            </p>
          </div>
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
