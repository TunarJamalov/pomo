'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';

const Plants: any = {
  carrot: { name: 'Carrot', emoji: '🥕', waterPerStage: 3 },
  tomato: { name: 'Tomato', emoji: '🍅', waterPerStage: 5 },
  potato: { name: 'Potato', emoji: '🥔', waterPerStage: 8 },
  apple: { name: 'Apple', emoji: '🍎', waterPerStage: 12 },
};

const TIMER_MODES = [
  { key: 'pomodoro', minutes: 25 },
  { key: 'pomodoro50', minutes: 50 },
  { key: 'shortBreak', minutes: 5 },
  { key: 'longBreak', minutes: 15 },
] as const;

const SUBJECT_OPTIONS = [
  { key: 'general', label: 'General' },
  { key: 'math', label: 'Math' },
  { key: 'language', label: 'Language' },
  { key: 'coding', label: 'Coding' },
  { key: 'reading', label: 'Reading' },
  { key: 'exam', label: 'Exam' },
] as const;

const UI_TEXT = {
  en: {
    connecting: 'Connecting to Discord...',
    sessionFinished: 'Session finished. Check Discord for rewards.',
    focusComplete: 'Focus complete',
    plantWatered: 'Plant watered',
    rewardsAdded: 'Rewards added',
    missingVoice: 'Missing Voice Channel context.',
    starting: 'Starting...',
    processing: 'Processing...',
    checkDiscord: 'Check Discord chat!',
    failed: 'Failed',
    connectionError: 'Connection error.',
    pausedLocal: 'Paused locally. Discord timer keeps running.',
    connectionErrorTitle: 'Connection Error',
    sessionRewards: 'Session rewards',
    focusSession: 'Focus Session',
    close: 'Close',
    min: 'Min',
    water: 'Water',
    streak: 'Streak',
    level: 'Level',
    levelUp: 'Level up!',
    openGarden: 'Open Garden',
    focus: 'Focus',
    ambience: 'Ambience',
    settings: 'Settings',
    ambientSounds: 'Ambient Sounds',
    paused: 'Paused',
    background: 'Background',
    myGarden: 'My Garden',
    waterDrops: 'Water Drops',
    gardenEmpty: 'Garden empty. Use /market in Discord.',
    readyToHarvest: 'Ready to Harvest',
    studyingNow: 'studying now',
    solo: 'Solo',
    rooms: 'Rooms',
    voice: 'Voice',
    noActiveSessions: 'No active sessions yet.',
    start: 'Start',
    pause: 'Pause',
    resume: 'Resume',
    reset: 'Reset',
    general: 'General',
    online: 'Online',
    noMessages: 'No messages yet. Say hello!',
    messagePlaceholder: 'Message focus chat...',
    noUsers: 'No users yet.',
    focused: 'focused',
    chat: 'Chat',
    groupStudy: 'Group Study',
    groupStudyBody: 'Study together in this Voice Channel. The host starts a synchronized timer for everyone.',
    createRoom: 'Create Room',
    orJoinRoom: 'OR JOIN ROOM',
    roomCode: 'Room Code',
    join: 'Join',
    help: 'Help',
    guideTitle: 'How Pomo Activity works',
    guideStepTimer: 'Start a focus timer here. Pomo posts and rewards the real session in Discord.',
    guideStepVoice: 'Automatic voice study only works in the server voice channels configured by managers.',
    guideStepExplore: 'Use Chat, Group Study, Ambience, and Garden while you focus.',
    gotIt: 'Got it',
    openChat: 'Open Chat',
    quickStartTitle: 'Start in 10 seconds',
    quickStartSubtitle: 'Pick a timer, press Start, then keep Discord open. Rewards appear in Discord when the focus block ends.',
    quickStartTimer: 'Start a timer here for a solo focus session.',
    quickStartVoice: 'If your server enabled voice tracking, joining the configured study voice channel is enough.',
    quickStartChat: 'Chat is shared with people using this Activity.',
    quickStartGarden: 'Use Garden after sessions to spend Water.',
    startFocusCta: 'Use Timer',
    openGardenCta: 'Open Garden',
    quickStartFocusCta: 'Start 25m Focus',
    quickStartTaskCta: 'Create / Pick a Task',
    quickStartGroupCta: 'Join Group Study',
    quickStartLater: 'Later',
    subject: 'Subject',
    quickStartSubject: 'Pick a subject before starting if you want cleaner stats later.',
    quickStartRewards: 'When the timer ends, Water, XP, streaks, quests, pets, and goals update in Discord.',
    quickStartHelpHint: 'You can reopen this guide from Help anytime.',
    timerHint: 'New here? Press Start. Pomo will create the rewarded session in Discord.',
    todayPlan: 'Today Plan',
    addTaskPlaceholder: 'Add a task...',
    noTasks: 'No tasks yet. Add one and start focusing.',
    focusedToday: 'focused today',
    startTask: 'Start Task',
    selectedTask: 'Selected task',
    clearTask: 'Clear',
    done: 'Done',
    delete: 'Delete',
    chatHint: 'Everyone in this Activity can see this chat.',
    initTimeout: 'Discord did not finish opening the Activity. On mobile, update Discord and reopen the Activity from the voice channel. If it still stays black, try desktop for now.',
    timerModes: {
      pomodoro: 'Pomodoro',
      pomodoro50: '50 Min Focus',
      shortBreak: 'Short Break',
      longBreak: 'Long Break',
    },
  },
  fr: {
    connecting: 'Connexion a Discord...',
    sessionFinished: 'Session terminee. Verifie Discord pour les recompenses.',
    focusComplete: 'Focus termine',
    plantWatered: 'Plante arrosee',
    rewardsAdded: 'Recompenses ajoutees',
    missingVoice: 'Contexte du salon vocal manquant.',
    starting: 'Demarrage...',
    processing: 'Traitement...',
    checkDiscord: 'Verifie le chat Discord !',
    failed: 'Echec',
    connectionError: 'Erreur de connexion.',
    pausedLocal: 'Pause locale. Le timer Discord continue.',
    connectionErrorTitle: 'Erreur de connexion',
    sessionRewards: 'Recompenses de session',
    focusSession: 'Session de focus',
    close: 'Fermer',
    min: 'Min',
    water: 'Eau',
    streak: 'Serie',
    level: 'Niveau',
    levelUp: 'Niveau +!',
    openGarden: 'Ouvrir le jardin',
    focus: 'Focus',
    ambience: 'Ambiance',
    settings: 'Parametres',
    ambientSounds: 'Sons d ambiance',
    paused: 'Pause',
    background: 'Fond',
    myGarden: 'Mon jardin',
    waterDrops: 'Gouttes d eau',
    gardenEmpty: 'Jardin vide. Utilise /market dans Discord.',
    readyToHarvest: 'Pret a recolter',
    studyingNow: 'en etude',
    solo: 'Solo',
    rooms: 'Salles',
    voice: 'Vocal',
    noActiveSessions: 'Aucune session active.',
    start: 'Start',
    pause: 'Pause',
    resume: 'Reprendre',
    reset: 'Reset',
    general: 'General',
    online: 'En ligne',
    noMessages: 'Aucun message. Dis bonjour !',
    messagePlaceholder: 'Message du chat focus...',
    noUsers: 'Aucun utilisateur.',
    focused: 'focus',
    chat: 'Chat',
    groupStudy: 'Etude de groupe',
    groupStudyBody: 'Etudiez ensemble dans ce salon vocal. L hote lance un timer synchronise pour tout le monde.',
    createRoom: 'Creer une room',
    orJoinRoom: 'OU REJOINDRE',
    roomCode: 'Code room',
    join: 'Rejoindre',
    help: 'Aide',
    guideTitle: 'Comment fonctionne Pomo Activity',
    guideStepTimer: 'Lance un timer focus ici. Pomo publie et recompense la vraie session dans Discord.',
    guideStepVoice: 'Le suivi vocal automatique marche seulement dans les salons vocaux configures par les managers.',
    guideStepExplore: 'Utilise Chat, Etude de groupe, Ambiance et Jardin pendant le focus.',
    gotIt: 'Compris',
    openChat: 'Ouvrir le chat',
    quickStartTitle: 'Demarre en 10 secondes',
    quickStartSubtitle: 'Choisis un timer, appuie sur Start, puis garde Discord ouvert. Les recompenses arrivent dans Discord a la fin.',
    quickStartTimer: 'Lance un timer ici pour une session solo.',
    quickStartVoice: 'Si le serveur a active le suivi vocal, rejoindre le salon vocal configure suffit.',
    quickStartChat: 'Ce chat est partage avec les personnes dans cette Activity.',
    quickStartGarden: 'Utilise le Jardin apres les sessions pour depenser ton eau.',
    startFocusCta: 'Voir Timer',
    openGardenCta: 'Ouvrir Jardin',
    quickStartFocusCta: 'Lancer 25m Focus',
    quickStartTaskCta: 'Creer / choisir une tache',
    quickStartGroupCta: 'Etude de groupe',
    quickStartLater: 'Plus tard',
    subject: 'Matiere',
    quickStartSubject: 'Choisis une matiere avant de commencer pour des stats plus propres.',
    quickStartRewards: 'A la fin du timer, eau, XP, serie, quetes, pets et objectifs se mettent a jour dans Discord.',
    quickStartHelpHint: 'Tu peux rouvrir ce guide avec Aide quand tu veux.',
    timerHint: 'Nouveau ? Appuie sur Start. Pomo creera la session recompensee dans Discord.',
    todayPlan: 'Plan du jour',
    addTaskPlaceholder: 'Ajouter une tache...',
    noTasks: 'Aucune tache. Ajoute-en une et lance ton focus.',
    focusedToday: 'focus aujourd hui',
    startTask: 'Lancer la tache',
    selectedTask: 'Tache choisie',
    clearTask: 'Retirer',
    done: 'Fait',
    delete: 'Supprimer',
    chatHint: 'Tous les utilisateurs de cette Activity peuvent voir ce chat.',
    initTimeout: 'Discord n a pas termine l ouverture de l Activity. Sur mobile, mets Discord a jour et rouvre l Activity depuis le salon vocal. Si l ecran reste noir, essaie desktop pour le moment.',
    timerModes: {
      pomodoro: 'Pomodoro',
      pomodoro50: '50 Min Focus',
      shortBreak: 'Pause courte',
      longBreak: 'Pause longue',
    },
  },
  tr: {
    connecting: 'Discord baglaniyor...',
    sessionFinished: 'Oturum bitti. Oduller icin Discordu kontrol et.',
    focusComplete: 'Odak tamamlandi',
    plantWatered: 'Bitki sulandi',
    rewardsAdded: 'Oduller eklendi',
    missingVoice: 'Ses kanali bilgisi eksik.',
    starting: 'Baslatiliyor...',
    processing: 'Isleniyor...',
    checkDiscord: 'Discord sohbetini kontrol et!',
    failed: 'Basarisiz',
    connectionError: 'Baglanti hatasi.',
    pausedLocal: 'Yerel olarak duraklatildi. Discord timer devam ediyor.',
    connectionErrorTitle: 'Baglanti Hatasi',
    sessionRewards: 'Oturum odulleri',
    focusSession: 'Odak Oturumu',
    close: 'Kapat',
    min: 'Dk',
    water: 'Su',
    streak: 'Seri',
    level: 'Seviye',
    levelUp: 'Seviye atlandi!',
    openGarden: 'Bahceyi Ac',
    focus: 'Odak',
    ambience: 'Ambiyans',
    settings: 'Ayarlar',
    ambientSounds: 'Ambiyans Sesleri',
    paused: 'Duraklatildi',
    background: 'Arka Plan',
    myGarden: 'Bahcem',
    waterDrops: 'Su Damlasi',
    gardenEmpty: 'Bahce bos. Discordda /market kullan.',
    readyToHarvest: 'Hasada Hazir',
    studyingNow: 'calisiyor',
    solo: 'Solo',
    rooms: 'Odalar',
    voice: 'Ses',
    noActiveSessions: 'Aktif oturum yok.',
    start: 'Baslat',
    pause: 'Duraklat',
    resume: 'Devam',
    reset: 'Sifirla',
    general: 'Genel',
    online: 'Cevrimici',
    noMessages: 'Henuz mesaj yok. Merhaba de!',
    messagePlaceholder: 'Focus chate mesaj yaz...',
    noUsers: 'Henuz kullanici yok.',
    focused: 'odaklandi',
    chat: 'Chat',
    groupStudy: 'Grup Calisma',
    groupStudyBody: 'Bu ses kanalinda beraber calisin. Host herkes icin senkron timer baslatir.',
    createRoom: 'Room Olustur',
    orJoinRoom: 'YA DA KATIL',
    roomCode: 'Room Kodu',
    join: 'Katıl',
    help: 'Yardim',
    guideTitle: 'Pomo Activity nasil kullanilir',
    guideStepTimer: 'Buradan focus timer baslat. Pomo gercek sessionu Discordda baslatir ve odul verir.',
    guideStepVoice: 'Otomatik voice study sadece yoneticilerin ayarladigi voice kanallarinda calisir.',
    guideStepExplore: 'Odaklanirken Chat, Grup Calisma, Ambiyans ve Bahceyi kullan.',
    gotIt: 'Anladim',
    openChat: 'Chati Ac',
    quickStartTitle: '10 saniyede basla',
    quickStartSubtitle: 'Timer sec, Starta bas, Discordu acik tut. Oduller focus bitince Discorda gelir.',
    quickStartTimer: 'Solo focus icin timeri buradan baslat.',
    quickStartVoice: 'Sunucuda voice tracking aciksa, ayarlanmis study voice kanalina girmek yeterli.',
    quickStartChat: 'Bu chat Activitydeki herkesle paylasilir.',
    quickStartGarden: 'Sessionlardan sonra Water harcamak icin Bahceyi kullan.',
    startFocusCta: 'Timeri Kullan',
    openGardenCta: 'Bahceyi Ac',
    quickStartFocusCta: '25dk Focus Baslat',
    quickStartTaskCta: 'Gorev Olustur / Sec',
    quickStartGroupCta: 'Grup Calismaya Katil',
    quickStartLater: 'Sonra',
    subject: 'Konu',
    quickStartSubject: 'Daha temiz stats icin baslamadan once konu sec.',
    quickStartRewards: 'Timer bitince Water, XP, seri, gorevler, petler ve hedefler Discordda guncellenir.',
    quickStartHelpHint: 'Bu rehberi istedigin zaman Yardimdan tekrar acabilirsin.',
    timerHint: 'Yeni misin? Starta bas. Pomo Discordda odullu session olusturur.',
    todayPlan: 'Bugun Plani',
    addTaskPlaceholder: 'Gorev ekle...',
    noTasks: 'Henuz gorev yok. Bir gorev ekle ve odaklan.',
    focusedToday: 'bugun odak',
    startTask: 'Gorevi Baslat',
    selectedTask: 'Secilen gorev',
    clearTask: 'Temizle',
    done: 'Bitti',
    delete: 'Sil',
    chatHint: 'Bu Activitydeki herkes bu chati gorebilir.',
    initTimeout: 'Discord Activity acilisini tamamlamadi. Mobilde Discordu guncelleyip Activityyi voice kanaldan tekrar ac. Hala siyah ekranda kalirsa simdilik desktop dene.',
    timerModes: {
      pomodoro: 'Pomodoro',
      pomodoro50: '50 Min Focus',
      shortBreak: 'Kisa Mola',
      longBreak: 'Uzun Mola',
    },
  },
  az: {
    connecting: 'Discorda baglanir...',
    sessionFinished: 'Session bitdi. Rewardlar ucun Discorda bax.',
    focusComplete: 'Focus tamamlandi',
    plantWatered: 'Plant sulandi',
    rewardsAdded: 'Rewardlar elave olundu',
    missingVoice: 'Voice channel context yoxdur.',
    starting: 'Baslayir...',
    processing: 'Islenir...',
    checkDiscord: 'Discord chat-a bax!',
    failed: 'Ugursuz',
    connectionError: 'Baglanti xetasi.',
    pausedLocal: 'Lokal pause edildi. Discord timer davam edir.',
    connectionErrorTitle: 'Baglanti Xetasi',
    sessionRewards: 'Session rewardlari',
    focusSession: 'Focus Session',
    close: 'Bagla',
    min: 'Deq',
    water: 'Water',
    streak: 'Streak',
    level: 'Level',
    levelUp: 'Level up!',
    openGarden: 'Garden Ac',
    focus: 'Focus',
    ambience: 'Ambience',
    settings: 'Settings',
    ambientSounds: 'Ambient Sesler',
    paused: 'Paused',
    background: 'Background',
    myGarden: 'My Garden',
    waterDrops: 'Water Drops',
    gardenEmpty: 'Garden bosdur. Discordda /market istifade et.',
    readyToHarvest: 'Harvest ucun hazirdir',
    studyingNow: 'study edir',
    solo: 'Solo',
    rooms: 'Rooms',
    voice: 'Voice',
    noActiveSessions: 'Hele aktiv session yoxdur.',
    start: 'Start',
    pause: 'Pause',
    resume: 'Resume',
    reset: 'Reset',
    general: 'General',
    online: 'Online',
    noMessages: 'Hele mesaj yoxdur. Salam de!',
    messagePlaceholder: 'Focus chat-a mesaj yaz...',
    noUsers: 'Hele istifadeci yoxdur.',
    focused: 'focus',
    chat: 'Chat',
    groupStudy: 'Group Study',
    groupStudyBody: 'Bu Voice Channel-da birlikde study edin. Host hamı ucun synchronized timer basladir.',
    createRoom: 'Room Yarat',
    orJoinRoom: 'VE YA QOSUL',
    roomCode: 'Room Code',
    join: 'Qosul',
    help: 'Help',
    guideTitle: 'Pomo Activity nece isleyir',
    guideStepTimer: 'Buradan focus timer baslat. Pomo real sessionu Discordda yaradib reward verir.',
    guideStepVoice: 'Automatic voice study yalniz server managerlerin ayarladigi voice kanallarda isleyir.',
    guideStepExplore: 'Focus edende Chat, Group Study, Ambience ve Garden hisselerini istifade et.',
    gotIt: 'Aydindir',
    openChat: 'Chat ac',
    quickStartTitle: '10 saniyede basla',
    quickStartSubtitle: 'Timer sec, Start bas, Discord aciq qalsin. Rewardlar focus bitende Discordda gelir.',
    quickStartTimer: 'Solo focus session ucun timeri buradan baslat.',
    quickStartVoice: 'Serverde voice tracking aktivdirse, ayarlanmis study voice kanalina girmek kifayetdir.',
    quickStartChat: 'Bu chat Activityde olan herkesle ortaqdir.',
    quickStartGarden: 'Sessionlardan sonra Water xerclemek ucun Garden istifade et.',
    startFocusCta: 'Timeri Sec',
    openGardenCta: 'Garden Ac',
    quickStartFocusCta: '25m Focus Baslat',
    quickStartTaskCta: 'Task yarat / sec',
    quickStartGroupCta: 'Group Study ac',
    quickStartLater: 'Sonra',
    subject: 'Movzu',
    quickStartSubject: 'Sonra stats daha temiz olsun deye baslamadan movzu sec.',
    quickStartRewards: 'Timer bitende Water, XP, streak, quests, pets ve goals Discordda yenilenir.',
    quickStartHelpHint: 'Bu guide-i istediyin vaxt Help-den yeniden aca bilersen.',
    timerHint: 'Yenisen? Start bas. Pomo Discordda rewardli session yaradacaq.',
    todayPlan: 'Bugunku Plan',
    addTaskPlaceholder: 'Task elave et...',
    noTasks: 'Hele task yoxdur. Birini elave et ve focusa basla.',
    focusedToday: 'bugun focus',
    startTask: 'Taski Baslat',
    selectedTask: 'Secilen task',
    clearTask: 'Sil',
    done: 'Bitdi',
    delete: 'Sil',
    chatHint: 'Bu Activityde olan herkes bu chati gore biler.',
    initTimeout: 'Discord Activity acilma prosesini bitirmedi. Telefonda Discordu update edib Activity-ni voice channeldan yeniden ac. Hele de qara ekranda qalirsa helelik desktopdan yoxla.',
    timerModes: {
      pomodoro: 'Pomodoro',
      pomodoro50: '50 Min Focus',
      shortBreak: 'Short Break',
      longBreak: 'Long Break',
    },
  },
} as const;

type ActivityLanguage = keyof typeof UI_TEXT;
type SubjectKey = typeof SUBJECT_OPTIONS[number]['key'];

function getBrowserLanguage(): ActivityLanguage {
  if (typeof window === 'undefined') return 'en';
  const language = navigator.language.split('-')[0] as ActivityLanguage;
  return UI_TEXT[language] ? language : 'en';
}

interface ChatMessage {
  id: number;
  user_id: string;
  username: string;
  avatar: string | null;
  level: number;
  message: string;
  created_at: string;
}

interface LeaderboardUser {
  discord_id: string;
  username: string;
  avatar: string | null;
  level: number;
  xp: number;
  total_focus_minutes: number;
}

interface LiveSession {
  kind: 'solo' | 'team' | 'voice';
  user_id: string;
  username: string;
  avatar: string | null;
  level: number;
  title: string;
  duration: number | null;
  started_at: string;
  members: number;
}

interface LiveActivity {
  total: number;
  counts: {
    solo: number;
    teams: number;
    voice: number;
  };
  sessions: LiveSession[];
}

interface ActivityReward {
  id: number;
  source_type: string;
  title: string;
  minutes: number;
  water: number;
  xp: number;
  streak: number;
  level: number;
  leveled_up: number;
  created_at: string;
}

interface ActivityTodo {
  id: number;
  content: string;
  completed: number;
  focus_minutes: number;
  created_at: string;
  completed_at: string | null;
}

function levelColor(level: number) {
  if (level >= 50) return '#f59e0b';  // gold
  if (level >= 20) return '#8b5cf6';  // purple
  if (level >= 10) return '#3b82f6';  // blue
  return '#22c55e';                   // green
}

function avatarUrl(userId: string, avatar: string | null) {
  if (avatar) return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.webp?size=64`;
  // Simple deterministic index without BigInt (ES2020 not required)
  const idx = userId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 6;
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr + 'Z');
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatFocusMinutes(minutes: number) {
  if (!minutes || minutes < 60) return `${minutes || 0}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function minutesSince(dateStr: string) {
  const started = new Date(dateStr + 'Z').getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((Date.now() - started) / 60000));
}

function displayActivityName(name: string) {
  if (/^\d{12,}$/.test(name)) return `User ${name.slice(-4)}`;
  return name;
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.slice(0, 500),
    };
  }

  return {
    message: String(error),
  };
}

function sendActivityDebug(stage: string, data: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;

  const payload = {
    stage,
    href: window.location.href,
    language: navigator.language,
    userAgent: navigator.userAgent,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio,
    },
    ...data,
  };

  fetch('/api/activity/debug', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

export default function ActivityPage() {
  const [uiLanguage, setUiLanguage] = useState<ActivityLanguage>('en');
  const ui = UI_TEXT[uiLanguage] || UI_TEXT.en;
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = ui.connecting;
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('');
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userLevel, setUserLevel] = useState<number>(1);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [activityToken, setActivityToken] = useState<string | null>(null);
  const [garden, setGarden] = useState<any[]>([]);
  const [water, setWater] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [slowLoading, setSlowLoading] = useState<boolean>(false);

  // Timer
  const [modeIndex, setModeIndex] = useState(0);
  const [timerStatus, setTimerStatus] = useState('');
  const [timerStarting, setTimerStarting] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(TIMER_MODES[0].minutes * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSynced, setTimerSynced] = useState(false);
  const [celebration, setCelebration] = useState('');
  const [rewardSummary, setRewardSummary] = useState<ActivityReward | null>(null);

  // UI panels
  const [groupStudyOpen, setGroupStudyOpen] = useState(false);
  const [gardenOpen, setGardenOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // Music Player
  const [activeTrack, setActiveTrack] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const TRACKS = [
    { id: 'lofi', src: '/audio/lofi.mp3', label: 'Lofi Beats', emoji: '🎧' },
    { id: 'rain', src: '/audio/rain.mp3', label: 'Rain', emoji: '🌧️' },
    { id: 'cafe', src: '/audio/cafe.mp3', label: 'Cafe', emoji: '☕' },
    { id: 'forest', src: '/audio/forest.mp3', label: 'Forest', emoji: '🌲' },
    { id: 'ocean', src: '/audio/ocean.mp3', label: 'Ocean Waves', emoji: '🌊' },
  ];

  const BACKGROUNDS = [
    { id: 'bg1', src: '/backgrounds/bg1.jpg', label: 'Scene 1' },
    { id: 'bg2', src: '/backgrounds/bg2.jpg', label: 'Scene 2' },
    { id: 'bg3', src: '/backgrounds/bg3.jpg', label: 'Scene 3' },
    { id: 'bg4', src: '/backgrounds/bg4.jpg', label: 'Scene 4' },
  ];
  const [activeBg, setActiveBg] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('pomo_bg') || 'bg1';
    return 'bg1';
  });
  const bgSrc = BACKGROUNDS.find(b => b.id === activeBg)?.src || BACKGROUNDS[0].src;

  const changeBg = (id: string) => {
    setActiveBg(id);
    localStorage.setItem('pomo_bg', id);
  };

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatTab, setChatTab] = useState<'chat' | 'online'>('chat');
  const [chatSending, setChatSending] = useState(false);
  const [liveActivity, setLiveActivity] = useState<LiveActivity>({
    total: 0,
    counts: { solo: 0, teams: 0, voice: 0 },
    sessions: [],
  });
  const [todos, setTodos] = useState<ActivityTodo[]>([]);
  const [todayFocusMinutes, setTodayFocusMinutes] = useState(0);
  const [selectedTodoId, setSelectedTodoId] = useState<number | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<SubjectKey>('general');
  const [taskInput, setTaskInput] = useState('');
  const [taskBusy, setTaskBusy] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatPollRef = useRef<NodeJS.Timeout | null>(null);
  const livePollRef = useRef<NodeJS.Timeout | null>(null);
  const rewardPollRef = useRef<NodeJS.Timeout | null>(null);
  const statusPollRef = useRef<NodeJS.Timeout | null>(null);
  const setupTimeoutRef = useRef<number | null>(null);
  const sdkSetupStartedRef = useRef(false);
  const lastMessageId = useRef<number>(0);

  const [joinCode, setJoinCode] = useState('');

  const timerMinutes = TIMER_MODES[modeIndex].minutes;
  const timerDisplay = formatDuration(remainingSeconds);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    window.setTimeout(() => {
      chatBottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    }, 60);
  }, []);

  const dismissGuide = () => {
    setShowGuide(false);
    try {
      localStorage.setItem('pomo_activity_guide_seen', '1');
    } catch {}
  };

  useEffect(() => {
    setUiLanguage(getBrowserLanguage());
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    try {
      setShowGuide(localStorage.getItem('pomo_activity_guide_seen') !== '1');
    } catch {
      setShowGuide(true);
    }
  }, [authenticated]);

  useEffect(() => {
    if (!timerRunning) return;

    const interval = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [timerRunning]);


  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 1);
      osc.stop(ctx.currentTime + 1);
    } catch(e) {}
  };


  useEffect(() => {
    if (!timerRunning || remainingSeconds > 0) return;

    setTimerRunning(false);
    setTimerSynced(false);
    setTimerStatus(ui.sessionFinished);
    setCelebration('Focus complete');
    playBeep();
    const timeout = window.setTimeout(() => setTimerStatus(''), 5000);
    const celebrationTimeout = window.setTimeout(() => setCelebration(''), 1800);
    return () => {
      window.clearTimeout(timeout);
      window.clearTimeout(celebrationTimeout);
    };
  }, [remainingSeconds, timerRunning, ui.sessionFinished]);

  const changeTimerMode = (index: number) => {
    if (timerRunning) return;
    setModeIndex(index);
    setRemainingSeconds(TIMER_MODES[index].minutes * 60);
    setTimerSynced(false);
    setTimerStatus('');
  };

  const resetLocalTimer = () => {
    setTimerRunning(false);
    setTimerSynced(false);
    setRemainingSeconds(timerMinutes * 60);
    setTimerStatus('');
  };

  // ── Music Handlers ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const togglePlay = () => {
    if (audioRef.current && activeTrack) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(e => console.error("Audio play failed:", e));
      }
      setIsPlaying(!isPlaying);
    }
  };

  const changeTrack = (id: string) => {
    if (activeTrack === id) {
      togglePlay();
      return;
    }
    setActiveTrack(id);
    setIsPlaying(true);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.play().catch(e => console.error("Audio play failed:", e));
      }
    }, 50);
  };

  // ── Data fetchers ────────────────────────────────────────────────────────────

  const fetchGarden = useCallback(async (uid: string, token = activityToken) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/activity/garden?userId=${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setGarden(data.plots || []);
        setWater(data.water || 0);
      }
    } catch (e) {
      console.error('Garden fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [activityToken]);

  const fetchTodos = useCallback(async (uid: string, token = activityToken) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/activity/todos?userId=${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        const nextTodos = data.todos || [];
        setTodos(nextTodos);
        setTodayFocusMinutes(Number(data.today_focus_minutes || 0));
        if (selectedTodoId && !nextTodos.some((todo: ActivityTodo) => todo.id === selectedTodoId)) {
          setSelectedTodoId(null);
        }
      }
    } catch (e) {
      console.error('Todo fetch error', e);
    }
  }, [activityToken, selectedTodoId]);

  const fetchChat = useCallback(async () => {
    try {
      const res = await fetch('/api/activity/chat');
      const data = await res.json();
      if (res.ok) {
        const sysMsg = {
          id: -1,
          user_id: 'system',
          username: 'System',
          avatar: '',
          level: 99,
          created_at: new Date(Date.now() - 10000000).toISOString(),
          message: '👋 Welcome to PomoFocus! Use the buttons above to manage your timer. Discord bot commands (like /study or /createroom) do NOT work in this chat. If you want to use bot commands, use the normal Discord chat outside the Activity.'
        };
        setChatMessages([sysMsg, ...(data.messages || [])]);
        setLeaderboard(data.leaderboard || []);
        const newest = data.messages?.at(-1);
        if (newest && newest.id > lastMessageId.current) {
          lastMessageId.current = newest.id;
          // scroll to bottom only when new message arrives
          scrollChatToBottom('smooth');
        }
      }
    } catch {/* silent */}
  }, [scrollChatToBottom]);


  const fetchStatus = useCallback(async (token?: string | null) => {
    if (!token) return;
    try {
      const res = await fetch('/api/activity/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.activeSession) {
        if (!timerSynced && data.activeSession.status !== 'waiting') {
           setTimerSynced(true);
           setTimerRunning(true);
           const startedAt = new Date(data.activeSession.started_at + 'Z').getTime();
           const elapsed = (Date.now() - startedAt) / 1000;
           setRemainingSeconds(Math.max(0, data.activeSession.duration * 60 - Math.floor(elapsed)));
        } else if (!timerSynced && data.activeSession.status === 'waiting') {
           setTimerSynced(true);
           setTimerRunning(false);
           setRemainingSeconds(data.activeSession.duration * 60);
        }
      } else {
        if (timerSynced) {
           setTimerSynced(false);
           setTimerRunning(false);
           setRemainingSeconds(TIMER_MODES[0].minutes * 60);
        }
      }
    } catch {/* silent */}
  }, [timerSynced]);

  const fetchLiveActivity = useCallback(async (token?: string | null) => {
    if (!token) return;
    try {
      const res = await fetch('/api/activity/live', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setLiveActivity({
          total: data.total || 0,
          counts: data.counts || { solo: 0, teams: 0, voice: 0 },
          sessions: data.sessions || [],
        });
      }
    } catch {/* silent */}
  }, []);

  const fetchRewards = useCallback(async (token?: string | null) => {
    if (!token) return;
    try {
      const res = await fetch('/api/activity/rewards', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.rewards) || data.rewards.length === 0) return;

      const newest = data.rewards[0] as ActivityReward;
      setRewardSummary(newest);
      setCelebration('Reward ready');

      await fetch('/api/activity/rewards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: data.rewards.map((reward: ActivityReward) => reward.id) }),
      }).catch(() => {});

      if (userId) await fetchTodos(userId, token);
      setTimeout(() => setCelebration(''), 1800);
    } catch {/* silent */}
  }, [fetchTodos, userId]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const sendMessage = async () => {
    const text = chatInput.trim();
    if (!text || !userId || chatSending) return;
    
    if (text.startsWith('/')) {
      setChatMessages(prev => [...prev, {
        id: -Date.now(),
        user_id: 'system',
        username: 'System',
        avatar: '',
        level: 99,
        created_at: new Date().toISOString(),
        message: 'Commands like ' + text.split(' ')[0] + ' do not work in this chat! If you want to start a session, use the timer buttons above. If you want to use bot commands, use the main Discord chat.'
      }]);
      setChatInput('');
      scrollChatToBottom('smooth');
      return;
    }
    
    setChatSending(true);
    setChatInput('');
    try {
      await fetch('/api/activity/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activityToken ? { Authorization: `Bearer ${activityToken}` } : {}),
        },
        body: JSON.stringify({ userId, username, avatar: userAvatar, level: userLevel, message: text }),
      });
      await fetchChat();
      scrollChatToBottom('smooth');
    } catch { /* silent */ }
    finally { setChatSending(false); }
  };

  const addTask = async () => {
    const content = taskInput.trim();
    if (!content || !userId || !activityToken || taskBusy) return;
    setTaskBusy(true);
    try {
      const res = await fetch('/api/activity/todos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activityToken}`,
        },
        body: JSON.stringify({ userId, content }),
      });
      if (res.ok) {
        setTaskInput('');
        dismissGuide();
        await fetchTodos(userId);
      }
    } finally {
      setTaskBusy(false);
    }
  };

  const completeTask = async (todoId: number) => {
    if (!userId || !activityToken || taskBusy) return;
    setTaskBusy(true);
    try {
      await fetch('/api/activity/todos', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activityToken}`,
        },
        body: JSON.stringify({ userId, todoId, completed: true }),
      });
      if (selectedTodoId === todoId) setSelectedTodoId(null);
      await fetchTodos(userId);
    } finally {
      setTaskBusy(false);
    }
  };

  const deleteTask = async (todoId: number) => {
    if (!userId || !activityToken || taskBusy) return;
    setTaskBusy(true);
    try {
      await fetch('/api/activity/todos', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activityToken}`,
        },
        body: JSON.stringify({ userId, todoId }),
      });
      if (selectedTodoId === todoId) setSelectedTodoId(null);
      await fetchTodos(userId);
    } finally {
      setTaskBusy(false);
    }
  };

  const startTimer = async (
    type: 'study' | 'create_team' | 'join_team' = 'study',
    extraData: string | null = null,
    todoId: number | null = selectedTodoId,
    minutesOverride: number = timerMinutes,
    subject: SubjectKey = selectedSubject
  ) => {
    if (!userId || !channelId) {
      setTimerStatus(`❌ ${ui.missingVoice}`);
      setTimeout(() => setTimerStatus(''), 4000);
      return false;
    }
    setTimerStarting(true);
    setTimerStatus(type === 'study' ? `⏳ ${ui.starting}` : `⏳ ${ui.processing}`);
    try {
      const res = await fetch('/api/activity/timer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activityToken ? { Authorization: `Bearer ${activityToken}` } : {}),
        },
        body: JSON.stringify({ userId, channelId, minutes: minutesOverride, type, extra_data: extraData, todoId, subject }),
      });
      const data = await res.json();
      setTimerStatus(res.ok ? `✅ ${ui.checkDiscord}` : `❌ ${data.error || ui.failed}`);
      return res.ok;
    } catch {
      setTimerStatus(`❌ ${ui.connectionError}`);
      return false;
    } finally {
      setTimerStarting(false);
      setTimeout(() => setTimerStatus(''), 5000);
    }
  };

  const handleMainTimer = async () => {
    if (timerRunning) {
      setTimerRunning(false);
      setTimerStatus(ui.pausedLocal);
      setTimeout(() => setTimerStatus(''), 4000);
      return;
    }

    if (timerSynced) {
      setTimerRunning(true);
      setTimerStatus('');
      return;
    }

    const started = await startTimer('study');
    if (!started) return;

    dismissGuide();
    if (userId) await fetchTodos(userId);
    setRemainingSeconds(timerMinutes * 60);
    setTimerRunning(true);
    setTimerSynced(true);
  };

  const handleWater = async (plotId: number) => {
    if (!userId) return;
    try {
      const res = await fetch('/api/activity/garden/water', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activityToken ? { Authorization: `Bearer ${activityToken}` } : {}),
        },
        body: JSON.stringify({ userId, plotId }),
      });
      const data = await res.json();
      if (res.ok) {
        fetchGarden(userId);
        setCelebration('Watered');
        setTimeout(() => setCelebration(''), 1600);
      }
      else alert(data.error);
    } catch (e) { console.error(e); }
  };

  // ── Discord SDK Setup ────────────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sdkSetupStartedRef.current) return;
    sdkSetupStartedRef.current = true;

    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    sendActivityDebug('mount', {
      hasClientId: Boolean(clientId),
      referrer: document.referrer || null,
    });
    if (!clientId) {
      sendActivityDebug('missing_client_id');
      setError('Missing NEXT_PUBLIC_DISCORD_CLIENT_ID');
      return;
    }

    const discordSdk = new DiscordSDK(clientId);
    setupTimeoutRef.current = window.setTimeout(() => {
      sendActivityDebug('slow_loading_timeout');
      setSlowLoading(true);
    }, 20000);

    async function setup() {
      try {
        sendActivityDebug('ready_start');
        await discordSdk.ready();
        sendActivityDebug('ready_ok', {
          channelId: discordSdk.channelId || null,
          guildId: discordSdk.guildId || null,
        });
        sendActivityDebug('authorize_start');
        const { code } = await discordSdk.commands.authorize({
          client_id: clientId as string,
          response_type: 'code',
          state: '',
          prompt: 'none',
          scope: ['identify'],
        });
        sendActivityDebug('authorize_ok', { hasCode: Boolean(code) });
        sendActivityDebug('token_start');
        const tokenRes = await fetch('/api/activity/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const tokenData = await tokenRes.json();
        sendActivityDebug('token_response', {
          ok: tokenRes.ok,
          status: tokenRes.status,
          hasAccessToken: Boolean(tokenData.access_token),
          hasActivityToken: Boolean(tokenData.activity_token),
          error: tokenData.error || null,
        });
        if (!tokenRes.ok || !tokenData.access_token || !tokenData.activity_token) {
          throw new Error(tokenData.error || 'Discord authorization failed');
        }
        sendActivityDebug('authenticate_start');
        const auth = await discordSdk.commands.authenticate({ access_token: tokenData.access_token });
        sendActivityDebug('authenticate_ok', {
          userId: auth.user?.id || null,
          channelId: discordSdk.channelId || null,
          guildId: discordSdk.guildId || null,
        });
        if (setupTimeoutRef.current) {
          window.clearTimeout(setupTimeoutRef.current);
          setupTimeoutRef.current = null;
        }
        setSlowLoading(false);
        setActivityToken(tokenData.activity_token);

        setUserId(auth.user.id);
        setUsername(auth.user.username);
        setUserAvatar(auth.user.avatar ?? null);
        setChannelId(discordSdk.channelId);
        setAuthenticated(true);

        await fetchGarden(auth.user.id, tokenData.activity_token);
        await fetchTodos(auth.user.id, tokenData.activity_token);
        await fetchChat();
        await fetchLiveActivity(tokenData.activity_token);
        await fetchRewards(tokenData.activity_token);

        // Fetch user level from DB
        try {
          const profileRes = await fetch(`/api/activity/garden?userId=${auth.user.id}`, {
            headers: { Authorization: `Bearer ${tokenData.activity_token}` },
          });
          const profileData = await profileRes.json();
          if (profileData.level) setUserLevel(profileData.level);
        } catch { /* ignore */ }
        sendActivityDebug('setup_complete');

      } catch (e: any) {
        sendActivityDebug('setup_error', describeError(e));
        if (setupTimeoutRef.current) {
          window.clearTimeout(setupTimeoutRef.current);
          setupTimeoutRef.current = null;
        }
        setSlowLoading(false);
        setError(e.message || 'Failed to initialize');
        setLoading(false);
      }
    }
    setup();

    return () => {
      if (setupTimeoutRef.current) {
        window.clearTimeout(setupTimeoutRef.current);
        setupTimeoutRef.current = null;
      }
    };
  }, [fetchChat, fetchGarden, fetchLiveActivity, fetchRewards, fetchTodos]);

  // Poll chat every 4 seconds
  useEffect(() => {
    if (!authenticated) return;
    chatPollRef.current = setInterval(fetchChat, 4000);
    return () => { if (chatPollRef.current) clearInterval(chatPollRef.current); };
  }, [authenticated, fetchChat]);

  useEffect(() => {
    if (!authenticated) return;
    livePollRef.current = setInterval(() => fetchLiveActivity(activityToken), 10000);
    return () => { if (livePollRef.current) clearInterval(livePollRef.current); };
  }, [authenticated, activityToken, fetchLiveActivity]);


  useEffect(() => {
    if (!authenticated || !activityToken) return;
    statusPollRef.current = setInterval(() => fetchStatus(activityToken), 5000);
    return () => { if (statusPollRef.current) clearInterval(statusPollRef.current); };
  }, [activityToken, authenticated, fetchStatus]);

  useEffect(() => {
    if (!authenticated || !activityToken) return;
    rewardPollRef.current = setInterval(() => fetchRewards(activityToken), 6000);
    return () => { if (rewardPollRef.current) clearInterval(rewardPollRef.current); };
  }, [activityToken, authenticated, fetchRewards]);

  useEffect(() => {
    if (chatOpen && chatTab === 'chat') {
      scrollChatToBottom('auto');
    }
  }, [chatMessages.length, chatOpen, chatTab, scrollChatToBottom]);

  // ── Loading / Error ──────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex items-center justify-center w-screen h-[100dvh] min-h-[100svh] bg-[#0e0e10] px-4">
        <style>{`nav{display:none!important} html,body{background:#0e0e10!important;}`}</style>
        <div className="bg-red-500/15 border border-red-500/40 px-8 py-6 rounded-2xl text-center max-w-sm">
          <p className="text-red-400 font-bold text-lg mb-1">{ui.connectionErrorTitle}</p>
          <p className="text-gray-300 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!authenticated || loading) {
    return (
      <div className="flex flex-col items-center justify-center w-screen h-[100dvh] min-h-[100svh] bg-[#0e0e10] gap-4 px-4">
        <style>{`nav{display:none!important} html,body{background:#0e0e10!important;}`}</style>
        <div className="w-10 h-10 rounded-full border-4 border-white/20 border-t-white animate-spin" />
        <p className="text-center text-white/60 text-sm">{status}</p>
        {slowLoading && (
          <div className="max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-center">
            <p className="text-sm font-bold text-white">{ui.connectionErrorTitle}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/55">{ui.initTimeout}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-black text-black hover:bg-white/90"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Main UI ──────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-screen h-[100dvh] min-h-[100svh] overflow-hidden select-none">
      <style>{`
        nav { display: none !important; }
        * { box-sizing: border-box; }
        html, body { background: #0e0e10 !important; }
        body { margin: 0; overflow: hidden; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
        @keyframes pomo-pop {
          0% { opacity: 0; transform: translate(-50%, 10px) scale(0.96); }
          15% { opacity: 1; transform: translate(-50%, 0) scale(1); }
          80% { opacity: 1; transform: translate(-50%, 0) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -12px) scale(0.98); }
        }
      `}</style>

      {/* Hidden Audio Element */}
      <audio 
        ref={audioRef} 
        src={activeTrack ? TRACKS.find(t => t.id === activeTrack)?.src : undefined} 
        loop 
      />

      {/* Background */}
      <div className="absolute inset-0 z-0 bg-black">
        <img
          src={bgSrc}
          alt="Background"
          className="w-full h-full object-cover transition-all duration-700"
        />
      </div>
      <div className="absolute inset-0 bg-black/55 z-0" />

      {/* Content */}
      <div className="relative z-10 w-full h-full">
        {celebration && (
          <div className="pointer-events-none absolute left-1/2 top-24 z-30 -translate-x-1/2 animate-[pomo-pop_1.6s_ease-out_forwards] rounded-full border border-white/15 bg-black/55 px-5 py-2 text-sm font-black text-white shadow-2xl">
            {celebration === 'Watered' ? `💧 ${ui.plantWatered}` : celebration === 'Reward ready' ? `🎉 ${ui.rewardsAdded}` : `✨ ${ui.focusComplete}`}
          </div>
        )}

        {rewardSummary && (
          <div className="absolute bottom-24 left-1/2 z-30 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-emerald-300/20 bg-black/70 p-4 text-white shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-300">{ui.sessionRewards}</div>
                <h3 className="truncate text-base font-black">{rewardSummary.title || ui.focusSession}</h3>
              </div>
              <button
                onClick={() => setRewardSummary(null)}
                className="rounded-full bg-white/10 px-2 py-1 text-xs font-bold text-white/60 hover:bg-white/20 hover:text-white"
              >
                {ui.close}
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-xl bg-white/5 px-2 py-2">
                <div className="text-lg font-black">{rewardSummary.minutes}</div>
                <div className="text-[10px] font-bold uppercase text-white/40">{ui.min}</div>
              </div>
              <div className="rounded-xl bg-blue-400/10 px-2 py-2">
                <div className="text-lg font-black text-blue-200">+{rewardSummary.water}</div>
                <div className="text-[10px] font-bold uppercase text-white/40">{ui.water}</div>
              </div>
              <div className="rounded-xl bg-[var(--orange-neon)]/10 px-2 py-2">
                <div className="text-lg font-black text-[var(--orange-neon)]">+{rewardSummary.xp}</div>
                <div className="text-[10px] font-bold uppercase text-white/40">XP</div>
              </div>
              <div className="rounded-xl bg-orange-400/10 px-2 py-2">
                <div className="text-lg font-black text-orange-200">{rewardSummary.streak}</div>
                <div className="text-[10px] font-bold uppercase text-white/40">{ui.streak}</div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-white/60">
              <span>{ui.level} {rewardSummary.level}{rewardSummary.leveled_up ? ` • ${ui.levelUp}` : ''}</span>
              <button
                onClick={() => {
                  setGardenOpen(true);
                  setRewardSummary(null);
                  setFocusMode(false);
                }}
                className="rounded-full bg-emerald-500/20 px-3 py-1.5 font-bold text-emerald-100 hover:bg-emerald-500/30"
              >
                {ui.openGarden}
              </button>
            </div>
          </div>
        )}

        {/* ── TOP RIGHT: Controls ───────────────────────────────────── */}
        {showGuide && !focusMode && (
          <div className="absolute left-1/2 top-3 z-30 max-h-[calc(100vh-1.5rem)] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto rounded-2xl border border-white/10 bg-black/80 p-4 text-white shadow-2xl sm:top-20">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-300">Pomo Activity</div>
                <h2 className="text-lg font-black">{ui.quickStartTitle}</h2>
                <p className="mt-1 text-xs leading-relaxed text-white/55">{ui.quickStartSubtitle}</p>
              </div>
              <button onClick={dismissGuide} className="rounded-full bg-white/10 px-2 py-1 text-xs font-bold text-white/60 hover:bg-white/20 hover:text-white">
                {ui.close}
              </button>
            </div>

            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              {[
                { number: '1', title: ui.startFocusCta, body: ui.guideStepTimer },
                { number: '2', title: ui.subject, body: ui.quickStartSubject },
                { number: '3', title: ui.rewardsAdded, body: ui.quickStartRewards },
              ].map((item) => (
                <div key={item.number} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                  <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-black text-black">
                    {item.number}
                  </div>
                  <div className="text-sm font-black text-white">{item.title}</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/55">{item.body}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <button
                onClick={async () => {
                  if (timerStarting || timerRunning || timerSynced) return;
                  setModeIndex(0);
                  const minutes = TIMER_MODES[0].minutes;
                  const started = await startTimer('study', null, selectedTodoId, minutes);
                  if (!started) return;
                  setRemainingSeconds(minutes * 60);
                  setTimerRunning(true);
                  setTimerSynced(true);
                  dismissGuide();
                }}
                disabled={timerStarting || timerRunning || timerSynced}
                className="min-h-24 rounded-2xl border border-emerald-300/20 bg-emerald-400/15 p-3 text-left transition-colors hover:bg-emerald-400/25 disabled:opacity-50"
              >
                <div className="text-lg">◎</div>
                <div className="mt-1 text-sm font-black text-white">{ui.quickStartFocusCta}</div>
                <p className="mt-1 text-[11px] leading-relaxed text-white/55">{ui.quickStartTimer}</p>
              </button>

              <button
                onClick={() => {
                  setTasksOpen(true);
                  setGardenOpen(false);
                  dismissGuide();
                }}
                className="min-h-24 rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-left transition-colors hover:bg-white/[0.1]"
              >
                <div className="text-lg">✓</div>
                <div className="mt-1 text-sm font-black text-white">{ui.quickStartTaskCta}</div>
                <p className="mt-1 text-[11px] leading-relaxed text-white/55">{ui.todayPlan}</p>
              </button>

              <button
                onClick={() => {
                  setGroupStudyOpen(true);
                  dismissGuide();
                }}
                className="min-h-24 rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-left transition-colors hover:bg-white/[0.1]"
              >
                <div className="text-lg">◉</div>
                <div className="mt-1 text-sm font-black text-white">{ui.quickStartGroupCta}</div>
                <p className="mt-1 text-[11px] leading-relaxed text-white/55">{ui.groupStudyBody}</p>
              </button>
            </div>

            <div className="mt-3 rounded-xl border border-blue-300/15 bg-blue-400/10 px-3 py-2 text-xs leading-relaxed text-blue-100/80">
              <div className="font-black text-blue-100">{ui.voice}</div>
              <div className="mt-0.5">{ui.quickStartVoice}</div>
            </div>

            <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] leading-relaxed text-white/45">
              {ui.quickStartHelpHint}
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => {
                  dismissGuide();
                  setChatOpen(true);
                }}
                className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20"
              >
                {ui.openChat}
              </button>
              <button onClick={dismissGuide} className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20">
                {ui.quickStartLater}
              </button>
            </div>
          </div>
        )}

        <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <button
              onClick={() => setShowGuide(v => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                showGuide ? 'bg-white/15 border-white/20 text-white' : 'bg-black/50 border-white/10 text-white hover:bg-black/70'
              }`}
            >
              ? <span className="hidden sm:inline">{ui.help}</span>
            </button>
            <button
              onClick={() => {
                setFocusMode(v => !v);
                setGardenOpen(false);
                setChatOpen(false);
                setGroupStudyOpen(false);
                setLiveOpen(false);
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                focusMode ? 'bg-emerald-500/20 border-emerald-300/30 text-emerald-100' : 'bg-black/50 border-white/10 text-white hover:bg-black/70'
              }`}
            >
              ◎ <span className="hidden sm:inline">{ui.focus}</span>
            </button>
            <button
              onClick={() => { setMusicOpen(v => !v); setSettingsOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                musicOpen ? 'bg-white/15 border-white/20 text-white' : 'bg-black/50 border-white/10 text-white hover:bg-black/70'
              }`}
            >
              🎵 <span className="hidden sm:inline">{ui.ambience}</span>
              {isPlaying && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse ml-1" />}
            </button>
            <button
              onClick={() => { setSettingsOpen(v => !v); setMusicOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                settingsOpen ? 'bg-white/15 border-white/20 text-white' : 'bg-black/50 border-white/10 text-white hover:bg-black/70'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {ui.settings}
            </button>
          </div>

          {musicOpen && (
            <div className="w-72 max-w-[calc(100vw-2rem)] bg-black/75 border border-white/10 rounded-2xl p-5 shadow-2xl">
              <h3 className="text-white font-bold text-sm mb-4 flex items-center gap-2">🎵 {ui.ambientSounds}</h3>
              
              <div className="flex flex-col gap-2 mb-4">
                {TRACKS.map(track => (
                  <button
                    key={track.id}
                    onClick={() => changeTrack(track.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl transition-all ${
                      activeTrack === track.id ? 'bg-white/20 border border-white/30' : 'bg-white/5 border border-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{track.emoji}</span>
                      <span className="text-sm text-white font-medium">{track.label}</span>
                    </div>
                    {activeTrack === track.id && (
                      <div className="flex items-center gap-1">
                        {isPlaying ? (
                          <div className="w-3 h-3 flex items-end gap-[1px]">
                            <div className="w-1 bg-white h-full animate-pulse" style={{ animationDuration: '0.8s' }} />
                            <div className="w-1 bg-white h-[60%] animate-pulse" style={{ animationDuration: '0.5s', animationDelay: '0.1s' }} />
                            <div className="w-1 bg-white h-[80%] animate-pulse" style={{ animationDuration: '1s', animationDelay: '0.2s' }} />
                          </div>
                        ) : (
                          <span className="text-[10px] text-white/50 uppercase font-bold tracking-wider">{ui.paused}</span>
                        )}
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div className={`pt-3 border-t border-white/10 flex items-center gap-3 transition-opacity ${activeTrack ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                <button onClick={togglePlay} className="p-2 rounded-full bg-white text-black hover:bg-white/90 transition-colors">
                  {isPlaying ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  )}
                </button>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.01" 
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="flex-1 accent-white h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-xs text-white/50 font-medium w-8 text-right">{Math.round(volume * 100)}%</span>
              </div>
            </div>
          )}

          {settingsOpen && (
            <div className="w-72 max-w-[calc(100vw-2rem)] bg-black/75 border border-white/10 rounded-2xl p-5 shadow-2xl">
              <h3 className="text-white font-bold text-sm mb-4 flex items-center gap-2">🖼️ {ui.background}</h3>
              <div className="grid grid-cols-2 gap-3">
                {BACKGROUNDS.map(bg => (
                  <button
                    key={bg.id}
                    onClick={() => changeBg(bg.id)}
                    className={`relative rounded-xl overflow-hidden h-20 border-2 transition-all ${
                      activeBg === bg.id ? 'border-white scale-[1.02]' : 'border-white/10 hover:border-white/40'
                    }`}
                  >
                    <img src={bg.src} alt={bg.label} className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/30 z-0" />
                    <span className="absolute bottom-1.5 left-0 right-0 text-center text-[10px] font-bold text-white z-10">{bg.label}</span>
                    {activeBg === bg.id && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-white rounded-full flex items-center justify-center z-10">
                        <svg className="w-2.5 h-2.5 text-black" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── TOP LEFT: Garden Widget ───────────────────────────────────── */}
        <div className={`${focusMode ? 'hidden' : 'absolute'} top-4 left-4 z-20`}>
          <button
            onClick={() => setGardenOpen(v => !v)}
            className="flex items-center gap-2 bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-white hover:bg-black/70 transition-colors"
          >
            <span>🌱</span>
            <span className="font-semibold">{ui.myGarden}</span>
            <span className="text-blue-300 text-xs">💧 {water}</span>
            <span className="text-white/40 ml-1 text-xs">{gardenOpen ? '▲' : '▼'}</span>
          </button>

          {gardenOpen && (
            <div className="mt-2 w-72 max-w-[calc(100vw-2rem)] bg-black/75 border border-white/10 rounded-2xl p-4 shadow-2xl">
              <div className="flex justify-between items-center mb-3">
                <span className="text-white font-bold text-sm">💧 {water} {ui.waterDrops}</span>
                <button onClick={() => userId && fetchGarden(userId)} className="text-white/40 hover:text-white transition-colors">🔄</button>
              </div>
              {garden.length === 0 ? (
                <p className="text-white/40 text-xs text-center py-4">{ui.gardenEmpty}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {garden.map((plot) => {
                    const meta = Plants[plot.plant_type];
                    if (!meta) return null;
                    const isRipe = plot.stage >= 3;
                    const progress = (plot.water_used % meta.waterPerStage) / meta.waterPerStage * 100;
                    return (
                      <div key={plot.id} className="flex items-center gap-3 bg-white/5 rounded-xl p-2">
                        <img src={`/assets/plant/${plot.plant_type}_stage_${Math.min(plot.stage + 1, 4)}.png`} alt={plot.plant_type} width={36} height={36} />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between">
                            <span className="text-xs text-white font-semibold capitalize">{meta.emoji} {meta.name}</span>
                            <span className="text-[10px] text-white/40">Lv {plot.stage + 1}</span>
                          </div>
                          {isRipe
                            ? <span className="text-[10px] text-green-400 font-bold">✅ {ui.readyToHarvest}</span>
                            : <div className="w-full bg-black/40 h-1.5 rounded-full mt-1 overflow-hidden"><div className="bg-blue-400 h-full rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
                          }
                        </div>
                        <button onClick={() => handleWater(plot.id)} disabled={isRipe || water <= 0} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-30 p-1.5 rounded-lg text-sm transition-colors cursor-pointer">
                          💧
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setTasksOpen(v => !v)}
            className="mt-2 flex items-center gap-2 bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-white hover:bg-black/70 transition-colors"
          >
            <span>✓</span>
            <span className="font-semibold">{ui.todayPlan}</span>
            <span className="text-emerald-300 text-xs">{todos.length}</span>
            <span className="text-white/40 ml-1 text-xs">{tasksOpen ? '▲' : '▼'}</span>
          </button>

          {tasksOpen && (
            <div className="mt-2 w-80 max-w-[calc(100vw-2rem)] bg-black/75 border border-white/10 rounded-2xl p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">{ui.todayPlan}</h3>
                  <p className="text-[10px] font-semibold text-white/45">{formatFocusMinutes(todayFocusMinutes)} {ui.focusedToday}</p>
                </div>
                {selectedTodoId && (
                  <button onClick={() => setSelectedTodoId(null)} className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-white/60 hover:text-white">
                    {ui.clearTask}
                  </button>
                )}
              </div>

              <div className="mb-3 flex gap-2">
                <input
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
                  maxLength={120}
                  placeholder={ui.addTaskPlaceholder}
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
                />
                <button
                  onClick={addTask}
                  disabled={taskBusy || !taskInput.trim()}
                  className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-white/20 disabled:opacity-30"
                >
                  +
                </button>
              </div>

              <div className="max-h-56 overflow-y-auto pr-1">
                {todos.length === 0 ? (
                  <p className="py-6 text-center text-xs text-white/40">{ui.noTasks}</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {todos.map((todo, index) => {
                      const selected = selectedTodoId === todo.id;
                      return (
                        <div key={todo.id} className={`rounded-xl border px-3 py-2 transition-colors ${selected ? 'border-emerald-400/60 bg-emerald-400/10' : 'border-white/10 bg-white/[0.06] hover:bg-white/[0.09]'}`}>
                          <button onClick={() => setSelectedTodoId(todo.id)} className="w-full text-left">
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/55">{index + 1}</span>
                              <div className="min-w-0 flex-1">
                                <p className="break-words text-xs font-bold text-white">{todo.content}</p>
                                <p className="mt-0.5 text-[10px] font-semibold text-white/45">{formatFocusMinutes(todo.focus_minutes || 0)} {ui.focused}</p>
                              </div>
                            </div>
                          </button>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            {selected ? (
                              <button onClick={() => handleMainTimer()} disabled={timerStarting || timerRunning || timerSynced} className="rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-black text-black disabled:opacity-40">
                                {ui.startTask}
                              </button>
                            ) : <span />}
                            <div className="flex gap-1.5">
                              <button onClick={() => completeTask(todo.id)} disabled={taskBusy} className="rounded-lg bg-emerald-500/15 px-2 py-1.5 text-[10px] font-bold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40">
                                {ui.done}
                              </button>
                              <button onClick={() => deleteTask(todo.id)} disabled={taskBusy} className="rounded-lg bg-red-500/15 px-2 py-1.5 text-[10px] font-bold text-red-200 hover:bg-red-500/25 disabled:opacity-40">
                                {ui.delete}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── CENTER: Timer ─────────────────────────────────────────────── */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[clamp(0.75rem,2.5vh,1.5rem)] px-4 pointer-events-none">
          {/* Live Activity */}
          {!focusMode && (
          <div className="relative pointer-events-auto">
            <button
              onClick={() => setLiveOpen(v => !v)}
              className={`flex items-center gap-2 bg-black/45 border border-white/10 rounded-full px-4 py-2 text-sm font-bold text-white shadow-xl transition-colors ${liveOpen ? 'bg-white/15 border-white/20' : 'hover:bg-black/65'}`}
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
              </span>
              <span>{liveActivity.total} {ui.studyingNow}</span>
              <span className="text-white/35 text-xs">{liveOpen ? '▲' : '▼'}</span>
            </button>

            {liveOpen && (
              <div className="absolute bottom-full left-1/2 mb-2 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border border-white/10 bg-black/75 p-2.5 shadow-2xl">
                <div className="mb-2 flex items-center justify-between rounded-xl bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase text-white/45">
                  <span><span className="text-white">{liveActivity.counts.solo || 0}</span> {ui.solo}</span>
                  <span><span className="text-white">{liveActivity.counts.teams || 0}</span> {ui.rooms}</span>
                  <span><span className="text-white">{liveActivity.counts.voice || 0}</span> {ui.voice}</span>
                </div>

                <div className="max-h-28 overflow-y-auto pr-1">
                  {liveActivity.sessions.length === 0 ? (
                    <p className="py-5 text-center text-xs text-white/40">{ui.noActiveSessions}</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {liveActivity.sessions.map((session, index) => (
                        <div key={`${session.kind}-${session.user_id}-${session.started_at}-${index}`} className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-2.5 py-1.5">
                          <img
                            src={avatarUrl(session.user_id, session.avatar)}
                            alt={session.username}
                            className="h-6 w-6 rounded-full"
                            onError={(e) => { (e.target as HTMLImageElement).src = `https://cdn.discordapp.com/embed/avatars/0.png`; }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-xs font-bold text-white">{displayActivityName(session.username)}</span>
                              {session.kind === 'team' && <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">{session.members}p</span>}
                            </div>
                            <p className="truncate text-[10px] text-white/45">{session.title}</p>
                          </div>
                          <span className="text-[10px] font-bold text-white/45">{minutesSince(session.started_at)}m</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          )}

          {/* Mode Tabs */}
          <div className="flex max-w-full bg-black/40 rounded-full border border-white/10 p-1 gap-1 pointer-events-auto">
            {TIMER_MODES.map((mode, i) => (
              <button key={mode.key} onClick={() => changeTimerMode(i)} disabled={timerRunning}
                className={`px-3 sm:px-6 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all disabled:cursor-not-allowed ${modeIndex === i ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80'} ${timerRunning && modeIndex !== i ? 'opacity-40' : ''}`}>
                {ui.timerModes[mode.key]}
              </button>
            ))}
          </div>

          {!timerRunning && !timerSynced && (
            <label className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-2 text-xs font-bold text-white/55">
              <span>{ui.subject}</span>
              <select
                value={selectedSubject}
                onChange={(event) => setSelectedSubject(event.target.value as SubjectKey)}
                className="bg-transparent text-white outline-none"
              >
                {SUBJECT_OPTIONS.map((subject) => (
                  <option key={subject.key} value={subject.key} className="bg-[#111] text-white">
                    {subject.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Clock */}
          <div 
            onClick={() => {
              if (!timerRunning && !timerSynced) {
                const input = window.prompt('Enter minutes (1-400):', Math.floor(remainingSeconds / 60).toString());
                if (input !== null) {
                  const mins = parseInt(input);
                  if (!isNaN(mins) && mins > 0 && mins <= 400) {
                    setRemainingSeconds(mins * 60);
                    setModeIndex(-1); // Clear active mode highlight
                  }
                }
              }
            }}
            title={!timerRunning && !timerSynced ? 'Click to set custom timer' : ''}
            className={`text-[clamp(5rem,13vw,10rem)] font-bold tracking-[0.08em] text-white leading-none drop-shadow-2xl ${!timerRunning && !timerSynced ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
            style={{ textShadow: '0 4px 32px rgba(0,0,0,0.6)' }}>
            {timerDisplay}
          </div>

          {!timerRunning && !timerSynced && (
            <div className="pointer-events-auto max-w-[min(28rem,calc(100vw-2rem))] rounded-full border border-white/10 bg-black/45 px-4 py-2 text-center text-xs font-semibold text-white/70 shadow-xl">
              {ui.timerHint}
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center gap-4 pointer-events-auto">
            <button onClick={handleMainTimer} disabled={timerStarting}
              className="bg-white text-black font-extrabold text-base sm:text-lg px-10 sm:px-14 py-3 sm:py-3.5 rounded-full hover:bg-white/90 active:scale-95 transition-all disabled:opacity-60">
              {timerStarting ? '...' : timerRunning ? ui.pause : timerSynced ? ui.resume : ui.start}
            </button>
            <button onClick={resetLocalTimer} className="bg-black/40 border border-white/15 text-white font-bold text-base sm:text-lg px-7 sm:px-10 py-3 sm:py-3.5 rounded-full hover:bg-white/10 active:scale-95 transition-all">
              {ui.reset}
            </button>
          </div>

          {timerStatus && (
            <div className={`text-sm font-semibold px-4 py-2 rounded-full bg-black/50 pointer-events-none ${timerStatus.includes('❌') ? 'text-red-400' : 'text-green-400'}`}>
              {timerStatus}
            </div>
          )}
        </div>

        {/* ── BOTTOM LEFT: Global Chat ──────────────────────────────────── */}
        <div className={`${focusMode ? 'hidden' : 'absolute'} bottom-4 left-4 z-20 flex flex-col items-start gap-2`}>

          {/* Chat Panel (opens upward) */}
          {chatOpen && (
            <div className="w-80 max-w-[calc(100vw-2rem)] bg-black/70 border border-white/10 rounded-2xl overflow-hidden shadow-2xl mb-2">
              {/* Tabs */}
              <div className="flex border-b border-white/10">
                <button onClick={() => setChatTab('chat')}
                  className={`flex-1 py-2.5 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${chatTab === 'chat' ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white/70'}`}>
                  💬 {ui.general}
                  <span className="bg-white/10 text-white/60 rounded-full px-1.5 text-[10px]">{chatMessages.length}</span>
                </button>
                <button onClick={() => setChatTab('online')}
                  className={`flex-1 py-2.5 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${chatTab === 'online' ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white/70'}`}>
                  👥 {ui.online}
                  <span className="bg-white/10 text-white/60 rounded-full px-1.5 text-[10px]">{leaderboard.length}</span>
                </button>
              </div>

              {/* Chat Messages */}
              {chatTab === 'chat' && (
                <>
                  <div className="h-44 overflow-y-auto p-3 flex flex-col gap-2.5">
                    {chatMessages.length === 0 && (
                      <p className="text-white/30 text-xs text-center mt-8">{ui.noMessages} 👋</p>
                    )}
                    {chatMessages.map((msg) => (
                      <div key={msg.id} className="flex gap-2 items-start rounded-xl px-1.5 py-1 transition-colors hover:bg-white/[0.04]">
                        <img
                          src={avatarUrl(msg.user_id, msg.avatar)}
                          alt={msg.username}
                          className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5"
                          onError={(e) => { (e.target as HTMLImageElement).src = `https://cdn.discordapp.com/embed/avatars/0.png`; }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="max-w-28 truncate text-xs font-bold text-white">{msg.username}</span>
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: `${levelColor(msg.level)}22`, color: levelColor(msg.level), border: `1px solid ${levelColor(msg.level)}44` }}
                            >
                              Lvl {msg.level}
                            </span>
                            <span className="text-[10px] text-white/30">{formatTime(msg.created_at)}</span>
                          </div>
                          <p className="text-xs text-white/80 leading-relaxed break-words mt-0.5">{msg.message}</p>
                        </div>
                      </div>
                    ))}
                    <div ref={chatBottomRef} />
                  </div>
                  <div className="border-t border-white/10 px-3 py-2 text-[10px] font-semibold text-white/35">
                    {ui.chatHint}
                  </div>
                  <div className="border-t border-white/10 p-2 flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
                      maxLength={200}
                      placeholder={ui.messagePlaceholder}
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/30 outline-none focus:border-white/25 transition-colors"
                    />
                    <button onClick={sendMessage} disabled={chatSending || !chatInput.trim()}
                      className="bg-white/10 hover:bg-white/20 disabled:opacity-30 border border-white/10 p-2 rounded-xl transition-colors">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
                      </svg>
                    </button>
                  </div>
                </>
              )}

              {/* Leaderboard */}
              {chatTab === 'online' && (
                <div className="h-52 overflow-y-auto p-3 flex flex-col gap-2">
                  {leaderboard.length === 0 && (
                    <p className="text-white/30 text-xs text-center mt-8">{ui.noUsers}</p>
                  )}
                  {leaderboard.map((user, i) => (
                    <div key={user.discord_id} className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
                      <span className="text-white/40 text-xs font-bold w-4">#{i + 1}</span>
                      <img
                        src={avatarUrl(user.discord_id, user.avatar ?? null)}
                        alt={user.username}
                        className="w-6 h-6 rounded-full"
                        onError={(e) => { (e.target as HTMLImageElement).src = `https://cdn.discordapp.com/embed/avatars/0.png`; }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{user.username}</p>
                        <p className="text-[10px] text-white/40">⏱ {Math.round((user.total_focus_minutes || 0) / 60)}h {ui.focused}</p>
                      </div>
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: `${levelColor(user.level)}22`, color: levelColor(user.level), border: `1px solid ${levelColor(user.level)}44` }}
                      >
                        Lvl {user.level}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Toggle Button */}
          <button
            onClick={() => {
              setChatOpen(v => {
                const next = !v;
                if (next) {
                  fetchChat().then(() => scrollChatToBottom('auto'));
                }
                return next;
              });
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-bold text-sm transition-all shadow-xl border ${chatOpen ? 'bg-white/15 border-white/20 text-white' : 'bg-black/50 border-white/10 text-white hover:bg-black/70'}`}
          >
            <span>💬</span>
            <span>{ui.chat}</span>
            {chatMessages.length > 0 && (
              <span className="bg-white/20 text-white/80 rounded-full px-1.5 text-[10px] font-bold">{chatMessages.length}</span>
            )}
          </button>
        </div>

        {/* ── BOTTOM RIGHT: Group Study ─────────────────────────────────── */}
        <div className={`${focusMode ? 'hidden' : 'absolute'} bottom-4 right-4 z-20 flex flex-col items-end gap-2`}>
          {groupStudyOpen && (
            <div className="w-72 max-w-[calc(100vw-2rem)] bg-black/70 border border-white/10 rounded-2xl p-5 shadow-2xl mb-2">
              <h3 className="font-bold text-white text-base mb-1 flex items-center gap-2">
                👥 {ui.groupStudy}
                <span className="ml-auto text-white/30 text-xs">Beta</span>
              </h3>
              <p className="text-white/50 text-xs leading-relaxed mb-4">
                {ui.groupStudyBody}
              </p>
              
              <button 
                onClick={() => startTimer('create_team')}
                disabled={timerStarting}
                className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold py-2.5 rounded-xl transition-all mb-4 disabled:opacity-50">
                + {ui.createRoom}
              </button>
              
              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[#121212] px-2 text-white/40 font-bold">{ui.orJoinRoom}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder={ui.roomCode} 
                  className="flex-1 min-w-0 bg-black/50 border border-white/10 rounded-xl px-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button 
                  onClick={() => startTimer('join_team', joinCode)}
                  disabled={timerStarting || !joinCode.trim()}
                  className="bg-white/10 hover:bg-white/20 text-white font-bold px-4 py-2 rounded-xl border border-white/10 transition-all active:scale-95 disabled:opacity-50">
                  {ui.join}
                </button>
              </div>
            </div>
          )}
          <button onClick={() => setGroupStudyOpen(v => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-bold text-sm transition-all shadow-xl border ${groupStudyOpen ? 'bg-emerald-600/80 border-emerald-400/30 text-white' : 'bg-black/50 border-white/10 text-white hover:bg-black/70'}`}>
            <span>👥</span>
            <span>{ui.groupStudy}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
