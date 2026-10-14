import type { Metadata } from "next";
import Footer from "@/components/Footer";
import { CONTACT_EMAIL, LEGAL_NAME, SUPPORT_SERVER_URL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "Pomo Pro comes with a 14-day money-back guarantee on every payment.",
  alternates: { canonical: "/refunds" },
};

export default function RefundsPage() {
  return (
    <main className="site min-h-screen">
      <div className="site-container max-w-[760px] pb-24 pt-28 md:pt-36">
        <p className="kicker mb-6">Legal · Last updated October 2026</p>
        <h1 className="site-heading mb-12 text-[clamp(36px,5vw,56px)]">Refund Policy</h1>

        <div className="space-y-10 border-t border-[var(--site-line)] pt-10 text-[15px] leading-relaxed text-[var(--site-muted)] [&_h2]:mb-3 [&_h2]:text-[18px] [&_h2]:font-medium [&_h2]:tracking-[-0.01em] [&_h2]:text-[var(--site-fg)] [&_strong]:text-[var(--site-fg-2)]">
          <section>
            <h2>14-day money-back guarantee</h2>
            <p>
              Every Pomo Pro payment, including renewals, comes with a 14-day money-back guarantee. If you ask within 14
              days of a payment, you get a full refund, no questions asked. The refund goes back to the original payment
              method.
            </p>
          </section>

          <section>
            <h2>How to ask for a refund</h2>
            <p>
              Email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">{CONTACT_EMAIL}</a>, message us in
              the{" "}
              <a href={SUPPORT_SERVER_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">support server</a>,
              or contact Paddle directly through the link in your receipt or at{" "}
              <a href="https://paddle.net" target="_blank" rel="noreferrer" className="underline underline-offset-4">paddle.net</a>.
            </p>
          </section>

          <section>
            <h2>Cancelling</h2>
            <p>
              You can cancel your subscription at any time with <code>/premium status</code> in Discord or from the link in
              your receipt. You will not be charged again, and Pro stays active until the end of the period you already paid
              for. If you get a refund, Pro for that period ends.
            </p>
          </section>

          <section>
            <h2>Who handles payments</h2>
            <p>
              Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all
              our orders. Paddle provides all customer service inquiries and handles returns. Pomo is operated by {LEGAL_NAME}.
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </main>
  );
}
