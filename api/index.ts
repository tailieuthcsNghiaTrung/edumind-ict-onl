import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import express from 'express';
import path from 'path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const PROJECT_ROOT = process.cwd();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Ephemeral HMAC signing key per server boot (or from SESSION_SECRET if configured)
const TOKEN_SIGNING_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

const DATA_FILE_PATH = process.env.VERCEL
  ? '/tmp/.edumind-data.json'
  : path.resolve(PROJECT_ROOT, '.edumind-data.json');

type PrivilegedRole = 'teacher' | 'admin';
const ADMIN_DEFAULT_USERNAME = 'HOÀNG KHÔI VỸ';
const ADMIN_DEFAULT_DISPLAY_NAME = 'HOÀNG KHÔI VỸ';
const TEACHER_DEFAULT_DISPLAY_NAME = 'Giáo viên Tin học';

interface StoredCredential {
  username: string;
  displayName: string;
  salt: string;
  hash: string;
  updatedAt: string;
}

interface StoredStudentProgressSnapshot {
  completedLessonIds: string[];
  dailyStreak: number;
  gameRecords: Record<string, unknown>;
  topicStats: Record<string, unknown>;
  sessions: unknown[];
}

interface StoredStudentAnalytics {
  id: string;
  name: string;
  grade: 6 | 7 | 8 | 9;
  className: string;
  loginCount: number;
  firstLoginAt: string;
  lastActiveAt: string;
  lessonsCompleted: number;
  totalLessons: number;
  sessionsCount: number;
  gamesPlayed: number;
  practiceCount: number;
  mockExamCount: number;
  totalCorrect: number;
  totalQuestions: number;
  avgAccuracy: number;
  totalPoints: number;
  weakTopic: string;
  recentSessions: {
    id: string;
    type: 'game' | 'practice' | 'mock-exam';
    title: string;
    score: number;
    maxScore: number;
    correctCount: number;
    totalQuestions: number;
    completedAt: string;
  }[];
  progressSnapshot?: StoredStudentProgressSnapshot;
}

interface StoredCustomQuestion {
  id: string;
  grade: 6 | 7 | 8 | 9;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questionType?: 'mcq' | 'true-false';
  prompt: string;
  options: [string, string, string, string] | [string, string];
  correctIndex: number;
  explanation: string;
}

interface PersistedServerState {
  credentials: {
    admin: StoredCredential | null;
    teacher: StoredCredential | null;
  };
  students: Record<string, StoredStudentAnalytics>;
  customQuestions: StoredCustomQuestion[];
}

function loadServerState(): PersistedServerState {
  const empty: PersistedServerState = {
    credentials: { admin: null, teacher: null },
    students: {},
    customQuestions: [],
  };
  try {
    if (!fs.existsSync(DATA_FILE_PATH)) return empty;
    const raw = fs.readFileSync(DATA_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedServerState>;
    const loadedAdmin = parsed.credentials?.admin ?? null;
    if (loadedAdmin) {
      if (!loadedAdmin.displayName || loadedAdmin.displayName === 'Quản trị hệ thống') {
        loadedAdmin.displayName = ADMIN_DEFAULT_DISPLAY_NAME;
      }
      loadedAdmin.username = ADMIN_DEFAULT_USERNAME;
    }
    return {
      credentials: {
        admin: loadedAdmin,
        teacher: parsed.credentials?.teacher ?? null,
      },
      students:
        parsed.students && typeof parsed.students === 'object' ? parsed.students : {},
      customQuestions: Array.isArray(parsed.customQuestions)
        ? parsed.customQuestions
        : [],
    };
  } catch {
    return empty;
  }
}

function saveServerState(state: PersistedServerState) {
  try {
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(state, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch (err) {
    console.error('Failed to persist server state:', err instanceof Error ? err.message : err);
  }
}

function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPasswordHash(password: string, salt: string, expectedHash: string): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHash, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function timingSafeStringMatch(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

interface AuthTokenPayload {
  role: PrivilegedRole;
  username: string;
  displayName: string;
  iat: number;
  exp: number;
}

function signAuthToken(payload: Omit<AuthTokenPayload, 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AuthTokenPayload = {
    ...payload,
    iat: now,
    exp: now + 60 * 60 * 8,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', TOKEN_SIGNING_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyAuthToken(token: string): AuthTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', TOKEN_SIGNING_SECRET)
    .update(encoded)
    .digest('base64url');
  if (!timingSafeStringMatch(sig, expectedSig)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as AuthTokenPayload;
    if (
      !payload ||
      (payload.role !== 'admin' && payload.role !== 'teacher') ||
      typeof payload.username !== 'string' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function normalizeUsername(u: string): string {
  return u.normalize('NFC').trim().replace(/\s+/g, ' ');
}

function getEnvCredential(role: PrivilegedRole): {
  username: string;
  password: string;
  displayName: string;
} | null {
  const p = (role === 'admin' ? process.env.ADMIN_PASSWORD : process.env.TEACHER_PASSWORD)?.trim();
  if (!p) return null;
  if (role === 'admin') {
    return {
      username: ADMIN_DEFAULT_USERNAME,
      password: p,
      displayName: ADMIN_DEFAULT_DISPLAY_NAME,
    };
  }
  const u = process.env.TEACHER_USERNAME?.trim();
  if (!u) return null;
  return {
    username: normalizeUsername(u),
    password: p,
    displayName: TEACHER_DEFAULT_DISPLAY_NAME,
  };
}

const USERNAME_REGEX = /^[\p{L}\p{N}._\- ]{3,60}$/u;

function validateUsername(u: string): string | null {
  const clean = normalizeUsername(u);
  if (!USERNAME_REGEX.test(clean)) {
    return 'Tên đăng nhập dài 3–60 kí tự, gồm chữ cái, số, khoảng trắng hoặc (., _, -).';
  }
  return null;
}

function validatePassword(p: string): string | null {
  if (typeof p !== 'string' || p.length < 6 || p.length > 100) {
    return 'Mật khẩu phải có độ dài từ 6 đến 100 kí tự.';
  }
  return null;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 35000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sanitizeErrorSnippet(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED]')
    .replace(/key=[^&\s"']+/gi, 'key=[REDACTED]')
    .slice(0, 220);
}

interface IncomingMessage {
  role: 'user' | 'model';
  text: string;
}

const app = express();
app.use(express.json({ limit: '1mb' }));

let serverState = loadServerState();
let lastDiskMtimeMs = fs.existsSync(DATA_FILE_PATH)
  ? fs.statSync(DATA_FILE_PATH).mtimeMs
  : 0;
let analyticsRevision = 1;

const setNoStoreHeaders = (res: express.Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('X-Analytics-Revision', String(analyticsRevision));
};

const syncServerStateFromDiskIfNewer = () => {
  try {
    if (!fs.existsSync(DATA_FILE_PATH)) return;
    const stat = fs.statSync(DATA_FILE_PATH);
    if (stat.mtimeMs > lastDiskMtimeMs + 5) {
      const diskState = loadServerState();
      for (const [k, diskStu] of Object.entries(diskState.students)) {
        const cur = serverState.students[k];
        if (!cur) {
          serverState.students[k] = diskStu;
        } else {
          cur.loginCount = Math.max(cur.loginCount, diskStu.loginCount);
          cur.lessonsCompleted = Math.max(cur.lessonsCompleted, diskStu.lessonsCompleted);
          cur.sessionsCount = Math.max(cur.sessionsCount, diskStu.sessionsCount);
          cur.gamesPlayed = Math.max(cur.gamesPlayed, diskStu.gamesPlayed);
          cur.practiceCount = Math.max(cur.practiceCount, diskStu.practiceCount);
          cur.mockExamCount = Math.max(cur.mockExamCount, diskStu.mockExamCount);
          cur.totalQuestions = Math.max(cur.totalQuestions, diskStu.totalQuestions);
          cur.totalCorrect = Math.min(
            cur.totalQuestions,
            Math.max(cur.totalCorrect, diskStu.totalCorrect)
          );
          cur.avgAccuracy =
            cur.totalQuestions > 0
              ? Math.round((cur.totalCorrect / cur.totalQuestions) * 100)
              : Math.max(cur.avgAccuracy, diskStu.avgAccuracy);
          cur.totalPoints = Math.max(cur.totalPoints, diskStu.totalPoints);
          if (diskStu.lastActiveAt > cur.lastActiveAt) {
            cur.lastActiveAt = diskStu.lastActiveAt;
          }
        }
      }
      if (Array.isArray(diskState.customQuestions) && diskState.customQuestions.length > 0) {
        const existingIds = new Set(serverState.customQuestions.map((q) => q.id));
        for (const q of diskState.customQuestions) {
          if (q && q.id && !existingIds.has(q.id)) {
            existingIds.add(q.id);
            serverState.customQuestions.push(q);
          }
        }
      }
      lastDiskMtimeMs = stat.mtimeMs;
    }
  } catch {
    // Ignore transient fs read errors
  }
};

const persistAndBumpRevision = () => {
  saveServerState(serverState);
  analyticsRevision += 1;
  try {
    if (fs.existsSync(DATA_FILE_PATH)) {
      lastDiskMtimeMs = fs.statSync(DATA_FILE_PATH).mtimeMs;
    }
  } catch {
    // Ignore stat error
  }
};

const extractBearerPayload = (req: express.Request): AuthTokenPayload | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return verifyAuthToken(authHeader.slice(7).trim());
};

const isRoleConfigured = (role: PrivilegedRole): boolean => {
  return Boolean(getEnvCredential(role) || serverState.credentials[role]);
};

const verifyRoleLogin = (
  role: PrivilegedRole,
  username: string,
  password: string
): { ok: boolean; displayName: string; canonicalUsername: string } => {
  const cleanInputUser = normalizeUsername(username).toLocaleLowerCase('vi-VN');
  const envCred = getEnvCredential(role);
  if (envCred) {
    const expectedUser = normalizeUsername(envCred.username).toLocaleLowerCase('vi-VN');
    const ok =
      timingSafeStringMatch(cleanInputUser, expectedUser) &&
      timingSafeStringMatch(password, envCred.password);
    return { ok, displayName: envCred.displayName, canonicalUsername: envCred.username };
  }
  const stored = serverState.credentials[role];
  if (!stored) {
    return { ok: false, displayName: '', canonicalUsername: '' };
  }
  const expectedStoredUser = normalizeUsername(stored.username).toLocaleLowerCase('vi-VN');
  const ok =
    timingSafeStringMatch(cleanInputUser, expectedStoredUser) &&
    verifyPasswordHash(password, stored.salt, stored.hash);
  return { ok, displayName: stored.displayName, canonicalUsername: stored.username };
};

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'connected',
    service: 'EduMind ICT Online',
    timestamp: new Date().toISOString(),
  });
});

// ==================== TEACHER & ADMIN AUTHENTICATION ====================
app.get('/api/auth/status', (_req, res) => {
  const envAdmin = Boolean(getEnvCredential('admin'));
  const envTeacher = Boolean(getEnvCredential('teacher'));
  const adminConfigured = isRoleConfigured('admin');
  const teacherConfigured = isRoleConfigured('teacher');
  res.json({
    envConfigured: { admin: envAdmin, teacher: envTeacher },
    configured: { admin: adminConfigured, teacher: teacherConfigured },
    requiresFirstRunSetup: !adminConfigured || !teacherConfigured,
  });
});

app.post('/api/auth/setup', (req, res) => {
  const adminAlreadySet = isRoleConfigured('admin');
  const teacherAlreadySet = isRoleConfigured('teacher');
  if (adminAlreadySet && teacherAlreadySet) {
    res.status(403).json({
      error: 'Tài khoản Giáo viên và Quản trị đã được thiết lập trước đó. Vui lòng đăng nhập để thay đổi.',
    });
    return;
  }

  const body = req.body as {
    adminUsername?: string;
    adminPassword?: string;
    adminDisplayName?: string;
    teacherUsername?: string;
    teacherPassword?: string;
    teacherDisplayName?: string;
  };

  const nextAdminUsername = normalizeUsername(
    String(body.adminUsername ?? '') || ADMIN_DEFAULT_USERNAME
  );
  const nextAdminPassword = String(body.adminPassword ?? '');
  const nextAdminDisplay =
    String(body.adminDisplayName ?? '').trim().slice(0, 60) || ADMIN_DEFAULT_DISPLAY_NAME;

  const nextTeacherUsername = normalizeUsername(String(body.teacherUsername ?? ''));
  const nextTeacherPassword = String(body.teacherPassword ?? '');
  const nextTeacherDisplay =
    String(body.teacherDisplayName ?? '').trim().slice(0, 60) || TEACHER_DEFAULT_DISPLAY_NAME;

  if (!adminAlreadySet) {
    const uErr = validateUsername(nextAdminUsername);
    if (uErr) {
      res.status(400).json({ error: `Tài khoản Quản trị: ${uErr}` });
      return;
    }
    const pErr = validatePassword(nextAdminPassword);
    if (pErr) {
      res.status(400).json({ error: `Mật khẩu Quản trị: ${pErr}` });
      return;
    }
  }

  if (!teacherAlreadySet) {
    const uErr = validateUsername(nextTeacherUsername);
    if (uErr) {
      res.status(400).json({ error: `Tài khoản Giáo viên: ${uErr}` });
      return;
    }
    const pErr = validatePassword(nextTeacherPassword);
    if (pErr) {
      res.status(400).json({ error: `Mật khẩu Giáo viên: ${pErr}` });
      return;
    }
  }

  const effectiveAdminUser = adminAlreadySet
    ? (getEnvCredential('admin')?.username ?? serverState.credentials.admin?.username ?? '')
    : nextAdminUsername;
  const effectiveTeacherUser = teacherAlreadySet
    ? (getEnvCredential('teacher')?.username ?? serverState.credentials.teacher?.username ?? '')
    : nextTeacherUsername;

  if (
    effectiveAdminUser &&
    effectiveTeacherUser &&
    effectiveAdminUser.toLowerCase() === effectiveTeacherUser.toLowerCase()
  ) {
    res.status(400).json({
      error: 'Tên đăng nhập Quản trị viên và Giáo viên cần khác nhau để phân quyền rõ ràng.',
    });
    return;
  }

  const nowIso = new Date().toISOString();
  if (!adminAlreadySet) {
    const { salt, hash } = hashPassword(nextAdminPassword);
    serverState.credentials.admin = {
      username: nextAdminUsername,
      displayName: nextAdminDisplay,
      salt,
      hash,
      updatedAt: nowIso,
    };
  }
  if (!teacherAlreadySet) {
    const { salt, hash } = hashPassword(nextTeacherPassword);
    serverState.credentials.teacher = {
      username: nextTeacherUsername,
      displayName: nextTeacherDisplay,
      salt,
      hash,
      updatedAt: nowIso,
    };
  }

  saveServerState(serverState);
  res.json({
    ok: true,
    configured: { admin: true, teacher: true },
  });
});

app.post('/api/auth/login', (req, res) => {
  const body = req.body as {
    role?: string;
    username?: string;
    password?: string;
  };

  const role: PrivilegedRole | null =
    body.role === 'admin' ? 'admin' : body.role === 'teacher' ? 'teacher' : null;
  if (!role) {
    res.status(400).json({ error: 'Vai trò đăng nhập không hợp lệ.' });
    return;
  }

  if (!isRoleConfigured(role)) {
    res.status(409).json({
      error: 'Chưa thiết lập tên đăng nhập và mật khẩu cho vai trò này. Vui lòng hoàn tất thiết lập lần đầu.',
    });
    return;
  }

  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  if (!username || !password) {
    res.status(400).json({ error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.' });
    return;
  }

  const result = verifyRoleLogin(role, username, password);
  if (!result.ok) {
    res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
    return;
  }

  const token = signAuthToken({
    role,
    username: result.canonicalUsername,
    displayName: result.displayName,
  });

  res.json({
    token,
    profile: {
      id: role === 'admin' ? 'ad-01' : 'tc-01',
      name:
        role === 'admin' &&
        (!result.displayName || result.displayName === 'Quản trị hệ thống')
          ? ADMIN_DEFAULT_DISPLAY_NAME
          : result.displayName,
      role,
      grade: 8,
      className: role === 'admin' ? 'Quản trị viên' : 'Tổ Tin học THCS',
      school: 'Trường THCS',
      avatarUrl: '/src/assets/images/avatar_teacher_female_1795468577645.jpg',
    },
  });
});

app.get('/api/auth/me', (req, res) => {
  const payload = extractBearerPayload(req);
  if (!payload) {
    res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
    return;
  }

  const buildAccountInfo = (r: PrivilegedRole) => {
    const envCred = getEnvCredential(r);
    if (envCred) {
      return {
        role: r,
        username: envCred.username,
        displayName: envCred.displayName,
        managedByEnv: true,
        updatedAt: null,
      };
    }
    const stored = serverState.credentials[r];
    return stored
      ? {
          role: r,
          username: stored.username,
          displayName: stored.displayName,
          managedByEnv: false,
          updatedAt: stored.updatedAt,
        }
      : null;
  };

  res.json({
    role: payload.role,
    username: payload.username,
    displayName: payload.displayName,
    accounts:
      payload.role === 'admin'
        ? {
            admin: buildAccountInfo('admin'),
            teacher: buildAccountInfo('teacher'),
          }
        : {
            teacher: buildAccountInfo('teacher'),
          },
  });
});

app.post('/api/auth/credentials', (req, res) => {
  const caller = extractBearerPayload(req);
  if (!caller) {
    res.status(401).json({ error: 'Vui lòng đăng nhập lại bằng tài khoản Giáo viên hoặc Quản trị.' });
    return;
  }

  const body = req.body as {
    targetRole?: string;
    currentPassword?: string;
    newUsername?: string;
    newPassword?: string;
    newDisplayName?: string;
  };

  const targetRole: PrivilegedRole | null =
    body.targetRole === 'admin' ? 'admin' : body.targetRole === 'teacher' ? 'teacher' : null;
  if (!targetRole) {
    res.status(400).json({ error: 'Tài khoản đích không hợp lệ.' });
    return;
  }

  if (caller.role === 'teacher' && targetRole !== 'teacher') {
    res.status(403).json({ error: 'Chỉ Quản trị viên mới có quyền thay đổi tài khoản Quản trị.' });
    return;
  }

  if (getEnvCredential(targetRole)) {
    res.status(400).json({
      error: `Tài khoản ${targetRole === 'admin' ? 'Quản trị' : 'Giáo viên'} đang được quản lí bằng biến môi trường máy chủ (Settings > Secrets). Hãy cập nhật tại Secrets để thay đổi.`,
    });
    return;
  }

  const isSelfUpdate = caller.role === targetRole;
  if (isSelfUpdate) {
    const curPass = String(body.currentPassword ?? '');
    const check = verifyRoleLogin(caller.role, caller.username, curPass);
    if (!check.ok) {
      res.status(401).json({ error: 'Mật khẩu hiện tại không chính xác.' });
      return;
    }
  }

  const newUsername = normalizeUsername(String(body.newUsername ?? ''));
  const newPassword = String(body.newPassword ?? '');
  const existingDisplay =
    serverState.credentials[targetRole]?.displayName ??
    (targetRole === 'admin' ? ADMIN_DEFAULT_DISPLAY_NAME : TEACHER_DEFAULT_DISPLAY_NAME);
  const newDisplayName =
    String(body.newDisplayName ?? '').trim().slice(0, 60) || existingDisplay;

  const uErr = validateUsername(newUsername);
  if (uErr) {
    res.status(400).json({ error: uErr });
    return;
  }
  const pErr = validatePassword(newPassword);
  if (pErr) {
    res.status(400).json({ error: pErr });
    return;
  }

  const otherRole: PrivilegedRole = targetRole === 'admin' ? 'teacher' : 'admin';
  const otherUser =
    getEnvCredential(otherRole)?.username ?? serverState.credentials[otherRole]?.username ?? '';
  if (
    otherUser &&
    normalizeUsername(otherUser).toLocaleLowerCase('vi-VN') ===
      newUsername.toLocaleLowerCase('vi-VN')
  ) {
    res.status(400).json({
      error: 'Tên đăng nhập mới không được trùng với vai trò còn lại.',
    });
    return;
  }

  const { salt, hash } = hashPassword(newPassword);
  const updatedAt = new Date().toISOString();
  serverState.credentials[targetRole] = {
    username: newUsername,
    displayName: newDisplayName,
    salt,
    hash,
    updatedAt,
  };
  saveServerState(serverState);

  const nextToken = isSelfUpdate
    ? signAuthToken({
        role: targetRole,
        username: newUsername,
        displayName: newDisplayName,
      })
    : undefined;

  res.json({
    ok: true,
    token: nextToken,
    updated: {
      role: targetRole,
      username: newUsername,
      displayName: newDisplayName,
      updatedAt,
    },
  });
});

// ==================== REAL STUDENT PARTICIPATION & RESULTS ANALYTICS ====================
const normalizeStudentName = (name: string) =>
  name.trim().replace(/\s+/g, ' ').slice(0, 80);

const makeStudentKey = (grade: number, className: string, name: string) =>
  `${grade}::${className.trim().toUpperCase()}::${normalizeStudentName(name).toLowerCase()}`;

const normalizeGrade = (g: unknown): 6 | 7 | 8 | 9 => {
  const n = Number(g);
  if (n === 6 || n === 7 || n === 8 || n === 9) return n;
  return 8;
};

const sanitizeProgressSnapshot = (
  raw: unknown
): StoredStudentProgressSnapshot | null => {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const completedLessonIds = Array.isArray(obj.completedLessonIds)
    ? obj.completedLessonIds
        .filter((id): id is string => typeof id === 'string' && id.length <= 32)
        .slice(0, 64)
    : [];
  const dailyStreak = Math.max(
    1,
    Math.min(365, Math.floor(Number(obj.dailyStreak) || 1))
  );
  const rawGameRecords =
    obj.gameRecords && typeof obj.gameRecords === 'object' && !Array.isArray(obj.gameRecords)
      ? (obj.gameRecords as Record<string, unknown>)
      : {};
  const gameRecords: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawGameRecords).slice(0, 20)) {
    if (typeof k === 'string' && k.length <= 40 && v && typeof v === 'object') {
      gameRecords[k] = v;
    }
  }
  const rawTopicStats =
    obj.topicStats && typeof obj.topicStats === 'object' && !Array.isArray(obj.topicStats)
      ? (obj.topicStats as Record<string, unknown>)
      : {};
  const topicStats: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawTopicStats).slice(0, 100)) {
    if (typeof k === 'string' && k.length <= 160 && v && typeof v === 'object') {
      topicStats[k] = v;
    }
  }
  const sessions = Array.isArray(obj.sessions) ? obj.sessions.slice(0, 50) : [];
  return {
    completedLessonIds,
    dailyStreak,
    gameRecords,
    topicStats,
    sessions,
  };
};

app.post('/api/analytics/student-login', (req, res) => {
  setNoStoreHeaders(res);
  const body = req.body as {
    name?: string;
    grade?: number;
    className?: string;
    lessonsCompleted?: number;
  };
  const cleanName = normalizeStudentName(String(body.name ?? ''));
  if (!cleanName) {
    res.status(400).json({ error: 'Thiếu họ tên học sinh.' });
    return;
  }
  const grade = normalizeGrade(body.grade);
  const cleanClass =
    String(body.className ?? '')
      .trim()
      .toUpperCase()
      .slice(0, 24) || `${grade}A1`;
  const key = makeStudentKey(grade, cleanClass, cleanName);
  const nowIso = new Date().toISOString();
  const lessonsCompleted = Math.max(0, Math.min(16, Math.floor(Number(body.lessonsCompleted) || 0)));

  const existing = serverState.students[key];
  if (existing) {
    existing.loginCount += 1;
    existing.lastActiveAt = nowIso;
    existing.lessonsCompleted = Math.max(existing.lessonsCompleted, lessonsCompleted);
    persistAndBumpRevision();
    setNoStoreHeaders(res);
    res.json({
      studentId: existing.id,
      progress: existing.progressSnapshot ?? null,
      revision: analyticsRevision,
    });
    return;
  }

  const id = `stu-${crypto.createHash('sha256').update(key).digest('hex').slice(0, 10)}`;
  serverState.students[key] = {
    id,
    name: cleanName,
    grade,
    className: cleanClass,
    loginCount: 1,
    firstLoginAt: nowIso,
    lastActiveAt: nowIso,
    lessonsCompleted,
    totalLessons: 16,
    sessionsCount: 0,
    gamesPlayed: 0,
    practiceCount: 0,
    mockExamCount: 0,
    totalCorrect: 0,
    totalQuestions: 0,
    avgAccuracy: 0,
    totalPoints: 0,
    weakTopic: 'Chưa có dữ liệu',
    recentSessions: [],
  };
  persistAndBumpRevision();
  setNoStoreHeaders(res);
  res.json({ studentId: id, progress: null, revision: analyticsRevision });
});

app.post('/api/analytics/session', (req, res) => {
  setNoStoreHeaders(res);
  const body = req.body as {
    name?: string;
    grade?: number;
    className?: string;
    lessonsCompleted?: number;
    weakTopic?: string;
    progressSnapshot?: unknown;
    session?: {
      id?: string;
      type?: 'game' | 'practice' | 'mock-exam';
      title?: string;
      score?: number;
      maxScore?: number;
      correctCount?: number;
      totalQuestions?: number;
      completedAt?: string;
    };
  };

  const cleanName = normalizeStudentName(String(body.name ?? ''));
  if (!cleanName) {
    res.status(400).json({ error: 'Thiếu họ tên học sinh.' });
    return;
  }
  const grade = normalizeGrade(body.grade);
  const cleanClass =
    String(body.className ?? '')
      .trim()
      .toUpperCase()
      .slice(0, 24) || `${grade}A1`;
  const key = makeStudentKey(grade, cleanClass, cleanName);
  const nowIso = new Date().toISOString();

  if (!serverState.students[key]) {
    const id = `stu-${crypto.createHash('sha256').update(key).digest('hex').slice(0, 10)}`;
    serverState.students[key] = {
      id,
      name: cleanName,
      grade,
      className: cleanClass,
      loginCount: 1,
      firstLoginAt: nowIso,
      lastActiveAt: nowIso,
      lessonsCompleted: 0,
      totalLessons: 16,
      sessionsCount: 0,
      gamesPlayed: 0,
      practiceCount: 0,
      mockExamCount: 0,
      totalCorrect: 0,
      totalQuestions: 0,
      avgAccuracy: 0,
      totalPoints: 0,
      weakTopic: 'Chưa có dữ liệu',
      recentSessions: [],
    };
  }

  const record = serverState.students[key];
  const forceLessonsCount = (body as { forceLessonsCount?: boolean }).forceLessonsCount === true;
  record.lastActiveAt = nowIso;
  if (typeof body.lessonsCompleted === 'number') {
    const incomingLessons = Math.max(0, Math.min(16, Math.floor(body.lessonsCompleted)));
    record.lessonsCompleted = forceLessonsCount
      ? incomingLessons
      : Math.max(record.lessonsCompleted, incomingLessons);
  }
  if (typeof body.weakTopic === 'string' && body.weakTopic.trim()) {
    record.weakTopic = body.weakTopic.trim().slice(0, 120);
  }
  if (body.progressSnapshot !== undefined) {
    const sanitized = sanitizeProgressSnapshot(body.progressSnapshot);
    if (sanitized) {
      if (!forceLessonsCount && record.progressSnapshot?.completedLessonIds?.length) {
        sanitized.completedLessonIds = Array.from(
          new Set([
            ...record.progressSnapshot.completedLessonIds,
            ...sanitized.completedLessonIds,
          ])
        );
      }
      record.progressSnapshot = sanitized;
    }
  }

  if (body.session && typeof body.session === 'object') {
    const sType =
      body.session.type === 'game' ||
      body.session.type === 'practice' ||
      body.session.type === 'mock-exam'
        ? body.session.type
        : 'practice';
    const score = Math.max(0, Math.min(10000, Math.floor(Number(body.session.score) || 0)));
    const maxScore = Math.max(1, Math.min(10000, Math.floor(Number(body.session.maxScore) || 100)));
    const totalQ = Math.max(0, Math.min(200, Math.floor(Number(body.session.totalQuestions) || 0)));
    const correct = Math.max(0, Math.min(totalQ, Math.floor(Number(body.session.correctCount) || 0)));
    const title = String(body.session.title ?? 'Hoạt động học tập').trim().slice(0, 120);

    record.sessionsCount += 1;
    if (sType === 'game') record.gamesPlayed += 1;
    else if (sType === 'mock-exam') record.mockExamCount += 1;
    else record.practiceCount += 1;

    record.totalCorrect += correct;
    record.totalQuestions += totalQ;
    record.avgAccuracy =
      record.totalQuestions > 0
        ? Math.round((record.totalCorrect / record.totalQuestions) * 100)
        : record.avgAccuracy;
    record.totalPoints += score;

    record.recentSessions.unshift({
      id: String(body.session.id ?? `s-${Date.now()}`).slice(0, 40),
      type: sType,
      title,
      score,
      maxScore,
      correctCount: correct,
      totalQuestions: totalQ,
      completedAt: body.session.completedAt ?? nowIso,
    });
    record.recentSessions = record.recentSessions.slice(0, 15);
  }

  persistAndBumpRevision();
  setNoStoreHeaders(res);
  res.json({ ok: true, revision: analyticsRevision });
});

app.post('/api/analytics/import', (req, res) => {
  setNoStoreHeaders(res);
  const caller = extractBearerPayload(req);
  if (!caller) {
    res.status(401).json({
      error: 'Cần đăng nhập bằng tài khoản Giáo viên hoặc Quản trị để nhập dữ liệu.',
    });
    return;
  }
  const body = req.body as {
    students?: Array<{
      id?: string;
      name?: string;
      grade?: number;
      className?: string;
      loginCount?: number;
      firstLoginAt?: string;
      lastActiveAt?: string;
      lessonsCompleted?: number;
      totalLessons?: number;
      sessionsCount?: number;
      gamesPlayed?: number;
      practiceCount?: number;
      mockExamCount?: number;
      totalCorrect?: number;
      totalQuestions?: number;
      avgAccuracy?: number;
      totalPoints?: number;
      weakTopic?: string;
    }>;
  };
  const list = Array.isArray(body.students) ? body.students.slice(0, 2000) : [];
  let imported = 0;
  const nowIso = new Date().toISOString();

  for (const item of list) {
    const cleanName = normalizeStudentName(String(item.name ?? ''));
    if (!cleanName) continue;
    const grade = normalizeGrade(item.grade);
    const cleanClass =
      String(item.className ?? '')
        .trim()
        .toUpperCase()
        .slice(0, 24) || `${grade}A1`;
    const key = makeStudentKey(grade, cleanClass, cleanName);
    const id =
      typeof item.id === 'string' && /^[a-zA-Z0-9_-]{3,64}$/.test(item.id)
        ? item.id
        : `stu-${crypto.createHash('sha256').update(key).digest('hex').slice(0, 10)}`;

    const existing = serverState.students[key];
    const sessionsCount = Math.max(0, Math.min(100000, Math.floor(Number(item.sessionsCount) || 0)));
    const totalQuestions = Math.max(
      0,
      Math.min(1000000, Math.floor(Number(item.totalQuestions) || sessionsCount * 10))
    );
    const avgAccuracy = Math.max(0, Math.min(100, Math.floor(Number(item.avgAccuracy) || 0)));
    const totalCorrect = Math.max(
      0,
      Math.min(
        totalQuestions,
        Math.floor(
          Number(item.totalCorrect) ||
            (totalQuestions > 0 ? Math.round((totalQuestions * avgAccuracy) / 100) : 0)
        )
      )
    );

    if (!existing) {
      serverState.students[key] = {
        id,
        name: cleanName,
        grade,
        className: cleanClass,
        loginCount: Math.max(1, Math.min(100000, Math.floor(Number(item.loginCount) || 1))),
        firstLoginAt: String(item.firstLoginAt || item.lastActiveAt || nowIso).slice(0, 40),
        lastActiveAt: String(item.lastActiveAt || nowIso).slice(0, 40),
        lessonsCompleted: Math.max(0, Math.min(16, Math.floor(Number(item.lessonsCompleted) || 0))),
        totalLessons: Math.max(1, Math.min(32, Math.floor(Number(item.totalLessons) || 16))),
        sessionsCount,
        gamesPlayed: Math.max(0, Math.min(100000, Math.floor(Number(item.gamesPlayed) || 0))),
        practiceCount: Math.max(0, Math.min(100000, Math.floor(Number(item.practiceCount) || 0))),
        mockExamCount: Math.max(0, Math.min(100000, Math.floor(Number(item.mockExamCount) || 0))),
        totalCorrect,
        totalQuestions,
        avgAccuracy,
        totalPoints: Math.max(0, Math.min(10000000, Math.floor(Number(item.totalPoints) || 0))),
        weakTopic: String(item.weakTopic || 'Chưa có dữ liệu').trim().slice(0, 160) || 'Chưa có dữ liệu',
        recentSessions: [],
      };
      imported += 1;
    } else {
      existing.loginCount = Math.max(existing.loginCount, Math.floor(Number(item.loginCount) || 1));
      existing.lessonsCompleted = Math.max(
        existing.lessonsCompleted,
        Math.min(16, Math.floor(Number(item.lessonsCompleted) || 0))
      );
      existing.sessionsCount = Math.max(existing.sessionsCount, sessionsCount);
      existing.gamesPlayed = Math.max(existing.gamesPlayed, Math.floor(Number(item.gamesPlayed) || 0));
      existing.practiceCount = Math.max(existing.practiceCount, Math.floor(Number(item.practiceCount) || 0));
      existing.mockExamCount = Math.max(existing.mockExamCount, Math.floor(Number(item.mockExamCount) || 0));
      existing.totalQuestions = Math.max(existing.totalQuestions, totalQuestions);
      existing.totalCorrect = Math.min(
        existing.totalQuestions,
        Math.max(existing.totalCorrect, totalCorrect)
      );
      existing.avgAccuracy =
        existing.totalQuestions > 0
          ? Math.round((existing.totalCorrect / existing.totalQuestions) * 100)
          : Math.max(existing.avgAccuracy, avgAccuracy);
      existing.totalPoints = Math.max(existing.totalPoints, Math.floor(Number(item.totalPoints) || 0));
      if (item.lastActiveAt && item.lastActiveAt > existing.lastActiveAt) {
        existing.lastActiveAt = String(item.lastActiveAt).slice(0, 40);
      }
      imported += 1;
    }
  }

  persistAndBumpRevision();
  setNoStoreHeaders(res);
  res.json({
    ok: true,
    imported,
    totalStudents: Object.keys(serverState.students).length,
    revision: analyticsRevision,
  });
});

app.get('/api/analytics/summary', (req, res) => {
  setNoStoreHeaders(res);
  const caller = extractBearerPayload(req);
  if (!caller) {
    res.status(401).json({
      error: 'Cần đăng nhập bằng tài khoản Giáo viên hoặc Quản trị để xem thống kê toàn trường.',
    });
    return;
  }

  syncServerStateFromDiskIfNewer();

  const students = Object.values(serverState.students).sort(
    (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
  );

  const grades: (6 | 7 | 8 | 9)[] = [6, 7, 8, 9];
  const byGrade = grades.map((g) => {
    const list = students.filter((s) => s.grade === g);
    const classSet = new Set(list.map((s) => s.className));
    const totalSessions = list.reduce((sum, s) => sum + s.sessionsCount, 0);
    const totCor = list.reduce((sum, s) => sum + s.totalCorrect, 0);
    const totQ = list.reduce((sum, s) => sum + s.totalQuestions, 0);
    const avgAccuracy = totQ > 0 ? Math.round((totCor / totQ) * 100) : 0;
    const avgPoints =
      list.length > 0
        ? Math.round(list.reduce((sum, s) => sum + s.totalPoints, 0) / list.length)
        : 0;
    return {
      grade: g,
      studentCount: list.length,
      classCount: classSet.size,
      totalSessions,
      avgAccuracy,
      avgPoints,
    };
  });

  const classMap = new Map<string, StoredStudentAnalytics[]>();
  for (const s of students) {
    const ck = `${s.grade}::${s.className}`;
    const arr = classMap.get(ck) ?? [];
    arr.push(s);
    classMap.set(ck, arr);
  }

  const byClass = Array.from(classMap.values())
    .map((list) => {
      const first = list[0];
      const totalSessions = list.reduce((sum, s) => sum + s.sessionsCount, 0);
      const gamesPlayed = list.reduce((sum, s) => sum + s.gamesPlayed, 0);
      const practiceCount = list.reduce(
        (sum, s) => sum + s.practiceCount + s.mockExamCount,
        0
      );
      const totCor = list.reduce((sum, s) => sum + s.totalCorrect, 0);
      const totQ = list.reduce((sum, s) => sum + s.totalQuestions, 0);
      const avgAccuracy = totQ > 0 ? Math.round((totCor / totQ) * 100) : 0;
      const avgPoints =
        list.length > 0
          ? Math.round(list.reduce((sum, s) => sum + s.totalPoints, 0) / list.length)
          : 0;
      return {
        className: first.className,
        grade: first.grade,
        studentCount: list.length,
        totalSessions,
        gamesPlayed,
        practiceCount,
        avgAccuracy,
        avgPoints,
      };
    })
    .sort((a, b) => a.grade - b.grade || a.className.localeCompare(b.className, 'vi'));

  const totalSessions = students.reduce((sum, s) => sum + s.sessionsCount, 0);
  const allCor = students.reduce((sum, s) => sum + s.totalCorrect, 0);
  const allQ = students.reduce((sum, s) => sum + s.totalQuestions, 0);
  const overallAccuracy = allQ > 0 ? Math.round((allCor / allQ) * 100) : 0;

  res.json({
    totalStudents: students.length,
    totalClasses: byClass.length,
    totalSessions,
    overallAccuracy,
    byGrade,
    byClass,
    students: students.map(({ progressSnapshot: _progressSnapshot, ...rest }) => rest),
  });
});

// ==================== CLASSROOM GAME ROOMS ====================
interface RoomPlayer {
  id: string;
  name: string;
  team?: string;
  carColor?: string;
  progress: number;
  score: number;
  correct: number;
  total: number;
  isAnswering: boolean;
  finished: boolean;
  updatedAt: number;
}

interface ClassroomRoom {
  code: string;
  gameId: string;
