import type { Metadata } from "next";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What data the Pomo Discord bot and pomofocus.online store and how it is used.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="site min-h-screen">
      <div className="site-container max-w-[760px] pb-24 pt-28 md:pt-36">
        <p className="kicker mb-6">Legal · Last updated October 2026</p>
        <h1 className="site-heading mb-12 text-[clamp(36px,5vw,56px)]">Privacy Policy</h1>

        <div className="space-y-10 border-t border-[var(--site-line)] pt-10 text-[15px] leading-relaxed text-[var(--site-muted)] [&_h2]:mb-3 [&_h2]:text-[18px] [&_h2]:font-medium [&_h2]:tracking-[-0.01em] [&_h2]:text-[var(--site-fg)] [&_strong]:text-[var(--site-fg-2)]">
          <section>
            <h2 className="text-xl font-bold text-white mb-4">1. Introduction</h2>
            <p>
              Welcome to Pomo. This Privacy Policy explains how we collect, use, and protect your information when you use our Discord Bot and Web Dashboard. We are committed to ensuring your privacy is protected.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-4">2. Data We Collect</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Discord Data:</strong> We collect your Discord User ID, Username, and Avatar via Discord OAuth2 to authenticate you on our web dashboard.</li>
              <li><strong>Productivity Data:</strong> We store the focus sessions you start using the bot, including duration, start and end times, to provide you with insights and statistics.</li>
              <li><strong>Virtual Items:</strong> Data related to your virtual garden, pets, and inventory are stored to track your gameplay progression.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-4">3. How We Use Your Data</h2>
            <p>
              The data we collect is solely used to provide and improve the Pomo service. For example:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>To populate your web dashboard with your personal statistics.</li>
              <li>To rank your public profile on global leaderboards.</li>
              <li>To allow friends to see your study status (if you approve their friend request).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-4">4. Data Sharing</h2>
            <p>
              We do not sell, trade, or transfer your personally identifiable information to outside parties. Your data is kept secure on our private servers and is only accessible through our secure API.
            </p>
            <p className="mt-3">
              If you buy Pomo Pro, the payment is handled by our payment provider (the merchant of record), which processes your payment details and email under its own privacy policy. We only receive your Discord ID, subscription status, renewal date and the email on the receipt, and use them to turn Pro on and off.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-4">5. Your Rights</h2>
            <p>
              You have the right to request the deletion of all your data. If you wish to wipe your Pomo account, you can use the delete command in the Discord bot or contact us on our Support Server.
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </main>
  );
}
