"use client";

import { useEffect, useState } from "react";
import { BotMessage, ChatWindow, DiscordButton, Embed, SegmentBar } from "./DiscordBits";

const TOTAL = 25 * 60;
const START_REMAINING = 12 * 60 + 37; // start mid-session so the bar is visibly moving

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The hero: a Discord channel where Pomo is running a real-looking /study
 * timer. The countdown ticks every second so visitors see the bot at work.
 */
export default function DiscordDemo() {
  const [remaining, setRemaining] = useState(START_REMAINING);

  useEffect(() => {
    const id = window.setInterval(() => {
      setRemaining((r) => (r <= 1 ? START_REMAINING : r - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = TOTAL - remaining;

  return (
    <ChatWindow channel="study-hall" className="w-full">
      <div role="img" aria-label="Example: Pomo posts a 25 minute study timer in a Discord channel and counts down live">
        <BotMessage time="Today at 13:40">
          <Embed color="var(--leaf)">
            <p className="font-semibold text-[var(--site-fg)]">✅ Session complete!</p>
            <p className="mt-1">
              <span className="text-[var(--site-fg)]">deniz</span> focused for 25 minutes.
            </p>
            <p className="mt-2 text-[var(--site-fg)]">+2 💧 Water · +20 ✨ XP · 🔥 12 day streak</p>
          </Embed>
        </BotMessage>

        <BotMessage time="Today at 14:02" usedBy={{ name: "mira", command: "/study" }}>
          <Embed color="var(--tomato)">
            <p className="text-[15px] font-semibold text-[var(--site-fg)]">📚 Linear algebra</p>
            <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-0.5">
              <span className="font-semibold text-[var(--site-fg)]">Duration</span>
              <span className="font-semibold text-[var(--site-fg)]">Elapsed</span>
              <span className="font-semibold text-[var(--site-fg)]">Remaining</span>
              <span>25m</span>
              <span className="font-mono tabular-nums">{clock(elapsed)}</span>
              <span className="font-mono tabular-nums text-[var(--cream)]">{clock(remaining)}</span>
            </div>
            <div className="mt-3">
              <SegmentBar value={elapsed / TOTAL} />
            </div>
            <p className="mt-2 text-[11px] text-[var(--site-subtle)]">Started by mira</p>
          </Embed>
          <div className="mt-2 flex flex-wrap gap-2">
            <DiscordButton>⏸ Pause</DiscordButton>
            <DiscordButton tone="red">Cancel session</DiscordButton>
          </div>
        </BotMessage>
      </div>
    </ChatWindow>
  );
}
