"use client";

import { motion } from "framer-motion";
import { Trees, Coins, Activity, Zap } from "lucide-react";

export default function FeaturesGrid() {
  const containerVariants: any = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  const itemVariants: any = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
  };

  return (
    <section id="features" className="py-20 md:py-32 px-6">
      <div className="max-w-[1200px] mx-auto">
        
        <div className="text-center mb-16 md:mb-24">
          <h2 className="text-[clamp(32px,5vw,56px)] font-[900] leading-tight mb-4">
            Everything you need. <br />
            <span className="text-[var(--text-secondary)]">All in one place.</span>
          </h2>
          <p className="text-[var(--text-muted)] text-lg md:text-xl max-w-[600px] mx-auto">
            Focus is just the beginning. Build habits through powerful gamification systems.
          </p>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8"
        >
          {/* Card 1: Virtual Garden */}
          <motion.div variants={itemVariants} className="glass-panel p-8 md:p-12 relative overflow-hidden group">
            <div className="absolute -top-32 -right-32 w-64 h-64 bg-[var(--green-neon)]/10 blur-[80px] rounded-full group-hover:bg-[var(--green-neon)]/20 transition-all duration-700" />
            <div className="w-14 h-14 rounded-2xl bg-[var(--green-neon)]/10 border border-[var(--green-neon)]/20 flex items-center justify-center mb-6">
              <Trees className="text-[var(--green-neon)]" size={28} />
            </div>
            <h3 className="text-2xl md:text-3xl font-bold mb-4">Grow your Virtual Garden</h3>
            <p className="text-[var(--text-secondary)] text-base md:text-lg mb-8 leading-relaxed">
              Every Pomodoro session yields Water drops. Use them to plant seeds, nurture your trees, and harvest global leaderboards.
            </p>
            {/* Mockup Window */}
            <div className="w-full bg-black/40 border border-[var(--border)] rounded-xl p-4 flex items-center justify-between shadow-2xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-[var(--green-neon)]/20 flex items-center justify-center text-xl">🌱</div>
                <div>
                  <div className="font-bold">Mystic Oak Tree</div>
                  <div className="text-xs text-[var(--green-neon)]">80% Grown • +15 XP/hr</div>
                </div>
              </div>
              <button className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium border border-[var(--border)] transition-colors">
                Water
              </button>
            </div>
          </motion.div>

          {/* Card 2: Economy & Market */}
          <motion.div variants={itemVariants} className="glass-panel p-8 md:p-12 relative overflow-hidden group">
            <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-[var(--orange-neon)]/10 blur-[80px] rounded-full group-hover:bg-[var(--orange-neon)]/20 transition-all duration-700" />
            <div className="w-14 h-14 rounded-2xl bg-[var(--orange-neon)]/10 border border-[var(--orange-neon)]/20 flex items-center justify-center mb-6">
              <Coins className="text-[var(--orange-neon)]" size={28} />
            </div>
            <h3 className="text-2xl md:text-3xl font-bold mb-4">Robust Economy</h3>
            <p className="text-[var(--text-secondary)] text-base md:text-lg mb-8 leading-relaxed">
              Trade your hard-earned Water in the marketplace. Buy Profile Themes, powerful Study Pets, and unique discord roles.
            </p>
            {/* Mockup Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-black/40 border border-[var(--border)] rounded-xl p-3 text-center">
                <div className="text-3xl mb-2">🌸</div>
                <div className="text-sm font-bold">Sakura Theme</div>
                <div className="text-xs text-[var(--orange-neon)]">4,500 💧</div>
              </div>
              <div className="bg-black/40 border border-[var(--border)] rounded-xl p-3 text-center">
                <div className="text-3xl mb-2">🦊</div>
                <div className="text-sm font-bold">Fox Familiar</div>
                <div className="text-xs text-[var(--orange-neon)]">12,000 💧</div>
              </div>
            </div>
          </motion.div>

          {/* Card 3: Live Stats */}
          <motion.div variants={itemVariants} className="glass-panel p-8 md:p-12 relative overflow-hidden group lg:col-span-2 flex flex-col md:flex-row items-center gap-8 md:gap-16">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[var(--blurple)]/5 blur-[100px] rounded-full pointer-events-none" />
            
            <div className="flex-1 relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-[var(--blurple)]/10 border border-[var(--blurple)]/20 flex items-center justify-center mb-6">
                <Activity className="text-[var(--blurple)]" size={28} />
              </div>
              <h3 className="text-2xl md:text-3xl font-bold mb-4">Automatic Tracking & Analytics</h3>
              <p className="text-[var(--text-secondary)] text-base md:text-lg leading-relaxed">
                Join your server's study voice channel and PomoBot tracks focus automatically. Manual Pomodoro and team sessions appear alongside voice time in your streaks, rankings, reports, and Web Dashboard.
              </p>
            </div>

            <div className="flex-1 w-full bg-black/40 border border-[var(--border)] rounded-2xl p-6 relative shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <span className="font-medium text-sm text-[var(--text-secondary)]">Weekly Focus</span>
                <span className="text-[var(--green-neon)] text-sm font-bold flex items-center gap-1"><Zap size={14} /> +24%</span>
              </div>
              <div className="flex items-end justify-between h-[120px] gap-2">
                {[40, 70, 45, 90, 65, 100, 85].map((height, i) => (
                  <div key={i} className="w-full bg-[var(--blurple)]/20 rounded-t-sm relative group cursor-pointer hover:bg-[var(--blurple)]/40 transition-colors" style={{ height: `${height}%` }}>
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-black text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {Math.round((height / 100) * 8)}h
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-3 text-[10px] font-bold text-[var(--text-muted)] uppercase">
                <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
              </div>
            </div>

          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
