import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import Footer from "@/components/Footer";
import ProSignInButton from "@/components/site/ProSignInButton";
import { SUPPORT_SERVER_URL } from "@/lib/links";
import { PRO_TIERS, type ProTier } from "@/lib/billing";
import { canBuy, currentSubscription, epointConfigured } from "@/lib/epoint";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Pomo Plus (2.49 AZN/month) and Pomo Pro (3.49 AZN/month) unlock extra features in the Pomo Discord bot: 2x water, a bigger garden, more habits, streak shields, advanced stats and 24/7 lofi radio.",
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
  ["Plus or Pro?", "Plus is for growing faster: more water, a second daily reward, a bigger garden and 10 habits. Pro adds streak recovery, insights into when you study best, lofi radio for your voice channel and 15 habits."],
  ["Does paying change the leaderboard?", "No. Leaderboards rank focus minutes, and paid plans never add minutes. Plus and Pro make your garden grow faster; they don't move you up."],
  ["How do I cancel?", "Open pomofocus.online/billing (or run /premium status in Discord) and press Cancel. Nothing more is charged and you keep your plan until the end of the period you paid for."],
  ["Which currency?", "Plans are charged in Azerbaijani manat (AZN) through Epoint, a payment provider licensed by the Central Bank of Azerbaijan. The manat is fixed to the US dollar at 1.70, so 2.49 AZN is about $1.46 and 3.49 AZN about $2.05. If your card is in another currency, your bank converts the amount and may add a foreign card fee."],
  ["Does it renew?", "Yes, every month or year on the same card, until you cancel. You can see the next payment date on your billing page."],
  ["Refunds", "Every payment has a 14-day money-back guarantee: ask within 14 days for a full refund, no questions asked."],
];

// Only while sales are open: the trial is offered in Discord only then (apps/bot/utils/proTrial.js)
const TRIAL_FAQ = ["Can I try it first?", "Yes. Run /premium in Discord and press \"Try Pro free\": every Pro perk for 7 days, no card, nothing to cancel. Once per Discord account."];

const PROMISES = [
  "Full refund within 14 days, no questions asked",
  "Leaderboards rank focus minutes: paid plans never add minutes",
  "Cancel any time from your billing page",
];

export const revalidate = 0;

export default async function PricingPage() {
  const tiers = (Object.keys(PRO_TIERS) as ProTier[]).map(tier => ({ tier, ...PRO_TIERS[tier] }));
  const session = await getServerSession(authOptions);
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  const salesOpen = epointConfigured() && process.env.PRO_SALES_OPEN === "true";
  const buyer = discordId ? canBuy(discordId) : false;
  const current = discordId ? currentSubscription(discordId) : null;
  const faq = salesOpen ? [FAQ[0], TRIAL_FAQ, ...FAQ.slice(1)] : FAQ;

  return (
    <main className="site min-h-screen">
      <section className="pb-16 pt-28 md:pb-20 md:pt-36">
        <div className="site-container">
          <p className="kicker mb-6">Pricing</p>
          <h1 className="site-heading max-w-[760px] text-[clamp(40px,6.5vw,72px)]">
            Pomo stays free. Plus and Pro make it go further.
          </h1>
          <p className="mt-6 max-w-[600px] text-[17px] leading-relaxed text-[var(--site-muted)]">
            Two optional plans for your Discord account, monthly or yearly. The timers, voice tracking, garden and
            stats stay free for everyone.
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
                  <h2 className="flex items-center gap-3 text-[20px] font-medium tracking-[-0.02em] text-[var(--site-fg)]">
                    <Image src={`/badges/${p.tier}.png`} alt="" width={36} height={36} />
                    {p.name}
                  </h2>
                  {p.tier === "pro" && (
                    <span className="rounded-full bg-[var(--tomato-soft)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tomato)]">
                      Most features
                    </span>
                  )}
                </div>
                <p className="mb-6 text-[15px] leading-relaxed text-[var(--site-fg-2)]">{p.pitch}</p>
                <p className="text-[44px] font-semibold tracking-[-0.03em] text-[var(--site-fg)]">
                  {p.monthly}
                  <span className="ml-1 text-[16px] font-normal text-[var(--site-muted)]">/ month</span>
                </p>
                <p className="mt-2 text-[14px] text-[var(--site-muted)]">
                  about {p.usdMonthly} · or {p.yearly} a year ({p.yearlyPerMonth} a month)
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
              <BuyArea tier={p.tier} name={p.name} monthly={p.monthly} yearly={p.yearly}
                signedIn={Boolean(discordId)} salesOpen={salesOpen} canBuy={buyer} currentPlan={current?.plan ?? null} />
            </div>
          ))}
        </div>
        <div className="site-container mt-8">
          {salesOpen && !current && (
            <p className="mb-5 text-[15px] text-[var(--site-fg-2)]">
              Not sure yet? Try Pro free for 7 days: run <code className="font-mono text-[14px]">/premium</code> in
              Discord. No card needed.
            </p>
          )}
          <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-8">
            {PROMISES.map(promise => (
              <li key={promise} className="flex items-center gap-2 text-[14px] text-[var(--site-muted)]">
                <Check size={13} className="shrink-0 text-[var(--status-live)]" />
                {promise}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-[var(--site-line)] py-16 md:py-24">
        <div className="site-container grid gap-10 md:grid-cols-2">
          <div>
            <p className="kicker mb-5">Questions</p>
            <dl className="divide-y divide-[var(--site-line)] border-y border-[var(--site-line)]">
              {faq.map(([q, a]) => (
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

/** The bottom of a plan card: monthly / yearly buttons, sign-in, or "coming soon". */
function BuyArea({ tier, name, monthly, yearly, signedIn, salesOpen, canBuy, currentPlan }: {
  tier: ProTier; name: string; monthly: string; yearly: string;
  signedIn: boolean; salesOpen: boolean; canBuy: boolean; currentPlan: ProTier | null;
}) {
  if (currentPlan) {
    return (
      <Link href="/billing" className="btn btn-outline w-full">
        {currentPlan === tier ? "Your plan · manage" : "Manage your plan"}
      </Link>
    );
  }
  if (canBuy) {
    return (
      <form action="/api/billing/epoint/checkout" method="post" className="grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="plan" value={tier} />
        <button type="submit" name="cycle" value="monthly" className="btn btn-tomato w-full">
          {monthly} / month
        </button>
        <button type="submit" name="cycle" value="yearly" className="btn btn-outline w-full">
          {yearly} / year
        </button>
      </form>
    );
  }
  if (salesOpen && !signedIn) {
    return <ProSignInButton label={`Sign in to get ${name}`} className="btn btn-tomato w-full" callbackUrl={`/pricing?plan=${tier}#pricing`} />;
  }
  return <span className="btn btn-outline w-full opacity-60">Coming soon</span>;
}
