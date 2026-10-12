import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Find a Study Buddy on Discord",
  description: "PomoMatch pairs you with a real study partner on Discord based on subject, session length and study style.",
  alternates: { canonical: "/tutorials/study-buddy" },
};

export default function StudyBuddyPage() {
  return (
    <>
      <h1 className="text-4xl font-black text-white mb-6">Study Buddy (PomoMatch)</h1>

      <p className="mb-4 text-lg">
        <strong>Studying alone is hard. Find someone who is studying with you.</strong>
      </p>

      <p className="mb-10 text-[var(--text-secondary)]">
        PomoMatch helps you find a real study partner based on what you&apos;re studying, how long
        you want to study, and how you prefer to study.
      </p>

      <p className="mb-10 text-[var(--text-secondary)]">
        <strong className="text-white">You don&apos;t need to know each other beforehand.</strong>
        <br />
        PomoMatch handles the matching — you decide whether you want to study together.
      </p>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2">
        🔎 1. Find a Study Partner
      </h2>

      <p className="mb-4 text-[var(--text-secondary)]">Run:</p>

      <code className="block bg-black/40 p-3 rounded text-violet-200 border border-violet-500/20 font-bold mb-4 text-sm">
        /findbuddy subject:Math duration:50 mode:silent
      </code>

      <p className="mb-3 text-[var(--text-secondary)]">You choose:</p>

      <ul className="text-[var(--text-secondary)] space-y-1.5 mb-4 list-disc list-inside">
        <li><strong className="text-white">Subject</strong> — what you&apos;re studying (Math, Java, English, etc.)</li>
        <li><strong className="text-white">Duration</strong> — 5–120 minutes</li>
        <li><strong className="text-white">Mode</strong> — Silent or Voice</li>
      </ul>

      <p className="mb-10 text-[var(--text-secondary)]">
        PomoMatch first looks for compatible people in your server. If none are available, it can
        search across other <strong className="text-white">opted-in</strong> study servers.
      </p>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2">
        💘 2. Like, Pass or Block
      </h2>

      <p className="mb-4 text-[var(--text-secondary)]">
        When PomoMatch finds someone compatible, you&apos;ll receive a private candidate card.
      </p>

      <p className="mb-3 text-[var(--text-secondary)]">You&apos;ll see:</p>

      <ul className="text-[var(--text-secondary)] space-y-1.5 mb-4 list-disc list-inside">
        <li>📚 Subject</li>
        <li>⏱️ Duration</li>
        <li>🔇 Study mode</li>
        <li>📊 Compatibility score</li>
      </ul>

      <p className="mb-4 text-[var(--text-secondary)]">
        You <strong className="text-white">won&apos;t see their identity</strong> at this stage.
      </p>

      <p className="mb-3 text-[var(--text-secondary)]">Choose:</p>

      <ul className="text-[var(--text-secondary)] space-y-1.5 mb-4 list-disc list-inside">
        <li>❤️ <strong className="text-white">Like</strong> — you&apos;re interested in studying together</li>
        <li>⏭️ <strong className="text-white">Pass</strong> — skip this person</li>
        <li>🚫 <strong className="text-white">Block</strong> — never match with this person again</li>
      </ul>

      <p className="mb-10 text-[var(--text-secondary)]">
        Your request stays active for <strong className="text-white">30 minutes</strong>.
      </p>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2">
        🎉 3. It&apos;s a Match!
      </h2>

      <p className="mb-4 text-[var(--text-secondary)]">
        If <strong className="text-white">both people Like each other</strong>, you get a Match.
      </p>

      <p className="mb-4 text-[var(--text-secondary)]">
        Both users receive a DM.
      </p>

      <p className="mb-10 text-[var(--text-secondary)]">
        Nothing about your identity is revealed before the mutual Like.
      </p>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2">
        🌐 4. Decide How to Study Together
      </h2>

      <p className="mb-4 text-[var(--text-secondary)]">
        After matching, both of you choose where you&apos;d like to study:
      </p>

      <div className="space-y-3 mb-4">
        <div className="bg-black/30 p-5 rounded-xl border border-[var(--border)]">
          <h3 className="font-bold text-white mb-1">🏠 My Server</h3>
          <p className="text-sm text-[var(--text-secondary)]">Study in your own Discord server.</p>
        </div>

        <div className="bg-black/30 p-5 rounded-xl border border-[var(--border)]">
          <h3 className="font-bold text-white mb-1">🌐 Study Hub</h3>
          <p className="text-sm text-[var(--text-secondary)]">Use an opted-in study community that accepts guests.</p>
        </div>

        <div className="bg-black/30 p-5 rounded-xl border border-[var(--border)]">
          <h3 className="font-bold text-white mb-1">💬 Independently</h3>
          <p className="text-sm text-[var(--text-secondary)]">Stay in DMs and study on your own.</p>
        </div>
      </div>

      <p className="mb-10 text-[var(--text-secondary)]">
        A destination is only confirmed when <strong className="text-white">both users choose the same option</strong>.
      </p>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2">
        🤝 5. Study Hub Is Completely Optional
      </h2>

      <p className="mb-4 text-[var(--text-secondary)]">
        If both users choose <strong className="text-white">Study Hub</strong>, both must explicitly press:
      </p>

      <p className="mb-4 text-[var(--text-secondary)]">
        <strong className="text-white">✅ Join Study Hub</strong>
      </p>

      <p className="mb-4 text-[var(--text-secondary)]">
        Only after both users agree does PomoBot create an invite.
      </p>

      <p className="mb-4 text-[var(--text-secondary)]">
        The invite is sent <strong className="text-white">privately via DM</strong>.
      </p>

      <p className="mb-10 text-[var(--text-secondary)]">
        No automatic server joining.
        <br />
        No public invite links.
      </p>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2">
        🛡️ 6. Stay Safe
      </h2>

      <p className="mb-4 text-[var(--text-secondary)]">
        You are always in control.
      </p>

      <ul className="text-[var(--text-secondary)] space-y-1.5 mb-10 list-disc list-inside">
        <li>🚫 Block someone at any time</li>
        <li>💔 End a match with <code className="bg-black/40 px-1 rounded text-violet-300">/unmatch</code></li>
        <li>🚩 Report problems using the Report button</li>
        <li>🔒 Candidate cards don&apos;t reveal identity</li>
        <li>🔒 No activity history or server list is exposed</li>
        <li>🔒 Study Hub participation requires mutual consent</li>
      </ul>

      <p className="mb-10 text-[var(--text-secondary)]">
        If you don&apos;t want to continue, simply end the match.
      </p>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2">
        ⚙️ For Server Admins
      </h2>

      <p className="mb-4 text-[var(--text-secondary)]">
        Cross-server matching is <strong className="text-white">opt-in and disabled by default</strong>.
      </p>

      <p className="mb-6 text-[var(--text-secondary)]">
        Your members stay within your server unless you explicitly enable global matching.
      </p>

      <h3 className="text-lg font-bold text-white mb-2">Enable global matching</h3>

      <code className="block bg-black/40 p-3 rounded text-violet-200 border border-violet-500/20 font-bold mb-3 text-sm">
        /setup globalmatch enabled:True
      </code>

      <p className="mb-6 text-[var(--text-secondary)]">
        This allows your members to match with compatible users from other opted-in servers.
      </p>

      <h3 className="text-lg font-bold text-white mb-2">Register as a Study Hub</h3>

      <code className="block bg-black/40 p-3 rounded text-violet-200 border border-violet-500/20 font-bold mb-3 text-sm">
        /setup studyhub enabled:True
      </code>

      <p className="mb-4 text-[var(--text-secondary)]">
        Your server can become a Study Hub for cross-server matches.
      </p>

      <p className="mb-3 text-[var(--text-secondary)]">
        You can also control whether your server currently accepts guests:
      </p>

      <code className="block bg-black/40 p-3 rounded text-violet-200 border border-violet-500/20 font-bold mb-3 text-sm">
        /setup studyhub accepts_guests:False
      </code>

      <p className="mb-10 text-[var(--text-secondary)]">
        This lets admins pause guest intake without removing the server from the Study Hub system.
      </p>

      <p className="mb-10 text-[var(--text-secondary)]">
        <strong className="text-white">Nothing happens automatically when these settings are changed.</strong> Existing
        requests aren&apos;t deleted or corrupted.
      </p>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2">
        💡 Done Studying?
      </h2>

      <p className="mb-4 text-[var(--text-secondary)]">
        When your session is finished:
      </p>

      <p className="mb-4 text-[var(--text-secondary)]">
        <code className="bg-black/40 px-1 rounded text-violet-300">/unmatch</code>
      </p>

      <p className="mb-4 text-[var(--text-secondary)]">
        or press <strong className="text-white">💔 End Match</strong>.
      </p>

      <p className="mb-10 text-[var(--text-secondary)]">
        Your history is preserved, but you won&apos;t be matched with that person again.
      </p>

      <div className="p-6 bg-violet-900/10 border border-violet-500/30 rounded-xl">
        <h3 className="font-bold text-violet-300 mb-2">TL;DR</h3>
        <p className="text-sm text-[var(--text-secondary)]">
          <strong className="text-white">/findbuddy → Find someone → ❤️ Like → 💘 Mutual Like → 🎉 Match → Choose where to study → Focus together.</strong>
        </p>
      </div>
    </>
  );
}
