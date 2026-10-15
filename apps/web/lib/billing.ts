/**
 * Pomo's two paid plans, charged in AZN through Epoint (saved-card renewals only take AZN).
 * Keep prices and perks in sync with the bot (EPOINT_PRICES in apps/bot/utils/epoint.js,
 * planPlusItems/planProItems in apps/bot/utils/i18n.js).
 */
export const PRO_TIERS = {
  plus: {
    name: "Pomo Plus",
    amount: { monthly: "2.49", yearly: "19.99" },
    monthly: "2.49 AZN",
    yearly: "19.99 AZN",
    yearlyPerMonth: "1.67 AZN",
    usdMonthly: "$1.46",
    perks: [
      ["2x Water", "On every focus session: solo, team and voice"],
      ["2nd daily reward", "/daily premium: +5 💧 and 5–8 fruits"],
      ["Better quests", "+50% rewards, 2 fruits each"],
      ["Bigger garden", "8 plots instead of 6"],
      ["More habits", "10 habits instead of 5"],
      ["Your style", "/proprofile accent and badge, no upgrade messages"],
    ],
  },
  pro: {
    name: "Pomo Pro",
    amount: { monthly: "3.49", yearly: "26.99" },
    monthly: "3.49 AZN",
    yearly: "26.99 AZN",
    yearlyPerMonth: "2.25 AZN",
    usdMonthly: "$2.05",
    perks: [
      ["Everything in Plus", "All of the Plus perks"],
      ["Pomo assistant", "Reminders at your best hour, before exams and when you've been away"],
      ["15 habits", "The most habits you can track"],
      ["3 Streak Shields a month", "Plus /streak recover once every 30 days"],
      ["Personal insights", "/stats advanced shows your best hour, weekly pattern and trend, plus /mygoal and /dataexport"],
      ["Session card themes", "7 looks for your session complete card"],
      ["Unlimited personas", "Switch /persona whenever you like"],
      ["24/7 lofi radio", "/lofi in your voice channel"],
      ["Priority help", "In the support server"],
    ],
  },
} as const;

export type ProTier = keyof typeof PRO_TIERS;
export type BillingCycle = "monthly" | "yearly";

export const isProTier = (value: unknown): value is ProTier => value === "plus" || value === "pro";
export const isBillingCycle = (value: unknown): value is BillingCycle => value === "monthly" || value === "yearly";
