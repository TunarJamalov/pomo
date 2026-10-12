"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Save, Server, Loader2, CheckCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ServerData {
  settings: any;
  serverInfo: any;
  channels: {
    text: any[];
    voice: any[];
    categories: any[];
  };
}

export default function ServerSettingsClient({ guildId }: { guildId: string }) {
  const router = useRouter();
  const [data, setData] = useState<ServerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form State
  const [form, setForm] = useState({
    studyroom_category_id: "",
    studyroom_trigger_id: "",
    report_enabled: false,
    report_channel_id: "",
    goal_enabled: false,
    goal_target_minutes: 2500,
    voice_min_minutes: 10,
    voice_daily_reward_cap: 240,
  });

  useEffect(() => {
    fetch(`/api/servers/${guildId}`)
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "Failed to load server settings");
        }
        return res.json();
      })
      .then((resData) => {
        setData(resData);
        setForm({
          studyroom_category_id: resData.settings.studyroom_category_id || "",
          studyroom_trigger_id: resData.settings.studyroom_trigger_id || "",
          report_enabled: !!resData.settings.report_enabled,
          report_channel_id: resData.settings.report_channel_id || "",
          goal_enabled: !!resData.settings.goal_enabled,
          goal_target_minutes: resData.settings.goal_target_minutes || 2500,
          voice_min_minutes: resData.settings.voice_min_minutes || 10,
          voice_daily_reward_cap: resData.settings.voice_daily_reward_cap || 240,
        });
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [guildId]);

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    try {
      const res = await fetch(`/api/servers/${guildId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to save settings");
      }
      setError(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center min-h-[500px]">
        <Loader2 className="w-10 h-10 text-[var(--blurple)] animate-spin mb-4" />
        <p className="text-[var(--text-secondary)]">Loading server settings...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center min-h-[500px]">
        <div className="bg-red-500/10 text-red-500 px-6 py-4 rounded-xl border border-red-500/20">
          <p className="font-semibold">Error: {error}</p>
          <Link href="/dashboard/servers" className="text-sm underline mt-2 block">Go back to servers</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full pb-20 max-w-4xl">
      <Link href="/dashboard/servers" className="inline-flex items-center gap-2 text-[var(--text-secondary)] hover:text-white mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Servers
      </Link>

      <div className="flex items-center gap-4 mb-8">
        {data?.serverInfo?.icon ? (
          <img src={`https://cdn.discordapp.com/icons/${data.serverInfo.id}/${data.serverInfo.icon}.webp`} className="w-16 h-16 rounded-full" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-[#2b2d31] flex items-center justify-center text-xl font-bold">
            {data?.serverInfo?.name?.charAt(0)}
          </div>
        )}
        <div>
          <h1 className="text-3xl font-bold text-white">{data?.serverInfo?.name}</h1>
          <p className="text-[var(--blurple)] font-medium">Server Settings</p>
        </div>
      </div>

      <div className="space-y-6">
        
        {/* Core Setup */}
        <div className="bg-[#1e1f22] rounded-xl border border-white/5 p-6">
          <h2 className="text-xl font-bold text-white mb-4 border-b border-white/5 pb-4">Core Study Rooms</h2>
          <p className="text-[var(--text-secondary)] text-sm mb-6">Select the category and voice channel PomoBot will use to track study sessions.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-[var(--site-fg-2)] mb-2">Study Category</label>
              <select 
                className="w-full bg-[#2b2d31] text-white border-none rounded-lg p-3 outline-none focus:ring-2 focus:ring-[var(--blurple)]"
                value={form.studyroom_category_id}
                onChange={e => setForm({...form, studyroom_category_id: e.target.value})}
              >
                <option value="">-- Select a Category --</option>
                {data?.channels.categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-[var(--site-fg-2)] mb-2">Join-To-Create Channel</label>
              <select 
                className="w-full bg-[#2b2d31] text-white border-none rounded-lg p-3 outline-none focus:ring-2 focus:ring-[var(--blurple)]"
                value={form.studyroom_trigger_id}
                onChange={e => setForm({...form, studyroom_trigger_id: e.target.value})}
              >
                <option value="">-- Select a Voice Channel --</option>
                {data?.channels.voice.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Weekly Reports */}
        <div className="bg-[#1e1f22] rounded-xl border border-white/5 p-6">
          <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Weekly Reports</h2>
              <p className="text-[var(--text-secondary)] text-sm mt-1">PomoBot will post a server-wide leaderboard every week.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={form.report_enabled} onChange={e => setForm({...form, report_enabled: e.target.checked})} />
              <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:bg-[var(--blurple)] peer-focus:ring-4 peer-focus:ring-[var(--blurple)]/30 transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
            </label>
          </div>
          
          {form.report_enabled && (
            <div>
              <label className="block text-sm font-semibold text-[var(--site-fg-2)] mb-2">Report Channel</label>
              <select 
                className="w-full bg-[#2b2d31] text-white border-none rounded-lg p-3 outline-none focus:ring-2 focus:ring-[var(--blurple)]"
                value={form.report_channel_id}
                onChange={e => setForm({...form, report_channel_id: e.target.value})}
              >
                <option value="">-- Select a Text Channel --</option>
                {data?.channels.text.map(c => (
                  <option key={c.id} value={c.id}># {c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Rewards & Limits */}
        <div className="bg-[#1e1f22] rounded-xl border border-white/5 p-6">
          <h2 className="text-xl font-bold text-white mb-4 border-b border-white/5 pb-4">Economy & Rewards</h2>
          <p className="text-[var(--text-secondary)] text-sm mb-6">Configure how users earn Water and XP in voice channels.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-[var(--site-fg-2)] mb-2">Min. Minutes for Reward</label>
              <input 
                type="number"
                min="1"
                max="120"
                className="w-full bg-[#2b2d31] text-white border-none rounded-lg p-3 outline-none focus:ring-2 focus:ring-[var(--blurple)]"
                value={form.voice_min_minutes}
                onChange={e => setForm({...form, voice_min_minutes: parseInt(e.target.value) || 10})}
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-[var(--site-fg-2)] mb-2">Daily Reward Cap (Minutes)</label>
              <input 
                type="number"
                min="30"
                max="480"
                className="w-full bg-[#2b2d31] text-white border-none rounded-lg p-3 outline-none focus:ring-2 focus:ring-[var(--blurple)]"
                value={form.voice_daily_reward_cap}
                onChange={e => setForm({...form, voice_daily_reward_cap: parseInt(e.target.value) || 240})}
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-between bg-[#1e1f22] rounded-xl border border-white/5 p-4 sticky bottom-6 z-10 shadow-2xl">
          <div className="text-sm">
            {success && <span className="text-green-400 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Settings saved successfully!</span>}
            {error && <span className="text-red-400">Error: {error}</span>}
          </div>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 py-3 px-6 rounded-lg bg-[var(--blurple)] text-white hover:bg-[#4752c4] transition-colors font-bold disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Save Changes
          </button>
        </div>

      </div>
    </div>
  );
}
