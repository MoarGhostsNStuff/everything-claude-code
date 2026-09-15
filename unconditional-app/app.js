/* Unconditional - Love, Wellness & Mental Health Companion */

/* ── Capacitor Native Bridge ── */
const Native = {
  isNative: typeof window.Capacitor !== 'undefined',
  plugins: {},

  async init() {
    if (!this.isNative) return;
    const { Capacitor } = window;
    const { registerPlugin } = Capacitor;

    try { this.plugins.StatusBar = registerPlugin('StatusBar'); } catch {}
    try { this.plugins.SplashScreen = registerPlugin('SplashScreen'); } catch {}
    try { this.plugins.Haptics = registerPlugin('Haptics'); } catch {}
    try { this.plugins.LocalNotifications = registerPlugin('LocalNotifications'); } catch {}
    try { this.plugins.Motion = registerPlugin('Motion'); } catch {}
    try { this.plugins.App = registerPlugin('App'); } catch {}
    try { this.plugins.Share = registerPlugin('Share'); } catch {}
    try { this.plugins.PushNotifications = registerPlugin('PushNotifications'); } catch {}

    this.configureStatusBar();
    this.setupAppListeners();
    this.requestNotificationPermissions();
  },

  async configureStatusBar() {
    const sb = this.plugins.StatusBar;
    if (!sb) return;
    try {
      await sb.setStyle({ style: 'DARK' });
      await sb.setBackgroundColor({ color: '#1a0a2e' });
    } catch {}
  },

  async hideSplash() {
    const sp = this.plugins.SplashScreen;
    if (!sp) return;
    try { await sp.hide(); } catch {}
  },

  setupAppListeners() {
    const app = this.plugins.App;
    if (!app) return;
    app.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        renderAll();
        checkScheduledEvents();
      }
    });
    app.addListener('backButton', () => {
      const overlay = document.getElementById('modal-overlay');
      if (overlay && overlay.classList.contains('show')) {
        closeModal();
      } else if (APP.currentTab !== 'home') {
        switchTab('home');
      }
    });
  },

  async requestNotificationPermissions() {
    const ln = this.plugins.LocalNotifications;
    if (!ln) return;
    try {
      const { display } = await ln.checkPermissions();
      if (display === 'prompt') await ln.requestPermissions();
    } catch {}
  },

  async scheduleNotification(id, title, body, atDate, data) {
    const ln = this.plugins.LocalNotifications;
    if (!ln) return false;
    try {
      await ln.schedule({
        notifications: [{
          id,
          title,
          body,
          schedule: { at: atDate, allowWhileIdle: true },
          extra: data || {},
          channelId: 'unconditional',
          smallIcon: 'ic_stat_icon',
          iconColor: '#7B2FBE',
          sound: 'notification.wav',
        }],
      });
      return true;
    } catch { return false; }
  },

  async cancelNotification(id) {
    const ln = this.plugins.LocalNotifications;
    if (!ln) return;
    try { await ln.cancel({ notifications: [{ id }] }); } catch {}
  },

  async hapticImpact(style) {
    const h = this.plugins.Haptics;
    if (!h) return;
    try { await h.impact({ style: style || 'MEDIUM' }); } catch {}
  },

  async hapticNotification(type) {
    const h = this.plugins.Haptics;
    if (!h) return;
    try { await h.notification({ type: type || 'SUCCESS' }); } catch {}
  },

  async startNativeMotion() {
    const m = this.plugins.Motion;
    if (!m) return false;
    try {
      await m.addListener('accel', (event) => {
        const acc = event.acceleration;
        if (!acc) return;
        const magnitude = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
        APP.motionData.push({ t: Date.now(), m: magnitude });
        if (APP.motionData.length > 3600) APP.motionData = APP.motionData.slice(-3600);
      });
      return true;
    } catch { return false; }
  },

  async shareApp() {
    const s = this.plugins.Share;
    if (!s) return;
    try {
      await s.share({
        title: 'Unconditional',
        text: 'Love, Wellness & Mental Health Companion',
        url: 'https://unconditional.app',
        dialogTitle: 'Share Unconditional',
      });
    } catch {}
  },

  async scheduleMedReminder(med, timeStr, today) {
    const [h, m] = timeStr.split(':').map(Number);
    const at = new Date();
    at.setHours(h, m, 0, 0);
    if (at <= new Date()) at.setDate(at.getDate() + 1);
    const id = med.id * 100 + h * 60 + m;
    return this.scheduleNotification(
      id,
      'Medication Reminder',
      `Time to take ${med.name} (${med.dosage})`,
      at,
      { type: 'med-reminder', medId: med.id }
    );
  },

  async scheduleCheckinReminders() {
    const times = [
      { h: 10, m: 0, label: 'morning' },
      { h: 19, m: 0, label: 'evening' },
      { h: 0, m: 0, label: 'midnight' },
    ];
    for (const t of times) {
      const at = new Date();
      at.setHours(t.h, t.m, 0, 0);
      if (at <= new Date()) at.setDate(at.getDate() + 1);
      await this.scheduleNotification(
        9000 + t.h,
        'Mental Health Check-in',
        'How is Gigi feeling? Time for a wellness check.',
        at,
        { type: 'gigi-check' }
      );
    }
  },
};

const APP = {
  happiness: 0,
  medications: [],
  sleepLog: [],
  activityLog: [],
  moodJournal: [],
  gratitudes: [],
  badges: [],
  settings: {},
  sleepPrediction: { confidence: 0, likelySleepingSoon: false },
  motionData: [],
  countdownTimer: null,
  countdownEnd: null,
  audioMonitorActive: false,
  audioContext: null,
  analyser: null,
  mediaStream: null,
  currentTab: 'home',
  modalStack: [],
};

const DEFAULT_HUG_MESSAGE = "Being in love and with your soulmate at 90 is a lot better than being alone with your anger or ego..I'm asking you for a hug now, please";

const CONTACTS = {
  primary: '3314571282',
  secondary: '2066810010',
};

const MAC_MILLER_URL = 'https://www.youtube.com/watch?v=UtFXEgGFz7I';

/* ── Storage ── */
const DB = {
  save(key, val) {
    try { localStorage.setItem(`uc_${key}`, JSON.stringify(val)); } catch (e) { /* quota */ }
  },
  load(key, fallback) {
    try {
      const v = localStorage.getItem(`uc_${key}`);
      return v ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  },
};

/* ── Init ── */
document.addEventListener('DOMContentLoaded', async () => {
  loadState();
  applyTheme(APP.theme);
  applyAccent(APP.accentColor);
  updateStreak();
  renderAll();
  setupNavigation();
  setupServiceWorker();
  requestNotificationPermission();
  startScheduledChecks();
  startMotionDetection();

  await Native.init();
  if (Native.isNative) {
    Native.scheduleCheckinReminders();
    scheduleMedNotifications();
  }

  setTimeout(() => {
    const splash = document.getElementById('splash');
    if (splash) splash.classList.add('hide');
    Native.hideSplash();
  }, 6200);
});

function scheduleMedNotifications() {
  if (!Native.isNative) return;
  const today = todayKey();
  APP.medications.filter((m) => m.active).forEach((med) => {
    med.times.forEach((t) => {
      if (!(med.taken[today] || []).includes(t)) {
        Native.scheduleMedReminder(med, t, today);
      }
    });
  });
}

function loadState() {
  APP.happiness = DB.load('happiness', 0);
  APP.medications = DB.load('medications', getDefaultMedications());
  APP.sleepLog = DB.load('sleepLog', []);
  APP.activityLog = DB.load('activityLog', []);
  APP.settings = DB.load('settings', getDefaultSettings());
  APP.sleepPrediction = DB.load('sleepPrediction', { confidence: 5, likelySleepingSoon: false, dataPoints: 0 });
  APP.moodJournal = DB.load('moodJournal', []);
  APP.gratitudes = DB.load('gratitudes', []);
  APP.badges = DB.load('badges', []);
  APP.hugContact = DB.load('hugContact', '');
  APP.hugMessage = DB.load('hugMessage', DEFAULT_HUG_MESSAGE);
  APP.loveLanguage = DB.load('loveLanguage', null);
  APP.streakData = DB.load('streakData', { currentStreak: 0, longestStreak: 0, lastActiveDate: '' });
  APP.theme = DB.load('theme', 'dark');
  APP.accentColor = DB.load('accentColor', 'purple');
  APP.breathingActive = false;
}

function saveState() {
  DB.save('happiness', APP.happiness);
  DB.save('medications', APP.medications);
  DB.save('sleepLog', APP.sleepLog);
  DB.save('activityLog', APP.activityLog);
  DB.save('settings', APP.settings);
  DB.save('sleepPrediction', APP.sleepPrediction);
  DB.save('moodJournal', APP.moodJournal);
  DB.save('gratitudes', APP.gratitudes);
  DB.save('badges', APP.badges);
  DB.save('hugContact', APP.hugContact);
  DB.save('hugMessage', APP.hugMessage);
  DB.save('loveLanguage', APP.loveLanguage);
  DB.save('streakData', APP.streakData);
  DB.save('theme', APP.theme);
  DB.save('accentColor', APP.accentColor);
}

function getDefaultMedications() {
  return [
    { id: 1, name: 'Example Medication', dosage: '10mg', times: ['08:00', '20:00'], taken: {}, notes: '', active: true },
  ];
}

function getDefaultSettings() {
  return {
    sleepDetection: true,
    sleepPrompt: true,
    bedtimeAngerCheck: true,
    audioMonitor: false,
    gigiCheckins: true,
    smoochieReminder: true,
    loveContractReminder: true,
    medReminders: true,
    mentalHealthCheckins: true,
    checkinTimes: ['10:00', '19:00', '00:00'],
    quietHoursStart: '23:00',
    quietHoursEnd: '07:00',
  };
}

/* ── Service Worker ── */
function setupServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data.type === 'notification-click') handleNotificationAction(e.data.data);
    });
  }
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showNotification(title, body, data) {
  if (Native.isNative) {
    const id = Math.floor(Math.random() * 100000);
    const at = new Date(Date.now() + 500);
    Native.scheduleNotification(id, title, body, at, data);
    return;
  }
  let sentNative = false;
  if ('Notification' in window && Notification.permission === 'granted') {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-72.png',
          data,
          vibrate: [200, 100, 200],
          requireInteraction: true,
        });
      });
      sentNative = true;
    } else {
      new Notification(title, { body, icon: '/icons/icon-192.png' });
      sentNative = true;
    }
  }
  if (!sentNative) {
    showPopupPrompt(title, body, data);
  }
}

/* ── Navigation ── */
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
  });
  const hash = window.location.hash.slice(1);
  if (hash) switchTab(hash);
}

function switchTab(tab) {
  APP.currentTab = tab;
  document.querySelectorAll('.tab-page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  const page = document.getElementById(`page-${tab}`);
  const nav = document.querySelector(`.nav-item[data-tab="${tab}"]`);
  if (page) page.classList.add('active');
  if (nav) nav.classList.add('active');
  window.location.hash = tab;
}

/* ── Rendering ── */
function renderAll() {
  renderHappiness();
  renderMedications();
  renderSleepStatus();
  renderActivityLog();
  renderSettings();
  renderHomeStats();
  renderMoodJournal();
  renderGratitudes();
  renderBadges();
  renderWeeklyReport();
  renderStreakDisplay();
  renderHugContact();
}

function renderHomeStats() {
  const today = todayKey();
  let totalDoses = 0, takenDoses = 0;
  APP.medications.filter((m) => m.active).forEach((m) => {
    totalDoses += m.times.length;
    takenDoses += (m.taken[today] || []).length;
  });
  const medCount = document.getElementById('home-med-count');
  if (medCount) medCount.textContent = `${takenDoses}/${totalDoses}`;
  const sleepScore = document.getElementById('home-sleep-score');
  if (sleepScore) sleepScore.textContent = `${APP.sleepPrediction.confidence || 0}%`;
  const checkins = document.getElementById('home-checkins');
  if (checkins) {
    const todayCheckins = APP.activityLog.filter((e) => e.time.startsWith(today) && e.text.includes('check-in')).length;
    checkins.textContent = todayCheckins;
  }
  const streak = document.getElementById('home-streak');
  if (streak) {
    let days = 0;
    const d = new Date();
    while (days < 365) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const hadActivity = APP.activityLog.some((e) => e.time.startsWith(key));
      if (!hadActivity && days > 0) break;
      if (hadActivity) days++;
      d.setDate(d.getDate() - 1);
    }
    streak.textContent = days;
  }
  const wellnessHappiness = document.getElementById('wellness-happiness');
  if (wellnessHappiness) wellnessHappiness.textContent = APP.happiness.toLocaleString();
}

function renderHappiness() {
  const el = document.getElementById('happiness-score');
  if (el) el.textContent = APP.happiness.toLocaleString();
}

function addHappiness(amount, reason) {
  APP.happiness += amount;
  saveState();
  renderHappiness();
  Native.hapticImpact('HEAVY');
  const pop = document.createElement('div');
  pop.className = 'happiness-pop';
  pop.textContent = `+${amount} Happiness \u{1F499}\u{1F60C}\u{1F49A}\u{267E}\u{FE0F}`;
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 1600);
  logActivity(`+${amount} Happiness: ${reason}`);
}

/* ── Medications ── */
function renderMedications() {
  const list = document.getElementById('med-list');
  if (!list) return;
  const today = todayKey();
  const activeMeds = APP.medications.filter((m) => m.active);
  if (activeMeds.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F48A}</div><div class="empty-state-text">No medications yet. Tap + to add one.</div></div>`;
    return;
  }
  list.innerHTML = activeMeds.map((med) => {
    const timeStr = med.times.map(formatTime12).join(', ');
    const takenToday = med.taken[today] || [];
    const allTaken = med.times.length > 0 && med.times.every((t) => takenToday.includes(t));
    return `
      <div class="med-item animate-in" data-id="${med.id}">
        <div class="med-check ${allTaken ? 'checked' : ''}" onclick="toggleMedTaken(${med.id})">${allTaken ? '✓' : ''}</div>
        <div class="med-info" onclick="openEditMed(${med.id})">
          <div class="med-name">${escHtml(med.name)}</div>
          <div class="med-details">${escHtml(med.dosage)} • ${timeStr}${med.notes ? ' • ' + escHtml(med.notes) : ''}</div>
        </div>
        <div class="med-time">${nextDoseLabel(med, takenToday)}</div>
        <div class="med-actions">
          <button class="med-action-btn" onclick="openEditMed(${med.id})">\u{270F}\u{FE0F}</button>
          <button class="med-action-btn" onclick="deleteMed(${med.id})">\u{1F5D1}</button>
        </div>
      </div>`;
  }).join('');
  updateMedProgress();
}

function toggleMedTaken(id) {
  const med = APP.medications.find((m) => m.id === id);
  if (!med) return;
  if (med.times.length === 0) return;
  const today = todayKey();
  if (!med.taken[today]) med.taken[today] = [];
  const now = currentTimeStr();
  const closest = med.times.reduce((a, b) => Math.abs(timeToMin(b) - timeToMin(now)) < Math.abs(timeToMin(a) - timeToMin(now)) ? b : a);
  const idx = med.taken[today].indexOf(closest);
  if (idx > -1) {
    med.taken[today].splice(idx, 1);
  } else {
    med.taken[today].push(closest);
    addHappiness(10, `Took ${med.name}`);
    Native.hapticNotification('SUCCESS');
  }
  saveState();
  renderMedications();
}

function deleteMed(id) {
  if (!confirm('Remove this medication?')) return;
  APP.medications = APP.medications.filter((m) => m.id !== id);
  saveState();
  renderMedications();
}

function openAddMed() {
  showModal('Add Medication', `
    <div class="input-group"><label>Medication Name</label><input id="med-name" class="input-field" placeholder="e.g. Vitamin D"></div>
    <div class="input-group"><label>Dosage</label><input id="med-dosage" class="input-field" placeholder="e.g. 10mg, 1 tablet"></div>
    <div class="input-group"><label>Notes (optional)</label><input id="med-notes" class="input-field" placeholder="Take with food, etc."></div>
    <div class="input-group"><label>Times</label><div id="med-times-list"><div class="time-picker"><input type="time" class="med-time-input" value="08:00"><button class="btn btn-sm btn-secondary" onclick="addTimeSlot()">+ Time</button></div></div></div>
    <button class="btn btn-primary" onclick="saveMed()">Save Medication</button>
  `);
}

function addTimeSlot() {
  const list = document.getElementById('med-times-list');
  const div = document.createElement('div');
  div.className = 'time-picker';
  div.style.marginTop = '8px';
  div.innerHTML = `<input type="time" class="med-time-input" value="20:00"><button class="btn btn-sm btn-secondary" onclick="this.parentElement.remove()">−</button>`;
  list.appendChild(div);
}

function saveMed() {
  const name = document.getElementById('med-name').value.trim();
  const dosage = document.getElementById('med-dosage').value.trim();
  const notes = document.getElementById('med-notes').value.trim();
  const times = Array.from(document.querySelectorAll('.med-time-input')).map((i) => i.value).filter(Boolean);
  if (!name) return alert('Please enter a medication name');
  const id = Date.now();
  APP.medications.push({ id, name, dosage, notes, times, taken: {}, active: true });
  saveState();
  renderMedications();
  closeModal();
  logActivity(`Added medication: ${name}`);
}

function openEditMed(id) {
  const med = APP.medications.find((m) => m.id === id);
  if (!med) return;
  const timesHtml = med.times.map((t, i) => `<div class="time-picker" style="margin-top:${i ? 8 : 0}px"><input type="time" class="med-time-input" value="${t}"><button class="btn btn-sm btn-secondary" onclick="this.parentElement.remove()">−</button></div>`).join('');
  showModal('Edit Medication', `
    <div class="input-group"><label>Medication Name</label><input id="med-name" class="input-field" value="${escAttr(med.name)}"></div>
    <div class="input-group"><label>Dosage</label><input id="med-dosage" class="input-field" value="${escAttr(med.dosage)}"></div>
    <div class="input-group"><label>Notes</label><input id="med-notes" class="input-field" value="${escAttr(med.notes || '')}"></div>
    <div class="input-group"><label>Times</label><div id="med-times-list">${timesHtml}<div style="margin-top:8px"><button class="btn btn-sm btn-secondary" onclick="addTimeSlot()">+ Add Time</button></div></div></div>
    <button class="btn btn-primary" onclick="updateMed(${id})">Update</button>
  `);
}

function updateMed(id) {
  const med = APP.medications.find((m) => m.id === id);
  if (!med) return;
  med.name = document.getElementById('med-name').value.trim();
  med.dosage = document.getElementById('med-dosage').value.trim();
  med.notes = document.getElementById('med-notes').value.trim();
  med.times = Array.from(document.querySelectorAll('.med-time-input')).map((i) => i.value).filter(Boolean);
  saveState();
  renderMedications();
  closeModal();
}

function updateMedProgress() {
  const bar = document.getElementById('med-progress');
  if (!bar) return;
  const today = todayKey();
  let total = 0, done = 0;
  APP.medications.filter((m) => m.active).forEach((m) => {
    total += m.times.length;
    done += (m.taken[today] || []).length;
  });
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  bar.style.width = pct + '%';
  const label = document.getElementById('med-progress-label');
  if (label) label.textContent = `${done}/${total} doses today`;
}

function nextDoseLabel(med, takenToday) {
  const now = timeToMin(currentTimeStr());
  const upcoming = med.times.filter((t) => !takenToday.includes(t) && timeToMin(t) > now);
  if (upcoming.length === 0) return takenToday.length >= med.times.length ? 'Done' : 'Overdue';
  return formatTime12(upcoming[0]);
}

/* ── Sleep Detection ── */
async function startMotionDetection() {
  if (!APP.settings.sleepDetection) return;
  let nativeStarted = false;
  if (Native.isNative) {
    nativeStarted = await Native.startNativeMotion();
  }
  if (!nativeStarted) {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      // iOS 13+ requires permission — triggered by user gesture via requestMotionPermission()
    }
    if ('DeviceMotionEvent' in window) {
      window.addEventListener('devicemotion', handleMotionEvent, { passive: true });
    }
  }
  APP.sleepIntervalId = setInterval(analyzeSleepLikelihood, 60000);
}

function handleMotionEvent(e) {
  const acc = e.accelerationIncludingGravity;
  if (!acc) return;
  const magnitude = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
  APP.motionData.push({ t: Date.now(), m: magnitude });
  if (APP.motionData.length > 3600) APP.motionData = APP.motionData.slice(-3600);
}

function analyzeSleepLikelihood() {
  if (!APP.settings.sleepDetection) return;
  const now = new Date();
  const hour = now.getHours();
  const isNighttime = hour >= 21 || hour <= 6;
  const recentMotion = APP.motionData.filter((d) => Date.now() - d.t < 3600000);
  const avgMotion = recentMotion.length > 0
    ? recentMotion.reduce((s, d) => s + d.m, 0) / recentMotion.length
    : 10;
  const lowMotion = avgMotion < 10.5;
  const veryLowMotion = avgMotion < 9.9;
  const longStill = recentMotion.length > 60 && recentMotion.slice(-60).every((d) => d.m < 10.2);
  let score = 0;
  if (isNighttime) score += 30;
  if (hour >= 23 || hour <= 4) score += 15;
  if (lowMotion) score += 20;
  if (veryLowMotion) score += 10;
  if (longStill) score += 25;

  const pastBedtimes = APP.sleepLog.filter((l) => l.type === 'sleep-confirmed').slice(-14);
  if (pastBedtimes.length > 3) {
    const avgBedtimeMin = pastBedtimes.reduce((s, l) => {
      const d = new Date(l.time);
      let min = d.getHours() * 60 + d.getMinutes();
      if (min < 360) min += 1440;
      return s + min;
    }, 0) / pastBedtimes.length;
    let nowMin = hour * 60 + now.getMinutes();
    if (nowMin < 360) nowMin += 1440;
    const diff = Math.abs(nowMin - avgBedtimeMin);
    if (diff < 30) score += 20;
    else if (diff < 60) score += 10;
  }

  const learningBonus = Math.min(APP.sleepPrediction.dataPoints || 0, 20);
  score = Math.min(score + learningBonus, 100);

  APP.sleepPrediction.confidence = score;
  APP.sleepPrediction.likelySleepingSoon = score >= 60;
  saveState();
  renderSleepStatus();

  if (score >= 60 && APP.settings.sleepPrompt) {
    triggerSleepPrompt();
  }
  if (score >= 70 && APP.settings.bedtimeAngerCheck) {
    triggerBedtimeAngerCheck();
  }
}

function triggerSleepPrompt() {
  const lastPrompt = DB.load('lastSleepPrompt', 0);
  if (Date.now() - lastPrompt < 1800000) return;
  DB.save('lastSleepPrompt', Date.now());

  showPopupPrompt(
    'Are you about to sleep?',
    'It looks like you might be getting ready for bed.',
    {
      type: 'sleep-check',
      choices: [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
        { label: 'When?', value: 'when', input: true },
      ],
    }
  );
}

function handleSleepResponse(value, inputVal) {
  if (value === 'yes') {
    APP.sleepLog.push({ type: 'sleep-confirmed', time: new Date().toISOString() });
    APP.sleepPrediction.dataPoints = (APP.sleepPrediction.dataPoints || 0) + 2;
    saveState();
    logActivity('Confirmed going to sleep');
    triggerBedtimeRoutine();
  } else if (value === 'no') {
    APP.sleepPrediction.dataPoints = Math.max(0, (APP.sleepPrediction.dataPoints || 0) - 1);
    saveState();
    logActivity('Not sleeping yet');
  } else if (value === 'when') {
    const minutes = parseInt(inputVal, 10);
    if (minutes > 0) {
      startCountdown(minutes, 'sleep');
      APP.sleepLog.push({ type: 'sleep-predicted', time: new Date().toISOString(), predictedMinutes: minutes });
      saveState();
      logActivity(`Predicted sleep in ${minutes} minutes`);
    }
  }
}

function triggerBedtimeAngerCheck() {
  const lastCheck = DB.load('lastAngerCheck', 0);
  if (Date.now() - lastCheck < 3600000) return;
  DB.save('lastAngerCheck', Date.now());

  showPopupPrompt(
    'Bedtime Check-in',
    'Before you sleep...',
    {
      type: 'anger-check',
      choices: [
        { label: 'Are you going to bed angry?', value: 'self-angry', subChoices: ['Yes', 'No'] },
        { label: 'Is Angie going to bed angry?', value: 'angie-angry', subChoices: ['Yes', 'No'] },
      ],
    }
  );
}

function triggerBedtimeRoutine() {
  showPopupPrompt(
    'Say "I love you" \u{2764}\u{FE0F}',
    'Remember to end the day with love.',
    {
      type: 'love-reminder',
      choices: [
        { label: 'Completed \u{1F618}', value: 'completed' },
        { label: 'Resolve Now \u{1F499}\u{1F49A}', value: 'resolve-later' },
      ],
    }
  );

  if (APP.settings.smoochieReminder) {
    sendSmsViaLink(CONTACTS.primary, 'End the day with smoochie girl like promised \u{1F60F}\u{1F91E}');
  }
  if (APP.settings.loveContractReminder) {
    sendSmsViaLink(CONTACTS.secondary, 'Love Contract says "Gimme that cheek babydoll \u{1F60F}\u{1F608}\u{1F618}"');
  }
}

function handleLoveResponse(value) {
  if (value === 'completed') {
    addHappiness(100, 'Said I love you before bed');
  } else if (value === 'resolve-later') {
    startCountdown(15, 'love-reminder');
    logActivity('Will resolve love reminder in 15 minutes');
  }
}

function renderSleepStatus() {
  const icon = document.getElementById('sleep-icon');
  const state = document.getElementById('sleep-state');
  const conf = document.getElementById('sleep-confidence');
  const bar = document.getElementById('sleep-bar');
  if (!icon) return;

  const p = APP.sleepPrediction;
  if (p.confidence >= 70) {
    icon.textContent = '\u{1F634}';
    state.textContent = 'Likely Falling Asleep Soon';
  } else if (p.confidence >= 40) {
    icon.textContent = '\u{1F971}';
    state.textContent = 'Getting Sleepy';
  } else {
    icon.textContent = '\u{1F60A}';
    state.textContent = 'Wide Awake';
  }
  conf.textContent = `Sleep likelihood: ${p.confidence}%`;
  if (bar) bar.style.width = p.confidence + '%';

  const dp = document.getElementById('sleep-data-points');
  if (dp) dp.textContent = `Learning data: ${p.dataPoints || 0} feedback points`;
}

/* ── Countdown Timer ── */
function startCountdown(minutes, reason) {
  if (APP.countdownTimer) clearInterval(APP.countdownTimer);
  APP.countdownEnd = Date.now() + minutes * 60000;
  APP.countdownReason = reason;
  renderCountdown();
  APP.countdownTimer = setInterval(() => {
    if (Date.now() >= APP.countdownEnd) {
      clearInterval(APP.countdownTimer);
      APP.countdownTimer = null;
      onCountdownComplete(APP.countdownReason);
    }
    renderCountdown();
  }, 1000);
  const cd = document.getElementById('countdown-section');
  if (cd) cd.style.display = 'block';
}

function renderCountdown() {
  const el = document.getElementById('countdown-time');
  if (!el) return;
  if (!APP.countdownEnd) {
    el.textContent = '00:00';
    return;
  }
  const remaining = Math.max(0, APP.countdownEnd - Date.now());
  const min = Math.floor(remaining / 60000);
  const sec = Math.floor((remaining % 60000) / 1000);
  el.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  const label = document.getElementById('countdown-label');
  if (label) label.textContent = APP.countdownReason === 'sleep' ? 'Until predicted sleep' : 'Love reminder countdown';
}

function onCountdownComplete(reason) {
  const cd = document.getElementById('countdown-section');
  if (cd) cd.style.display = 'none';
  if (reason === 'love-reminder') {
    showPopupPrompt(
      'Love Reminder \u{2764}\u{FE0F}',
      'Time to say I love you!',
      {
        type: 'love-reminder',
        choices: [
          { label: 'Completed \u{1F618}', value: 'completed' },
          { label: 'Resolve Now \u{1F499}\u{1F49A}', value: 'resolve-later' },
        ],
      }
    );
  } else if (reason === 'sleep') {
    APP.sleepLog.push({ type: 'sleep-predicted-end', time: new Date().toISOString() });
    APP.sleepPrediction.dataPoints = (APP.sleepPrediction.dataPoints || 0) + 1;
    saveState();
    analyzeSleepLikelihood();
  }
  showNotification('Unconditional', reason === 'sleep' ? 'Sleep countdown complete' : 'Love reminder time!', { type: reason });
}

/* ── Audio Monitoring ── */
function toggleAudioMonitor() {
  if (APP.audioMonitorActive) {
    stopAudioMonitor();
  } else {
    startAudioMonitor();
  }
}

async function startAudioMonitor() {
  try {
    APP.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    APP.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = APP.audioContext.createMediaStreamSource(APP.mediaStream);
    APP.analyser = APP.audioContext.createAnalyser();
    APP.analyser.fftSize = 256;
    source.connect(APP.analyser);
    APP.audioMonitorActive = true;
    updateAudioDot(true);
    logActivity('Audio environment monitor started');
    monitorAudioLevels();
  } catch (e) {
    alert('Microphone access is needed for environment monitoring. Please allow microphone access in Settings.');
  }
}

function stopAudioMonitor() {
  if (APP.audioRafId) {
    cancelAnimationFrame(APP.audioRafId);
    APP.audioRafId = null;
  }
  if (APP.mediaStream) {
    APP.mediaStream.getTracks().forEach((t) => t.stop());
    APP.mediaStream = null;
  }
  if (APP.audioContext) {
    APP.audioContext.close();
    APP.audioContext = null;
  }
  APP.analyser = null;
  APP.audioMonitorActive = false;
  updateAudioDot(false);
  logActivity('Audio environment monitor stopped');
}

function monitorAudioLevels() {
  if (!APP.audioMonitorActive || !APP.analyser) return;
  const data = new Uint8Array(APP.analyser.frequencyBinCount);
  APP.analyser.getByteFrequencyData(data);
  const avg = data.reduce((a, b) => a + b, 0) / data.length;
  const peak = Math.max(...data);
  if (avg > 100 && peak > 180) {
    handleLoudDetection(avg, peak);
  }
  APP.audioRafId = requestAnimationFrame(monitorAudioLevels);
}

function handleLoudDetection(avg, peak) {
  const last = DB.load('lastLoudDetection', 0);
  if (Date.now() - last < 300000) return;
  DB.save('lastLoudDetection', Date.now());
  logActivity(`Elevated voices detected (avg: ${Math.round(avg)}, peak: ${peak})`);

  window.open(MAC_MILLER_URL, '_blank');

  setTimeout(() => {
    sendSmsViaLink(CONTACTS.primary, "We can do better. I'll never withhold affection. I love you. I'm proud of you. Please hug me baby? \u{1F614}");
    sendSmsViaLink(CONTACTS.secondary, "We can do better. I'll never withhold affection. I love you. I'm proud of you. Please hug me baby? \u{1F614}");
    setTimeout(() => {
      sendSmsViaLink(CONTACTS.secondary, MAC_MILLER_URL);
    }, 2000);
  }, 1000);
}

function updateAudioDot(active) {
  const dot = document.getElementById('audio-dot');
  const label = document.getElementById('audio-status-label');
  if (dot) dot.classList.toggle('active', active);
  if (label) label.textContent = active ? 'Environment monitor active' : 'Environment monitor off';
}

/* ── SMS ── */
function sendSmsViaLink(number, message) {
  const encoded = encodeURIComponent(message);
  const isIOS = Native.isNative || /iPad|iPhone|iPod/.test(navigator.userAgent);
  const separator = isIOS ? '&' : '?';
  const smsUrl = `sms:${number}${separator}body=${encoded}`;

  if (Native.isNative && Native.plugins.App) {
    Native.plugins.App.openUrl({ url: smsUrl });
  } else {
    const link = document.createElement('a');
    link.href = smsUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => link.remove(), 100);
  }
  logActivity(`SMS prepared for ${number.slice(0, 3)}***`);
}

/* ── Scheduled Checks ── */
function startScheduledChecks() {
  setInterval(checkScheduledEvents, 60000);
  checkScheduledEvents();
}

function checkScheduledEvents() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (APP.settings.mentalHealthCheckins) {
    const checkinMinutes = [600, 1140, 0]; // 10:00, 19:00, 00:00
    checkinMinutes.forEach((targetMin) => {
      const diff = Math.abs(nowMin - targetMin);
      if (diff <= 1 || (targetMin === 0 && nowMin >= 1439)) {
        const checkinKey = todayKey() + ':' + targetMin;
        const lastGigi = DB.load('lastGigiCheck', '');
        if (lastGigi !== checkinKey) {
          DB.save('lastGigiCheck', checkinKey);
          triggerGigiCheck();
        }
      }
    });
  }

  if (APP.settings.medReminders) {
    APP.medications.filter((m) => m.active).forEach((med) => {
      med.times.forEach((t) => {
        const targetMin = timeToMin(t);
        if (Math.abs(nowMin - targetMin) <= 1) {
          const today = todayKey();
          if (!(med.taken[today] || []).includes(t)) {
            showNotification('Medication Reminder', `Time to take ${med.name} (${med.dosage})`, { type: 'med-reminder', medId: med.id });
          }
        }
      });
    });
  }
}

function triggerGigiCheck() {
  showPopupPrompt(
    'Mental Health Check-in',
    'Mental Health above all else. How is Gigi feeling and doing today? Does she need to talk?',
    {
      type: 'gigi-check',
      choices: [
        { label: "She's doing great! \u{1F60A}", value: 'great' },
        { label: 'Could be better \u{1F614}', value: 'okay' },
        { label: 'She needs to talk \u{1F4AC}', value: 'needs-talk' },
        { label: "I'll check on her now \u{1F495}", value: 'check-now' },
      ],
    }
  );
}

function requestMotionPermission() {
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission().then((state) => {
      if (state === 'granted') {
        window.addEventListener('devicemotion', handleMotionEvent, { passive: true });
        logActivity('Motion detection enabled');
      }
    });
  }
}

/* ── Pop-up Prompt System ── */
const promptQueue = [];

function showPopupPrompt(title, body, data) {
  const overlay = document.getElementById('prompt-overlay');
  if (!overlay) return;

  // Queue this prompt if another is already visible
  if (overlay.classList.contains('show')) {
    promptQueue.push({ title, body, data });
    return;
  }

  displayPrompt(title, body, data);
}

function displayPrompt(title, body, data) {
  const overlay = document.getElementById('prompt-overlay');
  const container = document.getElementById('prompt-container');
  if (!overlay || !container) return;

  let html = `<div class="prompt-card"><div class="prompt-text">${escHtml(title)}</div><div class="card-subtitle" style="margin-bottom:16px">${escHtml(body)}</div>`;

  if (data && data.choices) {
    html += '<div class="prompt-choices">';
    data.choices.forEach((c) => {
      if (c.subChoices) {
        html += `<div style="margin-bottom:12px"><div style="font-size:0.9rem;margin-bottom:8px;color:var(--text-secondary)">${escHtml(c.label)}</div><div class="btn-group">`;
        c.subChoices.forEach((sc) => {
          html += `<button class="btn btn-secondary" onclick="handlePromptResponse('${escAttr(data.type)}','${escAttr(c.value)}','${escAttr(sc)}')">${escHtml(sc)}</button>`;
        });
        html += '</div></div>';
      } else if (c.input) {
        html += `<button class="btn btn-secondary" onclick="showTimeInput('${escAttr(data.type)}','${escAttr(c.value)}')">${escHtml(c.label)}</button>`;
      } else {
        const btnClass = c.value === 'completed' ? 'btn-love' : 'btn-secondary';
        html += `<button class="btn ${btnClass}" onclick="handlePromptResponse('${escAttr(data.type)}','${escAttr(c.value)}')">${escHtml(c.label)}</button>`;
      }
    });
    html += '</div>';
  }
  html += '</div>';
  container.innerHTML = html;
  overlay.classList.add('show');
}

function showTimeInput(type, value) {
  const container = document.getElementById('prompt-container');
  container.innerHTML = `
    <div class="prompt-card">
      <div class="prompt-text">How many minutes until you sleep?</div>
      <div class="input-group"><input id="sleep-minutes" type="number" class="input-field" placeholder="e.g. 30" min="1" max="480" inputmode="numeric"></div>
      <button class="btn btn-primary" onclick="handlePromptResponse('${escAttr(type)}','${escAttr(value)}',document.getElementById('sleep-minutes').value)">Start Countdown</button>
    </div>`;
}

function handlePromptResponse(type, value, extra) {
  const overlay = document.getElementById('prompt-overlay');
  if (overlay) overlay.classList.remove('show');

  // Show next queued prompt after a brief delay for the dismiss animation
  if (promptQueue.length > 0) {
    const next = promptQueue.shift();
    setTimeout(() => displayPrompt(next.title, next.body, next.data), 350);
  }

  switch (type) {
    case 'sleep-check':
      handleSleepResponse(value, extra);
      break;
    case 'love-reminder':
      handleLoveResponse(value);
      break;
    case 'anger-check':
      logActivity(`Anger check: ${value} = ${extra}`);
      if (extra === 'Yes') {
        showPopupPrompt('Let\'s resolve this', 'Never go to bed angry. Talk it out with love.', {
          type: 'resolve',
          choices: [
            { label: "We'll talk now \u{1F495}", value: 'talk' },
            { label: 'Noted \u{1F4DD}', value: 'noted' },
          ],
        });
      }
      break;
    case 'gigi-check':
      logActivity(`Gigi check-in: ${value}`);
      if (value === 'needs-talk' || value === 'check-now') {
        addHappiness(25, 'Checking on Gigi');
      } else if (value === 'great') {
        addHappiness(50, 'Gigi is doing great!');
      }
      break;
    default:
      logActivity(`Prompt response: ${type} = ${value}`);
  }
}

function handleNotificationAction(data) {
  if (data && data.type) {
    switch (data.type) {
      case 'med-reminder':
        switchTab('medications');
        break;
      case 'love-reminder':
      case 'sleep':
        switchTab('sleep');
        break;
    }
  }
}

/* ── Modal ── */
function showModal(title, contentHtml) {
  const overlay = document.getElementById('modal-overlay');
  const modal = overlay.querySelector('.modal');
  modal.innerHTML = `<div class="modal-handle"></div><div class="modal-title">${escHtml(title)}</div>${contentHtml}`;
  overlay.classList.add('show');
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.remove('show');
}

/* ── Activity Log ── */
function logActivity(text) {
  const entry = { time: new Date().toISOString(), text };
  APP.activityLog.unshift(entry);
  if (APP.activityLog.length > 200) APP.activityLog = APP.activityLog.slice(0, 200);
  saveState();
  renderActivityLog();
}

function renderActivityLog() {
  const el = document.getElementById('activity-log');
  if (!el) return;
  const entries = APP.activityLog.slice(0, 20);
  if (entries.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-text">No activity yet</div></div>';
    return;
  }
  el.innerHTML = entries.map((e) => {
    const d = new Date(e.time);
    const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<div class="log-entry"><span class="log-time">${t}</span><span class="log-text">${escHtml(e.text)}</span></div>`;
  }).join('');
}

/* ── Settings ── */
function renderSettings() {
  // settings are static HTML with toggles, just sync state
  syncToggle('toggle-sleep-detection', APP.settings.sleepDetection);
  syncToggle('toggle-sleep-prompt', APP.settings.sleepPrompt);
  syncToggle('toggle-anger-check', APP.settings.bedtimeAngerCheck);
  syncToggle('toggle-audio-monitor', APP.settings.audioMonitor);
  syncToggle('toggle-gigi-checkins', APP.settings.gigiCheckins);
  syncToggle('toggle-smoochie', APP.settings.smoochieReminder);
  syncToggle('toggle-love-contract', APP.settings.loveContractReminder);
  syncToggle('toggle-med-reminders', APP.settings.medReminders);
  syncToggle('toggle-mental-health', APP.settings.mentalHealthCheckins);
}

function syncToggle(id, val) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('on', !!val);
}

function toggleSetting(key, toggleId) {
  APP.settings[key] = !APP.settings[key];
  saveState();
  syncToggle(toggleId, APP.settings[key]);
  logActivity(`${key} ${APP.settings[key] ? 'enabled' : 'disabled'}`);

  if (key === 'audioMonitor') {
    if (APP.settings.audioMonitor) startAudioMonitor();
    else stopAudioMonitor();
  }
}

/* ── Helpers ── */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function formatTime12(t) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Mood Journal ── */
function openMoodJournal() {
  const moods = [
    { emoji: '\u{1F60A}', label: 'Happy', value: 'happy' },
    { emoji: '\u{1F60C}', label: 'Calm', value: 'calm' },
    { emoji: '\u{1F614}', label: 'Sad', value: 'sad' },
    { emoji: '\u{1F620}', label: 'Angry', value: 'angry' },
    { emoji: '\u{1F630}', label: 'Anxious', value: 'anxious' },
    { emoji: '\u{1F970}', label: 'Loved', value: 'loved' },
  ];
  const moodBtns = moods.map((m) =>
    `<button class="mood-btn" onclick="selectMood('${m.value}','${m.emoji}')" data-mood="${m.value}"><span style="font-size:1.8rem">${m.emoji}</span><br><span style="font-size:0.75rem">${escHtml(m.label)}</span></button>`
  ).join('');
  showModal('How are you feeling?', `
    <div class="mood-grid">${moodBtns}</div>
    <div class="input-group"><label>What's on your mind? (optional)</label><textarea id="mood-note" class="input-field" rows="3" placeholder="Journal your thoughts..."></textarea></div>
    <button class="btn btn-primary" id="save-mood-btn" onclick="saveMoodEntry()" disabled>Save Entry</button>
  `);
}

let selectedMood = null;
function selectMood(value, emoji) {
  selectedMood = { value, emoji };
  document.querySelectorAll('.mood-btn').forEach((b) => b.classList.remove('selected'));
  const btn = document.querySelector(`.mood-btn[data-mood="${value}"]`);
  if (btn) btn.classList.add('selected');
  const saveBtn = document.getElementById('save-mood-btn');
  if (saveBtn) saveBtn.disabled = false;
}

function saveMoodEntry() {
  if (!selectedMood) return;
  const note = (document.getElementById('mood-note') || {}).value || '';
  APP.moodJournal.unshift({
    id: Date.now(),
    mood: selectedMood.value,
    emoji: selectedMood.emoji,
    note: note.trim(),
    time: new Date().toISOString(),
  });
  if (APP.moodJournal.length > 365) APP.moodJournal = APP.moodJournal.slice(0, 365);
  saveState();
  selectedMood = null;
  closeModal();
  addHappiness(15, 'Journaled mood');
  renderMoodJournal();
}

function renderMoodJournal() {
  const el = document.getElementById('mood-journal-list');
  if (!el) return;
  const recent = APP.moodJournal.slice(0, 7);
  if (recent.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-text">No mood entries yet. Tap the button above to start journaling.</div></div>';
    return;
  }
  el.innerHTML = recent.map((e) => {
    const d = new Date(e.time);
    const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<div class="mood-entry"><span class="mood-entry-emoji">${e.emoji}</span><div class="mood-entry-info"><div class="mood-entry-date">${dateStr} ${timeStr}</div>${e.note ? '<div class="mood-entry-note">' + escHtml(e.note) + '</div>' : ''}</div></div>`;
  }).join('');

  const chartEl = document.getElementById('mood-chart');
  if (chartEl) renderMoodChart(chartEl);
}

function renderMoodChart(el) {
  const last7 = APP.moodJournal.slice(0, 7).reverse();
  if (last7.length < 2) { el.innerHTML = ''; return; }
  const moodScores = { happy: 5, loved: 5, calm: 4, anxious: 2, sad: 1, angry: 1 };
  const points = last7.map((e, i) => {
    const x = (i / (last7.length - 1)) * 280 + 10;
    const score = moodScores[e.mood] || 3;
    const y = 60 - (score / 5) * 50 + 5;
    return { x, y, emoji: e.emoji };
  });
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  el.innerHTML = `<svg viewBox="0 0 300 70" style="width:100%;height:70px"><defs><linearGradient id="mgrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="var(--purple)"/><stop offset="100%" stop-color="var(--orange)"/></linearGradient></defs><path d="${path}" fill="none" stroke="url(#mgrad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--orange)"/><text x="${p.x}" y="${p.y - 8}" text-anchor="middle" font-size="10">${p.emoji}</text>`).join('')}</svg>`;
}

/* ── Gratitude Exchange ── */
function openGratitudePrompt() {
  showModal('Daily Gratitude', `
    <div class="card-subtitle" style="margin-bottom:12px">Share 3 things you're grateful for today</div>
    <div class="input-group"><label>1.</label><input id="grat-1" class="input-field" placeholder="I'm grateful for..."></div>
    <div class="input-group"><label>2.</label><input id="grat-2" class="input-field" placeholder="I'm grateful for..."></div>
    <div class="input-group"><label>3.</label><input id="grat-3" class="input-field" placeholder="I'm grateful for..."></div>
    <button class="btn btn-love" onclick="saveGratitude()">Save Gratitude</button>
  `);
}

function saveGratitude() {
  const items = [1, 2, 3].map((i) => (document.getElementById('grat-' + i) || {}).value || '').filter((v) => v.trim());
  if (items.length === 0) return alert('Please enter at least one gratitude');
  APP.gratitudes.unshift({ id: Date.now(), items, time: new Date().toISOString() });
  if (APP.gratitudes.length > 90) APP.gratitudes = APP.gratitudes.slice(0, 90);
  saveState();
  closeModal();
  addHappiness(25, 'Wrote daily gratitude');
  renderGratitudes();
}

function renderGratitudes() {
  const el = document.getElementById('gratitude-list');
  if (!el) return;
  const recent = APP.gratitudes.slice(0, 5);
  if (recent.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-text">No gratitude entries yet</div></div>';
    return;
  }
  el.innerHTML = recent.map((g) => {
    const d = new Date(g.time);
    const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `<div class="gratitude-entry"><div class="gratitude-date">${dateStr}</div><ul class="gratitude-items">${g.items.map((it) => '<li>' + escHtml(it) + '</li>').join('')}</ul></div>`;
  }).join('');
}

/* ── Photo Memories ── */
function openPhotoMemory() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Photo must be under 2MB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      showModal('Add Memory', `
        <div style="text-align:center;margin-bottom:12px"><img src="${ev.target.result}" style="max-width:100%;max-height:200px;border-radius:12px" alt="Memory"></div>
        <div class="input-group"><label>Caption</label><input id="photo-caption" class="input-field" placeholder="What's this memory?"></div>
        <button class="btn btn-primary" onclick="savePhotoMemory()">Save Memory</button>
      `);
      DB.save('pendingPhoto', ev.target.result);
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function savePhotoMemory() {
  const caption = (document.getElementById('photo-caption') || {}).value || '';
  const photo = DB.load('pendingPhoto', '');
  if (!photo) return;
  const memories = DB.load('photoMemories', []);
  memories.unshift({ id: Date.now(), photo, caption: caption.trim(), time: new Date().toISOString() });
  if (memories.length > 20) memories.pop();
  DB.save('photoMemories', memories);
  try { localStorage.removeItem('uc_pendingPhoto'); } catch {}
  closeModal();
  addHappiness(20, 'Added photo memory');
  renderPhotoMemories();
}

function renderPhotoMemories() {
  const el = document.getElementById('photo-memories');
  if (!el) return;
  const memories = DB.load('photoMemories', []);
  if (memories.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-text">No photo memories yet</div></div>';
    return;
  }
  el.innerHTML = '<div class="photo-grid">' + memories.slice(0, 6).map((m) =>
    `<div class="photo-thumb" onclick="viewPhotoMemory(${m.id})"><img src="${m.photo}" alt="${escAttr(m.caption || 'Memory')}" loading="lazy"><div class="photo-caption-overlay">${escHtml(m.caption || '')}</div></div>`
  ).join('') + '</div>';
}

function viewPhotoMemory(id) {
  const memories = DB.load('photoMemories', []);
  const m = memories.find((p) => p.id === id);
  if (!m) return;
  const d = new Date(m.time);
  showModal('Memory', `
    <div style="text-align:center"><img src="${m.photo}" style="max-width:100%;max-height:300px;border-radius:12px" alt="Memory"></div>
    ${m.caption ? '<div style="text-align:center;margin-top:12px;font-size:1.1rem">' + escHtml(m.caption) + '</div>' : ''}
    <div style="text-align:center;margin-top:8px" class="card-subtitle">${d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</div>
    <button class="btn btn-secondary" style="margin-top:12px;color:var(--danger)" onclick="deletePhotoMemory(${id})">Delete Memory</button>
  `);
}

function deletePhotoMemory(id) {
  const memories = DB.load('photoMemories', []).filter((m) => m.id !== id);
  DB.save('photoMemories', memories);
  closeModal();
  renderPhotoMemories();
}

/* ── Love Language Quiz ── */
const LOVE_LANGUAGES = [
  { key: 'words', name: 'Words of Affirmation', icon: '\u{1F4AC}', prompts: ['Tell them something you admire about them', 'Write a love note today', 'Send a sweet text right now'] },
  { key: 'acts', name: 'Acts of Service', icon: '\u{1F91D}', prompts: ['Do one chore they usually handle', 'Make them coffee or tea', 'Handle dinner tonight'] },
  { key: 'gifts', name: 'Receiving Gifts', icon: '\u{1F381}', prompts: ['Pick up their favorite snack', 'Leave a small surprise note', 'Plan a thoughtful date'] },
  { key: 'time', name: 'Quality Time', icon: '\u{231A}', prompts: ['Put phones away for 30 minutes together', 'Go for a walk together', 'Play a game or watch something together'] },
  { key: 'touch', name: 'Physical Touch', icon: '\u{1F917}', prompts: ['Give a long hug right now', 'Hold hands today', 'Offer a back rub'] },
];

function openLoveLanguageQuiz() {
  const questions = [
    { q: 'I feel most loved when my partner...', a: [
      { text: 'Tells me they love me', lang: 'words' },
      { text: 'Does something helpful for me', lang: 'acts' },
      { text: 'Gives me a thoughtful gift', lang: 'gifts' },
      { text: 'Spends undivided time with me', lang: 'time' },
      { text: 'Holds me or touches me', lang: 'touch' },
    ]},
    { q: 'After a hard day, I most want...', a: [
      { text: 'To hear encouraging words', lang: 'words' },
      { text: 'Help with my responsibilities', lang: 'acts' },
      { text: 'A surprise to cheer me up', lang: 'gifts' },
      { text: 'Quality time to unwind together', lang: 'time' },
      { text: 'A big warm hug', lang: 'touch' },
    ]},
    { q: 'I feel most connected when we...', a: [
      { text: 'Have a deep conversation', lang: 'words' },
      { text: 'Work on something together', lang: 'acts' },
      { text: 'Exchange meaningful gifts', lang: 'gifts' },
      { text: 'Go on an adventure together', lang: 'time' },
      { text: 'Are physically close', lang: 'touch' },
    ]},
  ];
  APP._quizAnswers = {};
  APP._quizStep = 0;
  APP._quizQuestions = questions;
  showQuizQuestion(0);
}

function showQuizQuestion(idx) {
  const q = APP._quizQuestions[idx];
  if (!q) { finishQuiz(); return; }
  const answers = q.a.map((a, i) =>
    `<button class="btn btn-secondary quiz-answer" onclick="answerQuiz(${idx},${i},'${a.lang}')" style="text-align:left;margin-bottom:8px;width:100%">${escHtml(a.text)}</button>`
  ).join('');
  showModal(`Question ${idx + 1} of ${APP._quizQuestions.length}`, `
    <div style="font-size:1.05rem;margin-bottom:16px">${escHtml(q.q)}</div>
    ${answers}
  `);
}

function answerQuiz(qIdx, aIdx, lang) {
  APP._quizAnswers[lang] = (APP._quizAnswers[lang] || 0) + 1;
  showQuizQuestion(qIdx + 1);
}

function finishQuiz() {
  const scores = APP._quizAnswers || {};
  let topLang = 'words', topScore = 0;
  for (const [lang, score] of Object.entries(scores)) {
    if (score > topScore) { topScore = score; topLang = lang; }
  }
  APP.loveLanguage = topLang;
  saveState();
  const ll = LOVE_LANGUAGES.find((l) => l.key === topLang);
  showModal('Your Love Language', `
    <div style="text-align:center;margin-bottom:16px"><span style="font-size:3rem">${ll.icon}</span><div style="font-size:1.3rem;font-weight:700;margin-top:8px">${escHtml(ll.name)}</div></div>
    <div class="card-subtitle" style="text-align:center;margin-bottom:12px">Try this today:</div>
    <div style="text-align:center;font-size:1.05rem;color:var(--orange)">${escHtml(ll.prompts[Math.floor(Math.random() * ll.prompts.length)])}</div>
    <button class="btn btn-primary" style="margin-top:16px" onclick="closeModal()">Got it!</button>
  `);
  addHappiness(30, 'Took love language quiz');
}

function getLoveLanguagePrompt() {
  if (!APP.loveLanguage) return null;
  const ll = LOVE_LANGUAGES.find((l) => l.key === APP.loveLanguage);
  if (!ll) return null;
  return { name: ll.name, icon: ll.icon, prompt: ll.prompts[Math.floor(Math.random() * ll.prompts.length)] };
}

/* ── Breathing Exercise ── */
function startBreathingExercise() {
  APP.breathingActive = true;
  let phase = 0;
  const phases = [
    { label: 'Breathe In', duration: 4000, color: 'var(--purple)' },
    { label: 'Hold', duration: 7000, color: 'var(--orange)' },
    { label: 'Breathe Out', duration: 8000, color: 'var(--purple-light)' },
  ];
  let cycle = 0;
  const totalCycles = 3;

  function runPhase() {
    if (!APP.breathingActive || cycle >= totalCycles) {
      endBreathingExercise();
      return;
    }
    const p = phases[phase];
    const el = document.getElementById('breathing-circle');
    const label = document.getElementById('breathing-label');
    const counter = document.getElementById('breathing-counter');
    if (!el) return;

    el.style.background = p.color;
    el.style.transform = phase === 0 ? 'scale(1.3)' : phase === 2 ? 'scale(0.8)' : 'scale(1.1)';
    if (label) label.textContent = p.label;
    if (counter) counter.textContent = `Cycle ${cycle + 1} of ${totalCycles}`;

    phase++;
    if (phase >= phases.length) { phase = 0; cycle++; }
    APP._breathTimeout = setTimeout(runPhase, p.duration);
  }

  switchTab('wellness');
  const section = document.getElementById('breathing-section');
  if (section) section.style.display = 'block';
  runPhase();
  logActivity('Started breathing exercise');
}

function endBreathingExercise() {
  APP.breathingActive = false;
  if (APP._breathTimeout) clearTimeout(APP._breathTimeout);
  const section = document.getElementById('breathing-section');
  if (section) section.style.display = 'none';
  addHappiness(20, 'Completed breathing exercise');
}

function stopBreathing() {
  APP.breathingActive = false;
  if (APP._breathTimeout) clearTimeout(APP._breathTimeout);
  const section = document.getElementById('breathing-section');
  if (section) section.style.display = 'none';
}

/* ── Hug Request ── */
function openHugSettings() {
  showModal('Hug Request Settings', `
    <div class="input-group"><label>Contact Phone Number</label><input id="hug-contact" class="input-field" type="tel" placeholder="e.g. 3314571282" value="${escAttr(APP.hugContact || '')}"></div>
    <div class="input-group"><label>Hug Message</label><textarea id="hug-msg" class="input-field" rows="4">${escHtml(APP.hugMessage || DEFAULT_HUG_MESSAGE)}</textarea></div>
    <button class="btn btn-secondary" onclick="resetHugMessage()" style="margin-bottom:12px">Reset to Default</button>
    <button class="btn btn-primary" onclick="saveHugSettings()">Save</button>
  `);
}

function resetHugMessage() {
  const el = document.getElementById('hug-msg');
  if (el) el.value = DEFAULT_HUG_MESSAGE;
}

function saveHugSettings() {
  APP.hugContact = (document.getElementById('hug-contact') || {}).value.replace(/\D/g, '') || '';
  APP.hugMessage = (document.getElementById('hug-msg') || {}).value.trim() || DEFAULT_HUG_MESSAGE;
  saveState();
  closeModal();
  renderHugContact();
  logActivity('Updated hug request settings');
}

function sendHugRequest() {
  if (!APP.hugContact) {
    openHugSettings();
    return;
  }
  sendSmsViaLink(APP.hugContact, APP.hugMessage || DEFAULT_HUG_MESSAGE);
  addHappiness(30, 'Sent hug request');
  Native.hapticImpact('HEAVY');
}

function renderHugContact() {
  const el = document.getElementById('hug-contact-display');
  if (!el) return;
  if (APP.hugContact) {
    const formatted = APP.hugContact.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
    el.textContent = formatted;
  } else {
    el.textContent = 'No contact set';
  }
}

/* ── Weekly Report Card ── */
function renderWeeklyReport() {
  const el = document.getElementById('weekly-report');
  if (!el) return;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const weekKey = weekAgo.toISOString().slice(0, 10);

  const weekMoods = APP.moodJournal.filter((m) => m.time >= weekKey);
  const weekGratitudes = APP.gratitudes.filter((g) => g.time >= weekKey);
  const weekActivities = APP.activityLog.filter((a) => a.time >= weekKey);
  const moodScores = { happy: 5, loved: 5, calm: 4, anxious: 2, sad: 1, angry: 1 };
  const avgMood = weekMoods.length > 0
    ? (weekMoods.reduce((s, m) => s + (moodScores[m.mood] || 3), 0) / weekMoods.length).toFixed(1)
    : '--';

  const medsTaken = weekActivities.filter((a) => a.text.includes('Took ')).length;
  const lovesSaid = weekActivities.filter((a) => a.text.includes('Said I love you')).length;
  const checkIns = weekActivities.filter((a) => a.text.includes('check-in')).length;

  el.innerHTML = `
    <div class="report-grid">
      <div class="report-item"><div class="report-value">${avgMood}</div><div class="report-label">Avg Mood</div></div>
      <div class="report-item"><div class="report-value">${weekMoods.length}</div><div class="report-label">Journals</div></div>
      <div class="report-item"><div class="report-value">${weekGratitudes.length}</div><div class="report-label">Gratitudes</div></div>
      <div class="report-item"><div class="report-value">${medsTaken}</div><div class="report-label">Meds Taken</div></div>
      <div class="report-item"><div class="report-value">${lovesSaid}</div><div class="report-label">I Love You's</div></div>
      <div class="report-item"><div class="report-value">${checkIns}</div><div class="report-label">Check-ins</div></div>
    </div>`;
}

/* ── Streak & Badges ── */
function updateStreak() {
  const today = todayKey();
  if (APP.streakData.lastActiveDate === today) return;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  if (APP.streakData.lastActiveDate === yKey) {
    APP.streakData.currentStreak++;
  } else if (APP.streakData.lastActiveDate !== today) {
    APP.streakData.currentStreak = 1;
  }
  APP.streakData.lastActiveDate = today;
  if (APP.streakData.currentStreak > APP.streakData.longestStreak) {
    APP.streakData.longestStreak = APP.streakData.currentStreak;
  }
  checkMilestones();
  saveState();
}

function checkMilestones() {
  const milestones = [
    { streak: 3, name: '3-Day Streak', icon: '\u{1F525}' },
    { streak: 7, name: 'Week Warrior', icon: '\u{1F31F}' },
    { streak: 14, name: 'Two Week Champion', icon: '\u{1F3C6}' },
    { streak: 30, name: 'Monthly Master', icon: '\u{1F451}' },
    { streak: 100, name: 'Century Club', icon: '\u{1F4AF}' },
  ];
  const earnedNames = APP.badges.map((b) => b.name);
  for (const m of milestones) {
    if (APP.streakData.currentStreak >= m.streak && !earnedNames.includes(m.name)) {
      APP.badges.push({ name: m.name, icon: m.icon, earned: new Date().toISOString() });
      addHappiness(50, `Earned badge: ${m.name}`);
      showConfetti();
    }
  }
  const happinessMilestones = [
    { points: 500, name: 'Love Apprentice', icon: '\u{1F49C}' },
    { points: 1000, name: 'Love Master', icon: '\u{1F496}' },
    { points: 5000, name: 'Unconditional Legend', icon: '\u{267E}\u{FE0F}' },
  ];
  for (const m of happinessMilestones) {
    if (APP.happiness >= m.points && !earnedNames.includes(m.name)) {
      APP.badges.push({ name: m.name, icon: m.icon, earned: new Date().toISOString() });
      showConfetti();
    }
  }
}

function renderBadges() {
  const el = document.getElementById('badges-list');
  if (!el) return;
  if (APP.badges.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-text">Keep using the app to earn badges!</div></div>';
    return;
  }
  el.innerHTML = APP.badges.map((b) =>
    `<div class="badge-item"><span class="badge-icon">${b.icon}</span><span class="badge-name">${escHtml(b.name)}</span></div>`
  ).join('');
}

function renderStreakDisplay() {
  const el = document.getElementById('streak-display');
  if (!el) return;
  el.innerHTML = `<span class="streak-fire">\u{1F525}</span> ${APP.streakData.currentStreak} day streak <span class="card-subtitle">(best: ${APP.streakData.longestStreak})</span>`;
}

function showConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  const colors = ['#7B2FBE', '#FF6B35', '#FFD700', '#FF69B4', '#4ade80'];
  for (let i = 0; i < 50; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * 0.5 + 's';
    piece.style.animationDuration = (Math.random() * 1.5 + 1.5) + 's';
    container.appendChild(piece);
  }
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 3000);
}

/* ── Theme Toggle ── */
function toggleTheme() {
  APP.theme = APP.theme === 'dark' ? 'light' : 'dark';
  applyTheme(APP.theme);
  saveState();
  logActivity('Switched to ' + APP.theme + ' theme');
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.style.setProperty('--bg-primary', '#f5f0ff');
    document.documentElement.style.setProperty('--bg-secondary', '#ede5ff');
    document.documentElement.style.setProperty('--bg-card', '#ffffff');
    document.documentElement.style.setProperty('--bg-input', '#f0ebfa');
    document.documentElement.style.setProperty('--text-primary', '#1a0a2e');
    document.documentElement.style.setProperty('--text-secondary', '#4a3570');
    document.documentElement.style.setProperty('--text-muted', '#8a7aaa');
    document.documentElement.style.setProperty('--border', 'rgba(123, 47, 190, 0.15)');
    document.documentElement.style.setProperty('--shadow', '0 4px 20px rgba(0, 0, 0, 0.08)');
  } else {
    document.documentElement.style.setProperty('--bg-primary', '#1a0a2e');
    document.documentElement.style.setProperty('--bg-secondary', '#2d1b4e');
    document.documentElement.style.setProperty('--bg-card', '#3a2560');
    document.documentElement.style.setProperty('--bg-input', '#4a3570');
    document.documentElement.style.setProperty('--text-primary', '#f0e6ff');
    document.documentElement.style.setProperty('--text-secondary', '#c4b0dd');
    document.documentElement.style.setProperty('--text-muted', '#8a7aaa');
    document.documentElement.style.setProperty('--border', 'rgba(123, 47, 190, 0.3)');
    document.documentElement.style.setProperty('--shadow', '0 4px 20px rgba(0, 0, 0, 0.3)');
  }
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = theme === 'dark' ? '\u{2600}\u{FE0F} Light Mode' : '\u{1F319} Dark Mode';
}

function setAccentColor(color) {
  APP.accentColor = color;
  applyAccent(color);
  saveState();
}

function applyAccent(color) {
  const accents = {
    purple: { main: '#7B2FBE', light: '#9B59D0', dark: '#5A1F8E' },
    blue: { main: '#2F7BBE', light: '#599DD0', dark: '#1F5A8E' },
    green: { main: '#2FBE7B', light: '#59D09B', dark: '#1F8E5A' },
    red: { main: '#BE2F4E', light: '#D0596F', dark: '#8E1F3A' },
    pink: { main: '#BE2F9B', light: '#D059B4', dark: '#8E1F73' },
  };
  const a = accents[color] || accents.purple;
  document.documentElement.style.setProperty('--purple', a.main);
  document.documentElement.style.setProperty('--purple-light', a.light);
  document.documentElement.style.setProperty('--purple-dark', a.dark);
}

/* ── Manual triggers for testing ── */
function manualSleepPrompt() { triggerSleepPrompt(); }
function manualGigiCheck() { triggerGigiCheck(); }
function manualBedtimeCheck() { triggerBedtimeAngerCheck(); }
function manualLoveReminder() { triggerBedtimeRoutine(); }
function manualBreathing() { startBreathingExercise(); }
function clearAllData() {
  if (!confirm('This will clear all app data. Are you sure?')) return;
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('uc_')) keysToRemove.push(key);
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  location.reload();
}
