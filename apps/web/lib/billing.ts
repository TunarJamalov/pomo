/**
 * Pomo's two paid plans. Keep prices and perks in sync with the bot
 * (PLANS in apps/bot/utils/billing.js, planPlusItems/planProItems in apps/bot/utils/i18n.js).
 */
export const PRO_TIERS = {
  plus: {
    name: "Pomo Plus",
    monthly: "$1.49",
    yearly: "$11.99",
    yearlyPerMonth: "$1.00",
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
    monthly: "$1.99",
    yearly: "$15.99",
    yearlyPerMonth: "$1.33",
    perks: [
      ["Everything in Plus", "All of the Plus perks"],
      ["Pomo assistant", "Reminders at your best hour, before exams and when you've been away"],
      ["15 habits", "The most habits you can track"],
      ["3 Streak Shields a month", "Plus /streak recover once every 30 days"],
      ["Personal insights", "/stats advanced shows your best hour, weekly pattern and trend, plus /mygoal and /dataexport"],
      ["Unlimited personas", "Switch /persona whenever you like"],
      ["24/7 lofi radio", "/lofi in your voice channel"],
      ["Priority help", "In the support server"],
    ],
  },
} as const;

export type ProTier = keyof typeof PRO_TIERS;
