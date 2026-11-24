import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { IMPORTED_STUDENTS_SEED } from '../data/importedStudentsSeed.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Ephemeral HMAC signing key per server boot (or from SESSION_SECRET if configured)
const TOKEN_SIGNING_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

const DATA_FILE_PATH = path.resolve(PROJECT_ROOT, '.edumind-data.json');

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
    exp: now + 60 * 60 * 8, // 8 hours
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

async function startServer() {
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

  // Hydrate/merge historical students from the teacher's latest CSV non-destructively
  let seededChanges = 0;
  for (const s of IMPORTED_STUDENTS_SEED) {
    const key = `${s.grade}::${s.className.trim().toUpperCase()}::${s.name.trim().replace(/\s+/g, ' ').toLowerCase()}`;
    const existing = serverState.students[key];
    if (!existing) {
      serverState.students[key] = {
        id: s.id,
        name: s.name,
        grade: s.grade,
        className: s.className,
        loginCount: s.loginCount,
        firstLoginAt: s.firstLoginAt,
        lastActiveAt: s.lastActiveAt,
        lessonsCompleted: s.lessonsCompleted,
        totalLessons: s.totalLessons,
        sessionsCount: s.sessionsCount,
        gamesPlayed: s.gamesPlayed,
        practiceCount: s.practiceCount,
        mockExamCount: s.mockExamCount,
        totalCorrect: s.totalCorrect,
        totalQuestions: s.totalQuestions,
        avgAccuracy: s.avgAccuracy,
        totalPoints: s.totalPoints,
        weakTopic: s.weakTopic,
        recentSessions: [],
      };
      seededChanges += 1;
    } else if (
      s.sessionsCount > existing.sessionsCount ||
      s.totalPoints > existing.totalPoints ||
      s.loginCount > existing.loginCount ||
      s.lessonsCompleted > existing.lessonsCompleted
    ) {
      existing.loginCount = Math.max(existing.loginCount, s.loginCount);
      existing.lessonsCompleted = Math.max(existing.lessonsCompleted, s.lessonsCompleted);
      existing.sessionsCount = Math.max(existing.sessionsCount, s.sessionsCount);
      existing.gamesPlayed = Math.max(existing.gamesPlayed, s.gamesPlayed);
      existing.practiceCount = Math.max(existing.practiceCount, s.practiceCount);
      existing.mockExamCount = Math.max(existing.mockExamCount, s.mockExamCount);
      existing.totalQuestions = Math.max(existing.totalQuestions, s.totalQuestions);
      existing.totalCorrect = Math.min(
        existing.totalQuestions,
        Math.max(existing.totalCorrect, s.totalCorrect)
      );
      existing.avgAccuracy =
        existing.totalQuestions > 0
          ? Math.round((existing.totalCorrect / existing.totalQuestions) * 100)
          : Math.max(existing.avgAccuracy, s.avgAccuracy);
      existing.totalPoints = Math.max(existing.totalPoints, s.totalPoints);
      if (s.lastActiveAt > existing.lastActiveAt) {
        existing.lastActiveAt = s.lastActiveAt;
      }
      if (
        (!existing.weakTopic || existing.weakTopic === 'Chưa có dữ liệu') &&
        s.weakTopic &&
        s.weakTopic !== 'Chưa có dữ liệu'
      ) {
        existing.weakTopic = s.weakTopic;
      }
      seededChanges += 1;
    }
  }
  if (seededChanges > 0) {
    saveServerState(serverState);
  }

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

  // One-time atomic first-run setup when credentials are not yet configured
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

  // Protected route to recreate / reset Teacher & Admin username and password
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

    // Only Admin can manage Admin or reset Teacher without knowing Teacher's old password.
    // Teacher can only update their own Teacher account after verifying current password.
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

    // Require current password verification when modifying one's own account
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

  // Protected bulk import from CSV for Teacher/Admin
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

  // Protected analytics overview grouped by Grade (6, 7, 8, 9), by Class, and per Student
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

  // In-memory classroom game rooms for QR code projector + phone sync
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
    grade: number;
    className: string;
    status: 'waiting' | 'playing' | 'finished';
    createdAt: number;
    players: RoomPlayer[];
  }

  const rooms = new Map<string, ClassroomRoom>();

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  };

  app.post('/api/rooms', (req, res) => {
    const { gameId, grade, className } = req.body as {
      gameId?: string;
      grade?: number;
      className?: string;
    };
    const code = generateRoomCode();
    const room: ClassroomRoom = {
      code,
      gameId: String(gameId ?? 'knowledge-race-3d'),
      grade: [6, 7, 8, 9].includes(Number(grade)) ? Number(grade) : 8,
      className: String(className ?? '8A1').slice(0, 20),
      status: 'waiting',
      createdAt: Date.now(),
      players: [],
    };
    rooms.set(code, room);
    res.json(room);
  });

  app.get('/api/rooms/:code', (req, res) => {
    const code = String(req.params.code ?? '').toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ error: 'Không tìm thấy phòng học này.' });
      return;
    }
    res.json(room);
  });

  app.post('/api/rooms/:code/join', (req, res) => {
    const code = String(req.params.code ?? '').toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ error: 'Mã phòng không tồn tại.' });
      return;
    }
    const { name, carColor } = req.body as { name?: string; carColor?: string };
    const cleanName = String(name ?? '').trim().slice(0, 50);
    if (!cleanName) {
      res.status(400).json({ error: 'Vui lòng chọn hoặc nhập tên học sinh.' });
      return;
    }
    const existing = room.players.find((p) => p.name === cleanName);
    if (existing) {
      res.json({ room, player: existing });
      return;
    }
    const teamNames = ['Đội Mây Xanh', 'Đội Nắng Vàng', 'Đội Cầu Vồng'];
    const player: RoomPlayer = {
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: cleanName,
      team: teamNames[room.players.length % teamNames.length],
      carColor: carColor ?? '#2864E8',
      progress: 0,
      score: 0,
      correct: 0,
      total: 0,
      isAnswering: false,
      finished: false,
      updatedAt: Date.now(),
    };
    room.players.push(player);
    res.json({ room, player });
  });

  app.post('/api/rooms/:code/start', (req, res) => {
    const code = String(req.params.code ?? '').toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ error: 'Không tìm thấy phòng học.' });
      return;
    }
    room.status = 'playing';
    res.json(room);
  });

  app.post('/api/rooms/:code/progress', (req, res) => {
    const code = String(req.params.code ?? '').toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ error: 'Không tìm thấy phòng học.' });
      return;
    }
    const { playerId, progress, score, correct, total, isAnswering, finished } =
      req.body as Partial<RoomPlayer> & { playerId?: string };
    const player = room.players.find((p) => p.id === playerId);
    if (player) {
      if (typeof progress === 'number') player.progress = progress;
      if (typeof score === 'number') player.score = score;
      if (typeof correct === 'number') player.correct = correct;
      if (typeof total === 'number') player.total = total;
      if (typeof isAnswering === 'boolean') player.isAnswering = isAnswering;
      if (typeof finished === 'boolean') player.finished = finished;
      player.updatedAt = Date.now();
    }
    res.json(room);
  });

  app.post('/api/assistant', async (req, res) => {
    try {
      const body = req.body as {
        messages?: IncomingMessage[];
        grade?: number;
        userName?: string;
      };

      const messages = Array.isArray(body.messages) ? body.messages : [];
      const grade =
        typeof body.grade === 'number' && [6, 7, 8, 9].includes(body.grade)
          ? body.grade
          : 8;

      if (messages.length === 0) {
        res.status(400).json({
          error: 'Vui lòng nhập câu hỏi để Trợ lý học tập hỗ trợ.',
        });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Vui lòng kiểm tra mục Settings > Secrets để kích hoạt Trợ lý học tập.',
        });
        return;
      }

      const trimmedHistory = messages.slice(-10).map((m) => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: String(m.text ?? '').slice(0, 2000) }],
      }));

      const studentHint = body.userName
        ? `Học sinh đang trao đổi tên là ${String(body.userName).slice(0, 60)}, hiện đang học Tin học lớp ${grade}.`
        : `Học sinh hiện đang học Tin học lớp ${grade}.`;

      const systemInstruction = [
        'Bạn là Trợ lý học tập môn Tin học THCS của hệ thống EduMind ICT Online, bám sát chương trình Giáo dục phổ thông 2018 (Tin học 6, 7, 8, 9).',
        studentHint,
        'Nguyên tắc trả lời:',
        '- Giải thích rõ ràng, thân thiện, dễ hiểu với học sinh THCS bằng tiếng Việt chuẩn mực.',
        '- Trình bày ngắn gọn, có cấu trúc (gạch đầu dòng, ví dụ minh họa thực tế như công thức Excel, khối lệnh Scratch, đơn vị đo dữ liệu, thuật toán tìm kiếm/sắp xếp).',
        '- Khi học sinh hỏi bài tập trắc nghiệm, hãy phân tích lý do chọn đáp án đúng thay vì chỉ nêu mỗi chữ cái.',
        '- Giữ câu trả lời súc tích khoảng 120–250 từ trừ khi học sinh yêu cầu giải thích chi tiết hơn.',
      ].join('\n');

      let response;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: trimmedHistory,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
      } catch (primaryErr) {
        const primaryMsg = sanitizeErrorSnippet(primaryErr);
        console.warn('Assistant primary model (gemini-4-hydrogen) failed, falling back to gemini-3.1-flash-lite:', primaryMsg);
        if (
          primaryMsg.includes('403') ||
          primaryMsg.includes('API_KEY_INVALID') ||
          primaryMsg.includes('PERMISSION_DENIED')
        ) {
          throw primaryErr;
        }
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: trimmedHistory,
          config: {
            systemInstruction,
          },
        });
      }

      const reply = response.text?.trim();
      if (!reply) {
        res.status(502).json({
          error: 'Trợ lý chưa tạo được phản hồi phù hợp. Vui lòng thử đặt lại câu hỏi.',
        });
        return;
      }

      res.json({ reply });
    } catch (err: unknown) {
      const message = sanitizeErrorSnippet(err);
      console.error('Assistant API error:', message);

      if (message.includes('403') || message.includes('API_KEY_INVALID') || message.includes('PERMISSION_DENIED')) {
        res.status(403).json({
          error: 'Khóa API chưa hợp lệ hoặc thiếu quyền truy cập. Vui lòng kiểm tra khóa trong Settings > Secrets.',
          detail: message,
        });
        return;
      }
      if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'Hệ thống đang quá tải yêu cầu trong phút này. Vui lòng đợi một chút rồi thử lại.',
          detail: message,
        });
        return;
      }
      res.status(500).json({
        error: 'Không thể kết nối Trợ lý học tập ngay lúc này. Vui lòng thử lại sau.',
        detail: message,
      });
    }
  });

  // ==================== SHARED CUSTOM QUESTIONS API (CROSS-DEVICE SYNC) ====================
  const sanitizeIncomingQuestion = (raw: unknown): StoredCustomQuestion | null => {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Record<string, unknown>;
    const prompt = String(item.prompt ?? '').trim().slice(0, 600);
    if (prompt.length < 3) return null;

    const grade = normalizeGrade(item.grade);
    const topic = String(item.topic ?? '').trim().slice(0, 160) || `Tin học ${grade}`;
    const difficulty =
      item.difficulty === 'easy' || item.difficulty === 'medium' || item.difficulty === 'hard'
        ? item.difficulty
        : 'medium';
    const rawOpts = Array.isArray(item.options)
      ? item.options.map((o) => String(o ?? '').trim().slice(0, 300)).filter(Boolean)
      : [];
    const isTf = item.questionType === 'true-false' || rawOpts.length === 2;
    if (isTf && rawOpts.length < 2) return null;
    if (!isTf && rawOpts.length < 4) return null;

    const options = isTf
      ? ([rawOpts[0], rawOpts[1]] as [string, string])
      : ([rawOpts[0], rawOpts[1], rawOpts[2], rawOpts[3]] as [string, string, string, string]);
    const maxIdx = options.length - 1;
    const rawCorrect = Number(item.correctIndex);
    const correctIndex =
      Number.isFinite(rawCorrect) && rawCorrect >= 0 && rawCorrect <= maxIdx
        ? Math.floor(rawCorrect)
        : 0;
    const explanation =
      String(item.explanation ?? '').trim().slice(0, 600) ||
      'Đáp án đúng theo nội dung chương trình Tin học THCS.';
    const id =
      typeof item.id === 'string' && item.id.trim().length > 0
        ? item.id.trim().slice(0, 64)
        : `custom-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    return {
      id,
      grade,
      topic,
      difficulty,
      questionType: isTf ? 'true-false' : 'mcq',
      prompt,
      options,
      correctIndex,
      explanation,
    };
  };

  app.get('/api/questions', (_req, res) => {
    syncServerStateFromDiskIfNewer();
    setNoStoreHeaders(res);
    res.json({ questions: serverState.customQuestions });
  });

  app.post('/api/questions', (req, res) => {
    syncServerStateFromDiskIfNewer();
    setNoStoreHeaders(res);
    const body = req.body as {
      question?: unknown;
      questions?: unknown[];
    };
    const incomingList = Array.isArray(body.questions)
      ? body.questions
      : body.question
        ? [body.question]
        : [];
    if (incomingList.length === 0) {
      res.status(400).json({ error: 'Thiếu dữ liệu câu hỏi cần lưu.' });
      return;
    }

    const existingPromptKeys = new Set(
      serverState.customQuestions.map((q) => `${q.grade}::${q.prompt.trim().toLowerCase()}`)
    );
    const existingIds = new Set(serverState.customQuestions.map((q) => q.id));
    const added: StoredCustomQuestion[] = [];

    for (const raw of incomingList.slice(0, 50)) {
      const cleaned = sanitizeIncomingQuestion(raw);
      if (!cleaned) continue;
      const pKey = `${cleaned.grade}::${cleaned.prompt.toLowerCase()}`;
      if (existingPromptKeys.has(pKey) || existingIds.has(cleaned.id)) continue;
      existingPromptKeys.add(pKey);
      existingIds.add(cleaned.id);
      added.push(cleaned);
    }

    if (added.length > 0) {
      serverState.customQuestions = [...added, ...serverState.customQuestions].slice(0, 1000);
      persistAndBumpRevision();
    }

    res.json({
      ok: true,
      added: added.length,
      questions: serverState.customQuestions,
    });
  });

  app.delete('/api/questions/:id', (req, res) => {
    syncServerStateFromDiskIfNewer();
    setNoStoreHeaders(res);
    const targetId = String(req.params.id ?? '').trim();
    if (!targetId) {
      res.status(400).json({ error: 'Thiếu mã câu hỏi cần xóa.' });
      return;
    }
    const before = serverState.customQuestions.length;
    serverState.customQuestions = serverState.customQuestions.filter((q) => q.id !== targetId);
    if (serverState.customQuestions.length !== before) {
      persistAndBumpRevision();
    }
    res.json({ ok: true, questions: serverState.customQuestions });
  });

  // Generate fresh, non-repeating Tin hoc THCS multiple-choice questions via Gemini structured output
  app.post('/api/generate-questions', async (req, res) => {
    setNoStoreHeaders(res);
    try {
      const body = req.body as {
        grade?: number;
        topic?: string;
        customFocus?: string;
        difficulty?: 'mixed' | 'easy' | 'medium' | 'hard';
        count?: number;
        existingPrompts?: string[];
      };

      const grade =
        typeof body.grade === 'number' && [6, 7, 8, 9].includes(body.grade)
          ? body.grade
          : 8;
      const count = Math.max(3, Math.min(15, Math.floor(Number(body.count) || 5)));
      const difficulty =
        body.difficulty && ['mixed', 'easy', 'medium', 'hard'].includes(body.difficulty)
          ? body.difficulty
          : 'mixed';
      const topic = String(body.topic ?? '').trim().slice(0, 120);
      const customFocus = String(body.customFocus ?? '').trim().slice(0, 160);
      const existingPrompts = Array.isArray(body.existingPrompts)
        ? body.existingPrompts
            .map((p) => String(p ?? '').trim().slice(0, 90))
            .filter(Boolean)
            .slice(0, 16)
        : [];

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Vui lòng kiểm tra mục Settings > Secrets.',
        });
        return;
      }

      const gradeCurriculumMap: Record<number, string> = {
        6: 'Tin học 6 (Bài 1–16): Bài 1 Thông tin và dữ liệu, Bài 2 Xử lí thông tin, Bài 3 Thông tin trong máy tính (Bit, Byte, KB, MB, GB, TB), Bài 4 Mạng máy tính, Bài 5 Internet, Bài 6 Mạng thông tin toàn cầu (WWW), Bài 7 Tìm kiếm thông tin trên Internet, Bài 8 Thư điện tử, Bài 9 An toàn thông tin trên Internet, Bài 10 Sơ đồ tư duy, Bài 11 Định dạng văn bản, Bài 12 Trình bày thông tin ở dạng bảng, Bài 13 Tìm kiếm và thay thế, Bài 14 Hoàn thiện sổ lưu niệm, Bài 15 Thuật toán, Bài 16 Các cấu trúc điều khiển.',
        7: 'Tin học 7 (Bài 1–16): Bài 1 Thiết bị vào – ra, Bài 2 Phần mềm máy tính, Bài 3 Quản lí dữ liệu trong máy tính, Bài 4 Mạng xã hội và một số kênh trao đổi thông tin, Bài 5 Ứng xử trên mạng, Bài 6 Làm quen bảng tính, Bài 7 Tính toán tự động trên bảng tính, Bài 8 Công cụ hỗ trợ tính toán (SUM, AVERAGE, MAX, MIN, COUNT), Bài 9 Trình bày bảng tính, Bài 10 Hoàn thiện bảng tính, Bài 11 Tạo bài trình chiếu, Bài 12 Định dạng đối tượng trên trang chiếu, Bài 13 Hoàn thiện bài trình chiếu, Bài 14 Thuật toán tìm kiếm tuần tự, Bài 15 Thuật toán tìm kiếm nhị phân, Bài 16 Thuật toán sắp xếp.',
        8: 'Tin học 8 (Bài 1–16): Bài 1 Lược sử công cụ tính toán, Bài 2 Thông tin trong môi trường số, Bài 3 Khai thác thông tin số, Bài 4 Đạo đức và văn hoá trong sử dụng công nghệ kĩ thuật số, Bài 5 Bảng tính giải quyết bài toán thực tế (địa chỉ tương đối/tuyệt đối/hỗn hợp), Bài 6 Sắp xếp và lọc dữ liệu, Bài 7 Trình bày dữ liệu bằng biểu đồ, Bài 8a Danh sách liệt kê và hình ảnh trong văn bản, Bài 9a Tạo đầu trang chân trang cho văn bản, Bài 10a Định dạng nâng cao cho trang chiếu, Bài 11a Sử dụng bản mẫu tạo bài trình chiếu, Bài 12 Từ thuật toán đến chương trình (Scratch), Bài 13 Biểu diễn dữ liệu (hằng, biến, kiểu dữ liệu, biểu thức), Bài 14 Cấu trúc điều khiển, Bài 15 Gỡ lỗi, Bài 16 Tin học với nghề nghiệp.',
        9: 'Tin học 9 (Bài 1–16): Bài 1 Thế giới kĩ thuật số, Bài 2 Thông tin trong giải quyết vấn đề (4 tiêu chí), Bài 3 Đánh giá chất lượng thông tin, Bài 4 Một số vấn đề pháp lí về sử dụng dịch vụ Internet, Bài 5 Tìm hiểu phần mềm mô phỏng, Bài 6 Khai thác phần mềm mô phỏng, Bài 7 Trình bày thông tin trong trao đổi và hợp tác, Bài 8 Thực hành công cụ trực quan, Bài 9a Công cụ xác thực dữ liệu (Data Validation), Bài 10a Sử dụng hàm COUNTIF, Bài 11a Sử dụng hàm SUMIF, Bài 12a Sử dụng hàm IF, Bài 13a Hoàn thiện bảng tính quản lí tài chính gia đình, Bài 14 Giải quyết vấn đề, Bài 15 Bài toán tin học, Bài 16 Thực hành lập chương trình máy tính.',
      };

      const diffGuide =
        difficulty === 'easy'
          ? 'Toàn bộ ở mức Nhận biết (difficulty: "easy").'
          : difficulty === 'medium'
            ? 'Toàn bộ ở mức Thông hiểu (difficulty: "medium").'
            : difficulty === 'hard'
              ? 'Toàn bộ ở mức Vận dụng (difficulty: "hard").'
              : 'Phân bổ cân bằng giữa easy (Nhận biết), medium (Thông hiểu) và hard (Vận dụng).';

      const isSpecificLesson = Boolean(topic && topic !== 'Tất cả chủ đề');
      const topicRequirement = isSpecificLesson
        ? `Chỉ tạo câu hỏi đúng phạm vi kiến thức của bài "${topic}"${customFocus ? ` (trọng tâm: "${customFocus}")` : ''}, giữ nguyên chính xác trường topic là "${topic}".`
        : customFocus
          ? `Tập trung vào nội dung: "${customFocus}" trong chương trình Tin học ${grade}.`
          : 'Đa dạng nhiều bài học từ Bài 1 đến Bài 16 của khối lớp này, ghi rõ tên bài ở trường topic (ví dụ: "Bài 1: ...").';

      const avoidBlock =
        existingPrompts.length > 0
          ? `\nKhông lặp lại các câu hỏi đã có sau:\n- ${existingPrompts.join('\n- ')}`
          : '';

      const promptText = [
        `Tạo đúng ${count} câu hỏi trắc nghiệm 4 phương án (chỉ 1 đáp án đúng duy nhất) môn ${gradeCurriculumMap[grade]}`,
        topicRequirement,
        diffGuide,
        'Yêu cầu:',
        '- Kiến thức chính xác, phù hợp học sinh THCS, câu hỏi súc tích 1–2 câu bằng tiếng Việt.',
        '- 4 phương án trả lời độc lập, ngắn gọn, không ghi sẵn tiền tố "A.", "B.", "C.", "D." và không dùng phương án kiểu "Cả A và B" hay "Tất cả đáp án trên".',
        '- Phân bổ đều vị trí đáp án đúng correctIndex ngẫu nhiên giữa 0, 1, 2, 3.',
        '- Giải thích ngắn gọn 1–2 câu vì sao đáp án đó đúng.',
        avoidBlock,
      ].join('\n');

      const questionResponseSchema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            topic: {
              type: Type.STRING,
              description: 'Tên bài học ngắn gọn thuộc chương trình Tin học của khối lớp.',
            },
            difficulty: {
              type: Type.STRING,
              description: 'Một trong 3 giá trị: easy, medium, hard',
            },
            prompt: {
              type: Type.STRING,
              description: 'Nội dung câu hỏi trắc nghiệm rõ ràng, súc tích.',
            },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Đúng 4 phương án trả lời ngắn gọn, không kèm chữ cái A/B/C/D.',
            },
            correctIndex: {
              type: Type.INTEGER,
              description: 'Chỉ số đáp án đúng từ 0 đến 3.',
            },
            explanation: {
              type: Type.STRING,
              description: 'Lời giải thích ngắn gọn vì sao đáp án đúng.',
            },
          },
          required: ['topic', 'difficulty', 'prompt', 'options', 'correctIndex', 'explanation'],
        },
      };

      const requestAi = async (modelName: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite') =>
        ai.models.generateContent({
          model: modelName,
          contents: promptText,
          config: {
            ...(modelName === 'gemini-4-hydrogen'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            responseMimeType: 'application/json',
            responseSchema: questionResponseSchema,
          },
        });

      const waitMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const attemptModels: Array<'gemini-4-hydrogen' | 'gemini-3.1-flash-lite'> = [
        'gemini-4-hydrogen',
        'gemini-3.1-flash-lite',
        'gemini-4-hydrogen',
        'gemini-3.1-flash-lite',
      ];

      let response: Awaited<ReturnType<typeof requestAi>> | null = null;
      let lastErr: unknown = null;

      for (let i = 0; i < attemptModels.length; i++) {
        const modelName = attemptModels[i];
        try {
          response = await requestAi(modelName);
          break;
        } catch (attemptErr) {
          lastErr = attemptErr;
          const msg = sanitizeErrorSnippet(attemptErr);
          console.warn(
            `Generate Questions attempt ${i + 1}/${attemptModels.length} (${modelName}) failed:`,
            msg
          );
          if (
            msg.includes('403') ||
            msg.includes('API_KEY_INVALID') ||
            msg.includes('PERMISSION_DENIED')
          ) {
            throw attemptErr;
          }
          if (i < attemptModels.length - 1) {
            await waitMs(700 * (i + 1));
          }
        }
      }

      if (!response) {
        throw lastErr ?? new Error('503 UNAVAILABLE');
      }

      const rawText = (response.text ?? '[]')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      let parsedRaw: unknown;
      try {
        parsedRaw = JSON.parse(rawText);
      } catch {
        const arrMatch = rawText.match(/\[[\s\S]*\]/);
        parsedRaw = arrMatch ? JSON.parse(arrMatch[0]) : null;
      }

      const parsedArray = Array.isArray(parsedRaw)
        ? parsedRaw
        : parsedRaw &&
            typeof parsedRaw === 'object' &&
            Array.isArray((parsedRaw as { questions?: unknown[] }).questions)
          ? (parsedRaw as { questions: unknown[] }).questions
          : null;

      if (!Array.isArray(parsedArray)) {
        res.status(502).json({ error: 'AI trả về dữ liệu chưa đúng định dạng. Vui lòng thử lại.' });
        return;
      }

      type RawAiQuestion = {
        topic?: string;
        difficulty?: string;
        prompt?: string;
        options?: string[];
        correctIndex?: number;
        explanation?: string;
      };

      const cleaned = (parsedArray as RawAiQuestion[])
        .filter(
          (item) =>
            item &&
            typeof item.prompt === 'string' &&
            item.prompt.trim().length > 5 &&
            Array.isArray(item.options) &&
            item.options.length === 4 &&
            item.options.every((o) => typeof o === 'string' && o.trim().length > 0)
        )
        .map((item) => {
          const diff =
            item.difficulty === 'easy' ||
            item.difficulty === 'medium' ||
            item.difficulty === 'hard'
              ? item.difficulty
              : difficulty !== 'mixed'
                ? difficulty
                : 'medium';
          const origCorrect =
            typeof item.correctIndex === 'number' &&
            item.correctIndex >= 0 &&
            item.correctIndex <= 3
              ? Math.floor(item.correctIndex)
              : 0;
          const cleanOpts = item.options!.slice(0, 4).map((o) =>
            o.trim().replace(/^[A-Da-d][.)]\s*/, '')
          );

          // Shuffle the 4 options server-side so correct answers are evenly distributed across A, B, C, D
          const order = [0, 1, 2, 3];
          for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
          }
          const shuffledOpts = order.map((idx) => cleanOpts[idx]) as [string, string, string, string];
          const shuffledCorrectIndex = order.indexOf(origCorrect);

          return {
            grade,
            topic: isSpecificLesson
              ? topic
              : (item.topic ?? '').trim() || `Tin học ${grade} (AI)`,
            difficulty: diff,
            questionType: 'mcq' as const,
            prompt: item.prompt!.trim(),
            options: shuffledOpts,
            correctIndex: shuffledCorrectIndex >= 0 ? shuffledCorrectIndex : 0,
            explanation:
              (item.explanation ?? '').trim() ||
              'Đáp án đúng theo nội dung bài học Tin học THCS.',
          };
        });

      if (cleaned.length === 0) {
        res.status(502).json({
          error: 'Chưa tạo được câu hỏi hợp lệ. Vui lòng thử bấm tạo lại.',
        });
        return;
      }

      res.json({ questions: cleaned });
    } catch (err: unknown) {
      const message = sanitizeErrorSnippet(err);
      console.error('Generate Questions API error:', message);

      if (message.includes('403') || message.includes('API_KEY_INVALID') || message.includes('PERMISSION_DENIED')) {
        res.status(403).json({
          error: 'Khóa API chưa hợp lệ hoặc thiếu quyền truy cập. Vui lòng kiểm tra trong Settings > Secrets.',
          detail: message,
        });
        return;
      }
      if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'Hệ thống AI đang bận trong phút này. Vui lòng đợi vài giây rồi thử lại.',
          detail: message,
        });
        return;
      }
      if (
        message.includes('503') ||
        message.includes('UNAVAILABLE') ||
        message.includes('high demand') ||
        message.includes('overloaded') ||
        message.includes('timed out') ||
        message.includes('ETIMEDOUT')
      ) {
        res.status(503).json({
          error:
            'Máy chủ AI đang tạm thời quá tải lưu lượng truy cập. Vui lòng chờ 5–10 giây rồi bấm Tạo câu hỏi lại (hoặc chọn tạo 5 câu trước).',
          detail: message,
        });
        return;
      }
      res.status(500).json({
        error: 'Không thể tạo câu hỏi lúc này. Vui lòng thử lại sau.',
        detail: message,
      });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: PROJECT_ROOT,
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(PROJECT_ROOT, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EduMind ICT Online server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
