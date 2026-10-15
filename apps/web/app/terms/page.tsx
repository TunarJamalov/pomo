import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import { CONTACT_EMAIL, LEGAL_NAME } from "@/lib/links";

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
            <h2 className="text-xl font-bold text-white mb-4">1. Who we are</h2>
            <p>
              Pomo (the Pomo Discord bot, pomofocus.online and the Pomo Focus desktop app) is operated by {LEGAL_NAME}, based in Azerbaijan. You can reach us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">{CONTACT_EMAIL}</a>{" "}
              or in our support server.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-4">2. Acceptance of Terms</h2>
            <p>
              By inviting the Pomo bot to your Discord server or logging into our Web Dashboard, you agree to comply with and be bound by these Terms of Service. If you do not agree, please do not use our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-4">3. Description of Service</h2>
            <p>
              Pomo is a Discord-based productivity tool designed to help users track focus sessions, manage tasks effectively, and engage in gamified studying mechanisms like virtual pets and gardens. The service is provided "as is" and we reserve the right to modify or discontinue any feature at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-4">4. User Responsibilities</h2>
            <p>
              You agree not to exploit or abuse the bot's features, economy, or API limits. Using macros, self-bots, or other means to artificially inflate your focus time or virtual currency is strictly prohibited and will result in a permanent ban.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-4">5. Virtual Items</h2>
            <p>
              All virtual items, experience points (XP), and currencies associated with your account remain the property of Pomo. They have no real-world monetary value and cannot be exchanged for cash. We may reset, modify, or remove virtual items at our discretion.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-4">6. Pomo Plus and Pomo Pro subscriptions</h2>
            <p>
              Pomo Plus (2.49 AZN per month or 19.99 AZN per year) and Pomo Pro (3.49 AZN per month or 26.99 AZN per year) are optional software subscriptions that unlock extra features in Pomo for the Discord account they were bought for. Prices are in Azerbaijani manat (AZN); if your card is in another currency, your bank converts the amount and may add its own fee. Subscriptions renew automatically on the same card until cancelled. You can cancel any time at{" "}
              <Link href="/billing" className="underline underline-offset-4">pomofocus.online/billing</Link> or with <code>/premium status</code> in Discord; your plan stays active until the end of the period you paid for. Plans are not transferable. We may change the perks included in a plan; existing subscribers will be told in advance about price changes.
            </p>
            <p className="mt-3">
              The seller is {LEGAL_NAME}. Payments are processed by Epoint (epoint.az), a payment institution licensed by the Central Bank of the Republic of Azerbaijan. You enter your card details on Epoint&apos;s payment page; we never see or store your full card number. Epoint keeps the card as a token so that renewals can be charged.
            </p>
            <p className="mt-3">
              <strong>Refunds:</strong> every payment comes with a 14-day money-back guarantee. See our{" "}
              <Link href="/refunds" className="underline underline-offset-4">Refund Policy</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-4">7. Liability</h2>
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
