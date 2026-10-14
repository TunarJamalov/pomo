"use client";

import { signIn } from "next-auth/react";

/** Signs in with Discord and comes back to the pricing section with personal checkout links. */
export default function ProSignInButton({ label, className }: { label: string; className?: string }) {
  return (
    <button type="button" onClick={() => signIn("discord", { callbackUrl: "/pricing#pricing" })} className={className}>
      {label}
    </button>
  );
}
