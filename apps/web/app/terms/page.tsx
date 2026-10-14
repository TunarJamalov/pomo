import type { Metadata } from "next";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service for the Pomo Discord bot, website and desktop app.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className="site min-h-screen">
      <div className="site-container max-w-[760px] pb-24 pt-28 md:pt-36">
        <p className="kicker mb-6">Legal · Last updated October 2026</p>
        <h1 className="site-heading mb-12 text-[clamp(36px,5vw,56px)]">Terms of Service</h1>

        <div className="space-y-10 border-t border-[var(--site-line)] pt-10 text-[15px] leading-relaxed text-[var(--site-muted)] [&_h2]:mb-3 [&_h2]:text-[18px] [&_h2]:font-medium [&_h2]:tracking-[-0.01em] [&_h2]:text-[var(--site-fg)] [&_strong]:text-[var(--site-fg-2)]">
          <section>
            <h2 className="text-xl font-bold text-white mb-4">1. Acceptance of Terms</h2>
            <p>
              By inviting the Pomo bot to your Discord server or logging into our Web Dashboard, you agree to comply with and be bound by these Terms of Service. If you do not agree, please do not use our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-4">2. Description of Service</h2>
            <p>
              Pomo is a Discord-based productivity tool designed to help users track focus sessions, manage tasks effectively, and engage in gamified studying mechanisms like virtual pets and gardens. The service is provided "as is" and we reserve the right to modify or discontinue any feature at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-4">3. User Responsibilities</h2>
            <p>
              You agree not to exploit or abuse the bot's features, economy, or API limits. Using macros, self-bots, or other means to artificially inflate your focus time or virtual currency is strictly prohibited and will result in a permanent ban.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-4">4. Virtual Items</h2>
            <p>
              All virtual items, experience points (XP), and currencies associated with your account remain the property of Pomo. They have no real-world monetary value and cannot be exchanged for cash. We may reset, modify, or remove virtual items at our discretion.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-4">5. Pomo Pro subscriptions</h2>
            <p>
              Pomo Pro is an optional subscription ($2.99 per month or $19.99 per year). Payments are processed by our payment provider, which acts as the merchant of record and handles sales tax and VAT. Subscriptions renew automatically until cancelled. You can cancel any time with <code>/premium status</code> in Discord or from the link in your receipt; Pro stays active until the end of the period you paid for.
            </p>
            <p className="mt-3">
              <strong>Refunds:</strong> if something went wrong, contact us in the support server within 14 days of a payment and we will refund it. Pro perks are tied to the Discord account the purchase was made for and are not transferable. We may change the perks included in Pro; existing subscribers will be told in advance about price changes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-4">6. Liability</h2>
            <p>
              Pomo is not affiliated with, supported, or endorsed by Discord Inc. We will not be liable for any direct, indirect, incidental, or consequential damages arising from the use of our service or any data loss.
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </main>
  );
}
