import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import Footer from "@/components/Footer";
import ProSignInButton from "@/components/site/ProSignInButton";
import { PRO_TIERS } from "@/lib/billing";
import { currentSubscription } from "@/lib/epoint";
import { SUPPORT_SERVER_URL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Your plan",
  description: "See and manage your Pomo Plus or Pomo Pro subscription.",
  robots: { index: false },
};

export const revalidate = 0;

// Messages after coming back from Epoint or from a form on this page
const NOTICES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  success: { tone: "ok", text: "Payment received, thank you! Your plan turns on within a minute and Pomo sends you a DM in Discord." },
  failed: { tone: "warn", text: "The payment was not completed. You can try again from the pricing page." },
  error: { tone: "warn", text: "We couldn't open the payment page. Please try again in a minute, or ask in the support server." },
  busy: { tone: "warn", text: "Too many attempts in a short time. Please wait a few minutes and try again." },
  active: { tone: "warn", text: "You already have a plan running. Cancel it below first if you want to switch plans." },
  closed: { tone: "warn", text: "Plans aren't on sale yet." },
};

const formatDate = (value: string) =>
  new Date(`${value.replace(" ", "T")}Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  const sub = discordId ? currentSubscription(discordId) : null;

  const checkout = typeof params.checkout === "string" ? NOTICES[params.checkout] : undefined;
  const notice = checkout
    ?? (params.cancelled ? { tone: "ok" as const, text: "Your subscription is cancelled. You keep your plan until the end of the period you paid for." } : undefined)
    ?? (params.resumed ? { tone: "ok" as const, text: "Your subscription is back on and will renew as before." } : undefined);

  return (
    <main className="site min-h-screen">
      <section className="pb-16 pt-28 md:pb-24 md:pt-36">
        <div className="site-container max-w-[760px]">
          <p className="kicker mb-6">Billing</p>
          <h1 className="site-heading text-[clamp(36px,5.5vw,56px)]">Your plan</h1>

          {notice && (
            <p
              className={`mt-8 rounded-lg border px-4 py-3 text-[14px] leading-relaxed ${
                notice.tone === "ok"
                  ? "border-[var(--status-live)] text-[var(--site-fg)]"
                  : "border-[var(--tomato)] text-[var(--site-fg)]"
              }`}
            >
              {notice.text}
            </p>
          )}

          {!discordId ? (
            <div className="panel mt-10 p-7 md:p-10">
              <p className="text-[15px] text-[var(--site-fg-2)]">Sign in with Discord to see your Pomo plan.</p>
              <ProSignInButton label="Sign in with Discord" className="btn btn-tomato mt-6" callbackUrl="/billing" />
            </div>
          ) : !sub ? (
            <div className="panel mt-10 p-7 md:p-10">
              <p className="text-[15px] text-[var(--site-fg-2)]">You don&apos;t have a paid plan right now.</p>
              <Link href="/pricing#pricing" className="btn btn-tomato mt-6">
                See Pomo Plus and Pro
              </Link>
            </div>
          ) : (
            <div className="panel mt-10 p-7 md:p-10">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[22px] font-medium tracking-[-0.02em] text-[var(--site-fg)]">{PRO_TIERS[sub.plan].name}</h2>
                <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--site-muted)]">
                  {sub.cancel_at_period_end ? "Cancelled" : sub.status === "past_due" ? "Payment problem" : "Active"}
                </span>
              </div>
              <dl className="mt-6 divide-y divide-[var(--site-line)] border-y border-[var(--site-line)] text-[14px]">
                <Row label="Price" value={`${sub.amount} AZN / ${sub.cycle === "yearly" ? "year" : "month"}`} />
                <Row
                  label={sub.cancel_at_period_end ? "Plan ends" : "Next payment"}
                  value={formatDate(sub.current_period_end)}
                />
                {sub.card_mask && <Row label="Card" value={`•••• ${sub.card_mask.slice(-4)}`} />}
              </dl>

              {sub.status === "past_due" && !sub.cancel_at_period_end && (
                <p className="mt-6 text-[14px] leading-relaxed text-[var(--site-muted)]">
                  The last renewal didn&apos;t go through. We try again every day for up to 3 days and your perks stay on
                  meanwhile. To use another card, cancel here and subscribe again from the pricing page.
                </p>
              )}

              <form action="/api/billing/epoint/cancel" method="post" className="mt-8">
                {sub.cancel_at_period_end ? (
                  <button type="submit" name="action" value="resume" className="btn btn-tomato">
                    Resume subscription
                  </button>
                ) : (
                  <button type="submit" name="action" value="cancel" className="btn btn-outline">
                    Cancel subscription
                  </button>
                )}
              </form>
              <p className="mt-4 text-[13px] text-[var(--site-muted)]">
                {sub.cancel_at_period_end
                  ? "Nothing more will be charged. Resume any time before the plan ends to keep it."
                  : "Cancelling stops the next payment. You keep your plan until the end of the period you paid for."}
              </p>
            </div>
          )}

          <p className="mt-10 text-[14px] text-[var(--site-muted)]">
            Questions about a payment or a refund?{" "}
            <a href={SUPPORT_SERVER_URL} target="_blank" rel="noreferrer" className="text-[var(--site-fg)] underline underline-offset-4">
              Ask in the support server
            </a>{" "}
            or see the <Link href="/refunds" className="text-[var(--site-fg)] underline underline-offset-4">refund policy</Link>.
          </p>
        </div>
      </section>
      <Footer />
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-[var(--site-muted)]">{label}</dt>
      <dd className="text-right text-[var(--site-fg)]">{value}</dd>
    </div>
  );
}
