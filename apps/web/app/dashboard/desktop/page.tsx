import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createActivityToken } from "@/lib/activityAuth";
import { Monitor, KeyRound, ShieldCheck, Timer, ExternalLink, PlugZap, Download } from "lucide-react";
import { CopyTokenButton, DesktopSignIn, OpenDesktopButton } from "./DesktopConnect";
import { disconnectDesktopAppsAction } from "./actions";

export const revalidate = 0;

const STORE_URL = "https://apps.microsoft.com/detail/9PDMHQ05QR55";

export default async function DesktopPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getServerSession(authOptions);
  const params = await searchParams;
  // The app links here with ?from=app; after sign-in the page opens the app on its own
  const fromApp = params.from === "app";
  const justDisconnected = params.disconnected === "1";

  if (!session || !session.user) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl mx-auto">
        <DesktopHeader />
        <div className="glass-panel p-8">
          <div className="flex items-center gap-3 mb-4">
            <PlugZap className="text-emerald-300" />
            <h2 className="text-xl font-bold">Sign in to connect Pomo Focus</h2>
          </div>
          <p className="text-[var(--text-secondary)] mb-6">
            Sign in with the Discord account you use with Pomo. Right after that, this page opens the app and links it to your profile.
          </p>
          <DesktopSignIn callbackUrl={fromApp ? "/dashboard/desktop?from=app" : "/dashboard/desktop"} />
        </div>
      </div>
    );
  }

  const discordId = (session.user as any).id as string;
  const token = createActivityToken({
    id: discordId,
    username: session.user.name || `User#${discordId.slice(-4)}`,
    avatar: session.user.image || null,
  }, { scope: "desktop" });
  const apiUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://pomofocus.online"}/api/desktop/session`;
  const connectUrl = `pomo://connect?token=${encodeURIComponent(token)}&apiUrl=${encodeURIComponent(apiUrl)}`;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl mx-auto">
      <DesktopHeader />

      {justDisconnected && (
        <div className="glass-panel p-4 mb-6 border border-emerald-500/30 text-sm text-emerald-200">
          Every desktop app connected to your account is now disconnected. Connect again below whenever you like.
        </div>
      )}

      <div className="glass-panel p-8 mb-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <PlugZap className="text-emerald-300" />
              <h2 className="text-xl font-bold">Connect Desktop App</h2>
            </div>
            <p className="text-[var(--text-secondary)]">
              Press the button. If your browser asks to open Pomo Focus, choose <strong>Open</strong>. The app shows your profile once it is linked.
            </p>
          </div>
          <OpenDesktopButton connectUrl={connectUrl} autoOpen={fromApp} />
        </div>

        <details className="border-t border-[var(--border)] pt-5">
          <summary className="flex items-center gap-3 cursor-pointer font-bold">
            <KeyRound size={18} className="text-[var(--blurple)]" />
            Nothing happened? Connect manually
          </summary>
          <p className="text-[var(--text-secondary)] mt-4 mb-4">
            Update Pomo Focus to the latest version, or copy this code and paste it in the app under <strong>Advanced: connect manually</strong>. It stays valid for 180 days.
          </p>
          <textarea
            readOnly
            value={token}
            className="w-full min-h-28 rounded-xl bg-black/40 border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)] outline-none mb-3"
          />
          <CopyTokenButton token={token} />
        </details>
      </div>

      <div className="glass-panel p-6 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-bold mb-1">Disconnect desktop apps</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Lost a computer, or connected one you no longer use? This signs out every Pomo Focus app on your account.
          </p>
        </div>
        <form action={disconnectDesktopAppsAction}>
          <button
            type="submit"
            className="whitespace-nowrap rounded-xl border border-red-500/40 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500/10 transition-colors"
          >
            Disconnect all
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard
          icon={<Timer size={20} />}
          title="Sync Sessions"
          body="Completed desktop focus sessions reward Water, XP, streak, and history."
        />
        <InfoCard
          icon={<ShieldCheck size={20} />}
          title="Safe Auth"
          body="The desktop app never needs your Discord password or the bot token."
        />
        <a
          href="/dashboard/history"
          className="glass-panel p-5 hover:-translate-y-1 transition-transform border border-[var(--border)]"
        >
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4 text-[var(--blurple)]">
            <ExternalLink size={20} />
          </div>
          <h3 className="font-bold mb-2">View History</h3>
          <p className="text-sm text-[var(--text-secondary)]">Check synced sessions in your dashboard history.</p>
        </a>
      </div>
    </div>
  );
}

function DesktopHeader() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
      <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
        <Monitor className="text-emerald-300" size={28} />
      </div>
      <div className="flex-1">
        <h1 className="text-3xl font-bold">Pomo Desktop</h1>
        <p className="text-[var(--text-secondary)]">Focus sessions from the app earn Water, XP and streak on your Pomo profile.</p>
      </div>
      <a
        href={STORE_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)] hover:text-white transition-colors"
      >
        <Download size={16} />
        Get the app
      </a>
    </div>
  );
}

function InfoCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="glass-panel p-5 border border-[var(--border)]">
      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4 text-[var(--blurple)]">
        {icon}
      </div>
      <h3 className="font-bold mb-2">{title}</h3>
      <p className="text-sm text-[var(--text-secondary)]">{body}</p>
    </div>
  );
}
