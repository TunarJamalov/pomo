"use client";

import { useTransition, useState } from "react";
import { updateProfileAction } from "./actions";
import { Save, UserCircle2, Sparkles, Hash, Lock } from "lucide-react";

type Profile = {
  bio: string;
  theme: string;
  proAccent: string;
  proBadge: string;
};

// Available themes matching PomoBot/utils/constants.js
const THEMES = [
  { id: 'basic', name: 'Basic Theme', accent: '#5865F2', colors: 'from-[#2F3136] to-[#202225] border-[#5865F2]' },
  { id: 'nature', name: 'Nature Theme', accent: '#2ECC71', colors: 'from-[#134E5E] to-[#71B280] border-[#2ECC71]' },
  { id: 'dark', name: 'Dark Theme', accent: '#9B59B6', colors: 'from-[#141E30] to-[#243B55] border-[#9B59B6]' },
  { id: 'sunset', name: 'Sunset Theme', accent: '#FFFFFF', colors: 'from-[#FF512F] to-[#F09819] border-[#FFFFFF]' },
  { id: 'ocean', name: 'Ocean Theme', accent: '#FFFFFF', colors: 'from-[#2E3192] to-[#1BFFFF] border-[#FFFFFF]' },
  { id: 'cyberpunk', name: 'Cyberpunk Theme', accent: '#00FFFF', colors: 'from-[#3A1C71] via-[#D76D77] to-[#FFAF7B] border-[#00FFFF]' },
  { id: 'sakura', name: 'Sakura Theme', accent: '#FF4A7A', colors: 'from-[#ff9a9e] to-[#fecfef] border-[#FF4A7A]' },
  { id: 'lofi', name: 'Lo-fi Theme', accent: '#FFD700', colors: 'from-[#654ea3] to-[#eaafc8] border-[#FFD700]' },
];

const PRO_ACCENTS = [
  { id: "theme", name: "Theme Default", color: "#5865F2" },
  { id: "gold", name: "Focus Gold", color: "#F1C40F" },
  { id: "coral", name: "Pomo Coral", color: "#FF6B6B" },
  { id: "mint", name: "Fresh Mint", color: "#57F287" },
  { id: "cyan", name: "Deep Focus", color: "#5BC0EB" },
  { id: "violet", name: "Night Violet", color: "#B388FF" },
];

const PRO_BADGES = [
  { id: "pomo_pro", name: "Pomo Pro", text: "POMO PRO" },
  { id: "deep_work", name: "Deep Work", text: "DEEP WORK" },
  { id: "focus_club", name: "Focus Club", text: "FOCUS CLUB" },
  { id: "early_supporter", name: "Early Supporter", text: "EARLY SUPPORTER" },
];

export default function ProfileClient({ initialProfile, discordUser, unlockedThemes }: { initialProfile: Profile, discordUser: any, unlockedThemes: string[] }) {
  const [isPending, startTransition] = useTransition();
  const [successMsg, setSuccessMsg] = useState(false);
  const [bio, setBio] = useState(initialProfile.bio || "");
  const [theme, setTheme] = useState(initialProfile.theme || "basic");
  const [proAccent, setProAccent] = useState(initialProfile.proAccent || "gold");
  const [proBadge, setProBadge] = useState(initialProfile.proBadge || "pomo_pro");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("bio", bio);
    formData.append("theme", theme);
    formData.append("proAccent", proAccent);
    formData.append("proBadge", proBadge);

    startTransition(async () => {
      const ok = await updateProfileAction(formData);
      if (ok) {
        setSuccessMsg(true);
        setTimeout(() => setSuccessMsg(false), 3000);
      }
    });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Settings Form */}
      <div className="flex-1 glass-panel p-8">
        <h2 className="text-2xl font-bold flex items-center gap-2 mb-6">
          <UserCircle2 className="text-[var(--blurple)]" /> 
          Discord Profile Setup
        </h2>

        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* Bio Setting */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-[var(--text-secondary)]">
              Your Biography
            </label>
            <textarea 
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full h-32 bg-black/30 border border-[var(--border)] rounded-xl p-4 text-white placeholder-[var(--text-muted)] focus:border-[var(--blurple)] focus:ring-1 focus:ring-[var(--blurple)] transition-colors resize-none"
              placeholder="Tell other students about yourself, your goals, or your current focus..."
              maxLength={200}
            />
            <div className="text-right text-xs text-[var(--text-muted)] mt-1">
              {bio.length}/200 characters
            </div>
          </div>

          {/* Theme Setting */}
          <div>
            <label className="block text-sm font-semibold mb-3 text-[var(--text-secondary)]">
              Bot ID Card Theme
            </label>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              This theme will be applied when someone uses <span className="bg-black/50 px-1.5 py-0.5 rounded text-[var(--blurple)] font-mono">/profile</span> in Discord. Locked themes can be bought via Discord from the Pomo Store.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {THEMES.map((t) => {
                const isLocked = !unlockedThemes.includes(t.id);
                
                return (
                  <div 
                    key={t.id} 
                    onClick={() => { if(!isLocked) setTheme(t.id) }}
                    className={`p-4 rounded-xl border-2 transition-all duration-300 flex items-center justify-between ${
                      isLocked ? 'border-gray-800 opacity-50 bg-black/40 cursor-not-allowed' :
                      theme === t.id 
                        ? 'border-[var(--green-neon)] bg-[var(--green-neon)]/10 cursor-pointer' 
                        : 'border-[var(--border)] hover:border-[var(--text-muted)] cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-br border ${t.colors} ${isLocked ? 'grayscale' : ''}`} />
                      <span className="font-bold text-sm">{t.name}</span>
                    </div>
                    {isLocked ? (
                      <Lock size={16} className="text-[var(--text-muted)]" />
                    ) : theme === t.id ? (
                      <Sparkles size={18} className="text-[var(--green-neon)]" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[var(--border)] pt-8">
            <div className="flex items-center justify-between gap-4 mb-2">
              <label className="block text-sm font-semibold text-[var(--text-secondary)]">
                Pomo Pro Profile Style
              </label>
              <span className="text-[10px] font-black text-yellow-300 bg-yellow-300/10 border border-yellow-300/20 px-2 py-1 rounded">
                PRO
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-5">
              Your choices are saved now and appear on Discord profile cards while Pomo Pro is active.
            </p>

            <div className="mb-6">
              <span className="block text-xs font-semibold mb-3 text-[var(--text-secondary)]">Accent</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {PRO_ACCENTS.map((accent) => (
                  <button
                    key={accent.id}
                    type="button"
                    onClick={() => setProAccent(accent.id)}
                    className={`min-h-12 border flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                      proAccent === accent.id
                        ? "border-white bg-white/10"
                        : "border-[var(--border)] bg-black/20 hover:border-[var(--text-muted)]"
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-white/30 shrink-0"
                      style={{ backgroundColor: accent.color }}
                    />
                    <span className="text-xs font-semibold">{accent.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold mb-3 text-[var(--text-secondary)]">Badge</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PRO_BADGES.map((badge) => (
                  <button
                    key={badge.id}
                    type="button"
                    onClick={() => setProBadge(badge.id)}
                    className={`min-h-12 border px-3 py-2 text-left text-xs font-bold transition-colors ${
                      proBadge === badge.id
                        ? "border-white bg-white/10"
                        : "border-[var(--border)] bg-black/20 hover:border-[var(--text-muted)]"
                    }`}
                  >
                    {badge.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 btn-primary py-4 rounded-xl font-bold text-lg disabled:opacity-50 mt-4"
          >
            {isPending ? 'Saving...' : (successMsg ? 'Saved successfully! 🎉' : <><Save size={20} /> Save Changes</>)}
          </button>
        </form>
      </div>

      {/* Live Preview (Simulation) */}
      <div className="w-full lg:w-80 shrink-0">
        <h3 className="font-bold text-lg mb-4 text-[var(--text-secondary)] text-center lg:text-left">
          Profile Preview
        </h3>
        
        <div className={`rounded-2xl border-2 p-6 flex flex-col items-center text-center transition-all duration-500 bg-gradient-to-br ${
          THEMES.find(t => t.id === theme)?.colors || THEMES[0].colors
        }`}>
          {/* Avatar Area */}
          <div className="relative mb-4">
            <img 
              src={discordUser?.image || "/logo.png"} 
              alt="Avatar" 
              className="w-24 h-24 rounded-full border-4 border-black/50 shadow-2xl"
            />
            {theme !== 'basic' && (
              <div className="absolute -bottom-2 -right-2 bg-black/80 rounded-full p-1.5 border border-white/10">
                <Sparkles size={14} className="text-yellow-400" />
              </div>
            )}
          </div>
          
          <h4 className="text-xl font-black drop-shadow-md">{discordUser?.name || "Student"}</h4>
          <div
            className="text-[10px] font-black px-2 py-1 rounded mt-2 flex items-center gap-1 shadow-lg border border-white/20 text-black"
            style={{
              backgroundColor: proAccent === "theme"
                ? THEMES.find((item) => item.id === theme)?.accent || "#5865F2"
                : PRO_ACCENTS.find((item) => item.id === proAccent)?.color || "#F1C40F",
            }}
          >
            <Hash size={10} /> {PRO_BADGES.find((item) => item.id === proBadge)?.text || "POMO PRO"}
          </div>

          <div className="mt-6 w-full text-left bg-black/40 rounded-xl p-4 border border-white/10 shadow-inner">
            <p className="text-sm italic text-white leading-relaxed min-h-[60px] break-words drop-shadow-md">
              "{bio || "No biography provided. Just a mysterious deep work scholar."}"
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
