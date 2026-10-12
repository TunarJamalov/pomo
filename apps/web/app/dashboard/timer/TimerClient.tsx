"use client";

import { useState, useEffect, useRef } from "react";
import { Play, Square, Coffee, CheckCircle2, ChevronDown, Monitor } from "lucide-react";

export default function TimerClient({ initialTodaySessions, subjects }: { initialTodaySessions: any[], subjects: any[] }) {
  const [session, setSession] = useState<any>(null);
  const [elapsed, setElapsed] = useState(0);
  const [task, setTask] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("general");
  const [duration, setDuration] = useState(25);
  const [customDuration, setCustomDuration] = useState("");
  const [breakDuration, setBreakDuration] = useState(5);
  
  // Timer sync
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/activity/status");
        if (res.ok) {
          const data = await res.json();
          setSession(data.activeSession);
          if (data.activeSession) {
            let startedAtStr = data.activeSession.started_at;
            if (startedAtStr && !startedAtStr.endsWith('Z')) {
              startedAtStr = startedAtStr.replace(' ', 'T') + 'Z';
            }
            const start = new Date(startedAtStr).getTime();
            setElapsed(Math.floor((Date.now() - start) / 1000));
          } else {
            setElapsed(0);
          }
        }
      } catch (err) {}
    };

    fetchStatus();
    interval = setInterval(() => {
      fetchStatus();
      setElapsed((prev) => prev + 1);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Local tick
  useEffect(() => {
    if (!session) return;
    const tick = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(tick);
  }, [session]);

  const startSession = async () => {
    if (session) return;
    await fetch("/api/activity/timer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "study", minutes: duration, channelId: "web-dashboard", subject: selectedSubject, extra_data: JSON.stringify({ task }) }),
    });
    // Optimistic
    setSession({ type: 'solo', duration: duration, started_at: new Date().toISOString(), status: 'active' });
    setElapsed(0);
  };

  const stopSession = async () => {
    if (!session) return;
    await fetch("/api/activity/timer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "stop", channelId: "web-dashboard", minutes: 0 }),
    });
    setSession(null);
    setElapsed(0);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const timerRunning = !!session;
  const activeDuration = timerRunning ? session.duration * 60 : duration * 60;
  const remaining = Math.max(0, activeDuration - elapsed);
  
  // Circular progress
  const radius = 120;
  const circumference = 2 * Math.PI * radius;
  const progress = timerRunning ? Math.min(1, elapsed / activeDuration) : 0;
  const strokeDashoffset = circumference - progress * circumference;

  const handleCustomDuration = () => {
    const val = parseInt(customDuration);
    if (!isNaN(val) && val >= 5 && val <= 120) {
      setDuration(val);
      setCustomDuration("");
    }
  };

  const defaultSubjects = [
    { id: 'general', name: 'General' },
    { id: 'study', name: 'Study' },
    { id: 'coding', name: 'Coding' },
    { id: 'reading', name: 'Reading' },
  ];
  
  const displaySubjects = subjects.length > 0 ? subjects : defaultSubjects;

  return (
    <div className="flex flex-col xl:flex-row gap-6 w-full max-w-6xl mx-auto h-full">
      
      {/* Main Timer Area */}
      <div className="flex-1 flex flex-col gap-6">
        
        {/* Top Controls */}
        <div className="glass-panel p-6 flex flex-col gap-4">
          <div>
            <label className="text-sm font-bold text-[var(--text-secondary)] mb-2 block">What are you working on?</label>
            <input 
              type="text" 
              placeholder="e.g. Presentation draft"
              className="w-full bg-black/20 border border-[var(--border)] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--blurple)] transition-colors"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              disabled={timerRunning}
            />
          </div>
          
          <div>
            <label className="text-sm font-bold text-[var(--text-secondary)] mb-2 block">Session type</label>
            <div className="flex flex-wrap gap-2">
              {displaySubjects.map(sub => (
                <button
                  key={sub.id}
                  onClick={() => !timerRunning && setSelectedSubject(sub.name.toLowerCase())}
                  disabled={timerRunning}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    selectedSubject === sub.name.toLowerCase() 
                      ? 'bg-[var(--blurple)]/20 border-[var(--blurple)] text-[var(--blurple)]' 
                      : 'bg-black/20 border-white/10 text-[var(--text-secondary)] hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {sub.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Circular Timer Container */}
        <div className="glass-panel flex-1 flex flex-col items-center justify-center p-12 min-h-[400px] relative">
          
          {/* Circle */}
          <div className="relative flex items-center justify-center w-[300px] h-[300px] mb-8">
            <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 280 280">
              <circle
                cx="140"
                cy="140"
                r={radius}
                className="stroke-black/30"
                strokeWidth="12"
                fill="none"
              />
              <circle
                cx="140"
                cy="140"
                r={radius}
                className="stroke-[var(--blurple)] transition-all duration-1000 ease-linear"
                strokeWidth="12"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-6xl font-black tabular-nums tracking-tight">
                {formatTime(remaining)}
              </span>
              <span className="text-[var(--text-secondary)] font-medium mt-2">
                {timerRunning ? 'focusing...' : 'ready'}
              </span>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-4">
            {!timerRunning ? (
              <>
                <button onClick={startSession} className="bg-[var(--blurple)] hover:bg-[var(--blurple-dark)] text-white px-8 py-3 rounded-full font-bold text-lg flex items-center gap-2 transition-transform active:scale-95">
                  <Play size={20} fill="currentColor" /> Start
                </button>
                <button className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-8 py-3 rounded-full font-bold text-lg flex items-center gap-2 transition-transform active:scale-95">
                  <Coffee size={20} /> Break
                </button>
              </>
            ) : (
              <button onClick={stopSession} className="bg-red-500 hover:bg-red-600 text-white px-8 py-3 rounded-full font-bold text-lg flex items-center gap-2 transition-transform active:scale-95">
                <Square size={20} fill="currentColor" /> Stop
              </button>
            )}
          </div>
          
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-full xl:w-80 flex flex-col gap-6">
        
        <div className="glass-panel p-6">
          <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-4">Pick Duration</h3>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {[15, 25, 45, 50, 60, 90].map(val => (
              <button
                key={val}
                disabled={timerRunning}
                onClick={() => setDuration(val)}
                className={`py-2 rounded-lg text-sm font-medium transition-all ${
                  duration === val 
                    ? 'bg-[var(--blurple)] text-white' 
                    : 'bg-black/30 text-[var(--text-secondary)] hover:bg-white/10'
                }`}
              >
                {val} m
              </button>
            ))}
          </div>
          
          <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Custom Duration</h3>
          <div className="flex gap-2 mb-6">
            <input 
              type="number" 
              placeholder="Min"
              className="w-full bg-black/20 border border-[var(--border)] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[var(--blurple)]"
              value={customDuration}
              onChange={(e) => setCustomDuration(e.target.value)}
              disabled={timerRunning}
            />
            <button onClick={handleCustomDuration} disabled={timerRunning} className="bg-white/10 hover:bg-white/20 px-4 rounded-lg font-medium">Apply</button>
          </div>
          
          <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-4">Break Duration</h3>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[5, 10, 15, 20].map(val => (
              <button
                key={val}
                onClick={() => setBreakDuration(val)}
                className={`py-1.5 rounded-lg text-xs font-medium transition-all ${
                  breakDuration === val 
                    ? 'bg-[var(--green-neon)]/20 border border-[var(--green-neon)]/50 text-[var(--green-neon)]' 
                    : 'bg-black/30 text-[var(--text-secondary)] hover:bg-white/10'
                }`}
              >
                {val} m
              </button>
            ))}
          </div>
        </div>

        {/* Today's History */}
        <div className="glass-panel p-6 flex-1 flex flex-col min-h-[300px]">
          <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-4">Today's Sessions ({initialTodaySessions.length})</h3>
          
          {initialTodaySessions.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50">
              <CheckCircle2 size={32} className="mb-2 text-[var(--text-secondary)]" />
              <p className="text-sm">No sessions yet. You can start a small one.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 overflow-y-auto custom-scrollbar flex-1 pr-2">
              {initialTodaySessions.map((s, idx) => (
                <div key={idx} className="bg-black/20 border border-white/5 rounded-lg p-3 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-sm text-white">{s.title || "Study Session"}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{s.subject}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[var(--green-neon)]">+{s.duration}m</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}
