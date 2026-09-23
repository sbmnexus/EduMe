import { useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEYS = {
  onboarding: 'edume_onboarding_complete',
  profile: 'edume_profile',
  tasks: 'edume_tasks',
  goals: 'edume_goals',
  sessions: 'edume_sessions',
  settings: 'edume_settings',
  settingsDefaultsVersion: 'edume_settings_defaults_version',
  notificationLastShown: 'edume_notification_last_shown',
  studyReminderLastShown: 'edume_study_reminder_last_shown',
  theme: 'edume_theme',
  streak: 'edume_streak',
  quizHistory: 'edume_quiz_history',
  xp: 'edume_xp',
  activeTimer: 'edume_active_timer',
  homeStartDismissed: 'edume_home_start_dismissed',
  installPromptDismissedAt: 'edume_install_prompt_dismissed_at',
  referralCode: 'edume_referral_code',
  lastSeenVersion: 'edume_last_seen_version',
};

const APP_VERSION = '1.1';
const NOTIFICATION_COOLDOWN_MS = 30 * 60 * 1000;

const defaultProfile = {
  name: '',
  targetExam: '',
  customExamName: '',
  examDate: '',
  className: '',
  weakSubjects: '',
  dailyStudyHours: '',
};

const defaultSettings = {
  studyReminder: false,
  notificationReminder: false,
  soundEffects: false,
  theme: 'light',
};

const navItems = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'planner', label: 'Planner', icon: '📋' },
  { id: 'quiz', label: 'Quiz', icon: '📝' },
  { id: 'progress', label: 'Progress', icon: '📊' },
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
  { id: 'about', label: 'About', icon: 'ℹ️' },
];

const examSubjects = {
  'JEE MAINS & ADVANCE': ['Physics', 'Chemistry', 'Mathematics'],
  NEET: ['Physics', 'Chemistry', 'Biology'],
  BOARDS: ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'Hindi', 'English'],
  CA: ['Accounting', 'Law', 'Economics', 'Taxation'],
  UPSC: ['History', 'Geography', 'Polity', 'Economics', 'General Science'],
  NDA: ['Mathematics', 'English', 'General Science', 'History', 'Geography'],
  SSC: ['Quantitative Aptitude', 'Reasoning', 'English', 'General Awareness'],
  CUET: ['General Test', 'English', 'General Knowledge', 'Reasoning', 'Mathematics'],
};

const quizExamKeys = {
  'JEE MAINS & ADVANCE': 'JEE',
  NEET: 'NEET',
  BOARDS: 'Board',
  CA: 'CA',
  UPSC: 'UPSC',
  NDA: 'NDA',
  SSC: 'SSC',
  CUET: 'CUET',
};

const SUPPORT_EMAIL = 'sbmplayerzofficial@gmail.com';

function getReferralCode() {
  const storedCode = readStorage(STORAGE_KEYS.referralCode, '');
  if (storedCode) return storedCode;
  const namePart = String(readStorage(STORAGE_KEYS.profile, defaultProfile)?.name || 'STUDENT')
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 5)
    .toUpperCase() || 'STUDENT';
  const code = `${namePart}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  writeStorage(STORAGE_KEYS.referralCode, code);
  return code;
}
const SUPPORT_MAILTO_URL = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('EduMe Support Request')}&body=${encodeURIComponent('Hello EduMe Support,\n\n')}`;

const QUIZ_COMPLETION_XP = 10;
const QUIZ_CORRECT_ANSWER_XP = 5;

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function EduMeLogo({ className = '' }) {
  return <img className={`brand-mark ${className}`.trim()} src={`${import.meta.env.BASE_URL}icon-192.png`} alt="EduMe" />;
}

function makeId(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

function safeJsonParse(value, fallback) {
  if (!value || value === 'undefined' || value === 'null') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return safeJsonParse(raw, fallback);
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

async function showEduMeNotification(title, options) {
  if (typeof window === 'undefined' || !window.Notification || window.Notification.permission !== 'granted') {
    return false;
  }

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
      return true;
    }
  } catch (error) {
    console.error('Service worker notification failed:', error);
  }

  try {
    new window.Notification(title, options);
    return true;
  } catch (error) {
    console.error('Browser notification failed:', error);
    return false;
  }
}

function notificationCooldownPassed(storageKey) {
  const lastShownAt = Number(readStorage(storageKey, 0));
  return !Number.isFinite(lastShownAt) || Date.now() - lastShownAt >= NOTIFICATION_COOLDOWN_MS;
}

function recoverActiveTimer() {
  const storedSessions = readStorage(STORAGE_KEYS.sessions, []);
  const activeTimer = readStorage(STORAGE_KEYS.activeTimer, null);
  if (!activeTimer) return storedSessions;

  const elapsedSeconds = activeTimer.startedAt
    ? Math.max(0, Math.floor((Date.now() - Number(activeTimer.startedAt)) / 1000))
    : 0;
  const durationSeconds = Math.max(0, Number(activeTimer.accumulatedSeconds) || 0) + elapsedSeconds;
  writeStorage(STORAGE_KEYS.activeTimer, null);
  if (durationSeconds < 1) return storedSessions;

  const session = {
    id: activeTimer.id || makeId('session'),
    durationSeconds,
    durationMinutes: durationSeconds / 60,
    dateKey: buildDateKey(new Date(Number(activeTimer.startedAt) || Date.now())),
    createdAt: new Date().toISOString(),
  };
  const nextSessions = [session, ...storedSessions.filter((item) => item.id !== session.id)];
  writeStorage(STORAGE_KEYS.sessions, nextSessions);
  const xpEarned = Math.floor(durationSeconds / 60) * 2;
  writeStorage(STORAGE_KEYS.xp, (Number(readStorage(STORAGE_KEYS.xp, 0)) || 0) + xpEarned);
  return nextSessions;
}

function getInitialUpdateNotice() {
  const savedVersion = readStorage(STORAGE_KEYS.lastSeenVersion, '');
  if (savedVersion === APP_VERSION) return false;
  const isExistingUser = Boolean(readStorage(STORAGE_KEYS.onboarding, false));
  if (!isExistingUser) {
    writeStorage(STORAGE_KEYS.lastSeenVersion, APP_VERSION);
    return false;
  }
  return true;
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function formatShortDate(value) {
  if (!value) return 'No date';
  const d = new Date(value + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTimeDisplay(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((v) => String(v).padStart(2, '0')).join(':');
}

let feedbackAudioContext;

function playFeedbackTone(type = 'tap') {
  try {
    feedbackAudioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const context = feedbackAudioContext;
    if (context.state === 'suspended') context.resume();
    const noteSets = {
      tap: [{ frequency: 560, delay: 0, duration: 0.12 }],
      success: [{ frequency: 660, delay: 0, duration: 0.14 }, { frequency: 880, delay: 0.08, duration: 0.18 }],
      finish: [{ frequency: 660, delay: 0, duration: 0.16 }, { frequency: 784, delay: 0.1, duration: 0.16 }, { frequency: 988, delay: 0.2, duration: 0.28 }],
      error: [{ frequency: 240, delay: 0, duration: 0.16 }],
    };
    const notes = noteSets[type] || noteSets.tap;
    notes.forEach(({ frequency, delay, duration }) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + delay;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    });
  } catch {
    // Audio is optional and can be blocked by browser permissions.
  }
}

function formatHourMinutes(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function buildDateKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isSameDay(a, b) {
  return buildDateKey(a) === buildDateKey(b);
}

function formatDateInput(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

function getCurrentDateKey() {
  return buildDateKey(new Date());
}

function parseDurationToMinutes(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(1, Math.round(numeric));
}

function getTodayTasks(tasks) {
  const key = getCurrentDateKey();
  return tasks.filter((task) => task.date === key);
}

function getDueTasks(tasks) {
  const today = new Date(`${getCurrentDateKey()}T00:00:00`);
  return [...tasks]
    .filter((task) => !task.completed && task.date && new Date(`${task.date}T00:00:00`) <= today)
    .sort((a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`));
}

function getUpcomingTasks(tasks) {
  const now = new Date();
  return [...tasks]
    .filter((task) => new Date(task.date + 'T00:00:00') >= new Date(now.toDateString()))
    .sort((a, b) => new Date(a.date + 'T00:00:00') - new Date(b.date + 'T00:00:00'));
}

function getExamDaysRemaining(examDate) {
  if (!examDate) return null;
  const exam = new Date(`${examDate}T00:00:00`);
  const today = new Date(`${getCurrentDateKey()}T00:00:00`);
  if (Number.isNaN(exam.getTime())) return null;
  return Math.ceil((exam - today) / (1000 * 60 * 60 * 24));
}

function getWeakSubjectNames(value) {
  return String(value || '')
    .split(',')
    .map((subject) => subject.trim().toLowerCase())
    .filter(Boolean);
}

function calculateDailyStudyMinutes(sessions) {
  const today = new Date();
  const dayKey = buildDateKey(today);
  return sessions
    .filter((s) => s.dateKey === dayKey)
    .reduce((sum, s) => sum + (Number(s.durationSeconds) || (Number(s.durationMinutes) || 0) * 60), 0) / 60;
}

function getStudyTrend(sessions) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(today.getDate() - (6 - index));
    return {
      key: buildDateKey(date),
      label: date.toLocaleDateString(undefined, { weekday: 'short' }),
      minutes: 0,
      sessions: 0,
    };
  });
  const byDate = new Map(days.map((day) => [day.key, day]));
  sessions.forEach((session) => {
    const day = byDate.get(session.dateKey);
    if (!day) return;
    day.minutes += (Number(session.durationSeconds) || (Number(session.durationMinutes) || 0) * 60) / 60;
    day.sessions += 1;
  });
  return days;
}

function calculateStreak(tasks, sessions) {
  const qualifyingDays = new Set();
  const minutesByDay = new Map();
  sessions.forEach((session) => {
    if (!session.dateKey) return;
    const seconds = Number(session.durationSeconds) || (Number(session.durationMinutes) || 0) * 60;
    minutesByDay.set(session.dateKey, (minutesByDay.get(session.dateKey) || 0) + (seconds / 60));
  });
  minutesByDay.forEach((minutes, dateKey) => {
    if (minutes >= 10) qualifyingDays.add(dateKey);
  });

  const sortedQualifyingDays = [...qualifyingDays].sort();
  const latestQualifyingDate = sortedQualifyingDays[sortedQualifyingDays.length - 1];
  if (!latestQualifyingDate) return 0;

  const today = new Date(`${getCurrentDateKey()}T00:00:00`);
  const latestDate = new Date(`${latestQualifyingDate}T00:00:00`);
  const daysSinceStudy = Math.floor((today - latestDate) / (1000 * 60 * 60 * 24));
  if (daysSinceStudy > 1) return 0;

  let streak = 0;
  let previousDate = null;
  for (const dateKey of [...qualifyingDays].sort().reverse()) {
    const date = new Date(`${dateKey}T00:00:00`);
    if (previousDate && Math.floor((previousDate - date) / (1000 * 60 * 60 * 24)) > 1) break;
    streak += 1;
    previousDate = date;
  }
  return streak;
}

function getStreakStatus({ streak, todaysMinutes }) {
  if (streak === 0) return 'Ready to restart';
  if (todaysMinutes >= 10) return 'Active today';
  return 'At risk today';
}

function getLevelForXp(xp) {
  const level = Math.floor(xp / 250) + 1;
  const currentLevelXp = xp % 250;
  const nextLevelThreshold = 250;
  return {
    level,
    currentLevelXp,
    nextLevelThreshold,
    progress: Math.min(100, (currentLevelXp / nextLevelThreshold) * 100),
  };
}

function getMotivationalMessage() {
  const messages = [
    '🌟 Every small step counts. Keep going!',
    '💪 You\'re building great study habits today.',
    '🎯 Focus on progress, not perfection.',
    '✨ Your future self will thank you.',
    '📚 Knowledge is the best investment.',
    '🔥 You\'re on fire! Keep the momentum.',
    '🚀 One focused session at a time.',
    '💡 Smart study beats long study.',
    '🏆 You\'ve got this!',
    '⚡ Consistency is the real superpower.',
    '🌱 Small sessions build big results.',
    '🎓 Every page turned is progress.',
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

function getDailyKeepGoingMessage(dateKey) {
  const messages = [
    'Start small today and let your progress build.',
    'One focused session can change the direction of your day.',
    'Keep showing up. Consistency makes the difference.',
    'Your effort today is an investment in your future goals.',
    'Make a little progress now and give yourself momentum.',
    'Stay focused on the next useful step.',
    'You do not need a perfect day to make meaningful progress.',
  ];
  const dayNumber = Math.floor(new Date(`${dateKey}T00:00:00`).getTime() / (1000 * 60 * 60 * 24));
  return messages[((dayNumber % messages.length) + messages.length) % messages.length];
}

function getDailyChallenge(todayTasks, goals, todaysMinutes, profile) {
  const pendingTodayTasks = todayTasks.filter((task) => !task.completed);
  const todayGoalMinutes = Number(profile.dailyStudyHours || 0) * 60;
  const remainingGoalMinutes = Math.max(0, todayGoalMinutes - todaysMinutes);
  
  // Priority logic: pick most important challenge
  if (pendingTodayTasks.length > 0) {
    return {
      title: 'Complete a Pending Task',
      description: `You have ${pendingTodayTasks.length} task${pendingTodayTasks.length === 1 ? '' : 's'} waiting. Pick one and start now.`,
      emoji: '📝',
      actionText: 'View Tasks',
    };
  }
  
  if (remainingGoalMinutes > 0) {
    return {
      title: 'Complete Today\'s Study Goal',
      description: `Study for ${Math.ceil(remainingGoalMinutes)} more minute${Math.ceil(remainingGoalMinutes) === 1 ? '' : 's'} to reach your daily goal.`,
      emoji: '⏱️',
      actionText: 'Start Timer',
    };
  }
  
  if (goals.length === 0) {
    return {
      title: 'Set Your First Study Goal',
      description: 'Create a goal to stay focused and motivated.',
      emoji: '🎯',
      actionText: 'Add Goal',
    };
  }
  
  if (todayTasks.length === 0) {
    return {
      title: 'Plan Tomorrow\'s Tasks',
      description: 'Get ahead by planning your next study session.',
      emoji: '📅',
      actionText: 'Add Task',
    };
  }
  
  return {
    title: 'Great Work Today!',
    description: 'You\'ve completed your study goals. Rest well and prepare for tomorrow.',
    emoji: '✨',
    actionText: 'View Progress',
  };
}

function getGoalsProgress(goals) {
  if (!goals.length) return 0;
  const total = goals.reduce((sum, goal) => sum + Number(goal.progress || 0), 0);
  return Math.round(total / goals.length);
}

function getOverallProgress({ goalAverage, averageAccuracy, taskCompletionRate, studyTimeProgress, hasGoals, hasQuizHistory, hasTasks, hasStudyGoal }) {
  const availableMetrics = [
    hasGoals ? goalAverage : null,
    hasQuizHistory ? averageAccuracy : null,
    hasTasks ? taskCompletionRate : null,
    hasStudyGoal ? studyTimeProgress : null,
  ].filter((value) => value !== null);
  if (!availableMetrics.length) return 0;
  return Math.round(availableMetrics.reduce((sum, value) => sum + value, 0) / availableMetrics.length);
}

function getBadges({ xp, streak, quizHistory, completedTasksCount, sessionCount, goalCount }) {
  return [
    { id: 'first-step', name: '🌱 First Step', unlocked: xp >= 50 },
    { id: 'study-warrior', name: '📚 Study Warrior', unlocked: xp >= 300 },
    { id: 'seven-day', name: '🔥 7 Day Streak', unlocked: streak >= 7 },
    { id: 'goal-crusher', name: '🎯 Goal Crusher', unlocked: completedTasksCount >= 10 },
    { id: 'quiz-master', name: '🏆 Quiz Master', unlocked: quizHistory.length >= 5 },
    { id: 'exam-explorer', name: '🎓 Exam Explorer', unlocked: quizHistory.length >= 10 },
    { id: 'first-focus', name: '⏱️ First Focus', unlocked: sessionCount >= 1 },
    { id: 'goal-setter', name: '📌 Goal Setter', unlocked: goalCount >= 1 },
    { id: 'quiz-ace', name: '⭐ Quiz Ace', unlocked: quizHistory.some((result) => Number(result.accuracy || 0) >= 90) },
    { id: 'thirty-day', name: '🔥 30 Day Streak', unlocked: streak >= 30 },
  ];
}

function getInitialSettings() {
  const storedSettings = readStorage(STORAGE_KEYS.settings, {});
  const settingsDefaultsVersion = readStorage(STORAGE_KEYS.settingsDefaultsVersion, 0);
  if (!settingsDefaultsVersion) {
    writeStorage(STORAGE_KEYS.settingsDefaultsVersion, 1);
    return { ...defaultSettings, theme: storedSettings.theme || defaultSettings.theme };
  }
  return { ...defaultSettings, ...storedSettings };
}

function getInitialProfile() {
  const storedProfile = { ...defaultProfile, ...readStorage(STORAGE_KEYS.profile, defaultProfile) };
  // Migrate old exam names to new ones
  if (storedProfile.targetExam === 'JEE') {
    storedProfile.targetExam = 'JEE MAINS & ADVANCE';
  }
  if (storedProfile.targetExam === 'Board') {
    storedProfile.targetExam = 'BOARDS';
  }
  return storedProfile;
}

function App() {
  const [page, setPage] = useState('home');
  const [showOnboarding, setShowOnboarding] = useState(() => !readStorage(STORAGE_KEYS.onboarding, false));
  const [profile, setProfile] = useState(getInitialProfile);
  const [tasks, setTasks] = useState(() => readStorage(STORAGE_KEYS.tasks, []).map((task) => ({ ...task, xpAwarded: task.xpAwarded ?? Boolean(task.completed) })));
  const [goals, setGoals] = useState(() => readStorage(STORAGE_KEYS.goals, []));
  const [sessions, setSessions] = useState(recoverActiveTimer);
  const [settings, setSettings] = useState(getInitialSettings);
  const [theme, setTheme] = useState(() => {
    const storedTheme = readStorage(STORAGE_KEYS.theme, 'light');
    if (storedTheme === 'aurora' || storedTheme === 'solstice') return 'system';
    return storedTheme === 'autumn' ? 'oak' : storedTheme;
  });
  const [xp, setXp] = useState(() => Number(readStorage(STORAGE_KEYS.xp, 0)) || 0);
  const [quizHistory, setQuizHistory] = useState(() => readStorage(STORAGE_KEYS.quizHistory, []));
  const [questionBank, setQuestionBank] = useState([]);
  const [quizExam, setQuizExam] = useState('');
  const [quizSubject, setQuizSubject] = useState('');
  const [motivationalMessage, setMotivationalMessage] = useState(getMotivationalMessage);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizResult, setQuizResult] = useState(null);
  const [quizHistoryDetail, setQuizHistoryDetail] = useState(null);
  const [showAllQuizHistory, setShowAllQuizHistory] = useState(false);
  const [showProgressBadges, setShowProgressBadges] = useState(false);
  const [quizStep, setQuizStep] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [quizStartedAt, setQuizStartedAt] = useState(null);
  const [toast, setToast] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [plannerModal, setPlannerModal] = useState({ open: false, mode: 'create', task: null, selectedDate: getCurrentDateKey() });
  const [goalModal, setGoalModal] = useState({ open: false, mode: 'create', goal: null });
  const [deleteTaskId, setDeleteTaskId] = useState(null);
  const [deleteGoalId, setDeleteGoalId] = useState(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [developerModalOpen, setDeveloperModalOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [showHomeStart, setShowHomeStart] = useState(() => !readStorage(STORAGE_KEYS.homeStartDismissed, false));
  const [showUpdateNotice, setShowUpdateNotice] = useState(getInitialUpdateNotice);
  const [referralCode] = useState(getReferralCode);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerFinished, setTimerFinished] = useState(false);
  const [focusModeOpen, setFocusModeOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [timerLandscape, setTimerLandscape] = useState(false);
  const [timerOnlyMode, setTimerOnlyMode] = useState(false);
  const [calendarDate, setCalendarDate] = useState(getCurrentDateKey());
  const [selectedNav, setSelectedNav] = useState('home');
  const [currentDateKey, setCurrentDateKey] = useState(getCurrentDateKey());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [utilityReturnPage, setUtilityReturnPage] = useState('home');
  const [utilityHistory, setUtilityHistory] = useState([]);
  const intervalRef = useRef(null);
  const timerStartedAtRef = useRef(null);
  const timerAccumulatedSecondsRef = useRef(0);
  const timerSessionIdRef = useRef(null);
  const focusModeRef = useRef(null);

  const todayTasks = useMemo(() => getTodayTasks(tasks), [tasks]);
  const dueTasks = useMemo(() => getDueTasks(tasks), [tasks, currentDateKey]);
  const upcomingTasks = useMemo(() => getUpcomingTasks(tasks), [tasks]);
  const taskStats = useMemo(() => ({
    total: tasks.length,
    completed: tasks.filter((task) => task.completed).length,
    pending: tasks.filter((task) => !task.completed).length,
    overdue: dueTasks.length,
  }), [tasks, dueTasks]);
  const weakSubjects = useMemo(() => getWeakSubjectNames(profile.weakSubjects), [profile.weakSubjects]);
  const weakSubjectTasks = useMemo(
    () => tasks.filter((task) => !task.completed && weakSubjects.includes(String(task.subject || '').trim().toLowerCase())),
    [tasks, weakSubjects],
  );
  const examDaysRemaining = useMemo(() => getExamDaysRemaining(profile.examDate), [profile.examDate, currentDateKey]);
  const todaysMinutes = useMemo(() => calculateDailyStudyMinutes(sessions), [sessions]);
  const streak = useMemo(() => calculateStreak(tasks, sessions), [tasks, sessions]);
  const streakLevel = streak >= 7 ? 'blazing' : streak >= 4 ? 'on-fire' : streak >= 1 ? 'building' : 'start';
  const activeGoals = useMemo(() => goals.filter((g) => !g.completed), [goals]);
  const completedGoals = useMemo(() => goals.filter((g) => g.completed), [goals]);
  const todayGoalMinutes = Number(profile.dailyStudyHours || 0) * 60;
  const goalProgress = todayGoalMinutes > 0 ? Math.min(100, (todaysMinutes / todayGoalMinutes) * 100) : 0;
  const streakProgress = Math.min(100, (todaysMinutes / 10) * 100);
  const levelInfo = useMemo(() => getLevelForXp(xp), [xp]);
  const badges = useMemo(
    () => getBadges({ xp, streak, quizHistory, completedTasksCount: tasks.filter((task) => task.completed).length, sessionCount: sessions.length, goalCount: goals.length }),
    [xp, streak, quizHistory, tasks, sessions.length, goals.length],
  );
  const weeklySummary = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const items = sessions.filter((session) => {
      const date = new Date(session.createdAt);
      return date >= start && date <= end;
    });
    return { minutes: items.reduce((sum, item) => sum + ((Number(item.durationSeconds) || (Number(item.durationMinutes) || 0) * 60) / 60), 0), sessions: items.length };
  }, [sessions]);
  const monthlySummary = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const items = sessions.filter((session) => {
      const date = new Date(session.createdAt);
      return date >= start && date <= end;
    });
    return { minutes: items.reduce((sum, item) => sum + ((Number(item.durationSeconds) || (Number(item.durationMinutes) || 0) * 60) / 60), 0), sessions: items.length };
  }, [sessions]);

  const filteredSearch = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return { tasks: [], goals: [] };
    return {
      tasks: tasks.filter((task) => `${task.name} ${task.subject} ${task.topic} ${task.notes}`.toLowerCase().includes(query)),
      goals: goals.filter((goal) => `${goal.name} ${goal.description}`.toLowerCase().includes(query)),
    };
  }, [searchQuery, tasks, goals]);

  useEffect(() => {
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.body.setAttribute('data-theme', prefersDark ? 'dark' : 'system-light');
      return;
    }
    document.body.setAttribute('data-theme', theme === 'oak' ? 'autumn' : theme);
  }, [theme]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.profile, profile);
  }, [profile]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener('change', updateViewport);
    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    if (!profile.targetExam) return;
    setQuizExam(profile.targetExam);
    setQuizSubject(examSubjects[profile.targetExam]?.[0] || '');
  }, [profile.targetExam]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.tasks, tasks);
  }, [tasks]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.goals, goals);
  }, [goals]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.sessions, sessions);
  }, [sessions]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.settings, settings);
  }, [settings]);

  useEffect(() => {
    const dayRefresh = setInterval(() => setCurrentDateKey(getCurrentDateKey()), 60 * 1000);
    return () => clearInterval(dayRefresh);
  }, []);

  useEffect(() => {
    const NotificationApi = typeof window !== 'undefined' ? window.Notification : undefined;
    if (!settings.notificationReminder || !NotificationApi || NotificationApi.permission !== 'granted') return undefined;

    const sendReminder = async () => {
      const today = getCurrentDateKey();
      if (!notificationCooldownPassed(STORAGE_KEYS.notificationLastShown)) return;
      const tomorrow = new Date(`${today}T00:00:00`);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowKey = buildDateKey(tomorrow);
      const examNotice = examDaysRemaining !== null && examDaysRemaining >= 0 && examDaysRemaining <= 7
        ? ` Exam in ${examDaysRemaining} day${examDaysRemaining === 1 ? '' : 's'}.`
        : '';
      const tomorrowTask = upcomingTasks.find((task) => !task.completed && task.date === tomorrowKey);
      const upcomingNotice = tomorrowTask ? ` ${tomorrowTask.name} is due tomorrow.` : '';
      if (!dueTasks.length && !examNotice && !upcomingNotice) return;
      const taskNotice = dueTasks.length ? `${dueTasks.length} due study task${dueTasks.length === 1 ? '' : 's'}.` : '';
      
      const shown = await showEduMeNotification('EduMe Notification Reminder', {
        body: `${taskNotice}${upcomingNotice}${examNotice}`,
        icon: '/icon-192.png',
        tag: `edume-notification-reminder-${Date.now()}`,
        renotify: true,
      });
      if (shown) writeStorage(STORAGE_KEYS.notificationLastShown, Date.now());
    };

    sendReminder();
    const reminderInterval = setInterval(sendReminder, 60 * 1000);
    return () => clearInterval(reminderInterval);
  }, [settings.notificationReminder, dueTasks, upcomingTasks, examDaysRemaining]);

  useEffect(() => {
    const NotificationApi = typeof window !== 'undefined' ? window.Notification : undefined;
    if (!settings.studyReminder || !NotificationApi || NotificationApi.permission !== 'granted') return undefined;

    const sendStudyReminder = async () => {
      const today = getCurrentDateKey();
      if (!notificationCooldownPassed(STORAGE_KEYS.studyReminderLastShown)) return;

      const pendingTodayTasks = todayTasks.filter((task) => !task.completed).length;
      const remainingGoalMinutes = Math.max(0, todayGoalMinutes - todaysMinutes);
      const completedGoal = todaysMinutes > 0 && remainingGoalMinutes === 0;
      const completedQuizToday = quizHistory.some((entry) => String(entry.date || '').slice(0, 10) === today);
      const streakAtRisk = todaysMinutes < 10;
      if (!pendingTodayTasks && !remainingGoalMinutes && !completedGoal && completedQuizToday) return;

      const taskMessage = pendingTodayTasks
        ? `${pendingTodayTasks} task${pendingTodayTasks === 1 ? '' : 's'} pending today.`
        : '';
      const goalMessage = remainingGoalMinutes
        ? `${formatTimeDisplay(remainingGoalMinutes * 60)} left to complete today's study goal.`
        : completedGoal ? "Great work! You've completed today's study goal." : '';
      const streakMessage = streakAtRisk
        ? streak ? `Study for 10 minutes to keep your ${streak}-day streak going.` : 'Study for 10 minutes to start your streak.'
        : '';
      const quizMessage = completedQuizToday ? '' : 'Take a quiz today to strengthen your preparation.';
      
      const shown = await showEduMeNotification('EduMe Study Reminder', {
        body: `${taskMessage} ${goalMessage} ${streakMessage} ${quizMessage}`.trim(),
        icon: '/icon-192.png',
        tag: `edume-study-reminder-${Date.now()}`,
        renotify: true,
      });
      if (shown) writeStorage(STORAGE_KEYS.studyReminderLastShown, Date.now());
    };

    sendStudyReminder();
    const reminderInterval = setInterval(sendStudyReminder, 60 * 1000);
    return () => clearInterval(reminderInterval);
  }, [settings.studyReminder, todayTasks, todayGoalMinutes, todaysMinutes, streak, quizHistory]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.theme, theme);
  }, [theme]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.quizHistory, quizHistory);
  }, [quizHistory]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.xp, xp);
  }, [xp]);

  useEffect(() => {
    fetch('/questions.json')
      .then((response) => {
        if (!response.ok) throw new Error('Question bank request failed');
        return response.json();
      })
      .then((questions) => setQuestionBank(Array.isArray(questions) ? questions : []))
      .catch(() => setQuestionBank([]));
  }, []);

  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === 'Escape') {
        closeFocusMode();
        setDeveloperModalOpen(false);
        setPlannerModal((current) => ({ ...current, open: false }));
        setGoalModal((current) => ({ ...current, open: false }));
        setDeleteTaskId(null);
        setDeleteGoalId(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  useEffect(() => {
    const htmlRoot = document.documentElement;
    const bodyRoot = document.body;
    if (htmlRoot) htmlRoot.classList.toggle('fullscreen-focus-active', fullScreen);
    if (bodyRoot) bodyRoot.classList.toggle('fullscreen-focus-active', fullScreen);
    return () => {
      htmlRoot?.classList.remove('fullscreen-focus-active');
      bodyRoot?.classList.remove('fullscreen-focus-active');
    };
  }, [fullScreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && fullScreen) {
        setFullScreen(false);
        setTimerLandscape(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [fullScreen]);

  useEffect(() => {
    if (!fullScreen) return undefined;

    const syncFocusOrientation = () => {
      const orientationType = screen.orientation?.type || '';
      setTimerLandscape(orientationType.includes('landscape') || window.innerWidth > window.innerHeight);
    };

    syncFocusOrientation();
    screen.orientation?.addEventListener?.('change', syncFocusOrientation);
    window.addEventListener('resize', syncFocusOrientation);
    window.addEventListener('orientationchange', syncFocusOrientation);
    return () => {
      screen.orientation?.removeEventListener?.('change', syncFocusOrientation);
      window.removeEventListener('resize', syncFocusOrientation);
      window.removeEventListener('orientationchange', syncFocusOrientation);
    };
  }, [fullScreen]);

  useEffect(() => {
    try {
      screen.orientation?.unlock?.();
    } catch {
      // Orientation unlock is optional and browser-dependent.
    }
  }, []);

  useEffect(() => {
    if (!timerRunning) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    const updateTimer = () => {
      const elapsedSeconds = timerAccumulatedSecondsRef.current
        + Math.max(0, Math.floor((Date.now() - timerStartedAtRef.current) / 1000));
      setTimerSeconds(elapsedSeconds);
      writeStorage(STORAGE_KEYS.activeTimer, {
        id: timerSessionIdRef.current,
        startedAt: timerStartedAtRef.current,
        accumulatedSeconds: timerAccumulatedSecondsRef.current,
      });
    };
    updateTimer();
    intervalRef.current = setInterval(updateTimer, 1000);

    return () => clearInterval(intervalRef.current);
  }, [timerRunning]);

  useEffect(() => {
    const saveActiveTimerOnClose = () => {
      if (!timerSessionIdRef.current || !timerRunning) return;
      writeStorage(STORAGE_KEYS.activeTimer, {
        id: timerSessionIdRef.current,
        startedAt: timerStartedAtRef.current,
        accumulatedSeconds: timerAccumulatedSecondsRef.current,
      });
    };
    window.addEventListener('beforeunload', saveActiveTimerOnClose);
    return () => window.removeEventListener('beforeunload', saveActiveTimerOnClose);
  }, [timerRunning]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!sessionSummary) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sessionSummary]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      if (theme === 'system') {
        document.body.setAttribute('data-theme', media.matches ? 'dark' : 'system-light');
      }
    };
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [theme]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event);
      const dismissedAt = Number(readStorage(STORAGE_KEYS.installPromptDismissedAt, 0));
      const cooldownActive = dismissedAt && Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000;
      setShowInstallPrompt(!cooldownActive);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    const onAppInstalled = () => {
      setDeferredInstallPrompt(null);
      setShowInstallHelp(false);
      setShowInstallPrompt(false);
      triggerToast('✓ EduMe installed successfully');
    };
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const triggerToast = (message) => setToast(message);
  const dismissUpdateNotice = () => {
    writeStorage(STORAGE_KEYS.lastSeenVersion, APP_VERSION);
    setShowUpdateNotice(false);
  };

  const openWhatsNewFromNotice = () => {
    dismissUpdateNotice();
    openUtilityPage('whats-new');
  };

  const playSound = (type = 'tap') => {
    if (settings.soundEffects) playFeedbackTone(type);
  };

  const closeFocusMode = async () => {
    setFocusModeOpen(false);
    setFullScreen(false);
    setTimerLandscape(false);
    setTimerOnlyMode(false);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      if (screen.orientation?.unlock) screen.orientation.unlock();
    } catch (error) {
      console.error('Error exiting focus mode:', error);
    }
  };

  const returnFromFullscreenToFocusMode = () => {
    setFullScreen(false);
    setTimerLandscape(false);
    setTimerOnlyMode(false);
    setFocusModeOpen(true);
  };

  const openFocusMode = async () => {
    setFocusModeOpen(true);
    setFullScreen(false);
    setTimerLandscape(false);
    setTimerOnlyMode(false);
  };

  const openTimerOnlyMode = async () => {
    setFullScreen(true);
    setTimerLandscape(false);
    setTimerOnlyMode(true);
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      screen.orientation?.unlock?.();
    } catch {
      triggerToast('Timer-only fullscreen mode enabled. Rotate your phone for landscape.');
    }
  };

  const openFullScreenMode = async () => {
    await openTimerOnlyMode();
  };

  const rotateFocusMode = async () => {
    try {
      if (!screen.orientation?.lock) throw new Error('Orientation lock is unavailable');
      await screen.orientation.lock('landscape');
      setTimerLandscape(true);
    } catch {
      const nextLandscape = !timerLandscape;
      setTimerLandscape(nextLandscape);
      triggerToast(nextLandscape ? 'Landscape timer mode enabled.' : 'Portrait timer mode enabled.');
    }
  };

  const copySupportEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      triggerToast('✓ Support email copied');
    } catch {
      triggerToast('Copy is unavailable in this browser.');
    }
  };

  const getReferralLink = () => `${window.location.origin}${window.location.pathname}?ref=${encodeURIComponent(referralCode)}`;

  const copyReferralLink = async () => {
    try {
      await navigator.clipboard.writeText(getReferralLink());
      triggerToast('✓ Invite link copied');
    } catch {
      triggerToast('Copy is unavailable in this browser.');
    }
  };

  const shareReferralLink = async () => {
    const link = getReferralLink();
    const inviterName = profile.name?.trim();
    const shareData = {
      title: 'Study smarter with EduMe',
      text: 'Hi! I am using EduMe to plan studies, practice quizzes, and track progress...',
      url: link,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        triggerToast('✓ Invite shared');
      } catch (error) {
        if (error.name !== 'AbortError') triggerToast('Sharing is unavailable right now.');
      }
      return;
    }
    await copyReferralLink();
  };

  const requestNotificationPermission = async () => {
    const NotificationApi = typeof window !== 'undefined' ? window.Notification : undefined;
    if (!NotificationApi) {
      triggerToast('Notifications are not supported in this browser.');
      return false;
    }
    const permission = await Promise.resolve(NotificationApi.requestPermission());
    if (permission !== 'granted') {
      triggerToast('Please allow notifications in browser settings.');
      return false;
    }
    return true;
  };

  const enableNotifications = async () => {
    try {
      if (await requestNotificationPermission()) {
        setSettings((current) => ({ ...current, notificationReminder: true }));
        triggerToast('✓ Notifications enabled');
      }
    } catch (error) {
      console.error('Error enabling notifications:', error);
      triggerToast('Notifications are unavailable in this browser.');
    }
  };

  const toggleStudyReminder = async () => {
    if (settings.studyReminder) {
      setSettings((current) => ({ ...current, studyReminder: false }));
      triggerToast('✓ Study reminders disabled');
      return;
    }
    try {
      const granted = await requestNotificationPermission();
      if (granted) {
        removeStorage(STORAGE_KEYS.studyReminderLastShown);
        setSettings((current) => ({ ...current, studyReminder: true }));
        triggerToast('✓ Study reminders enabled');
      }
    } catch (error) {
      console.error('Error enabling study reminders:', error);
      triggerToast('Error enabling study reminders. Please try again.');
    }
  };

  const toggleReminderNotifications = async () => {
    const reminderEnabled = settings.studyReminder || settings.notificationReminder;

    if (reminderEnabled) {
      setSettings((current) => ({ ...current, studyReminder: false, notificationReminder: false }));
      triggerToast('✓ Reminders disabled');
      return;
    }

    try {
      const granted = await requestNotificationPermission();
      if (granted) {
        removeStorage(STORAGE_KEYS.studyReminderLastShown);
        removeStorage(STORAGE_KEYS.notificationLastShown);
        setSettings((current) => ({ ...current, studyReminder: true, notificationReminder: true }));
        triggerToast('✓ Study & notification reminders enabled');
      }
    } catch (error) {
      console.error('Error enabling reminder notifications:', error);
      triggerToast('Error enabling reminders. Please try again.');
    }
  };

  const openUtilityPage = (utilityPage) => {
    setUtilityHistory((current) => [...current, page]);
    setUtilityReturnPage(page);
    setPage(utilityPage);
  };

  const toggleMobileUtilityPage = (utilityPage) => {
    if (page === utilityPage) {
      closeUtilityPage();
      return;
    }
    openUtilityPage(utilityPage);
  };

  const navigateToPage = (nextPage) => {
    setPage(nextPage);
    if (navItems.some((item) => item.id === nextPage)) {
      setSelectedNav(nextPage);
      setUtilityReturnPage(nextPage);
    }
  };

  const closeUtilityPage = () => {
    const returnPage = utilityHistory[utilityHistory.length - 1] || utilityReturnPage || 'home';
    setUtilityHistory((current) => current.slice(0, -1));
    setPage(returnPage);
    setSelectedNav(navItems.some((item) => item.id === returnPage) ? returnPage : 'home');
    setUtilityReturnPage(utilityHistory[utilityHistory.length - 2] || returnPage);
  };

  const handleInstallPwa = async () => {
    if (!deferredInstallPrompt) {
      setShowInstallHelp(true);
      return;
    }

    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      triggerToast('✓ EduMe installed successfully');
    } else {
      triggerToast('Install was dismissed');
    }
    setDeferredInstallPrompt(null);
    setShowInstallPrompt(false);
  };

  const dismissInstallPrompt = () => {
    writeStorage(STORAGE_KEYS.installPromptDismissedAt, Date.now());
    setShowInstallPrompt(false);
  };

  const openPlannerModal = (task = null, selectedDate = getCurrentDateKey()) => {
    setPlannerModal({ open: true, mode: task ? 'edit' : 'create', task, selectedDate });
  };

  const closePlannerModal = () => setPlannerModal({ open: false, mode: 'create', task: null, selectedDate: getCurrentDateKey() });

  const saveTask = (taskData) => {
    if (!taskData.name?.trim() || !taskData.subject?.trim() || !taskData.date) {
      triggerToast('Please complete the required fields.');
      return;
    }

    if (plannerModal.mode === 'edit' && plannerModal.task) {
      setTasks((current) => current.map((task) => (task.id === plannerModal.task.id ? { ...task, ...taskData } : task)));
      triggerToast('✓ Task Updated Successfully');
    } else {
      setTasks((current) => [{ id: makeId('task'), ...taskData }, ...current]);
      triggerToast('✓ Task Added Successfully');
    }
    closePlannerModal();
  };

  const deleteTask = (taskId) => {
    setTasks((current) => current.filter((task) => task.id !== taskId));
    setDeleteTaskId(null);
    triggerToast('✓ Task Deleted');
  };

  const toggleTaskComplete = (taskId) => {
    let wasCompleted = false;
    let completedNow = false;
    const taskToToggle = tasks.find((task) => task.id === taskId);
    const shouldAwardXp = Boolean(taskToToggle && !taskToToggle.completed && !taskToToggle.xpAwarded);
    setTasks((current) => current.map((task) => {
      if (task.id !== taskId) return task;
      const completed = !task.completed;
      wasCompleted = task.completed;
      completedNow = completed;
      return { ...task, completed, completedAt: completed ? new Date().toISOString() : null, xpAwarded: task.xpAwarded || shouldAwardXp };
    }));
    if (shouldAwardXp) {
      setXp((current) => current + 25);
      playSound('success');
    } else if (completedNow) {
      playSound('success');
    } else {
      playSound('tap');
    }
    triggerToast(wasCompleted ? '✓ Task Reopened' : '✓ Task Completed!');
  };

  const saveGoal = (goalData) => {
    if (!goalData.name?.trim() || !goalData.targetDate) {
      triggerToast('Goal name and target date are required.');
      return;
    }

    if (goalModal.mode === 'edit' && goalModal.goal) {
      setGoals((current) => current.map((goal) => (goal.id === goalModal.goal.id ? { ...goal, ...goalData } : goal)));
      triggerToast('✓ Goal Updated Successfully');
    } else {
      setGoals((current) => [{ id: makeId('goal'), ...goalData, progress: goalData.progress || 0, completed: false }, ...current]);
      triggerToast('✓ Goal Added Successfully');
    }
    setGoalModal({ open: false, mode: 'create', goal: null });
  };

  const toggleGoalComplete = (goalId) => {
    setGoals((current) => current.map((goal) => {
      if (goal.id !== goalId) return goal;
      const completed = !goal.completed;
      return { ...goal, completed, progress: completed ? 100 : Math.max(0, goal.progress || 0) };
    }));
    playSound('success');
    triggerToast('✓ Goal Completed');
  };

  const deleteGoal = (goalId) => {
    setGoals((current) => current.filter((goal) => goal.id !== goalId));
    setDeleteGoalId(null);
    triggerToast('✓ Goal Deleted');
  };

  const getCurrentTimerSeconds = () => {
    if (!timerStartedAtRef.current) return timerAccumulatedSecondsRef.current || timerSeconds;
    return timerAccumulatedSecondsRef.current
      + Math.max(0, Math.floor((Date.now() - timerStartedAtRef.current) / 1000));
  };

  const startTimer = () => {
    playSound('tap');
    timerAccumulatedSecondsRef.current = timerSeconds;
    timerStartedAtRef.current = Date.now();
    timerSessionIdRef.current = timerSessionIdRef.current || makeId('session');
    setTimerFinished(false);
    setTimerRunning(true);
  };

  const pauseTimer = () => {
    playSound('tap');
    const elapsedSeconds = getCurrentTimerSeconds();
    timerAccumulatedSecondsRef.current = elapsedSeconds;
    timerStartedAtRef.current = null;
    setTimerSeconds(elapsedSeconds);
    setTimerRunning(false);
    writeStorage(STORAGE_KEYS.activeTimer, {
      id: timerSessionIdRef.current,
      startedAt: null,
      accumulatedSeconds: elapsedSeconds,
    });
  };

  const resetTimer = () => {
    playSound('tap');
    timerStartedAtRef.current = null;
    timerAccumulatedSecondsRef.current = 0;
    timerSessionIdRef.current = null;
    setTimerRunning(false);
    setTimerFinished(false);
    setTimerSeconds(0);
    writeStorage(STORAGE_KEYS.activeTimer, null);
  };

  const handleTimerFinish = () => {
    const currentTimerSeconds = getCurrentTimerSeconds();
    if (currentTimerSeconds < 1) {
      triggerToast('Start the timer before finishing a session.');
      return;
    }
    const durationSeconds = Math.floor(currentTimerSeconds);
    const durationMinutes = durationSeconds / 60;
    const session = {
      id: makeId('session'),
      durationSeconds,
      durationMinutes,
      dateKey: getCurrentDateKey(),
      createdAt: new Date().toISOString(),
    };
    const xpEarned = Math.floor(durationSeconds / 60) * 2;
    const nextXp = xp + xpEarned;
    const nextLevelInfo = getLevelForXp(nextXp);
    const nextBadges = getBadges({ xp: nextXp, streak, quizHistory, completedTasksCount: tasks.filter((task) => task.completed).length, sessionCount: sessions.length + 1, goalCount: goals.length });
    setSessions((current) => {
      const existing = current.filter((item) => item.createdAt !== session.createdAt);
      return [session, ...existing];
    });
    setTimerRunning(false);
    setTimerFinished(true);
    setTimerSeconds(0);
    timerStartedAtRef.current = null;
    timerAccumulatedSecondsRef.current = 0;
    timerSessionIdRef.current = null;
    writeStorage(STORAGE_KEYS.activeTimer, null);
    setXp(nextXp);
    setSessionSummary({ durationMinutes, xpEarned, level: nextLevelInfo.level, badges: nextBadges });
    playSound('finish');
    triggerToast('✓ Study Session Saved');
  };

  const handleProfileSave = (event) => {
    event.preventDefault();
    if (!profile.name?.trim()) {
      triggerToast('Please enter your name.');
      return;
    }
    if (!profile.targetExam?.trim()) {
      triggerToast('Please enter your target exam.');
      return;
    }
    if (profile.examDate && profile.examDate < getCurrentDateKey()) {
      triggerToast('Exam date should be today or later.');
      return;
    }
    triggerToast('✓ Profile Updated');
    setPage('home');
  };

  const handleClearData = () => {
    const keys = Object.values(STORAGE_KEYS);
    keys.forEach((key) => removeStorage(key));
    setProfile(defaultProfile);
    setTasks([]);
    setGoals([]);
    setSessions([]);
    setSettings(defaultSettings);
    setTheme('system');
    setXp(0);
    setQuizHistory([]);
    setPage('home');
    setUtilityHistory([]);
    setUtilityReturnPage('home');
    setShowOnboarding(true);
    setShowHomeStart(true);
    setConfirmClearOpen(false);
    triggerToast('✓ All Data Cleared');
  };

  const downloadBackup = () => {
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        onboarding: readStorage(STORAGE_KEYS.onboarding, false),
        profile,
        tasks,
        goals,
        sessions,
        settings,
        theme,
        quizHistory,
        xp,
      },
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `EduMe-Backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    triggerToast('✓ Data Exported Successfully');
  };

  const handleImportBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup || typeof backup !== 'object' || !backup.data || !backup.version) {
        triggerToast('Invalid EduMe backup file.');
        return;
      }

      const { data } = backup;
      const nextSettings = { ...defaultSettings, ...(data.settings || {}) };
      setProfile(data.profile || defaultProfile);
      setTasks(Array.isArray(data.tasks) ? data.tasks.map((task) => ({ ...task, xpAwarded: task.xpAwarded ?? Boolean(task.completed) })) : []);
      setGoals(Array.isArray(data.goals) ? data.goals : []);
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setSettings(nextSettings);
      const importedTheme = data.theme === 'aurora' || data.theme === 'solstice' ? 'system' : data.theme === 'autumn' ? 'oak' : (data.theme || 'system');
      setTheme(importedTheme);
      setQuizHistory(Array.isArray(data.quizHistory) ? data.quizHistory : []);
      setXp(Number(data.xp || 0));
      writeStorage(STORAGE_KEYS.profile, data.profile || defaultProfile);
      writeStorage(STORAGE_KEYS.tasks, Array.isArray(data.tasks) ? data.tasks.map((task) => ({ ...task, xpAwarded: task.xpAwarded ?? Boolean(task.completed) })) : []);
      writeStorage(STORAGE_KEYS.goals, Array.isArray(data.goals) ? data.goals : []);
      writeStorage(STORAGE_KEYS.sessions, Array.isArray(data.sessions) ? data.sessions : []);
      writeStorage(STORAGE_KEYS.settings, nextSettings);
      writeStorage(STORAGE_KEYS.theme, importedTheme);
      writeStorage(STORAGE_KEYS.quizHistory, Array.isArray(data.quizHistory) ? data.quizHistory : []);
      writeStorage(STORAGE_KEYS.xp, Number(data.xp || 0));
      writeStorage(STORAGE_KEYS.onboarding, Boolean(data.onboarding ?? false));
      writeStorage(STORAGE_KEYS.settingsDefaultsVersion, 1);
      triggerToast('✓ Data Imported Successfully');
      event.target.value = '';
    } catch {
      triggerToast('Invalid EduMe backup file.');
    }
  };

  const startQuiz = () => {
    if (!questionBank.length) {
      triggerToast('Quiz database is unavailable.');
      return;
    }
    if (!quizExam || !quizSubject) {
      triggerToast('Select an exam and subject first.');
      return;
    }
    if (!quizExamKeys[quizExam]) {
      triggerToast('Quiz coming soon for this exam.');
      return;
    }
    const questionExam = quizExamKeys[quizExam];
    const pool = questionBank.filter((question) => question.exam === questionExam && question.subject === quizSubject);
    const seenQuestionTexts = new Set();
    const uniquePool = pool.filter((question) => {
      const questionText = String(question.question || '').trim().toLowerCase();
      if (!question.id || !questionText || !Array.isArray(question.options) || question.options.length < 2 || !question.correctAnswer || seenQuestionTexts.has(questionText)) return false;
      seenQuestionTexts.add(questionText);
      return true;
    });
    const cycleQuestionIds = new Set();
    quizHistory
      .filter((result) => result.exam === quizExam && result.subject === quizSubject)
      .reverse()
      .forEach((result) => {
        const resultQuestionIds = Array.isArray(result.questionIds) ? result.questionIds : [];
        if (resultQuestionIds.some((questionId) => cycleQuestionIds.has(questionId))) {
          cycleQuestionIds.clear();
        }
        resultQuestionIds.forEach((questionId) => cycleQuestionIds.add(questionId));
      });
    const freshPool = uniquePool.filter((question) => !cycleQuestionIds.has(question.id));
    const questionsPerSet = 5;
    const poolForAttempt = freshPool.length >= questionsPerSet ? freshPool : uniquePool;
    const selected = [...poolForAttempt]
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(questionsPerSet, poolForAttempt.length));
    if (!selected.length) {
      triggerToast('No questions are available for this exam and subject.');
      return;
    }

    setQuizQuestions(selected);
    setQuizStarted(true);
    setQuizResult(null);
    setQuizHistoryDetail(null);
    setQuizStep(0);
    setSelectedAnswers({});
    setQuizStartedAt(Date.now());
  };

  const submitQuiz = () => {
    if (!quizQuestions.length) return;

    const correctAnswers = quizQuestions.reduce(
      (total, question) => total + (selectedAnswers[question.id] === question.correctAnswer ? 1 : 0),
      0,
    );
    const wrongAnswers = quizQuestions.length - correctAnswers;
    const accuracy = Math.round((correctAnswers / quizQuestions.length) * 100);
    const timeSpentSeconds = Math.max(1, Math.round((Date.now() - (quizStartedAt || Date.now())) / 1000));
    const result = {
      id: makeId('quiz'),
      date: new Date().toISOString(),
      exam: quizExam,
      subject: quizSubject,
      questionIds: quizQuestions.map((question) => question.id),
      score: `${correctAnswers} / ${quizQuestions.length}`,
      accuracy,
      correct: correctAnswers,
      wrong: wrongAnswers,
      time: formatTimeDisplay(timeSpentSeconds),
    };

    setQuizResult(result);
    setQuizStarted(false);
    setQuizHistory((current) => [result, ...current].slice(0, 50));
    setXp((current) => current + (correctAnswers * QUIZ_CORRECT_ANSWER_XP) + QUIZ_COMPLETION_XP);
    playSound('finish');
    triggerToast('🎉 Quiz Completed!');
  };

  const currentQuestion = quizQuestions[quizStep] || null;

  const renderHome = () => {
    const recentSessions = [...sessions]
      .filter((session) => session.createdAt)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 3);
    const isNewUser = !tasks.length && !sessions.length && !goals.length && !quizHistory.length;

    return (
      <div className="page home-page">
      <div className="section-header home-welcome">
        <div>
          <p className="muted" style={{ margin: 0, fontWeight: 700 }}>Welcome</p>
          <h1 className="greeting">{getGreeting()}<span className="greeting-comma">,</span> {profile.name || 'Student'} 👋</h1>
          <p style={{ margin: '12px 0 0 0', color: 'var(--text-soft)', fontSize: 14 }}>{motivationalMessage}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {profile.targetExam && <span className="badge">Target Exam: {profile.targetExam}</span>}
          </div>
        </div>
      </div>

      {renderTimerCard()}

      <div className="task-summary-grid">
        <div className="task-summary-item task-summary-total">
          <div style={{ fontSize: 20, marginBottom: 4 }}>📝</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Total Tasks</div>
          <strong style={{ fontSize: 18 }}>{taskStats.total}</strong>
        </div>
        <div className="task-summary-item task-summary-pending">
          <div style={{ fontSize: 20, marginBottom: 4 }}>⏳</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Pending</div>
          <strong style={{ fontSize: 18 }}>{taskStats.pending}</strong>
        </div>
        <div className="task-summary-item task-summary-completed">
          <div style={{ fontSize: 20, marginBottom: 4 }}>✅</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Completed</div>
          <strong style={{ fontSize: 18 }}>{taskStats.completed}</strong>
        </div>
        <div className="task-summary-item task-summary-overdue">
          <div style={{ fontSize: 20, marginBottom: 4 }}>⚠️</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Overdue</div>
          <strong style={{ fontSize: 18 }}>{taskStats.overdue}</strong>
        </div>
      </div>

      {!isNewUser && (() => {
        const challenge = getDailyChallenge(todayTasks, goals, todaysMinutes, profile);
        return (
          <div className="card" style={{ padding: 16, marginBottom: 16, borderLeft: '4px solid var(--accent)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ fontSize: 32 }}>{challenge.emoji}</div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 8px 0' }}>{challenge.title}</h3>
                <p style={{ margin: '0 0 12px 0', color: 'var(--text-soft)', fontSize: 14 }}>{challenge.description}</p>
                <button className="primary-btn" style={{ fontSize: 13, padding: '8px 12px' }} onClick={() => {
                  if (challenge.actionText === 'View Tasks') navigateToPage('planner');
                  else if (challenge.actionText === 'Start Timer') { startTimer(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
                  else if (challenge.actionText === 'Add Goal') setGoalModal({ open: true, mode: 'create', goal: null });
                  else if (challenge.actionText === 'Add Task') openPlannerModal();
                  else if (challenge.actionText === 'View Progress') navigateToPage('progress');
                }}>
                  {challenge.actionText} →
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="home-overview-grid">
        <div className="card exam-countdown-panel home-exam-panel-full">
          <div className="section-header"><div><span className="section-kicker">EXAM COUNTDOWN</span><h2>Your Upcoming Exam</h2></div><span className="badge">{profile.examDate ? formatShortDate(profile.examDate) : 'Set date'}</span></div>
          {examDaysRemaining === null ? (
            <div className="empty-state">Add an exam date in Profile to see the countdown here.</div>
          ) : (
            <div className="countdown-value"><strong>{examDaysRemaining < 0 ? Math.abs(examDaysRemaining) : examDaysRemaining}</strong><span>{examDaysRemaining < 0 ? (Math.abs(examDaysRemaining) === 1 ? 'day passed' : 'days passed') : examDaysRemaining === 1 ? 'day left' : 'days left'}</span></div>
          )}
        </div>
      </div>

      {showHomeStart && isNewUser && (
        <div className="card inset-panel home-focus-panel home-start-card">
          <div className="section-header">
            <div><span className="section-kicker">START HERE</span><h2 style={{ marginBottom: 6 }}>Your first study day</h2></div>
            <div className="home-start-card-actions">
              <span className="badge">4 simple steps</span>
              <button
                className="home-start-close"
                onClick={() => { writeStorage(STORAGE_KEYS.homeStartDismissed, true); setShowHomeStart(false); }}
                aria-label="Dismiss first study day card"
                title="Dismiss"
              >×</button>
            </div>
          </div>
          <div className="grid" style={{ gap: 10 }}>
            <div className="task-item home-start-step"><strong>1. Complete Profile</strong><span className="muted">Add your exam, class, and weak subjects.</span></div>
            <div className="task-item home-start-step"><strong>2. Add a Task</strong><span className="muted">Plan what you want to study today.</span></div>
            <div className="task-item home-start-step home-start-step-extra"><strong>3. Start Studying</strong><span className="muted">Use the focus timer and record your session.</span></div>
            <div className="task-item home-start-step home-start-step-extra"><strong>4. Take a Quiz</strong><span className="muted">Choose your exam and subject to practise.</span></div>
          </div>
          <p className="home-start-mobile-note">After the first two steps, use the timer and Quiz from the home controls.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <button className="primary-btn" onClick={() => navigateToPage('profile')}>Complete Profile</button>
            <button className="ghost-btn" onClick={() => navigateToPage('planner')}>Add First Task</button>
          </div>
        </div>
      )}

      <div className="home-grid">
        <div className="stack">
          <div className="card stat-card home-panel-goal">
            <div className="section-header">
              <h2>Today&apos;s Goal</h2>
              <span className="badge">{Math.round(goalProgress)}%</span>
            </div>
            <div className="grid" style={{ gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span className="muted">Daily study target</span>
                {todayGoalMinutes > 0 ? <strong>{Number(profile.dailyStudyHours || 0)}h</strong> : <button className="inline-action" onClick={() => navigateToPage('profile')}>Set target</button>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span className="muted">Completed</span>
                <strong>{formatTimeDisplay(todaysMinutes * 60)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span className="muted">Remaining</span>
                <strong>{formatTimeDisplay(Math.max(0, (Number(profile.dailyStudyHours || 0) * 3600) - todaysMinutes * 60))}</strong>
              </div>
              {todayGoalMinutes > 0 ? <div className="progress-bar"><span style={{ width: `${Math.min(100, goalProgress)}%` }} /></div> : <p className="home-goal-hint">Set a daily target to track your goal progress.</p>}
            </div>
          </div>

          <div className="card list-card home-panel-tasks">
            <div className="section-header">
              <h2>Due Tasks</h2>
              <button className="ghost-btn" onClick={() => navigateToPage('planner')}>View all</button>
            </div>
            {dueTasks.length === 0 ? (
              <div className="empty-state">No pending due tasks. Keep planning ahead.</div>
            ) : (
              <div>
                {dueTasks.map((task) => (
                  <div className="task-item" key={task.id}>
                    <div className="task-main">
                      <button
                        className={`check-box ${task.completed ? 'checked' : ''}`}
                        aria-label={task.completed ? 'Mark uncomplete' : 'Mark complete'}
                        onClick={() => toggleTaskComplete(task.id)}
                      />
                      <div>
                        <div style={{ fontWeight: 700 }}>{task.name}</div>
                        <div className="muted">{task.subject} · {task.topic || 'General'} · {task.date === getCurrentDateKey() ? 'Today' : formatShortDate(task.date)}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="badge">{task.completed ? 'Done' : 'Open'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card list-card home-panel-reminders">
            <div className="section-header"><h3>Study Reminders</h3><button className="ghost-btn" onClick={() => openUtilityPage('notifications')}>View all</button></div>
            {upcomingTasks.length === 0 && examDaysRemaining === null ? (
              <div className="empty-state">No upcoming study or exam reminders.</div>
            ) : (
              <div>
                {upcomingTasks.slice(0, 2).map((task) => (
                  <div key={task.id} className="task-item">
                    <div><strong>{task.name}</strong><div className="muted">{task.subject} · {formatShortDate(task.date)}</div></div>
                    <span className="badge">{formatShortDate(task.date)}</span>
                  </div>
                ))}
                {examDaysRemaining !== null && examDaysRemaining >= 0 && <div className="task-item exam-reminder"><div><strong>Exam in {examDaysRemaining} day{examDaysRemaining === 1 ? '' : 's'}</strong><div className="muted">{formatShortDate(profile.examDate)}</div></div><span className="badge">Focus</span></div>}
              </div>
            )}
          </div>

          <div className="card list-card home-panel-goals">
            <div className="section-header"><h3>Goals</h3><button className="ghost-btn" onClick={() => navigateToPage('planner')}>Manage</button></div>
            {activeGoals.length === 0 ? (
              <div className="empty-state">No goals yet. Create your first study goal.</div>
            ) : (
              <div>
                {activeGoals.slice(0, 3).map((goal) => (
                  <div key={goal.id} className="goal-item">
                    <div>
                      <strong>{goal.name}</strong>
                      <div className="muted">{goal.progress || 0}% complete</div>
                    </div>
                    <button className="secondary-btn" onClick={() => navigateToPage('planner')}>Open</button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      <div className="card list-card home-panel-activity">
        <div className="section-header"><h3>Recent Activity</h3><button className="ghost-btn" onClick={() => navigateToPage('progress')}>View progress</button></div>
        {recentSessions.length === 0 ? (
          <div className="empty-state">Complete a study session to see your recent activity.</div>
        ) : (
          <div>
            {recentSessions.map((session) => (
              <div className="task-item" key={session.id}>
                <div><strong>Focus session</strong><div className="muted">{new Date(session.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {new Date(session.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div></div>
                <span className="badge">{formatTimeDisplay(Number(session.durationSeconds) || (Number(session.durationMinutes) || 0) * 60)} · +{Math.floor((Number(session.durationSeconds) || (Number(session.durationMinutes) || 0) * 60) / 60) * 2} XP</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    );
  };

  const renderPlanner = () => {
    const selectedTasks = tasks.filter((task) => task.date === calendarDate);
    const completedSelectedTasks = selectedTasks.filter((task) => task.completed).length;
    const plannedMinutes = selectedTasks.reduce((total, task) => total + (Number(task.duration) || 0), 0);
    const completedMinutes = selectedTasks.filter((task) => task.completed).reduce((total, task) => total + (Number(task.duration) || 0), 0);

    return (
    <div className="page planner-page">
      <div className="section-header">
        <h2>Study Planner</h2>
      </div>

      <div className="card inset-panel planner-filters">
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Filter by date</label>
            <input className="input" type="date" value={calendarDate} onChange={(e) => setCalendarDate(e.target.value || getCurrentDateKey())} />
          </div>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Selected day</label>
            <input className="input" type="text" value={formatShortDate(calendarDate)} readOnly />
          </div>
        </div>
      </div>

      <div className="card inset-panel planner-calendar">
        <div className="section-header" style={{ marginBottom: 12 }}>
          <h3>Calendar View</h3>
        </div>
        <CalendarView tasks={tasks} selectedDate={calendarDate} onSelectDate={setCalendarDate} onAddTask={(date) => openPlannerModal(null, date)} />
      </div>

      <div className="card inset-panel planner-tasks">
        <div className="section-header"><div><span className="section-kicker">DAILY AGENDA</span><h3>Tasks for {formatShortDate(calendarDate)}</h3></div><span className="badge">{completedSelectedTasks}/{selectedTasks.length} complete</span></div>
        <div className="planner-day-summary">
          <div><span className="muted">Planned</span><strong>{plannedMinutes} min</strong></div>
          <div><span className="muted">Completed</span><strong>{completedMinutes} min</strong></div>
          <div className="planner-day-progress"><span style={{ width: `${selectedTasks.length ? (completedSelectedTasks / selectedTasks.length) * 100 : 0}%` }} /></div>
        </div>
        {selectedTasks.length === 0 ? (
          <div className="empty-state"><span>No tasks planned for this date.</span><button className="secondary-btn" onClick={() => openPlannerModal(null, calendarDate)}>Add Task</button></div>
        ) : (
          <div>
            {selectedTasks.map((task) => (
              <div className={`task-item ${task.completed ? 'task-item-completed' : ''}`} key={task.id}>
                <div className="task-main">
                  <button className={`check-box ${task.completed ? 'checked' : ''}`} onClick={() => toggleTaskComplete(task.id)} />
                  <div>
                    <div style={{ fontWeight: 700 }}>{task.name}</div>
                    <div className="muted">{task.subject} · {task.topic || 'General'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button className="secondary-btn" onClick={() => openPlannerModal(task, task.date)}>Edit</button>
                  <button className="danger-btn" onClick={() => setDeleteTaskId(task.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card inset-panel planner-goals">
        <div className="section-header">
          <h3>Goals</h3>
          <button className="primary-btn" onClick={() => setGoalModal({ open: true, mode: 'create', goal: null })}>Add Goal</button>
        </div>

        {activeGoals.length === 0 && completedGoals.length === 0 ? (
          <div className="empty-state">No goals yet. Create your first study goal.</div>
        ) : (
          <div className="grid" style={{ gap: 12 }}>
            {activeGoals.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 10px' }}>Active Goals</h4>
                {activeGoals.map((goal) => (
                  <div key={goal.id} className={`card goal-card ${goal.completed ? 'goal-card-completed' : ''}`} style={{ padding: 14, marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <div>
                        <strong>{goal.name}</strong>
                        <div className="muted">{goal.targetDate ? formatShortDate(goal.targetDate) : 'No target date'}</div>
                      </div>
                      <button className="secondary-btn" onClick={() => toggleGoalComplete(goal.id)}>{goal.completed ? 'Reopen' : 'Complete'}</button>
                    </div>
                    <p className="muted" style={{ margin: '10px 0' }}>{goal.description || 'No description provided.'}</p>
                    <div className="progress-bar" style={{ marginBottom: 10 }}><span style={{ width: `${goal.progress || 0}%` }} /></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span className="badge">{goal.progress || 0}%</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="ghost-btn" onClick={() => setGoalModal({ open: true, mode: 'edit', goal })}>Edit</button>
                        <button className="danger-btn" onClick={() => setDeleteGoalId(goal.id)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {completedGoals.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 10px' }}>Completed Goals</h4>
                {completedGoals.map((goal) => (
                  <div key={goal.id} className="card goal-card goal-card-completed" style={{ padding: 14, marginBottom: 12, opacity: 0.8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <div>
                        <strong>{goal.name}</strong>
                        <div className="muted">Completed</div>
                      </div>
                      <button className="secondary-btn" onClick={() => toggleGoalComplete(goal.id)}>Reopen</button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, gap: 8 }}>
                      <button className="ghost-btn" onClick={() => setGoalModal({ open: true, mode: 'edit', goal })}>Edit</button>
                      <button className="danger-btn" onClick={() => setDeleteGoalId(goal.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    );
  };

  const renderProfile = () => {
    const profileFields = [profile.name, profile.targetExam, profile.examDate, profile.className, profile.weakSubjects, profile.dailyStudyHours];
    const profileCompletion = Math.round((profileFields.filter((field) => String(field || '').trim()).length / profileFields.length) * 100);

    return (
    <div className="page">
          <div className="card inset-panel quiz-panel quiz-setup-panel">
        <div className="section-header"><div><h2>Profile</h2><p className="muted profile-subtitle">Personalize your study plan and progress.</p></div><span className="badge">{profileCompletion}% complete</span></div>
        <div className="profile-completion-bar"><span style={{ width: `${profileCompletion}%` }} /></div>
        <p className="profile-missing-hint">{profileCompletion === 100 ? 'Your study profile is ready.' : 'Complete your profile to unlock more accurate study insights.'}</p>
        <form className="form-grid" onSubmit={handleProfileSave}>
          <div className="profile-section-label">PERSONAL &amp; EXAM DETAILS</div>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Name</label>
            <input className="input" value={profile.name} onChange={(e) => setProfile((current) => ({ ...current, name: e.target.value }))} placeholder="Enter your name" />
          </div>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Target Exam</label>
            <input className="input" value={profile.targetExam} onChange={(e) => setProfile((current) => ({ ...current, targetExam: e.target.value, customExamName: '' }))} placeholder="Enter your target exam" />
            <small className="muted">Enter the exam name yourself. Quiz questions are available for supported exams only.</small>
            </div>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Exam Date</label>
            <input className="input" type="date" value={profile.examDate} onChange={(e) => setProfile((current) => ({ ...current, examDate: e.target.value }))} aria-label="Select Your Exam Date" />
          </div>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Class</label>
            <input className="input" value={profile.className} onChange={(e) => setProfile((current) => ({ ...current, className: e.target.value }))} placeholder="Enter your class" />
          </div>
          <div className="profile-section-label">STUDY PREFERENCES</div>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Weak Subjects</label>
            <input className="input" value={profile.weakSubjects} onChange={(e) => setProfile((current) => ({ ...current, weakSubjects: e.target.value }))} placeholder="Enter your weak subjects" />
          </div>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Daily Study Hours</label>
            <input className="input" type="number" min="1" max="24" value={profile.dailyStudyHours} onChange={(e) => setProfile((current) => ({ ...current, dailyStudyHours: e.target.value }))} placeholder="Enter daily study hours" />
          </div>
          <button className="primary-btn" type="submit">Save Profile</button>
        </form>
      </div>
    </div>
    );
  };

  const renderSettings = () => {
    return (
    <div className="page">
      <div className="card inset-panel profile-panel">
        <div className="section-header"><div><h2>⚙️ Settings</h2><p className="muted settings-subtitle">Manage your study experience.</p></div></div>
        <div className="form-grid">
          <div className="settings-section-label">PREFERENCES</div>
          <div className="card settings-card" style={{ padding: 16 }}>
            <h3>🔔 Reminders</h3>
            <p className="settings-description">Study and task reminders use your browser notifications.</p>
            <div className="task-item" style={{ paddingTop: 0 }}>
              <span>Study & Notification Reminders</span>
              <ToggleSwitch
                enabled={settings.studyReminder || settings.notificationReminder}
                onToggle={toggleReminderNotifications}
              />
            </div>
          </div>

          <div className="card settings-card" style={{ padding: 16 }}>
            <h3>🔊 Sound</h3>
            <p className="settings-description">Play a small sound for timer and study actions.</p>
            <div className="task-item" style={{ paddingTop: 0 }}>
              <span>Sound Effects</span>
              <ToggleSwitch
                enabled={settings.soundEffects}
                onToggle={() => {
                  const nextEnabled = !settings.soundEffects;
                  setSettings((current) => ({ ...current, soundEffects: nextEnabled }));
                  if (nextEnabled) playFeedbackTone('success');
                }}
              />
            </div>
          </div>

          <div className="card settings-card" style={{ padding: 16 }}>
            <h3>Theme</h3>
            <div className="nav-row settings-theme-grid">
              {['light', 'dark', 'oak', 'system'].map((option) => (
                <button
                  key={option}
                  className={theme === option ? 'primary-btn' : 'ghost-btn'}
                  onClick={() => setTheme(option)}
                >
                  {option === 'light' ? 'Light' : option === 'dark' ? 'Dark' : option === 'oak' ? 'Oak' : 'System Default'}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-section-label">DATA &amp; PRIVACY</div>
          <div className="card settings-card" style={{ padding: 16 }}>
            <h3>📦 Data</h3>
            <p className="settings-description">Your study data stays in this browser unless you export it.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="secondary-btn" onClick={downloadBackup}>Export Data</button>
              <button className="secondary-btn" onClick={() => document.getElementById('import-backup-file').click()}>Import Data</button>
              <input id="import-backup-file" type="file" accept="application/json" hidden onChange={handleImportBackup} />
            </div>
          </div>

          <div className="settings-section-label">APP</div>
          <div className="card settings-card" style={{ padding: 16 }}>
            <h3>📲 Install App</h3>
            <p className="muted">Install EduMe for faster access and an app-like study workspace.</p>
            <button className="primary-btn" onClick={handleInstallPwa}>
              {deferredInstallPrompt ? 'Install EduMe' : 'Show install steps'}
            </button>
            {showInstallHelp && (
              <div className="install-help">
                <strong>Install from your browser</strong>
                <p className="muted">Chrome or Edge: open the browser menu, choose <b>Install EduMe</b> or <b>Add to desktop</b>. On Android, tap the three-dot menu and choose <b>Install app</b>.</p>
                <button className="ghost-btn" onClick={() => setShowInstallHelp(false)}>Close</button>
              </div>
            )}
          </div>

          <div className="card settings-card settings-danger-zone" style={{ padding: 16 }}>
            <h3>🗑️ Clear Data</h3>
            <p className="muted">Permanently remove locally stored profile, tasks, goals, sessions, and quiz data.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="ghost-btn" onClick={() => setConfirmClearOpen(false)}>Cancel</button>
              <button className="danger-btn" onClick={() => setConfirmClearOpen(true)}>Clear Data</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    );
  };

  const renderQuiz = () => {
    if (quizHistoryDetail) {
      const detailDate = new Date(quizHistoryDetail.date);
      return (
        <div className="page">
          <div className="card inset-panel">
            <div className="section-header">
              <div>
                <button className="icon-btn utility-back-btn quiz-result-back" onClick={() => setQuizHistoryDetail(null)} aria-label="Back to Quiz" title="Back to Quiz">Back</button>
                <h2 style={{ marginTop: 14 }}>Quiz Result</h2>
              </div>
              <span className="muted">{detailDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <div className="quiz-detail-heading"><div><span className="section-kicker">PRACTICE REVIEW</span><h3>{quizHistoryDetail.subject}</h3><p className="muted">{quizHistoryDetail.exam}</p></div><strong className={`quiz-detail-score quiz-accuracy-${Number(quizHistoryDetail.accuracy || 0) >= 70 ? 'good' : Number(quizHistoryDetail.accuracy || 0) >= 40 ? 'medium' : 'low'}`}>{quizHistoryDetail.accuracy}%</strong></div>
            <div className="grid" style={{ gap: 14, marginTop: 16 }}>
              <div className="card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Score</span><strong>{quizHistoryDetail.score}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Correct</span><strong>{quizHistoryDetail.correct}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Wrong</span><strong>{quizHistoryDetail.wrong}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Accuracy</span><strong>{quizHistoryDetail.accuracy}%</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Time</span><strong>{quizHistoryDetail.time}</strong></div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (!quizStarted && !quizResult) {
      return (
        <div className="page">
          <div className="card inset-panel quiz-history-panel">
            <div className="section-header"><h2>Quiz</h2></div>
            <div className="form-grid">
              <div>
                <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Select Exam</label>
                <select className="select" value={quizExam} onChange={(event) => { const nextExam = event.target.value; setQuizExam(nextExam); setQuizSubject(examSubjects[nextExam]?.[0] || ''); }}>
                  <option value="" disabled>Select Your Exam</option>
                  <option value="JEE MAINS & ADVANCE">JEE MAINS & ADVANCE</option>
                  <option value="NEET">NEET</option>
                  <option value="BOARDS">BOARDS</option>
                  <option value="CA">CA</option>
                  <option value="UPSC">UPSC</option>
                  <option value="NDA">NDA</option>
                  <option value="SSC">SSC</option>
                  <option value="CUET">CUET</option>
                  {profile.targetExam && !quizExamKeys[profile.targetExam] && !['UPSC', 'NDA', 'SSC', 'CUET'].includes(profile.targetExam) && <option value={profile.targetExam}>{profile.targetExam}</option>}
                </select>
              </div>
              <div>
                <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Select Subject</label>
                <select className="select" value={quizSubject} onChange={(event) => setQuizSubject(event.target.value)} disabled={!quizExam}>
                  <option value="" disabled>Select Your Subject</option>
                  {(examSubjects[quizExam] || []).map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                </select>
              </div>
              {quizExam && !quizExamKeys[quizExam] && (
                <div className="quiz-coming-soon" role="status">
                  <strong>Quiz coming soon for {quizExam}.</strong>
                  <span>We&apos;re preparing quality practice questions for this exam. You can continue planning and tracking your study meanwhile.</span>
                </div>
              )}
              {quizExam && quizSubject && quizExamKeys[quizExam] && <div className="quiz-setup-summary"><span>5 questions</span><span>Mixed practice</span><span>Estimated 10 min</span></div>}
              {!quizExam && !profile.targetExam && <div className="quiz-profile-hint"><span className="muted">Set your exam in Profile for a personalized quiz.</span><button className="ghost-btn" onClick={() => navigateToPage('profile')}>Open Profile</button></div>}
              <button className="primary-btn" onClick={startQuiz} disabled={!quizExam || !quizSubject || !quizExamKeys[quizExam]}>Start Quiz</button>
            </div>
          </div>

          <div className="card inset-panel quiz-question-panel">
            <div className="section-header quiz-history-heading"><div><span className="section-kicker">YOUR PRACTICE</span><h3>Quiz History</h3></div>{quizHistory.length > 0 && <div className="quiz-history-summary"><strong>{quizHistory.length}</strong><span>attempts</span><strong>{Math.round(quizHistory.reduce((sum, entry) => sum + Number(entry.accuracy || 0), 0) / quizHistory.length)}%</strong><span>average</span></div>}</div>
            {quizHistory.length === 0 ? (
              <div className="empty-state">Complete your first quiz to see score history here.</div>
            ) : (
              <div className="grid" style={{ gap: 10 }}>
                {quizHistory.slice(0, showAllQuizHistory ? 50 : 5).map((entry) => (
                  <button key={entry.id} className="card quiz-history-entry" onClick={() => setQuizHistoryDetail(entry)}>
                    <div className="quiz-history-entry-main"><div><strong>{entry.subject}</strong><span className="muted">{entry.exam} · {new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div><strong className={`quiz-accuracy quiz-accuracy-${Number(entry.accuracy || 0) >= 70 ? 'good' : Number(entry.accuracy || 0) >= 40 ? 'medium' : 'low'}`}>{entry.accuracy}%</strong></div>
                    <div className="quiz-history-entry-meta"><span>{entry.score}</span><span>{entry.time}</span><span>{Number(entry.accuracy || 0) >= 70 ? 'Strong result' : Number(entry.accuracy || 0) >= 40 ? 'Keep practicing' : 'Review recommended'}</span></div>
                  </button>
                ))}
                {quizHistory.length > 5 && (
                  <button className="ghost-btn" onClick={() => setShowAllQuizHistory((current) => !current)}>
                    {showAllQuizHistory ? 'Show less' : `See more (${quizHistory.length - 5})`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (quizStarted && currentQuestion) {
      return (
        <div className="page">
          <div className="card inset-panel quiz-result-panel">
            <div className="section-header">
              <span className="badge">Question {quizStep + 1} / {quizQuestions.length}</span>
              <span className="muted">{quizExam} · {quizSubject}</span>
            </div>
            <div className="progress-bar" style={{ marginBottom: 16 }}><span style={{ width: `${((quizStep + 1) / quizQuestions.length) * 100}%` }} /></div>
            <h3>{currentQuestion.question}</h3>
            <div className="grid" style={{ gap: 10, marginTop: 14 }}>
              {currentQuestion.options.map((option) => (
                <button
                  key={option}
                  className={selectedAnswers[currentQuestion.id] === option ? 'primary-btn' : 'ghost-btn'}
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => setSelectedAnswers((prev) => ({ ...prev, [currentQuestion.id]: option }))}
                >
                  {option}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <button className="ghost-btn" disabled={quizStep === 0} onClick={() => setQuizStep((prev) => Math.max(0, prev - 1))}>Previous</button>
              {quizStep === quizQuestions.length - 1 ? (
                <button className="primary-btn" onClick={submitQuiz}>Finish Quiz</button>
              ) : (
                <button className="primary-btn" onClick={() => setQuizStep((prev) => Math.min(prev + 1, quizQuestions.length - 1))}>Next</button>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (quizResult) {
      return (
        <div className="page">
          <div className="card inset-panel">
            <div className="section-header"><h2>🎉 Quiz Completed!</h2></div>
            <div className="grid" style={{ gap: 14 }}>
              <div className="card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Score</span><strong>{quizResult.score}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Correct</span><strong>{quizResult.correct}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Wrong</span><strong>{quizResult.wrong}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Accuracy</span><strong>{quizResult.accuracy}%</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Time</span><strong>{quizResult.time}</strong></div>
              </div>
              <button className="primary-btn" onClick={() => { setQuizResult(null); setQuizQuestions([]); setSelectedAnswers({}); setQuizStep(0); setQuizHistoryDetail(null); }}>Retake Quiz</button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderProgress = () => {
    const tasksCompleted = taskStats.completed;
    const tasksPending = taskStats.pending;
    const tasksOverdue = taskStats.overdue;
    const taskTotal = taskStats.total;
    const reportQuizUnavailable = profile.targetExam && !quizExamKeys[profile.targetExam];
    const averageAccuracy = quizHistory.length ? Math.round(quizHistory.reduce((sum, entry) => sum + Number(entry.accuracy || 0), 0) / quizHistory.length) : 0;
    const taskCompletionRate = taskTotal ? Math.round((tasksCompleted / taskTotal) * 100) : 0;
    const studyTimeProgress = todayGoalMinutes > 0 ? Math.min(100, Math.round((weeklySummary.minutes / (todayGoalMinutes * 7)) * 100)) : 0;
    const studyTrend = getStudyTrend(sessions);
    const bestStudyDay = studyTrend.reduce((best, day) => day.minutes > best.minutes ? day : best, studyTrend[0]);
    const latestQuiz = quizHistory[0] || null;
    const goalAverage = goals.length ? Math.round(goals.reduce((sum, goal) => sum + Number(goal.progress || 0), 0) / goals.length) : 0;
    const hasWeeklyStudyData = weeklySummary.minutes > 0;
    const maxStudyMinutes = Math.max(1, ...studyTrend.map((day) => day.minutes));
    const dailyTargetMinutes = Number(profile.dailyStudyHours || 0) * 60;
    const todayTargetProgress = dailyTargetMinutes ? Math.min(100, Math.round((todaysMinutes / dailyTargetMinutes) * 100)) : 0;
    const subjectTotals = quizHistory.reduce((summary, entry) => {
      const subject = String(entry.subject || '').trim();
      if (!subject) return summary;
      const current = summary[subject] || { total: 0, accuracy: 0 };
      current.total += 1;
      current.accuracy += Number(entry.accuracy || 0);
      summary[subject] = current;
      return summary;
    }, {});
    const subjectNames = [...new Set([...weakSubjects, ...Object.keys(subjectTotals)])].slice(0, 5);
    const orderedBadges = [...badges].sort((first, second) => Number(second.unlocked) - Number(first.unlocked));
    const studyXp = sessions.reduce((total, session) => total + (Math.floor((Number(session.durationSeconds) || (Number(session.durationMinutes) || 0) * 60) / 60) * 2), 0);
    const taskXp = tasks.filter((task) => task.xpAwarded).length * 25;
    const quizXp = quizHistory.reduce((total, entry) => total + (Number(entry.correct || 0) * QUIZ_CORRECT_ANSWER_XP) + QUIZ_COMPLETION_XP, 0);
    const overallProgress = getOverallProgress({
      goalAverage,
      averageAccuracy,
      taskCompletionRate,
      studyTimeProgress,
      hasGoals: goals.length > 0,
      hasQuizHistory: quizHistory.length > 0,
      hasTasks: taskTotal > 0,
      hasStudyGoal: todayGoalMinutes > 0,
    });

    return (
      <div className="page progress-page">
        <div className="progress-hero">
          <div>
            <span className="eyebrow">YOUR LEARNING SNAPSHOT</span>
            <h2>Progress that feels <span className="highlight-text">worth celebrating.</span></h2>
            <p className="muted">Small sessions are adding up. Keep the momentum going, {profile.name || 'Student'}.</p>
            <div className="hero-pills">
              <span className="report-pill">🔥 {streak} day streak</span>
              <span className="report-pill">⚡ Level {levelInfo.level}</span>
              {profile.targetExam && <span className="report-pill">🎯 {profile.targetExam}</span>}
            </div>
            <div className="progress-report-actions progress-hero-report-actions"><span className="progress-report-label">Download report</span><button className="primary-btn report-weekly-btn" onClick={() => downloadReport('weekly')}>Weekly</button><button className="secondary-btn report-monthly-btn" onClick={() => downloadReport('monthly')}>Monthly</button></div>
          </div>
          <div className="overall-score">
            <div className="score-ring" style={{ '--score': `${overallProgress * 3.6}deg` }}><strong>{overallProgress}%</strong></div>
            <span>Overall Progress</span>
          </div>
        </div>

        <div className="report-section-heading report-section-heading-01"><span className="section-kicker">01</span><div><h3>Study &amp; task overview</h3><p className="muted">Your time, consistency, completed work, and workload.</p></div></div>
        <div className="progress-stat-grid">
          <div className="progress-stat progress-stat-violet"><span>Today&apos;s study time</span><strong>{formatTimeDisplay(todaysMinutes * 60)}</strong><small>Keep the streak alive</small></div>
          <div className="progress-stat progress-stat-teal"><span>Weekly study time</span><strong>{formatTimeDisplay(weeklySummary.minutes * 60)}</strong><small>Your last 7 days</small></div>
          <div className="progress-stat progress-stat-orange"><span>Monthly study time</span><strong>{formatTimeDisplay(monthlySummary.minutes * 60)}</strong><small>Long-term consistency</small></div>
          <div className="progress-stat progress-stat-pink"><span>Total study sessions</span><strong>{sessions.length}</strong><small>Every session counts</small></div>
        </div>

        <div className="progress-panel-grid">
          <div className="card progress-chart-panel">
            <div className="progress-activity-header">
              <div className="progress-activity-title"><span className="section-kicker">THIS WEEK</span><h3>Study activity</h3></div>
              <span className="progress-activity-unit">Minutes per day</span>
            </div>
            <p className="progress-activity-helper muted">Your focused study time across the last seven days.</p>
            {hasWeeklyStudyData ? (
              <div className="activity-chart" aria-label="Study activity for the last seven days">
                {studyTrend.map((day) => <div className="chart-column" key={day.key}><strong>{day.minutes ? Math.round(day.minutes) : ''}</strong><div className="chart-track"><span style={{ height: `${day.minutes ? Math.max(8, (day.minutes / maxStudyMinutes) * 100) : 0}%` }} /></div><small>{day.label}</small></div>)}
              </div>
            ) : <div className="empty-state">Complete your first study session to see your weekly rhythm.</div>}
          </div>
          <div className="card progress-subject-panel">
            <div className="section-header"><div><span className="section-kicker">FOCUS AREAS</span><h3>Subject performance</h3></div><button className="ghost-btn" onClick={() => navigateToPage('quiz')}>Practice</button></div>
            {subjectNames.length ? (
              <div className="subject-performance-list">{subjectNames.map((subject) => {
                const result = subjectTotals[subject];
                const accuracy = result ? Math.round(result.accuracy / result.total) : null;
                const label = subject.replace(/\b\w/g, (letter) => letter.toUpperCase());
                return <div className="subject-performance-item" key={subject}><div className="subject-performance-meta"><strong>{label}</strong><span>{accuracy === null ? 'Needs practice' : `${accuracy}%`}</span></div><div className="mini-progress"><span style={{ width: `${accuracy || 0}%` }} /></div><small className="muted">{accuracy === null ? 'Add a quiz result to measure this subject.' : `${result.total} quiz attempt${result.total === 1 ? '' : 's'}`}</small></div>;
              })}</div>
            ) : <div className="empty-state">Add weak subjects in Profile or complete a quiz to see focus areas.</div>}
          </div>
        </div>

        <div className="card progress-target-panel">
          <div className="section-header"><div><span className="section-kicker">TODAY</span><h3>Today vs target</h3></div><span className="badge">{dailyTargetMinutes ? `${todayTargetProgress}%` : 'Set target'}</span></div>
          <div className="progress-target-values"><div><span className="muted">Completed</span><strong>{formatTimeDisplay(todaysMinutes * 60)}</strong></div><div><span className="muted">Target</span><strong>{dailyTargetMinutes ? formatTimeDisplay(dailyTargetMinutes * 60) : 'Not set'}</strong></div><div><span className="muted">Remaining</span><strong>{dailyTargetMinutes ? formatTimeDisplay(Math.max(0, (dailyTargetMinutes - todaysMinutes) * 60)) : 'Set a daily goal'}</strong></div></div>
          <div className="progress-bar"><span style={{ width: `${todayTargetProgress}%` }} /></div>
          {!dailyTargetMinutes && <button className="secondary-btn" onClick={() => navigateToPage('profile')}>Set Daily Target</button>}
        </div>

        <div className="progress-stat-grid task-stat-grid">
          <div className="progress-stat progress-stat-blue"><span>📝 Total Tasks</span><strong>{taskTotal}</strong><small>All your study tasks</small></div>
          <div className="progress-stat progress-stat-green"><span>✅ Completed</span><strong>{tasksCompleted}</strong><small>Great work!</small></div>
          <div className="progress-stat progress-stat-orange"><span>⏳ Pending</span><strong>{tasksPending}</strong><small>Ready to tackle</small></div>
          <div className="progress-stat progress-stat-red"><span>⚠️ Overdue</span><strong>{tasksOverdue}</strong><small>Priority items</small></div>
        </div>

        <div className="report-section-heading report-section-heading-03"><span className="section-kicker">03</span><div><h3>Learning wins</h3><p className="muted">The numbers behind your growth.</p></div></div>
        <div className="progress-stat-grid progress-stat-grid-compact">
          <div className="progress-stat progress-stat-blue"><span>Goals progress</span><strong>{goalAverage}%</strong><div className="mini-progress"><span style={{ width: `${goalAverage}%` }} /></div></div>
          <div className="progress-stat progress-stat-green"><span>Quiz accuracy</span>{reportQuizUnavailable ? <><strong>Unavailable</strong><small>Quiz is currently unavailable for this exam.</small></> : <><strong>{averageAccuracy}%</strong><div className="mini-progress"><span style={{ width: `${averageAccuracy}%` }} /></div></>}</div>
          <div className="progress-stat progress-stat-indigo"><span>Quiz attempts</span>{reportQuizUnavailable ? <><strong>Unavailable</strong><small>Quiz is currently unavailable for this exam.</small></> : <><strong>{quizHistory.length}</strong><small>Practice builds confidence</small></>}</div>
          <div className="progress-stat progress-stat-gold"><span>Total XP</span><strong>{xp}</strong><small>{levelInfo.currentLevelXp} / 250 to next level</small><div className="xp-breakdown">{studyXp} study · {taskXp} tasks · {quizXp} quiz</div></div>
        </div>

        <div className="report-section-heading report-section-heading-04"><span className="section-kicker">04</span><div><h3>Study insights</h3><p className="muted">A closer look at your recent study pattern.</p></div></div>
        <div className="progress-stat-grid progress-stat-grid-compact">
          <div className="progress-stat progress-stat-teal"><span>Best study day</span><strong>{bestStudyDay.minutes > 0.5 ? `${Math.round(bestStudyDay.minutes)} min` : 'No data'}</strong><small>{bestStudyDay.minutes > 0.5 ? bestStudyDay.label : 'Complete a longer session to see your best day.'}</small></div>
          <div className="progress-stat progress-stat-orange"><span>Average daily study</span><strong>{hasWeeklyStudyData ? formatTimeDisplay((weeklySummary.minutes / 7) * 60) : 'No data'}</strong><small>{hasWeeklyStudyData ? 'Based on the last 7 days' : 'Complete a session to see your average.'}</small></div>
        </div>

        <div className="level-panel card report-section-05">
          <div className="section-header"><div><span className="section-kicker">05</span><h3>Progress to next level</h3></div><strong className="highlight-text">Level {levelInfo.level + 1}</strong></div>
          <div className="progress-bar"><span style={{ width: `${levelInfo.progress}%` }} /></div>
          <div className="level-meta"><span>{levelInfo.progress}% complete</span><span>{250 - levelInfo.currentLevelXp} XP to go</span></div>
        </div>

        <div className="card inset-panel badges-panel">
          <div className="section-header"><h3>Badges</h3></div>
          <div className="badge-grid">
            {orderedBadges.slice(0, showProgressBadges ? orderedBadges.length : 4).map((badge, index) => (
              <div key={badge.id} className={`achievement ${badge.unlocked ? 'achievement-unlocked' : ''}`} style={{ '--badge-index': index }}>
                <div className="achievement-icon">{badge.name.slice(0, 2)}</div>
                <div><strong>{badge.name.slice(2)}</strong><span>{badge.unlocked ? 'Unlocked' : 'Locked'}</span></div>
              </div>
            ))}
          </div>
          {orderedBadges.length > 4 && <button className="ghost-btn progress-inline-toggle" onClick={() => setShowProgressBadges((current) => !current)}>{showProgressBadges ? 'Show fewer badges' : `View all badges (${orderedBadges.length})`}</button>}
        </div>

      </div>
    );
  };

  const downloadReport = async (period) => {
    try {
      let logoSrc = '/icon-192.png';
      try {
        const logoResponse = await fetch('/icon-192.png');
        const logoBlob = await logoResponse.blob();
        const logoBytes = new Uint8Array(await logoBlob.arrayBuffer());
        let binary = '';
        logoBytes.forEach((byte) => { binary += String.fromCharCode(byte); });
        logoSrc = `data:${logoBlob.type || 'image/png'};base64,${btoa(binary)}`;
      } catch {
        // Keep the path fallback if the logo cannot be loaded.
      }
      const now = new Date();
      const periodStart = new Date(now);
      const periodEnd = new Date(now);
      if (period === 'weekly') {
        periodStart.setDate(now.getDate() - 6);
        periodStart.setHours(0, 0, 0, 0);
      } else {
        periodStart.setDate(1);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd.setMonth(now.getMonth() + 1, 0);
        periodEnd.setHours(23, 59, 59, 999);
      }
      if (period === 'weekly') periodEnd.setHours(23, 59, 59, 999);
      const isInPeriod = (dateValue) => {
        const date = new Date(dateValue);
        return !Number.isNaN(date.getTime()) && date >= periodStart && date <= periodEnd;
      };
      const periodSessions = sessions.filter((session) => isInPeriod(session.createdAt));
      const periodTasksAll = tasks.filter((task) => task.date && isInPeriod(`${task.date}T12:00:00`));
      const periodTasks = periodTasksAll.filter((task) => task.completed && isInPeriod(task.completedAt || `${task.date}T23:59:59`));
      const periodTasksPending = periodTasksAll.filter((task) => !task.completed);
      const periodTasksOverdue = periodTasksPending.filter((task) => task.date < getCurrentDateKey());
      const periodQuizzes = quizHistory.filter((entry) => isInPeriod(entry.date));
      const totalStudy = periodSessions.reduce((sum, session) => sum + ((Number(session.durationSeconds) || (Number(session.durationMinutes) || 0) * 60) / 60), 0);
      const periodQuizAccuracy = periodQuizzes.length ? Math.round(periodQuizzes.reduce((sum, entry) => sum + Number(entry.accuracy || 0), 0) / periodQuizzes.length) : 0;
      const periodXp = periodSessions.reduce((sum, session) => sum + (Math.floor((Number(session.durationSeconds) || (Number(session.durationMinutes) || 0) * 60) / 60) * 2), 0)
        + (periodTasks.filter((task) => task.xpAwarded).length * 25)
        + periodQuizzes.reduce((sum, entry) => sum + (Number(entry.correct || 0) * QUIZ_CORRECT_ANSWER_XP) + QUIZ_COMPLETION_XP, 0);
      const reportTaskCompletionRate = periodTasksAll.length ? Math.round((periodTasks.length / periodTasksAll.length) * 100) : 0;
      const reportStudyTimeProgress = todayGoalMinutes > 0 ? Math.min(100, Math.round((totalStudy / (todayGoalMinutes * (period === 'weekly' ? 7 : 30))) * 100)) : 0;
      const reportOverallProgress = getOverallProgress({
        goalAverage: getGoalsProgress(goals),
        averageAccuracy: periodQuizAccuracy,
        taskCompletionRate: reportTaskCompletionRate,
        studyTimeProgress: reportStudyTimeProgress,
        hasGoals: goals.length > 0,
        hasQuizHistory: periodQuizzes.length > 0,
        hasTasks: periodTasksAll.length > 0,
        hasStudyGoal: todayGoalMinutes > 0,
      });
      const activityStart = new Date(now);
      activityStart.setDate(now.getDate() - 6);
      activityStart.setHours(0, 0, 0, 0);
      const reportActivity = Array.from({ length: 7 }, (_, index) => {
        const day = new Date(activityStart);
        day.setDate(activityStart.getDate() + index);
        const key = buildDateKey(day);
        const minutes = periodSessions.filter((session) => session.dateKey === key).reduce((sum, session) => sum + ((Number(session.durationSeconds) || (Number(session.durationMinutes) || 0) * 60) / 60), 0);
        return { label: day.toLocaleDateString(undefined, { weekday: 'short' }), minutes };
      });
      const reportActivityMax = Math.max(1, ...reportActivity.map((day) => day.minutes));
      const formatReportDate = (date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
      const reportData = {
        name: profile.name || 'Student',
        targetExam: profile.targetExam || 'Not set',
        periodLabel: `${formatReportDate(periodStart)} - ${formatReportDate(periodEnd)}`,
        downloadedAt: new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()),
        totalStudy,
        averageDailyStudy: totalStudy / (period === 'weekly' ? 7 : 30),
        tasksCompleted: periodTasks.length,
        tasksTotal: periodTasksAll.length,
        tasksPending: periodTasksPending.length,
        tasksOverdue: periodTasksOverdue.length,
        taskCompletionRate: reportTaskCompletionRate,
        goalsProgress: getGoalsProgress(goals),
        quizUnavailable: profile.targetExam && !quizExamKeys[profile.targetExam],
        quizAttempts: profile.targetExam && !quizExamKeys[profile.targetExam] ? null : periodQuizzes.length,
        quizAccuracy: profile.targetExam && !quizExamKeys[profile.targetExam] ? null : periodQuizAccuracy,
        streak,
        streakStatus: getStreakStatus({ streak, todaysMinutes }),
        xp: periodXp,
        level: levelInfo.level,
        overallProgress: reportOverallProgress,
        badges,
      };

      const chartStudy = Math.min(100, Math.round((reportData.totalStudy / 360) * 100));
      const reportSummary = reportData.totalStudy || reportData.tasksTotal || reportData.quizAttempts
        ? `You logged ${formatTimeDisplay(reportData.totalStudy * 60)} of study time, completed ${reportData.tasksCompleted} of ${reportData.tasksTotal} planned tasks, and made ${reportData.quizAttempts || 0} quiz attempt${reportData.quizAttempts === 1 ? '' : 's'} in this period.`
        : 'No study activity has been recorded in this period yet.';
      const reportNextSteps = [];
      if (!reportData.totalStudy) reportNextSteps.push('Start one focused study session.');
      if (reportData.tasksPending) reportNextSteps.push(`Review your ${reportData.tasksPending} pending task${reportData.tasksPending === 1 ? '' : 's'}.`);
      if (!reportData.quizUnavailable && !reportData.quizAttempts) reportNextSteps.push('Complete a quiz to measure your preparation.');
      if (!reportNextSteps.length) reportNextSteps.push('Keep your study rhythm consistent next period.');
      const activityHtml = reportActivity.map((day) => `<div class="activity-day"><strong>${day.minutes ? Math.round(day.minutes) : 0}</strong><div class="activity-track"><span style="height:${day.minutes ? Math.max(8, (day.minutes / reportActivityMax) * 100) : 0}%"></span></div><small>${day.label}</small></div>`).join('');
      const html = `
        <html>
          <head>
            <title>EduMe ${period === 'weekly' ? 'Weekly' : 'Monthly'} Report</title>
            <style>
              body { font-family: Arial, sans-serif; background:radial-gradient(circle at 8% 5%,rgba(124,58,237,.22),transparent 24%),radial-gradient(circle at 92% 12%,rgba(20,184,166,.2),transparent 25%),linear-gradient(135deg,#f8f5ff 0%,#ecfeff 52%,#fff7ed 100%); color:#172554; padding:32px; min-height:100vh; }
              .card { background:rgba(255,255,255,.78); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,.92); border-radius:24px; padding:24px; box-shadow:0 18px 42px rgba(71,53,145,.14); margin-bottom:20px; }
              .header { display:flex; align-items:center; justify-content:space-between; }
              .brand { display:flex; align-items:center; gap:12px; font-size:24px; font-weight:800; color:#4c1d95; }
              .brand img { width:38px; height:38px; border-radius:10px; object-fit:cover; box-shadow:0 6px 14px rgba(76,29,149,.18); }
              .badge { background:linear-gradient(135deg,#7c3aed,#db2777); color:#fff; display:inline-block; padding:8px 12px; border-radius:999px; box-shadow:0 8px 18px rgba(124,58,237,.2); }
              .grid { display:grid; grid-template-columns: repeat(2, minmax(180px, 1fr)); gap:14px; }
              .kpi-grid { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:12px; }
              .badge-grid { display:flex; flex-wrap:wrap; align-items:stretch; gap:10px; }
              .stat { background:linear-gradient(135deg,#eef2ff,#ecfeff); border-left:5px solid #4f46e5; border-radius:14px; padding:16px; }
              .stat strong, .stat div { display:block; margin-top:6px; font-size:20px; }
              .activity-grid { display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); align-items:end; gap:10px; min-height:170px; }
              .activity-day { display:grid; grid-template-rows:20px 1fr 20px; justify-items:center; gap:6px; height:150px; }
              .activity-track { width:24px; height:100%; display:flex; align-items:flex-end; overflow:hidden; border-radius:999px; background:#e2e8f0; }
              .activity-track span { display:block; width:100%; border-radius:inherit; background:linear-gradient(180deg,#7c3aed,#14b8a6); }
              .activity-day small { color:#64748b; font-size:11px; }
              .next-steps { background:linear-gradient(135deg,#e0f2fe,#ecfdf5); border:1px solid rgba(20,184,166,.3); }
              .next-steps li { margin:7px 0; }
              .badge-card { flex:0 0 auto; min-width:120px; background:linear-gradient(135deg,#fff7ed,#fdf2f8); border:1px solid #f5b4c8; border-radius:10px; padding:10px; text-align:center; }
              .badge-card strong { display:block; font-size:13px; color:#9d174d; }
              .badge-card span { display:block; margin-top:4px; font-size:11px; color:#15803d; font-weight:700; }
              .stat:nth-child(2) { background:linear-gradient(135deg,#ecfdf5,#eff6ff); border-left-color:#14b8a6; }
              .stat:nth-child(3) { background:linear-gradient(135deg,#fff7ed,#fef3c7); border-left-color:#f59e0b; }
              .stat:nth-child(4) { background:linear-gradient(135deg,#fdf2f8,#fce7f3); border-left-color:#db2777; }
              .performance-summary { background:linear-gradient(135deg,#e0f2fe,#ecfdf5 52%,#fff7ed); border:1px solid rgba(20,184,166,.36); box-shadow:0 16px 32px rgba(15,118,110,.14); }
              .bar { height: 10px; background:#e2e8f0; border-radius:999px; overflow:hidden; margin-top:6px; }
              .bar span { display:block; height:100%; background:linear-gradient(90deg,#7c3aed,#14b8a6,#f59e0b); }
              .activity-card-header { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; }
              .activity-card-header h2 { margin:5px 0 0; }
              .section-kicker { display:block; color:#64748b; font-size:11px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
              .report-subtitle { max-width:230px; margin:3px 0 0; color:#64748b; font-size:12px; line-height:1.45; text-align:right; }
              h2 { color:#312e81; margin-top:0; }
              .card:nth-of-type(2) h2 { color:#0f766e; }
              .card:nth-of-type(3) h2 { color:#c2410c; }
              .card:last-child { background:linear-gradient(135deg,#5124b7,#0f9f9a); color:#fff; text-align:center; }
              .card:last-child h2, .card:last-child p { color:#fff; }
              @media (max-width:640px) { body { padding:16px; } .header { align-items:flex-start; gap:14px; flex-direction:column; } .activity-card-header { gap:8px; flex-direction:column; } .report-subtitle { max-width:none; margin-top:0; text-align:left; white-space:nowrap; } .grid, .kpi-grid { grid-template-columns:1fr 1fr; } .activity-grid { gap:5px; } .activity-day strong { font-size:12px; } .activity-track { width:18px; } .card { padding:18px; } }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="header">
                <div class="brand"><img src="${logoSrc}" alt="EduMe logo"> <span>EDUME</span></div>
                <div class="badge">${period === 'weekly' ? 'Weekly' : 'Monthly'} Report</div>
              </div>
              <p><strong>Student:</strong> ${reportData.name}</p>
              <p><strong>Target Exam:</strong> ${reportData.targetExam}</p>
              <p><strong>Period:</strong> ${reportData.periodLabel}</p>
              <p><strong>Downloaded:</strong> ${reportData.downloadedAt}</p>
            </div>
            <div class="card">
              <h2>Study Overview</h2>
              <div class="kpi-grid">
                <div class="stat"><strong>Study Time</strong><div>${formatTimeDisplay(reportData.totalStudy * 60)}</div></div>
                <div class="stat"><strong>Tasks Done</strong><div>${reportData.tasksCompleted} / ${reportData.tasksTotal}</div></div>
                <div class="stat"><strong>Goals</strong><div>${reportData.goalsProgress}%</div></div>
                <div class="stat"><strong>Streak</strong><div>${reportData.streak} days</div></div>
              </div>
            </div>
            <div class="card">
              <h2>Task &amp; Quiz Performance</h2>
              <div class="grid">
                <div class="stat"><strong>Task Completion</strong><div>${reportData.taskCompletionRate}%</div><small>${reportData.tasksPending} pending &middot; ${reportData.tasksOverdue} overdue</small></div>
                <div class="stat"><strong>Quiz Attempts</strong><div>${reportData.quizUnavailable ? `Unavailable for ${reportData.targetExam}` : reportData.quizAttempts || 'No data'}</div></div>
                <div class="stat"><strong>Quiz Accuracy</strong><div>${reportData.quizUnavailable ? 'Unavailable' : reportData.quizAttempts ? `${reportData.quizAccuracy}%` : 'No data'}</div></div>
                <div class="stat"><strong>XP Earned</strong><div>${reportData.xp}</div><small>Level ${reportData.level}</small></div>
              </div>
            </div>
            <div class="card">
              <div class="activity-card-header">
                <div><span class="section-kicker">THIS WEEK</span><h2>Study activity</h2></div>
                <p class="report-subtitle">Minutes per day across the last seven days.</p>
              </div>
              <div class="activity-grid">${activityHtml}</div>
            </div>
            <div class="card">
              <h2>Badges</h2>
              <div class="badge-grid">
                ${reportData.badges.filter((badge) => badge.unlocked).map((badge) => `<div class="badge-card"><strong>${badge.name.slice(2)}</strong><span>Unlocked</span></div>`).join('') || '<p>No badges unlocked yet.</p>'}
              </div>
            </div>
            <div class="card performance-summary">
              <h2>Performance Summary</h2>
              <p>${reportSummary}</p>
              <h3>Recommended next steps</h3>
              <ul class="next-steps-list">${reportNextSteps.map((step) => `<li>${step}</li>`).join('')}</ul>
            </div>
            <div class="card next-steps">
              <h2>Overall Progress</h2>
              <p><strong>${reportData.overallProgress}%</strong> based on study time, goals, tasks, and quiz performance in this report period.</p>
            </div>
          </body>
        </html>
      `;

      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `EduMe-${period === 'weekly' ? 'Weekly' : 'Monthly'}-Report-${new Date().toISOString().slice(0, 10)}.html`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      triggerToast('✓ Report Downloaded');
    } catch {
      triggerToast('Unable to generate the report. Please try again.');
    }
  };

  const renderSearch = () => (
    <div className="page">
      <div className="card inset-panel about-page-card">
        <div className="section-header"><h2>Search</h2></div>
        <input className="input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search tasks or goals" />
        <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          {searchQuery.trim() === '' ? <div className="empty-state">No results found.</div> : (
            <>
              {filteredSearch.tasks.length === 0 && filteredSearch.goals.length === 0 ? (
                <div className="empty-state">No results found.</div>
              ) : (
                <>
                  {filteredSearch.tasks.map((task) => (
                    <div key={task.id} className="card" style={{ padding: 16 }}>
                      <strong>{task.name}</strong>
                      <div className="muted">{task.subject} · {task.topic || 'General'}</div>
                      <button className="secondary-btn" style={{ marginTop: 10 }} onClick={() => { navigateToPage('planner'); setCalendarDate(task.date); }}>Open</button>
                    </div>
                  ))}
                  {filteredSearch.goals.map((goal) => (
                    <div key={goal.id} className="card" style={{ padding: 16 }}>
                      <strong>{goal.name}</strong>
                      <div className="muted">{goal.description || 'Study goal'}</div>
                      <button className="secondary-btn" style={{ marginTop: 10 }} onClick={() => { navigateToPage('planner'); setGoalModal({ open: true, mode: 'edit', goal }); }}>Open</button>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  const renderSupport = () => (
    <div className="page">
      <div className="card inset-panel">
        <div className="section-header"><div><span className="section-kicker">NEED A HAND?</span><h2>Support</h2></div></div>
        <p className="muted">Send a support request from your device&apos;s default email app, or copy the address.</p>
        <div className="support-contact-card">
          <div><span className="muted support-label">Support email</span><strong className="support-email">{SUPPORT_EMAIL}</strong></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a className="primary-btn" href={SUPPORT_MAILTO_URL}>Email Support</a>
            <button className="secondary-btn" onClick={copySupportEmail}>Copy Email</button>
          </div>
        </div>
        <div className="grid" style={{ gap: 12 }}>
          <a
            className="secondary-btn"
            href="https://forms.gle/qfbnRmXkoNbwcqgQA"
            target="_blank"
            rel="noreferrer"
          >
            📝 Send Feedback
          </a>
        </div>
      </div>
    </div>
  );

  const renderAbout = () => (
    <div className="page">
      <div className="card inset-panel about-panel">
        <div className="about-page-heading"><div><span className="section-kicker">ABOUT THE APP</span><h2>About EduMe</h2><p className="muted">A focused workspace for better study habits.</p></div><div className="about-version-badge">v1.1</div></div>
          <div style={{ display: 'grid', gap: 16 }}>
          <div className="card info-card" style={{ padding: 16 }}>
            <strong className="highlight-text">App Information</strong>
            <ul className="about-info-list">
              <li>App: <button className="about-app-name-link" onClick={() => openUtilityPage('about-details')} aria-label="Open detailed information about EduMe">EduMe</button></li>
              <li>Version: <button className="version-link" onClick={() => openUtilityPage('whats-new')}>v1.1</button></li>
              <li>Type: Student Study App</li>
              <li className="about-developer-item"><span>Designed &amp; Developed by</span><button className="developer-link about-developer-link" onClick={() => setDeveloperModalOpen(true)}>Shiv Bibhuti Mishra | SBM</button></li>
            </ul>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="secondary-btn" onClick={() => openUtilityPage('terms')}>Terms & Conditions</button>
            <button className="secondary-btn" onClick={() => openUtilityPage('privacy')}>Privacy Policy</button>
          </div>
          <div className="about-referral-section">
            <div className="about-referral-copy"><span className="section-kicker">SHARE EDUME</span><h3>Study better together</h3><p className="muted">Invite a friend to build a calmer, more consistent study routine.</p><div className="referral-code-row"><span className="referral-code-label">Your invite code</span><span className="referral-code">{referralCode}</span></div></div>
            <div className="about-referral-actions"><button className="primary-btn" type="button" onClick={shareReferralLink}>{isMobileViewport ? 'Share via apps' : 'Copy invite link'}</button>{isMobileViewport && <button className="secondary-btn" type="button" onClick={copyReferralLink}>Copy link</button>}</div>
          </div>
          <div className="card about-support-section">
            <div className="section-header"><div><span className="section-kicker">NEED A HAND?</span><h3>Support</h3></div></div>
            <p className="muted">Get in touch anytime. We're here to help!</p>
            <div className="support-contact-card">
              <div><span className="muted support-label">Support email</span><strong className="support-email">{SUPPORT_EMAIL}</strong></div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a className="primary-btn" href={SUPPORT_MAILTO_URL}>Email Support</a>
                <button className="secondary-btn" onClick={copySupportEmail}>Copy Email</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a
                className="secondary-btn"
                href="https://forms.gle/qfbnRmXkoNbwcqgQA"
                target="_blank"
                rel="noreferrer"
                style={{ flex: '1 1 auto', minWidth: 'max-content' }}
              >
                📝 Send Feedback
              </a>
            </div>
          </div>
          <footer className="mobile-about-footer" aria-label="EduMe mobile footer">
            <span>© 2026 EduMe. All rights reserved.</span>
            <span>EduMe — Student Study Planner</span>
            <span>Developed with ❤️ by <button className="developer-link" onClick={() => setDeveloperModalOpen(true)}>Shiv Bibhuti Mishra | SBM</button></span>
          </footer>
        </div>
      </div>
    </div>
  );

  const renderAboutDetails = () => (
    <div className="page utility-page about-details-page">
      <div className="utility-page-header">
        <button className="icon-btn utility-back-btn" onClick={closeUtilityPage} aria-label="Go back" title="Go back">←</button>
        <div><span className="eyebrow">THE EDUME EXPERIENCE</span><h1>About EduMe</h1></div>
      </div>
      <div className="card about-details-hero">
        <div className="brand"><EduMeLogo /> <span className="highlight-text">EduMe</span></div>
        <span className="section-kicker">A FOCUSED STUDY WORKSPACE</span>
        <h2>Everything you need to build a steady study rhythm.</h2>
        <p className="muted">EduMe brings planning, focus, practice, and progress into one calm workspace designed for everyday learning.</p>
      </div>
      <div className="about-feature-grid">
        {[
          ['📋', 'Plan your day', 'Create tasks, set priorities, manage goals, and keep your study routine clear.'],
          ['⏱️', 'Focus with intention', 'Use the focus timer to record meaningful study sessions and build consistency.'],
          ['📝', 'Practice smarter', 'Take exam-focused quizzes, review your performance, and identify subjects that need attention.'],
          ['📊', 'Understand your progress', 'See study time, task completion, quiz accuracy, XP, levels, streaks, and badges in one view.'],
          ['🎯', 'Personalize your path', 'Set your exam, date, class, daily target, and weak subjects for a more relevant experience.'],
          ['🔒', 'Keep your routine close', 'Your study data is stored locally in the browser for an offline-friendly personal workspace.'],
        ].map(([icon, title, text]) => (
          <div className="card about-feature-item" key={title}><span className="about-feature-icon" aria-hidden="true">{icon}</span><div><h3>{title}</h3><p className="muted">{text}</p></div></div>
        ))}
      </div>
      <div className="card about-details-footer"><span className="section-kicker">BUILT FOR CONSISTENCY</span><h3>Small sessions become visible progress.</h3><p className="muted">EduMe is a personal organization and study-support tool. Use it to make your next useful step easier to see and easier to take.</p></div>
    </div>
  );

  const renderWhatsNew = () => (
    <div className="page utility-page">
      <div className="utility-page-header">
        <button className="icon-btn utility-back-btn" onClick={closeUtilityPage} aria-label="Go back" title="Go back">←</button>
        <div><span className="eyebrow">EDUME V1.1</span><h1>What&apos;s New</h1></div>
      </div>
      <div className="card whats-new-hero">
        <span className="section-kicker">A MORE FOCUSED STUDY WORKSPACE</span>
        <h2>Plan clearly. Study consistently. See the difference.</h2>
        <p className="muted">Version 1.1 brings a more complete daily study workflow with clearer planning, progress, and personal insights.</p>
      </div>
      <div className="whats-new-grid">
        {[
          { icon: '📚', title: 'Smarter study planning', text: 'Daily agenda summaries show planned and completed minutes for the selected date.' },
          { icon: '📊', title: 'Richer progress insights', text: 'Track weekly study activity, daily targets, subject performance, XP sources, and next-level progress.' },
          { icon: '📝', title: 'Better quiz history', text: 'Review accuracy, score, timing, performance status, and detailed quiz results in one place.' },
          { icon: '🔥', title: 'Clearer study streaks', text: 'See current and best streaks, qualifying sessions, and your last seven days of consistency.' },
          { icon: '🔔', title: 'Focused notifications', text: 'Today&apos;s study plan, urgent tasks, exam reminders, and useful next actions are organized together.' },
          { icon: '🎨', title: 'A more polished experience', text: 'Responsive layouts, improved onboarding, theme support, and clearer settings make EduMe easier to use.' },
        ].map((item) => <div className="card whats-new-item" key={item.title}><span className="whats-new-icon">{item.icon}</span><div><h3>{item.title}</h3><p className="muted" dangerouslySetInnerHTML={{ __html: item.text }} /></div></div>)}
      </div>
      <div className="card whats-new-footer"><strong>Built for your next focused session.</strong><span className="muted">Your existing local data stays on this device while you explore the update.</span></div>
    </div>
  );

  const renderTerms = () => (
    <div className="page">
      <div className="card inset-panel">
        <div className="section-header"><h2>Terms & Conditions</h2><button className="ghost-btn utility-back-btn" onClick={closeUtilityPage} aria-label="Go back" title="Go back">←</button></div>
        <div style={{ display: 'grid', gap: 18, lineHeight: 1.7 }} className="muted">
          <section><h3>1. Acceptance of these terms</h3><p>By accessing or using EduMe, you agree to these Terms & Conditions. If you do not agree with any part of these terms, please discontinue use of the application.</p></section>
          <section><h3>2. About EduMe</h3><p>EduMe is a local-first study planning and productivity application for organizing tasks, goals, focus sessions, quizzes, reminders, streaks, progress insights, and personal reports.</p></section>
          <section><h3>3. Personal use and responsibility</h3><p>You may use EduMe for personal, non-commercial study planning. You are responsible for the accuracy of the information you enter, including your profile, exam dates, tasks, goals, quiz activity, and study records.</p></section>
          <section><h3>4. Educational disclaimer</h3><p>EduMe is a productivity and study-support tool. It is not a school, coaching service, examination authority, teacher, or source of official academic advice. Always verify important dates, requirements, results, and preparation decisions with the relevant official source.</p></section>
          <section><h3>5. Your data and backups</h3><p>Profile details, planner data, goals, sessions, quiz history, XP, theme preferences, and reminder settings are stored locally in your browser. EduMe does not provide automatic server backup. Export backups when needed and keep exported files secure.</p></section>
          <section><h3>6. Acceptable use</h3><p>You must not misuse EduMe, attempt to interfere with its operation, access it through unauthorized methods, introduce malicious code, or use it in a way that violates applicable law or the rights of others.</p></section>
          <section><h3>7. Availability and changes</h3><p>EduMe is provided on an availability basis. Features, supported exams, quiz content, designs, and functionality may change over time. Quiz availability may vary by exam and available question data. Version updates may add, revise, or remove features.</p></section>
          <section><h3>8. Third-party services</h3><p>Support and feedback features may open external services, including Google Forms. Those services are operated independently and are subject to their own terms and privacy policies. EduMe is not responsible for their content, availability, or handling of information.</p></section>
          <section><h3>9. Intellectual property</h3><p>EduMe, its branding, interface, and original content are owned by or used by SBM and may not be copied, modified, distributed, or commercially exploited without permission.</p></section>
          <section><h3>10. Limitation of responsibility</h3><p>To the extent permitted by applicable law, EduMe and its developers are not responsible for loss of locally stored data, missed deadlines, inaccurate user-entered information, interruptions, or decisions made solely on the basis of the application.</p></section>
          <section><h3>11. Contact</h3><p>For questions about these terms, contact <strong>sbmplayerzofficial@gmail.com</strong>.</p></section>
        </div>
      </div>
    </div>
  );

  const renderPrivacy = () => (
    <div className="page">
      <div className="card inset-panel">
        <div className="section-header"><h2>Privacy Policy</h2><button className="ghost-btn utility-back-btn" onClick={closeUtilityPage} aria-label="Go back" title="Go back">←</button></div>
        <div style={{ display: 'grid', gap: 18, lineHeight: 1.7 }} className="muted">
          <section><h3>1. Overview</h3><p>This Privacy Policy explains how EduMe handles information when you use the application. EduMe is designed as a local-first study planner and does not require an account for its core features.</p></section>
          <section><h3>2. Information stored locally</h3><p>EduMe may store your name, target exam, exam date, class, weak subjects, daily study target, tasks, goals, study sessions, quiz history, theme preference, reminder settings, sound settings, streak, XP, badges, and generated report-related data in your browser&apos;s Local Storage.</p></section>
          <section><h3>3. How your information is used</h3><p>This information is used on your device to display your planner, calculate progress, maintain streaks and XP, provide quiz history, show reminders, and generate weekly or monthly reports. Core data is not automatically sent to an EduMe server.</p></section>
          <section><h3>4. Notifications and browser permissions</h3><p>If you enable reminders and grant browser permission, EduMe may use your browser&apos;s notification feature to show study, task, or exam reminders. Browser permission is controlled by your device and browser. You can disable reminders in EduMe Settings or revoke browser permission separately. Optional sound effects use your browser&apos;s audio capability.</p></section>
          <section><h3>5. Export, import, and deletion</h3><p>Exported backups are created locally and remain on your device unless you choose to share them. Imported data replaces or updates local app data according to the import process. Using EduMe&apos;s Clear Data option or clearing browser site data removes locally stored information. Keep a backup before deleting data.</p></section>
          <section><h3>6. External services</h3><p>The optional feedback form is hosted by Google Forms. If you submit information there, Google may process it under its own privacy policy. Copying the support email only uses your browser&apos;s clipboard after you request the action.</p></section>
          <section><h3>7. Analytics and advertising</h3><p>EduMe&apos;s core functionality does not require an account, paid API, advertising profile, or analytics tracker. External services opened by you may use their own cookies, logs, or tracking practices.</p></section>
          <section><h3>8. Security and retention</h3><p>Local data is protected by the security of your browser, device, and user account. Do not store sensitive information in EduMe. Data remains in local browser storage until you delete it, clear site data, or overwrite it.</p></section>
          <section><h3>9. Children&apos;s privacy</h3><p>EduMe is intended for students and general educational use. We do not knowingly collect personal information from children through a central EduMe account or database. Parents or guardians should supervise device and browser use where appropriate.</p></section>
          <section><h3>10. Policy updates</h3><p>This policy may be updated when EduMe&apos;s features or practices change. The latest version will be available in the application with its updated date.</p></section>
          <section><h3>11. Contact</h3><p>For privacy questions or requests, contact <strong>sbmplayerzofficial@gmail.com</strong>.</p></section>
        </div>
      </div>
    </div>
  );

  const renderTimerCard = () => (
    <div className={`card focus-timer-card ${timerLandscape ? 'timer-landscape' : ''} ${timerFinished ? 'timer-card-finished' : ''}`}>
      <div className="section-header">
        <div>
          <span className="section-kicker">FOCUS MODE</span>
          <h2>Study Timer</h2>
        </div>
        <span className={`timer-status ${timerRunning ? 'timer-status-active' : ''}`}>
          {timerRunning ? '● Running' : timerFinished ? '✓ Session saved' : '○ Ready'}
        </span>
      </div>
      <div className="timer-layout">
        <div>
          <div className="timer-display">{formatTimeDisplay(timerSeconds)}</div>
          <p className="muted timer-caption">Track real focus time. Finish the session to add it to your progress.</p>
        </div>
        <div className="timer-controls">
          {!timerRunning ? (
            <button className={timerSeconds > 0 ? 'secondary-btn' : 'primary-btn'} onClick={startTimer}>{timerSeconds > 0 ? '▶ Resume' : '▶ Start'}</button>
          ) : (
            <button className="secondary-btn" onClick={pauseTimer}><span className="pause-icon" aria-hidden="true" />Pause</button>
          )}
          <button className="ghost-btn timer-reset-btn" onClick={resetTimer}>↻ Reset</button>
          <button className="ghost-btn" onClick={openFocusMode}>Focus Mode</button>
          <button className="danger-btn" onClick={handleTimerFinish}>Finish Session</button>
        </div>
      </div>
    </div>
  );

  const renderNotifications = () => {
    const pendingTodayTasks = todayTasks.filter((task) => !task.completed);
    const upcomingNotificationTasks = upcomingTasks.filter((task) => !task.completed).slice(0, 5);
    const missedTasks = dueTasks.filter((task) => task.date < currentDateKey && !task.completed).slice(0, 5);
    const remainingGoalMinutes = Math.max(0, todayGoalMinutes - todaysMinutes);
    const completedQuizToday = quizHistory.some((entry) => String(entry.date || '').slice(0, 10) === getCurrentDateKey());
    const latestQuiz = quizHistory[0] || null;
    const latestQuizNeedsReview = latestQuiz && Number(latestQuiz.accuracy || 0) < 60;
    const urgentNotificationCount = missedTasks.length + pendingTodayTasks.length;
    const hasExamSoon = examDaysRemaining !== null && examDaysRemaining >= 0 && examDaysRemaining <= 14;

    return (
      <div className="page utility-page">
        <div className="utility-page-header">
          <button className="icon-btn utility-back-btn" onClick={closeUtilityPage} aria-label="Go back" title="Go back">←</button>
          <div><span className="eyebrow">YOUR UPDATES</span><h1>Notifications</h1></div>
        </div>
        <div className="notification-summary card">
          <div>
            <span className="section-kicker">TODAY&apos;S OVERVIEW</span>
            <strong>{urgentNotificationCount ? `${urgentNotificationCount} study update${urgentNotificationCount === 1 ? '' : 's'} need attention` : 'You are all caught up'}</strong>
            <span className="muted">{hasExamSoon ? `Exam in ${examDaysRemaining} day${examDaysRemaining === 1 ? '' : 's'}.` : 'Keep your plan moving with one focused action.'}</span>
          </div>
          <button className="primary-btn notification-summary-action" onClick={() => {
            if (missedTasks.length || pendingTodayTasks.length) navigateToPage('planner');
            else if (examDaysRemaining === null) navigateToPage('profile');
            else { startTimer(); navigateToPage('home'); }
          }}>
            {missedTasks.length || pendingTodayTasks.length ? 'Open Planner' : examDaysRemaining === null ? 'Set Exam Date' : 'Start Studying'}
          </button>
        </div>
        <div className="notification-list">
          {missedTasks.length > 0 && <section className="card notification-card notification-missed notification-priority-card">
            <div className="notification-card-title"><span className="notification-symbol">⚠️</span><div><h2>Missed Tasks</h2><span className="muted">Tasks that need your attention</span></div></div>
            <p><strong>{missedTasks.length} overdue task{missedTasks.length === 1 ? '' : 's'}.</strong> Reschedule or complete them to stay on track.</p>
            <div className="notification-row-list">{missedTasks.map((task) => <div className="notification-row" key={task.id}><span>{task.name}</span><span className="badge">{formatShortDate(task.date)}</span></div>)}</div>
            <button className="secondary-btn notification-action-btn" onClick={() => navigateToPage('planner')}>Open Planner</button>
          </section>}

          <section className="card notification-card notification-study notification-priority-card">
            <div className="notification-card-title"><span className="notification-symbol">📚</span><div><h2>Today&apos;s Study Plan</h2><span className="muted">Tasks, goals, and your next action</span></div></div>
            {pendingTodayTasks.length > 0 && <p><strong>{pendingTodayTasks.length} task{pendingTodayTasks.length === 1 ? '' : 's'} pending today.</strong> Keep your plan moving.</p>}
            {remainingGoalMinutes > 0 && <p><strong>{formatTimeDisplay(remainingGoalMinutes * 60)} left</strong> to complete today&apos;s study goal.</p>}
            {remainingGoalMinutes === 0 && todaysMinutes > 0 && <p><strong>Great work!</strong> You completed today&apos;s study goal.</p>}
            {upcomingNotificationTasks.slice(0, 3).map((task) => <div className="notification-row" key={task.id}><span>{task.name}</span><span className="badge">{formatShortDate(task.date)}</span></div>)}
            {pendingTodayTasks.length === 0 && upcomingNotificationTasks.length === 0 && remainingGoalMinutes === 0 && <p className="muted">You are all caught up for today.</p>}
            <button className="primary-btn notification-action-btn" onClick={() => { startTimer(); navigateToPage('home'); }}>Start Studying</button>
          </section>

          <section className="card notification-card notification-focus notification-focus-card">
            <div className="notification-card-title"><span className="notification-symbol">🎯</span><div><h2>Weak Subject Focus</h2><span className="muted">Extra attention for today</span></div></div>
            {weakSubjects.length > 0 ? <><div className="focus-subject-list">{weakSubjects.map((subject) => <span className="focus-subject" key={subject}>{subject}</span>)}</div><p className="focus-subject-description">{weakSubjectTasks.length ? `${weakSubjectTasks.length} related task${weakSubjectTasks.length === 1 ? '' : 's'} pending.` : 'Review these subjects in your next session.'}</p><button className="secondary-btn notification-action-btn" onClick={() => navigateToPage('planner')}>View Planner</button></> : <><p className="muted focus-subject-description">Add weak subjects in Profile to get focused recommendations.</p><button className="secondary-btn notification-action-btn" onClick={() => navigateToPage('profile')}>Open Profile</button></>}
          </section>

          <section className="card notification-card notification-exam">
            <div className="notification-card-title"><span className="notification-symbol">🗓️</span><div><h2>Upcoming Exam</h2><span className="muted">Stay prepared</span></div></div>
            {examDaysRemaining !== null && examDaysRemaining >= 0 ? <><p><strong>Exam in {examDaysRemaining} day{examDaysRemaining === 1 ? '' : 's'}.</strong> Review your plan and keep going.</p><button className="secondary-btn notification-action-btn" onClick={() => navigateToPage('profile')}>View Profile</button></> : <><p className="muted">Add an exam date in Profile to see your countdown.</p><button className="secondary-btn notification-action-btn" onClick={() => navigateToPage('profile')}>Set Exam Date</button></>}
          </section>

          <section className="card notification-card notification-streak">
            <div className="notification-card-title"><span className="notification-symbol">🔥</span><div><h2>Streak Check-in</h2><span className="muted">Protect your daily momentum</span></div></div>
            <p>{streak > 0 && todaysMinutes === 0 ? `Your ${streak}-day streak is waiting for today&apos;s first focused session.` : streak > 0 ? 'You have already studied today. Keep your streak going.' : 'Study for 10 focused minutes today to start a streak.'}</p>
          </section>

          <section className="card notification-card notification-quiz">
            <div className="notification-card-title"><span className="notification-symbol">📝</span><div><h2>Quiz Insight</h2><span className="muted">Turn practice into progress</span></div></div>
            {latestQuiz ? <p>{latestQuizNeedsReview ? `Your latest quiz score was ${latestQuiz.accuracy}%. Review this subject before your next attempt.` : `Your latest quiz score was ${latestQuiz.accuracy}%. Keep practicing to build confidence.`}</p> : <p className="muted">Take your first quiz to receive a personalized review reminder.</p>}
            <button className="secondary-btn notification-action-btn" onClick={() => navigateToPage('quiz')}>Take Quiz</button>
          </section>

          <section className="card notification-card notification-motivation">
            <div className="notification-card-title"><span className="notification-symbol">✨</span><div><h2>Keep Going</h2><span className="muted">A little progress matters</span></div></div>
            <p>{getDailyKeepGoingMessage(currentDateKey)}</p>
          </section>
        </div>
      </div>
    );
  };

  const renderStreak = () => {
    const streakDays = getStudyTrend(sessions);
    const qualifyingDates = [...new Set(sessions.filter((session) => {
      const seconds = Number(session.durationSeconds) || (Number(session.durationMinutes) || 0) * 60;
      return session.dateKey && seconds >= 600;
    }).map((session) => session.dateKey))].sort();
    let bestStreak = 0;
    let currentStreak = 0;
    let previousDate = null;
    qualifyingDates.forEach((dateKey) => {
      const date = new Date(`${dateKey}T00:00:00`);
      const gap = previousDate ? Math.floor((date - previousDate) / (1000 * 60 * 60 * 24)) : null;
      currentStreak = gap === 1 ? currentStreak + 1 : 1;
      bestStreak = Math.max(bestStreak, currentStreak);
      previousDate = date;
    });

    return (
      <div className="page utility-page streak-page">
        <div className="utility-page-header">
          <button className="icon-btn utility-back-btn" onClick={closeUtilityPage} aria-label="Go back" title="Go back">←</button>
          <div><span className="eyebrow">DAILY MOMENTUM</span><h1>Study Streak</h1></div>
        </div>
        <div className="card streak-detail-card">
          <div className="streak-detail-layout">
            <div className="streak-detail-ring" style={{ '--streak-progress': `${streakProgress * 3.6}deg` }}><strong>{Math.min(10, Math.floor(todaysMinutes))}/10</strong><span>minutes today</span></div>
            <div className="streak-detail-copy">
              <span className="section-kicker">CURRENT STREAK</span>
              <h2>{streak > 0 ? `${streak} day${streak === 1 ? '' : 's'} strong` : 'Start your streak'}</h2>
              <p className="muted">{streak >= 1 ? 'Keep showing up with one focused study session today.' : 'Your streak starts with one focused 10-minute session.'}</p>
              <button className="primary-btn" onClick={() => { startTimer(); closeUtilityPage(); }}>Start Study Session</button>
            </div>
          </div>
          <div className="streak-metrics">
            <div><span className="muted">Current streak</span><strong>{streak} day{streak === 1 ? '' : 's'}</strong></div>
            <div><span className="muted">Best streak</span><strong>{bestStreak} day{bestStreak === 1 ? '' : 's'}</strong></div>
            <div><span className="muted">Qualifying sessions</span><strong>{qualifyingDates.length}</strong></div>
          </div>
          <div className="streak-week-panel">
            <div className="section-header"><h3>Last 7 days</h3><span className="muted">10 min unlocks a day</span></div>
            <div className="streak-week-grid">{streakDays.map((day) => <div className={`streak-day ${day.minutes >= 10 ? 'complete' : ''}`} key={day.key} title={`${day.label}: ${Math.round(day.minutes)} minutes`}><span>{day.label}</span><strong>{day.minutes >= 10 ? '✓' : day.minutes ? Math.round(day.minutes) : '·'}</strong></div>)}</div>
          </div>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (page) {
      case 'planner': return renderPlanner();
      case 'profile': return renderProfile();
      case 'settings': return renderSettings();
      case 'quiz': return renderQuiz();
      case 'progress': return renderProgress();
      case 'search': return renderSearch();
      case 'support': return renderSupport();
      case 'about': return renderAbout();
      case 'about-details': return renderAboutDetails();
      case 'whats-new': return renderWhatsNew();
      case 'terms': return renderTerms();
      case 'privacy': return renderPrivacy();
      case 'notifications': return renderNotifications();
      case 'streak': return renderStreak();
      default: return renderHome();
    }
  };

  const mobileNavItems = navItems.filter((item) => !['settings', 'about'].includes(item.id));

  const renderOnboarding = () => (
    <div className="onboarding-screen">
      <div className="onboarding-shell">
        <div className="onboarding-header">
          <div className="brand onboarding-brand"><EduMeLogo className="onboarding-logo" /> <span>EduMe</span></div>
          <span className="badge">Study workspace</span>
        </div>
        <div className="onboarding-intro">
          <span className="eyebrow">A CALMER WAY TO PREPARE</span>
          <h1>Build a study rhythm that lasts.</h1>
          <p>Plan your days, focus without distractions, and see your preparation become measurable.</p>
        </div>
        <div className="onboarding-feature-grid">
          {[
            { icon: '👤', title: 'Personalize', text: 'Set your exam, date, class, and focus areas.' },
            { icon: '📚', title: 'Plan', text: 'Turn your study goals into clear daily tasks.' },
            { icon: '⏱️', title: 'Focus', text: 'Use focused sessions to build consistent momentum.' },
            { icon: '📊', title: 'Improve', text: 'Track progress, quizzes, goals, streaks, and XP.' },
          ].map((feature) => (
            <div key={feature.title} className="onboarding-feature">
              <span className="onboarding-feature-icon" aria-hidden="true">{feature.icon}</span>
              <div><h3>{feature.title}</h3><p>{feature.text}</p></div>
            </div>
          ))}
        </div>
        <div className="onboarding-next-step">
          <div><span className="section-kicker">FIRST STEP</span><strong>Complete your Profile</strong><p>Add your exam and study preferences after entering EduMe.</p></div>
          <button
            className="primary-btn"
            onClick={() => {
              writeStorage(STORAGE_KEYS.onboarding, true);
              setShowOnboarding(false);
            }}
          >
            Get Started →
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {showOnboarding ? renderOnboarding() : (
        <div className="app-shell">
          <header className="topbar">
            <button
              type="button"
              className="brand brand-button mobile-brand-button"
              onClick={() => toggleMobileUtilityPage('about')}
              aria-label={page === 'about' ? 'Back to previous page' : 'Open About page'}
              title={page === 'about' ? 'Back' : 'About'}
            >
              <EduMeLogo /> <span>EduMe</span>
            </button>
            <div className="brand desktop-brand"><EduMeLogo /> <span>EduMe</span></div>
            <div className="topbar-actions">
              <button className={`icon-btn utility-header-btn streak-header-btn streak-level-${streakLevel}`} onClick={() => openUtilityPage('streak')} aria-label={`Study streak: ${streak} days`} title={`Study streak: ${streak} days`}>
                <span aria-hidden="true" className={`streak-header-icon streak-icon-${streakLevel}`}>🔥</span><strong className="streak-header-count">{streak}</strong>
              </button>
              <button className="icon-btn utility-header-btn notification-header-btn" onClick={() => openUtilityPage('notifications')} aria-label="Open notifications" title="Notifications">
                <span aria-hidden="true">🔔</span>
              </button>
              <button
                className="icon-btn mobile-menu-toggle mobile-settings-toggle"
                onClick={() => toggleMobileUtilityPage('settings')}
                aria-label={page === 'settings' ? 'Back to previous page' : 'Open settings'}
                aria-expanded={page === 'settings'}
                title={page === 'settings' ? 'Back' : 'Settings'}
              >
                <span className="settings-glyph" aria-hidden="true">⚙️</span>
              </button>
              <button
                className="icon-btn theme-toggle"
                onClick={() => setTheme((current) => current === 'dark' ? 'oak' : current === 'oak' ? 'light' : current === 'light' ? 'system' : 'dark')}
                aria-label={`Theme: ${theme}. Change theme`}
                title={`Theme: ${theme}`}
              >
                {theme === 'dark' ? '🌙' : theme === 'oak' ? '🌳' : theme === 'system' ? '🌓' : '☀️'}
              </button>
            </div>
          </header>

          <div className="main-layout">
            <aside className="desktop-sidebar">
              <div className="card inset-panel">
                <div className="brand" style={{ marginBottom: 14 }}><EduMeLogo /> <span>EduMe</span></div>
                <div className="nav-row" style={{ display: 'grid', gap: 8 }}>
                  {navItems.map((item) => (
                    <button
                      key={item.id}
                      className={selectedNav === item.id ? 'nav-btn active' : 'nav-btn'}
                      onClick={() => navigateToPage(item.id)}
                    >
                      {item.icon} {item.label}
                    </button>
                  ))}
                </div>

                <footer className="app-footer" aria-label="EduMe footer">
                  <div className="app-footer__meta">© 2026 EduMe. All rights reserved.</div>
                  <div className="app-footer__credit">
                    <span>EduMe — Student Study Planner</span>
                    <span>Developed with ❤️ by <button className="developer-link" onClick={() => setDeveloperModalOpen(true)}>Shiv Bibhuti Mishra | SBM</button></span>
                  </div>
                </footer>
              </div>
            </aside>

            <main className="app-main">
              {showUpdateNotice && (
                <div className="update-notice" role="status">
                  <div className="update-notice-icon" aria-hidden="true">✦</div>
                  <div className="update-notice-copy"><span className="section-kicker">EDUME V1.1</span><strong>A more focused study workspace is here.</strong><p>See the latest improvements and updates.</p></div>
                  <div className="update-notice-actions"><button className="primary-btn" onClick={openWhatsNewFromNotice}>See what&apos;s new</button><button className="ghost-btn" onClick={dismissUpdateNotice}>Later</button></div>
                </div>
              )}
              {showSearch && (
                <div className="card inset-panel">
                  <div className="section-header">
                    <h2>Search</h2>
                    <button className="ghost-btn" onClick={() => { setShowSearch(false); setSearchQuery(''); }}>Close</button>
                  </div>
                  <input className="input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search tasks or goals" />
                  <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
                    {searchQuery.trim() === '' ? <div className="empty-state">No results found.</div> : (
                      filteredSearch.tasks.length === 0 && filteredSearch.goals.length === 0 ? <div className="empty-state">No results found.</div> : (
                        <>
                          {filteredSearch.tasks.map((task) => (<div key={task.id} className="card" style={{ padding: 12 }}><strong>{task.name}</strong><div className="muted">{task.subject}</div></div>))}
                          {filteredSearch.goals.map((goal) => (<div key={goal.id} className="card" style={{ padding: 12 }}><strong>{goal.name}</strong><div className="muted">{goal.description}</div></div>))}
                        </>
                      ))}
                  </div>
                </div>
              )}
              <div key={page} className="route-transition">{renderContent()}</div>
            </main>
          </div>

          <div className={`mobile-menu-backdrop ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(false)} />
          <nav className={`mobile-nav ${mobileMenuOpen ? 'open' : ''}`} aria-label="Mobile navigation">
            {mobileNavItems.map((item) => (
              <button
                key={item.id}
                className={selectedNav === item.id ? 'nav-item active' : 'nav-item'}
                onClick={() => { navigateToPage(item.id); setMobileMenuOpen(false); }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          {plannerModal.open && (
            <div className="modal-backdrop" onClick={closePlannerModal}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="section-header"><h3>{plannerModal.mode === 'edit' ? 'Edit Task' : 'Add Task'}</h3><button className="ghost-btn" onClick={closePlannerModal}>Close</button></div>
                <TaskForm
                  initialTask={plannerModal.task || {
                    name: '',
                    subject: '',
                    topic: '',
                    date: plannerModal.selectedDate || getCurrentDateKey(),
                    time: '',
                    duration: '',
                    notes: '',
                    completed: false,
                  }}
                  onSubmit={saveTask}
                  onCancel={closePlannerModal}
                />
              </div>
            </div>
          )}

          {goalModal.open && (
            <div className="modal-backdrop" onClick={() => setGoalModal({ open: false, mode: 'create', goal: null })}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="section-header"><h3>{goalModal.mode === 'edit' ? 'Edit Goal' : 'Add Goal'}</h3><button className="ghost-btn" onClick={() => setGoalModal({ open: false, mode: 'create', goal: null })}>Close</button></div>
                <GoalForm
                  initialGoal={goalModal.goal || { name: '', description: '', targetDate: '', progress: 0, completed: false }}
                  onSubmit={saveGoal}
                  onCancel={() => setGoalModal({ open: false, mode: 'create', goal: null })}
                />
              </div>
            </div>
          )}

          {deleteTaskId && (
            <div className="modal-backdrop" onClick={() => setDeleteTaskId(null)}>
              <div className="modal confirm-body" onClick={(e) => e.stopPropagation()}>
                <h3>Delete task</h3>
                <p className="muted">This action cannot be undone.</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="ghost-btn" onClick={() => setDeleteTaskId(null)}>Cancel</button>
                  <button className="danger-btn" onClick={() => deleteTask(deleteTaskId)}>Delete</button>
                </div>
              </div>
            </div>
          )}

          {deleteGoalId && (
            <div className="modal-backdrop" onClick={() => setDeleteGoalId(null)}>
              <div className="modal confirm-body" onClick={(e) => e.stopPropagation()}>
                <h3>Delete goal</h3>
                <p className="muted">This action cannot be undone.</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="ghost-btn" onClick={() => setDeleteGoalId(null)}>Cancel</button>
                  <button className="danger-btn" onClick={() => deleteGoal(deleteGoalId)}>Delete</button>
                </div>
              </div>
            </div>
          )}

          {confirmClearOpen && (
            <div className="modal-backdrop" onClick={() => setConfirmClearOpen(false)}>
              <div className="modal confirm-body" onClick={(e) => e.stopPropagation()}>
                <h3>Clear all data?</h3>
                <p className="muted">This will permanently remove your locally stored EduMe data. Make sure you have exported your data before continuing.</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="ghost-btn" onClick={() => setConfirmClearOpen(false)}>Cancel</button>
                  <button className="danger-btn" onClick={handleClearData}>Clear Data</button>
                </div>
              </div>
            </div>
          )}

          {showInstallPrompt && deferredInstallPrompt && (
            <div className="modal-backdrop install-prompt-backdrop" onClick={() => setShowInstallPrompt(false)}>
              <div className="modal install-prompt" onClick={(event) => event.stopPropagation()}>
                <div className="brand"><EduMeLogo /> <span>Install EduMe</span></div>
                <p className="muted">Install EduMe for quick access and an app-like study experience.</p>
                <div className="install-prompt-actions">
                  <button className="ghost-btn" onClick={dismissInstallPrompt}>Not now</button>
                  <button className="primary-btn" onClick={handleInstallPwa}>Install EduMe</button>
                </div>
              </div>
            </div>
          )}

          {focusModeOpen && !fullScreen && !timerOnlyMode && (
            <div className="modal-backdrop" style={{ background: 'rgba(15,23,42,0.8)' }}>
              <div ref={focusModeRef} className={`modal focus-mode-modal ${timerLandscape ? 'timer-landscape' : ''}`} style={{ background: 'var(--card)', padding: 28 }} onClick={(e) => e.stopPropagation()}>
                <div className="section-header">
                  <button className="icon-btn focus-back-btn" onClick={closeFocusMode} aria-label="Exit Focus Mode" title="Exit Focus Mode">Exit</button>
                  <span className="focus-mode-label">Focus Mode</span>
                </div>
                <div className="timer-display" style={{ margin: '18px 0' }}>{formatTimeDisplay(timerSeconds)}</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {!timerRunning ? (
                    <button className={timerSeconds > 0 ? 'secondary-btn' : 'primary-btn'} onClick={startTimer}>{timerSeconds > 0 ? '▶ Resume' : '▶ Start'}</button>
                  ) : (
                    <button className="secondary-btn" onClick={pauseTimer}><span className="pause-icon" aria-hidden="true" />Pause</button>
                  )}
                  <button className="ghost-btn timer-reset-btn" onClick={resetTimer}>↻ Reset</button>
                  <button className="ghost-btn" onClick={openFullScreenMode}>Full Screen</button>
                  <button className="danger-btn" onClick={handleTimerFinish}>Finish Session</button>
                </div>
              </div>
            </div>
          )}

          {fullScreen && timerOnlyMode && (
            <div className="timer-only-backdrop">
              <button className="icon-btn timer-only-back-btn" onClick={returnFromFullscreenToFocusMode} aria-label="Back to Focus Mode" title="Back to Focus Mode">←</button>
              <div className="timer-only-content">
                <div className="timer-only-display">{formatTimeDisplay(timerSeconds)}</div>
                <button
                  className="timer-only-control"
                  onClick={timerRunning ? pauseTimer : startTimer}
                  aria-label={timerRunning ? 'Pause timer' : timerSeconds > 0 ? 'Resume timer' : 'Start timer'}
                  title={timerRunning ? 'Pause timer' : timerSeconds > 0 ? 'Resume timer' : 'Start timer'}
                >
                  {timerRunning ? <span className="pause-icon" aria-hidden="true" /> : '▶'}
                </button>
              </div>
            </div>
          )}

          {fullScreen && !timerOnlyMode && (
            <div className="modal-backdrop" style={{ background: 'rgba(15,23,42,0.8)' }}>
              <div ref={focusModeRef} className={`modal focus-mode-modal ${timerLandscape ? 'timer-landscape' : ''}`} style={{ background: 'var(--card)', padding: 28 }} onClick={(e) => e.stopPropagation()}>
                <div className="section-header">
                  <button className="icon-btn focus-back-btn" onClick={returnFromFullscreenToFocusMode} aria-label="Back to Focus Mode" title="Back to Focus Mode">←</button>
                  <span className="focus-mode-label">Focus Mode</span>
                </div>
                <div className="timer-display" style={{ margin: '18px 0' }}>{formatTimeDisplay(timerSeconds)}</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {!timerRunning ? (
                    <button className={timerSeconds > 0 ? 'secondary-btn' : 'primary-btn'} onClick={startTimer}>{timerSeconds > 0 ? '▶ Resume' : '▶ Start'}</button>
                  ) : (
                    <button className="secondary-btn" onClick={pauseTimer}><span className="pause-icon" aria-hidden="true" />Pause</button>
                  )}
                  <button className="ghost-btn timer-reset-btn" onClick={resetTimer}>↻ Reset</button>
                  <button className="ghost-btn" onClick={openFullScreenMode}>Full Screen</button>
                  <button className="danger-btn" onClick={handleTimerFinish}>Finish Session</button>
                </div>
              </div>
            </div>
          )}

          {sessionSummary && (
            <div className="modal-backdrop celebration-backdrop" onClick={() => setSessionSummary(null)}>
              <div className="modal celebration-modal" onClick={(event) => event.stopPropagation()}>
                <div className="celebration-icon">🎉</div>
                <span className="section-kicker">FOCUS SESSION COMPLETE</span>
                <h2>Session complete</h2>
                <p className="muted">Your focused study time has been added to today&apos;s progress.</p>
                <div className="celebration-stats">
                  <div><strong>{formatTimeDisplay(sessionSummary.durationMinutes * 60)}</strong><span>Focus time</span></div>
                  <div><strong>+{sessionSummary.xpEarned} XP</strong><span>Earned</span></div>
                  <div><strong>Level {sessionSummary.level}</strong><span>Current level</span></div>
                </div>
                <div className="celebration-badges">
                  <strong>Achievement progress</strong>
                  <div className="badge-grid">
                    {[...sessionSummary.badges.filter((badge) => badge.unlocked), ...sessionSummary.badges.filter((badge) => !badge.unlocked)].slice(0, 5).map((badge) => (
                      <div key={badge.id} className={`achievement ${badge.unlocked ? 'achievement-unlocked' : ''}`}>
                        <div className="achievement-icon">{badge.name.slice(0, 2)}</div>
                        <div><strong>{badge.name.slice(2)}</strong><span>{badge.unlocked ? 'Unlocked' : 'Keep going'}</span></div>
                      </div>
                    ))}

                  </div>
                </div>
                <button className="primary-btn celebration-close" onClick={() => setSessionSummary(null)}>Continue</button>
              </div>
            </div>
          )}

          {developerModalOpen && (
            <div className="modal-backdrop developer-modal-overlay" onClick={() => setDeveloperModalOpen(false)}>
              <div className="modal developer-modal-card" role="dialog" aria-modal="true" aria-labelledby="developer-modal-title" onClick={(event) => event.stopPropagation()}>
                <button className="icon-btn developer-modal-close" onClick={() => setDeveloperModalOpen(false)} aria-label="Close developer profile" title="Close">×</button>
                <img className="developer-modal-avatar" src={`${import.meta.env.BASE_URL}image-1789912580558.jpeg`} alt="Shiv Bibhuti Mishra" />
                <span className="section-kicker">THE CREATOR BEHIND EDUME</span>
                <h2 id="developer-modal-title">Shiv Bibhuti Mishra | SBM</h2>
                <h3>Creator of EduMe | Web Developer</h3>
                <p className="developer-modal-bio">Building EduMe 🚀 | Student &amp; Developer 📚<br />Learning • Building • Improving ✨<br />Turning ideas into useful projects.</p>
                <div className="developer-social-links" aria-label="Developer social links">
                  <a className="primary-btn" href="https://github.com/sbmnexus" target="_blank" rel="noreferrer">GitHub ↗</a>
                  <a className="secondary-btn" href="https://www.linkedin.com/in/shiv-bibhuti-mishra" target="_blank" rel="noreferrer">LinkedIn ↗</a>
                </div>
              </div>
            </div>
          )}

          {toast && <div className="toaster"><div className="toast">{toast}</div></div>}
        </div>
      )}
    </>
  );
}

function ToggleSwitch({ enabled, onToggle }) {
  return (
    <button
      type="button"
      className={`switch ${enabled ? 'on' : ''}`}
      aria-label={enabled ? 'Turn off' : 'Turn on'}
      aria-pressed={enabled}
      onClick={onToggle}
    >
      <span className="switch-label" aria-hidden="true">{enabled ? 'ON' : 'OFF'}</span>
      <span className="switch-thumb" />
    </button>
  );
}

function TaskForm({ initialTask, onSubmit, onCancel }) {
  const [form, setForm] = useState(initialTask);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <div className="form-grid task-form">
      <div>
        <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Task Name</label>
        <input className="input" value={form.name} onChange={(e) => update('name', e.target.value)} />
      </div>
      <div>
        <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Subject</label>
        <input className="input" value={form.subject} onChange={(e) => update('subject', e.target.value)} />
      </div>
      <div>
        <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Topic</label>
        <input className="input" value={form.topic} onChange={(e) => update('topic', e.target.value)} />
      </div>
      <div>
        <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Date</label>
        <input className="input" type="date" value={form.date || getCurrentDateKey()} onChange={(e) => update('date', e.target.value)} />
      </div>
      <div>
        <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Notes</label>
        <textarea className="textarea" value={form.notes || ''} onChange={(e) => update('notes', e.target.value)} />
      </div>
      <div className="form-actions task-form-actions">
        <button type="button" className="ghost-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="primary-btn" onClick={() => onSubmit({ ...form, name: form.name.trim(), subject: form.subject.trim(), topic: form.topic.trim(), notes: form.notes?.trim() || '' })}>Save</button>
      </div>
    </div>
  );
}

function GoalForm({ initialGoal, onSubmit, onCancel }) {
  const [form, setForm] = useState(initialGoal);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <div className="form-grid">
      <div>
        <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Goal Name</label>
        <input className="input" value={form.name} onChange={(e) => update('name', e.target.value)} />
      </div>
      <div>
        <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Description</label>
        <textarea className="textarea" value={form.description || ''} onChange={(e) => update('description', e.target.value)} />
      </div>
      <div>
        <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Target Date</label>
        <input className="input" type="date" value={form.targetDate} onChange={(e) => update('targetDate', e.target.value)} />
      </div>
      <div>
        <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Progress</label>
        <input className="input" type="number" min="0" max="100" value={form.progress || 0} onChange={(e) => update('progress', Number(e.target.value))} />
      </div>
      <div className="form-actions">
        <button type="button" className="ghost-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="primary-btn" onClick={() => onSubmit({ ...form, name: form.name.trim(), description: form.description?.trim() || '', progress: Math.min(100, Math.max(0, Number(form.progress || 0))) })}>Save</button>
      </div>
    </div>
  );
}

function CalendarView({ tasks, selectedDate, onSelectDate, onAddTask }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const firstDayOfWeek = monthStart.getDay();
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();

  const cellDates = [];
  for (let cell = 0; cell < 42; cell += 1) {
    const offset = cell - firstDayOfWeek + 1;
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), offset);
    cellDates.push(date);
  }

  return (
    <div>
      <div className="section-header">
        <button className="ghost-btn" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>Prev</button>
        <h3>{currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
        <button className="ghost-btn" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>Next</button>
      </div>
      <div className="calendar-grid" style={{ marginBottom: 12 }}>
        {dayNames.map((day) => (
          <div key={day} className="muted" style={{ textAlign: 'center', padding: 8, fontSize: '0.8rem', fontWeight: 700 }}>{day}</div>
        ))}
        {cellDates.map((date, index) => {
          const key = buildDateKey(date);
          const cellTasks = tasks.filter((task) => task.date === key);
          const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
          const isSelected = selectedDate === key;
          const isToday = buildDateKey(new Date()) === key;
          return (
            <button
              key={`${key}-${index}`}
              className={`calendar-cell ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
              style={{ opacity: isCurrentMonth ? 1 : 0.55 }}
              onClick={() => { onSelectDate(key); }}
            >
              <span className="calendar-date">{date.getDate()}</span>
              {cellTasks.length > 0 && <span className="calendar-dot" aria-label={`${cellTasks.length} tasks`}></span>}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span className="muted">Selected date: {formatShortDate(selectedDate)}</span>
        <button className="primary-btn" onClick={() => onAddTask(selectedDate)}>Add Task</button>
      </div>
    </div>
  );
}

export default App;
