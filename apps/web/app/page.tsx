import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Headphones, MicOff, Monitor, PanelsTopLeft, Plus, Users } from "lucide-react";
import Footer from "@/components/Footer";
import DiscordDemo from "@/components/site/DiscordDemo";
import { Avatar, BotMessage, ChatWindow, Embed } from "@/components/site/DiscordBits";
import { TimerDial, TimerRuler } from "@/components/site/TimerDial";
import { BOT_INVITE_URL, GITHUB_URL, SUPPORT_SERVER_URL, TIKTOK_URL, TOPGG_URL, USER_INSTALL_URL } from "@/lib/links";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// From /botstats, late September 2026; round down when updating
const stats = [
  { value: "980+", label: "servers use Pomo" },
  { value: "63K+", label: "members can reach it" },
  { value: "4,000+", label: "students have studied" },
  { value: "10", label: "languages, from EN to AZ" },
];

const voiceMembers = [
  { name: "mira", time: "1h 12m" },
  { name: "kai", time: "48m" },
  { name: "sofia", time: "25m" },
  { name: "arda", time: "6m" },
];

const leaderboard = [
  { name: "sofia", hours: "18.4h" },
  { name: "mira", hours: "15.1h" },
  { name: "deniz", hours: "12.9h" },
  { name: "kai", hours: "9.2h" },
];

const commands = [
  { name: "study", args: "minutes title", desc: "Start a solo focus timer" },
  { name: "pomodoro", args: "work break cycles", desc: "Run full work and break cycles" },
  { name: "team", args: "minutes", desc: "Host a group session friends can join" },
  { name: "habit", args: "check", desc: "Tick off today's habits and grow your streak grid" },
  { name: "garden", args: "", desc: "Plant and harvest with the water you earned" },
  { name: "pet", args: "inventory", desc: "Level up the pet that boosts your rewards" },
  { name: "leaderboard", args: "", desc: "See who focused the most" },
];

const elsewhere = [
  {
    icon: PanelsTopLeft,
    color: "var(--product-web)",
    title: "Web dashboard",
    body: "Stats, session history, garden and global rankings, signed in with Discord.",
    href: "/dashboard",
    cta: "Open dashboard",
  },
  {
    icon: Monitor,
    color: "var(--product-desktop)",
    title: "Pomo Focus for Windows",
    body: "A quiet desktop timer with mini mode. Sessions sync to your Discord profile.",
    href: "/desktop",
    cta: "Get the app",
  },
  {
    icon: Users,
    color: "var(--product-activity)",
    title: "Discord Activity",
    body: "One shared timer inside a voice call, so the whole group starts together.",
    href: "/tutorials/team-sessions",
    cta: "How it works",
  },
];

// Structured data so search engines can show Pomo as an app, not just a page
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Pomo",
  alternateName: "PomoBot",
  url: "https://pomofocus.online",
  image: "https://pomofocus.online/logo.png",
  description:
    "Discord Pomodoro and study bot with focus timers, automatic voice study tracking, streaks, leaderboards, study pets and a virtual garden.",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Discord, Web, Windows",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  sameAs: [SUPPORT_SERVER_URL, TOPGG_URL, GITHUB_URL, TIKTOK_URL],
};

function FeatureRow({
  kicker,
  title,
  body,
  children,
  flip = false,
}: {
  kicker: string;
  title: string;
  body: string;
  children: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
      <div className={flip ? "md:order-2" : ""}>
        <p className="kicker">{kicker}</p>
        <h3 className="site-heading mt-4 text-[clamp(28px,3.4vw,40px)]">{title}</h3>
        <p className="mt-4 max-w-[460px] text-[17px] leading-relaxed text-[var(--site-muted)]">{body}</p>
      </div>
      <div className={flip ? "md:order-1" : ""}>{children}</div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="site min-h-screen overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      {/* Hero: the product, running */}
      <section className="pb-14 pt-28 md:pb-20 md:pt-36">
        <div className="site-container grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
          <div>
            <p className="kicker">Pomodoro bot for Discord</p>
            <h1 className="site-heading mt-5 text-[clamp(44px,6.4vw,76px)]">
              Your study server, <span className="text-[var(--tomato)]">on a timer.</span>
            </h1>
            <p className="mt-6 max-w-[520px] text-[18px] leading-relaxed text-[var(--site-muted)]">
              Pomo runs focus timers, tracks your study voice channel and turns every minute into streaks, pets
              and a garden. Everyone studies together, right where they already talk.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href={BOT_INVITE_URL} className="btn btn-tomato">
                <Plus size={18} strokeWidth={2.5} />
                Add to Discord
              </a>
              <a href={USER_INSTALL_URL} className="btn btn-grey">
                Add to my apps
              </a>
            </div>
            <p className="mt-5 text-[14px] text-[var(--site-subtle)]">
              Free. No server of your own? <span className="text-[var(--site-muted)]">Add to my apps</span> works
              anywhere.
            </p>
          </div>
          <DiscordDemo />
        </div>
      </section>

      <TimerRuler className="opacity-80" />

      {/* What it does, shown as the messages Pomo really sends */}
      <section className="py-20 md:py-28">
        <div className="site-container flex flex-col gap-24 md:gap-32">
          <FeatureRow
            kicker="Voice tracking"
            title="Join the study channel. Pomo counts the minutes."
            body="Pick a voice channel once. Everyone who studies there earns focus time automatically, with daily caps so nobody farms AFK."
          >
            <div className="panel mx-auto max-w-[420px] p-3">
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[15px] font-medium text-[var(--site-fg-2)]">
                <Headphones size={18} className="text-[var(--site-subtle)]" />
                Silent Study
                <span className="ml-auto rounded-full bg-[var(--tomato-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tomato)]">
                  Pomo tracking
                </span>
              </div>
              <ul className="mt-1">
                {voiceMembers.map((m) => (
                  <li key={m.name} className="flex items-center gap-2.5 rounded-md py-1.5 pl-8 pr-2">
                    <Avatar name={m.name} size={26} />
                    <span className="text-[14px] text-[var(--site-muted)]">{m.name}</span>
                    <MicOff size={14} className="text-[var(--site-subtle)]" />
                    <span className="ml-auto font-mono text-[12px] text-[var(--leaf)]">{m.time}</span>
                  </li>
                ))}
              </ul>
            </div>
          </FeatureRow>

          <FeatureRow
            flip
            kicker="Rewards"
            title="Streaks, pets and a garden that grow with you."
            body="Every session pays out Water and XP. Keep a streak, raise a study pet that boosts your rewards, and grow crops to feed it."
          >
            <ChatWindow channel="study-hall">
              <BotMessage time="Today at 16:25" usedBy={{ name: "sofia", command: "/profile" }}>
                <Embed color="var(--product-web)">
                  <p className="text-[15px] font-semibold text-[var(--site-fg)]">sofia · Level 23</p>
                  <div className="mt-2 h-1.5 w-full max-w-[260px] rounded-full bg-[#1e1f22]">
                    <div className="h-full w-[68%] rounded-full bg-[var(--leaf)]" />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-y-1.5 text-[var(--site-fg)]">
                    <span>🔥 21 day streak</span>
                    <span>💧 1,284 Water</span>
                    <span>🦉 Wise Owl · Lv 6</span>
                    <span>⏱ 142h focused</span>
                  </div>
                  <p className="mt-3 text-[18px] tracking-[0.2em]">🌱🍅🥕🌱🥔🍎</p>
                </Embed>
              </BotMessage>
            </ChatWindow>
          </FeatureRow>

          <FeatureRow
            kicker="Leaderboards"
            title="A little friendly competition every week."
            body="Server and global leaderboards, weekly reports in your channel, and clans that climb together across servers."
          >
            <ChatWindow channel="weekly-report">
              <BotMessage time="Monday at 09:00">
                <Embed color="var(--product-web)">
                  <p className="text-[15px] font-semibold text-[var(--site-fg)]">🏆 This week in Study Hall</p>
                  <ol className="mt-2 space-y-1">
                    {leaderboard.map((row, i) => (
                      <li key={row.name} className="flex items-center gap-2">
                        <span className="w-5 text-[var(--site-subtle)]">{["🥇", "🥈", "🥉", "4."][i]}</span>
                        <span className="text-[var(--site-fg)]">{row.name}</span>
                        <span className="ml-auto font-mono text-[12px]">{row.hours}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 text-[12px] text-[var(--site-subtle)]">Server total: 214h · up 18% from last week</p>
                </Embed>
              </BotMessage>
            </ChatWindow>
          </FeatureRow>
        </div>
      </section>

      {/* Numbers */}
      <section className="bg-[var(--site-surface)]">
        <div className="site-container grid grid-cols-2 gap-x-6 gap-y-10 py-14 md:grid-cols-4 md:py-16">
          {stats.map((item) => (
            <div key={item.label}>
              <p className="site-heading text-[clamp(36px,4.5vw,52px)] text-[var(--cream)]">{item.value}</p>
              <p className="mt-2 text-[14px] text-[var(--site-muted)]">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Slash commands */}
      <section className="py-20 md:py-28">
        <div className="site-container grid items-center gap-12 md:grid-cols-[0.9fr_1.1fr] md:gap-16">
          <div>
            <p className="kicker">Commands</p>
            <h2 className="site-heading mt-4 text-[clamp(30px,4vw,48px)]">Type a slash. That&apos;s the whole manual.</h2>
            <p className="mt-4 max-w-[440px] text-[17px] leading-relaxed text-[var(--site-muted)]">
              Every feature lives behind a slash command with autocomplete, in ten languages. New members find their
              way on day one.
            </p>
            <Link
              href="/tutorials/commands"
              className="mt-7 inline-flex items-center gap-2 text-[15px] font-semibold text-[var(--site-fg)] hover:text-[var(--tomato)]"
            >
              See every command <ArrowRight size={16} />
            </Link>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/40 bg-[var(--site-surface-2)] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]">
            <p className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--site-subtle)]">
              Commands matching /
            </p>
            <ul className="px-2 pb-2">
              {commands.map((cmd, i) => (
                <li
                  key={cmd.name}
                  className={`flex items-center gap-3 rounded-md px-2 py-2 ${i === 0 ? "bg-[#3f4147]" : ""}`}
                >
                  <span className="h-[22px] w-[22px] shrink-0 rounded-full bg-[var(--tomato)]" aria-hidden="true" />
                  <span className="text-[14px] font-semibold text-[var(--site-fg)]">/{cmd.name}</span>
                  {cmd.args && <span className="hidden font-mono text-[12px] text-[var(--site-subtle)] sm:inline">{cmd.args}</span>}
                  <span className="ml-auto truncate pl-3 text-[13px] text-[var(--site-muted)]">{cmd.desc}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2 border-t border-black/30 bg-[#383a40] px-4 py-3">
              <span className="font-mono text-[14px] text-[var(--site-fg)]">/</span>
              <span className="h-4 w-px animate-pulse bg-[var(--site-fg)]" />
            </div>
          </div>
        </div>
      </section>

      {/* Beyond Discord */}
      <section className="border-t border-[var(--site-line)] py-20 md:py-28">
        <div className="site-container">
          <p className="kicker">Beyond Discord</p>
          <h2 className="site-heading mt-4 max-w-[640px] text-[clamp(30px,4vw,48px)]">Your streak follows you everywhere.</h2>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {elsewhere.map(({ icon: Icon, color, title, body, href, cta }) => (
              <Link
                key={title}
                href={href}
                className="panel group flex flex-col p-6 transition-colors hover:border-[var(--site-line-strong)]"
                style={{ borderTop: `3px solid ${color}` }}
              >
                <Icon size={22} style={{ color }} />
                <h3 className="mt-5 text-[18px] font-semibold text-[var(--site-fg)]">{title}</h3>
                <p className="mt-2 flex-1 text-[15px] leading-relaxed text-[var(--site-muted)]">{body}</p>
                <span className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[var(--site-fg)] group-hover:text-[var(--tomato)]">
                  {cta} <ArrowRight size={15} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="border-t border-[var(--site-line)] py-20 md:py-28">
        <div className="site-container grid items-center gap-12 md:grid-cols-[auto_1fr] md:gap-20">
          <div className="mx-auto">
            <TimerDial minutes={25} size={260} />
          </div>
          <div>
            <h2 className="site-heading text-[clamp(34px,5vw,60px)]">
              Start your first
              <br />
              <span className="text-[var(--tomato)]">25 minutes.</span>
            </h2>
            <p className="mt-5 max-w-[460px] text-[17px] leading-relaxed text-[var(--site-muted)]">
              Add Pomo, type <span className="slash">/study 25</span>, and get to work. Your first session comes with a
              welcome bonus.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href={BOT_INVITE_URL} className="btn btn-tomato">
                <Plus size={18} strokeWidth={2.5} />
                Add to Discord
              </a>
              <Link href="/tutorials/getting-started" className="btn btn-outline">
                Read the guide
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
