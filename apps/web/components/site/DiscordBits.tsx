import Image from "next/image";
import type { ReactNode } from "react";

/*
 * Small, faithful pieces of Discord's chat UI used to show what Pomo actually
 * posts. Colours are Discord's dark theme values so the replicas read as real.
 */

const AVATAR_COLORS = ["#e8a53a", "#4fb3d9", "#a78bfa", "#4fb35f", "#f472b6"];

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-[#1a1b1e]"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {name[0].toUpperCase()}
    </span>
  );
}

export function PomoAvatar({ size = 40 }: { size?: number }) {
  return (
    <span className="shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size }}>
      <Image src="/logo.png" alt="" width={size} height={size} className="h-full w-full scale-[1.55] object-cover" />
    </span>
  );
}

export function AppBadge() {
  return (
    <span className="rounded-[4px] bg-[var(--discord)] px-1 py-px text-[10px] font-semibold uppercase leading-[14px] text-white">
      ✓ App
    </span>
  );
}

export function BotMessage({ time, children, usedBy }: { time: string; children: ReactNode; usedBy?: { name: string; command: string } }) {
  return (
    <div className="px-4 py-1.5">
      {usedBy && (
        <div className="mb-1 ml-5 flex items-center gap-1.5 text-[12px] text-[var(--site-subtle)]">
          <span className="h-2 w-6 rounded-tl-md border-l-2 border-t-2 border-[#4e5058]" aria-hidden="true" />
          <Avatar name={usedBy.name} size={16} />
          <span className="font-medium text-[var(--site-muted)]">{usedBy.name}</span> used
          <span className="text-[var(--discord)]">{usedBy.command}</span>
        </div>
      )}
      <div className="flex gap-3.5">
        <PomoAvatar />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-medium text-[#f0533f]">Pomo</span>
            <AppBadge />
            <span className="text-[11px] text-[var(--site-subtle)]">{time}</span>
          </div>
          <div className="mt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Embed({ color, children }: { color: string; children: ReactNode }) {
  return (
    <div
      className="max-w-[440px] rounded-[4px] border-l-4 bg-[var(--site-surface-2)] px-3.5 py-3 text-[13px] leading-relaxed text-[var(--site-fg-2)]"
      style={{ borderLeftColor: color }}
    >
      {children}
    </div>
  );
}

export function DiscordButton({ children, tone = "grey" }: { children: ReactNode; tone?: "grey" | "red" | "blurple" }) {
  const bg = tone === "red" ? "#da373c" : tone === "blurple" ? "var(--discord)" : "#4e5058";
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-[4px] px-3.5 text-[13px] font-medium text-white" style={{ background: bg }}>
      {children}
    </span>
  );
}

/** The bot's progress bar: a row of emoji segments with rounded ends */
export function SegmentBar({ value, width = 16 }: { value: number; width?: number }) {
  const filled = Math.round(Math.min(1, Math.max(0, value)) * width);
  return (
    <span className="flex h-2.5 w-full max-w-[260px] gap-[2px]" aria-hidden="true">
      {Array.from({ length: width }, (_, i) => (
        <span
          key={i}
          className={`h-full flex-1 ${i === 0 ? "rounded-l-full" : ""} ${i === width - 1 ? "rounded-r-full" : ""}`}
          style={{ background: i < filled ? "var(--tomato)" : "#4e5058" }}
        />
      ))}
    </span>
  );
}

export function ChatWindow({ channel, children, className = "" }: { channel: string; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-black/40 bg-[var(--site-chat)] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)] ${className}`}>
      <div className="flex h-12 items-center gap-2 border-b border-black/30 px-4 text-[15px] font-semibold text-[var(--site-fg)]">
        <span className="text-[20px] font-normal text-[var(--site-subtle)]">#</span>
        {channel}
      </div>
      <div className="py-3">{children}</div>
    </div>
  );
}
