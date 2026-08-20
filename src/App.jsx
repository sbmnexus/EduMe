import { useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEYS = {
  onboarding: 'edume_onboarding_complete',
  profile: 'edume_profile',
  tasks: 'edume_tasks',
  goals: 'edume_goals',
  sessions: 'edume_sessions',
  settings: 'edume_settings',
  theme: 'edume_theme',
  streak: 'edume_streak',
  quizHistory: 'edume_quiz_history',
  xp: 'edume_xp',
};

const defaultProfile = {
  name: '',
  targetExam: 'JEE',
  examDate: '',
  className: '',
  weakSubjects: '',
  dailyStudyHours: '3',
  photo: '',
};

const defaultSettings = {
  studyReminder: true,
  notificationReminder: true,
  soundEffects: true,
  theme: 'system',
};

const navItems = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'planner', label: 'Planner', icon: '📋' },
  { id: 'quiz', label: 'Quiz', icon: '📝' },
  { id: 'progress', label: 'Progress', icon: '📊' },
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
  { id: 'support', label: 'Support', icon: '💬' },
  { id: 'about', label: 'About', icon: 'ℹ️' },
];

const examSubjects = {
  JEE: ['Physics', 'Chemistry', 'Mathematics'],
  NEET: ['Physics', 'Chemistry', 'Biology'],
  Board: ['Physics', 'Chemistry', 'Mathematics', 'Biology'],
};

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const frequencies = { tap: 520, success: 740, finish: 880, error: 220 };
    oscillator.type = 'sine';
    oscillator.frequency.value = frequencies[type] || frequencies.tap;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + (type === 'finish' ? 0.3 : 0.12));
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (type === 'finish' ? 0.32 : 0.14));
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

function getUpcomingTasks(tasks) {
  const now = new Date();
  return [...tasks]
    .filter((task) => new Date(task.date + 'T00:00:00') >= new Date(now.toDateString()))
    .sort((a, b) => new Date(a.date + 'T00:00:00') - new Date(b.date + 'T00:00:00'));
}

function calculateDailyStudyMinutes(sessions) {
  const today = new Date();
  const dayKey = buildDateKey(today);
  return sessions
    .filter((s) => s.dateKey === dayKey)
    .reduce((sum, s) => sum + Number(s.durationMinutes || 0), 0);
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
    day.minutes += Number(session.durationMinutes || 0);
    day.sessions += 1;
  });
  return days;
}

function calculateStreak(tasks, sessions) {
  const uniqueDays = new Set();
  const allStudyDates = sessions.map((s) => s.dateKey).filter(Boolean);
  allStudyDates.forEach((d) => uniqueDays.add(d));
  tasks.filter((task) => task.completed).forEach((task) => uniqueDays.add(task.date));

  let streak = 0;
  const cursor = new Date();
  while (true) {
    const key = buildDateKey(cursor);
    if (uniqueDays.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
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

function getGoalsProgress(goals) {
  if (!goals.length) return 0;
  const total = goals.reduce((sum, goal) => sum + Number(goal.progress || 0), 0);
  return Math.round(total / goals.length);
}

function getBadges({ xp, streak, quizHistory, completedTasksCount }) {
  return [
    { id: 'first-step', name: '🌱 First Step', unlocked: xp >= 50 },
    { id: 'study-warrior', name: '📚 Study Warrior', unlocked: xp >= 300 },
    { id: 'seven-day', name: '🔥 7 Day Streak', unlocked: streak >= 7 },
    { id: 'goal-crusher', name: '🎯 Goal Crusher', unlocked: completedTasksCount >= 10 },
    { id: 'quiz-master', name: '🏆 Quiz Master', unlocked: quizHistory.length >= 5 },
  ];
}

function App() {
  const [page, setPage] = useState('home');
  const [showOnboarding, setShowOnboarding] = useState(() => !readStorage(STORAGE_KEYS.onboarding, false));
  const [profile, setProfile] = useState(() => readStorage(STORAGE_KEYS.profile, defaultProfile));
  const [tasks, setTasks] = useState(() => readStorage(STORAGE_KEYS.tasks, []));
  const [goals, setGoals] = useState(() => readStorage(STORAGE_KEYS.goals, []));
  const [sessions, setSessions] = useState(() => readStorage(STORAGE_KEYS.sessions, []));
  const [settings, setSettings] = useState(() => ({ ...defaultSettings, ...readStorage(STORAGE_KEYS.settings, defaultSettings) }));
  const [theme, setTheme] = useState(() => readStorage(STORAGE_KEYS.theme, 'system'));
  const [xp, setXp] = useState(() => Number(readStorage(STORAGE_KEYS.xp, 0)) || 0);
  const [quizHistory, setQuizHistory] = useState(() => readStorage(STORAGE_KEYS.quizHistory, []));
  const [questionBank, setQuestionBank] = useState([]);
  const [quizExam, setQuizExam] = useState('JEE');
  const [quizSubject, setQuizSubject] = useState('Physics');
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizResult, setQuizResult] = useState(null);
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
  const [sessionSummary, setSessionSummary] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerFinished, setTimerFinished] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [calendarDate, setCalendarDate] = useState(getCurrentDateKey());
  const [selectedNav, setSelectedNav] = useState('home');
  const intervalRef = useRef(null);

  const todayTasks = useMemo(() => getTodayTasks(tasks), [tasks]);
  const upcomingTasks = useMemo(() => getUpcomingTasks(tasks), [tasks]);
  const todaysMinutes = useMemo(() => calculateDailyStudyMinutes(sessions), [sessions]);
  const streak = useMemo(() => calculateStreak(tasks, sessions), [tasks, sessions]);
  const activeGoals = useMemo(() => goals.filter((g) => !g.completed), [goals]);
  const completedGoals = useMemo(() => goals.filter((g) => g.completed), [goals]);
  const todayGoalMinutes = Number(profile.dailyStudyHours || 0) * 60;
  const goalProgress = todayGoalMinutes > 0 ? Math.min(100, (todaysMinutes / todayGoalMinutes) * 100) : 0;
  const levelInfo = useMemo(() => getLevelForXp(xp), [xp]);
  const badges = useMemo(
    () => getBadges({ xp, streak, quizHistory, completedTasksCount: tasks.filter((task) => task.completed).length }),
    [xp, streak, quizHistory, tasks],
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
    return { minutes: items.reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0), sessions: items.length };
  }, [sessions]);
  const monthlySummary = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const items = sessions.filter((session) => {
      const date = new Date(session.createdAt);
      return date >= start && date <= end;
    });
    return { minutes: items.reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0), sessions: items.length };
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
      document.body.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      return;
    }
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.profile, profile);
  }, [profile]);

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
      .then((response) => response.json())
      .then((questions) => setQuestionBank(Array.isArray(questions) ? questions : []))
      .catch(() => setQuestionBank([]));
  }, []);

  useEffect(() => {
    if (examSubjects[quizExam]) {
      setQuizSubject((prev) => {
        const valid = examSubjects[quizExam];
        return valid.includes(prev) ? prev : valid[0];
      });
    }
  }, [quizExam]);

  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === 'Escape') {
        setFullScreen(false);
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
    if (!timerRunning) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [timerRunning]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      if (theme === 'system') {
        document.body.setAttribute('data-theme', media.matches ? 'dark' : 'light');
      }
    };
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [theme]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    const onAppInstalled = () => {
      setDeferredInstallPrompt(null);
      setShowInstallHelp(false);
      triggerToast('✓ EduMe installed successfully');
    };
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const triggerToast = (message) => setToast(message);
  const playSound = (type = 'tap') => {
    if (settings.soundEffects) playFeedbackTone(type);
  };

  const copySupportEmail = async () => {
    try {
      await navigator.clipboard.writeText('sbmplayerzofficial@gmail.com');
      triggerToast('✓ Support email copied');
    } catch {
      triggerToast('Copy is unavailable in this browser.');
    }
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
    setTasks((current) => current.map((task) => {
      if (task.id !== taskId) return task;
      const completed = !task.completed;
      wasCompleted = task.completed;
      completedNow = completed;
      return { ...task, completed };
    }));
    if (completedNow) {
      setXp((current) => current + 25);
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

  const handleTimerFinish = () => {
    if (timerSeconds < 1) {
      triggerToast('Start the timer before finishing a session.');
      return;
    }
    const durationMinutes = Math.max(1, Math.round(timerSeconds / 60));
    const session = {
      id: makeId('session'),
      durationMinutes,
      dateKey: getCurrentDateKey(),
      createdAt: new Date().toISOString(),
    };
    const xpEarned = Math.max(10, durationMinutes * 5);
    const nextXp = xp + xpEarned;
    const nextLevelInfo = getLevelForXp(nextXp);
    const nextBadges = getBadges({ xp: nextXp, streak, quizHistory, completedTasksCount: tasks.filter((task) => task.completed).length });
    setSessions((current) => {
      const existing = current.filter((item) => item.createdAt !== session.createdAt);
      return [session, ...existing];
    });
    setTimerRunning(false);
    setTimerFinished(true);
    setTimerSeconds(0);
    setXp(nextXp);
    setSessionSummary({ durationMinutes, xpEarned, level: nextLevelInfo.level, badges: nextBadges });
    playSound('finish');
    triggerToast('✓ Study Session Saved');
  };

  const handleProfilePhotoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      triggerToast('Please upload a valid image file.');
      event.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      triggerToast('Please choose an image under 2MB.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setProfile((current) => ({ ...current, photo: dataUrl }));
      triggerToast('✓ Profile photo updated');
      event.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleProfileSave = (event) => {
    event.preventDefault();
    if (!profile.name?.trim()) {
      triggerToast('Please enter your name.');
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
    setShowOnboarding(true);
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
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      setGoals(Array.isArray(data.goals) ? data.goals : []);
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setSettings(nextSettings);
      setTheme(data.theme || 'system');
      setQuizHistory(Array.isArray(data.quizHistory) ? data.quizHistory : []);
      setXp(Number(data.xp || 0));
      writeStorage(STORAGE_KEYS.profile, data.profile || defaultProfile);
      writeStorage(STORAGE_KEYS.tasks, Array.isArray(data.tasks) ? data.tasks : []);
      writeStorage(STORAGE_KEYS.goals, Array.isArray(data.goals) ? data.goals : []);
      writeStorage(STORAGE_KEYS.sessions, Array.isArray(data.sessions) ? data.sessions : []);
      writeStorage(STORAGE_KEYS.settings, nextSettings);
      writeStorage(STORAGE_KEYS.theme, data.theme || 'system');
      writeStorage(STORAGE_KEYS.quizHistory, Array.isArray(data.quizHistory) ? data.quizHistory : []);
      writeStorage(STORAGE_KEYS.xp, Number(data.xp || 0));
      writeStorage(STORAGE_KEYS.onboarding, Boolean(data.onboarding ?? false));
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

    const pool = questionBank.filter((question) => question.exam === quizExam && question.subject === quizSubject);
    const selected = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(pool.length, 10));
    if (!selected.length) {
      triggerToast('No questions available for this subject.');
      return;
    }

    setQuizQuestions(selected);
    setQuizStarted(true);
    setQuizResult(null);
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
      score: `${correctAnswers} / ${quizQuestions.length}`,
      accuracy,
      correct: correctAnswers,
      wrong: wrongAnswers,
      time: formatTimeDisplay(timeSpentSeconds),
    };

    setQuizResult(result);
    setQuizStarted(false);
    setQuizHistory((current) => [result, ...current].slice(0, 50));
    setXp((current) => current + (correctAnswers * 15) + 30);
    playSound('finish');
    triggerToast('🎉 Quiz Completed!');
  };

  const currentQuestion = quizQuestions[quizStep] || null;

  const renderHome = () => (
    <div className="page">
      <div className="section-header">
        <div>
          <p className="muted" style={{ margin: 0, fontWeight: 700 }}>Welcome</p>
          <h1 className="greeting">{getGreeting()}, {profile.name || 'Student'} 👋</h1>
        </div>
        <button className="primary-btn" onClick={() => setPage('planner')}>Add Task</button>
      </div>

      {renderTimerCard()}

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
                <strong>{Number(profile.dailyStudyHours || 0)}h</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span className="muted">Completed</span>
                <strong>{formatTimeDisplay(todaysMinutes * 60)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span className="muted">Remaining</span>
                <strong>{formatTimeDisplay(Math.max(0, (Number(profile.dailyStudyHours || 0) * 3600) - todaysMinutes * 60))}</strong>
              </div>
              <div className="progress-bar"><span style={{ width: `${Math.min(100, goalProgress)}%` }} /></div>
            </div>
          </div>

          <div className="card list-card home-panel-tasks">
            <div className="section-header">
              <h2>Today&apos;s Tasks</h2>
              <button className="ghost-btn" onClick={() => setPage('planner')}>View all</button>
            </div>
            {todayTasks.length === 0 ? (
              <div className="empty-state">No tasks planned yet. Add your first study task.</div>
            ) : (
              <div>
                {todayTasks.map((task) => (
                  <div className="task-item" key={task.id}>
                    <div className="task-main">
                      <button
                        className={`check-box ${task.completed ? 'checked' : ''}`}
                        aria-label={task.completed ? 'Mark uncomplete' : 'Mark complete'}
                        onClick={() => toggleTaskComplete(task.id)}
                      />
                      <div>
                        <div style={{ fontWeight: 700 }}>{task.name}</div>
                        <div className="muted">{task.subject} · {task.topic || 'General'}</div>
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
            <div className="section-header">
              <h3>Reminders</h3>
            </div>
            {upcomingTasks.length === 0 ? (
              <div className="empty-state">No reminders for today.</div>
            ) : (
              <div>
                {upcomingTasks.slice(0, 3).map((task) => (
                  <div key={task.id} className="task-item">
                    <div>
                      <strong>{task.name}</strong>
                      <div className="muted">{task.subject} · {formatShortDate(task.date)}</div>
                    </div>
                    <span className="badge">{formatShortDate(task.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card list-card home-panel-study-time">
            <div className="section-header"><h3>Study Time</h3></div>
            <div style={{ fontSize: '2rem', fontWeight: 800 }}>{formatTimeDisplay(todaysMinutes * 60)}</div>
          </div>

          <div className="card list-card home-panel-streak">
            <div className="section-header"><h3>Streak</h3></div>
            <div style={{ fontSize: '2rem', fontWeight: 800 }}>{streak} days</div>
          </div>

          <div className="card list-card home-panel-goals">
            <div className="section-header"><h3>Goals</h3><button className="ghost-btn" onClick={() => setPage('planner')}>Manage</button></div>
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
                    <button className="secondary-btn" onClick={() => setPage('planner')}>Open</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card list-card home-panel-actions">
            <div className="section-header"><h3>Quick Actions</h3></div>
            <div className="grid" style={{ gap: 10 }}>
              <button className="primary-btn" onClick={() => setPage('planner')}>Start Studying</button>
              <button className="secondary-btn" onClick={() => openPlannerModal()}>Add Task</button>
              <button className="ghost-btn" onClick={() => setGoalModal({ open: true, mode: 'create', goal: null })}>Add Goal</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPlanner = () => (
    <div className="page planner-page">
      <div className="section-header">
        <h2>Study Planner</h2>
        <button className="primary-btn" onClick={() => openPlannerModal()}>Add Task</button>
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
        <div className="section-header"><h3>Tasks for {formatShortDate(calendarDate)}</h3></div>
        {tasks.filter((task) => task.date === calendarDate).length === 0 ? (
          <div className="empty-state">No tasks planned yet. Add your first study task.</div>
        ) : (
          <div>
            {tasks.filter((task) => task.date === calendarDate).map((task) => (
              <div className="task-item" key={task.id}>
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
                  <div key={goal.id} className="card" style={{ padding: 14, marginBottom: 12 }}>
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
                  <div key={goal.id} className="card" style={{ padding: 14, marginBottom: 12, opacity: 0.8 }}>
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

  const renderProfile = () => (
    <div className="page">
          <div className="card inset-panel quiz-panel quiz-setup-panel">
        <div className="section-header"><h2>Profile</h2></div>
        <form className="form-grid" onSubmit={handleProfileSave}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="muted" style={{ display: 'block', marginBottom: 10 }}>Profile Photo</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--border)', background: 'var(--card-alt)', display: 'grid', placeItems: 'center' }}>
                {profile.photo ? (
                  <img src={profile.photo} alt="Profile preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 32 }}>👤</span>
                )}
              </div>
              <div>
                <button type="button" className="secondary-btn" onClick={() => document.getElementById('profile-photo-upload').click()}>
                  Upload Photo
                </button>
                <input id="profile-photo-upload" type="file" accept="image/*" hidden onChange={handleProfilePhotoUpload} />
                {profile.photo && (
                  <button
                    type="button"
                    className="ghost-btn"
                    style={{ marginLeft: 8 }}
                    onClick={() => setProfile((current) => ({ ...current, photo: '' }))}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Name</label>
            <input className="input" value={profile.name} onChange={(e) => setProfile((current) => ({ ...current, name: e.target.value }))} />
          </div>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Target Exam</label>
            <select className="select" value={profile.targetExam} onChange={(e) => setProfile((current) => ({ ...current, targetExam: e.target.value }))}>
              <option>UPSC</option><option>JEE</option><option>NEET</option><option>CUET</option><option>SSC</option><option>NDA</option><option>Other</option>
            </select>
          </div>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Exam Date</label>
            <input className="input" type="date" value={profile.examDate} onChange={(e) => setProfile((current) => ({ ...current, examDate: e.target.value }))} />
          </div>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Class</label>
            <input className="input" value={profile.className} onChange={(e) => setProfile((current) => ({ ...current, className: e.target.value }))} placeholder="12" />
          </div>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Weak Subjects</label>
            <input className="input" value={profile.weakSubjects} onChange={(e) => setProfile((current) => ({ ...current, weakSubjects: e.target.value }))} placeholder="Physics, Mathematics" />
          </div>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Daily Study Hours</label>
            <input className="input" type="number" min="1" max="24" value={profile.dailyStudyHours} onChange={(e) => setProfile((current) => ({ ...current, dailyStudyHours: e.target.value }))} />
          </div>
          <button className="primary-btn" type="submit">Save Profile</button>
        </form>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="page">
      <div className="card inset-panel profile-panel">
        <div className="section-header"><h2>⚙️ Settings</h2></div>
        <div className="form-grid">
          <div className="card settings-card" style={{ padding: 16 }}>
            <h3>🔔 Notifications & Reminders</h3>
            <div className="task-item" style={{ paddingTop: 0 }}>
              <span>Study Reminder</span>
              <ToggleSwitch enabled={settings.studyReminder} onToggle={() => setSettings((current) => ({ ...current, studyReminder: !current.studyReminder }))} />
            </div>
            <div className="task-item" style={{ paddingTop: 0 }}>
              <span>Notification Reminder</span>
              <ToggleSwitch enabled={settings.notificationReminder} onToggle={() => setSettings((current) => ({ ...current, notificationReminder: !current.notificationReminder }))} />
            </div>
          </div>

          <div className="card settings-card" style={{ padding: 16 }}>
            <h3>🔊 Sound</h3>
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

          <div className="card" style={{ padding: 16 }}>
            <h3>Theme</h3>
            <div className="nav-row">
              {['light', 'dark', 'system'].map((option) => (
                <button
                  key={option}
                  className={theme === option ? 'primary-btn' : 'ghost-btn'}
                  onClick={() => setTheme(option)}
                >
                  {option === 'light' ? 'Light' : option === 'dark' ? 'Dark' : 'System Default'}
                </button>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3>📦 Data</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="secondary-btn" onClick={downloadBackup}>Export Data</button>
              <button className="secondary-btn" onClick={() => document.getElementById('import-backup-file').click()}>Import Data</button>
              <input id="import-backup-file" type="file" accept="application/json" hidden onChange={handleImportBackup} />
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3>📲 Install App</h3>
            <p className="muted">Install EduMe as a PWA and use it like a mobile app.</p>
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

          <div className="card" style={{ padding: 16 }}>
            <h3>🗑️ Clear Data</h3>
            <p className="muted">This will permanently remove your locally stored EduMe data. Make sure you have exported your data before continuing.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="ghost-btn" onClick={() => setConfirmClearOpen(false)}>Cancel</button>
              <button className="danger-btn" onClick={() => setConfirmClearOpen(true)}>Clear Data</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderQuiz = () => {
    const availableSubjects = examSubjects[quizExam] || [];

    if (!quizStarted && !quizResult) {
      return (
        <div className="page">
          <div className="card inset-panel quiz-history-panel">
            <div className="section-header"><h2>Quiz</h2></div>
            <div className="form-grid">
              <div>
                <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Select Exam</label>
                <select className="select" value={quizExam} onChange={(event) => setQuizExam(event.target.value)}>
                  <option value="JEE">JEE</option>
                  <option value="NEET">NEET</option>
                  <option value="Board">Board</option>
                </select>
              </div>
              <div>
                <label className="muted" style={{ display: 'block', marginBottom: 8 }}>Select Subject</label>
                <select className="select" value={quizSubject} onChange={(event) => setQuizSubject(event.target.value)}>
                  {availableSubjects.map((subject) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
              </div>
              <button className="primary-btn" onClick={startQuiz}>Start Quiz</button>
            </div>
          </div>

          <div className="card inset-panel quiz-question-panel">
            <h3>Quiz History</h3>
            {quizHistory.length === 0 ? (
              <div className="empty-state">Start studying to build your progress.</div>
            ) : (
              <div className="grid" style={{ gap: 10 }}>
                {quizHistory.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="card" style={{ padding: 12 }}>
                    <strong>{entry.exam} · {entry.subject}</strong>
                    <div className="muted">{entry.score} · {entry.accuracy}%</div>
                  </div>
                ))}
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
              <button className="primary-btn" onClick={() => { setQuizResult(null); setQuizQuestions([]); setSelectedAnswers({}); setQuizStep(0); }}>Retake Quiz</button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderProgress = () => {
    const tasksCompleted = tasks.filter((task) => task.completed).length;
    const averageAccuracy = quizHistory.length ? Math.round(quizHistory.reduce((sum, entry) => sum + Number(entry.accuracy || 0), 0) / quizHistory.length) : 0;
    const goalAverage = goals.length ? Math.round(goals.reduce((sum, goal) => sum + Number(goal.progress || 0), 0) / goals.length) : 0;
    const overallProgress = Math.round((goalAverage + averageAccuracy) / 2);

    return (
      <div className="page">
        <div className="progress-hero">
          <div>
            <span className="eyebrow">YOUR LEARNING SNAPSHOT</span>
            <h2>Progress that feels <span className="highlight-text">worth celebrating.</span></h2>
            <p className="muted">Small sessions are adding up. Keep the momentum going, {profile.name || 'Student'}.</p>
            <div className="hero-pills">
              <span className="report-pill">🔥 {streak} day streak</span>
              <span className="report-pill">⚡ Level {levelInfo.level}</span>
            </div>
          </div>
          <div className="overall-score">
            <div className="score-ring" style={{ '--score': `${overallProgress * 3.6}deg` }}><strong>{overallProgress}%</strong></div>
            <span>overall progress</span>
          </div>
        </div>

        <div className="report-section-heading report-section-heading-01"><span className="section-kicker">01</span><div><h3>Study rhythm</h3><p className="muted">Your time, consistency, and completed work.</p></div></div>
        <div className="progress-stat-grid">
          <div className="progress-stat progress-stat-violet"><span>Today&apos;s study time</span><strong>{formatTimeDisplay(todaysMinutes * 60)}</strong><small>Keep the streak alive</small></div>
          <div className="progress-stat progress-stat-teal"><span>Weekly study time</span><strong>{formatTimeDisplay(weeklySummary.minutes * 60)}</strong><small>Your last 7 days</small></div>
          <div className="progress-stat progress-stat-orange"><span>Monthly study time</span><strong>{formatTimeDisplay(monthlySummary.minutes * 60)}</strong><small>Long-term consistency</small></div>
          <div className="progress-stat progress-stat-pink"><span>Tasks completed</span><strong>{tasksCompleted}</strong><small>One step at a time</small></div>
        </div>

        <div className="report-section-heading report-section-heading-02"><span className="section-kicker">02</span><div><h3>Learning wins</h3><p className="muted">The numbers behind your growth.</p></div></div>
        <div className="progress-stat-grid progress-stat-grid-compact">
          <div className="progress-stat progress-stat-blue"><span>Goals progress</span><strong>{goalAverage}%</strong><div className="mini-progress"><span style={{ width: `${goalAverage}%` }} /></div></div>
          <div className="progress-stat progress-stat-green"><span>Quiz accuracy</span><strong>{averageAccuracy}%</strong><div className="mini-progress"><span style={{ width: `${averageAccuracy}%` }} /></div></div>
          <div className="progress-stat progress-stat-indigo"><span>Quiz attempts</span><strong>{quizHistory.length}</strong><small>Practice builds confidence</small></div>
          <div className="progress-stat progress-stat-gold"><span>Total XP</span><strong>{xp}</strong><small>{levelInfo.currentLevelXp} / 250 to next level</small></div>
        </div>

        <div className="level-panel card report-section-03">
          <div className="section-header"><div><span className="section-kicker">03</span><h3>Next level unlocked</h3></div><strong className="highlight-text">Level {levelInfo.level}</strong></div>
          <div className="progress-bar"><span style={{ width: `${levelInfo.progress}%` }} /></div>
          <div className="level-meta"><span>{levelInfo.progress}% complete</span><span>{250 - levelInfo.currentLevelXp} XP to go</span></div>
        </div>

        <div className="card inset-panel badges-panel">
          <div className="section-header"><h3>Badges</h3></div>
          <div className="badge-grid">
            {badges.map((badge, index) => (
              <div key={badge.id} className={`achievement ${badge.unlocked ? 'achievement-unlocked' : ''}`} style={{ '--badge-index': index }}>
                <div className="achievement-icon">{badge.name.slice(0, 2)}</div>
                <div><strong>{badge.name.slice(2)}</strong><span>{badge.unlocked ? 'Unlocked' : 'Locked'}</span></div>
              </div>
            ))}
          </div>
        </div>

        <div className="card inset-panel report-download-panel">
          <div className="section-header"><h3>Reports</h3></div>
          <p className="muted">Take your progress with you and see the bigger picture.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="primary-btn" onClick={() => downloadReport('weekly')}>↗ Download Weekly Report</button>
            <button className="secondary-btn" onClick={() => downloadReport('monthly')}>↗ Download Monthly Report</button>
          </div>
        </div>
      </div>
    );
  };

  const downloadReport = (period) => {
    try {
      const totalStudy = period === 'weekly' ? weeklySummary.minutes : monthlySummary.minutes;
      const reportData = {
        name: profile.name || 'Student',
        totalStudy,
        tasksCompleted: tasks.filter((task) => task.completed).length,
        goalsProgress: getGoalsProgress(goals),
        quizAttempts: quizHistory.length,
        quizAccuracy: quizHistory.length ? Math.round(quizHistory.reduce((sum, entry) => sum + Number(entry.accuracy || 0), 0) / quizHistory.length) : 0,
        streak,
        xp,
        level: levelInfo.level,
      };

      const chartStudy = Math.min(100, Math.round((reportData.totalStudy / 360) * 100));
      const chartGoals = reportData.goalsProgress;
      const chartQuiz = reportData.quizAttempts ? reportData.quizAccuracy : 0;
      const html = `
        <html>
          <head>
            <title>EduMe ${period === 'weekly' ? 'Weekly' : 'Monthly'} Report</title>
            <style>
              body { font-family: Arial, sans-serif; background:radial-gradient(circle at 8% 5%,rgba(124,58,237,.22),transparent 24%),radial-gradient(circle at 92% 12%,rgba(20,184,166,.2),transparent 25%),linear-gradient(135deg,#f8f5ff 0%,#ecfeff 52%,#fff7ed 100%); color:#172554; padding:32px; min-height:100vh; }
              .card { background:rgba(255,255,255,.78); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,.92); border-radius:24px; padding:24px; box-shadow:0 18px 42px rgba(71,53,145,.14); margin-bottom:20px; }
              .header { display:flex; align-items:center; justify-content:space-between; }
              .brand { display:flex; align-items:center; gap:12px; font-size:24px; font-weight:800; color:#4c1d95; }
              .badge { background:linear-gradient(135deg,#7c3aed,#db2777); color:#fff; display:inline-block; padding:8px 12px; border-radius:999px; box-shadow:0 8px 18px rgba(124,58,237,.2); }
              .grid { display:grid; grid-template-columns: repeat(2, minmax(180px, 1fr)); gap:14px; }
              .stat { background:linear-gradient(135deg,#eef2ff,#ecfeff); border-left:5px solid #4f46e5; border-radius:14px; padding:16px; }
              .stat:nth-child(2) { background:linear-gradient(135deg,#ecfdf5,#eff6ff); border-left-color:#14b8a6; }
              .stat:nth-child(3) { background:linear-gradient(135deg,#fff7ed,#fef3c7); border-left-color:#f59e0b; }
              .stat:nth-child(4) { background:linear-gradient(135deg,#fdf2f8,#fce7f3); border-left-color:#db2777; }
              .bar { height: 10px; background:#e2e8f0; border-radius:999px; overflow:hidden; margin-top:6px; }
              .bar span { display:block; height:100%; background:linear-gradient(90deg,#7c3aed,#14b8a6,#f59e0b); }
              h2 { color:#312e81; margin-top:0; }
              .card:nth-of-type(2) h2 { color:#0f766e; }
              .card:nth-of-type(3) h2 { color:#c2410c; }
              .card:last-child { background:linear-gradient(135deg,#5124b7,#0f9f9a); color:#fff; text-align:center; }
              .card:last-child h2, .card:last-child p { color:#fff; }
              @media (max-width:640px) { body { padding:16px; } .header { align-items:flex-start; gap:14px; flex-direction:column; } .grid { grid-template-columns:1fr; } .card { padding:18px; } }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="header">
                <div class="brand">EDUME</div>
                <div class="badge">${period === 'weekly' ? 'Weekly' : 'Monthly'} Report</div>
              </div>
              <p><strong>Student:</strong> ${reportData.name}</p>
              <p><strong>Period:</strong> ${period === 'weekly' ? 'Last 7 days' : 'Current month'}</p>
            </div>
            <div class="card">
              <h2>Study Summary</h2>
              <div class="grid">
                <div class="stat"><strong>Total Study Time</strong><div>${Math.floor(reportData.totalStudy / 60)}h ${reportData.totalStudy % 60}m</div></div>
                <div class="stat"><strong>Tasks Completed</strong><div>${reportData.tasksCompleted}</div></div>
                <div class="stat"><strong>Goals Progress</strong><div>${reportData.goalsProgress}%</div></div>
                <div class="stat"><strong>Streak</strong><div>${reportData.streak} days</div></div>
              </div>
            </div>
            <div class="card">
              <h2>Quiz Performance</h2>
              <div class="grid">
                <div class="stat"><strong>Quiz Attempts</strong><div>${reportData.quizAttempts}</div></div>
                <div class="stat"><strong>Accuracy</strong><div>${reportData.quizAccuracy}%</div></div>
                <div class="stat"><strong>XP</strong><div>${reportData.xp}</div></div>
                <div class="stat"><strong>Level</strong><div>${reportData.level}</div></div>
              </div>
            </div>
            <div class="card">
              <h2>Visual Analytics</h2>
              <p>Study Progress</p>
              <div class="bar"><span style="width:${chartStudy}%"></span></div>
              <p>Goal Completion</p>
              <div class="bar"><span style="width:${chartGoals}%"></span></div>
              <p>Quiz Performance</p>
              <div class="bar"><span style="width:${chartQuiz}%"></span></div>
            </div>
            <div class="card">
              <h2>Overall Progress</h2>
              <p>${Math.min(100, Math.round((chartStudy + chartGoals + chartQuiz) / 3))}% overall progress</p>
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
      <div className="card inset-panel">
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
                      <button className="secondary-btn" style={{ marginTop: 10 }} onClick={() => { setPage('planner'); setCalendarDate(task.date); }}>Open</button>
                    </div>
                  ))}
                  {filteredSearch.goals.map((goal) => (
                    <div key={goal.id} className="card" style={{ padding: 16 }}>
                      <strong>{goal.name}</strong>
                      <div className="muted">{goal.description || 'Study goal'}</div>
                      <button className="secondary-btn" style={{ marginTop: 10 }} onClick={() => { setPage('planner'); setGoalModal({ open: true, mode: 'edit', goal }); }}>Open</button>
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
        <p className="muted">Copy the support email and send your message from any email service you prefer.</p>
        <div className="support-contact-card">
          <div><span className="muted support-label">Support email</span><strong className="support-email">sbmplayerzofficial@gmail.com</strong></div>
          <button className="secondary-btn" onClick={copySupportEmail}>Copy Email</button>
        </div>
        <div className="grid" style={{ gap: 12 }}>
          <a
            className="secondary-btn"
            href="https://docs.google.com/forms/d/e/1FAIpQLSdqB36cDFQygtQrQnnmmutrlWfjb1j0tX-Z6Ad2kA4Z2dnqcw/viewform?usp=sharing&ouid=102268797773322480668"
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
      <div className="card inset-panel">
        <div className="section-header"><h2>About EduMe</h2></div>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="brand"><span className="brand-mark">E</span> <span className="highlight-text">EduMe</span></div>
          <p className="muted" style={{ margin: 0 }}>Your simple study companion.</p>
          <p style={{ margin: 0 }}>EduMe is a student-focused study companion designed to help students organize their studies, plan tasks, track study time, monitor progress, and stay motivated.</p>
          <div className="card info-card" style={{ padding: 16 }}>
            <strong className="highlight-text">App Information</strong>
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, lineHeight: 1.8 }}>
              <li>App Name: <span className="highlight-text">EduMe</span></li>
              <li>Version: 1.0.0</li>
              <li>Type: Student Study & Productivity App</li>
              <li>Designed And Developed <span className="highlight-text">SBM</span></li>
            </ul>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="secondary-btn" onClick={() => setPage('terms')}>Terms & Conditions</button>
            <button className="secondary-btn" onClick={() => setPage('privacy')}>Privacy Policy</button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTerms = () => (
    <div className="page">
      <div className="card inset-panel">
        <div className="section-header"><h2>Terms & Conditions</h2></div>
        <div style={{ display: 'grid', gap: 12, lineHeight: 1.7 }} className="muted">
          <p>EduMe is a local-first study planner for personal organization, study timing, task planning, goals, quizzes, and progress tracking. By using EduMe, you understand that your data is stored in this browser or device and is not automatically backed up online.</p>
          <p>You are responsible for the accuracy of your profile, tasks, goals, quiz activity, and exam preparation information. EduMe is a productivity tool and does not replace teachers, schools, coaching, or official academic guidance.</p>
          <p>Study sessions are created when you finish the timer. XP, levels, badges, streaks, and progress are calculated from your locally stored activity. Export your data regularly if you want to keep a backup or move it to another browser.</p>
          <p>EduMe works without a paid API or account. The optional Feedback button may open an external Google Form, and the Support page provides an email address. Those services are outside EduMe and may have their own terms.</p>
          <p>Features may change as EduMe is improved. Do not use the app as the only record of important academic deadlines or results.</p>
        </div>
      </div>
    </div>
  );

  const renderPrivacy = () => (
    <div className="page">
      <div className="card inset-panel">
        <div className="section-header"><h2>Privacy Policy</h2></div>
        <div style={{ display: 'grid', gap: 12, lineHeight: 1.7 }} className="muted">
          <p>EduMe stores your profile, planner tasks, goals, study sessions, quiz history, theme, settings, streak, XP, and report data locally in your browser&apos;s Local Storage. Profile photos are stored locally as browser data when you upload them.</p>
          <p>EduMe does not maintain a user account, server-side database, analytics tracker, or paid API for core features. Your local data is not sent to EduMe automatically. Clearing browser site data or using EduMe&apos;s Clear Data option removes local content.</p>
          <p>Export and import are local browser actions. The generated backup file stays on your device unless you choose to share it. Copy Email only writes the support address to your clipboard after you click it.</p>
          <p>The optional Feedback button can open a Google Form in a new tab, and Support includes an email address. If you use either option, information you submit is handled by that external service according to its privacy policy.</p>
          <p>EduMe uses browser capabilities such as Local Storage, Service Workers for offline caching, notifications when permitted, and Web Audio for optional sound effects. No personal information is intentionally sold or tracked by EduMe.</p>
        </div>
      </div>
    </div>
  );

  const renderTimerCard = () => (
    <div className="card focus-timer-card">
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
            <button className="primary-btn" onClick={() => { playSound('tap'); setTimerFinished(false); setTimerRunning(true); }}>Start</button>
          ) : (
            <button className="secondary-btn" onClick={() => { playSound('tap'); setTimerRunning(false); }}>Pause</button>
          )}
          <button className="ghost-btn" onClick={() => { playSound('tap'); setTimerFinished(false); setTimerRunning(true); }}>Resume</button>
          <button className="ghost-btn" onClick={() => setFullScreen(true)}>Full Screen</button>
          <button className="danger-btn" onClick={handleTimerFinish}>Finish Session</button>
        </div>
      </div>
    </div>
  );

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
      case 'terms': return renderTerms();
      case 'privacy': return renderPrivacy();
      default: return renderHome();
    }
  };

  const renderOnboarding = () => (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="card" style={{ maxWidth: 760, width: '100%', padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="brand"><span className="brand-mark">E</span> <span>EduMe</span></div>
          <span className="badge">Onboarding</span>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          {[
            { title: 'Welcome to EduMe 👋', text: 'Your simple study companion.' },
            { title: '📚 Organize your study', text: 'Plan and manage your study tasks easily.' },
            { title: '⏱️ Track your study time', text: 'Understand how much time you spend studying.' },
            { title: '🎯 Set your goals', text: 'Keep your study goals visible and stay consistent.' },
            { title: '🏆 Build your study habits', text: 'Maintain your study consistency and stay motivated.' },
          ].map((slide, index) => (
            <div key={index} className="card" style={{ padding: 18 }}>
              <h3 style={{ margin: '0 0 8px' }}>{slide.title}</h3>
              <p style={{ margin: 0, color: 'var(--text-soft)' }}>{slide.text}</p>
            </div>
          ))}
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
            <div className="brand"><span className="brand-mark">E</span> <span>EduMe</span></div>
            <div className="topbar-actions">
              <button
                className="icon-btn theme-toggle"
                onClick={() => setTheme((current) => current === 'dark' ? 'light' : current === 'light' ? 'system' : 'dark')}
                aria-label={`Theme: ${theme}. Change theme`}
                title={`Theme: ${theme}`}
              >
                {theme === 'dark' ? '🌙' : '☀️'}
              </button>
            </div>
          </header>

          <div className="main-layout">
            <aside className="desktop-sidebar">
              <div className="card inset-panel">
                <div className="brand" style={{ marginBottom: 14 }}><span className="brand-mark">E</span> <span>EduMe</span></div>
                <div className="nav-row" style={{ display: 'grid', gap: 8 }}>
                  {navItems.map((item) => (
                    <button
                      key={item.id}
                      className={selectedNav === item.id ? 'nav-btn active' : 'nav-btn'}
                      onClick={() => { setPage(item.id); setSelectedNav(item.id); }}
                    >
                      {item.icon} {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <main className="app-main">
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
              {renderContent()}
            </main>
          </div>

          <nav className="mobile-nav" aria-label="Mobile navigation">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={selectedNav === item.id ? 'nav-item active' : 'nav-item'}
                onClick={() => { setPage(item.id); setSelectedNav(item.id); }}
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

          {fullScreen && (
            <div className="modal-backdrop" style={{ background: 'rgba(15,23,42,0.8)' }} onClick={() => setFullScreen(false)}>
              <div className="modal" style={{ background: 'var(--card)', padding: 28 }} onClick={(e) => e.stopPropagation()}>
                <div className="section-header">
                  <h2>Focus Mode</h2>
                  <button className="ghost-btn" onClick={() => setFullScreen(false)}>Exit Full Screen</button>
                </div>
                <div className="timer-display" style={{ margin: '18px 0' }}>{formatTimeDisplay(timerSeconds)}</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {!timerRunning ? (
                    <button className="primary-btn" onClick={() => { playSound('tap'); setTimerFinished(false); setTimerRunning(true); }}>Start</button>
                  ) : (
                    <button className="secondary-btn" onClick={() => { playSound('tap'); setTimerRunning(false); }}>Pause</button>
                  )}
                  <button className="ghost-btn" onClick={() => { playSound('tap'); setTimerFinished(false); setTimerRunning(true); }}>Resume</button>
                  <button className="danger-btn" onClick={handleTimerFinish}>Finish Session</button>
                </div>
              </div>
            </div>
          )}

          {sessionSummary && (
            <div className="modal-backdrop" onClick={() => setSessionSummary(null)}>
              <div className="modal celebration-modal" onClick={(event) => event.stopPropagation()}>
                <div className="celebration-icon">🎉</div>
                <span className="section-kicker">FOCUS SESSION COMPLETE</span>
                <h2>Excellent work!</h2>
                <p className="muted">You showed up and made real progress today.</p>
                <div className="celebration-stats">
                  <div><strong>{sessionSummary.durationMinutes} min</strong><span>study time</span></div>
                  <div><strong>+{sessionSummary.xpEarned} XP</strong><span>earned</span></div>
                  <div><strong>Level {sessionSummary.level}</strong><span>current level</span></div>
                </div>
                <div className="celebration-badges">
                  <strong>Badge progress</strong>
                  <div className="badge-grid">
                    {sessionSummary.badges.map((badge) => (
                      <div key={badge.id} className={`achievement ${badge.unlocked ? 'achievement-unlocked' : ''}`}>
                        <div className="achievement-icon">{badge.name.slice(0, 2)}</div>
                        <div><strong>{badge.name.slice(2)}</strong><span>{badge.unlocked ? 'Unlocked' : 'Keep going'}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
                <button className="primary-btn celebration-close" onClick={() => setSessionSummary(null)}>Keep going</button>
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
      onClick={onToggle}
    >
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
      <div className="task-form-actions">
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
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
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
