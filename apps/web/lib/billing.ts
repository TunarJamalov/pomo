/**
 * Pomo Pro checkout through Paddle. Server-only: prices, token and environment
 * come from env. The checkout carries the buyer's Discord id as custom data,
 * which the webhook reads. Keep prices in sync with apps/bot/utils/billing.js.
 */
export const PRO_PLANS = {
  monthly: { env: "PADDLE_PRICE_MONTHLY", price: "$2.99", period: "month" },
  yearly: { env: "PADDLE_PRICE_YEARLY", price: "$19.99", period: "year" },
} as const;

export type ProPlan = keyof typeof PRO_PLANS;

export type PaddleSetup = {
  environment: "sandbox" | "production";
  token: string;
  prices: Record<ProPlan, string>;
};

/** The Paddle settings, or null while checkout isn't configured. */
export function paddleSetup(): PaddleSetup | null {
  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim();
  const monthly = process.env[PRO_PLANS.monthly.env]?.trim();
  const yearly = process.env[PRO_PLANS.yearly.env]?.trim();
  if (!token || !monthly || !yearly) return null;
  const environment = process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox";
  return { environment, token, prices: { monthly, yearly } };
}

/**
 * Whether this visitor may open a checkout. In sandbox only the owner's test
 * accounts can, so nobody else gets Pro from a test card.
 */
export function canCheckout(setup: PaddleSetup | null, discordId: string | null): boolean {
  if (!setup || !discordId) return false;
  if (setup.environment === "production") return true;
  const testers = (process.env.PADDLE_TEST_DISCORD_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  return testers.includes(discordId);
}
