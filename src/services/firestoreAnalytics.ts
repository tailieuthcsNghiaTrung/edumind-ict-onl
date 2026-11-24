import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  getDocsFromServer,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import { CURRICULUM_CHAPTERS } from '../../data/curriculum';
import {
  IMPORTED_STUDENTS_SEED,
  type SeededStudentAnalytics,
} from '../../data/importedStudentsSeed';
import {
  db,
  FIREBASE_COLLECTIONS,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import type {
  AnalyticsOverviewResponse,
  ClassAnalyticsSummary,
  Grade,
  GradeAnalyticsSummary,
  SessionRecord,
  StudentAnalyticsRecord,
  UserProfile,
} from '../types';

const STUDENT_ANALYTICS_COLLECTION = FIREBASE_COLLECTIONS.STUDENT_ANALYTICS;
const STUDENT_EVENTS_COLLECTION = FIREBASE_COLLECTIONS.STUDENT_EVENTS;
const PENDING_CLOUD_EVENTS_KEY = 'edumind_pending_cloud_events_v1';
const GRADES: Grade[] = [6, 7, 8, 9];
const EVENT_FOLD_DEBOUNCE_MS = 2500;

interface QueuedCloudEvent {
  eventId: string;
  eventType: 'login' | 'session';
  studentId: string;
  name: string;
  grade: Grade;
  className: string;
  lessonsCompleted: number;
  completedLessonIds?: string[];
  sessionType: 'none' | 'game' | 'practice' | 'mock-exam';
  sessionTitle: string;
  score: number;
  maxScore: number;
  correctCount: number;
  totalQuestions: number;
  weakTopic: string;
}

let flushInFlightPromise: Promise<number> | null = null;
let foldInFlightPromise: Promise<number> | null = null;

const GRADE_LESSON_ID_SETS: Record<Grade, Set<string>> = {
  6: new Set(
    CURRICULUM_CHAPTERS.filter((c) => c.grade === 6).flatMap((c) =>
      c.lessons.map((l) => l.id)
    )
  ),
  7: new Set(
    CURRICULUM_CHAPTERS.filter((c) => c.grade === 7).flatMap((c) =>
      c.lessons.map((l) => l.id)
    )
  ),
  8: new Set(
    CURRICULUM_CHAPTERS.filter((c) => c.grade === 8).flatMap((c) =>
      c.lessons.map((l) => l.id)
    )
  ),
  9: new Set(
    CURRICULUM_CHAPTERS.filter((c) => c.grade === 9).flatMap((c) =>
      c.lessons.map((l) => l.id)
    )
  ),
};

function sanitizeCompletedLessonIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const unique = new Set<string>();
  for (const item of raw) {
    if (typeof item === 'string') {
      const clean = item.trim();
      if (clean.length >= 1 && clean.length <= 32) {
        unique.add(clean);
        if (unique.size >= 64) break;
      }
    }
  }
  return Array.from(unique);
}

function countLessonsForGrade(ids: string[], grade: Grade): number {
  const validSet = GRADE_LESSON_ID_SETS[grade];
  let count = 0;
  for (const id of ids) {
    if (validSet.has(id)) count += 1;
  }
  return Math.min(16, count);
}

async function getDocsForceServer(q: Query) {
  try {
    return await getDocsFromServer(q);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('offline') || msg.includes('unavailable')) {
      return await getDocs(q);
    }
    throw err;
  }
}

function loadQueuedCloudEvents(): QueuedCloudEvent[] {
  try {
    const raw = localStorage.getItem(PENDING_CLOUD_EVENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedCloudEvent[]).slice(0, 100) : [];
  } catch {
    return [];
  }
}

function saveQueuedCloudEvents(events: QueuedCloudEvent[]) {
  try {
    if (events.length === 0) {
      localStorage.removeItem(PENDING_CLOUD_EVENTS_KEY);
    } else {
      localStorage.setItem(PENDING_CLOUD_EVENTS_KEY, JSON.stringify(events.slice(0, 100)));
    }
  } catch {
    // Ignore storage quota errors
  }
}

function enqueueCloudEvent(ev: QueuedCloudEvent) {
  const existing = loadQueuedCloudEvents();
  if (!existing.some((x) => x.eventId === ev.eventId)) {
    saveQueuedCloudEvents([...existing, ev]);
  }
}

function normalizeStudentName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 100);
}

function normalizeClassName(className: string | undefined, grade: Grade): string {
  const clean = String(className ?? '')
    .trim()
    .toUpperCase()
    .slice(0, 24);
  return clean || `${grade}A1`;
}

function normalizeGrade(grade: unknown): Grade {
  const n = Number(grade);
  if (n === 6 || n === 7 || n === 8 || n === 9) return n;
  return 8;
}

function clampInt(val: unknown, min: number, max: number): number {
  const n = Math.floor(Number(val) || 0);
  return Math.max(min, Math.min(max, n));
}

export async function makeDeterministicStudentId(
  grade: Grade,
  className: string,
  name: string
): Promise<string> {
  const cleanName = normalizeStudentName(name).toLowerCase();
  const cleanClass = normalizeClassName(className, grade);
  const key = `${grade}::${cleanClass}::${cleanName}`;

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(key);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `stu-${hex.slice(0, 10)}`;
  }

  // Deterministic fallback if Web Crypto is unavailable
  let h1 = 0xdeadbeef ^ key.length;
  let h2 = 0x41c6ce57 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    const ch = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex =
    (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  return `stu-${hex.slice(0, 10)}`;
}

function makeEventId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `evt-${Date.now()}-${rand}`;
}

/**
 * Write a student's login or session update DIRECTLY to `student_analytics/{studentId}`
 * using atomic Firestore `increment()` and `arrayUnion()` so existing student records
 * are NEVER overwritten or wiped, even when no teacher dashboard is open.
 */
async function upsertStudentDirectToCloud(ev: QueuedCloudEvent): Promise<boolean> {
  const docPath = `${STUDENT_ANALYTICS_COLLECTION}/${ev.studentId}`;
  const ref = doc(db, STUDENT_ANALYTICS_COLLECTION, ev.studentId);
  const nowIso = new Date().toISOString();
  const safeLessonIds = sanitizeCompletedLessonIds(ev.completedLessonIds);
  const derivedLessons = Math.max(
    clampInt(ev.lessonsCompleted, 0, 16),
    countLessonsForGrade(safeLessonIds, ev.grade)
  );
  const isSession = ev.eventType === 'session' && ev.sessionType !== 'none';
  const isLogin = ev.eventType === 'login';

  // Build strictly monotonic atomic update payload (never resets or decreases existing counters)
  const updatePayload: Record<string, unknown> = {
    lastActiveAt: nowIso,
    source: 'live',
    updatedAt: serverTimestamp(),
  };

  if (isLogin) {
    updatePayload.loginCount = increment(1);
  }
  if (isSession) {
    updatePayload.sessionsCount = increment(1);
    if (ev.sessionType === 'game') updatePayload.gamesPlayed = increment(1);
    else if (ev.sessionType === 'mock-exam') updatePayload.mockExamCount = increment(1);
    else updatePayload.practiceCount = increment(1);

    if (ev.totalQuestions > 0) {
      updatePayload.totalQuestions = increment(ev.totalQuestions);
    }
    if (ev.correctCount > 0) {
      updatePayload.totalCorrect = increment(ev.correctCount);
    }
    if (ev.score > 0) {
      updatePayload.totalPoints = increment(ev.score);
    }
  }
  if (safeLessonIds.length > 0) {
    updatePayload.completedLessonIds = arrayUnion(...safeLessonIds);
  }
  if (ev.weakTopic && ev.weakTopic !== 'Chưa có dữ liệu') {
    updatePayload.weakTopic = ev.weakTopic;
  }

  // Initial document payload used ONLY if the student document does not exist yet
  const initialAcc =
    ev.totalQuestions > 0
      ? clampInt(Math.round((ev.correctCount / ev.totalQuestions) * 100), 0, 100)
      : 0;
  const createPayload: Record<string, unknown> = {
    id: ev.studentId,
    name: ev.name,
    grade: ev.grade,
    className: ev.className,
    loginCount: 1,
    firstLoginAt: nowIso,
    lastActiveAt: nowIso,
    lessonsCompleted: derivedLessons,
    ...(safeLessonIds.length > 0 ? { completedLessonIds: safeLessonIds } : {}),
    totalLessons: 16,
    sessionsCount: isSession ? 1 : 0,
    gamesPlayed: isSession && ev.sessionType === 'game' ? 1 : 0,
    practiceCount: isSession && ev.sessionType === 'practice' ? 1 : 0,
    mockExamCount: isSession && ev.sessionType === 'mock-exam' ? 1 : 0,
    totalCorrect: isSession ? ev.correctCount : 0,
    totalQuestions: isSession ? ev.totalQuestions : 0,
    avgAccuracy: isSession ? initialAcc : 0,
    totalPoints: isSession ? ev.score : 0,
    weakTopic: ev.weakTopic || 'Chưa có dữ liệu',
    source: 'live',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    // 1. Try atomic increment/merge update on existing student record first
    await updateDoc(ref, updatePayload);
    return true;
  } catch (updateErr) {
    const code = (updateErr as { code?: string })?.code ?? '';
    const msg = updateErr instanceof Error ? updateErr.message : String(updateErr);
    const isNotFound =
      code === 'not-found' ||
      msg.includes('No document to update') ||
      msg.includes('NOT_FOUND');

    if (isNotFound) {
      // 2. Document does not exist yet -> create initial student document
      try {
        await setDoc(ref, createPayload);
        return true;
      } catch (createErr) {
        // 3. Handle rare race where another tab created the doc milliseconds ago
        try {
          await updateDoc(ref, updatePayload);
          return true;
        } catch {
          try {
            handleFirestoreError(createErr, OperationType.CREATE, docPath);
          } catch {
            // Structured error logged
          }
          return false;
        }
      }
    }

    try {
      handleFirestoreError(updateErr, OperationType.UPDATE, docPath);
    } catch {
      // Structured error logged
    }
    return false;
  }
}

/**
 * Fallback append-only event writer into `student_events/{eventId}` if a direct upsert fails.
 */
async function writeFallbackCloudEvent(ev: QueuedCloudEvent): Promise<boolean> {
  const path = `${STUDENT_EVENTS_COLLECTION}/${ev.eventId}`;
  const safeLessonIds = sanitizeCompletedLessonIds(ev.completedLessonIds);
  try {
    await setDoc(doc(db, STUDENT_EVENTS_COLLECTION, ev.eventId), {
      eventType: ev.eventType,
      studentId: ev.studentId,
      name: ev.name,
      grade: ev.grade,
      className: ev.className,
      lessonsCompleted: ev.lessonsCompleted,
      ...(safeLessonIds.length > 0 ? { completedLessonIds: safeLessonIds } : {}),
      sessionType: ev.sessionType,
      sessionTitle: ev.sessionTitle,
      score: ev.score,
      maxScore: ev.maxScore,
      correctCount: ev.correctCount,
      totalQuestions: ev.totalQuestions,
      weakTopic: ev.weakTopic,
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.CREATE, path);
    } catch {
      // Logged with structured FirestoreErrorInfo
    }
    return false;
  }
}

async function persistCloudEventDirectlyOrFallback(ev: QueuedCloudEvent): Promise<boolean> {
  const directOk = await upsertStudentDirectToCloud(ev);
  if (directOk) return true;
  const fallbackOk = await writeFallbackCloudEvent(ev);
  return fallbackOk;
}

/**
 * Replay any student events that previously failed due to transient network/offline errors.
 * Deduplicated via in-flight lock so reconnect bursts never double-submit events.
 */
export async function flushPendingCloudEvents(): Promise<number> {
  if (flushInFlightPromise) return flushInFlightPromise;

  const run = async (): Promise<number> => {
    const queue = loadQueuedCloudEvents();
    if (queue.length === 0) return 0;

    const remaining: QueuedCloudEvent[] = [];
    let flushed = 0;
    for (const ev of queue) {
      const ok = await persistCloudEventDirectlyOrFallback(ev);
      if (ok) {
        flushed += 1;
      } else {
        remaining.push(ev);
      }
    }
    saveQueuedCloudEvents(remaining);
    return flushed;
  };

  flushInFlightPromise = run().finally(() => {
    flushInFlightPromise = null;
  });
  return flushInFlightPromise;
}

/**
 * Persist a student login directly into Cloud Firestore (`student_analytics/{studentId}`)
 * using atomic `increment(1)` and `arrayUnion(...)`, with offline queue fallback.
 */
export async function recordStudentLoginToCloud(
  profile: UserProfile,
  lessonsCompleted: number,
  completedLessonIds: string[] = []
): Promise<boolean> {
  if (profile.role !== 'student') return false;
  const cleanName = normalizeStudentName(profile.name);
  if (!cleanName) return false;

  const grade = normalizeGrade(profile.grade);
  const className = normalizeClassName(profile.className, grade);
  const studentId = await makeDeterministicStudentId(grade, className, cleanName);
  const safeLessonIds = sanitizeCompletedLessonIds(completedLessonIds);
  const ev: QueuedCloudEvent = {
    eventId: makeEventId(),
    eventType: 'login',
    studentId,
    name: cleanName,
    grade,
    className,
    lessonsCompleted: clampInt(lessonsCompleted, 0, 16),
    completedLessonIds: safeLessonIds,
    sessionType: 'none',
    sessionTitle: 'Đăng nhập học tập',
    score: 0,
    maxScore: 100,
    correctCount: 0,
    totalQuestions: 0,
    weakTopic: 'Chưa có dữ liệu',
  };

  const ok = await persistCloudEventDirectlyOrFallback(ev);
  if (!ok) {
    enqueueCloudEvent(ev);
  }
  return ok;
}

/**
 * Persist a student practice/game/mock-exam session or lesson progress update directly into
 * Cloud Firestore (`student_analytics/{studentId}`) via atomic `increment` + `arrayUnion`.
 */
export async function recordStudentSessionToCloud(
  profile: UserProfile,
  session: SessionRecord | null,
  lessonsCompleted: number,
  weakTopic?: string,
  completedLessonIds: string[] = []
): Promise<boolean> {
  if (profile.role !== 'student') return false;
  const cleanName = normalizeStudentName(profile.name);
  if (!cleanName) return false;

  const grade = normalizeGrade(profile.grade);
  const className = normalizeClassName(profile.className, grade);
  const studentId = await makeDeterministicStudentId(grade, className, cleanName);

  const totalQuestions = session ? clampInt(session.totalQuestions, 0, 200) : 0;
  const correctCount = session ? clampInt(session.correctCount, 0, totalQuestions) : 0;
  const score = session ? clampInt(session.score, 0, 10000) : 0;
  const maxScore = session ? clampInt(session.maxScore, 1, 10000) : 100;
  const sessionType =
    session &&
    (session.type === 'game' ||
      session.type === 'practice' ||
      session.type === 'mock-exam')
      ? session.type
      : 'none';
  const sessionTitle =
    (session?.title ? session.title.trim().slice(0, 120) : '') || 'Hoạt động học tập';
  const safeWeakTopic =
    (weakTopic ? weakTopic.trim().slice(0, 160) : '') || 'Chưa có dữ liệu';
  const safeLessonIds = sanitizeCompletedLessonIds(completedLessonIds);

  const ev: QueuedCloudEvent = {
    eventId: makeEventId(),
    eventType: session ? 'session' : 'session',
    studentId,
    name: cleanName,
    grade,
    className,
    lessonsCompleted: clampInt(lessonsCompleted, 0, 16),
    completedLessonIds: safeLessonIds,
    sessionType,
    sessionTitle,
    score,
    maxScore,
    correctCount,
    totalQuestions,
    weakTopic: safeWeakTopic,
  };

  const ok = await persistCloudEventDirectlyOrFallback(ev);
  if (!ok) {
    enqueueCloudEvent(ev);
  }
  return ok;
}

interface CloudEventPayload {
  docId: string;
  eventType: 'login' | 'session';
  studentId: string;
  name: string;
  grade: Grade;
  className: string;
  lessonsCompleted: number;
  completedLessonIds: string[];
  sessionType: 'none' | 'game' | 'practice' | 'mock-exam';
  sessionTitle: string;
  score: number;
  maxScore: number;
  correctCount: number;
  totalQuestions: number;
  weakTopic: string;
  createdAtIso: string;
}

interface CloudStudentDoc {
  id: string;
  name: string;
  grade: Grade;
  className: string;
  loginCount: number;
  firstLoginAt: string;
  lastActiveAt: string;
  lessonsCompleted: number;
  completedLessonIds: string[];
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
  source: 'live' | 'csv-import';
}

function toCloudStudentDoc(raw: Record<string, unknown>, docId: string): CloudStudentDoc {
  const grade = normalizeGrade(raw.grade);
  const totalQuestions = clampInt(raw.totalQuestions, 0, 1000000);
  const totalCorrect = clampInt(raw.totalCorrect, 0, totalQuestions);
  const computedAvgAccuracy =
    totalQuestions > 0
      ? clampInt(Math.round((totalCorrect / totalQuestions) * 100), 0, 100)
      : clampInt(raw.avgAccuracy, 0, 100);
  const completedLessonIds = sanitizeCompletedLessonIds(raw.completedLessonIds);
  const lessonsCompleted = Math.max(
    clampInt(raw.lessonsCompleted, 0, 16),
    countLessonsForGrade(completedLessonIds, grade)
  );
  const nowIso = new Date().toISOString();
  return {
    id: String(raw.id || docId).slice(0, 64),
    name: normalizeStudentName(String(raw.name || 'Học sinh')) || 'Học sinh',
    grade,
    className: normalizeClassName(String(raw.className || ''), grade),
    loginCount: clampInt(raw.loginCount, 0, 100000),
    firstLoginAt: String(raw.firstLoginAt || nowIso).slice(0, 40),
    lastActiveAt: String(raw.lastActiveAt || nowIso).slice(0, 40),
    lessonsCompleted,
    completedLessonIds,
    totalLessons: clampInt(raw.totalLessons || 16, 1, 32),
    sessionsCount: clampInt(raw.sessionsCount, 0, 100000),
    gamesPlayed: clampInt(raw.gamesPlayed, 0, 100000),
    practiceCount: clampInt(raw.practiceCount, 0, 100000),
    mockExamCount: clampInt(raw.mockExamCount, 0, 100000),
    totalCorrect,
    totalQuestions,
    avgAccuracy: computedAvgAccuracy,
    totalPoints: clampInt(raw.totalPoints, 0, 10000000),
    weakTopic:
      String(raw.weakTopic || 'Chưa có dữ liệu').trim().slice(0, 160) ||
      'Chưa có dữ liệu',
    source: raw.source === 'csv-import' ? 'csv-import' : 'live',
  };
}

/**
 * Parse a Vietnamese EduMind exported CSV file into SeededStudentAnalytics rows.
 */
export async function parseStudentsFromCsvText(
  csvText: string
): Promise<SeededStudentAnalytics[]> {
  const clean = csvText.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const parseCsvLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQ = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ',') {
          out.push(cur);
          cur = '';
        } else cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  const parseVnDateTime = (str: string): string => {
    const m = String(str || '')
      .trim()
      .match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) {
      const parsed = Date.parse(str);
      return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
    }
    const [, hh, mm, dd, mo, yyyy] = m;
    const d = new Date(
      Date.UTC(Number(yyyy), Number(mo) - 1, Number(dd), Number(hh) - 7, Number(mm), 0)
    );
    return d.toISOString();
  };

  const map = new Map<string, SeededStudentAnalytics>();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 11) continue;
    const name = normalizeStudentName(cols[0] || '');
    if (!name) continue;
    const gradeMatch = String(cols[1] || '').match(/[6789]/);
    const grade = normalizeGrade(gradeMatch ? gradeMatch[0] : 8);
    const className = normalizeClassName(cols[2], grade);
    const loginCount = clampInt(cols[3] || 1, 1, 100000);
    const lessonParts = String(cols[4] || '0/16').split('/');
    const lessonsCompleted = clampInt(lessonParts[0], 0, 16);
    const totalLessons = clampInt(lessonParts[1] || 16, 1, 32);
    const sessionsCount = clampInt(cols[5], 0, 100000);
    const practiceCount = clampInt(cols[6], 0, 100000);
    const gamesPlayed = clampInt(cols[7], 0, 100000);
    const mockExamCount = clampInt(cols[8], 0, 100000);
    const avgAccuracy = clampInt(cols[9], 0, 100);
    const totalPoints = clampInt(cols[10], 0, 10000000);
    const weakTopic =
      String(cols[11] || 'Chưa có dữ liệu').trim().slice(0, 160) || 'Chưa có dữ liệu';
    const lastActiveAt = parseVnDateTime(cols[13] || '');
    const id = await makeDeterministicStudentId(grade, className, name);
    const totalQuestions = sessionsCount > 0 ? sessionsCount * 10 : 0;
    const totalCorrect =
      totalQuestions > 0 ? Math.round((totalQuestions * avgAccuracy) / 100) : 0;

    map.set(id, {
      id,
      name,
      grade,
      className,
      loginCount,
      firstLoginAt: lastActiveAt,
      lastActiveAt,
      lessonsCompleted,
      totalLessons,
      sessionsCount,
      gamesPlayed,
      practiceCount,
      mockExamCount,
      totalCorrect,
      totalQuestions,
      avgAccuracy,
      totalPoints,
      weakTopic,
    });
  }
  return Array.from(map.values());
}

/**
 * Batch-upsert student analytics records (e.g., imported CSV students) into Cloud Firestore
 * using non-destructive merging (`merge: true` / `Math.max`) so existing student records and
 * higher live counters are NEVER lost or overwritten.
 */
export async function upsertStudentsToCloud(
  records: SeededStudentAnalytics[] = IMPORTED_STUDENTS_SEED
): Promise<{ created: number; updated: number; skipped: number }> {
  const q = query(
    collection(db, STUDENT_ANALYTICS_COLLECTION),
    where('grade', 'in', GRADES)
  );

  const existingMap = new Map<string, CloudStudentDoc>();
  try {
    const snap = await getDocsForceServer(q);
    for (const d of snap.docs) {
      existingMap.set(d.id, toCloudStudentDoc(d.data() as Record<string, unknown>, d.id));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, STUDENT_ANALYTICS_COLLECTION);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  const CHUNK_SIZE = 400;
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    let opsInBatch = 0;

    for (const r of chunk) {
      const ref = doc(db, STUDENT_ANALYTICS_COLLECTION, r.id);
      const ex = existingMap.get(r.id);

      if (!ex) {
        const totalQuestions = clampInt(r.totalQuestions, 0, 1000000);
        const totalCorrect = clampInt(r.totalCorrect, 0, totalQuestions);
        batch.set(
          ref,
          {
            id: r.id,
            name: normalizeStudentName(r.name) || 'Học sinh',
            grade: normalizeGrade(r.grade),
            className: normalizeClassName(r.className, normalizeGrade(r.grade)),
            loginCount: clampInt(r.loginCount, 0, 100000),
            firstLoginAt: String(r.firstLoginAt).slice(0, 40),
            lastActiveAt: String(r.lastActiveAt).slice(0, 40),
            lessonsCompleted: clampInt(r.lessonsCompleted, 0, 16),
            totalLessons: clampInt(r.totalLessons || 16, 1, 32),
            sessionsCount: clampInt(r.sessionsCount, 0, 100000),
            gamesPlayed: clampInt(r.gamesPlayed, 0, 100000),
            practiceCount: clampInt(r.practiceCount, 0, 100000),
            mockExamCount: clampInt(r.mockExamCount, 0, 100000),
            totalCorrect,
            totalQuestions,
            avgAccuracy: clampInt(r.avgAccuracy, 0, 100),
            totalPoints: clampInt(r.totalPoints, 0, 10000000),
            weakTopic: String(r.weakTopic || 'Chưa có dữ liệu').slice(0, 160),
            source: 'csv-import',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        created++;
        opsInBatch++;
      } else {
        // Non-destructive merge: only update if incoming record has strictly richer metrics
        const needsUpdate =
          r.sessionsCount > ex.sessionsCount ||
          r.totalPoints > ex.totalPoints ||
          r.loginCount > ex.loginCount ||
          r.lessonsCompleted > ex.lessonsCompleted;
        if (!needsUpdate) {
          skipped++;
          continue;
        }
        const mergedSessions = Math.max(ex.sessionsCount, clampInt(r.sessionsCount, 0, 100000));
        const mergedTotalQ = Math.max(ex.totalQuestions, clampInt(r.totalQuestions, 0, 1000000));
        const mergedTotalC = clampInt(
          Math.max(ex.totalCorrect, clampInt(r.totalCorrect, 0, mergedTotalQ)),
          0,
          mergedTotalQ
        );
        const mergedAcc =
          mergedTotalQ > 0
            ? Math.round((mergedTotalC / mergedTotalQ) * 100)
            : Math.max(ex.avgAccuracy, clampInt(r.avgAccuracy, 0, 100));

        batch.update(ref, {
          name: normalizeStudentName(r.name) || ex.name,
          grade: normalizeGrade(r.grade),
          className: normalizeClassName(r.className, normalizeGrade(r.grade)),
          loginCount: Math.max(ex.loginCount, clampInt(r.loginCount, 0, 100000)),
          firstLoginAt:
            ex.firstLoginAt <= r.firstLoginAt
              ? ex.firstLoginAt
              : String(r.firstLoginAt).slice(0, 40),
          lastActiveAt:
            ex.lastActiveAt >= r.lastActiveAt
              ? ex.lastActiveAt
              : String(r.lastActiveAt).slice(0, 40),
          lessonsCompleted: Math.max(ex.lessonsCompleted, clampInt(r.lessonsCompleted, 0, 16)),
          totalLessons: Math.max(ex.totalLessons, clampInt(r.totalLessons || 16, 1, 32)),
          sessionsCount: mergedSessions,
          gamesPlayed: Math.max(ex.gamesPlayed, clampInt(r.gamesPlayed, 0, 100000)),
          practiceCount: Math.max(ex.practiceCount, clampInt(r.practiceCount, 0, 100000)),
          mockExamCount: Math.max(ex.mockExamCount, clampInt(r.mockExamCount, 0, 100000)),
          totalCorrect: mergedTotalC,
          totalQuestions: mergedTotalQ,
          avgAccuracy: clampInt(mergedAcc, 0, 100),
          totalPoints: Math.max(ex.totalPoints, clampInt(r.totalPoints, 0, 10000000)),
          weakTopic:
            ex.weakTopic && ex.weakTopic !== 'Chưa có dữ liệu'
              ? ex.weakTopic
              : String(r.weakTopic || 'Chưa có dữ liệu').slice(0, 160),
          source: ex.source === 'live' ? 'live' : 'csv-import',
          updatedAt: serverTimestamp(),
        });
        updated++;
        opsInBatch++;
      }
    }

    if (opsInBatch > 0) {
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, STUDENT_ANALYTICS_COLLECTION);
      }
    }
  }

  return { created, updated, skipped };
}

/**
 * Fold any pending fallback `student_events` into canonical `student_analytics` documents
 * using targeted per-student Firestore transactions (O(K) reads for K touched students
 * instead of scanning the entire collection) and atomically delete processed events.
 */
export async function foldPendingEventsIntoCloud(): Promise<number> {
  if (foldInFlightPromise) return foldInFlightPromise;

  const run = async (): Promise<number> => {
    const eventsQuery = query(
      collection(db, STUDENT_EVENTS_COLLECTION),
      where('grade', 'in', GRADES)
    );

    let eventDocs: CloudEventPayload[] = [];
    try {
      const snap = await getDocsForceServer(eventsQuery);
      eventDocs = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const grade = normalizeGrade(data.grade);
        const ts = data.createdAt as { toDate?: () => Date } | undefined;
        const createdAtIso =
          ts && typeof ts.toDate === 'function'
            ? ts.toDate().toISOString()
            : new Date().toISOString();
        const totalQ = clampInt(data.totalQuestions, 0, 200);
        return {
          docId: d.id,
          eventType: data.eventType === 'session' ? 'session' : 'login',
          studentId: String(data.studentId || '').slice(0, 64),
          name: normalizeStudentName(String(data.name || 'Học sinh')) || 'Học sinh',
          grade,
          className: normalizeClassName(String(data.className || ''), grade),
          lessonsCompleted: clampInt(data.lessonsCompleted, 0, 16),
          completedLessonIds: sanitizeCompletedLessonIds(data.completedLessonIds),
          sessionType:
            data.sessionType === 'game' ||
            data.sessionType === 'practice' ||
            data.sessionType === 'mock-exam'
              ? data.sessionType
              : 'none',
          sessionTitle: String(data.sessionTitle || 'Hoạt động học tập').slice(0, 120),
          score: clampInt(data.score, 0, 10000),
          maxScore: clampInt(data.maxScore || 100, 1, 10000),
          correctCount: clampInt(data.correctCount, 0, totalQ),
          totalQuestions: totalQ,
          weakTopic: String(data.weakTopic || 'Chưa có dữ liệu').slice(0, 160),
          createdAtIso,
        };
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, STUDENT_EVENTS_COLLECTION);
    }

    if (eventDocs.length === 0) return 0;

    // Group events by studentId so each touched student needs ONLY 1 targeted transaction read
    const eventsByStudent = new Map<string, CloudEventPayload[]>();
    for (const ev of eventDocs) {
      if (!ev.studentId) continue;
      const list = eventsByStudent.get(ev.studentId) ?? [];
      list.push(ev);
      eventsByStudent.set(ev.studentId, list);
    }

    let totalProcessed = 0;

    for (const [studentId, studentEvents] of eventsByStudent.entries()) {
      const studentRef = doc(db, STUDENT_ANALYTICS_COLLECTION, studentId);
      try {
        await runTransaction(db, async (tx) => {
          const existingSnap = await tx.get(studentRef);
          const firstEv = studentEvents[0];
          const base: CloudStudentDoc = existingSnap.exists()
            ? toCloudStudentDoc(existingSnap.data() as Record<string, unknown>, studentId)
            : {
                id: studentId,
                name: firstEv.name,
                grade: firstEv.grade,
                className: firstEv.className,
                loginCount: 0,
                firstLoginAt: firstEv.createdAtIso,
                lastActiveAt: firstEv.createdAtIso,
                lessonsCompleted: 0,
                completedLessonIds: [],
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
                source: 'live',
              };

          const lessonIdSet = new Set<string>(base.completedLessonIds);

          for (const ev of studentEvents) {
            base.lastActiveAt =
              ev.createdAtIso > base.lastActiveAt ? ev.createdAtIso : base.lastActiveAt;
            for (const lid of ev.completedLessonIds) {
              if (lessonIdSet.size < 64) lessonIdSet.add(lid);
            }
            base.lessonsCompleted = Math.max(
              base.lessonsCompleted,
              ev.lessonsCompleted,
              countLessonsForGrade(Array.from(lessonIdSet), base.grade)
            );
            if (ev.weakTopic && ev.weakTopic !== 'Chưa có dữ liệu') {
              base.weakTopic = ev.weakTopic;
            }

            if (ev.eventType === 'login') {
              base.loginCount = clampInt(base.loginCount + 1, 1, 100000);
            } else {
              if (base.loginCount === 0) base.loginCount = 1;
              if (ev.sessionType !== 'none') {
                base.sessionsCount = clampInt(base.sessionsCount + 1, 0, 100000);
                if (ev.sessionType === 'game')
                  base.gamesPlayed = clampInt(base.gamesPlayed + 1, 0, 100000);
                else if (ev.sessionType === 'mock-exam')
                  base.mockExamCount = clampInt(base.mockExamCount + 1, 0, 100000);
                else base.practiceCount = clampInt(base.practiceCount + 1, 0, 100000);

                base.totalQuestions = clampInt(
                  base.totalQuestions + ev.totalQuestions,
                  0,
                  1000000
                );
                base.totalCorrect = clampInt(
                  base.totalCorrect + ev.correctCount,
                  0,
                  base.totalQuestions
                );
                base.avgAccuracy =
                  base.totalQuestions > 0
                    ? clampInt(
                        Math.round((base.totalCorrect / base.totalQuestions) * 100),
                        0,
                        100
                      )
                    : base.avgAccuracy;
                base.totalPoints = clampInt(base.totalPoints + ev.score, 0, 10000000);
              }
            }
            base.source = 'live';
          }

          const mergedLessonIds = Array.from(lessonIdSet);

          if (!existingSnap.exists()) {
            tx.set(studentRef, {
              id: base.id,
              name: base.name,
              grade: base.grade,
              className: base.className,
              loginCount: base.loginCount,
              firstLoginAt: base.firstLoginAt,
              lastActiveAt: base.lastActiveAt,
              lessonsCompleted: base.lessonsCompleted,
              ...(mergedLessonIds.length > 0
                ? { completedLessonIds: mergedLessonIds }
                : {}),
              totalLessons: base.totalLessons,
              sessionsCount: base.sessionsCount,
              gamesPlayed: base.gamesPlayed,
              practiceCount: base.practiceCount,
              mockExamCount: base.mockExamCount,
              totalCorrect: base.totalCorrect,
              totalQuestions: base.totalQuestions,
              avgAccuracy: base.avgAccuracy,
              totalPoints: base.totalPoints,
              weakTopic: base.weakTopic,
              source: base.source,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            tx.update(studentRef, {
              name: base.name,
              grade: base.grade,
              className: base.className,
              loginCount: base.loginCount,
              firstLoginAt: base.firstLoginAt,
              lastActiveAt: base.lastActiveAt,
              lessonsCompleted: base.lessonsCompleted,
              ...(mergedLessonIds.length > 0
                ? { completedLessonIds: mergedLessonIds }
                : {}),
              totalLessons: base.totalLessons,
              sessionsCount: base.sessionsCount,
              gamesPlayed: base.gamesPlayed,
              practiceCount: base.practiceCount,
              mockExamCount: base.mockExamCount,
              totalCorrect: base.totalCorrect,
              totalQuestions: base.totalQuestions,
              avgAccuracy: base.avgAccuracy,
              totalPoints: base.totalPoints,
              weakTopic: base.weakTopic,
              source: base.source,
              updatedAt: serverTimestamp(),
            });
          }

          // Atomically delete processed events in the same transaction
          for (const ev of studentEvents) {
            tx.delete(doc(db, STUDENT_EVENTS_COLLECTION, ev.docId));
          }
        });
        totalProcessed += studentEvents.length;
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.WRITE,
          `${STUDENT_ANALYTICS_COLLECTION}/${studentId}`
        );
      }
    }

    return totalProcessed;
  };

  foldInFlightPromise = run().finally(() => {
    foldInFlightPromise = null;
  });
  return foldInFlightPromise;
}

export function buildOverviewFromRecords(
  docs: CloudStudentDoc[]
): AnalyticsOverviewResponse {
  const students: StudentAnalyticsRecord[] = docs
    .map((d) => ({
      id: d.id,
      name: d.name,
      grade: d.grade,
      className: d.className,
      loginCount: d.loginCount,
      firstLoginAt: d.firstLoginAt,
      lastActiveAt: d.lastActiveAt,
      lessonsCompleted: d.lessonsCompleted,
      totalLessons: d.totalLessons,
      sessionsCount: d.sessionsCount,
      gamesPlayed: d.gamesPlayed,
      practiceCount: d.practiceCount,
      mockExamCount: d.mockExamCount,
      totalCorrect: d.totalCorrect,
      totalQuestions: d.totalQuestions,
      avgAccuracy: d.avgAccuracy,
      totalPoints: d.totalPoints,
      weakTopic: d.weakTopic,
      recentSessions: [],
    }))
    .sort(
      (a, b) =>
        new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );

  const byGrade: GradeAnalyticsSummary[] = GRADES.map((g) => {
    const list = docs.filter((s) => s.grade === g);
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

  const classMap = new Map<string, CloudStudentDoc[]>();
  for (const s of docs) {
    const ck = `${s.grade}::${s.className}`;
    const arr = classMap.get(ck) ?? [];
    arr.push(s);
    classMap.set(ck, arr);
  }

  const byClass: ClassAnalyticsSummary[] = Array.from(classMap.values())
    .map((list) => {
      const first = list[0];
      const totalSessions = list.reduce((sum, s) => sum + s.sessionsCount, 0);
      const gamesPlayed = list.reduce((sum, s) => sum + s.gamesPlayed, 0);
      const practiceCount = list.reduce((sum, s) => sum + s.practiceCount, 0);
      const totCor = list.reduce((sum, s) => sum + s.totalCorrect, 0);
      const totQ = list.reduce((sum, s) => sum + s.totalQuestions, 0);
      const avgAccuracy = totQ > 0 ? Math.round((totCor / totQ) * 100) : 0;
      const avgPoints =
        list.length > 0
          ? Math.round(list.reduce((sum, s) => sum + s.totalPoints, 0) / list.length)
          : 0;

      return {
        grade: first.grade,
        className: first.className,
        studentCount: list.length,
        totalSessions,
        gamesPlayed,
        practiceCount,
        avgAccuracy,
        avgPoints,
      };
    })
    .sort((a, b) => a.grade - b.grade || a.className.localeCompare(b.className, 'vi'));

  const totalSessions = docs.reduce((sum, s) => sum + s.sessionsCount, 0);
  const allCorrect = docs.reduce((sum, s) => sum + s.totalCorrect, 0);
  const allQ = docs.reduce((sum, s) => sum + s.totalQuestions, 0);
  const overallAccuracy = allQ > 0 ? Math.round((allCorrect / allQ) * 100) : 0;

  return {
    totalStudents: docs.length,
    totalClasses: byClass.length,
    totalSessions,
    overallAccuracy,
    byGrade,
    byClass,
    students,
  };
}

/**
 * Subscribe in real time to `student_analytics` AND debounced fallback `student_events`.
 * Optimized sync frequency: batches incoming fallback events with a 2.5s debounce window
 * and uses targeted per-student transactions instead of full collection scans.
 * Must ONLY be called when Firebase staff auth is ready and verified!
 */
export function subscribeCloudAnalytics(
  onUpdate: (overview: AnalyticsOverviewResponse) => void,
  onError: (message: string) => void
): Unsubscribe {
  const analyticsQ = query(
    collection(db, STUDENT_ANALYTICS_COLLECTION),
    where('grade', 'in', GRADES)
  );
  const eventsQ = query(
    collection(db, STUDENT_EVENTS_COLLECTION),
    where('grade', 'in', GRADES)
  );

  let foldTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const scheduleDebouncedFold = () => {
    if (disposed || foldTimer !== null) return;
    foldTimer = setTimeout(() => {
      foldTimer = null;
      if (disposed) return;
      void foldPendingEventsIntoCloud().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Missing or insufficient permissions')) {
          onError(
            'Không đủ quyền tổng hợp lượt học sinh mới lên Firestore. Hãy đăng nhập bằng email quản trị (khanhbp0805@gmail.com).'
          );
        }
      });
    }, EVENT_FOLD_DEBOUNCE_MS);
  };

  const unsubAnalytics = onSnapshot(
    analyticsQ,
    (snapshot) => {
      const docs = snapshot.docs.map((d) =>
        toCloudStudentDoc(d.data() as Record<string, unknown>, d.id)
      );
      onUpdate(buildOverviewFromRecords(docs));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, STUDENT_ANALYTICS_COLLECTION);
      } catch (wrapped) {
        const msg = wrapped instanceof Error ? wrapped.message : String(error);
        if (msg.includes('Missing or insufficient permissions')) {
          onError(
            'Tài khoản Google này chưa được cấp quyền Quản trị/Giáo viên trên Firestore. Vui lòng đăng nhập bằng email quản trị (khanhbp0805@gmail.com).'
          );
        } else if (msg.includes('Quota exceeded')) {
          onError(
            'Đã vượt hạn mức đọc/ghi miễn phí trong ngày của Firestore. Hạn mức sẽ tự khôi phục vào ngày mai.'
          );
        } else {
          onError('Không thể kết nối luồng dữ liệu đám mây lúc này.');
        }
      }
    }
  );

  const unsubEvents = onSnapshot(
    eventsQ,
    (snapshot) => {
      if (!snapshot.empty) {
        scheduleDebouncedFold();
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, STUDENT_EVENTS_COLLECTION);
      } catch {
        // Primary error already surfaced by unsubAnalytics
      }
    }
  );

  return () => {
    disposed = true;
    if (foldTimer !== null) {
      clearTimeout(foldTimer);
      foldTimer = null;
    }
    unsubAnalytics();
    unsubEvents();
  };
}

/**
 * Force-fetch canonical student analytics directly from Firebase Firestore server
 * (bypassing client SDK cache), after flushing queued offline events and folding
 * any pending fallback events.
 */
export async function fetchFreshCloudAnalyticsFromServer(): Promise<{
  overview: AnalyticsOverviewResponse;
  foldedEvents: number;
}> {
  await flushPendingCloudEvents();
  const foldedEvents = await foldPendingEventsIntoCloud();
  const analyticsQ = query(
    collection(db, STUDENT_ANALYTICS_COLLECTION),
    where('grade', 'in', GRADES)
  );
  try {
    const snap = await getDocsForceServer(analyticsQ);
    const docs = snap.docs.map((d) =>
      toCloudStudentDoc(d.data() as Record<string, unknown>, d.id)
    );
    return {
      overview: buildOverviewFromRecords(docs),
      foldedEvents,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, STUDENT_ANALYTICS_COLLECTION);
  }
}
