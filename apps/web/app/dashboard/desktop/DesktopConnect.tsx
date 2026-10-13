"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { Check, Copy, LogIn, Monitor } from "lucide-react";

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 font-bold text-black hover:-translate-y-1 transition-transform";

/** Signs in with Discord and comes straight back here, so the app link is one click away. */
export function DesktopSignIn({ callbackUrl }: { callbackUrl: string }) {
  return (
    <button type="button" onClick={() => signIn("discord", { callbackUrl })} className={buttonClass}>
      <LogIn size={18} />
      Sign in with Discord
    </button>
  );
}

/** Opens Pomo Focus through its pomo:// link; when the visitor came from the app it tries once on its own. */
export function OpenDesktopButton({ connectUrl, autoOpen }: { connectUrl: string; autoOpen: boolean }) {
  const tried = useRef(false);

  useEffect(() => {
    if (!autoOpen || tried.current) return;
    tried.current = true;
    window.location.href = connectUrl;
  }, [autoOpen, connectUrl]);

  return (
    <a href={connectUrl} className={buttonClass}>
      <Monitor size={18} />
      Open Pomo Focus
    </a>
  );
}

export function CopyTokenButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2 text-sm font-bold hover:bg-white/10 transition-colors"
    >
      {copied ? <Check size={16} className="text-emerald-300" /> : <Copy size={16} />}
      {copied ? "Copied" : "Copy code"}
    </button>
  );
}
