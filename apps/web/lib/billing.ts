/**
 * Pomo Pro checkout links (Lemon Squeezy). Server-only: the links come from env
 * and get the buyer's Discord id as custom data, which the webhook reads.
 * Keep prices in sync with apps/bot/utils/billing.js.
 */
export const PRO_PLANS = {
  monthly: { env: "LEMONSQUEEZY_CHECKOUT_MONTHLY", price: "$2.99", period: "month" },
  yearly: { env: "LEMONSQUEEZY_CHECKOUT_YEARLY", price: "$19.99", period: "year" },
} as const;

export type ProPlan = keyof typeof PRO_PLANS;

export function checkoutUrl(plan: ProPlan, discordId?: string | null): string | null {
  const base = process.env[PRO_PLANS[plan].env];
  if (!base) return null;
  try {
    const url = new URL(base);
    if (discordId) url.searchParams.set("checkout[custom][discord_id]", discordId);
    return url.toString();
  } catch {
    return null;
  }
}
