"use client";

import { motion } from "framer-motion";

const timelineEvents = [
  {
    version: "v2.0 (Latest)",
    date: "Current",
    title: "Web Dashboard & Atomic Economy",
    description: "Launch of Next.js Web App integration, Atomic SQL operations for market security, and canvas-based profile dashboard visuals.",
    color: "var(--blurple)",
    active: true,
  },
  {
    version: "v1.5",
    date: "March",
    title: "The Virtual Garden Updates",
    description: "Introduced dynamic seed planting, global weather system, and time-based harvesting for focus sessions.",
    color: "var(--green-neon)",
    active: false,
  },
  {
    version: "v1.0",
    date: "February",
    title: "Beta Launch",
    description: "Core Pomodoro timer built inside Discord with basic XP tracking and daily leaderboards.",
    color: "var(--text-muted)",
    active: false,
  },
];

export default function Timeline() {
  return (
    <section id="updates" className="py-20 md:py-32 px-6 bg-[var(--bg-surface)] border-t border-b border-[var(--border)]">
      <div className="max-w-[800px] mx-auto">
        <div className="text-center mb-16 md:mb-24">
          <h2 className="text-[clamp(32px,5vw,48px)] font-[900] leading-tight mb-4">
            Constantly Evolving
          </h2>
          <p className="text-[var(--text-muted)] text-lg md:text-xl max-w-[500px] mx-auto">
            Our update roadmap is completely public. See what we&apos;ve shipped and what&apos;s coming up next.
          </p>
        </div>

        <div className="relative">
          {/* Vertical Line */}
          <div className="absolute top-0 bottom-0 left-[24px] md:left-1/2 md:-translate-x-1/2 w-px bg-gradient-to-b from-transparent via-[var(--border)] to-transparent" />

          <div className="space-y-12 md:space-y-24">
            {timelineEvents.map((event, index) => (
              <motion.div
                key={event.version}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`relative flex flex-col md:flex-row gap-8 items-start md:items-center ${index % 2 !== 0 ? "md:flex-row-reverse" : ""}`}
              >
                {/* Visual Dot */}
                <div className="absolute left-[24px] md:left-1/2 transform -translate-x-1/2 w-4 h-4 rounded-full border-4 border-[var(--bg-surface)] z-10" style={{ background: event.color }}>
                  {event.active && (
                     <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full animate-ping opacity-20" style={{ background: event.color }} />
                  )}
                </div>

                {/* Content Box */}
                <div className={`w-full pl-[56px] md:pl-0 md:w-1/2 ${index % 2 !== 0 ? "md:pr-12 text-left md:text-right" : "md:pl-12 text-left"}`}>
                  <div className="glass-panel p-6 md:p-8 hover:bg-white/5 transition-colors relative group overflow-hidden">
                    {/* Hover Glow */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-black/40 rounded-full text-xs font-bold mb-4" style={{ color: event.color }}>
                      {event.version} • {event.date}
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold mb-3">{event.title}</h3>
                    <p className="text-[var(--text-secondary)] leading-relaxed">
                      {event.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
