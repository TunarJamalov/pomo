import type { Metadata } from "next";
import Footer from "@/components/Footer";
import { CONTACT_EMAIL, LEGAL_NAME, SUPPORT_SERVER_URL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "Pomo Plus and Pomo Pro come with a 14-day money-back guarantee on every payment.",
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
              Every Pomo Plus and Pomo Pro payment, including renewals, comes with a 14-day money-back guarantee. If you
              ask within 14 days of a payment, you get a full refund, no questions asked. The refund goes back to the card
              you paid with; depending on your bank it usually arrives within a few business days.
            </p>
          </section>

          <section>
            <h2>How to ask for a refund</h2>
            <p>
              Email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">{CONTACT_EMAIL}</a>, message us in
              the{" "}
              <a href={SUPPORT_SERVER_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">support server</a>{" "}
              with your Discord username and the date of the payment.
            </p>
          </section>

          <section>
            <h2>Cancelling</h2>
            <p>
              You can cancel your subscription at any time at pomofocus.online/billing or with <code>/premium status</code> in
              Discord. You will not be charged again, and your plan stays active until the end of the period you already paid
              for. If you get a refund, the plan for that period ends.
            </p>
          </section>

          <section>
            <h2>Who handles payments</h2>
            <p>
              The seller is {LEGAL_NAME}. Payments and refunds are processed by Epoint (epoint.az), a payment institution
              licensed by the Central Bank of the Republic of Azerbaijan. Questions about a charge go to us first, through the
              contacts above.
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </main>
  );
}
