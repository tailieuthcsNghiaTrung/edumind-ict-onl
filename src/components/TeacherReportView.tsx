import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import {
  AlertCircle,
  ArrowUpDown,
  BarChart3,
  CheckCircle2,
  Cloud,
  Database,
  Download,
  KeyRound,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserCog,
  Users,
  Wand2,
} from 'lucide-react';
import {
  IMPORTED_STUDENTS_SEED,
  type SeededStudentAnalytics,
} from '../../data/importedStudentsSeed';
import { getMergedQuestionBank, getTopicsByGrade } from '../../data/questionBank';
import {
  auth,
  FIREBASE_COLLECTIONS,
  signInStaffWithGoogle,
  signOutFirebaseStaff,
} from '../firebase';
import {
  AnalyticsAuthError,
  clearAnalyticsCache,
  fetchAnalyticsSummary,
  importStudentAnalyticsToServer,
  type ClearCacheOptions,
} from '../hooks/useEduMindStore';
import {
  fetchFreshCloudAnalyticsFromServer,
  flushPendingCloudEvents,
  foldPendingEventsIntoCloud,
  parseStudentsFromCsvText,
  subscribeCloudAnalytics,
  upsertStudentsToCloud,
} from '../services/firestoreAnalytics';
import {
  AnalyticsOverviewResponse,
  Difficulty,
  Grade,
  Question,
  QuestionType,
  UserProfile,
} from '../types';

interface TeacherReportViewProps {
  user: UserProfile;
  authToken: string | null;
  customQuestions: Question[];
  studentSyncVersion?: number;
  onInvalidateStudentCache?: (reason?: string, options?: ClearCacheOptions) => void;
  onAddQuestion: (q: Omit<Question, 'id'>) => void;
  onDeleteQuestion: (id: string) => void;
  onOpenAiGenerator: (grade: Grade) => void;
  onAuthTokenUpdate: (nextToken: string, updatedDisplayName?: string) => void;
  onRequireStaffLogin: () => void;
}

const GRADES: Grade[] = [6, 7, 8, 9];
const LETTERS = ['A', 'B', 'C', 'D'] as const;
const TF_LABELS = ['Đ', 'S'] as const;
const CLOUD_FOCUS_REFRESH_MIN_MS = 60000;
const LOCAL_FOCUS_REFRESH_MIN_MS = 30000;
const MIRROR_THROTTLE_MS = 60000;

type SortField = 'totalPoints' | 'avgAccuracy' | 'sessionsCount' | 'lessonsCompleted' | 'loginCount';
type TeacherTab = 'analytics' | 'question-bank' | 'accounts';

interface AccountMetadata {
  role: 'admin' | 'teacher';
  username: string;
  displayName: string;
  managedByEnv: boolean;
  updatedAt: string | null;
}

interface AuthMeResponse {
  role: 'admin' | 'teacher';
  username: string;
  displayName: string;
  accounts: {
    admin?: AccountMetadata | null;
    teacher?: AccountMetadata | null;
  };
}

function getPerformanceLabel(
  accuracy: number,
  sessionsCount: number
): { label: string; color: string } {
  if (sessionsCount === 0) return { label: 'Mới đăng nhập', color: '#647899' };
  if (accuracy >= 80) return { label: 'Thành thạo', color: '#159B72' };
  if (accuracy >= 65) return { label: 'Khá tốt', color: '#2864E8' };
  return { label: 'Cần củng cố', color: '#D95B67' };
}

function getDifficultyText(d: Difficulty): string {
  if (d === 'hard') return 'Vận dụng';
  if (d === 'medium') return 'Thông hiểu';
  return 'Nhận biết';
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function TeacherReportView({
  user,
  authToken,
  customQuestions,
  studentSyncVersion = 0,
  onInvalidateStudentCache,
  onAddQuestion,
  onDeleteQuestion,
  onOpenAiGenerator,
  onAuthTokenUpdate,
  onRequireStaffLogin,
}: TeacherReportViewProps) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);
  const isAuthorizedStaff =
    (user.role === 'teacher' || user.role === 'admin') &&
    (Boolean(authToken) || Boolean(firebaseUser));

  const [activeTab, setActiveTab] = useState<TeacherTab>('analytics');

  // ==================== ANALYTICS & CLOUD FIRESTORE STATE ====================
  const [analytics, setAnalytics] = useState<AnalyticsOverviewResponse | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<Grade | 'all'>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('totalPoints');

  const [cloudActive, setCloudActive] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMessage, setCloudMessage] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);
  const autoSeededCloudRef = useRef(false);
  const cloudActiveRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const lastAutoRefreshRef = useRef(0);
  const lastMirroredAtRef = useRef(0);
  const lastMirroredSignatureRef = useRef<string>('');
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);

  // ==================== QUESTION BANK STATE ====================
  const [bankGradeFilter, setBankGradeFilter] = useState<Grade>(8);
  const [bankLessonFilter, setBankLessonFilter] = useState<string>('all');
  const [bankSearch, setBankSearch] = useState('');
  const [bankVisibleLimit, setBankVisibleLimit] = useState(40);
  const [showAddForm, setShowAddForm] = useState(false);

  const [newGrade, setNewGrade] = useState<Grade>(8);
  const [newTopic, setNewTopic] = useState<string>('Bài 1: Lược sử công cụ tính toán');
  const [newDifficulty, setNewDifficulty] = useState<Difficulty>('medium');
  const [newQuestionType, setNewQuestionType] = useState<QuestionType>('mcq');
  const [newPrompt, setNewPrompt] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [newCorrectIndex, setNewCorrectIndex] = useState<number>(0);
  const [newExplanation, setNewExplanation] = useState('');
  const [addSuccessMsg, setAddSuccessMsg] = useState<string | null>(null);
  const [addFormError, setAddFormError] = useState<string | null>(null);

  // ==================== ACCOUNTS MANAGEMENT STATE ====================
  const [meInfo, setMeInfo] = useState<AuthMeResponse | null>(null);
  const [accountsLoading, setAccountsLoading] = useState(false);

  // Teacher credential form
  const [teacherCurPass, setTeacherCurPass] = useState('');
  const [teacherNewUser, setTeacherNewUser] = useState('');
  const [teacherNewDisplay, setTeacherNewDisplay] = useState('');
  const [teacherNewPass, setTeacherNewPass] = useState('');
  const [teacherConfirmPass, setTeacherConfirmPass] = useState('');
  const [teacherSaving, setTeacherSaving] = useState(false);
  const [teacherMsg, setTeacherMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Admin credential form
  const [adminCurPass, setAdminCurPass] = useState('');
  const [adminNewUser, setAdminNewUser] = useState('');
  const [adminNewDisplay, setAdminNewDisplay] = useState('');
  const [adminNewPass, setAdminNewPass] = useState('');
  const [adminConfirmPass, setAdminConfirmPass] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminMsg, setAdminMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const toSeededStudents = useCallback(
    (overview: AnalyticsOverviewResponse): SeededStudentAnalytics[] =>
      overview.students.map((s) => ({
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
      })),
    []
  );

  const mirrorCloudToLocalServer = useCallback(
    async (overview: AnalyticsOverviewResponse, force = false) => {
      if (!authToken || !overview.students || overview.students.length === 0) return;
      const now = Date.now();
      const latestActive = overview.students[0]?.lastActiveAt ?? '';
      const signature = `${overview.totalStudents}:${overview.totalSessions}:${overview.overallAccuracy}:${latestActive}`;
      if (signature === lastMirroredSignatureRef.current) return;
      if (!force && now - lastMirroredAtRef.current < MIRROR_THROTTLE_MS) return;
      lastMirroredAtRef.current = now;
      const ok = await importStudentAnalyticsToServer(
        authToken,
        toSeededStudents(overview),
        { broadcast: false }
      );
      if (ok) {
        lastMirroredSignatureRef.current = signature;
      }
    },
    [authToken, toSeededStudents]
  );

  const loadAnalytics = useCallback(
    async (forceRefresh = true) => {
      if (!authToken) return;
      setAnalyticsLoading(true);
      setAnalyticsError(null);
      try {
        const data = await fetchAnalyticsSummary(authToken, { forceRefresh });
        // Never let stale local server state overwrite live Firebase Cloud Firestore data
        if (!cloudActiveRef.current) {
          setAnalytics(data);
        }
      } catch (err) {
        if (err instanceof AnalyticsAuthError) {
          setAnalyticsError(err.message);
        } else if (!cloudActiveRef.current) {
          setAnalyticsError(
            err instanceof Error
              ? err.message
              : 'Lỗi kết nối khi tải bảng thống kê học sinh.'
          );
        }
      } finally {
        setAnalyticsLoading(false);
      }
    },
    [authToken]
  );

  const loadAccountInfo = useCallback(async () => {
    if (!authToken) return;
    setAccountsLoading(true);
    try {
      const res = await fetch(`/api/auth/me?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Cache-Control': 'no-cache',
        },
      });
      if (res.ok) {
        const data = (await res.json()) as AuthMeResponse;
        setMeInfo(data);
        if (data.accounts.teacher) {
          setTeacherNewUser((prev) => prev || data.accounts.teacher?.username || '');
          setTeacherNewDisplay((prev) => prev || data.accounts.teacher?.displayName || '');
        }
        if (data.accounts.admin) {
          setAdminNewUser((prev) => prev || data.accounts.admin?.username || '');
          setAdminNewDisplay((prev) => prev || data.accounts.admin?.displayName || '');
        }
      }
    } catch {
      // Handled gracefully
    } finally {
      setAccountsLoading(false);
    }
  }, [authToken]);

  const mergeLocalServerIntoCloud = useCallback(async () => {
    if (!authToken) return { created: 0, updated: 0, skipped: 0 };
    try {
      const localData = await fetchAnalyticsSummary(authToken, { forceRefresh: true });
      if (!localData.students || localData.students.length === 0) {
        return { created: 0, updated: 0, skipped: 0 };
      }
      return await upsertStudentsToCloud(toSeededStudents(localData));
    } catch {
      return { created: 0, updated: 0, skipped: 0 };
    }
  }, [authToken, toSeededStudents]);

  const forceRefreshAnalytics = useCallback(
    async (showMessage = false) => {
      if (!isAuthorizedStaff || refreshInFlightRef.current) return;
      refreshInFlightRef.current = true;
      lastAutoRefreshRef.current = Date.now();
      clearAnalyticsCache('force-refresh', { broadcast: false, notifyLocal: false });

      try {
        if (firebaseUser) {
          setCloudBusy(true);
          if (showMessage) setCloudMessage(null);
          await flushPendingCloudEvents();
          const fresh = await fetchFreshCloudAnalyticsFromServer();
          cloudActiveRef.current = true;
          setCloudActive(true);
          setAnalytics(fresh.overview);
          setAnalyticsError(null);
          void mirrorCloudToLocalServer(fresh.overview, showMessage);
          if (showMessage) {
            setCloudMessage({
              type: 'ok',
              text:
                fresh.foldedEvents > 0
                  ? `Đã làm mới trực tiếp từ Firebase Firestore (${fresh.overview.totalStudents} HS · ${fresh.overview.totalSessions} lượt làm bài) và tổng hợp ${fresh.foldedEvents} lượt bổ sung.`
                  : `Đã xóa bộ nhớ đệm và đọc trực tiếp từ Firebase Firestore (${FIREBASE_COLLECTIONS.STUDENT_ANALYTICS}): ${fresh.overview.totalStudents} HS · ${fresh.overview.totalSessions} lượt làm bài (mới nhất).`,
            });
          }
        } else {
          await loadAnalytics(true);
        }
      } catch {
        if (showMessage) {
          setCloudMessage({
            type: 'err',
            text: 'Không thể làm mới dữ liệu trực tiếp từ Firebase Firestore lúc này. Vui lòng thử lại.',
          });
        }
      } finally {
        setCloudBusy(false);
        refreshInFlightRef.current = false;
      }
    },
    [firebaseUser, isAuthorizedStaff, loadAnalytics, mirrorCloudToLocalServer]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
      setFirebaseAuthReady(true);
      if (!u) {
        cloudActiveRef.current = false;
        setCloudActive(false);
        autoSeededCloudRef.current = false;
      }
    });
    return () => unsub();
  }, []);

  // Load account info once when authorized; only fall back to local Express analytics
  // if Firebase Auth is ready and the teacher has NOT connected Google Cloud yet.
  useEffect(() => {
    if (!isAuthorizedStaff) return;
    if (authToken) {
      void loadAccountInfo();
    }
    if (firebaseAuthReady && !firebaseUser) {
      void loadAnalytics(true);
    }
  }, [isAuthorizedStaff, authToken, firebaseAuthReady, firebaseUser, loadAnalytics, loadAccountInfo]);

  // Auto-refresh local fallback only when Cloud Firestore real-time listener is not active
  // (when Cloud Firestore is active, onSnapshot streams direct writes automatically with zero redundant scans)
  useEffect(() => {
    if (!isAuthorizedStaff || studentSyncVersion === 0) return;
    if (cloudActiveRef.current && firebaseUser) return;
    void forceRefreshAnalytics(false);
  }, [isAuthorizedStaff, firebaseUser, studentSyncVersion, forceRefreshAnalytics]);

  // Optimized focus/visibility/reconnect sync:
  // - When Cloud Firestore onSnapshot is active: throttle >= 60s and only flush/fold fallback queues (0 full scans)
  // - When in local fallback mode: throttle >= 30s
  useEffect(() => {
    if (!isAuthorizedStaff) return;
    const triggerOptimizedSync = () => {
      if (document.hidden) return;
      const now = Date.now();
      if (cloudActiveRef.current && firebaseUser) {
        if (now - lastAutoRefreshRef.current < CLOUD_FOCUS_REFRESH_MIN_MS) return;
        lastAutoRefreshRef.current = now;
        void flushPendingCloudEvents()
          .then(() => foldPendingEventsIntoCloud())
          .catch(() => {
            // Non-blocking background sync
          });
      } else {
        if (now - lastAutoRefreshRef.current < LOCAL_FOCUS_REFRESH_MIN_MS) return;
        void forceRefreshAnalytics(false);
      }
    };
    window.addEventListener('focus', triggerOptimizedSync);
    window.addEventListener('online', triggerOptimizedSync);
    document.addEventListener('visibilitychange', triggerOptimizedSync);
    return () => {
      window.removeEventListener('focus', triggerOptimizedSync);
      window.removeEventListener('online', triggerOptimizedSync);
      document.removeEventListener('visibilitychange', triggerOptimizedSync);
    };
  }, [isAuthorizedStaff, firebaseUser, forceRefreshAnalytics]);

  // Primary live Firebase Firestore subscription (single source of truth across F5 & all devices)
  useEffect(() => {
    if (!isAuthorizedStaff || !firebaseAuthReady || !firebaseUser) return;
    setAnalyticsLoading(true);
    setCloudMessage(null);
    const unsub = subscribeCloudAnalytics(
      (cloudOverview) => {
        cloudActiveRef.current = true;
        setCloudActive(true);
        setAnalytics(cloudOverview);
        setAnalyticsError(null);
        setAnalyticsLoading(false);
        // Throttled background mirror so Express cache stays reasonably warm without heavy polling
        void mirrorCloudToLocalServer(cloudOverview, false);

        // Once per connection, perform ONE lightweight catch-up pass (flush offline queue + fold fallback events + seed only if missing)
        if (!autoSeededCloudRef.current) {
          autoSeededCloudRef.current = true;
          void (async () => {
            try {
              await flushPendingCloudEvents();
              const folded = await foldPendingEventsIntoCloud();
              const seedRes =
                cloudOverview.totalStudents < IMPORTED_STUDENTS_SEED.length
                  ? await upsertStudentsToCloud(IMPORTED_STUDENTS_SEED)
                  : { created: 0, updated: 0, skipped: 0 };

              if (seedRes.created > 0 || seedRes.updated > 0 || folded > 0) {
                onInvalidateStudentCache?.('cloud-initial-sync', {
                  broadcast: true,
                  notifyLocal: false,
                });
                setCloudMessage({
                  type: 'ok',
                  text: `Đã tự động đồng bộ Firebase Firestore: thêm mới ${seedRes.created} HS, cập nhật ${seedRes.updated} HS${folded > 0 ? `, tổng hợp ${folded} lượt bổ sung` : ''}.`,
                });
              }
            } catch {
              setCloudMessage({
                type: 'err',
                text: `Không thể tự động đồng bộ lên đám mây. Hãy bấm nút "Đồng bộ ${IMPORTED_STUDENTS_SEED.length} HS & Lượt mới".`,
              });
            }
          })();
        }
      },
      (errMsg) => {
        cloudActiveRef.current = false;
        setCloudActive(false);
        setAnalyticsLoading(false);
        setCloudMessage({ type: 'err', text: errMsg });
      }
    );

    return () => {
      unsub();
    };
  }, [
    isAuthorizedStaff,
    firebaseAuthReady,
    firebaseUser,
    mirrorCloudToLocalServer,
    onInvalidateStudentCache,
  ]);

  const handleConnectGoogleCloud = async () => {
    setCloudBusy(true);
    setCloudMessage(null);
    try {
      await signInStaffWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('popup-closed-by-user')) {
        setCloudMessage({
          type: 'err',
          text: 'Không thể đăng nhập Google để kết nối đám mây. Vui lòng thử lại.',
        });
      }
    } finally {
      setCloudBusy(false);
    }
  };

  const handleDisconnectGoogleCloud = async () => {
    setCloudBusy(true);
    try {
      await signOutFirebaseStaff();
      cloudActiveRef.current = false;
      setCloudActive(false);
      clearAnalyticsCache('disconnect-cloud', { broadcast: false, notifyLocal: false });
      setCloudMessage({
        type: 'ok',
        text: 'Đã ngắt kết nối phiên Google đám mây. Hệ thống đang hiển thị dữ liệu máy chủ cục bộ.',
      });
      void loadAnalytics(true);
    } finally {
      setCloudBusy(false);
    }
  };

  const handleSyncSeedToCloud = async () => {
    if (!firebaseUser) {
      setCloudMessage({
        type: 'err',
        text: 'Vui lòng bấm "Kết nối Google Đám mây" trước khi đồng bộ lên Firebase Firestore.',
      });
      return;
    }
    setCloudBusy(true);
    setCloudMessage(null);
    try {
      clearAnalyticsCache('cloud-manual-sync', { broadcast: false, notifyLocal: false });
      await flushPendingCloudEvents();
      const folded = await foldPendingEventsIntoCloud();
      const seedRes = await upsertStudentsToCloud(IMPORTED_STUDENTS_SEED);
      const localRes = await mergeLocalServerIntoCloud();
      const fresh = await fetchFreshCloudAnalyticsFromServer();
      setAnalytics(fresh.overview);
      await mirrorCloudToLocalServer(fresh.overview);
      onInvalidateStudentCache?.('cloud-manual-sync', {
        broadcast: true,
        notifyLocal: false,
      });
      const created = seedRes.created + localRes.created;
      const updated = seedRes.updated + localRes.updated;
      const totalFolded = folded + fresh.foldedEvents;
      setCloudMessage({
        type: 'ok',
        text: `Đồng bộ thành công lên Firebase Firestore (${fresh.overview.totalStudents} HS): thêm mới ${created} HS, cập nhật ${updated} HS${totalFolded > 0 ? `, tổng hợp thêm ${totalFolded} lượt mới từ học sinh` : ''}.`,
      });
    } catch {
      setCloudMessage({
        type: 'err',
        text: 'Lỗi khi đồng bộ lên Firebase Firestore. Hãy kiểm tra tài khoản Google quản trị (khanhbp0805@gmail.com).',
      });
    } finally {
      setCloudBusy(false);
    }
  };

  const handleCsvFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCloudBusy(true);
    setCloudMessage(null);
    try {
      const text = await file.text();
      const parsed = await parseStudentsFromCsvText(text);
      if (parsed.length === 0) {
        setCloudMessage({
          type: 'err',
          text: 'Tệp CSV không chứa dữ liệu học sinh hợp lệ.',
        });
        return;
      }

      // 1. Always merge into Express backend with anti-cache & clear local cache
      if (authToken) {
        await importStudentAnalyticsToServer(authToken, parsed, {
          broadcast: !firebaseUser,
        });
      }

      // 2. If connected to Cloud Firestore, upsert into Firestore and force-fetch fresh server state
      if (firebaseUser) {
        const res = await upsertStudentsToCloud(parsed);
        const fresh = await fetchFreshCloudAnalyticsFromServer();
        setAnalytics(fresh.overview);
        await mirrorCloudToLocalServer(fresh.overview);
        onInvalidateStudentCache?.('csv-import', {
          broadcast: true,
          notifyLocal: false,
        });
        setCloudMessage({
          type: 'ok',
          text: `Đã nhập ${parsed.length} học sinh từ tệp "${file.name}" vào Firebase Firestore (tổng ${fresh.overview.totalStudents} HS · thêm mới ${res.created}, cập nhật ${res.updated}).`,
        });
      } else {
        await loadAnalytics(true);
        onInvalidateStudentCache?.('csv-import', {
          broadcast: true,
          notifyLocal: false,
        });
        setCloudMessage({
          type: 'ok',
          text: `Đã nhập ${parsed.length} học sinh từ tệp "${file.name}" vào hệ thống. Hãy kết nối Google Đám mây để lưu vĩnh viễn trên Firebase Firestore.`,
        });
      }
    } catch {
      setCloudMessage({
        type: 'err',
        text: 'Không thể đọc hoặc nhập tệp CSV. Vui lòng kiểm tra đúng định dạng xuất từ EduMind ICT.',
      });
    } finally {
      setCloudBusy(false);
    }
  };

  // ==================== QUESTION BANK MEMOS ====================
  const allBankQuestions = useMemo(
    () => getMergedQuestionBank(customQuestions),
    [customQuestions]
  );

  const bankTopicsForFilter = useMemo(
    () => getTopicsByGrade(bankGradeFilter, customQuestions),
    [bankGradeFilter, customQuestions]
  );

  const filteredBankQuestions = useMemo(() => {
    const q = bankSearch.trim().toLowerCase();
    return allBankQuestions
      .filter((item) => item.grade === bankGradeFilter)
      .filter((item) =>
        bankLessonFilter === 'all' ? true : item.topic === bankLessonFilter
      )
      .filter((item) =>
        q
          ? item.prompt.toLowerCase().includes(q) ||
            item.topic.toLowerCase().includes(q)
          : true
      );
  }, [allBankQuestions, bankGradeFilter, bankLessonFilter, bankSearch]);

  const topicsForNewGrade = useMemo(
    () => getTopicsByGrade(newGrade, customQuestions),
    [customQuestions, newGrade]
  );

  // Keep selected lesson topic valid whenever grade or question list changes
  useEffect(() => {
    if (topicsForNewGrade.length > 0 && !topicsForNewGrade.includes(newTopic)) {
      setNewTopic(topicsForNewGrade[0]);
    }
  }, [newTopic, topicsForNewGrade]);

  // ==================== ANALYTICS FILTERED MEMOS ====================
  const lessonStatsSummary = useMemo(() => {
    const students = analytics?.students ?? [];
    let totalLessonsCompleted = 0;
    let studentsWithLessons = 0;
    const byGradeMap: Record<number, { total: number; studentsWithLessons: number; count: number }> = {
      6: { total: 0, studentsWithLessons: 0, count: 0 },
      7: { total: 0, studentsWithLessons: 0, count: 0 },
      8: { total: 0, studentsWithLessons: 0, count: 0 },
      9: { total: 0, studentsWithLessons: 0, count: 0 },
    };
    const byClassMap: Record<string, { total: number; studentsWithLessons: number; count: number }> = {};

    for (const st of students) {
      const done = Math.max(0, Number(st.lessonsCompleted) || 0);
      totalLessonsCompleted += done;
      if (done > 0) studentsWithLessons += 1;

      const gBucket = byGradeMap[st.grade];
      if (gBucket) {
        gBucket.total += done;
        gBucket.count += 1;
        if (done > 0) gBucket.studentsWithLessons += 1;
      }

      const clsKey = `${st.grade}::${st.className}`;
      if (!byClassMap[clsKey]) {
        byClassMap[clsKey] = { total: 0, studentsWithLessons: 0, count: 0 };
      }
      byClassMap[clsKey].total += done;
      byClassMap[clsKey].count += 1;
      if (done > 0) byClassMap[clsKey].studentsWithLessons += 1;
    }

    const avgLessonsPerStudent =
      students.length > 0
        ? Math.round((totalLessonsCompleted / students.length) * 10) / 10
        : 0;

    return {
      totalLessonsCompleted,
      studentsWithLessons,
      avgLessonsPerStudent,
      byGradeMap,
      byClassMap,
    };
  }, [analytics]);

  const filteredClasses = useMemo(() => {
    if (!analytics) return [];
    return analytics.byClass.filter((c) =>
      gradeFilter === 'all' ? true : c.grade === gradeFilter
    );
  }, [analytics, gradeFilter]);

  const filteredStudents = useMemo(() => {
    if (!analytics) return [];
    const q = searchQuery.trim().toLowerCase();
    return analytics.students
      .filter((st) => (gradeFilter === 'all' ? true : st.grade === gradeFilter))
      .filter((st) => (classFilter === 'all' ? true : st.className === classFilter))
      .filter((st) =>
        q
          ? st.name.toLowerCase().includes(q) ||
            st.className.toLowerCase().includes(q) ||
            st.weakTopic.toLowerCase().includes(q)
          : true
      )
      .sort((a, b) => b[sortBy] - a[sortBy]);
  }, [analytics, classFilter, gradeFilter, searchQuery, sortBy]);

  // ==================== LOCKED SCREEN FOR STUDENTS ====================
  if ((user.role === 'teacher' || user.role === 'admin') && !authToken && !firebaseAuthReady) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <div className="bg-white rounded-3xl border border-[#DCE8F8] p-8 text-center space-y-3 shadow-xs">
          <RefreshCw className="w-7 h-7 text-[#2563EB] animate-spin mx-auto" />
          <div className="text-sm font-bold text-[#163A70]">
            Đang kết nối phiên Firebase Firestore...
          </div>
          <p className="text-xs text-[#647899]">
            Hệ thống đang tải trực tiếp dữ liệu thống kê học sinh từ đám mây.
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthorizedStaff) {
    return (
      <div className="max-w-xl mx-auto py-10">
        <div className="bg-white rounded-3xl border border-[#DCE8F8] p-7 sm:p-9 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-[#EEF4FF] text-[#2563EB] flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#163A70]">
            Khu vực dành riêng cho Giáo viên &amp; Quản trị
          </h1>
          <p className="text-sm text-[#526582] leading-relaxed">
            Để xem bảng thống kê số lượng và kết quả học sinh theo từng Khối – Lớp, quản lí ngân hàng 1.280 câu hỏi và tạo lại tên đăng nhập/mật khẩu, vui lòng đăng nhập bằng tài khoản{' '}
            <strong className="text-[#163A70]">Giáo viên</strong> hoặc{' '}
            <strong className="text-[#163A70]">Quản trị viên</strong>.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onRequireStaffLogin}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#0EA5E9] hover:from-[#1D4ED8] hover:to-[#0284C7] text-white text-sm font-bold shadow-xs transition-all"
            >
              <ShieldCheck className="w-4 h-4" />
              Đăng xuất &amp; đăng nhập Giáo viên / Quản trị
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== CSV EXPORT ====================
  const handleExportCsv = () => {
    const headers = [
      'Họ và tên',
      'Khối',
      'Lớp',
      'Số lần đăng nhập',
      'Bài học hoàn thành',
      'Tổng lượt làm bài',
      'Lượt luyện tập',
      'Lượt trò chơi',
      'Lượt thi thử',
      'Độ chính xác (%)',
      'Tổng điểm',
      'Chủ đề cần củng cố',
      'Mức đánh giá',
      'Hoạt động gần nhất',
    ];
    const rows = filteredStudents.map((s) => [
      s.name,
      `Khối ${s.grade}`,
      s.className,
      String(s.loginCount),
      `${s.lessonsCompleted}/${s.totalLessons}`,
      String(s.sessionsCount),
      String(s.practiceCount),
      String(s.gamesPlayed),
      String(s.mockExamCount),
      String(s.avgAccuracy),
      String(s.totalPoints),
      s.weakTopic,
      getPerformanceLabel(s.avgAccuracy, s.sessionsCount).label,
      formatDateTime(s.lastActiveAt),
    ]);
    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((row) => row.map((v) => `"${v.replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const suffix =
      classFilter !== 'all'
        ? `Lop_${classFilter}`
        : gradeFilter !== 'all'
          ? `Khoi_${gradeFilter}`
          : 'ToanTruong';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ThongKe_TinHoc_${suffix}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ==================== ADD QUESTION HANDLER ====================
  const handleCreateQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    setAddFormError(null);

    if (!newPrompt.trim()) {
      setAddFormError('Vui lòng nhập nội dung câu hỏi trước khi lưu.');
      return;
    }
    if (
      newQuestionType === 'mcq' &&
      (!optA.trim() || !optB.trim() || !optC.trim() || !optD.trim())
    ) {
      setAddFormError(
        'Vui lòng nhập đầy đủ nội dung cho cả 4 phương án trả lời A, B, C và D.'
      );
      return;
    }

    const options =
      newQuestionType === 'true-false'
        ? (['Đúng', 'Sai'] as [string, string])
        : ([optA.trim(), optB.trim(), optC.trim(), optD.trim()] as [
            string,
            string,
            string,
            string,
          ]);
    const safeCorrect =
      newQuestionType === 'true-false'
        ? Math.min(1, Math.max(0, newCorrectIndex))
        : Math.min(3, Math.max(0, newCorrectIndex));

    onAddQuestion({
      grade: newGrade,
      topic: newTopic.trim() || topicsForNewGrade[0] || 'Bài 1',
      difficulty: newDifficulty,
      questionType: newQuestionType,
      prompt: newPrompt.trim(),
      options,
      correctIndex: safeCorrect,
      explanation:
        newExplanation.trim() ||
        `Đáp án chính xác là ${
          newQuestionType === 'true-false' ? options[safeCorrect] : LETTERS[safeCorrect]
        }.`,
    });

    setBankGradeFilter(newGrade);
    setBankLessonFilter('all');
    setNewPrompt('');
    setOptA('');
    setOptB('');
    setOptC('');
    setOptD('');
    setNewExplanation('');
    setNewCorrectIndex(0);
    setAddFormError(null);
    setShowAddForm(false);
    setAddSuccessMsg(
      `Đã thêm câu hỏi mới vào Ngân hàng Tin học ${newGrade}. Câu hỏi tự động đồng bộ trên mọi thiết bị cho Luyện tập và toàn bộ Trò chơi kiến thức.`
    );
  };

  // ==================== RECREATE / RESET CREDENTIALS HANDLER ====================
  const handleUpdateCredentials = async (
    targetRole: 'teacher' | 'admin',
    e: React.FormEvent
  ) => {
    e.preventDefault();
    if (!authToken) return;

    const isTargetTeacher = targetRole === 'teacher';
    const curPass = isTargetTeacher ? teacherCurPass : adminCurPass;
    const nextUser = (isTargetTeacher ? teacherNewUser : adminNewUser).trim();
    const nextDisplay = (isTargetTeacher ? teacherNewDisplay : adminNewDisplay).trim();
    const nextPass = isTargetTeacher ? teacherNewPass : adminNewPass;
    const confirmPass = isTargetTeacher ? teacherConfirmPass : adminConfirmPass;
    const setMsg = isTargetTeacher ? setTeacherMsg : setAdminMsg;
    const setSaving = isTargetTeacher ? setTeacherSaving : setAdminSaving;

    setMsg(null);
    if (nextPass !== confirmPass) {
      setMsg({ type: 'err', text: 'Mật khẩu xác nhận không trùng khớp.' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          targetRole,
          currentPassword: curPass,
          newUsername: nextUser,
          newDisplayName: nextDisplay,
          newPassword: nextPass,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        token?: string;
        updated?: { username: string; displayName: string };
        error?: string;
      };
      if (!res.ok) {
        setMsg({
          type: 'err',
          text: data.error ?? 'Không thể cập nhật tài khoản. Vui lòng thử lại.',
        });
        return;
      }

      if (data.token) {
        onAuthTokenUpdate(data.token, data.updated?.displayName);
      }

      if (isTargetTeacher) {
        setTeacherCurPass('');
        setTeacherNewPass('');
        setTeacherConfirmPass('');
      } else {
        setAdminCurPass('');
        setAdminNewPass('');
        setAdminConfirmPass('');
      }

      await loadAccountInfo();
      setMsg({
        type: 'ok',
        text: `Đã tạo lại tên đăng nhập (${data.updated?.username ?? nextUser}) và mật khẩu mới cho tài khoản ${
          targetRole === 'admin' ? 'Quản trị viên' : 'Giáo viên'
        } thành công!`,
      });
    } catch {
      setMsg({ type: 'err', text: 'Lỗi kết nối máy chủ khi lưu mật khẩu mới.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + 3-Tab Switcher */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-[#2864E8] mb-1">
            {user.role === 'admin'
              ? `Quản trị viên: ${user.name || 'HOÀNG KHÔI VỸ'} · Toàn quyền thống kê & tài khoản`
              : 'Giáo viên Tin học · Thống kê & ngân hàng câu hỏi'}
          </div>
          <h1 className="text-2xl font-bold text-[#102A56]">
            {activeTab === 'analytics'
              ? 'Thống kê học sinh tham gia & kết quả theo Khối – Lớp'
              : activeTab === 'question-bank'
                ? 'Ngân hàng câu hỏi chuẩn SGK & SBT Tin học 6–9'
                : 'Quản lí & tạo lại tên đăng nhập, mật khẩu GV & Admin'}
          </h1>
          <p className="text-sm text-[#71809A] mt-1">
            {activeTab === 'analytics'
              ? 'Ghi nhận tự động tất cả học sinh đã đăng nhập, phân tích theo từng Khối (6, 7, 8, 9) và từng Lớp học.'
              : activeTab === 'question-bank'
                ? `Tổng cộng ${allBankQuestions.length.toLocaleString('vi-VN')} câu hỏi (20 câu/bài × 16 bài/khối + câu bổ sung) dùng chung cho Luyện tập & Trò chơi.`
                : 'Tạo lại tên đăng nhập và mật khẩu mới an toàn cho tài khoản Giáo viên và Quản trị viên.'}
          </p>
        </div>

        <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-white border border-[#DCE5F2] rounded-xl self-start">
          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'analytics'
                ? 'bg-[#102A56] text-white'
                : 'text-[#71809A] hover:text-[#102A56]'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Thống kê Khối &amp; Lớp
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('question-bank')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'question-bank'
                ? 'bg-[#102A56] text-white'
                : 'text-[#71809A] hover:text-[#102A56]'
            }`}
          >
            <Database className="w-4 h-4" />
            Ngân hàng ({allBankQuestions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('accounts')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'accounts'
                ? 'bg-[#102A56] text-white'
                : 'text-[#71809A] hover:text-[#102A56]'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            Tài khoản GV &amp; Admin
          </button>
        </div>
      </div>

      {/* ==================== TAB 1: REAL ANALYTICS BY GRADE & CLASS ==================== */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <input
            ref={csvFileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void handleCsvFileImport(e)}
            className="hidden"
          />

          {cloudMessage && (
            <div
              className={`p-3.5 rounded-2xl border text-xs sm:text-sm flex items-center gap-2.5 ${
                cloudMessage.type === 'ok'
                  ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
                  : 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
              }`}
            >
              {cloudMessage.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{cloudMessage.text}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setGradeFilter('all');
                  setClassFilter('all');
                }}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-colors ${
                  gradeFilter === 'all' && classFilter === 'all'
                    ? 'bg-[#2864E8] text-white border-[#2864E8]'
                    : 'bg-white text-[#526582] border-[#DCE5F2] hover:text-[#102A56]'
                }`}
              >
                Toàn trường (Khối 6–9)
              </button>
              {GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    setGradeFilter(g);
                    setClassFilter('all');
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-colors ${
                    gradeFilter === g
                      ? 'bg-[#2864E8] text-white border-[#2864E8]'
                      : 'bg-white text-[#526582] border-[#DCE5F2] hover:text-[#102A56]'
                  }`}
                >
                  Khối {g}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!firebaseUser ? (
                <button
                  type="button"
                  onClick={() => void handleConnectGoogleCloud()}
                  disabled={cloudBusy}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2864E8] hover:bg-[#1E52C7] disabled:opacity-50 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  <Cloud className="w-4 h-4" />
                  {cloudBusy ? 'Đang kết nối...' : 'Đăng nhập Google'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void handleSyncSeedToCloud()}
                    disabled={cloudBusy}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#159B72] hover:bg-[#117D5C] disabled:opacity-50 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
                  >
                    <RefreshCw className={`w-4 h-4 ${cloudBusy ? 'animate-spin' : ''}`} />
                    Đồng bộ {IMPORTED_STUDENTS_SEED.length} HS
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDisconnectGoogleCloud()}
                    disabled={cloudBusy}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#DCE5F2] hover:bg-[#F4F7FC] text-[#526582] text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
                  >
                    <LogOut className="w-4 h-4" />
                    Ngắt Google
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => csvFileInputRef.current?.click()}
                disabled={cloudBusy}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#DCE5F2] hover:bg-[#F4F7FC] text-[#102A56] text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
              >
                <Upload className="w-4 h-4" />
                Nhập file CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  void forceRefreshAnalytics(true);
                }}
                disabled={analyticsLoading || cloudBusy}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#DCE5F2] hover:bg-[#F4F7FC] text-[#102A56] text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
              >
                <RefreshCw
                  className={`w-4 h-4 ${analyticsLoading || cloudBusy ? 'animate-spin' : ''}`}
                />
                Làm mới số liệu
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={filteredStudents.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#102A56] hover:bg-[#193B75] disabled:opacity-40 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                Xuất báo cáo CSV
              </button>
            </div>
          </div>

          {analyticsError && (
            <div className="p-4 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#991B1B] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{analyticsError}</span>
              </div>
              <button
                type="button"
                onClick={onRequireStaffLogin}
                className="px-3 py-1.5 rounded-lg bg-[#991B1B] text-white text-xs font-semibold shrink-0"
              >
                Đăng nhập lại
              </button>
            </div>
          )}

          {/* 5 School-wide KPI Cards (including Completed Lessons Statistics) */}
          <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-2xl border border-[#E4EBF5] p-5">
              <div className="text-xs font-medium text-[#71809A]">
                Tổng học sinh đã đăng nhập
              </div>
              <div className="text-2xl font-bold text-[#102A56] tabular-nums mt-1.5">
                {analytics?.totalStudents ?? 0} HS
              </div>
              <div className="text-xs text-[#71809A] mt-1">
                Ghi nhận thực tế từ hệ thống
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#E4EBF5] p-5">
              <div className="text-xs font-medium text-[#71809A]">
                Số lớp học tham gia
              </div>
              <div className="text-2xl font-bold text-[#2864E8] tabular-nums mt-1.5">
                {analytics?.totalClasses ?? 0} lớp
              </div>
              <div className="text-xs text-[#71809A] mt-1">
                Trên 4 khối Tin học 6, 7, 8, 9
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#E4EBF5] p-5">
              <div className="text-xs font-medium text-[#71809A]">
                Tổng bài đã học
              </div>
              <div className="text-2xl font-bold text-[#059669] tabular-nums mt-1.5">
                {lessonStatsSummary.totalLessonsCompleted} bài
              </div>
              <div className="text-xs text-[#71809A] mt-1 tabular-nums">
                TB {lessonStatsSummary.avgLessonsPerStudent} bài/HS ·{' '}
                {lessonStatsSummary.studentsWithLessons} HS đã học bài
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#E4EBF5] p-5">
              <div className="text-xs font-medium text-[#71809A]">
                Tổng lượt luyện tập &amp; trò chơi
              </div>
              <div className="text-2xl font-bold text-[#7C3AED] tabular-nums mt-1.5">
                {analytics?.totalSessions ?? 0} lượt
              </div>
              <div className="text-xs text-[#71809A] mt-1">
                Luyện tập bài học, thi thử &amp; game
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#E4EBF5] p-5 col-span-2 lg:col-span-1">
              <div className="text-xs font-medium text-[#71809A]">
                Độ chính xác trung bình
              </div>
              <div className="text-2xl font-bold text-[#159B72] tabular-nums mt-1.5">
                {analytics?.overallAccuracy ?? 0}%
              </div>
              <div className="text-xs text-[#71809A] mt-1">
                Trên tổng số câu học sinh đã trả lời
              </div>
            </div>
          </section>

          {/* Breakdown by Grade (Khối 6, 7, 8, 9) */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-[#102A56]">
              Thống kê theo Khối lớp (nhấn vào từng Khối để lọc nhanh)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {(analytics?.byGrade ?? GRADES.map((g) => ({
                grade: g,
                studentCount: 0,
                classCount: 0,
                totalSessions: 0,
                avgAccuracy: 0,
                avgPoints: 0,
              }))).map((gItem) => {
                const isSelected = gradeFilter === gItem.grade;
                const gLessons = lessonStatsSummary.byGradeMap[gItem.grade] ?? {
                  total: 0,
                  studentsWithLessons: 0,
                  count: 0,
                };
                return (
                  <button
                    key={gItem.grade}
                    type="button"
                    onClick={() => {
                      setGradeFilter(isSelected ? 'all' : gItem.grade);
                      setClassFilter('all');
                    }}
                    className={`text-left rounded-2xl border p-4.5 transition-all ${
                      isSelected
                        ? 'bg-[#EEF5FF] border-[#2864E8] ring-2 ring-[#2864E8]/15'
                        : 'bg-white border-[#E4EBF5] hover:border-[#2864E8]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-extrabold text-[#102A56]">
                        Khối {gItem.grade}
                      </span>
                      <span className="text-xs font-bold text-[#2864E8] bg-white px-2 py-0.5 rounded-md border border-[#DCE8F8] tabular-nums">
                        {gItem.studentCount} HS · {gItem.classCount} lớp
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-[#EDF2F9] text-xs">
                      <div>
                        <div className="text-[#71809A]">Bài học</div>
                        <div className="font-bold text-[#059669] tabular-nums mt-0.5">
                          {gLessons.total}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#71809A]">Lượt làm</div>
                        <div className="font-bold text-[#102A56] tabular-nums mt-0.5">
                          {gItem.totalSessions}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#71809A]">Chính xác</div>
                        <div className="font-bold text-[#159B72] tabular-nums mt-0.5">
                          {gItem.avgAccuracy}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[#71809A]">Điểm TB</div>
                        <div className="font-bold text-[#2864E8] tabular-nums mt-0.5">
                          {gItem.avgPoints}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Breakdown by Class */}
          <section className="bg-white rounded-2xl border border-[#E4EBF5] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#EDF2F9] flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-[#102A56]">
                Thống kê theo từng Lớp học{' '}
                {gradeFilter !== 'all' ? `(Khối ${gradeFilter})` : '(Tất cả các Khối)'}
              </h2>
              {classFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setClassFilter('all')}
                  className="text-xs font-semibold text-[#2864E8] hover:underline"
                >
                  Bỏ lọc lớp {classFilter}
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#EDF2F9] bg-[#FAFBFD] text-xs font-semibold text-[#71809A]">
                    <th className="py-3 px-6">Lớp học</th>
                    <th className="py-3 px-4 text-right">Khối</th>
                    <th className="py-3 px-4 text-right">Học sinh</th>
                    <th className="py-3 px-4 text-right">Bài đã học</th>
                    <th className="py-3 px-4 text-right">Luyện tập</th>
                    <th className="py-3 px-4 text-right">Trò chơi</th>
                    <th className="py-3 px-4 text-right">Tổng lượt</th>
                    <th className="py-3 px-4 text-right">Chính xác TB</th>
                    <th className="py-3 px-6 text-right">Điểm TB</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDF2F9] text-sm">
                  {filteredClasses.length > 0 ? (
                    filteredClasses.map((cls) => {
                      const active = classFilter === cls.className;
                      const clsLessonStat =
                        lessonStatsSummary.byClassMap[`${cls.grade}::${cls.className}`];
                      const totalClassLessons = clsLessonStat?.total ?? 0;
                      const avgClassLessons =
                        clsLessonStat && clsLessonStat.count > 0
                          ? Math.round((clsLessonStat.total / clsLessonStat.count) * 10) / 10
                          : 0;
                      return (
                        <tr
                          key={`${cls.grade}-${cls.className}`}
                          onClick={() =>
                            setClassFilter(active ? 'all' : cls.className)
                          }
                          className={`cursor-pointer transition-colors ${
                            active ? 'bg-[#EEF5FF]' : 'hover:bg-[#FAFBFD]'
                          }`}
                        >
                          <td className="py-3.5 px-6 font-bold text-[#102A56]">
                            Lớp {cls.className}
                            {active && (
                              <span className="ml-2 text-xs font-semibold text-[#2864E8]">
                                (Đang lọc)
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right tabular-nums text-[#52627E]">
                            Khối {cls.grade}
                          </td>
                          <td className="py-3.5 px-4 text-right tabular-nums font-semibold text-[#102A56]">
                            {cls.studentCount} HS
                          </td>
                          <td className="py-3.5 px-4 text-right tabular-nums whitespace-nowrap">
                            <span className="font-bold text-[#059669]">
                              {totalClassLessons} bài
                            </span>
                            <span className="text-[11px] text-[#71809A] ml-1">
                              (TB {avgClassLessons})
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right tabular-nums text-[#52627E]">
                            {cls.practiceCount}
                          </td>
                          <td className="py-3.5 px-4 text-right tabular-nums text-[#52627E]">
                            {cls.gamesPlayed}
                          </td>
                          <td className="py-3.5 px-4 text-right tabular-nums font-semibold text-[#102A56]">
                            {cls.totalSessions}
                          </td>
                          <td className="py-3.5 px-4 text-right tabular-nums font-bold text-[#159B72]">
                            {cls.avgAccuracy}%
                          </td>
                          <td className="py-3.5 px-6 text-right tabular-nums font-bold text-[#2864E8]">
                            {cls.avgPoints} đ
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-sm text-[#71809A]">
                        Chưa có lớp học nào có học sinh đăng nhập ở khối này. Khi học sinh đăng nhập, lớp sẽ tự động xuất hiện tại đây.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Individual Students Table */}
          <section className="bg-white rounded-2xl border border-[#E4EBF5] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#EDF2F9] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-base font-bold text-[#102A56] flex items-center gap-2">
                <Users className="w-4 h-4 text-[#2864E8]" />
                Danh sách chi tiết học sinh đã đăng nhập ({filteredStudents.length} HS)
              </h2>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 text-[#71809A] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm tên HS, lớp hoặc bài yếu..."
                    className="pl-9 pr-3.5 py-2 rounded-xl border border-[#DCE5F2] text-xs sm:text-sm text-[#17233C] focus:outline-none focus:border-[#2864E8] w-56"
                  />
                </div>

                <div className="inline-flex items-center gap-1.5 text-xs">
                  <ArrowUpDown className="w-3.5 h-3.5 text-[#71809A]" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortField)}
                    className="px-3 py-2 rounded-xl border border-[#DCE5F2] bg-white text-xs sm:text-sm font-medium text-[#17233C] focus:outline-none focus:border-[#2864E8]"
                    aria-label="Sắp xếp danh sách học sinh"
                  >
                    <option value="totalPoints">Xếp theo tổng điểm</option>
                    <option value="lessonsCompleted">Xếp theo số bài đã học</option>
                    <option value="avgAccuracy">Xếp theo độ chính xác</option>
                    <option value="sessionsCount">Xếp theo lượt làm bài</option>
                    <option value="loginCount">Xếp theo số lần đăng nhập</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#EDF2F9] bg-[#FAFBFD] text-xs font-semibold text-[#71809A]">
                    <th className="py-3 px-6">Học sinh</th>
                    <th className="py-3 px-4">Khối / Lớp</th>
                    <th className="py-3 px-4 text-right">Đăng nhập</th>
                    <th className="py-3 px-4 text-right">Bài học</th>
                    <th className="py-3 px-4 text-right">Luyện / Game</th>
                    <th className="py-3 px-4 text-right">Chính xác</th>
                    <th className="py-3 px-4 text-right">Tổng điểm</th>
                    <th className="py-3 px-4">Bài cần củng cố</th>
                    <th className="py-3 px-6 text-right">Đánh giá</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDF2F9] text-sm">
                  {filteredStudents.length > 0 ? (
                    filteredStudents.map((st) => {
                      const status = getPerformanceLabel(st.avgAccuracy, st.sessionsCount);
                      return (
                        <tr key={st.id} className="hover:bg-[#FAFBFD]">
                          <td className="py-3.5 px-6">
                            <div className="font-semibold text-[#17233C]">{st.name}</div>
                            <div className="text-[11px] text-[#71809A]">
                              Gần nhất: {formatDateTime(st.lastActiveAt)}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="font-semibold text-[#102A56]">{st.className}</span>
                            <span className="text-xs text-[#71809A] ml-1.5">
                              (Khối {st.grade})
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right tabular-nums text-[#52627E] whitespace-nowrap">
                            {st.loginCount} lần
                          </td>
                          <td className="py-3.5 px-4 text-right tabular-nums whitespace-nowrap">
                            {st.lessonsCompleted > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0] text-xs font-bold">
                                Đã học {st.lessonsCompleted}/{st.totalLessons}
                              </span>
                            ) : (
                              <span className="text-[#94A3B8]">
                                0/{st.totalLessons}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right tabular-nums text-[#52627E] whitespace-nowrap">
                            {st.practiceCount + st.mockExamCount} / {st.gamesPlayed}
                          </td>
                          <td className="py-3.5 px-4 text-right tabular-nums font-semibold text-[#102A56] whitespace-nowrap">
                            {st.avgAccuracy}%
                          </td>
                          <td className="py-3.5 px-4 text-right tabular-nums font-bold text-[#2864E8] whitespace-nowrap">
                            {st.totalPoints}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-[#52627E] max-w-[200px] truncate">
                            {st.weakTopic}
                          </td>
                          <td className="py-3.5 px-6 text-right whitespace-nowrap">
                            <span
                              className="text-xs font-semibold"
                              style={{ color: status.color }}
                            >
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-sm text-[#71809A]">
                        Chưa có dữ liệu học sinh phù hợp. Khi học sinh đăng nhập và tham gia Luyện tập hoặc Trò chơi, kết quả sẽ hiển thị trực tiếp tại đây.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ==================== TAB 2: SHARED QUESTION BANK ==================== */}
      {activeTab === 'question-bank' && (
        <div className="space-y-5">
          {addSuccessMsg && (
            <div className="p-4 rounded-xl bg-[#ECF9F3] border border-[#BEE5D4] text-sm text-[#0E5D45] flex items-center justify-between gap-3">
              <span>{addSuccessMsg}</span>
              <button
                type="button"
                onClick={() => setAddSuccessMsg(null)}
                className="text-xs font-semibold underline shrink-0"
              >
                Đóng
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 p-1 bg-white border border-[#DCE5F2] rounded-xl">
              {GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    setBankGradeFilter(g);
                    setBankLessonFilter('all');
                    setBankVisibleLimit(40);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                    bankGradeFilter === g
                      ? 'bg-[#2864E8] text-white'
                      : 'text-[#71809A] hover:text-[#102A56]'
                  }`}
                >
                  Tin học {g}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={bankLessonFilter}
                onChange={(e) => {
                  setBankLessonFilter(e.target.value);
                  setBankVisibleLimit(40);
                }}
                className="px-3 py-2 rounded-xl border border-[#DCE5F2] bg-white text-xs sm:text-sm text-[#17233C] max-w-[230px]"
                aria-label="Lọc theo bài học"
              >
                <option value="all">Tất cả 16 bài lớp {bankGradeFilter}</option>
                {bankTopicsForFilter.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              <div className="relative">
                <Search className="w-4 h-4 text-[#71809A] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={bankSearch}
                  onChange={(e) => {
                    setBankSearch(e.target.value);
                    setBankVisibleLimit(40);
                  }}
                  placeholder="Tìm nội dung câu hỏi..."
                  className="pl-9 pr-3.5 py-2 rounded-xl border border-[#DCE5F2] bg-white text-sm text-[#17233C] focus:outline-none focus:border-[#2864E8] w-52"
                />
              </div>
              <button
                type="button"
                onClick={() => onOpenAiGenerator(bankGradeFilter)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#2563EB] hover:from-[#6D28D9] hover:to-[#1D4ED8] text-white text-sm font-bold shadow-xs transition-all whitespace-nowrap shrink-0"
              >
                <Wand2 className="w-4 h-4" />
                Tạo câu hỏi bằng AI
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm((prev) => !prev)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2864E8] hover:bg-[#1E53C9] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                {showAddForm ? 'Đóng biểu mẫu' : 'Thêm câu hỏi mới'}
              </button>
            </div>
          </div>

          {/* Add Question Form */}
          {showAddForm && (
            <form
              onSubmit={handleCreateQuestion}
              noValidate
              className="bg-white rounded-2xl border border-[#DCE5F2] p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-[#102A56]">
                  Bổ sung câu hỏi vào Ngân hàng dùng chung
                </h2>
                <div className="inline-flex items-center gap-1 p-1 bg-[#F4F7FC] rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setNewQuestionType('mcq');
                      setNewCorrectIndex(0);
                      setAddFormError(null);
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold touch-manipulation ${
                      newQuestionType === 'mcq'
                        ? 'bg-white text-[#102A56] shadow-xs'
                        : 'text-[#647899]'
                    }`}
                  >
                    Trắc nghiệm 4 lựa chọn
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewQuestionType('true-false');
                      setNewCorrectIndex(0);
                      setAddFormError(null);
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold touch-manipulation ${
                      newQuestionType === 'true-false'
                        ? 'bg-white text-[#102A56] shadow-xs'
                        : 'text-[#647899]'
                    }`}
                  >
                    Đúng / Sai
                  </button>
                </div>
              </div>

              {addFormError && (
                <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs sm:text-sm font-semibold text-[#991B1B] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{addFormError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#71809A] mb-1.5">
                    Khối lớp
                  </label>
                  <select
                    value={newGrade}
                    onChange={(e) => {
                      const g = Number(e.target.value) as Grade;
                      setNewGrade(g);
                      const firstTopic = getTopicsByGrade(g, customQuestions)[0];
                      if (firstTopic) setNewTopic(firstTopic);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8E2F0] bg-white text-sm text-[#17233C]"
                  >
                    <option value={6}>Tin học 6</option>
                    <option value={7}>Tin học 7</option>
                    <option value={8}>Tin học 8</option>
                    <option value={9}>Tin học 9</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#71809A] mb-1.5">
                    Bài học SGK (chọn đúng tên bài)
                  </label>
                  <select
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8E2F0] bg-white text-sm text-[#17233C]"
                  >
                    {topicsForNewGrade.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#71809A] mb-1.5">
                    Mức độ nhận thức
                  </label>
                  <select
                    value={newDifficulty}
                    onChange={(e) => setNewDifficulty(e.target.value as Difficulty)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8E2F0] bg-white text-sm text-[#17233C]"
                  >
                    <option value="easy">Nhận biết (Dễ)</option>
                    <option value="medium">Thông hiểu (Trung bình)</option>
                    <option value="hard">Vận dụng (Khó)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#71809A] mb-1.5">
                  Nội dung câu hỏi
                </label>
                <textarea
                  rows={2}
                  value={newPrompt}
                  onChange={(e) => {
                    setNewPrompt(e.target.value);
                    if (addFormError) setAddFormError(null);
                  }}
                  placeholder={
                    newQuestionType === 'true-false'
                      ? 'Nhập nhận định Đúng / Sai...'
                      : 'Nhập nội dung câu hỏi trắc nghiệm Tin học...'
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8E2F0] text-sm text-[#17233C] focus:outline-none focus:border-[#2864E8]"
                />
              </div>

              {newQuestionType === 'mcq' ? (
                <div className="space-y-2.5">
                  <div className="text-xs font-semibold text-[#526582]">
                    Nhập 4 phương án trả lời và chạm nút{' '}
                    <strong className="text-[#159B72]">A, B, C hoặc D</strong> bên trái để chọn đáp án đúng:
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { idx: 0, val: optA, set: setOptA },
                      { idx: 1, val: optB, set: setOptB },
                      { idx: 2, val: optC, set: setOptC },
                      { idx: 3, val: optD, set: setOptD },
                    ].map((opt) => {
                      const isCorrectOpt = newCorrectIndex === opt.idx;
                      return (
                        <div key={opt.idx} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setNewCorrectIndex(opt.idx)}
                            title="Chọn làm đáp án đúng"
                            className={`min-w-[44px] min-h-[44px] px-2.5 rounded-xl text-xs font-extrabold shrink-0 border transition-colors touch-manipulation cursor-pointer flex items-center justify-center gap-1 ${
                              isCorrectOpt
                                ? 'bg-[#159B72] text-white border-[#159B72]'
                                : 'bg-[#F4F7FC] text-[#102A56] border-[#DCE5F2] hover:border-[#159B72]'
                            }`}
                          >
                            <span>{LETTERS[opt.idx]}</span>
                            {isCorrectOpt && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </button>
                          <input
                            type="text"
                            value={opt.val}
                            onChange={(e) => {
                              opt.set(e.target.value);
                              if (addFormError) setAddFormError(null);
                            }}
                            placeholder={`Phương án ${LETTERS[opt.idx]}${isCorrectOpt ? ' (Đáp án đúng)' : ''}`}
                            className={`flex-1 min-h-[44px] px-3 py-2 rounded-xl border text-sm text-[#17233C] focus:outline-none focus:border-[#2864E8] ${
                              isCorrectOpt ? 'border-[#159B72] bg-[#F4FDF9]' : 'border-[#D8E2F0]'
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-[#71809A]">
                    Chọn đáp án đúng:
                  </span>
                  {(['Đúng', 'Sai'] as const).map((label, idx) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setNewCorrectIndex(idx)}
                      className={`min-h-[44px] px-5 py-2 rounded-xl text-sm font-bold border transition-colors touch-manipulation cursor-pointer ${
                        newCorrectIndex === idx
                          ? 'bg-[#159B72] text-white border-[#159B72]'
                          : 'bg-white text-[#102A56] border-[#DCE5F2]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#71809A] mb-1.5">
                  Giải thích đáp án đúng
                </label>
                <input
                  type="text"
                  value={newExplanation}
                  onChange={(e) => setNewExplanation(e.target.value)}
                  placeholder="Giải thích ngắn gọn theo SGK/SBT..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8E2F0] text-sm text-[#17233C]"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <span className="text-xs text-[#71809A]">
                  Đáp án đúng đang chọn:{' '}
                  <strong className="text-[#159B72]">
                    {newQuestionType === 'true-false'
                      ? newCorrectIndex === 0
                        ? 'Đúng'
                        : 'Sai'
                      : `Phương án ${LETTERS[newCorrectIndex]}`}
                  </strong>
                </span>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#159B72] hover:bg-[#11825F] text-white text-sm font-semibold transition-colors touch-manipulation cursor-pointer"
                >
                  Lưu vào ngân hàng
                </button>
              </div>
            </form>
          )}

          {/* Question List */}
          <div className="text-xs font-semibold text-[#647899]">
            Hiển thị {Math.min(bankVisibleLimit, filteredBankQuestions.length)} /{' '}
            {filteredBankQuestions.length} câu hỏi lớp {bankGradeFilter}
          </div>

          <div className="bg-white rounded-2xl border border-[#E4EBF5] divide-y divide-[#EDF2F9]">
            {filteredBankQuestions.slice(0, bankVisibleLimit).map((item, idx) => {
              const isCustom = item.id.startsWith('custom-') || item.id.startsWith('ai-');
              const isTf = item.questionType === 'true-false' || item.options.length === 2;
              return (
                <div key={item.id} className="p-5 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs text-[#71809A] flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[#2864E8]">{item.topic}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`px-2 py-0.5 rounded font-semibold ${
                            isTf
                              ? 'bg-[#FEF3C7] text-[#B45309]'
                              : 'bg-[#EEF4FF] text-[#2864E8]'
                          }`}
                        >
                          {isTf ? 'Đúng / Sai' : 'Trắc nghiệm'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{getDifficultyText(item.difficulty)}</span>
                        {isCustom && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-[#159B72]">Câu hỏi mới bổ sung</span>
                          </>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-[#17233C]">
                        Câu {idx + 1}. {item.prompt}
                      </div>
                    </div>

                    {isCustom && (
                      <button
                        type="button"
                        onClick={() => onDeleteQuestion(item.id)}
                        className="p-2 rounded-lg text-[#71809A] hover:text-[#D95B67] hover:bg-[#FFF5F5] shrink-0"
                        title="Xóa câu hỏi tự thêm"
                        aria-label="Xóa câu hỏi"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs pt-1">
                    {item.options.map((opt, oIdx) => (
                      <div
                        key={oIdx}
                        className={`px-3 py-1.5 rounded-lg ${
                          oIdx === item.correctIndex
                            ? 'bg-[#ECF9F3] text-[#0E5D45] font-semibold'
                            : 'bg-[#FAFBFD] text-[#52627E]'
                        }`}
                      >
                        {isTf ? TF_LABELS[oIdx] : LETTERS[oIdx]}. {opt}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredBankQuestions.length > bankVisibleLimit && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setBankVisibleLimit((n) => n + 40)}
                className="px-5 py-2.5 rounded-xl bg-white border border-[#DCE5F2] hover:bg-[#F4F7FC] text-sm font-semibold text-[#102A56]"
              >
                Xem thêm câu hỏi ({filteredBankQuestions.length - bankVisibleLimit} câu còn lại)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 3: TEACHER & ADMIN ACCOUNTS ==================== */}
      {activeTab === 'accounts' && (
        <div className="space-y-5">
          {accountsLoading && !meInfo ? (
            <div className="bg-white rounded-2xl border border-[#E4EBF5] p-8 text-center text-sm text-[#71809A]">
              Đang tải thông tin tài khoản...
            </div>
          ) : (
            <div
              className={`grid grid-cols-1 ${
                user.role === 'admin' ? 'lg:grid-cols-2' : 'max-w-xl'
              } gap-5`}
            >
              {/* Teacher Account Card (Editable by both Admin and Teacher) */}
              <div className="bg-white rounded-2xl border border-[#E4EBF5] p-6 space-y-4">
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#EDF2F9]">
                  <div>
                    <div className="text-xs font-bold text-[#059669] flex items-center gap-1.5">
                      <UserCog className="w-4 h-4" />
                      Tài khoản Giáo viên (Teacher)
                    </div>
                    <h2 className="text-lg font-bold text-[#102A56] mt-0.5">
                      Tạo lại tên đăng nhập &amp; mật khẩu Giáo viên
                    </h2>
                    {meInfo?.accounts.teacher && (
                      <p className="text-xs text-[#647899] mt-1">
                        Tên đăng nhập hiện tại:{' '}
                        <strong className="text-[#102A56]">
                          {meInfo.accounts.teacher.username}
                        </strong>
                        {meInfo.accounts.teacher.updatedAt && (
                          <> · Cập nhật: {formatDateTime(meInfo.accounts.teacher.updatedAt)}</>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                {meInfo?.accounts.teacher?.managedByEnv ? (
                  <div className="p-3.5 rounded-xl bg-[#F0F7FF] border border-[#BFDBFE] text-xs text-[#1E3A8A]">
                    Tài khoản Giáo viên hiện đang được cấu hình qua biến môi trường máy chủ (TEACHER_USERNAME / TEACHER_PASSWORD). Để đổi, vui lòng cập nhật trong phần Secrets của ứng dụng.
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => void handleUpdateCredentials('teacher', e)}
                    className="space-y-3.5"
                  >
                    {teacherMsg && (
                      <div
                        className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                          teacherMsg.type === 'ok'
                            ? 'bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46]'
                            : 'bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B]'
                        }`}
                      >
                        {teacherMsg.type === 'ok' ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        )}
                        <span>{teacherMsg.text}</span>
                      </div>
                    )}

                    {user.role === 'teacher' && (
                      <div>
                        <label className="block text-xs font-semibold text-[#71809A] mb-1">
                          Mật khẩu hiện tại của Giáo viên
                        </label>
                        <input
                          type="password"
                          value={teacherCurPass}
                          onChange={(e) => setTeacherCurPass(e.target.value)}
                          placeholder="Nhập mật khẩu hiện tại để xác minh..."
                          autoComplete="current-password"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8E2F0] text-sm text-[#17233C]"
                          required
                        />
                      </div>
                    )}

                    {user.role === 'admin' && (
                      <div className="p-2.5 rounded-xl bg-[#F4F8FF] text-xs text-[#3B5998]">
                        Với quyền Quản trị viên, bạn có thể tạo lại tên đăng nhập và cấp mật khẩu mới cho Giáo viên mà không cần mật khẩu cũ.
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-[#71809A] mb-1">
                        Tên đăng nhập mới (3–40 kí tự không dấu)
                      </label>
                      <input
                        type="text"
                        value={teacherNewUser}
                        onChange={(e) => setTeacherNewUser(e.target.value)}
                        placeholder="Ví dụ: gv_tinhoc_2025"
                        autoComplete="username"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8E2F0] text-sm text-[#17233C]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#71809A] mb-1">
                        Tên hiển thị Giáo viên
                      </label>
                      <input
                        type="text"
                        value={teacherNewDisplay}
                        onChange={(e) => setTeacherNewDisplay(e.target.value)}
                        placeholder="Ví dụ: Giáo viên Tin học THCS"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8E2F0] text-sm text-[#17233C]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#71809A] mb-1">
                          Mật khẩu mới (≥ 6 kí tự)
                        </label>
                        <input
                          type="password"
                          value={teacherNewPass}
                          onChange={(e) => setTeacherNewPass(e.target.value)}
                          placeholder="Nhập mật khẩu mới"
                          autoComplete="new-password"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8E2F0] text-sm text-[#17233C]"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#71809A] mb-1">
                          Xác nhận mật khẩu mới
                        </label>
                        <input
                          type="password"
                          value={teacherConfirmPass}
                          onChange={(e) => setTeacherConfirmPass(e.target.value)}
                          placeholder="Nhập lại mật khẩu mới"
                          autoComplete="new-password"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8E2F0] text-sm text-[#17233C]"
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={teacherSaving}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#059669] hover:bg-[#047857] disabled:opacity-50 text-white text-sm font-bold transition-colors"
                    >
                      {teacherSaving
                        ? 'Đang cập nhật...'
                        : 'Lưu tên đăng nhập & mật khẩu Giáo viên'}
                    </button>
                  </form>
                )}
              </div>

              {/* Admin Account Card (Visible & Editable ONLY for Admin) */}
              {user.role === 'admin' && (
                <div className="bg-white rounded-2xl border border-[#E4EBF5] p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#EDF2F9]">
                    <div>
                      <div className="text-xs font-bold text-[#2563EB] flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" />
                        Tài khoản Quản trị viên (Admin)
                      </div>
                      <h2 className="text-lg font-bold text-[#102A56] mt-0.5">
                        Tạo lại tên đăng nhập &amp; mật khẩu Quản trị
                      </h2>
                      {meInfo?.accounts.admin && (
                        <p className="text-xs text-[#647899] mt-1">
                          Tên đăng nhập hiện tại:{' '}
                          <strong className="text-[#102A56]">
                            {meInfo.accounts.admin.username}
                          </strong>
                          {meInfo.accounts.admin.updatedAt && (
                            <> · Cập nhật: {formatDateTime(meInfo.accounts.admin.updatedAt)}</>
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  {meInfo?.accounts.admin?.managedByEnv ? (
                    <div className="p-3.5 rounded-xl bg-[#F0F7FF] border border-[#BFDBFE] text-xs text-[#1E3A8A]">
                      Tài khoản Quản trị viên hiện đang được cấu hình qua biến môi trường máy chủ (ADMIN_USERNAME / ADMIN_PASSWORD). Để đổi, vui lòng cập nhật trong phần Secrets của ứng dụng.
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => void handleUpdateCredentials('admin', e)}
                      className="space-y-3.5"
                    >
                      {adminMsg && (
                        <div
                          className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                            adminMsg.type === 'ok'
                              ? 'bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46]'
                              : 'bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B]'
                          }`}
                        >
                          {adminMsg.type === 'ok' ? (
                            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          )}
                          <span>{adminMsg.text}</span>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-[#71809A] mb-1">
                          Mật khẩu Quản trị hiện tại
                        </label>
                        <input
                          type="password"
                          value={adminCurPass}
                          onChange={(e) => setAdminCurPass(e.target.value)}
                          placeholder="Nhập mật khẩu hiện tại để xác minh..."
                          autoComplete="current-password"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8E2F0] text-sm text-[#17233C]"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#71809A] mb-1">
                          Tên đăng nhập Quản trị mới (3–60 kí tự)
                        </label>
                        <input
                          type="text"
                          value={adminNewUser}
                          onChange={(e) => setAdminNewUser(e.target.value)}
                          placeholder="Ví dụ: HOÀNG KHÔI VỸ"
                          autoComplete="username"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8E2F0] text-sm text-[#17233C]"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#71809A] mb-1">
                          Tên hiển thị Quản trị viên
                        </label>
                        <input
                          type="text"
                          value={adminNewDisplay}
                          onChange={(e) => setAdminNewDisplay(e.target.value)}
                          placeholder="Ví dụ: HOÀNG KHÔI VỸ"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8E2F0] text-sm text-[#17233C]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-[#71809A] mb-1">
                            Mật khẩu mới (≥ 6 kí tự)
                          </label>
                          <input
                            type="password"
                            value={adminNewPass}
                            onChange={(e) => setAdminNewPass(e.target.value)}
                            placeholder="Nhập mật khẩu mới"
                            autoComplete="new-password"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8E2F0] text-sm text-[#17233C]"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#71809A] mb-1">
                            Xác nhận mật khẩu mới
                          </label>
                          <input
                            type="password"
                            value={adminConfirmPass}
                            onChange={(e) => setAdminConfirmPass(e.target.value)}
                            placeholder="Nhập lại mật khẩu mới"
                            autoComplete="new-password"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8E2F0] text-sm text-[#17233C]"
                            required
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={adminSaving}
                        className="w-full py-2.5 px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-bold transition-colors"
                      >
                        {adminSaving
                          ? 'Đang cập nhật...'
                          : 'Lưu tên đăng nhập & mật khẩu Quản trị'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
