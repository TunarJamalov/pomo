"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";

type PaddleGlobal = {
  Environment: { set: (env: string) => void };
  Initialize: (options: { token: string }) => void;
  Checkout: { open: (options: Record<string, unknown>) => void };
};

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

let paddleReady: Promise<PaddleGlobal> | null = null;

/** Loads Paddle.js once per page and initializes it with the client-side token. */
function loadPaddle(environment: string, token: string): Promise<PaddleGlobal> {
  if (paddleReady) return paddleReady;
  paddleReady = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = () => {
      const paddle = window.Paddle;
      if (!paddle) return reject(new Error("Paddle.js did not load"));
      if (environment === "sandbox") paddle.Environment.set("sandbox");
      paddle.Initialize({ token });
      resolve(paddle);
    };
    script.onerror = () => {
      paddleReady = null;
      reject(new Error("Paddle.js did not load"));
    };
    document.head.appendChild(script);
  });
  return paddleReady;
}

type Props = {
  environment: "sandbox" | "production";
  token: string;
  priceId: string;
  discordId: string;
  label: string;
  className?: string;
  /** Open right away, e.g. when the visitor came from a plan button in Discord. */
  autoOpen?: boolean;
};

export default function PaddleCheckoutButton({ environment, token, priceId, discordId, label, className, autoOpen }: Props) {
  const [failed, setFailed] = useState(false);
  const opened = useRef(false);

  async function open() {
    setFailed(false);
    try {
      const paddle = await loadPaddle(environment, token);
      paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        // The webhook gives Pro to this Discord account
        customData: { discord_id: discordId },
        settings: {
          displayMode: "overlay",
          theme: "dark",
          successUrl: `${window.location.origin}/pricing?welcome=1`,
        },
      });
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    if (!autoOpen || opened.current) return;
    opened.current = true;
    void open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  return (
    <>
      <button type="button" onClick={open} className={className}>
        {label}
        <ArrowUpRight size={14} />
      </button>
      {failed && (
        <p className="mt-2 text-[13px] text-[var(--site-muted)]">
          The checkout could not load. Disable ad blockers for this page and try again.
        </p>
      )}
    </>
  );
}
