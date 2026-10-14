"use client";

import { signIn } from "next-auth/react";

/** Signs in with Discord and comes back to the pricing section with personal checkout links. */
export default function ProSignInButton({ label, className, callbackUrl = "/pricing#pricing" }: { label: string; className?: string; callbackUrl?: string }) {
  return (
    <button type="button" onClick={() => signIn("discord", { callbackUrl })} className={className}>
      {label}
    </button>
  );
}
