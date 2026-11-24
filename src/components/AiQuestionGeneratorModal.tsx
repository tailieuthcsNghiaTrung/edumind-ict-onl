import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Wand2,
  X,
  XCircle,
} from 'lucide-react';
import { getQuestionsByGrade, getTopicsByGrade } from '../../data/questionBank';
import { Difficulty, Grade, Question, UserRole } from '../types';

interface AiQuestionGeneratorModalProps {
  defaultGrade: Grade;
  userRole?: UserRole;
  customQuestions: Question[];
  onSaveQuestions: (questions: Omit<Question, 'id'>[]) => void;
  onClose: () => void;
}

const GRADES: Grade[] = [6, 7, 8, 9];
const LETTERS = ['A', 'B', 'C', 'D'] as const;

type DraftQuestion = Omit<Question, 'id'> & { _selected: boolean };

function getDiffLabel(d: Difficulty): string {
  if (d === 'hard') return 'Vận dụng';
  if (d === 'medium') return 'Thông hiểu';
  return 'Nhận biết';
}

export default function AiQuestionGeneratorModal({
  defaultGrade,
  userRole = 'student',
  customQuestions,
  onSaveQuestions,
  onClose,
}: AiQuestionGeneratorModalProps) {
  const isStaff = userRole === 'teacher' || userRole === 'admin';

  const [grade, setGrade] = useState<Grade>(defaultGrade);
  const [topic, setTopic] = useState<string>('Tất cả chủ đề');
  const [customFocus, setCustomFocus] = useState<string>('');
  const [difficulty, setDifficulty] = useState<'mixed' | Difficulty>('mixed');
  const [count, setCount] = useState<number>(5);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftQuestion[]>([]);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [savedCurrentBatch, setSavedCurrentBatch] = useState(false);

  // Interactive student study state: answers stay hidden until the student clicks an option
  const [studentAnswers, setStudentAnswers] = useState<Record<number, number>>({});
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [showConfigPanel, setShowConfigPanel] = useState<boolean>(true);
  // Staff-only optional toggle to inspect answers quickly (never shown to students)
  const [staffShowAnswers, setStaffShowAnswers] = useState<boolean>(false);

  const topicsForGrade = useMemo(
    () => getTopicsByGrade(grade, customQuestions),
    [customQuestions, grade]
  );

  const existingGradeQuestions = useMemo(
    () => getQuestionsByGrade(grade, customQuestions),
    [customQuestions, grade]
  );

  const handleGenerate = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSavedNotice(null);
    setSavedCurrentBatch(false);
    setStudentAnswers({});
    setActiveIdx(0);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 65000);

    try {
      const scopedQuestions =
        topic && topic !== 'Tất cả chủ đề'
          ? existingGradeQuestions.filter((q) => q.topic === topic)
          : existingGradeQuestions;
      const existingPrompts = (
        scopedQuestions.length > 0 ? scopedQuestions : existingGradeQuestions
      )
        .map((q) => q.prompt)
        .slice(0, 16);

      const res = await fetch(`/api/generate-questions?_t=${Date.now()}`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
        body: JSON.stringify({
          grade,
          topic,
          customFocus,
          difficulty,
          count,
          existingPrompts,
        }),
      });

      const rawText = await res.text();
      let data: { questions?: Omit<Question, 'id'>[]; error?: string } = {};
      try {
        data = JSON.parse(rawText) as {
          questions?: Omit<Question, 'id'>[];
          error?: string;
        };
      } catch {
        data = {};
      }

      if (!res.ok || !data.questions || data.questions.length === 0) {
        setErrorMsg(
          data.error ??
            'Chưa thể tạo câu hỏi từ AI ngay lúc này. Vui lòng thử bấm tạo lại.'
        );
        return;
      }

      setDrafts(data.questions.map((q) => ({ ...q, _selected: true })));
      if (!isStaff) {
        setShowConfigPanel(false);
      }
    } catch (err: unknown) {
      const isAbort =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError');
      if (isAbort) {
        setErrorMsg(
          'Yêu cầu tạo câu hỏi mất quá nhiều thời gian. Hãy thử chọn 5 câu hoặc bấm tạo lại.'
        );
      } else {
        setErrorMsg('Không thể kết nối máy chủ tạo câu hỏi AI. Vui lòng thử lại.');
      }
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const selectedCount = drafts.filter((d) => d._selected).length;
  const answeredCount = Object.keys(studentAnswers).length;
  const correctCount = drafts.reduce((acc, q, idx) => {
    return acc + (studentAnswers[idx] === q.correctIndex ? 1 : 0);
  }, 0);

  const handleSaveSelected = () => {
    const toSave = drafts
      .filter((d) => d._selected)
      .map(({ _selected: _, ...rest }) => rest);
    if (toSave.length === 0) return;

    onSaveQuestions(toSave);
    setSavedCurrentBatch(true);
    setSavedNotice(
      `Đã lưu ${toSave.length} câu hỏi Tin học ${grade} mới vào ngân hàng! Tất cả các Trò chơi & Luyện tập sẽ ưu tiên dùng câu mới.`
    );
    if (isStaff) {
      setDrafts([]);
      setStudentAnswers({});
    }
  };

  const handleSelectOption = (questionIdx: number, optionIdx: number) => {
    setStudentAnswers((prev) => {
      if (prev[questionIdx] !== undefined) return prev;
      return { ...prev, [questionIdx]: optionIdx };
    });
  };

  const activeQuestion = drafts[activeIdx] ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#163A70]/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-gen-title"
    >
      <div className="w-full max-w-3xl max-h-[92vh] bg-white rounded-3xl border border-[#C6E4FD] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-[#E0F2FE] via-[#EEF6FF] to-[#F5F3FF] border-b border-[#D8E7FA] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] flex items-center justify-center text-white shadow-xs shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="ai-gen-title"
                className="text-base sm:text-lg font-extrabold text-[#163A70]"
              >
                Tạo câu hỏi trắc nghiệm mới bằng AI
              </h2>
              <p className="text-xs text-[#4B6384]">
                {isStaff
                  ? 'Tự động sinh câu hỏi không trùng lặp — dùng ngay cho mọi Trò chơi & Luyện tập.'
                  : 'Chọn chủ đề và bấm tạo câu hỏi — đáp án chỉ hiện sau khi em chọn câu trả lời.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[#647899] hover:bg-white/80 hover:text-[#163A70]"
            aria-label="Đóng cửa sổ tạo câu hỏi AI"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Controls Panel (collapsible once student has generated questions so Q1 fits 1 screen) */}
          {(showConfigPanel || drafts.length === 0 || isStaff) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-[#F8FBFF] border border-[#DCE8F8] rounded-2xl p-4">
              {/* Grade Picker */}
              <div>
                <label className="block text-xs font-extrabold text-[#163A70] mb-1.5">
                  1. Khối lớp ({existingGradeQuestions.length} câu hiện có)
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {GRADES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => {
                        setGrade(g);
                        setTopic('Tất cả chủ đề');
                      }}
                      className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                        grade === g
                          ? 'bg-[#2563EB] text-white border-[#2563EB]'
                          : 'bg-white text-[#4B6384] border-[#D8E5F7] hover:border-[#2563EB]'
                      }`}
                    >
                      Lớp {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Count Picker */}
              <div>
                <label className="block text-xs font-extrabold text-[#163A70] mb-1.5">
                  2. Số câu hỏi cần tạo thêm
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[5, 10, 15].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCount(n)}
                      className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                        count === n
                          ? 'bg-[#7C3AED] text-white border-[#7C3AED]'
                          : 'bg-white text-[#4B6384] border-[#D8E5F7] hover:border-[#7C3AED]'
                      }`}
                    >
                      +{n} câu mới
                    </button>
                  ))}
                </div>
              </div>

              {/* Topic Picker */}
              <div>
                <label
                  htmlFor="ai-topic-select"
                  className="block text-xs font-extrabold text-[#163A70] mb-1.5"
                >
                  3. Chủ đề kiến thức
                </label>
                <select
                  id="ai-topic-select"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#D8E5F7] bg-white text-xs sm:text-sm font-semibold text-[#163A70] focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="Tất cả chủ đề">Tất cả chủ đề Tin học {grade}</option>
                  {topicsForGrade.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Difficulty Picker */}
              <div>
                <label
                  htmlFor="ai-diff-select"
                  className="block text-xs font-extrabold text-[#163A70] mb-1.5"
                >
                  4. Mức độ câu hỏi
                </label>
                <select
                  id="ai-diff-select"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as 'mixed' | Difficulty)}
                  className="w-full px-3 py-2 rounded-xl border border-[#D8E5F7] bg-white text-xs sm:text-sm font-semibold text-[#163A70] focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="mixed">Hỗn hợp (Nhận biết · Thông hiểu · Vận dụng)</option>
                  <option value="easy">Nhận biết (Dễ)</option>
                  <option value="medium">Thông hiểu (Trung bình)</option>
                  <option value="hard">Vận dụng (Khó)</option>
                </select>
              </div>

              {/* Optional Custom Focus */}
              <div className="sm:col-span-2">
                <label
                  htmlFor="ai-custom-focus"
                  className="block text-xs font-extrabold text-[#163A70] mb-1.5"
                >
                  5. Yêu cầu bài học cụ thể (không bắt buộc)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="ai-custom-focus"
                    type="text"
                    value={customFocus}
                    onChange={(e) => setCustomFocus(e.target.value)}
                    placeholder="Ví dụ: Công thức Excel SUMIF/COUNTIF, Vòng lặp Scratch, An toàn mật khẩu..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#D8E5F7] bg-white text-xs sm:text-sm text-[#163A70] focus:outline-none focus:border-[#2563EB]"
                  />
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleGenerate}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] hover:opacity-95 disabled:opacity-55 text-white text-xs sm:text-sm font-extrabold whitespace-nowrap shrink-0 transition-opacity"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        AI đang soạn câu hỏi...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4" />
                        Tạo {count} câu hỏi AI
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-[#FFF1F2] border border-[#FECDD3] text-xs sm:text-sm font-semibold text-[#BE123C]">
              {errorMsg}
            </div>
          )}

          {savedNotice && (
            <div className="p-3.5 rounded-2xl bg-[#ECFDF5] border border-[#A7F3D0] text-xs sm:text-sm font-bold text-[#047857] flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{savedNotice}</span>
            </div>
          )}

          {/* ==================== STUDENT INTERACTIVE STUDY MODE (NO ANSWERS REVEALED UNTIL CLICKED) ==================== */}
          {drafts.length > 0 && !isStaff && activeQuestion && (
            <div className="space-y-3.5">
              {/* Top Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F4F9FF] border border-[#DCE8F8] rounded-2xl px-4 py-2.5">
                <div className="text-xs sm:text-sm font-extrabold text-[#163A70] tabular-nums">
                  Bộ {drafts.length} câu AI · Lớp {grade} · Đã làm {answeredCount}/
                  {drafts.length} ({correctCount} đúng)
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowConfigPanel((prev) => !prev)}
                    className="px-3 py-1.5 rounded-xl bg-white border border-[#DCE8F8] hover:border-[#2563EB] text-xs font-bold text-[#163A70] transition-colors"
                  >
                    {showConfigPanel ? 'Ẩn tùy chọn' : 'Tạo bộ câu mới'}
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveSelected}
                    disabled={savedCurrentBatch}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      savedCurrentBatch
                        ? 'bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]'
                        : 'bg-[#059669] hover:bg-[#047857] text-white'
                    }`}
                  >
                    {savedCurrentBatch ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Đã lưu vào kho học tập
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        Lưu vào kho Luyện tập &amp; Trò chơi
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Compact Question Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {drafts.map((q, idx) => {
                  const chosen = studentAnswers[idx];
                  const isAnswered = chosen !== undefined;
                  const isRight = isAnswered && chosen === q.correctIndex;
                  const isCur = idx === activeIdx;

                  let pillCls =
                    'bg-[#F4F8FF] text-[#647899] border-[#DCE8F8] hover:text-[#163A70]';
                  if (isCur) {
                    pillCls = 'bg-[#2563EB] text-white border-[#2563EB]';
                  } else if (isAnswered) {
                    pillCls = isRight
                      ? 'bg-[#ECFDF5] text-[#047857] border-[#6EE7B7]'
                      : 'bg-[#FFF1F2] text-[#BE123C] border-[#FECDD3]';
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveIdx(idx)}
                      className={`w-8 h-8 rounded-lg border text-xs font-bold tabular-nums transition-colors ${pillCls}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              {/* 1-Screen Interactive Question Card */}
              <div className="bg-white rounded-2xl border border-[#DCE8F8] p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                  <span className="text-[#2563EB]">
                    Câu {activeIdx + 1}/{drafts.length} · {activeQuestion.topic}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md bg-[#F3E8FF] text-[#7C3AED]">
                    {getDiffLabel(activeQuestion.difficulty)}
                  </span>
                </div>

                <div className="text-base font-extrabold text-[#163A70] leading-snug">
                  {activeQuestion.prompt}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activeQuestion.options.map((opt, oIdx) => {
                    const chosen = studentAnswers[activeIdx];
                    const isRevealed = chosen !== undefined;
                    const isSelected = chosen === oIdx;
                    const isCorrect = oIdx === activeQuestion.correctIndex;

                    let btnCls =
                      'bg-white border-[#D8E6F8] hover:border-[#2563EB] hover:bg-[#F3F8FF] text-[#1A2B49]';
                    let badgeCls = 'bg-[#EEF5FF] text-[#163A70]';

                    if (isRevealed) {
                      if (isCorrect) {
                        btnCls = 'bg-[#ECFDF5] border-[#10B981] text-[#065F46]';
                        badgeCls = 'bg-[#10B981] text-white';
                      } else if (isSelected && !isCorrect) {
                        btnCls = 'bg-[#FFF1F2] border-[#F43F5E] text-[#9F1239]';
                        badgeCls = 'bg-[#F43F5E] text-white';
                      } else {
                        btnCls = 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B]';
                        badgeCls = 'bg-[#E2E8F0] text-[#64748B]';
                      }
                    }

                    return (
                      <button
                        key={oIdx}
                        type="button"
                        disabled={isRevealed}
                        onClick={() => handleSelectOption(activeIdx, oIdx)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors touch-manipulation cursor-pointer select-none ${btnCls}`}
                      >
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 ${badgeCls}`}
                        >
                          {LETTERS[oIdx]}
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

                {/* Explanation appears ONLY after student selects an option */}
                {studentAnswers[activeIdx] !== undefined ? (
                  <div
                    className={`p-3 rounded-xl border text-xs sm:text-sm leading-snug ${
                      studentAnswers[activeIdx] === activeQuestion.correctIndex
                        ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
                        : 'bg-[#FFF7ED] border-[#FED7AA] text-[#9A3412]'
                    }`}
                  >
                    <div className="font-extrabold mb-0.5">
                      {studentAnswers[activeIdx] === activeQuestion.correctIndex
                        ? 'Chính xác!'
                        : `Chưa đúng — Đáp án đúng là ${LETTERS[activeQuestion.correctIndex]}.`}
                    </div>
                    <div>
                      <span className="font-bold">Giải thích: </span>
                      {activeQuestion.explanation}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-[#647899] italic">
                    Chọn một đáp án A, B, C hoặc D để kiểm tra kết quả và xem lời giải thích.
                  </div>
                )}

                {/* Prev / Next / Retry Footer */}
                <div className="pt-3 border-t border-[#EDF4FC] flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={activeIdx === 0}
                    onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#DCE8F8] text-xs font-bold text-[#163A70] disabled:opacity-40 hover:bg-[#F4F9FF]"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Câu trước
                  </button>

                  <div className="flex items-center gap-2">
                    {answeredCount === drafts.length && (
                      <button
                        type="button"
                        onClick={() => {
                          setStudentAnswers({});
                          setActiveIdx(0);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#DCE8F8] bg-[#F4F9FF] hover:bg-[#E0F2FE] text-xs font-bold text-[#163A70]"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Làm lại
                      </button>
                    )}

                    {activeIdx + 1 < drafts.length && (
                      <button
                        type="button"
                        onClick={() => setActiveIdx((i) => Math.min(drafts.length - 1, i + 1))}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold"
                      >
                        Câu tiếp theo
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== TEACHER / ADMIN REVIEW LIST ==================== */}
          {drafts.length > 0 && isStaff && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-extrabold text-[#163A70]">
                  Xem trước {drafts.length} câu hỏi AI vừa tạo (đã chọn {selectedCount})
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStaffShowAnswers((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#DCE8F8] hover:border-[#2563EB] text-xs font-bold text-[#163A70]"
                  >
                    {staffShowAnswers ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        Ẩn đáp án
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        Hiện đáp án (GV)
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSelected}
                    disabled={selectedCount === 0}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] disabled:opacity-45 text-white text-xs sm:text-sm font-bold transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Lưu {selectedCount} câu vào ngân hàng ngay
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {drafts.map((item, idx) => {
                  const chosen = studentAnswers[idx];
                  const revealThis = staffShowAnswers || chosen !== undefined;
                  return (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-2xl border transition-colors ${
                        item._selected
                          ? 'bg-white border-[#BFDBFE]'
                          : 'bg-[#F8FAFC] border-[#E2E8F0] opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                            <span className="text-[#2563EB]">Câu {idx + 1}</span>
                            <span className="text-[#94A3B8]">·</span>
                            <span className="text-[#7C3AED]">{item.topic}</span>
                            <span className="text-[#94A3B8]">·</span>
                            <span className="text-[#647899]">
                              {getDiffLabel(item.difficulty)}
                            </span>
                          </div>
                          <div className="text-sm font-bold text-[#163A70] leading-snug">
                            {item.prompt}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setDrafts((prev) =>
                              prev.map((d, i) =>
                                i === idx ? { ...d, _selected: !d._selected } : d
                              )
                            )
                          }
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border inline-flex items-center gap-1 shrink-0 ${
                            item._selected
                              ? 'bg-[#ECFDF5] border-[#10B981] text-[#047857]'
                              : 'bg-white border-[#CBD5E1] text-[#647899]'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                          {item._selected ? 'Chọn lưu' : 'Bỏ qua'}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2.5 text-xs">
                        {item.options.map((opt, oIdx) => {
                          const isAns = oIdx === item.correctIndex;
                          const isPickedWrong = chosen === oIdx && !isAns;
                          return (
                            <button
                              key={oIdx}
                              type="button"
                              onClick={() => handleSelectOption(idx, oIdx)}
                              className={`px-2.5 py-2 rounded-lg border text-left transition-colors touch-manipulation cursor-pointer ${
                                revealThis && isAns
                                  ? 'bg-[#ECFDF5] border-[#6EE7B7] text-[#065F46] font-bold'
                                  : isPickedWrong
                                    ? 'bg-[#FFF1F2] border-[#FECDD3] text-[#9F1239] font-bold'
                                    : 'bg-[#F8FBFF] border-[#E2ECF9] text-[#475569] hover:border-[#2563EB]'
                              }`}
                            >
                              <strong className="mr-1">{LETTERS[oIdx]}.</strong>
                              {opt}
                            </button>
                          );
                        })}
                      </div>

                      {revealThis && (
                        <div className="mt-2 text-[11px] text-[#647899]">
                          <strong className="text-[#163A70]">Giải thích: </strong>
                          {item.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#F8FBFF] border-t border-[#E2ECF9] flex items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-[#647899]">
            {isStaff
              ? 'Câu hỏi AI được lưu vào ngân hàng và ưu tiên xuất hiện trước để không bị lặp lại.'
              : 'Chọn đáp án ở từng câu để tự kiểm tra kiến thức và xem giải thích chi tiết.'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-[#DCE8F8] hover:bg-[#EFF6FF] text-xs font-bold text-[#163A70] shrink-0"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
