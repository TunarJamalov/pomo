import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bell,
  CheckCircle2,
  Clock3,
  Coffee,
  Flame,
  Gauge,
  History,
  KeyRound,
  LogIn,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Power,
  RotateCcw,
  Settings,
  ShieldAlert,
  Sprout,
  Timer,
  UserRound,
  Wifi,
  WifiOff
} from 'lucide-react';
import logoUrl from '../assets/icon-128.png';

type TimerMode = 'focus' | 'shortBreak' | 'longBreak';
type View = 'timer' | 'history' | 'settings' | 'account';
type TimerStatus = 'ready' | 'running' | 'paused' | 'finished';

type TimerSettings = {
  focus: number;
  shortBreak: number;
  longBreak: number;
};

type SyncSettings = {
  apiUrl: string;
  token: string;
  autoSync: boolean;
};

type DailyStats = {
  date: string;
  focusMinutes: number;
  sessions: number;
};

type ActiveSession = {
  id: string;
  startedAt: string;
};

type SyncState = {
  status: 'idle' | 'syncing' | 'synced' | 'duplicate' | 'error' | 'off';
  message: string;
};

type PendingIdleSession = {
  session: ActiveSession;
  minutes: number;
  title: string;
  subject: string;
  idleSeconds: number;
};

type RecentSession = {
  id: string;
  title: string;
  subject: string;
  minutes: number;
  startedAt: string;
  completedAt: string;
  syncStatus: 'syncing' | 'synced' | 'duplicate' | 'local' | 'error';
  message: string;
};

type ConnectedProfile = {
  discordId: string;
  username: string;
  avatar: string | null;
  level: number;
  water: number;
  streak: number;
  totalFocusMinutes: number;
  totalSessions: number;
};

const DEFAULT_SETTINGS: TimerSettings = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15
};

const DEFAULT_SYNC: SyncSettings = {
  apiUrl: 'https://pomofocus.online/api/desktop/session',
  token: '',
  autoSync: true
};

const SETTINGS_KEY = 'pomo-desktop-settings';
const SYNC_KEY = 'pomo-desktop-sync';
const DAILY_STATS_KEY = 'pomo-desktop-daily-stats';
const IDLE_GUARD_KEY = 'pomo-desktop-idle-guard';
const RECENT_SESSIONS_KEY = 'pomo-desktop-recent-sessions';
const PROFILE_KEY = 'pomo-desktop-profile';
const IDLE_GUARD_THRESHOLD_SECONDS = 15 * 60;
const MAX_RECENT_SESSIONS = 10;

// Signed-in page that hands the app a desktop token through a pomo:// link
const CONNECT_URL = 'https://pomofocus.online/dashboard/desktop?from=app';

const links = [
  { label: 'Dashboard', href: 'https://pomofocus.online/dashboard' },
  { label: 'Support', href: 'https://discord.gg/XEubrrkBmB' },
  { label: 'Top.gg', href: 'https://top.gg/bot/1443523945599860816' }
];

const subjectOptions = [
  { value: 'general', label: 'General' },
  { value: 'math', label: 'Math' },
  { value: 'language', label: 'Language' },
  { value: 'coding', label: 'Coding' },
  { value: 'reading', label: 'Reading' },
  { value: 'exam', label: 'Exam' }
];

const modeMeta: Record<TimerMode, { label: string; icon: ReactNode; completeTitle: string; completeBody: string }> = {
  focus: {
    label: 'Focus',
    icon: <Flame size={18} />,
    completeTitle: 'Focus session complete',
    completeBody: 'Nice work. Take a short break before the next round.'
  },
  shortBreak: {
    label: 'Short Break',
    icon: <Coffee size={18} />,
    completeTitle: 'Break complete',
    completeBody: 'Ready for another focus session?'
  },
  longBreak: {
    label: 'Long Break',
    icon: <Sprout size={18} />,
    completeTitle: 'Long break complete',
    completeBody: 'You are reset and ready to study again.'
  }
};

export function App() {
  const [settings, setSettings] = useState<TimerSettings>(() => loadSettings());
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(() => loadSyncSettings());
  const [mode, setMode] = useState<TimerMode>('focus');
  const [status, setStatus] = useState<TimerStatus>('ready');
  const [remainingSeconds, setRemainingSeconds] = useState(settings.focus * 60);
  const [stats, setStats] = useState<DailyStats>(() => loadDailyStats());
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    if (typeof Notification === 'undefined') return false;
    return Notification.permission === 'granted';
  });
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [sessionTitle, setSessionTitle] = useState('Desktop Focus');
  const [subject, setSubject] = useState('general');
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'idle',
    message: 'Connect with Discord to sync completed focus sessions.'
  });
  const [compactMode, setCompactMode] = useState(false);
  const [view, setView] = useState<View>('timer');
  const [startupEnabled, setStartupEnabled] = useState(false);
  const [idleGuardEnabled, setIdleGuardEnabled] = useState(() => loadIdleGuardSetting());
  const [pendingIdleSession, setPendingIdleSession] = useState<PendingIdleSession | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>(() => loadRecentSessions());
  const [connectedProfile, setConnectedProfile] = useState<ConnectedProfile | null>(() => loadConnectedProfile());

  const totalSeconds = settings[mode] * 60;
  const elapsedSeconds = Math.max(0, totalSeconds - remainingSeconds);
  const progress = totalSeconds === 0 ? 0 : Math.min(100, (elapsedSeconds / totalSeconds) * 100);
  const modeLabel = modeMeta[mode].label;
  const isConnected = Boolean(syncSettings.token.trim() && connectedProfile);
  // Before any sync this session, say where sessions go instead of the old "connect" hint
  const syncMessage = isConnected && syncState.status === 'idle'
    ? 'Connected. Finished sessions go to your Pomo profile.'
    : syncState.message;

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(SYNC_KEY, JSON.stringify(syncSettings));
  }, [syncSettings]);

  useEffect(() => {
    localStorage.setItem(DAILY_STATS_KEY, JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    localStorage.setItem(IDLE_GUARD_KEY, JSON.stringify(idleGuardEnabled));
  }, [idleGuardEnabled]);

  useEffect(() => {
    localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(recentSessions));
  }, [recentSessions]);

  useEffect(() => {
    if (connectedProfile) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(connectedProfile));
    } else {
      localStorage.removeItem(PROFILE_KEY);
    }
  }, [connectedProfile]);

  useEffect(() => {
    const unsubscribe = window.pomoDesktop?.onDeepLink?.((payload) => {
      const token = typeof payload.token === 'string' ? payload.token.trim() : '';
      const apiUrl = typeof payload.apiUrl === 'string' ? payload.apiUrl.trim() : '';
      if (!token) return;

      const resolvedApiUrl = apiUrl || DEFAULT_SYNC.apiUrl;
      setSyncSettings(current => ({
        ...current,
        token,
        apiUrl: resolvedApiUrl,
        autoSync: true
      }));
      // Check the new connection right away so the profile shows without an extra click
      setView('account');
      void testSync({ token, apiUrl: resolvedApiUrl });
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    window.pomoDesktop?.getWindowMode?.().then(payload => {
      setCompactMode(Boolean(payload?.compact));
    });

    const unsubscribe = window.pomoDesktop?.onWindowMode?.((payload) => {
      setCompactMode(Boolean(payload?.compact));
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    window.pomoDesktop?.getStartupSettings?.().then(payload => {
      setStartupEnabled(Boolean(payload?.openAtLogin));
    });
  }, []);

  useEffect(() => {
    if (status !== 'running') return;

    const interval = window.setInterval(() => {
      setRemainingSeconds(current => {
        if (current <= 1) {
          window.clearInterval(interval);
          completeTimer();
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [status, mode, settings, activeSession, sessionTitle, subject, syncSettings]);

  useEffect(() => {
    if (status === 'running') {
      document.title = `${formatTime(remainingSeconds)} - ${modeLabel}`;
      return;
    }
    document.title = 'Pomo Focus';
  }, [remainingSeconds, status, modeLabel]);

  useEffect(() => {
    window.pomoDesktop?.updateTray?.({
      mode: modeLabel,
      time: formatTime(remainingSeconds),
      status: statusText(status)
    });
  }, [modeLabel, remainingSeconds, status]);

  useEffect(() => {
    const unsubscribe = window.pomoDesktop?.onTrayCommand?.((command) => {
      if (command === 'reset') {
        resetTimer();
        return;
      }

      if (status === 'running') {
        pauseTimer();
      } else {
        startTimer();
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [status, mode, settings, activeSession]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.repeat || isTypingTarget(event.target)) return;

      if (event.code === 'Space') {
        event.preventDefault();
        if (status === 'running') {
          pauseTimer();
        } else {
          startTimer();
        }
        return;
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        resetTimer();
        return;
      }

      if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        void toggleCompactMode();
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [status, mode, settings, activeSession, compactMode]);

  const nextMode = useMemo<TimerMode>(() => {
    if (mode === 'focus') return stats.sessions > 0 && stats.sessions % 4 === 0 ? 'longBreak' : 'shortBreak';
    return 'focus';
  }, [mode, stats.sessions]);

  function completeTimer() {
    setStatus('finished');

    const completedSession = activeSession || createActiveSession();
    const completedTitle = sessionTitle.trim() || 'Desktop Focus';

    if (mode === 'focus') {
      void handleFocusCompletion(completedSession, settings.focus, completedTitle, subject);
    }

    const meta = modeMeta[mode];
    sendNotification(meta.completeTitle, meta.completeBody);
  }

  async function handleFocusCompletion(
    session: ActiveSession,
    minutes: number,
    title: string,
    currentSubject: string
  ) {
    const idleSeconds = await window.pomoDesktop?.getIdleSeconds?.().catch(() => 0) ?? 0;

    if (idleGuardEnabled && idleSeconds >= IDLE_GUARD_THRESHOLD_SECONDS) {
      setPendingIdleSession({
        session,
        minutes,
        title,
        subject: currentSubject,
        idleSeconds
      });
      setSyncState({
        status: 'off',
        message: `Idle Guard paused this session. Confirm it if ${formatIdleDuration(idleSeconds)} idle time was expected.`
      });
      sendNotification('Confirm focus session', 'Pomo paused this session because your computer was idle for a while.');
      return;
    }

    creditFocusSession(session, minutes, title, currentSubject);
  }

  function creditFocusSession(session: ActiveSession, minutes: number, title: string, currentSubject: string) {
    setStats(current => ({
      date: todayKey(),
      focusMinutes: current.focusMinutes + minutes,
      sessions: current.sessions + 1
    }));

    recordRecentSession({
      id: session.id,
      title,
      subject: currentSubject,
      minutes,
      startedAt: session.startedAt,
      completedAt: new Date().toISOString(),
      syncStatus: syncSettings.autoSync ? 'syncing' : 'local',
      message: syncSettings.autoSync ? 'Syncing with PomoBot...' : 'Saved locally. Auto-sync is off.'
    });

    if (syncSettings.autoSync) {
      void syncCompletedSession(session, minutes, title, currentSubject);
    } else {
      setSyncState({ status: 'off', message: 'Auto-sync is off. The session was saved locally only.' });
    }
  }

  function recordRecentSession(session: RecentSession) {
    setRecentSessions(current => [
      session,
      ...current.filter(item => item.id !== session.id)
    ].slice(0, MAX_RECENT_SESSIONS));
  }

  function updateRecentSession(id: string, syncStatus: RecentSession['syncStatus'], message: string) {
    setRecentSessions(current => current.map(session => (
      session.id === id ? { ...session, syncStatus, message } : session
    )));
  }

  function retryRecentSession(session: RecentSession) {
    updateRecentSession(session.id, 'syncing', 'Retrying sync...');
    void syncCompletedSession(
      { id: session.id, startedAt: session.startedAt },
      session.minutes,
      session.title,
      session.subject
    );
  }

  function confirmIdleSession() {
    if (!pendingIdleSession) return;
    creditFocusSession(
      pendingIdleSession.session,
      pendingIdleSession.minutes,
      pendingIdleSession.title,
      pendingIdleSession.subject
    );
    setPendingIdleSession(null);
  }

  function discardIdleSession() {
    setPendingIdleSession(null);
    setSyncState({ status: 'off', message: 'Idle session discarded. No local stats or rewards were added.' });
  }

  function startTimer() {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        setNotificationsEnabled(permission === 'granted');
      });
    }

    if (!activeSession || status === 'ready' || status === 'finished') {
      setActiveSession(createActiveSession());
    }
    if (status === 'finished' || remainingSeconds <= 0) {
      setRemainingSeconds(settings[mode] * 60);
    }
    setStatus('running');
  }

  function pauseTimer() {
    setStatus('paused');
  }

  function resetTimer(targetMode = mode) {
    setMode(targetMode);
    setRemainingSeconds(settings[targetMode] * 60);
    setStatus('ready');
    setActiveSession(null);
  }

  function switchMode(next: TimerMode) {
    resetTimer(next);
  }

  function updateSetting(key: keyof TimerSettings, value: number) {
    const nextValue = clampNumber(value, key === 'focus' ? 5 : 1, 100);
    const nextSettings = { ...settings, [key]: nextValue };
    setSettings(nextSettings);
    if (status !== 'running' && mode === keyToMode(key)) {
      setRemainingSeconds(nextValue * 60);
    }
  }

  async function enableNotifications() {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === 'granted');
    if (permission === 'granted') {
      sendNotification('Notifications enabled', 'Pomo Desktop will remind you when a session ends.');
    }
  }

  async function toggleCompactMode() {
    const nextValue = !compactMode;
    setCompactMode(nextValue);
    const appliedValue = await window.pomoDesktop?.setCompactMode?.(nextValue);
    if (typeof appliedValue === 'boolean') {
      setCompactMode(appliedValue);
    }
  }

  async function toggleStartup(enabled: boolean) {
    setStartupEnabled(enabled);
    const appliedSettings = await window.pomoDesktop?.setStartupSettings?.(enabled);
    if (appliedSettings) {
      setStartupEnabled(Boolean(appliedSettings.openAtLogin));
    }
  }

  function sendNotification(title: string, body: string) {
    if (window.pomoDesktop?.notify) {
      window.pomoDesktop.notify(title, body);
      return;
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }

  async function syncCompletedSession(session: ActiveSession, minutes: number, title: string, currentSubject: string) {
    if (!syncSettings.token.trim()) {
      setSyncState({ status: 'off', message: 'Sync skipped. Add a desktop token first.' });
      updateRecentSession(session.id, 'local', 'Sync skipped. Add a desktop token first.');
      return;
    }

    setSyncState({ status: 'syncing', message: 'Syncing completed session...' });
    updateRecentSession(session.id, 'syncing', 'Syncing with PomoBot...');

    try {
      const response = await fetch(syncSettings.apiUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${syncSettings.token.trim()}`
        },
        body: JSON.stringify({
          clientSessionId: session.id,
          startedAt: session.startedAt,
          minutes,
          title,
          subject: currentSubject
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(describeSyncFailure(response.status, data.error));
      }

      if (data.duplicate) {
        applyConnectedProfile(data.user, data.profile);
        setSyncState({ status: 'duplicate', message: 'This session was already synced.' });
        updateRecentSession(session.id, 'duplicate', 'Already synced earlier.');
        return;
      }

      const reward = data.reward;
      const rewardMessage = `+${reward?.water ?? 0} water, +${reward?.xp ?? 0} XP, streak ${reward?.streak ?? '-'}`;
      applyConnectedProfile(data.user, data.profile);
      setSyncState({
        status: 'synced',
        message: `Synced: ${rewardMessage}`
      });
      updateRecentSession(session.id, 'synced', rewardMessage);
    } catch (error) {
      const message = describeCaughtSyncError(error);
      setSyncState({
        status: 'error',
        message
      });
      updateRecentSession(session.id, 'error', message);
    }
  }

  /** Checks the connection; a fresh deep link passes its token directly because state updates later. */
  async function testSync(override?: { token: string; apiUrl: string }) {
    const token = (override?.token ?? syncSettings.token).trim();
    const apiUrl = (override?.apiUrl ?? syncSettings.apiUrl).trim();
    if (!token) {
      setSyncState({ status: 'error', message: 'Connect with Discord first.' });
      return;
    }

    setSyncState({ status: 'syncing', message: 'Checking your Pomo connection...' });
    try {
      const response = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(describeSyncFailure(response.status, data.error));
      const user = data.user;
      applyConnectedProfile(user, data.profile);
      setSyncState({
        status: 'synced',
        message: `Connected: Lv.${user?.level ?? 1}, ${user?.water ?? 0} water, ${user?.streak ?? 0} streak`
      });
    } catch (error) {
      setSyncState({
        status: 'error',
        message: describeCaughtSyncError(error)
      });
    }
  }

  function applyConnectedProfile(user: any, profile: any) {
    if (!user?.discord_id) return;
    const username = typeof profile?.username === 'string' && profile.username.trim()
      ? profile.username
      : connectedProfile?.username || `User#${String(user.discord_id).slice(-4)}`;
    const avatar = typeof profile?.avatar === 'string' && profile.avatar.trim()
      ? profile.avatar
      : connectedProfile?.avatar || null;

    setConnectedProfile({
      discordId: String(user.discord_id),
      username,
      avatar,
      level: Number(user.level) || 1,
      water: Number(user.water) || 0,
      streak: Number(user.streak) || 0,
      totalFocusMinutes: Number(user.total_focus_minutes) || 0,
      totalSessions: Number(user.total_sessions) || 0
    });
  }

  const ringRadius = 132;
  const ringLength = 2 * Math.PI * ringRadius;
  const isBreak = mode !== 'focus';

  const timerControls = (
    <div className="timer-controls">
      {status === 'running' ? (
        <button className="btn btn-primary btn-lg" onClick={pauseTimer}><Pause size={18} /> Pause</button>
      ) : (
        <button className="btn btn-primary btn-lg" onClick={startTimer}>
          <Play size={18} /> {status === 'paused' ? 'Resume' : status === 'finished' ? 'Again' : 'Start'}
        </button>
      )}
      <button className="btn btn-ghost btn-lg" onClick={() => resetTimer()} title="Reset (R)"><RotateCcw size={18} /></button>
      <button className="btn btn-ghost btn-lg" onClick={toggleCompactMode} title={compactMode ? 'Full window (M)' : 'Mini mode (M)'}>
        {compactMode ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
      </button>
    </div>
  );

  const timerRing = (
    <div className={`timer-ring${isBreak ? ' is-break' : ''}`} aria-label={`${modeLabel} timer`}>
      <svg viewBox="0 0 300 300" aria-hidden="true">
        <circle className="ring-track" cx="150" cy="150" r={ringRadius} />
        <circle
          className="ring-progress"
          cx="150"
          cy="150"
          r={ringRadius}
          strokeDasharray={ringLength}
          strokeDashoffset={ringLength * (1 - progress / 100)}
        />
      </svg>
      <div className="ring-center">
        <span className="ring-mode">{modeMeta[mode].icon} {modeLabel}</span>
        <span className="ring-time">{formatTime(remainingSeconds)}</span>
        <span className={`ring-status status-${status}`}>{statusText(status)}</span>
      </div>
    </div>
  );

  const idleCard = pendingIdleSession && (
    <div className="notice notice-warn">
      <div>
        <strong>Idle Guard paused this session</strong>
        <p>
          Your computer was idle for {formatIdleDuration(pendingIdleSession.idleSeconds)}.
          Credit it only if the focus session was still valid.
        </p>
      </div>
      <div className="notice-actions">
        <button className="btn btn-primary" onClick={confirmIdleSession}>Credit session</button>
        <button className="btn btn-ghost" onClick={discardIdleSession}>Discard</button>
      </div>
    </div>
  );

  if (compactMode) {
    return (
      <main className="mini">
        {timerRing}
        {timerControls}
        {idleCard}
        {status === 'finished' && (
          <button className="btn btn-outline" onClick={() => switchMode(nextMode)}>
            Start {modeMeta[nextMode].label}
          </button>
        )}
      </main>
    );
  }

  const navItems: { id: View; label: string; icon: ReactNode }[] = [
    { id: 'timer', label: 'Timer', icon: <Timer size={18} /> },
    { id: 'history', label: 'History', icon: <History size={18} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
    { id: 'account', label: 'Account', icon: <UserRound size={18} /> }
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={logoUrl} alt="" />
          <span>Pomo <em>Focus</em></span>
        </div>

        <nav className="nav" aria-label="Sections">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item${view === item.id ? ' active' : ''}`}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
            >
              {item.icon}
              {item.label}
              {item.id === 'timer' && status === 'running' && <span className="nav-live">{formatTime(remainingSeconds)}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          {connectedProfile ? (
            <button className="profile-chip" onClick={() => setView('account')}>
              <Avatar profile={connectedProfile} />
              <span>
                <strong>{connectedProfile.username}</strong>
                <small>Lv.{connectedProfile.level} · {connectedProfile.streak} day streak</small>
              </span>
            </button>
          ) : (
            <a className="btn btn-primary btn-block" href={CONNECT_URL} target="_blank" rel="noreferrer">
              <LogIn size={16} /> Connect Discord
            </a>
          )}
          <div className="sidebar-links">
            {links.map(link => (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
            ))}
          </div>
        </div>
      </aside>

      <main className="content">
        {view === 'timer' && (
          <div className="timer-view">
            <section className="timer-stage">
              <div className="segmented" role="tablist" aria-label="Timer mode">
                {(['focus', 'shortBreak', 'longBreak'] as TimerMode[]).map(item => (
                  <button
                    key={item}
                    role="tab"
                    aria-selected={item === mode}
                    className={item === mode ? 'active' : ''}
                    onClick={() => switchMode(item)}
                    disabled={status === 'running'}
                  >
                    {modeMeta[item].label}
                  </button>
                ))}
              </div>

              {timerRing}

              <div className="session-fields">
                <input
                  value={sessionTitle}
                  onChange={event => setSessionTitle(event.target.value)}
                  placeholder="What are you working on?"
                  disabled={status === 'running'}
                  aria-label="Session title"
                />
                <select value={subject} onChange={event => setSubject(event.target.value)} disabled={status === 'running'} aria-label="Subject">
                  {subjectOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              {timerControls}
              {idleCard}
              {status === 'finished' && (
                <button className="btn btn-outline" onClick={() => switchMode(nextMode)}>
                  Start {modeMeta[nextMode].label}
                </button>
              )}
            </section>

            <aside className="rail">
              <section className="card">
                <h2 className="card-title">Today</h2>
                <div className="stat-grid">
                  <Stat label="Focus" value={formatMinutes(stats.focusMinutes)} />
                  <Stat label="Sessions" value={String(stats.sessions)} />
                  {connectedProfile && <Stat label="Streak" value={`${connectedProfile.streak}d`} />}
                  {connectedProfile && <Stat label="Water" value={String(connectedProfile.water)} />}
                </div>
                <p className="muted small">Up next: {modeMeta[nextMode].label}</p>
              </section>

              <section className="card">
                <div className="card-head">
                  <h2 className="card-title">Recent</h2>
                  {recentSessions.length > 0 && (
                    <button className="link-button" onClick={() => setView('history')}>See all</button>
                  )}
                </div>
                {recentSessions.length > 0 ? (
                  <ul className="mini-list">
                    {recentSessions.slice(0, 4).map(session => (
                      <li key={session.id}>
                        <span className={`dot dot-${session.syncStatus}`} aria-hidden="true" />
                        <span className="mini-title">{session.title}</span>
                        <span className="muted">{session.minutes}m</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">Finished focus sessions show up here.</p>
                )}
              </section>

              <section className={`card sync-line sync-${syncState.status}`}>
                {isConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
                <span>{isConnected ? syncMessage : 'Not connected. Sessions are saved on this computer only.'}</span>
              </section>
            </aside>
          </div>
        )}

        {view === 'history' && (
          <div className="page">
            <PageHeader title="History" subtitle="Your last focus sessions on this computer and whether they reached your Pomo profile." />
            {recentSessions.length > 0 ? (
              <div className="card list-card">
                {recentSessions.map(session => (
                  <article key={session.id} className="history-row">
                    <div className="history-main">
                      <strong>{session.title}</strong>
                      <span className="muted">
                        {session.minutes}m · {subjectLabel(session.subject)} · {formatSessionTime(session.completedAt)}
                      </span>
                    </div>
                    <span className={`badge badge-${session.syncStatus}`}>{session.message}</span>
                    {session.syncStatus !== 'synced' && session.syncStatus !== 'duplicate' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => retryRecentSession(session)}>Retry</button>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState icon={<Clock3 size={22} />} text="No sessions yet. Start a focus session and it will appear here." />
            )}
          </div>
        )}

        {view === 'settings' && (
          <div className="page">
            <PageHeader title="Settings" subtitle="Timer lengths and how Pomo behaves on this computer." />

            <section className="card">
              <h2 className="card-title">Timer</h2>
              <NumberSetting label="Focus" value={settings.focus} onChange={value => updateSetting('focus', value)} />
              <NumberSetting label="Short break" value={settings.shortBreak} onChange={value => updateSetting('shortBreak', value)} />
              <NumberSetting label="Long break" value={settings.longBreak} onChange={value => updateSetting('longBreak', value)} />
            </section>

            <section className="card">
              <h2 className="card-title">Behaviour</h2>
              <SettingRow
                icon={<Bell size={18} />}
                title="Notifications"
                body={notificationsEnabled ? 'On. Pomo tells you when a session ends.' : 'Get a reminder when a session ends.'}
              >
                <button className="btn btn-ghost btn-sm" onClick={enableNotifications}>
                  {notificationsEnabled ? 'Send test' : 'Enable'}
                </button>
              </SettingRow>
              <SettingRow
                icon={<Power size={18} />}
                title="Launch on startup"
                body="Keep Pomo ready in the tray when your computer starts."
              >
                <Switch checked={startupEnabled} onChange={value => void toggleStartup(value)} label="Launch on startup" />
              </SettingRow>
              <SettingRow
                icon={<ShieldAlert size={18} />}
                title="Idle Guard"
                body="Ask before counting a session if the computer was idle for 15 minutes or more."
              >
                <Switch checked={idleGuardEnabled} onChange={setIdleGuardEnabled} label="Idle Guard" />
              </SettingRow>
              <SettingRow
                icon={<Clock3 size={18} />}
                title="Tray"
                body="Closing the window keeps Pomo running in the system tray. Open it again from the tray icon."
              />
            </section>

            <section className="card">
              <h2 className="card-title">Shortcuts</h2>
              <div className="shortcut-list">
                <div><kbd>Space</kbd><span>Start / pause</span></div>
                <div><kbd>R</kbd><span>Reset timer</span></div>
                <div><kbd>M</kbd><span>Mini mode</span></div>
              </div>
            </section>
          </div>
        )}

        {view === 'account' && (
          <div className="page">
            <PageHeader title="Account" subtitle="Link the app to Pomo on Discord so desktop sessions earn water, XP and streak days." />

            {connectedProfile ? (
              <section className="card profile-card">
                <Avatar profile={connectedProfile} large />
                <div>
                  <h2>{connectedProfile.username}</h2>
                  <p className="muted">Level {connectedProfile.level}</p>
                </div>
                <div className="stat-grid wide">
                  <Stat label="Streak" value={`${connectedProfile.streak}d`} />
                  <Stat label="Water" value={String(connectedProfile.water)} />
                  <Stat label="Focus total" value={formatMinutes(connectedProfile.totalFocusMinutes)} />
                  <Stat label="Sessions" value={String(connectedProfile.totalSessions)} />
                </div>
              </section>
            ) : (
              <section className="card connect-card">
                <h2 className="card-title">Connect with Discord</h2>
                <ol className="connect-steps">
                  <li>Press <strong>Connect with Discord</strong> and sign in on the website.</li>
                  <li>Press <strong>Connect</strong> on that page.</li>
                  <li>Allow your browser to open Pomo Focus. Done.</li>
                </ol>
                <p className="muted small">The app never sees your Discord password.</p>
                <a className="btn btn-primary" href={CONNECT_URL} target="_blank" rel="noreferrer">
                  <LogIn size={16} /> Connect with Discord
                </a>
              </section>
            )}

            <section className="card">
              <h2 className="card-title">Sync</h2>
              <SettingRow
                icon={<Wifi size={18} />}
                title="Auto-sync"
                body="Send finished focus sessions to your Pomo profile."
              >
                <Switch
                  checked={syncSettings.autoSync}
                  onChange={value => setSyncSettings(current => ({ ...current, autoSync: value }))}
                  label="Auto-sync"
                />
              </SettingRow>
              <div className={`sync-line sync-${syncState.status}`}>
                {syncState.status === 'synced' || syncState.status === 'duplicate' ? <CheckCircle2 size={16} /> : <KeyRound size={16} />}
                <span>{syncMessage}</span>
              </div>
              <div className="row-actions">
                <button className="btn btn-ghost" onClick={() => testSync()}>
                  {isConnected ? 'Check connection' : 'Test sync'}
                </button>
                {isConnected && (
                  <a className="link-button" href={CONNECT_URL} target="_blank" rel="noreferrer">Connect another account</a>
                )}
              </div>
              <details className="advanced">
                <summary>Advanced: connect manually</summary>
                <label>
                  API URL
                  <input
                    value={syncSettings.apiUrl}
                    onChange={event => setSyncSettings(current => ({ ...current, apiUrl: event.target.value }))}
                  />
                </label>
                <label>
                  Desktop token
                  <input
                    type="password"
                    value={syncSettings.token}
                    onChange={event => setSyncSettings(current => ({ ...current, token: event.target.value }))}
                    placeholder="Paste token from pomofocus.online/dashboard/desktop"
                  />
                </label>
              </details>
            </section>

            {!connectedProfile && (
              <section className="why-grid">
                <Why icon={<Sprout size={18} />} title="Grow your garden" body="Every focus session earns water and XP." />
                <Why icon={<Flame size={18} />} title="Keep your streak" body="Desktop sessions count like /study on Discord." />
                <Why icon={<Gauge size={18} />} title="One set of stats" body="See them in /stats and on the dashboard." />
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Avatar({ profile, large = false }: { profile: ConnectedProfile; large?: boolean }) {
  return profile.avatar ? (
    <img className={`avatar${large ? ' avatar-lg' : ''}`} src={profile.avatar} alt="" />
  ) : (
    <span className={`avatar${large ? ' avatar-lg' : ''}`}>{profile.username.slice(0, 2).toUpperCase()}</span>
  );
}

function SettingRow({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children?: ReactNode }) {
  return (
    <div className="setting-row">
      <span className="setting-icon">{icon}</span>
      <div className="setting-text">
        <strong>{title}</strong>
        <span>{body}</span>
      </div>
      {children && <div className="setting-control">{children}</div>}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="card empty">
      {icon}
      <p>{text}</p>
    </div>
  );
}

function NumberSetting({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="number-setting">
      <span>{label}</span>
      <span className="number-input">
        <input
          type="number"
          min={1}
          max={100}
          value={value}
          onChange={event => onChange(Number(event.target.value))}
        />
        <small>min</small>
      </span>
    </label>
  );
}

function Why({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <article className="why">
      <span className="why-icon">{icon}</span>
      <strong>{title}</strong>
      <p>{body}</p>
    </article>
  );
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function createActiveSession(): ActiveSession {
  const startedAt = new Date().toISOString();
  const randomPart = Math.random().toString(36).slice(2, 10);
  return {
    id: `desktop_${Date.now()}_${randomPart}`,
    startedAt
  };
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const rest = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

function formatIdleDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

function formatSessionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'recently';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function subjectLabel(value: string) {
  return subjectOptions.find(option => option.value === value)?.label || 'General';
}

function describeSyncFailure(status: number, error: unknown) {
  const raw = typeof error === 'string' ? error.trim() : '';
  if (status === 401 || status === 403) {
    return 'Your connection expired. Press "Connect with Discord" to link the app again.';
  }
  if (status === 404) {
    return 'Sync endpoint was not found. Check the API URL.';
  }
  if (status === 409) {
    return raw || 'This session was already synced.';
  }
  if (status >= 500) {
    return 'Pomo server is having trouble. Try syncing again later.';
  }
  return raw || 'Sync failed. Check your token and API URL.';
}

function describeCaughtSyncError(error: unknown) {
  if (!(error instanceof Error)) return 'Could not sync session.';
  const message = error.message.trim();
  if (message === 'Failed to fetch' || message.includes('NetworkError')) {
    return 'Network error. Check your internet connection or API URL.';
  }
  return message || 'Could not sync session.';
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'select' || tagName === 'textarea' || target.isContentEditable;
}

function statusText(status: TimerStatus) {
  if (status === 'running') return 'Running';
  if (status === 'paused') return 'Paused';
  if (status === 'finished') return 'Finished';
  return 'Ready';
}

function keyToMode(key: keyof TimerSettings): TimerMode {
  if (key === 'shortBreak') return 'shortBreak';
  if (key === 'longBreak') return 'longBreak';
  return 'focus';
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadSettings(): TimerSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '');
    return {
      focus: clampNumber(parsed.focus, 5, 100),
      shortBreak: clampNumber(parsed.shortBreak, 1, 100),
      longBreak: clampNumber(parsed.longBreak, 1, 100)
    };
  } catch (_) {
    return DEFAULT_SETTINGS;
  }
}

function loadSyncSettings(): SyncSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_KEY) || '');
    return {
      apiUrl: typeof parsed.apiUrl === 'string' && parsed.apiUrl.trim() ? parsed.apiUrl : DEFAULT_SYNC.apiUrl,
      token: typeof parsed.token === 'string' ? parsed.token : '',
      autoSync: typeof parsed.autoSync === 'boolean' ? parsed.autoSync : true
    };
  } catch (_) {
    return DEFAULT_SYNC;
  }
}

function loadIdleGuardSetting() {
  try {
    const parsed = JSON.parse(localStorage.getItem(IDLE_GUARD_KEY) || '');
    return typeof parsed === 'boolean' ? parsed : true;
  } catch (_) {
    return true;
  }
}

function loadRecentSessions(): RecentSession[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_SESSIONS_KEY) || '');
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(item => typeof item?.id === 'string' && typeof item?.completedAt === 'string')
      .map(item => ({
        id: item.id,
        title: typeof item.title === 'string' && item.title.trim() ? item.title : 'Desktop Focus',
        subject: typeof item.subject === 'string' ? item.subject : 'general',
        minutes: Number(item.minutes) || 0,
        startedAt: typeof item.startedAt === 'string' ? item.startedAt : item.completedAt,
        completedAt: item.completedAt,
        syncStatus: ['syncing', 'synced', 'duplicate', 'local', 'error'].includes(item.syncStatus)
          ? item.syncStatus
          : 'local',
        message: typeof item.message === 'string' && item.message.trim() ? item.message : 'Saved locally.'
      }))
      .slice(0, MAX_RECENT_SESSIONS);
  } catch (_) {
    return [];
  }
}

function loadConnectedProfile(): ConnectedProfile | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY) || '');
    if (!parsed?.discordId) return null;
    return {
      discordId: String(parsed.discordId),
      username: typeof parsed.username === 'string' && parsed.username.trim()
        ? parsed.username
        : `User#${String(parsed.discordId).slice(-4)}`,
      avatar: typeof parsed.avatar === 'string' && parsed.avatar.trim() ? parsed.avatar : null,
      level: Number(parsed.level) || 1,
      water: Number(parsed.water) || 0,
      streak: Number(parsed.streak) || 0,
      totalFocusMinutes: Number(parsed.totalFocusMinutes) || 0,
      totalSessions: Number(parsed.totalSessions) || 0
    };
  } catch (_) {
    return null;
  }
}

function loadDailyStats(): DailyStats {
  try {
    const parsed = JSON.parse(localStorage.getItem(DAILY_STATS_KEY) || '');
    if (parsed.date === todayKey()) {
      return {
        date: parsed.date,
        focusMinutes: Number(parsed.focusMinutes) || 0,
        sessions: Number(parsed.sessions) || 0
      };
    }
  } catch (_) {}

  return {
    date: todayKey(),
    focusMinutes: 0,
    sessions: 0
  };
}
