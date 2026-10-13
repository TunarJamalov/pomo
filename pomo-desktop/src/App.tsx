import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bell,
  CheckCircle2,
  Clock3,
  Coffee,
  ExternalLink,
  Flame,
  Gauge,
  KeyRound,
  Keyboard,
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
  Wifi
} from 'lucide-react';

type TimerMode = 'focus' | 'shortBreak' | 'longBreak';
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
  { label: 'Dashboard', href: 'https://pomofocus.online' },
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
    document.title = 'Pomo Desktop';
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

  return (
    <main className={`app-shell${compactMode ? ' compact-mode' : ''}`}>
      <section className="hero">
        <div className="hero-copy-block">
          <p className="eyebrow">Pomo Desktop</p>
          <h1>Focus without typing a command.</h1>
          <p className="hero-copy">
            Start a focus session in one click and get notified when it ends.
            {isConnected
              ? ' Your sessions count toward your Pomo profile on Discord.'
              : ' Connect your Discord account to earn water, keep your streak and see your stats in Pomo.'}
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={startTimer}>
              <Play size={18} />
              Start Focus
            </button>
            {isConnected ? (
              <a className="secondary-button" href="https://pomofocus.online/dashboard" target="_blank" rel="noreferrer">
                <LogIn size={18} />
                Open Dashboard
              </a>
            ) : (
              <a className="secondary-button" href={CONNECT_URL} target="_blank" rel="noreferrer">
                <LogIn size={18} />
                Connect with Discord
              </a>
            )}
            <button className="secondary-button" onClick={toggleCompactMode}>
              {compactMode ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
              {compactMode ? 'Full Mode' : 'Mini Mode'}
            </button>
          </div>
        </div>

        <div className="timer-panel" aria-label="Focus timer">
          <div className="timer-header">
            <span>{modeMeta[mode].icon} {modeLabel}</span>
            <button className="compact-toggle" onClick={toggleCompactMode}>
              {compactMode ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
              <span>{compactMode ? 'Full' : 'Mini'}</span>
            </button>
          </div>
          <div className={`status-dot status-${status}`}>{statusText(status)}</div>

          <div className="mode-tabs" role="tablist" aria-label="Timer mode">
            {(['focus', 'shortBreak', 'longBreak'] as TimerMode[]).map(item => (
              <button
                key={item}
                className={item === mode ? 'active' : ''}
                onClick={() => switchMode(item)}
                disabled={status === 'running'}
              >
                {modeMeta[item].label}
              </button>
            ))}
          </div>

          <div className="session-fields">
            <input
              value={sessionTitle}
              onChange={event => setSessionTitle(event.target.value)}
              placeholder="Session title"
              disabled={status === 'running'}
            />
            <select value={subject} onChange={event => setSubject(event.target.value)} disabled={status === 'running'}>
              {subjectOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="timer-value">{formatTime(remainingSeconds)}</div>
          <div className="progress-track" aria-hidden="true">
            <div style={{ width: `${progress}%` }} />
          </div>

          <div className="timer-controls">
            {status === 'running' ? (
              <button onClick={pauseTimer}><Pause size={18} /> Pause</button>
            ) : (
              <button onClick={startTimer}><Play size={18} /> {status === 'paused' ? 'Resume' : 'Start'}</button>
            )}
            <button onClick={() => resetTimer()}><RotateCcw size={18} /> Reset</button>
          </div>

          {pendingIdleSession && (
            <div className="idle-guard-card">
              <div>
                <strong>Idle Guard paused this session</strong>
                <p>
                  Your computer was idle for {formatIdleDuration(pendingIdleSession.idleSeconds)}.
                  Credit it only if the focus session was still valid.
                </p>
              </div>
              <div className="idle-guard-actions">
                <button onClick={confirmIdleSession}>Credit Session</button>
                <button onClick={discardIdleSession}>Discard</button>
              </div>
            </div>
          )}

          {status === 'finished' && (
            <button className="next-button" onClick={() => switchMode(nextMode)}>
              Start {modeMeta[nextMode].label}
            </button>
          )}
        </div>
      </section>

      <section className="dashboard-grid" aria-label="Desktop app controls">
        <article className="stats-panel">
          <PanelHeader icon={<Gauge size={18} />} title="Today" />
          <div className="stat-row">
            <span>Focus time</span>
            <strong>{stats.focusMinutes}m</strong>
          </div>
          <div className="stat-row">
            <span>Completed sessions</span>
            <strong>{stats.sessions}</strong>
          </div>
          <div className="stat-row">
            <span>Next suggested mode</span>
            <strong>{modeMeta[nextMode].label}</strong>
          </div>
        </article>

        <article className="settings-panel">
          <PanelHeader icon={<Settings size={18} />} title="Timer Settings" />
          <NumberSetting label="Focus" value={settings.focus} onChange={value => updateSetting('focus', value)} />
          <NumberSetting label="Short break" value={settings.shortBreak} onChange={value => updateSetting('shortBreak', value)} />
          <NumberSetting label="Long break" value={settings.longBreak} onChange={value => updateSetting('longBreak', value)} />
        </article>

        <article className="settings-panel">
          <PanelHeader icon={<Bell size={18} />} title="Notifications" />
          <p className="panel-copy">
            {notificationsEnabled
              ? 'Desktop notifications are enabled.'
              : 'Enable notifications so Pomo Desktop can remind you when a session ends.'}
          </p>
          <button className="wide-button" onClick={enableNotifications}>
            {notificationsEnabled ? 'Send Test Notification' : 'Enable Notifications'}
          </button>
        </article>

        <article className="settings-panel">
          <PanelHeader icon={<Power size={18} />} title="Startup" />
          <p className="panel-copy">
            {startupEnabled
              ? 'Pomo Desktop will open in the tray when you sign in.'
              : 'Keep Pomo ready in the tray when your computer starts.'}
          </p>
          <label className="toggle-row startup-toggle">
            <input
              type="checkbox"
              checked={startupEnabled}
              onChange={event => void toggleStartup(event.target.checked)}
            />
            Launch on startup
          </label>
        </article>

        <article className="settings-panel">
          <PanelHeader icon={<ShieldAlert size={18} />} title="Idle Guard" />
          <p className="panel-copy">
            {idleGuardEnabled
              ? 'Sessions need confirmation if your computer is idle for 15 minutes or more.'
              : 'Idle sessions will be credited without confirmation.'}
          </p>
          <label className="toggle-row startup-toggle">
            <input
              type="checkbox"
              checked={idleGuardEnabled}
              onChange={event => setIdleGuardEnabled(event.target.checked)}
            />
            Confirm long idle sessions
          </label>
        </article>

        <article className="settings-panel">
          <PanelHeader icon={<Keyboard size={18} />} title="Shortcuts" />
          <div className="shortcut-list">
            <div><kbd>Space</kbd><span>Start / Pause</span></div>
            <div><kbd>R</kbd><span>Reset timer</span></div>
            <div><kbd>M</kbd><span>Mini mode</span></div>
          </div>
        </article>
      </section>

      <section className="recent-panel">
        <PanelHeader icon={<Clock3 size={18} />} title="Recent Sessions" />
        {recentSessions.length > 0 ? (
          <div className="recent-list">
            {recentSessions.map(session => (
              <article key={session.id} className="recent-session">
                <div>
                  <strong>{session.title}</strong>
                  <span>{session.minutes}m • {subjectLabel(session.subject)} • {formatSessionTime(session.completedAt)}</span>
                </div>
                <div className="recent-actions">
                  <small className={`recent-status recent-${session.syncStatus}`}>{session.message}</small>
                  {session.syncStatus !== 'synced' && session.syncStatus !== 'duplicate' && (
                    <button onClick={() => retryRecentSession(session)}>Retry</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="panel-copy compact-copy">Completed focus sessions will appear here.</p>
        )}
      </section>

      <section className="tray-panel">
        <div>
          <PanelHeader icon={<Clock3 size={18} />} title="Tray Mode" />
          <p className="panel-copy">
            Closing the desktop window now keeps Pomo running in the system tray. Open it again from the tray icon,
            or use the tray menu to open the dashboard.
          </p>
        </div>
        <div className="tray-preview">
          <strong>{modeLabel}</strong>
          <span>{formatTime(remainingSeconds)}</span>
          <small>{statusText(status)}</small>
        </div>
      </section>

      <section className="sync-panel">
        <div>
          <PanelHeader icon={<Wifi size={18} />} title="Pomo Sync" />
          {isConnected ? (
            <p className="panel-copy">
              Completed focus sessions are sent to your Pomo profile automatically.
            </p>
          ) : (
            <>
              <p className="panel-copy">
                Link this app to your Discord account in three steps. The app never sees your Discord password.
              </p>
              <ol className="connect-steps">
                <li>Press <strong>Connect with Discord</strong> and sign in on the website.</li>
                <li>Press <strong>Connect</strong> on that page.</li>
                <li>Allow your browser to open Pomo Focus. Done!</li>
              </ol>
              <a className="primary-button connect-button" href={CONNECT_URL} target="_blank" rel="noreferrer">
                <LogIn size={18} />
                Connect with Discord
              </a>
            </>
          )}
          {connectedProfile && (
            <div className="profile-preview">
              {connectedProfile.avatar ? (
                <img src={connectedProfile.avatar} alt="" />
              ) : (
                <span>{connectedProfile.username.slice(0, 2).toUpperCase()}</span>
              )}
              <div>
                <strong>{connectedProfile.username}</strong>
                <small>
                  Lv.{connectedProfile.level} • {connectedProfile.water} water • {connectedProfile.streak} streak
                </small>
              </div>
            </div>
          )}
        </div>
        <div className="sync-form">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={syncSettings.autoSync}
              onChange={event => setSyncSettings(current => ({ ...current, autoSync: event.target.checked }))}
            />
            Auto-sync completed focus sessions
          </label>
          <div className={`sync-status sync-${syncState.status}`}>
            {syncState.status === 'synced' || syncState.status === 'duplicate'
              ? <CheckCircle2 size={18} />
              : <KeyRound size={18} />}
            <span>{syncState.message}</span>
          </div>
          <button className="wide-button" onClick={() => testSync()}>
            {isConnected ? 'Check connection' : 'Test Sync'}
          </button>
          {isConnected && (
            <a className="reconnect-link" href={CONNECT_URL} target="_blank" rel="noreferrer">Reconnect another account</a>
          )}
          <details className="advanced-sync">
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
        </div>
      </section>

      <section className="feature-grid" aria-label="Why connect">
        <Feature icon={<Sprout />} title="Grow your garden" body="Every focus session earns water and XP for your Pomo garden and level." />
        <Feature icon={<Flame />} title="Keep your streak" body="Desktop sessions count toward the same streak as /study on Discord." />
        <Feature icon={<Gauge />} title="All your stats in one place" body="See desktop focus time in /stats, your weekly recap and on the dashboard." />
      </section>

      <section className="links-panel">
        <div>
          <h2>Useful Links</h2>
          <p>The desktop app keeps dashboard and support one click away.</p>
        </div>
        <div className="link-list">
          {links.map(link => (
            <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
              {link.label}
              <ExternalLink size={16} />
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

function PanelHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="panel-header">
      <span>{icon}</span>
      <h2>{title}</h2>
    </div>
  );
}

function NumberSetting({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="number-setting">
      <span>{label}</span>
      <input
        type="number"
        min={1}
        max={100}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
      />
      <small>min</small>
    </label>
  );
}

function Feature({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <article className="feature-card">
      <div className="feature-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{body}</p>
    </article>
  );
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
