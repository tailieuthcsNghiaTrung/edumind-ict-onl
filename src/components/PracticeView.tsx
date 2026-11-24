import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  RotateCcw,
  Search,
  Wand2,
  XCircle,
} from 'lucide-react';
import { getChaptersByGrade } from '../../data/curriculum';
import {
  buildMockExamSet,
  getQuestionsByGrade,
  getQuestionsByLesson,
  pickRandomQuestions,
} from '../../data/questionBank';
import { Grade, Question, SessionRecord, TrueFalse4Question } from '../types';

interface PracticeViewProps {
  selectedGrade: Grade;
  onSelectGrade: (grade: Grade) => void;
  completedLessonIds?: string[];
  customQuestions: Question[];
  initialTopic?: string | null;
  onClearInitialTopic?: () => void;
  onOpenAiGenerator: (grade: Grade) => void;
  onCompleteSession: (
    session: Omit<SessionRecord, 'id' | 'completedAt'>,
    topicBreakdown: { grade: Grade; topic: string; isCorrect: boolean }[]
  ) => void;
}

type PracticeMode = 'hub' | 'topic-practice' | 'mock-exam';

const GRADES: Grade[] = [6, 7, 8, 9];
const LETTERS = ['A', 'B', 'C', 'D'] as const;
const STMT_LETTERS = ['a', 'b', 'c', 'd'] as const;
const TF_LABELS = ['Đ', 'S'] as const;
const MOCK_EXAM_SECONDS = 30 * 60;

const EXAM_PRESETS: { label: string; lessons: number[] }[] = [
  { label: 'Bài 1 – 4', lessons: [1, 2, 3, 4] },
  { label: 'Bài 1 – 8', lessons: [1, 2, 3, 4, 5, 6, 7, 8] },
  { label: 'Bài 9 – 16', lessons: [9, 10, 11, 12, 13, 14, 15, 16] },
  {
    label: 'Tất cả (Bài 1 – 16)',
    lessons: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  },
];

function isTrueFalseQuestion(q: Question): boolean {
  return q.questionType === 'true-false' || q.options.length === 2;
}

function getOptionLabel(q: Question, idx: number): string {
  return isTrueFalseQuestion(q)
    ? TF_LABELS[idx] ?? String(idx + 1)
    : LETTERS[idx] ?? String(idx + 1);
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function scoreTf4Question(correctStatements: number): number {
  if (correctStatements >= 4) return 1.0;
  if (correctStatements === 3) return 0.5;
  if (correctStatements === 2) return 0.25;
  if (correctStatements === 1) return 0.1;
  return 0;
}

function formatLessonSelectionLabel(lessonNums: number[]): string {
  const sorted = [...lessonNums].sort((a, b) => a - b);
  if (sorted.length === 0) return 'Chưa chọn bài';
  if (sorted.length === 1) return `Bài ${sorted[0]}`;
  const isContiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  if (isContiguous) {
    return `Bài ${sorted[0]} – Bài ${sorted[sorted.length - 1]}`;
  }
  if (sorted.length <= 5) {
    return `Bài ${sorted.join(', ')}`;
  }
  return `${sorted.length} bài đã chọn (Bài ${sorted[0]} … Bài ${sorted[sorted.length - 1]})`;
}

function sameLessonSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((n) => setA.has(n));
}

export default function PracticeView({
  selectedGrade,
  onSelectGrade,
  completedLessonIds = [],
  customQuestions,
  initialTopic,
  onClearInitialTopic,
  onOpenAiGenerator,
  onCompleteSession,
}: PracticeViewProps) {
  const [mode, setMode] = useState<PracticeMode>('hub');
  const [activeTopic, setActiveTopic] = useState<string>('');

  // Topic practice state (100% isolated per lesson)
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});

  // Mock exam state (12 MCQs + 4 True/False 4-statement questions, 30 min)
  const [selectedExamLessons, setSelectedExamLessons] = useState<number[]>([
    1, 2, 3, 4, 5, 6, 7, 8,
  ]);
  const [mockMcqs, setMockMcqs] = useState<Question[]>([]);
  const [mockTf4s, setMockTf4s] = useState<TrueFalse4Question[]>([]);
  const [tf4Answers, setTf4Answers] = useState<Record<string, (boolean | null)[]>>({});
  const [activeExamRangeLabel, setActiveExamRangeLabel] = useState<string>('Bài 1 – Bài 8');

  const [currentIdx, setCurrentIdx] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(MOCK_EXAM_SECONDS);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lessonSearch, setLessonSearch] = useState('');
  const recordedRef = useRef(false);

  const chapters = useMemo(
    () => getChaptersByGrade(selectedGrade),
    [selectedGrade]
  );

  const allLessonsFlat = useMemo(
    () =>
      chapters
        .flatMap((ch) => ch.lessons)
        .map((lesson, idx) => ({
          ...lesson,
          lessonNum: lesson.lessonNumber ?? idx + 1,
        }))
        .sort((a, b) => a.lessonNum - b.lessonNum),
    [chapters]
  );

  const filteredChapters = useMemo(() => {
    const q = lessonSearch.trim().toLowerCase();
    if (!q) return chapters;
    return chapters
      .map((ch) => ({
        ...ch,
        lessons: ch.lessons.filter(
          (l) =>
            l.title.toLowerCase().includes(q) ||
            ch.title.toLowerCase().includes(q)
        ),
      }))
      .filter((ch) => ch.lessons.length > 0);
  }, [chapters, lessonSearch]);

  const gradeQuestionCount = useMemo(
    () => getQuestionsByGrade(selectedGrade, customQuestions).length,
    [customQuestions, selectedGrade]
  );

  const toggleExamLesson = (lessonNumber: number) => {
    setSelectedExamLessons((prev) => {
      if (prev.includes(lessonNumber)) {
        if (prev.length <= 1) return prev;
        return prev.filter((n) => n !== lessonNumber);
      }
      return [...prev, lessonNumber].sort((a, b) => a - b);
    });
  };

  const startTopicPractice = (lessonTitle: string) => {
    const exactLessonPool = getQuestionsByLesson(
      selectedGrade,
      lessonTitle,
      customQuestions
    );
    const takeCount = Math.max(1, exactLessonPool.length);
    const qSet = pickRandomQuestions(selectedGrade, takeCount, {
      topic: lessonTitle,
      strictTopic: true,
      customQuestions,
    });
    setActiveTopic(lessonTitle);
    setQuestions(qSet);
    setAnswers({});
    setCurrentIdx(0);
    setSubmitted(false);
    setElapsedSeconds(0);
    recordedRef.current = false;
    setMode('topic-practice');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const startMockExam = () => {
    const lessonNums =
      selectedExamLessons.length > 0
        ? selectedExamLessons
        : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    const built = buildMockExamSet(selectedGrade, lessonNums, customQuestions);
    const rangeLabel = formatLessonSelectionLabel(lessonNums);

    setActiveExamRangeLabel(rangeLabel);
    setActiveTopic(`Đề thi thử 30 phút · Lớp ${selectedGrade} (${rangeLabel})`);
    setMockMcqs(built.mcqQuestions);
    setMockTf4s(built.tf4Questions);
    setAnswers({});
    setTf4Answers({});
    setCurrentIdx(0);
    setSubmitted(false);
    setRemainingSeconds(MOCK_EXAM_SECONDS);
    setElapsedSeconds(0);
    recordedRef.current = false;
    setMode('mock-exam');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  // Ensure active questions or results always appear right at the top of the viewport
  useEffect(() => {
    if (mode !== 'hub') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [mode, submitted]);

  // Auto-launch topic practice if navigated from CurriculumView
  useEffect(() => {
    if (initialTopic) {
      startTopicPractice(initialTopic);
      onClearInitialTopic?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTopic]);

  // Timer for mock exam & elapsed tracker
  useEffect(() => {
    if (mode === 'hub' || submitted) return;
    const id = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
      if (mode === 'mock-exam') {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [mode, submitted]);

  const computeMockExamStats = () => {
    const mcqCorrect = mockMcqs.filter((q) => answers[q.id] === q.correctIndex).length;
    const mcqPts = mcqCorrect * 0.5;

    let tf4CorrectStmts = 0;
    let tf4Pts = 0;
    const tf4Details = mockTf4s.map((tf) => {
      const userArr = tf4Answers[tf.id] ?? [null, null, null, null];
      const rightCount = tf.statements.filter(
        (s, idx) => userArr[idx] !== null && userArr[idx] === s.isTrue
      ).length;
      const pts = scoreTf4Question(rightCount);
      tf4CorrectStmts += rightCount;
      tf4Pts += pts;
      return { tf, userArr, rightCount, pts };
    });

    const totalScore10 = Math.min(10, Math.round((mcqPts + tf4Pts) * 100) / 100);
    return {
      mcqCorrect,
      mcqPts,
      tf4CorrectStmts,
      tf4Pts,
      tf4Details,
      totalScore10,
    };
  };

  const handleSubmitAll = () => {
    if (submitted) return;
    setSubmitted(true);
    if (recordedRef.current) return;
    recordedRef.current = true;

    if (mode === 'mock-exam') {
      const stats = computeMockExamStats();
      const totalItems = mockMcqs.length + mockTf4s.length * 4;
      const totalCorrectItems = stats.mcqCorrect + stats.tf4CorrectStmts;

      const breakdown: { grade: Grade; topic: string; isCorrect: boolean }[] = [
        ...mockMcqs.map((q) => ({
          grade: q.grade,
          topic: q.topic,
          isCorrect: answers[q.id] === q.correctIndex,
        })),
        ...stats.tf4Details.flatMap(({ tf, userArr }) =>
          tf.statements.map((stmt, idx) => ({
            grade: tf.grade,
            topic: tf.topic,
            isCorrect: userArr[idx] !== null && userArr[idx] === stmt.isTrue,
          }))
        ),
      ];

      onCompleteSession(
        {
          type: 'mock-exam',
          title: `Đề thi thử Tin học ${selectedGrade} (${activeExamRangeLabel})`,
          grade: selectedGrade,
          score: Math.round(stats.totalScore10 * 10),
          maxScore: 100,
          correctCount: totalCorrectItems,
          totalQuestions: totalItems,
          durationSeconds: Math.max(1, elapsedSeconds),
        },
        breakdown
      );
      return;
    }

    const correctCount = questions.filter(
      (q) => answers[q.id] === q.correctIndex
    ).length;
    const pointsPerQ = 10;
    const score = correctCount * pointsPerQ;

    onCompleteSession(
      {
        type: 'practice',
        title: `Luyện tập: ${activeTopic}`,
        grade: selectedGrade,
        topic: activeTopic,
        score,
        maxScore: questions.length * pointsPerQ,
        correctCount,
        totalQuestions: questions.length,
        durationSeconds: Math.max(1, elapsedSeconds),
      },
      questions.map((q) => ({
        grade: q.grade,
        topic: q.topic,
        isCorrect: answers[q.id] === q.correctIndex,
      }))
    );
  };

  // Auto-submit mock exam on timeout
  useEffect(() => {
    if (mode === 'mock-exam' && remainingSeconds === 0 && !submitted) {
      handleSubmitAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, remainingSeconds, submitted]);

  // ==================== HUB MODE ====================
  if (mode === 'hub') {
    const selectedRangeText = formatLessonSelectionLabel(selectedExamLessons);

    return (
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#102A56]">
              Luyện tập từng bài (Bài 1 – Bài 16) &amp; Đề thi thử
            </h1>
            <p className="text-sm text-[#71809A] mt-1">
              Mỗi bài gồm 20 câu hỏi (15 Trắc nghiệm + 5 Đúng/Sai) theo đúng nội dung bài học — Kho lớp {selectedGrade} hiện có {gradeQuestionCount} câu hỏi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
            <div className="inline-flex items-center gap-1 p-1 bg-white border border-[#DCE5F2] rounded-xl">
              {GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    onSelectGrade(g);
                    setLessonSearch('');
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    selectedGrade === g
                      ? 'bg-[#102A56] text-white'
                      : 'text-[#71809A] hover:text-[#102A56]'
                  }`}
                >
                  Lớp {g}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onOpenAiGenerator(selectedGrade)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#2563EB] hover:from-[#6D28D9] hover:to-[#1D4ED8] text-white text-sm font-bold shadow-xs transition-all whitespace-nowrap shrink-0"
            >
              <Wand2 className="w-4 h-4" />
              <span>Tạo thêm câu hỏi bằng AI</span>
            </button>
          </div>
        </div>

        {/* Mock Exam Featured Card: 30 min · 16 questions (12 MCQ + 4 TF4) + Lesson Picker */}
        <section className="bg-gradient-to-r from-[#E0F2FE] via-[#EEF6FF] to-[#ECFDF5] border border-[#BAE6FD] rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#0284C7]">
                <span>Đề thi thử 30 phút · Tin học {selectedGrade}</span>
                <span className="text-[#94A3B8]">•</span>
                <span className="text-[#0F766E]">
                  16 câu (12 Trắc nghiệm + 4 Đúng/Sai 4 ý)
                </span>
              </div>
              <h2 className="text-xl font-extrabold text-[#163A70]">
                Đề thi thử 30 phút – Chọn phạm vi bài học lớp {selectedGrade}
              </h2>
              <p className="text-sm text-[#4B6384] leading-relaxed">
                Chọn các bài muốn ôn thi (ví dụ Bài 1 – 4 hoặc Bài 1 – 8). Hệ thống tự tạo đề gồm 12 câu trắc nghiệm (6,0 điểm) và 4 câu Đúng/Sai mỗi câu 4 ý (4,0 điểm) lấy từ đúng các bài đã chọn.
              </p>
            </div>

            <button
              type="button"
              onClick={startMockExam}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-bold shadow-xs transition-colors whitespace-nowrap shrink-0 self-start lg:self-center"
            >
              <FileText className="w-4 h-4" />
              Bắt đầu thi thử 30 phút (16 câu)
            </button>
          </div>

          {/* Lesson Range Selector Panel */}
          <div className="bg-white/90 backdrop-blur-xs rounded-2xl border border-[#CBE4FA] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-[#163A70] mr-1">
                  Chọn nhanh phạm vi:
                </span>
                {EXAM_PRESETS.map((preset) => {
                  const active = sameLessonSet(selectedExamLessons, preset.lessons);
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setSelectedExamLessons([...preset.lessons])}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        active
                          ? 'bg-[#2563EB] text-white shadow-xs'
                          : 'bg-[#F0F7FF] text-[#1E3A8A] hover:bg-[#DBEAFE]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <div className="text-xs font-bold text-[#0F766E] tabular-nums">
                Đã chọn {selectedExamLessons.length}/16 bài: {selectedRangeText}
              </div>
            </div>

            {/* Individual Lesson Toggle Grid (Bài 1 -> Bài 16) */}
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
              {allLessonsFlat.map((lesson) => {
                const isSelected = selectedExamLessons.includes(lesson.lessonNum);
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    title={lesson.title}
                    onClick={() => toggleExamLesson(lesson.lessonNum)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition-colors text-center truncate ${
                      isSelected
                        ? 'bg-[#102A56] text-white border-[#102A56]'
                        : 'bg-white text-[#52627E] border-[#DCE5F2] hover:border-[#2563EB] hover:text-[#2563EB]'
                    }`}
                  >
                    Bài {lesson.lessonNum}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Lesson-by-Lesson Practice (Bài 1 -> Bài 16) */}
        <section className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#102A56]">
                Luyện tập theo từng bài học · Tin học {selectedGrade}
              </h2>
              <p className="text-xs text-[#71809A] mt-0.5">
                Đầy đủ 16 bài học — Đã học{' '}
                <strong className="text-[#159B72] tabular-nums">
                  {
                    allLessonsFlat.filter((l) => completedLessonIds.includes(l.id))
                      .length
                  }
                  /{allLessonsFlat.length}
                </strong>{' '}
                bài lớp {selectedGrade}. Bấm chọn bài để làm câu hỏi kiến thức của bài đó.
              </p>
            </div>
            <div className="relative sm:w-72">
              <Search className="w-4 h-4 text-[#71809A] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={lessonSearch}
                onChange={(e) => setLessonSearch(e.target.value)}
                placeholder="Tìm nhanh Bài 1 – Bài 16..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-[#DCE5F2] bg-white text-sm text-[#17233C] focus:outline-none focus:border-[#2864E8]"
              />
            </div>
          </div>

          <div className="space-y-6">
            {filteredChapters.map((chapter) => (
              <div key={chapter.id} className="space-y-3">
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#E4EBF5]">
                  <h3 className="text-sm font-extrabold text-[#163A70] uppercase tracking-wide">
                    {chapter.title}
                  </h3>
                  <span className="text-xs font-semibold text-[#647899] tabular-nums shrink-0">
                    {chapter.lessons.length} bài học
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {chapter.lessons.map((lesson) => {
                    const lessonPool = getQuestionsByLesson(
                      selectedGrade,
                      lesson.title,
                      customQuestions
                    );
                    const count = lessonPool.length;
                    const tfCount = lessonPool.filter(isTrueFalseQuestion).length;
                    const mcqCount = count - tfCount;
                    const isDone = completedLessonIds.includes(lesson.id);
                    return (
                      <div
                        key={lesson.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => startTopicPractice(lesson.title)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            startTopicPractice(lesson.title);
                          }
                        }}
                        className={`group cursor-pointer rounded-2xl border p-4.5 flex flex-col justify-between gap-4 hover:border-[#2864E8] hover:shadow-xs transition-all touch-manipulation ${
                          isDone
                            ? 'bg-[#FAFFFD] border-[#A7F3D0]'
                            : 'bg-white border-[#E4EBF5]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[#2864E8] bg-[#EEF4FF] px-2 py-0.5 rounded-md tabular-nums">
                                Bài {lesson.lessonNumber}
                              </span>
                              {isDone && (
                                <span className="inline-flex items-center gap-1 text-[#047857] bg-[#ECFDF5] border border-[#A7F3D0] px-2 py-0.5 rounded-md font-bold">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Đã học
                                </span>
                              )}
                            </div>
                            <span className="text-[#71809A] tabular-nums shrink-0">
                              {count} câu ({mcqCount} TN · {tfCount} Đ/S)
                            </span>
                          </div>
                          <h4 className="text-[15px] font-bold text-[#102A56] group-hover:text-[#2864E8] mt-2 leading-snug transition-colors">
                            {lesson.title}
                          </h4>
                          <p className="text-xs text-[#647899] mt-1.5 line-clamp-2 leading-relaxed">
                            {lesson.summary}
                          </p>
                        </div>

                        <div
                          className={`w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
                            isDone
                              ? 'bg-[#ECFDF5] text-[#047857] group-hover:bg-[#159B72] group-hover:text-white'
                              : 'bg-[#F4F7FC] group-hover:bg-[#2864E8] text-[#102A56] group-hover:text-white'
                          }`}
                        >
                          <ClipboardCheck className="w-4 h-4" />
                          {isDone
                            ? `Ôn lại Bài ${lesson.lessonNumber}`
                            : `Luyện tập Bài ${lesson.lessonNumber}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  // ==================== RESULTS SUMMARY ====================
  if (submitted) {
    if (mode === 'mock-exam') {
      const stats = computeMockExamStats();
      return (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-white rounded-2xl border border-[#E4EBF5] p-6 sm:p-8 text-center">
            <div className="text-xs font-bold text-[#2864E8] mb-1">
              Đề thi thử 30 phút · Tin học {selectedGrade} ({activeExamRangeLabel})
            </div>
            <h2 className="text-2xl font-bold text-[#102A56]">
              Kết quả đề thi thử 16 câu
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
              <div className="p-4 rounded-xl bg-[#EEF4FF] border border-[#CBE0FF]">
                <div className="text-xs text-[#52627E] font-medium">Tổng điểm</div>
                <div className="text-2xl font-extrabold text-[#2563EB] tabular-nums mt-0.5">
                  {stats.totalScore10.toFixed(2)}/10
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#F4F7FC]">
                <div className="text-xs text-[#71809A]">Phần I (Trắc nghiệm)</div>
                <div className="text-xl font-bold text-[#159B72] tabular-nums mt-0.5">
                  {stats.mcqCorrect}/{mockMcqs.length}
                </div>
                <div className="text-[11px] font-semibold text-[#52627E]">
                  {stats.mcqPts.toFixed(1)} / 6,0 điểm
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#F4F7FC]">
                <div className="text-xs text-[#71809A]">Phần II (Đúng/Sai 4 ý)</div>
                <div className="text-xl font-bold text-[#B45309] tabular-nums mt-0.5">
                  {stats.tf4CorrectStmts}/{mockTf4s.length * 4} ý
                </div>
                <div className="text-[11px] font-semibold text-[#52627E]">
                  {stats.tf4Pts.toFixed(2)} / 4,0 điểm
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#F4F7FC]">
                <div className="text-xs text-[#71809A]">Thời gian làm</div>
                <div className="text-xl font-bold text-[#102A56] tabular-nums mt-0.5">
                  {formatClock(elapsedSeconds)}
                </div>
                <div className="text-[11px] text-[#71809A]">Giới hạn 30:00</div>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-3 mt-6">
              <button
                type="button"
                onClick={startMockExam}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2864E8] hover:bg-[#1E53C9] text-white text-sm font-semibold transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Làm đề mới (cùng phạm vi bài)
              </button>
              <button
                type="button"
                onClick={() => setMode('hub')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-[#DCE5F2] hover:bg-[#F4F7FC] text-[#102A56] text-sm font-semibold transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Về trang Luyện tập
              </button>
            </div>
          </div>

          {/* Part I Breakdown */}
          <div className="bg-white rounded-2xl border border-[#E4EBF5] overflow-hidden">
            <div className="px-5 py-3.5 bg-[#F8FBFF] border-b border-[#E4EBF5] flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-[#102A56]">
                Phần I: Trắc nghiệm 4 lựa chọn (Câu 1 – {mockMcqs.length})
              </h3>
              <span className="text-xs font-bold text-[#2563EB] tabular-nums">
                {stats.mcqCorrect}/{mockMcqs.length} câu đúng · {stats.mcqPts.toFixed(1)}đ
              </span>
            </div>
            <div className="divide-y divide-[#EDF2F9]">
              {mockMcqs.map((q, idx) => {
                const chosen = answers[q.id];
                const isCorrect = chosen === q.correctIndex;
                return (
                  <div key={q.id} className="p-4 sm:p-5 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-semibold text-[#17233C]">
                        Câu {idx + 1}. {q.prompt}
                        <span className="ml-2 text-[11px] font-medium text-[#71809A]">
                          ({q.topic})
                        </span>
                      </div>
                      <span
                        className={`text-xs font-bold shrink-0 ${
                          isCorrect ? 'text-[#159B72]' : 'text-[#D95B67]'
                        }`}
                      >
                        {isCorrect ? '+0,5đ' : '0đ'}
                      </span>
                    </div>
                    <div className="text-xs text-[#52627E] space-y-1">
                      <div>
                        Bạn chọn:{' '}
                        <span className="font-semibold text-[#17233C]">
                          {chosen !== undefined
                            ? `${LETTERS[chosen]}. ${q.options[chosen]}`
                            : 'Chưa trả lời'}
                        </span>
                      </div>
                      {!isCorrect && (
                        <div>
                          Đáp án đúng:{' '}
                          <span className="font-semibold text-[#159B72]">
                            {LETTERS[q.correctIndex]}. {q.options[q.correctIndex]}
                          </span>
                        </div>
                      )}
                      <div className="text-[#71809A]">Giải thích: {q.explanation}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Part II Breakdown */}
          <div className="bg-white rounded-2xl border border-[#E4EBF5] overflow-hidden">
            <div className="px-5 py-3.5 bg-[#FFFBEB] border-b border-[#FDE68A] flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-[#92400E]">
                Phần II: Trắc nghiệm Đúng / Sai 4 ý (Câu {mockMcqs.length + 1} –{' '}
                {mockMcqs.length + mockTf4s.length})
              </h3>
              <span className="text-xs font-bold text-[#B45309] tabular-nums">
                {stats.tf4CorrectStmts}/{mockTf4s.length * 4} ý đúng ·{' '}
                {stats.tf4Pts.toFixed(2)}đ
              </span>
            </div>
            <div className="divide-y divide-[#EDF2F9]">
              {stats.tf4Details.map(({ tf, userArr, rightCount, pts }, idx) => (
                <div key={tf.id} className="p-4 sm:p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-[#102A56]">
                        Câu {mockMcqs.length + idx + 1}. {tf.prompt}
                      </div>
                      <div className="text-[11px] text-[#71809A] mt-0.5">{tf.topic}</div>
                    </div>
                    <span className="text-xs font-bold text-[#B45309] bg-[#FEF3C7] px-2.5 py-1 rounded-lg shrink-0 tabular-nums">
                      Đúng {rightCount}/4 ý (+{pts.toFixed(2)}đ)
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {tf.statements.map((stmt, sIdx) => {
                      const picked = userArr[sIdx];
                      const ok = picked !== null && picked === stmt.isTrue;
                      return (
                        <div
                          key={sIdx}
                          className={`p-2.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                            ok
                              ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
                              : 'bg-[#FFF1F2] border-[#FECDD3] text-[#9F1239]'
                          }`}
                        >
                          <div className="font-medium leading-snug">
                            <span className="font-extrabold mr-1.5">
                              {STMT_LETTERS[sIdx]})
                            </span>
                            {stmt.text}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 font-bold">
                            <span>
                              Chọn:{' '}
                              {picked === null ? 'Bỏ trống' : picked ? 'Đúng' : 'Sai'}
                            </span>
                            <span>·</span>
                            <span>Đáp án: {stmt.isTrue ? 'Đúng' : 'Sai'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-xs text-[#647899] leading-relaxed">
                    <span className="font-bold text-[#163A70]">Giải thích: </span>
                    {tf.explanation}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Topic practice results summary
    const correctCount = questions.filter(
      (q) => answers[q.id] === q.correctIndex
    ).length;
    const pct = Math.round((correctCount / Math.max(1, questions.length)) * 100);

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl border border-[#E4EBF5] p-6 sm:p-8 text-center">
          <div className="text-xs font-semibold text-[#2864E8] mb-1">
            Luyện tập · {activeTopic}
          </div>
          <h2 className="text-2xl font-bold text-[#102A56]">
            Kết quả bài làm của bạn
          </h2>

          <div className="grid grid-cols-3 gap-3 mt-6">
            <div className="p-4 rounded-xl bg-[#F4F7FC]">
              <div className="text-xs text-[#71809A]">Số câu đúng</div>
              <div className="text-2xl font-bold text-[#159B72] tabular-nums mt-0.5">
                {correctCount}/{questions.length}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[#F4F7FC]">
              <div className="text-xs text-[#71809A]">Điểm quy đổi</div>
              <div className="text-2xl font-bold text-[#2864E8] tabular-nums mt-0.5">
                {(pct / 10).toFixed(1)}/10
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[#F4F7FC]">
              <div className="text-xs text-[#71809A]">Thời gian làm</div>
              <div className="text-2xl font-bold text-[#102A56] tabular-nums mt-0.5">
                {formatClock(elapsedSeconds)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3 mt-6">
            <button
              type="button"
              onClick={() => startTopicPractice(activeTopic)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2864E8] hover:bg-[#1E53C9] text-white text-sm font-semibold transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Làm lại bài này
            </button>
            <button
              type="button"
              onClick={() => setMode('hub')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-[#DCE5F2] hover:bg-[#F4F7FC] text-[#102A56] text-sm font-semibold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Về trang Luyện tập
            </button>
          </div>
        </div>

        {/* Full Answer Breakdown */}
        <div className="bg-white rounded-2xl border border-[#E4EBF5] divide-y divide-[#EDF2F9]">
          {questions.map((q, idx) => {
            const chosen = answers[q.id];
            const isCorrect = chosen === q.correctIndex;
            return (
              <div key={q.id} className="p-5 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold text-[#17233C]">
                    Câu {idx + 1}. {q.prompt}
                  </div>
                  <span
                    className={`text-xs font-semibold shrink-0 ${
                      isCorrect ? 'text-[#159B72]' : 'text-[#D95B67]'
                    }`}
                  >
                    {isCorrect ? 'Chính xác' : 'Cần xem lại'}
                  </span>
                </div>
                <div className="text-xs text-[#52627E] space-y-1">
                  <div>
                    Bạn chọn:{' '}
                    <span className="font-semibold text-[#17233C]">
                      {chosen !== undefined
                        ? `${getOptionLabel(q, chosen)}. ${q.options[chosen]}`
                        : 'Chưa trả lời'}
                    </span>
                  </div>
                  {!isCorrect && (
                    <div>
                      Đáp án đúng:{' '}
                      <span className="font-semibold text-[#159B72]">
                        {getOptionLabel(q, q.correctIndex)}. {q.options[q.correctIndex]}
                      </span>
                    </div>
                  )}
                  <div className="text-[#71809A]">Giải thích: {q.explanation}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ==================== ACTIVE MOCK EXAM (16 QUESTIONS: 12 MCQ + 4 TF4) ====================
  if (mode === 'mock-exam') {
    const totalExamQuestions = mockMcqs.length + mockTf4s.length;
    const isMcqStep = currentIdx < mockMcqs.length;
    const activeMcq = isMcqStep ? mockMcqs[currentIdx] : null;
    const activeTf4 = !isMcqStep ? mockTf4s[currentIdx - mockMcqs.length] : null;

    const mcqAnsweredCount = mockMcqs.filter((m) => answers[m.id] !== undefined).length;
    const tf4CompletedCount = mockTf4s.filter((tf) => {
      const arr = tf4Answers[tf.id];
      return arr && arr.filter((v) => v !== null).length === 4;
    }).length;
    const totalAnsweredCount = mcqAnsweredCount + tf4CompletedCount;

    const setTf4Choice = (tfId: string, stmtIdx: number, val: boolean) => {
      setTf4Answers((prev) => {
        const cur = prev[tfId] ? [...prev[tfId]] : [null, null, null, null];
        cur[stmtIdx] = val;
        return { ...prev, [tfId]: cur };
      });
    };

    return (
      <div className="max-w-4xl mx-auto space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setMode('hub')}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#647899] hover:text-[#163A70]"
          >
            <ArrowLeft className="w-4 h-4" />
            Thoát đề thi
          </button>

          <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm font-bold tabular-nums">
            <span className="text-[#163A70]">{activeTopic}</span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
                remainingSeconds <= 180
                  ? 'bg-[#FFF1F2] text-[#E11D48]'
                  : 'bg-[#EEF4FF] text-[#2563EB]'
              }`}
            >
              <Clock className="w-4 h-4" />
              {formatClock(remainingSeconds)}
            </span>
          </div>
        </div>

        {/* 16-Question Navigator Bar (Part I: 1–12, Part II: 13–16) */}
        <div className="bg-white rounded-2xl border border-[#DCE8F8] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] font-extrabold text-[#2563EB] mr-1">
                P.I:
              </span>
              {mockMcqs.map((item, idx) => {
                const isAns = answers[item.id] !== undefined;
                const isCur = idx === currentIdx;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCurrentIdx(idx)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold tabular-nums transition-colors ${
                      isCur
                        ? 'bg-[#2563EB] text-white'
                        : isAns
                          ? 'bg-[#DBEAFE] text-[#1D4ED8]'
                          : 'bg-[#F4F8FF] text-[#647899] hover:text-[#163A70]'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1 pl-2 border-l border-[#E2ECF9]">
              <span className="text-[11px] font-extrabold text-[#B45309] mr-1">
                P.II (Đ/S):
              </span>
              {mockTf4s.map((tf, idx) => {
                const qIndex = mockMcqs.length + idx;
                const arr = tf4Answers[tf.id] ?? [];
                const filled = arr.filter((v) => v !== null).length;
                const isCur = qIndex === currentIdx;
                return (
                  <button
                    key={tf.id}
                    type="button"
                    onClick={() => setCurrentIdx(qIndex)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold tabular-nums transition-colors ${
                      isCur
                        ? 'bg-[#D97706] text-white'
                        : filled === 4
                          ? 'bg-[#FEF3C7] text-[#92400E]'
                          : filled > 0
                            ? 'bg-[#FFFBEB] text-[#B45309] border border-[#FCD34D]'
                            : 'bg-[#F4F8FF] text-[#647899] hover:text-[#163A70]'
                    }`}
                  >
                    {qIndex + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-xs font-semibold text-[#647899] tabular-nums">
            Hoàn thành {totalAnsweredCount}/{totalExamQuestions} câu
          </div>
        </div>

        {/* Active Exam Question Card (1-Screen Compact) */}
        <div className="bg-white rounded-2xl border border-[#DCE8F8] p-4 sm:p-5 space-y-4 shadow-xs">
          {isMcqStep && activeMcq ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                <span className="text-[#2563EB]">
                  Phần I · Câu {currentIdx + 1}/{mockMcqs.length} · {activeMcq.topic}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-[#EEF4FF] text-[#2563EB] font-bold">
                  Trắc nghiệm 4 lựa chọn (0,5đ)
                </span>
              </div>

              <h2 className="text-base sm:text-lg font-extrabold text-[#163A70] leading-snug">
                {activeMcq.prompt}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {activeMcq.options.map((opt, idx) => {
                  const isSelected = answers[activeMcq.id] === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() =>
                        setAnswers((prev) => ({
                          ...prev,
                          [activeMcq.id]: idx,
                        }))
                      }
                      className={`w-full flex items-center gap-3 p-3 sm:p-3.5 rounded-xl border text-left transition-colors touch-manipulation cursor-pointer select-none ${
                        isSelected
                          ? 'bg-[#EEF4FF] border-[#2563EB] text-[#163A70]'
                          : 'bg-white border-[#D8E6F8] hover:border-[#2563EB] hover:bg-[#F3F8FF] text-[#1A2B49]'
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 ${
                          isSelected
                            ? 'bg-[#2563EB] text-white'
                            : 'bg-[#EEF5FF] text-[#163A70]'
                        }`}
                      >
                        {LETTERS[idx]}
                      </span>
                      <span className="text-xs sm:text-sm font-semibold flex-1 leading-snug">
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : activeTf4 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                <span className="text-[#B45309]">
                  Phần II · Câu {currentIdx + 1}/{totalExamQuestions} · {activeTf4.topic}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-[#FEF3C7] text-[#B45309] font-bold">
                  Đúng / Sai 4 ý (tối đa 1,0đ)
                </span>
              </div>

              <h2 className="text-sm sm:text-base font-extrabold text-[#163A70] leading-snug">
                {activeTf4.prompt}
              </h2>

              <div className="space-y-2">
                {activeTf4.statements.map((stmt, sIdx) => {
                  const picked = tf4Answers[activeTf4.id]?.[sIdx] ?? null;
                  return (
                    <div
                      key={sIdx}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border border-[#DCE8F8] bg-[#FAFCFF]"
                    >
                      <div className="text-xs sm:text-sm font-semibold text-[#1A2B49] leading-snug flex-1">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#FEF3C7] text-[#92400E] font-extrabold text-xs mr-2">
                          {STMT_LETTERS[sIdx]}
                        </span>
                        {stmt.text}
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => setTf4Choice(activeTf4.id, sIdx, true)}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold border transition-colors ${
                            picked === true
                              ? 'bg-[#059669] text-white border-[#059669]'
                              : 'bg-white text-[#065F46] border-[#CBD5E1] hover:border-[#059669]'
                          }`}
                        >
                          Đúng
                        </button>
                        <button
                          type="button"
                          onClick={() => setTf4Choice(activeTf4.id, sIdx, false)}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold border transition-colors ${
                            picked === false
                              ? 'bg-[#E11D48] text-white border-[#E11D48]'
                              : 'bg-white text-[#9F1239] border-[#CBD5E1] hover:border-[#E11D48]'
                          }`}
                        >
                          Sai
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {/* Navigation Footer */}
          <div className="pt-3 border-t border-[#EDF4FC] flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#DCE8F8] text-xs sm:text-sm font-bold text-[#163A70] disabled:opacity-40 hover:bg-[#F4F9FF] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Câu trước
            </button>

            <div className="flex items-center gap-2">
              {currentIdx + 1 < totalExamQuestions && (
                <button
                  type="button"
                  onClick={handleSubmitAll}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] hover:bg-[#D1FAE5] text-[#065F46] text-xs sm:text-sm font-bold transition-colors"
                >
                  Nộp bài
                </button>
              )}

              {currentIdx + 1 < totalExamQuestions ? (
                <button
                  type="button"
                  onClick={() => setCurrentIdx((i) => i + 1)}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-bold transition-colors"
                >
                  Câu tiếp theo
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmitAll}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs sm:text-sm font-bold transition-colors"
                >
                  Nộp bài &amp; xem kết quả
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== ACTIVE TOPIC PRACTICE SESSION ====================
  const q = questions[currentIdx];
  const selectedChoice = q ? answers[q.id] : undefined;
  const isTopicInstantRevealed =
    mode === 'topic-practice' && selectedChoice !== undefined;
  const answeredCount = Object.keys(answers).length;

  if (!q) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMode('hub')}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#647899] hover:text-[#163A70]"
        >
          <ArrowLeft className="w-4 h-4" />
          Thoát bài làm
        </button>

        <div className="flex items-center gap-3 text-xs sm:text-sm font-bold tabular-nums">
          <span className="text-[#163A70]">{activeTopic}</span>
        </div>
      </div>

      {/* Compact Question Navigator Bar */}
      <div className="bg-white rounded-2xl border border-[#DCE8F8] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {questions.map((item, idx) => {
            const isAns = answers[item.id] !== undefined;
            const isCur = idx === currentIdx;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentIdx(idx)}
                className={`w-8 h-8 rounded-lg text-xs font-bold tabular-nums transition-colors ${
                  isCur
                    ? 'bg-[#2563EB] text-white'
                    : isAns
                      ? 'bg-[#EAF2FF] text-[#2563EB]'
                      : 'bg-[#F4F8FF] text-[#647899] hover:text-[#163A70]'
                }`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
        <div className="text-xs font-semibold text-[#647899] tabular-nums">
          Đã trả lời {answeredCount}/{questions.length} câu
        </div>
      </div>

      {/* 1-Screen Compact Question Panel */}
      <div className="bg-white rounded-2xl border border-[#DCE8F8] p-4 sm:p-6 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
          <span className="text-[#2563EB]">
            Câu {currentIdx + 1}/{questions.length} · {q.topic}
          </span>
          <span
            className={`px-2.5 py-0.5 rounded-md font-bold ${
              isTrueFalseQuestion(q)
                ? 'bg-[#FEF3C7] text-[#B45309]'
                : 'bg-[#EEF4FF] text-[#2563EB]'
            }`}
          >
            {isTrueFalseQuestion(q) ? 'Đúng / Sai' : 'Trắc nghiệm 4 lựa chọn'}
          </span>
        </div>

        <h2 className="text-base sm:text-lg font-extrabold text-[#163A70] leading-snug">
          {q.prompt}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {q.options.map((opt, idx) => {
            const isSelected = selectedChoice === idx;
            const isCorrect = idx === q.correctIndex;

            let cls =
              'bg-white border-[#D8E6F8] hover:border-[#2563EB] hover:bg-[#F3F8FF] text-[#1A2B49]';
            let badgeCls = 'bg-[#EEF5FF] text-[#163A70]';

            if (isTopicInstantRevealed) {
              if (isCorrect) {
                cls = 'bg-[#ECFDF5] border-[#10B981] text-[#065F46]';
                badgeCls = 'bg-[#10B981] text-white';
              } else if (isSelected && !isCorrect) {
                cls = 'bg-[#FFF1F2] border-[#F43F5E] text-[#9F1239]';
                badgeCls = 'bg-[#F43F5E] text-white';
              }
            } else if (isSelected) {
              cls = 'bg-[#EEF4FF] border-[#2563EB] text-[#163A70]';
              badgeCls = 'bg-[#2563EB] text-white';
            }

            return (
              <button
                key={idx}
                type="button"
                disabled={isTopicInstantRevealed}
                onClick={() =>
                  setAnswers((prev) => ({
                    ...prev,
                    [q.id]: idx,
                  }))
                }
                className={`w-full flex items-center gap-3 p-3 sm:p-3.5 rounded-xl border text-left transition-colors touch-manipulation cursor-pointer select-none ${cls}`}
              >
                <span
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 ${badgeCls}`}
                >
                  {getOptionLabel(q, idx)}
                </span>
                <span className="text-xs sm:text-sm font-semibold flex-1 leading-snug">
                  {opt}
                </span>
                {isTopicInstantRevealed && isCorrect && (
                  <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                )}
                {isTopicInstantRevealed && isSelected && !isCorrect && (
                  <XCircle className="w-4 h-4 text-[#F43F5E] shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Instant compact explanation in Topic Practice mode */}
        {isTopicInstantRevealed && (
          <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#DCE8F8] text-xs sm:text-sm text-[#394A68] leading-snug">
            <span className="font-bold text-[#163A70]">Giải thích: </span>
            {q.explanation}
          </div>
        )}

        {/* Navigation Footer */}
        <div className="pt-3 border-t border-[#EDF4FC] flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={currentIdx === 0}
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#DCE8F8] text-xs sm:text-sm font-bold text-[#163A70] disabled:opacity-40 hover:bg-[#F4F9FF] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Câu trước
          </button>

          {currentIdx + 1 < questions.length ? (
            <button
              type="button"
              onClick={() => setCurrentIdx((i) => i + 1)}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-bold transition-colors"
            >
              Câu tiếp theo
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmitAll}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs sm:text-sm font-bold transition-colors"
            >
              Nộp bài &amp; xem kết quả
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
