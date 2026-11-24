import { useEffect, useRef, useState } from 'react';
import { CURRICULUM_CHAPTERS } from '../../data/curriculum';
import type { SeededStudentAnalytics } from '../../data/importedStudentsSeed';
import { resetAllSeenQuestions } from '../../data/questionBank';
import {
  flushPendingCloudEvents,
  recordStudentLoginToCloud,
  recordStudentSessionToCloud,
} from '../services/firestoreAnalytics';
import {
  AnalyticsOverviewResponse,
  Grade,
  Question,
  SessionRecord,
  StudentGender,
  StudentProgress,
  TopicStat,
  UserProfile,
} from '../types';

const STORAGE_USER_KEY = 'edumind_ict_user_v1';
const STAFF_SESSION_KEY = 'edumind_ict_staff_session_v1';
const LEGACY_PROGRESS_KEY = 'edumind_ict_progress_v1';
const STORAGE_PROGRESS_MAP_KEY = 'edumind_ict_progress_by_student_v2';
const STORAGE_QUESTIONS_KEY = 'edumind_ict_custom_questions_v1';
const SYNC_CHANNEL_NAME = 'edumind_ict_student_sync_v1';
const SYNC_TICK_STORAGE_KEY = 'edumind_ict_sync_tick_v1';
const ANALYTICS_CACHE_TTL_MS = 15000;
const LESSON_SYNC_DEBOUNCE_MS = 1800;
const LOGIN_DEDUP_WINDOW_MS = 3000;

let lastStudentLoginSync: { key: string; at: number } | null = null;

interface AnalyticsCacheEntry {
  token: string;
  data: AnalyticsOverviewResponse;
  fetchedAt: number;
}

let analyticsSummaryCache: AnalyticsCacheEntry | null = null;
const studentSyncSubscribers = new Set<() => void>();

export class AnalyticsAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalyticsAuthError';
  }
}

export interface ClearCacheOptions {
  broadcast?: boolean;
  notifyLocal?: boolean;
}

/**
 * Clear in-memory student analytics cache and optionally broadcast an invalidation signal
 * across all open tabs/windows on this client so student lists stay synchronized.
 */
export function clearAnalyticsCache(
  reason = 'manual',
  options: ClearCacheOptions = {}
): void {
  analyticsSummaryCache = null;
  const shouldNotifyLocal = options.notifyLocal ?? true;
  const shouldBroadcast = options.broadcast ?? true;

  if (shouldNotifyLocal) {
    studentSyncSubscribers.forEach((cb) => {
      try {
        cb();
      } catch {
        // Ignore individual listener errors
      }
    });
  }

  if (shouldBroadcast) {
    const stamp = `${Date.now()}:${reason}`;
    try {
      localStorage.setItem(SYNC_TICK_STORAGE_KEY, stamp);
    } catch {
      // Ignore storage quota / privacy mode errors
    }
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
        channel.postMessage({ type: 'STUDENTS_UPDATED', reason, at: Date.now() });
        channel.close();
      } catch {
        // Ignore BroadcastChannel errors in restricted iframes
      }
    }
  }
}

/**
 * Fetch student analytics summary from the backend with strict anti-cache headers
 * and optional forced-refresh cache bypass.
 */
export async function fetchAnalyticsSummary(
  authToken: string,
  options?: { forceRefresh?: boolean }
): Promise<AnalyticsOverviewResponse> {
  const forceRefresh = options?.forceRefresh ?? false;
  if (
    !forceRefresh &&
    analyticsSummaryCache &&
    analyticsSummaryCache.token === authToken &&
    Date.now() - analyticsSummaryCache.fetchedAt < ANALYTICS_CACHE_TTL_MS
  ) {
    return analyticsSummaryCache.data;
  }

  analyticsSummaryCache = null;
  const url = `/api/analytics/summary?_t=${Date.now()}${forceRefresh ? '&force=1' : ''}`;
  const res = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  });

  if (res.status === 401) {
    throw new AnalyticsAuthError(
      'Phiên đăng nhập Giáo viên/Quản trị đã hết hạn. Vui lòng đăng nhập lại.'
    );
  }
  if (!res.ok) {
    throw new Error('Không thể tải dữ liệu thống kê từ máy chủ.');
  }

  const data = (await res.json()) as AnalyticsOverviewResponse;
  analyticsSummaryCache = {
    token: authToken,
    data,
    fetchedAt: Date.now(),
  };
  return data;
}

/**
 * Push/merge updated student analytics records into the backend non-destructively
 * and clear local cache afterward.
 */
export async function importStudentAnalyticsToServer(
  authToken: string,
  students: SeededStudentAnalytics[],
  options?: { broadcast?: boolean }
): Promise<boolean> {
  if (!authToken || students.length === 0) return false;
  try {
    const res = await fetch(`/api/analytics/import?_t=${Date.now()}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
      body: JSON.stringify({ students }),
    });
    if (!res.ok) return false;
    clearAnalyticsCache('server-import', {
      broadcast: options?.broadcast ?? false,
      notifyLocal: false,
    });
    return true;
  } catch {
    return false;
  }
}

export const BRAND_ROBOT_LOGO = '/src/assets/images/avatar_robot_student_1795334219854.jpg';
export const STUDENT_GIRL_AVATAR = '/src/assets/images/avatar_student_ict_1795268774522.jpg';
export const STUDENT_BOY_AVATAR = '/src/assets/images/avatar_student_boy_1795335365905.jpg';
export const STUDENT_AVATAR = STUDENT_GIRL_AVATAR;
export const TEACHER_AVATAR = '/src/assets/images/avatar_teacher_female_1795468577645.jpg';
export const GAMES_BANNER = '/src/assets/images/banner_ict_games_1795268774739.jpg';

const FEMALE_MIDDLE_TOKENS = new Set([
  'thị', 'thi', 'ngọc', 'ngoc', 'thu', 'phương', 'phuong', 'thảo', 'thao',
  'bích', 'bich', 'hồng', 'hong', 'kim', 'kiều', 'kieu', 'mỹ', 'my',
  'quỳnh', 'quynh', 'tuyết', 'tuyet', 'yến', 'yen', 'nhã', 'nha', 'diệu', 'dieu',
  'thúy', 'thuy', 'trúc', 'truc', 'cẩm', 'cam', 'huyền', 'huyen',
]);

const FEMALE_GIVEN_NAMES = new Set([
  'anh', 'bích', 'chi', 'cúc', 'diễm', 'diệp', 'dung', 'duyên', 'giang',
  'hà', 'hạnh', 'hằng', 'hiền', 'hoa', 'hoài', 'hồng', 'huyền', 'hương',
  'khánh', 'khuê', 'lan', 'lệ', 'liên', 'linh', 'loan', 'ly', 'mai',
  'my', 'nga', 'ngân', 'ngọc', 'nguyệt', 'nhàn', 'nhi', 'như', 'nhung',
  'oanh', 'phương', 'phượng', 'quyên', 'quỳnh', 'sen', 'tâm', 'thanh',
  'thảo', 'thi', 'thơ', 'thu', 'thư', 'thủy', 'thúy', 'tiên', 'trà',
  'trâm', 'trang', 'trinh', 'trúc', 'tú', 'tuyết', 'uyên', 'vân', 'vi',
  'vy', 'xuân', 'yến',
]);

const MALE_MIDDLE_TOKENS = new Set([
  'văn', 'van', 'đức', 'duc', 'hữu', 'huu', 'quốc', 'quoc', 'công', 'cong',
  'đình', 'dinh', 'xuân', 'tấn', 'tan', 'tiến', 'tien', 'trọng', 'trong',
  'mạnh', 'manh', 'tuấn', 'tuan', 'nhật', 'nhat', 'quang', 'duy', 'việt', 'viet',
  'gia', 'bá', 'ba', 'khắc', 'khac', 'trung', 'thế', 'the',
]);

const MALE_GIVEN_NAMES = new Set([
  'bách', 'bảo', 'bình', 'cường', 'đạt', 'đăng', 'đức', 'dũng', 'dương',
  'duy', 'hải', 'hào', 'hậu', 'hiếu', 'hoàng', 'hùng', 'huy', 'huynh',
  'khải', 'khang', 'khoa', 'khôi', 'kiên', 'kiệt', 'lâm', 'lập', 'lợi',
  'long', 'luân', 'lực', 'mạnh', 'minh', 'nam', 'nghĩa', 'nguyên', 'nhân',
  'nhật', 'phát', 'phi', 'phong', 'phú', 'phúc', 'quân', 'quang', 'quốc',
  'quý', 'sơn', 'tài', 'tân', 'thái', 'thắng', 'thành', 'thiện', 'thịnh',
  'thuận', 'tiến', 'toàn', 'trí', 'trọng', 'trung', 'trường', 'tuấn',
  'tùng', 'vĩ', 'vỹ', 'việt', 'vinh', 'vũ', 'vương',
]);

export function inferGenderFromVietnameseName(fullName: string): StudentGender | null {
  const clean = fullName.normalize('NFC').trim().toLocaleLowerCase('vi-VN');
  if (!clean) return null;
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const given = parts[parts.length - 1];
  const middles = parts.slice(1, -1);

  // Strong middle-name markers first ("Thị" / "Văn")
  if (middles.includes('thị') || middles.includes('thi')) return 'female';
  if (middles.includes('văn') || middles.includes('van')) return 'male';

  if (MALE_GIVEN_NAMES.has(given) && !FEMALE_GIVEN_NAMES.has(given)) return 'male';
  if (FEMALE_GIVEN_NAMES.has(given) && !MALE_GIVEN_NAMES.has(given)) return 'female';

  for (const m of middles) {
    if (FEMALE_MIDDLE_TOKENS.has(m)) return 'female';
    if (MALE_MIDDLE_TOKENS.has(m)) return 'male';
  }
  return null;
}

export function getStudentAvatarByGender(
  gender?: StudentGender,
  name?: string
): string {
  const resolved = gender ?? (name ? inferGenderFromVietnameseName(name) : null) ?? 'female';
  return resolved === 'male' ? STUDENT_BOY_AVATAR : STUDENT_GIRL_AVATAR;
}

export const DEFAULT_STUDENT_PROFILE: UserProfile = {
  id: 'st-current',
  name: 'Học sinh',
  role: 'student',
  gender: 'female',
  grade: 8,
  className: '8A1',
  school: 'Trường THCS',
  avatarUrl: STUDENT_GIRL_AVATAR,
};

function createEmptyProgress(): StudentProgress {
  return {
    completedLessonIds: [],
    dailyStreak: 1,
    gameRecords: {},
    topicStats: {},
    sessions: [],
  };
}

function normalizeStudentName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function makeStudentProgressKey(profile: UserProfile | null): string | null {
  if (!profile || profile.role !== 'student') return null;
  const cleanName = normalizeStudentName(profile.name).toLowerCase();
  if (!cleanName) return null;
  const cleanClass = (profile.className || `${profile.grade}A1`).trim().toUpperCase();
  return `${profile.grade}::${cleanClass}::${cleanName}`;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function sanitizeClientProgress(raw: unknown): StudentProgress {
  const empty = createEmptyProgress();
  if (!raw || typeof raw !== 'object') return empty;
  const obj = raw as Partial<StudentProgress>;
  return {
    completedLessonIds: Array.isArray(obj.completedLessonIds)
      ? Array.from(new Set(obj.completedLessonIds.filter((id) => typeof id === 'string')))
      : [],
    dailyStreak:
      typeof obj.dailyStreak === 'number' && obj.dailyStreak >= 1
        ? Math.floor(obj.dailyStreak)
        : 1,
    gameRecords:
      obj.gameRecords && typeof obj.gameRecords === 'object' ? { ...obj.gameRecords } : {},
    topicStats:
      obj.topicStats && typeof obj.topicStats === 'object' ? { ...obj.topicStats } : {},
    sessions: Array.isArray(obj.sessions) ? obj.sessions.slice(0, 50) : [],
  };
}

function loadProgressMap(): Record<string, StudentProgress> {
  try {
    // Clean up legacy shared global progress key so students never see each other's data
    localStorage.removeItem(LEGACY_PROGRESS_KEY);
    const raw = localStorage.getItem(STORAGE_PROGRESS_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, StudentProgress> = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = sanitizeClientProgress(v);
    }
    return out;
  } catch {
    return {};
  }
}

export function findLessonIdByTopic(
  grade: Grade,
  topicOrTitle?: string
): string | null {
  if (!topicOrTitle) return null;
  const cleaned = topicOrTitle
    .replace(/^Luyện tập:\s*/i, '')
    .trim()
    .toLowerCase();
  if (!cleaned) return null;

  const gradeLessons = CURRICULUM_CHAPTERS.filter((c) => c.grade === grade).flatMap(
    (c) => c.lessons
  );
  // 1. Exact title match
  const exact = gradeLessons.find((l) => l.title.trim().toLowerCase() === cleaned);
  if (exact) return exact.id;

  // 2. Prefix/contains match on "Bài X"
  const numMatch = cleaned.match(/^bài\s+(\d+)/i);
  if (numMatch) {
    const num = Number(numMatch[1]);
    const byNum = gradeLessons.find(
      (l, idx) => (l.lessonNumber ?? idx + 1) === num
    );
    if (byNum) return byNum.id;
  }

  return null;
}

function enrichProgressCompletedLessons(prog: StudentProgress): StudentProgress {
  const idSet = new Set(prog.completedLessonIds);
  for (const s of prog.sessions) {
    if (s.type === 'practice') {
      const matched = findLessonIdByTopic(s.grade, s.topic || s.title);
      if (matched) idSet.add(matched);
    }
  }
  const mergedIds = Array.from(idSet);
  if (mergedIds.length === prog.completedLessonIds.length) {
    return prog;
  }
  return {
    ...prog,
    completedLessonIds: mergedIds,
  };
}

function loadProgressForStudentKey(key: string | null): StudentProgress {
  if (!key) return createEmptyProgress();
  const map = loadProgressMap();
  return map[key]
    ? enrichProgressCompletedLessons(sanitizeClientProgress(map[key]))
    : createEmptyProgress();
}

function saveProgressForStudentKey(key: string | null, progress: StudentProgress) {
  if (!key) return;
  try {
    const map = loadProgressMap();
    map[key] = progress;
    localStorage.setItem(STORAGE_PROGRESS_MAP_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

function pickRicherProgress(
  localProg: StudentProgress,
  serverProg: StudentProgress | null
): StudentProgress {
  const enrichedLocal = enrichProgressCompletedLessons(localProg);
  if (!serverProg) return enrichedLocal;
  const enrichedServer = enrichProgressCompletedLessons(serverProg);
  const unionCompletedIds = Array.from(
    new Set([
      ...enrichedLocal.completedLessonIds,
      ...enrichedServer.completedLessonIds,
    ])
  );
  const localWeight =
    enrichedLocal.completedLessonIds.length * 10 + enrichedLocal.sessions.length;
  const serverWeight =
    enrichedServer.completedLessonIds.length * 10 + enrichedServer.sessions.length;
  const base = serverWeight >= localWeight ? enrichedServer : enrichedLocal;
  return {
    ...base,
    completedLessonIds: unionCompletedIds,
    dailyStreak: Math.max(enrichedLocal.dailyStreak, enrichedServer.dailyStreak),
  };
}

function clearStoredActiveUser() {
  try {
    localStorage.removeItem(STORAGE_USER_KEY);
    sessionStorage.removeItem(STORAGE_USER_KEY);
  } catch {
    // Ignore storage errors
  }
}

interface StoredStaffSession {
  profile: UserProfile;
  token: string | null;
}

function saveStaffSession(profile: UserProfile, token: string | null) {
  if (profile.role !== 'teacher' && profile.role !== 'admin') return;
  try {
    sessionStorage.setItem(
      STAFF_SESSION_KEY,
      JSON.stringify({ profile, token } satisfies StoredStaffSession)
    );
  } catch {
    // Ignore storage errors
  }
}

function clearStaffSession() {
  try {
    sessionStorage.removeItem(STAFF_SESSION_KEY);
  } catch {
    // Ignore storage errors
  }
}

function loadInitialStaffSession(): StoredStaffSession | null {
  try {
    const raw = sessionStorage.getItem(STAFF_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredStaffSession>;
    if (
      parsed &&
      parsed.profile &&
      (parsed.profile.role === 'teacher' || parsed.profile.role === 'admin') &&
      (parsed.token === null ||
        (typeof parsed.token === 'string' && parsed.token.length > 10))
    ) {
      return {
        profile: { ...parsed.profile, avatarUrl: TEACHER_AVATAR },
        token: parsed.token ?? null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function loadInitialUserProfile(): UserProfile | null {
  // Never auto-restore previous student login so a student who forgets to log out
  // has their login name automatically cleared for the next user on the device.
  clearStoredActiveUser();
  // Staff (Teacher / Admin) session in sessionStorage survives F5 page reloads on the stats dashboard.
  const staff = loadInitialStaffSession();
  return staff ? staff.profile : null;
}

function loadInitialStaffToken(): string | null {
  const staff = loadInitialStaffSession();
  return staff ? staff.token : null;
}

function countCompletedLessonsInGrade(completedLessonIds: string[], grade: Grade): number {
  const gradeLessonIds = new Set(
    CURRICULUM_CHAPTERS.filter((c) => c.grade === grade).flatMap((c) =>
      c.lessons.map((l) => l.id)
    )
  );
  return completedLessonIds.filter((id) => gradeLessonIds.has(id)).length;
}

function computeWeakTopic(
  topicStats: Record<string, TopicStat>,
  grade: Grade
): string | undefined {
  const list = Object.values(topicStats).filter(
    (t) => t.grade === grade && t.total > 0
  );
  if (list.length === 0) return undefined;
  list.sort((a, b) => a.correct / a.total - b.correct / b.total);
  return list[0].topic;
}

async function syncStudentLoginWithServer(
  profile: UserProfile,
  localProgress: StudentProgress
): Promise<StudentProgress | null> {
  if (profile.role !== 'student' || !profile.name.trim()) return null;
  const studentKey = makeStudentProgressKey(profile);
  const now = Date.now();
  if (
    studentKey &&
    lastStudentLoginSync &&
    lastStudentLoginSync.key === studentKey &&
    now - lastStudentLoginSync.at < LOGIN_DEDUP_WINDOW_MS
  ) {
    return null;
  }
  if (studentKey) {
    lastStudentLoginSync = { key: studentKey, at: now };
  }

  const lessonsCompleted = countCompletedLessonsInGrade(
    localProgress.completedLessonIds,
    profile.grade
  );
  // Persist student login DIRECTLY to Cloud Firestore (`student_analytics`) with atomic increment & arrayUnion
  const cloudPromise = recordStudentLoginToCloud(
    profile,
    lessonsCompleted,
    localProgress.completedLessonIds
  );
  let serverProgress: StudentProgress | null = null;
  try {
    const res = await fetch(`/api/analytics/student-login?_t=${Date.now()}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
      body: JSON.stringify({
        name: normalizeStudentName(profile.name),
        grade: profile.grade,
        className: profile.className,
        lessonsCompleted,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        studentId?: string;
        progress?: StudentProgress | null;
      };
      serverProgress = data.progress ? sanitizeClientProgress(data.progress) : null;
    }
  } catch {
    serverProgress = null;
  } finally {
    // Wait for direct Firebase write so login is durably stored before invalidating cache
    await cloudPromise.catch(() => false);
    clearAnalyticsCache('student-login');
  }
  return serverProgress;
}

function postStudentSessionAnalytics(
  profile: UserProfile,
  nextProgress: StudentProgress,
  weakTopic?: string,
  session?: SessionRecord,
  options?: { forceLessonsCount?: boolean }
) {
  if (profile.role !== 'student' || !profile.name.trim()) return;
  const lessonsCompleted = countCompletedLessonsInGrade(
    nextProgress.completedLessonIds,
    profile.grade
  );
  // Persist student session / lesson progress DIRECTLY to Cloud Firestore (`student_analytics`)
  const cloudPromise = recordStudentSessionToCloud(
    profile,
    session ?? null,
    lessonsCompleted,
    weakTopic,
    nextProgress.completedLessonIds
  );
  const serverPromise = fetch(`/api/analytics/session?_t=${Date.now()}`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
    body: JSON.stringify({
      name: normalizeStudentName(profile.name),
      grade: profile.grade,
      className: profile.className,
      lessonsCompleted,
      forceLessonsCount: options?.forceLessonsCount === true,
      weakTopic,
      progressSnapshot: nextProgress,
      session: session
        ? {
            id: session.id,
            type: session.type,
            title: session.title,
            score: session.score,
            maxScore: session.maxScore,
            correctCount: session.correctCount,
            totalQuestions: session.totalQuestions,
            completedAt: session.completedAt,
          }
        : undefined,
    }),
  }).catch(() => {
    // Non-blocking background sync
  });

  void Promise.allSettled([cloudPromise, serverPromise]).then(() => {
    clearAnalyticsCache('student-session');
  });
}

export function useEduMindStore() {
  const [user, setUser] = useState<UserProfile | null>(loadInitialUserProfile);
  // Bearer token for Teacher/Admin is persisted only in sessionStorage for F5 continuity (cleared on logout/tab close)
  const [authToken, setAuthToken] = useState<string | null>(loadInitialStaffToken);

  const [progress, setProgress] = useState<StudentProgress>(() => {
    const initialUser = loadInitialUserProfile();
    const key = makeStudentProgressKey(initialUser);
    return loadProgressForStudentKey(key);
  });

  // Coalesce rapid lesson check/uncheck updates into one Firebase + server write
  const pendingLessonSyncRef = useRef<{
    timer: ReturnType<typeof setTimeout>;
    flush: () => void;
  } | null>(null);

  const flushPendingLessonSync = () => {
    const pending = pendingLessonSyncRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingLessonSyncRef.current = null;
    pending.flush();
  };

  const scheduleLessonSync = (
    profile: UserProfile,
    nextProgress: StudentProgress,
    weakTopic?: string,
    forceLessonsCount?: boolean
  ) => {
    if (pendingLessonSyncRef.current) {
      clearTimeout(pendingLessonSyncRef.current.timer);
    }
    const flush = () => {
      postStudentSessionAnalytics(profile, nextProgress, weakTopic, undefined, {
        forceLessonsCount,
      });
    };
    const timer = setTimeout(() => {
      pendingLessonSyncRef.current = null;
      flush();
    }, LESSON_SYNC_DEBOUNCE_MS);
    pendingLessonSyncRef.current = { timer, flush };
  };

  const [customQuestions, setCustomQuestions] = useState<Question[]>(() =>
    loadFromStorage<Question[]>(STORAGE_QUESTIONS_KEY, [])
  );

  // Monotonically increasing version bumped whenever student data changes in this or another tab
  const [studentSyncVersion, setStudentSyncVersion] = useState(0);

  // Track currently active student key so async server hydration never writes into a different student's session
  const activeStudentKeyRef = useRef<string | null>(makeStudentProgressKey(user));
  useEffect(() => {
    activeStudentKeyRef.current = makeStudentProgressKey(user);
  }, [user]);

  // Listen for local & cross-tab cache invalidation events and flush queued offline cloud events
  useEffect(() => {
    const bumpSyncVersion = () => {
      analyticsSummaryCache = null;
      setStudentSyncVersion((v) => v + 1);
    };

    studentSyncSubscribers.add(bumpSyncVersion);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
        channel.onmessage = () => {
          bumpSyncVersion();
        };
      } catch {
        channel = null;
      }
    }

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === SYNC_TICK_STORAGE_KEY && e.newValue) {
        bumpSyncVersion();
      }
    };
    window.addEventListener('storage', handleStorageEvent);

    const flushQueued = () => {
      void flushPendingCloudEvents().then((flushed) => {
        if (flushed > 0) {
          clearAnalyticsCache('flush-offline-events');
        }
      });
    };
    flushQueued();
    window.addEventListener('online', flushQueued);

    return () => {
      studentSyncSubscribers.delete(bumpSyncVersion);
      if (channel) {
        try {
          channel.close();
        } catch {
          // Ignore
        }
      }
      window.removeEventListener('storage', handleStorageEvent);
      window.removeEventListener('online', flushQueued);
    };
  }, []);

  // Always keep active student login strictly in memory, flush any debounced lesson writes on hide/exit,
  // and clean student storage on tab close/unload so forgetting to click Logout never leaves the student's login name behind.
  useEffect(() => {
    clearStoredActiveUser();
    const handlePageExit = () => {
      flushPendingLessonSync();
      clearStoredActiveUser();
    };
    const handleVisibility = () => {
      if (document.hidden) {
        flushPendingLessonSync();
      }
    };
    window.addEventListener('pagehide', handlePageExit);
    window.addEventListener('beforeunload', handlePageExit);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      flushPendingLessonSync();
      window.removeEventListener('pagehide', handlePageExit);
      window.removeEventListener('beforeunload', handlePageExit);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Hydrate shared custom/AI MCQ questions from server so questions created on any device work everywhere
  useEffect(() => {
    let active = true;
    const syncCustomQuestionsFromServer = async () => {
      try {
        const res = await fetch(`/api/questions?_t=${Date.now()}`, {
          method: 'GET',
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!res.ok || !active) return;
        const data = (await res.json()) as { questions?: Question[] };
        if (!Array.isArray(data.questions) || !active) return;
        setCustomQuestions((prev) => {
          const merged: Question[] = [];
          const seen = new Set<string>();
          for (const q of [...data.questions!, ...prev]) {
            if (!q || !q.prompt) continue;
            const key = `${q.grade}::${q.prompt.trim().toLowerCase()}`;
            if (!seen.has(key)) {
              seen.add(key);
              merged.push(q);
            }
          }
          return merged;
        });
      } catch {
        // Offline / fallback to localStorage
      }
    };
    void syncCustomQuestionsFromServer();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_QUESTIONS_KEY, JSON.stringify(customQuestions));
    } catch {
      // Ignore storage quota errors (e.g. private browsing on iOS Safari)
    }
  }, [customQuestions]);

  const hydrateStudentProgress = (profile: UserProfile) => {
    const key = makeStudentProgressKey(profile);
    activeStudentKeyRef.current = key;
    if (!key) {
      setProgress(createEmptyProgress());
      return;
    }
    const localProg = loadProgressForStudentKey(key);
    setProgress(localProg);

    void syncStudentLoginWithServer(profile, localProg).then((serverProg) => {
      if (!serverProg || activeStudentKeyRef.current !== key) return;
      const merged = pickRicherProgress(localProg, serverProg);
      setProgress(merged);
      saveProgressForStudentKey(key, merged);
    });
  };

  const updateUser = (patch: Partial<UserProfile>) => {
    setUser((prev) => {
      if (!prev) return null;
      // Role changes are strictly disallowed via profile editing
      const { role: _ignoredRole, ...safePatch } = patch;
      const nextName =
        safePatch.name !== undefined ? normalizeStudentName(safePatch.name) : prev.name;
      const nextGender: StudentGender | undefined =
        prev.role === 'student'
          ? (safePatch.gender ??
              prev.gender ??
              inferGenderFromVietnameseName(nextName) ??
              'female')
          : undefined;
      const next: UserProfile = {
        ...prev,
        ...safePatch,
        name: nextName,
        role: prev.role,
        gender: nextGender,
        avatarUrl:
          prev.role === 'student'
            ? getStudentAvatarByGender(nextGender, nextName)
            : TEACHER_AVATAR,
      };
      const prevKey = makeStudentProgressKey(prev);
      const nextKey = makeStudentProgressKey(next);
      if (next.role === 'student' && prevKey !== nextKey) {
        // Switching to a different student name/grade/class immediately loads ONLY that student's own progress
        resetAllSeenQuestions();
        hydrateStudentProgress(next);
      }
      return next;
    });
  };

  const loginUser = (profile: UserProfile, token?: string | null) => {
    const normalizedName = normalizeStudentName(profile.name);
    const resolvedGender: StudentGender | undefined =
      profile.role === 'student'
        ? (profile.gender ?? inferGenderFromVietnameseName(normalizedName) ?? 'female')
        : undefined;
    const normalizedProfile: UserProfile =
      profile.role === 'student'
        ? {
            ...profile,
            name: normalizedName,
            gender: resolvedGender,
            className: (profile.className || `${profile.grade}A1`).trim().toUpperCase(),
            avatarUrl: getStudentAvatarByGender(resolvedGender, normalizedName),
          }
        : {
            ...profile,
            avatarUrl: TEACHER_AVATAR,
          };

    resetAllSeenQuestions();
    setUser(normalizedProfile);
    const nextToken = normalizedProfile.role === 'student' ? null : (token ?? null);
    setAuthToken(nextToken);

    if (normalizedProfile.role === 'student') {
      clearStaffSession();
      hydrateStudentProgress(normalizedProfile);
    } else {
      saveStaffSession(normalizedProfile, nextToken);
      activeStudentKeyRef.current = null;
      setProgress(createEmptyProgress());
    }
  };

  const updateAuthToken = (nextToken: string, updatedDisplayName?: string) => {
    setAuthToken(nextToken);
    setUser((prev) => {
      if (!prev) return prev;
      const updated = updatedDisplayName ? { ...prev, name: updatedDisplayName } : prev;
      saveStaffSession(updated, nextToken);
      return updated;
    });
  };

  const logoutUser = () => {
    // Flush any pending student lesson sync before clearing active user
    flushPendingLessonSync();
    // Restore lessons, practice, and games completely to clean default state on logout.
    // Saved student progress stays safely keyed by that student's exact identity and only reappears when they log back in.
    activeStudentKeyRef.current = null;
    resetAllSeenQuestions();
    setUser(null);
    setAuthToken(null);
    setProgress(createEmptyProgress());
    clearStaffSession();
    try {
      localStorage.removeItem(STORAGE_USER_KEY);
      localStorage.removeItem(LEGACY_PROGRESS_KEY);
    } catch {
      // Ignore
    }
  };

  const toggleLessonComplete = (lessonId: string) => {
    const studentKey = makeStudentProgressKey(user);
    setProgress((prev) => {
      const exists = prev.completedLessonIds.includes(lessonId);
      const nextCompleted = exists
        ? prev.completedLessonIds.filter((id) => id !== lessonId)
        : [...prev.completedLessonIds, lessonId];
      const nextProgress: StudentProgress = {
        ...prev,
        completedLessonIds: nextCompleted,
      };
      if (user && user.role === 'student' && studentKey) {
        saveProgressForStudentKey(studentKey, nextProgress);
        scheduleLessonSync(
          user,
          nextProgress,
          computeWeakTopic(prev.topicStats, user.grade),
          exists
        );
      }
      return nextProgress;
    });
  };

  const markLessonComplete = (lessonId: string) => {
    if (!lessonId) return;
    const studentKey = makeStudentProgressKey(user);
    setProgress((prev) => {
      if (prev.completedLessonIds.includes(lessonId)) return prev;
      const nextProgress: StudentProgress = {
        ...prev,
        completedLessonIds: [...prev.completedLessonIds, lessonId],
      };
      if (user && user.role === 'student' && studentKey) {
        saveProgressForStudentKey(studentKey, nextProgress);
        scheduleLessonSync(
          user,
          nextProgress,
          computeWeakTopic(prev.topicStats, user.grade),
          false
        );
      }
      return nextProgress;
    });
  };

  const recordSession = (
    session: Omit<SessionRecord, 'id' | 'completedAt'>,
    topicBreakdown: { grade: Grade; topic: string; isCorrect: boolean }[]
  ) => {
    const newSession: SessionRecord = {
      ...session,
      id: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      completedAt: new Date().toISOString(),
    };
    const studentKey = makeStudentProgressKey(user);
    const autoCompletedLessonId =
      session.type === 'practice'
        ? findLessonIdByTopic(session.grade, session.topic || session.title)
        : null;

    setProgress((prev) => {
      const nextTopicStats: Record<string, TopicStat> = { ...prev.topicStats };
      for (const item of topicBreakdown) {
        const key = `${item.grade}::${item.topic}`;
        const existing = nextTopicStats[key] ?? {
          grade: item.grade,
          topic: item.topic,
          correct: 0,
          total: 0,
        };
        nextTopicStats[key] = {
          ...existing,
          correct: existing.correct + (item.isCorrect ? 1 : 0),
          total: existing.total + 1,
        };
      }

      const nextGameRecords = { ...prev.gameRecords };
      if (session.type === 'game' && session.gameId) {
        const prevRec = nextGameRecords[session.gameId];
        nextGameRecords[session.gameId] = {
          bestScore: Math.max(prevRec?.bestScore ?? 0, session.score),
          plays: (prevRec?.plays ?? 0) + 1,
          bestStreak:
            session.bestStreak !== undefined
              ? Math.max(prevRec?.bestStreak ?? 0, session.bestStreak)
              : prevRec?.bestStreak,
          bestGems:
            session.gemsUnlocked !== undefined
              ? Math.max(prevRec?.bestGems ?? 0, session.gemsUnlocked)
              : prevRec?.bestGems,
          bestTimeSeconds:
            session.gameId === 'speed-race' && session.correctCount >= 3
              ? prevRec?.bestTimeSeconds
                ? Math.min(prevRec.bestTimeSeconds, session.durationSeconds)
                : session.durationSeconds
              : prevRec?.bestTimeSeconds,
          bestRank: session.rankTitle ?? prevRec?.bestRank,
        };
      }

      const nextCompletedLessonIds =
        autoCompletedLessonId && !prev.completedLessonIds.includes(autoCompletedLessonId)
          ? [...prev.completedLessonIds, autoCompletedLessonId]
          : prev.completedLessonIds;

      const nextProgress: StudentProgress = {
        ...prev,
        completedLessonIds: nextCompletedLessonIds,
        sessions: [newSession, ...prev.sessions].slice(0, 50),
        topicStats: nextTopicStats,
        gameRecords: nextGameRecords,
      };

      if (user && user.role === 'student' && studentKey) {
        saveProgressForStudentKey(studentKey, nextProgress);
        const weakTopic = computeWeakTopic(nextTopicStats, user.grade);
        postStudentSessionAnalytics(user, nextProgress, weakTopic, newSession);
      }

      return nextProgress;
    });
  };

  const resetProgress = () => {
    const empty = createEmptyProgress();
    setProgress(empty);
    const studentKey = makeStudentProgressKey(user);
    if (user && user.role === 'student' && studentKey) {
      saveProgressForStudentKey(studentKey, empty);
      postStudentSessionAnalytics(user, empty, undefined, undefined, {
        forceLessonsCount: true,
      });
    }
  };

  const addCustomQuestion = (q: Omit<Question, 'id'>) => {
    const newQuestion: Question = {
      ...q,
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    };
    setCustomQuestions((prev) => [newQuestion, ...prev]);
    fetch(`/api/questions?_t=${Date.now()}`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: newQuestion }),
    }).catch(() => {
      // Non-blocking sync
    });
  };

  const addCustomQuestionsBatch = (questions: Omit<Question, 'id'>[]): number => {
    const now = Date.now();
    const freshToPush: Question[] = [];
    setCustomQuestions((prev) => {
      const existingSet = new Set(
        prev.map((q) => `${q.grade}::${q.prompt.trim().toLowerCase()}`)
      );
      const fresh: Question[] = [];
      questions.forEach((q, idx) => {
        const key = `${q.grade}::${q.prompt.trim().toLowerCase()}`;
        if (!existingSet.has(key)) {
          existingSet.add(key);
          fresh.push({
            ...q,
            id: `ai-${now}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
          });
        }
      });
      freshToPush.push(...fresh);
      return [...fresh, ...prev];
    });
    const payload =
      freshToPush.length > 0
        ? freshToPush
        : questions.map((q, idx) => ({
            ...q,
            id: `ai-${now}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
          }));
    if (payload.length > 0) {
      fetch(`/api/questions?_t=${Date.now()}`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: payload }),
      }).catch(() => {
        // Non-blocking sync
      });
    }
    return payload.length;
  };

  const deleteCustomQuestion = (id: string) => {
    setCustomQuestions((prev) => prev.filter((q) => q.id !== id));
    fetch(`/api/questions/${encodeURIComponent(id)}?_t=${Date.now()}`, {
      method: 'DELETE',
      cache: 'no-store',
    }).catch(() => {
      // Non-blocking sync
    });
  };

  return {
    user,
    authToken,
    progress,
    customQuestions,
    studentSyncVersion,
    invalidateStudentCache: clearAnalyticsCache,
    updateUser,
    loginUser,
    updateAuthToken,
    logoutUser,
    toggleLessonComplete,
    markLessonComplete,
    recordSession,
    resetProgress,
    addCustomQuestion,
    addCustomQuestionsBatch,
    deleteCustomQuestion,
  };
}
