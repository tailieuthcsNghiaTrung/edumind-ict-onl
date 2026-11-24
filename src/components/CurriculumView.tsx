import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Clock,
  Code2,
  RotateCcw,
  Search,
  XCircle,
} from 'lucide-react';
import { CURRICULUM_CHAPTERS } from '../../data/curriculum';
import {
  getQuestionsByLesson,
  pickRandomQuestions,
} from '../../data/questionBank';
import { Grade, Lesson, Question, SessionRecord } from '../types';

interface CurriculumViewProps {
  selectedGrade: Grade;
  onSelectGrade: (grade: Grade) => void;
  completedLessonIds: string[];
  customQuestions: Question[];
  onToggleLesson: (lessonId: string) => void;
  onMarkLessonComplete?: (lessonId: string) => void;
  onPracticeTopic: (grade: Grade, lessonTitle: string) => void;
  onCompleteSession?: (
    session: Omit<SessionRecord, 'id' | 'completedAt'>,
    topicBreakdown: { grade: Grade; topic: string; isCorrect: boolean }[]
  ) => void;
}

const GRADES: Grade[] = [6, 7, 8, 9];
const LETTERS = ['A', 'B', 'C', 'D'] as const;
const TF_LABELS = ['Đ', 'S'] as const;

function isTrueFalseQuestion(q: Question): boolean {
  return q.questionType === 'true-false' || q.options.length === 2;
}

function getOptionLabel(q: Question, idx: number): string {
  return isTrueFalseQuestion(q)
    ? TF_LABELS[idx] ?? String(idx + 1)
    : LETTERS[idx] ?? String(idx + 1);
}

export default function CurriculumView({
  selectedGrade,
  onSelectGrade,
  completedLessonIds,
  customQuestions,
  onToggleLesson,
  onMarkLessonComplete,
  onPracticeTopic,
  onCompleteSession,
}: CurriculumViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'questions' | 'theory'>('questions');
  const lessonPanelRef = useRef<HTMLElement | null>(null);

  const chapters = useMemo(
    () => CURRICULUM_CHAPTERS.filter((c) => c.grade === selectedGrade),
    [selectedGrade]
  );

  const filteredChapters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return chapters;
    return chapters
      .map((ch) => ({
        ...ch,
        lessons: ch.lessons.filter(
          (l) =>
            l.title.toLowerCase().includes(q) ||
            l.summary.toLowerCase().includes(q) ||
            ch.title.toLowerCase().includes(q)
        ),
      }))
      .filter((ch) => ch.lessons.length > 0);
  }, [chapters, searchQuery]);

  const [selectedLessonId, setSelectedLessonId] = useState<string>(
    () => chapters[0]?.lessons[0]?.id ?? ''
  );

  // Sync active lesson when switching grades
  const activeLessonData = useMemo<{
    lesson: Lesson;
    chapterTopic: string;
    chapterTitle: string;
  } | null>(() => {
    for (const ch of chapters) {
      const found = ch.lessons.find((l) => l.id === selectedLessonId);
      if (found) {
        return { lesson: found, chapterTopic: ch.topic, chapterTitle: ch.title };
      }
    }
    const firstChapter = chapters[0];
    if (firstChapter && firstChapter.lessons[0]) {
      return {
        lesson: firstChapter.lessons[0],
        chapterTopic: firstChapter.topic,
        chapterTitle: firstChapter.title,
      };
    }
    return null;
  }, [chapters, selectedLessonId]);

  // Inline instant interactive questions for the currently clicked lesson
  const [lessonQuestions, setLessonQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const startedAtRef = useRef<number>(Date.now());
  const recordedRef = useRef<boolean>(false);

  const loadInlineQuestionsForLesson = (grade: Grade, lessonTitle: string) => {
    const exactPool = getQuestionsByLesson(grade, lessonTitle, customQuestions);
    const picked = pickRandomQuestions(grade, Math.max(1, exactPool.length), {
      topic: lessonTitle,
      strictTopic: true,
      customQuestions,
    });
    setLessonQuestions(picked);
    setAnswers({});
    setCurrentIdx(0);
    setSubmitted(false);
    startedAtRef.current = Date.now();
    recordedRef.current = false;
  };

  useEffect(() => {
    if (activeLessonData) {
      loadInlineQuestionsForLesson(selectedGrade, activeLessonData.lesson.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGrade, activeLessonData?.lesson.id, customQuestions.length]);

  const handleSelectLesson = (lesson: Lesson) => {
    setSelectedLessonId(lesson.id);
    setActiveTab('questions');
    loadInlineQuestionsForLesson(selectedGrade, lesson.title);

    // Always bring the lesson's questions directly into view at the top of the screen
    window.requestAnimationFrame(() => {
      if (lessonPanelRef.current) {
        lessonPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  };

  const handleSubmitInlinePractice = () => {
    if (!activeLessonData || submitted) return;
    setSubmitted(true);
    onMarkLessonComplete?.(activeLessonData.lesson.id);
    if (recordedRef.current) return;
    recordedRef.current = true;

    const correctCount = lessonQuestions.filter(
      (q) => answers[q.id] === q.correctIndex
    ).length;
    const durationSeconds = Math.max(
      1,
      Math.round((Date.now() - startedAtRef.current) / 1000)
    );

    onCompleteSession?.(
      {
        type: 'practice',
        title: `Luyện tập: ${activeLessonData.lesson.title}`,
        grade: selectedGrade,
        topic: activeLessonData.lesson.title,
        score: correctCount * 10,
        maxScore: lessonQuestions.length * 10,
        correctCount,
        totalQuestions: lessonQuestions.length,
        durationSeconds,
      },
      lessonQuestions.map((q) => ({
        grade: q.grade,
        topic: q.topic,
        isCorrect: answers[q.id] === q.correctIndex,
      }))
    );
  };

  const totalLessons = chapters.reduce((acc, c) => acc + c.lessons.length, 0);
  const completedCount = chapters.reduce(
    (acc, c) =>
      acc + c.lessons.filter((l) => completedLessonIds.includes(l.id)).length,
    0
  );

  const activeQ = lessonQuestions[currentIdx] ?? null;
  const activeChoice = activeQ ? answers[activeQ.id] : undefined;
  const isRevealed = activeChoice !== undefined;
  const answeredCount = Object.keys(answers).length;
  const correctInlineCount = lessonQuestions.filter(
    (q) => answers[q.id] === q.correctIndex
  ).length;

  return (
    <div className="space-y-5">
      {/* Header + Grade Tabs */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#102A56]">
            Chương trình học Tin học {selectedGrade} (Bài 1 – Bài 16)
          </h1>
          <p className="text-sm text-[#71809A] mt-1">
            Bấm chọn bất kỳ bài học nào để học ngay · Đã học{' '}
            <span className="font-bold text-[#159B72] tabular-nums">
              {completedCount}/{totalLessons}
            </span>{' '}
            bài lớp {selectedGrade} (
            {totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0}%).
          </p>
          <div className="mt-2 h-2 w-full max-w-sm bg-[#E6EFFA] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#159B72] rounded-full transition-all"
              style={{
                width: `${totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0}%`,
              }}
            />
          </div>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-white border border-[#DCE5F2] rounded-xl self-start">
          {GRADES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => {
                onSelectGrade(g);
                setSearchQuery('');
                const first = CURRICULUM_CHAPTERS.find((c) => c.grade === g)?.lessons[0];
                if (first) {
                  setSelectedLessonId(first.id);
                  setActiveTab('questions');
                }
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
      </div>

      {/* 2-Column Layout: Active Lesson & Questions appear FIRST on narrow screens (no scrolling to bottom!) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Active Lesson & Instant Questions Panel (order-first on mobile/tablet/narrow viewport, right sticky column on desktop) */}
        {activeLessonData && (
          <article
            ref={lessonPanelRef}
            className="order-first lg:order-2 lg:col-span-7 lg:sticky lg:top-20 scroll-mt-20 bg-white rounded-2xl border border-[#DCE8F8] p-4 sm:p-6 space-y-4 shadow-2xs"
          >
            {/* Lesson Title + Quick Controls */}
            <div className="space-y-2.5 pb-3.5 border-b border-[#EDF2F9]">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                <span className="text-[#2864E8]">
                  Tin học {selectedGrade} · {activeLessonData.chapterTitle}
                </span>
                <button
                  type="button"
                  onClick={() => onToggleLesson(activeLessonData.lesson.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
                    completedLessonIds.includes(activeLessonData.lesson.id)
                      ? 'bg-[#ECF9F3] text-[#159B72] border-[#BEE5D4]'
                      : 'bg-[#F8FBFF] text-[#102A56] border-[#DCE5F2] hover:border-[#2864E8]'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {completedLessonIds.includes(activeLessonData.lesson.id)
                    ? 'Đã học'
                    : 'Đánh dấu đã học'}
                </button>
              </div>

              <h2 className="text-lg sm:text-xl font-extrabold text-[#102A56] leading-snug">
                {activeLessonData.lesson.title}
              </h2>

              {/* Instant Mode Switcher: Questions vs Theory */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F0F6FF] border border-[#DCE8F8]">
                  <button
                    type="button"
                    onClick={() => setActiveTab('questions')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      activeTab === 'questions'
                        ? 'bg-[#2563EB] text-white shadow-xs'
                        : 'text-[#4B6384] hover:text-[#102A56]'
                    }`}
                  >
                    <ClipboardCheck className="w-3.5 h-3.5" />
                    Câu hỏi bài này ({lessonQuestions.length} câu)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('theory')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      activeTab === 'theory'
                        ? 'bg-[#2563EB] text-white shadow-xs'
                        : 'text-[#4B6384] hover:text-[#102A56]'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Kiến thức trọng tâm
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onPracticeTopic(selectedGrade, activeLessonData.lesson.title)
                  }
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#2563EB] hover:text-[#1D4ED8]"
                >
                  Mở trang Luyện tập đầy đủ
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* TAB 1: INSTANT INTERACTIVE QUESTIONS FOR THIS LESSON */}
            {activeTab === 'questions' && (
              <>
                {submitted ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-[#F4F9FF] border border-[#DCE8F8] p-5 text-center space-y-3">
                      <div className="text-xs font-bold text-[#2563EB]">
                        Hoàn thành {activeLessonData.lesson.title}
                      </div>
                      <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
                        <div className="bg-white rounded-xl p-3 border border-[#E4EBF5]">
                          <div className="text-xs text-[#71809A]">Số câu đúng</div>
                          <div className="text-2xl font-extrabold text-[#159B72] tabular-nums">
                            {correctInlineCount}/{lessonQuestions.length}
                          </div>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-[#E4EBF5]">
                          <div className="text-xs text-[#71809A]">Điểm quy đổi</div>
                          <div className="text-2xl font-extrabold text-[#2563EB] tabular-nums">
                            {(
                              (correctInlineCount / Math.max(1, lessonQuestions.length)) *
                              10
                            ).toFixed(1)}
                            /10
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            loadInlineQuestionsForLesson(
                              selectedGrade,
                              activeLessonData.lesson.title
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Làm lại bài này
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('theory')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-[#DCE8F8] text-[#102A56] text-xs font-bold hover:bg-[#F8FBFF]"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          Xem lại kiến thức trọng tâm
                        </button>
                      </div>
                    </div>
                  </div>
                ) : activeQ ? (
                  <div className="space-y-3.5">
                    {/* Compact Question Number Pills */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {lessonQuestions.map((item, idx) => {
                          const chosen = answers[item.id];
                          const isAns = chosen !== undefined;
                          const isRight = isAns && chosen === item.correctIndex;
                          const isCur = idx === currentIdx;
                          let cls = 'bg-[#F4F8FF] text-[#647899] hover:text-[#163A70]';
                          if (isCur) {
                            cls = 'bg-[#2563EB] text-white';
                          } else if (isAns) {
                            cls = isRight
                              ? 'bg-[#ECFDF5] text-[#047857]'
                              : 'bg-[#FFF1F2] text-[#BE123C]';
                          }
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setCurrentIdx(idx)}
                              className={`w-7 h-7 rounded-lg text-[11px] font-bold tabular-nums transition-colors ${cls}`}
                            >
                              {idx + 1}
                            </button>
                          );
                        })}
                      </div>
                      <span className="text-xs font-semibold text-[#647899] tabular-nums">
                        {answeredCount}/{lessonQuestions.length} câu
                      </span>
                    </div>

                    {/* Question Stem */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                      <span className="text-[#2563EB]">
                        Câu {currentIdx + 1}/{lessonQuestions.length}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md ${
                          isTrueFalseQuestion(activeQ)
                            ? 'bg-[#FEF3C7] text-[#B45309]'
                            : 'bg-[#EEF4FF] text-[#2563EB]'
                        }`}
                      >
                        {isTrueFalseQuestion(activeQ)
                          ? 'Đúng / Sai'
                          : 'Trắc nghiệm 4 lựa chọn'}
                      </span>
                    </div>

                    <div className="text-base font-extrabold text-[#163A70] leading-snug">
                      {activeQ.prompt}
                    </div>

                    {/* 1-Screen 2x2 Options Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {activeQ.options.map((opt, oIdx) => {
                        const isSelected = activeChoice === oIdx;
                        const isCorrect = oIdx === activeQ.correctIndex;

                        let cls =
                          'bg-white border-[#D8E6F8] hover:border-[#2563EB] hover:bg-[#F3F8FF] text-[#1A2B49]';
                        let badgeCls = 'bg-[#EEF5FF] text-[#163A70]';

                        if (isRevealed) {
                          if (isCorrect) {
                            cls = 'bg-[#ECFDF5] border-[#10B981] text-[#065F46]';
                            badgeCls = 'bg-[#10B981] text-white';
                          } else if (isSelected && !isCorrect) {
                            cls = 'bg-[#FFF1F2] border-[#F43F5E] text-[#9F1239]';
                            badgeCls = 'bg-[#F43F5E] text-white';
                          } else {
                            cls = 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B]';
                            badgeCls = 'bg-[#E2E8F0] text-[#64748B]';
                          }
                        }

                        return (
                          <button
                            key={oIdx}
                            type="button"
                            disabled={isRevealed}
                            onClick={() => {
                              setAnswers((prev) => ({
                                ...prev,
                                [activeQ.id]: oIdx,
                              }));
                              if (activeLessonData) {
                                onMarkLessonComplete?.(activeLessonData.lesson.id);
                              }
                            }}
                            className={`w-full flex items-center gap-2.5 p-3 rounded-xl border text-left transition-colors touch-manipulation cursor-pointer select-none ${cls}`}
                          >
                            <span
                              className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 ${badgeCls}`}
                            >
                              {getOptionLabel(activeQ, oIdx)}
                            </span>
                            <span className="text-xs sm:text-sm font-semibold flex-1 leading-snug">
                              {opt}
                            </span>
                            {isRevealed && isCorrect && (
                              <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                            )}
                            {isRevealed && isSelected && !isCorrect && (
                              <XCircle className="w-4 h-4 text-[#F43F5E] shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Instant Explanation after selecting an option */}
                    {isRevealed && (
                      <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#DCE8F8] text-xs sm:text-sm text-[#394A68] leading-snug">
                        <span className="font-bold text-[#163A70]">Giải thích: </span>
                        {activeQ.explanation}
                      </div>
                    )}

                    {/* Prev / Next / Submit */}
                    <div className="pt-3 border-t border-[#EDF4FC] flex items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={currentIdx === 0}
                        onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#DCE8F8] text-xs font-bold text-[#163A70] disabled:opacity-40 hover:bg-[#F4F9FF]"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        Câu trước
                      </button>

                      {currentIdx + 1 < lessonQuestions.length ? (
                        <button
                          type="button"
                          onClick={() => setCurrentIdx((i) => i + 1)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold"
                        >
                          Câu tiếp theo
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleSubmitInlinePractice}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold"
                        >
                          Nộp bài &amp; lưu kết quả
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            )}

            {/* TAB 2: LESSON KEY KNOWLEDGE & EXAMPLE */}
            {activeTab === 'theory' && (
              <div className="space-y-5">
                <p className="text-sm text-[#52627E] leading-relaxed">
                  {activeLessonData.lesson.summary}
                </p>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-[#102A56] flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-[#2864E8]" />
                    Kiến thức trọng tâm của bài
                  </h3>
                  <ul className="space-y-2.5">
                    {activeLessonData.lesson.keyPoints.map((pt, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 text-sm text-[#17233C] leading-relaxed"
                      >
                        <span className="w-6 h-6 rounded-lg bg-[#EAF2FF] text-[#2864E8] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                          {i + 1}
                        </span>
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl bg-[#102A56] text-white p-4 sm:p-5 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#35C6D4]">
                    <Code2 className="w-4 h-4" />
                    <span>{activeLessonData.lesson.exampleTitle}</span>
                  </div>
                  <pre className="font-mono text-xs sm:text-sm text-[#EAF2FF] whitespace-pre-wrap leading-relaxed overflow-x-auto">
                    {activeLessonData.lesson.exampleCodeOrNote}
                  </pre>
                </div>

                <div className="pt-2 flex flex-wrap justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveTab('questions')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2864E8] hover:bg-[#1E53C9] text-white text-sm font-semibold transition-colors"
                  >
                    <ClipboardCheck className="w-4 h-4" />
                    Làm ngay {lessonQuestions.length} câu hỏi bài này
                  </button>
                </div>
              </div>
            )}
          </article>
        )}

        {/* Chapters & Lessons List (Bài 1 -> Bài 16) */}
        <div className="order-2 lg:order-1 lg:col-span-5 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#71809A] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Tìm nhanh bài học Tin học ${selectedGrade} (Bài 1 - Bài 16)...`}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#DCE5F2] bg-white text-sm text-[#17233C] focus:outline-none focus:border-[#2864E8]"
            />
          </div>

          <div className="space-y-3.5 lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto lg:pr-1">
            {filteredChapters.length > 0 ? (
              filteredChapters.map((chapter) => (
                <div
                  key={chapter.id}
                  className="bg-white rounded-2xl border border-[#E4EBF5] overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-[#EDF2F9] bg-[#FAFBFD]">
                    <h2 className="text-xs font-extrabold text-[#102A56] uppercase tracking-wide">
                      {chapter.title}
                    </h2>
                    <p className="text-xs text-[#71809A] mt-0.5 leading-relaxed">
                      {chapter.description}
                    </p>
                  </div>
                  <div className="divide-y divide-[#EDF2F9]">
                    {chapter.lessons.map((lesson) => {
                      const isDone = completedLessonIds.includes(lesson.id);
                      const isSelected = activeLessonData?.lesson.id === lesson.id;
                      const qCount = getQuestionsByLesson(
                        selectedGrade,
                        lesson.title,
                        customQuestions
                      ).length;
                      return (
                        <button
                          key={lesson.id}
                          type="button"
                          onClick={() => handleSelectLesson(lesson)}
                          className={`w-full px-4 py-3 flex items-start gap-3 text-left transition-colors ${
                            isSelected ? 'bg-[#EEF4FF]' : 'hover:bg-[#FAFBFD]'
                          }`}
                        >
                          {isDone ? (
                            <CheckCircle2 className="w-4.5 h-4.5 text-[#159B72] shrink-0 mt-0.5" />
                          ) : (
                            <Circle className="w-4.5 h-4.5 text-[#C1CDDF] shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div
                              className={`text-sm font-semibold leading-snug ${
                                isSelected ? 'text-[#2864E8]' : 'text-[#17233C]'
                              }`}
                            >
                              {lesson.title}
                            </div>
                            <div className="text-xs text-[#71809A] mt-1 flex items-center flex-wrap gap-x-2 gap-y-0.5">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {lesson.durationMinutes} phút
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">{qCount} câu luyện tập</span>
                              <span aria-hidden="true">·</span>
                              {isDone ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0] font-bold">
                                  Đã học
                                </span>
                              ) : (
                                <span>Chưa học</span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-white rounded-2xl border border-[#E4EBF5] p-6 text-center text-sm text-[#71809A]">
                Không tìm thấy bài học phù hợp với từ khóa "{searchQuery}".
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
