import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Question, TrueFalse4Question } from '../types';

const LETTERS = ['A', 'B', 'C', 'D'] as const;
const TF_LABELS = ['Đ', 'S'] as const;

interface McqModalProps {
  mode: 'mcq';
  question: Question;
  badgeText: string;
  accentColor?: string;
  eliminatedIndices?: number[];
  hintText?: string;
  onResult: (result: {
    isCorrect: boolean;
    thinkSeconds: number;
    selectedIndex: number;
  }) => void;
}

interface Tf4ModalProps {
  mode: 'tf4';
  question: TrueFalse4Question;
  badgeText: string;
  accentColor?: string;
  onResult: (result: {
    isCorrect: boolean;
    correctStatements: number;
    thinkSeconds: number;
  }) => void;
}

type CompactQuestionModalProps = McqModalProps | Tf4ModalProps;

export default function CompactQuestionModal(props: CompactQuestionModalProps) {
  const startTimeRef = useRef<number>(Date.now());
  const [mcqChoice, setMcqChoice] = useState<number | null>(null);
  const [tfChoices, setTfChoices] = useState<(boolean | null)[]>([null, null, null, null]);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    startTimeRef.current = Date.now();
    setMcqChoice(null);
    setTfChoices([null, null, null, null]);
    setSubmitted(false);
  }, [props.question.id]);

  // Compact 1-screen MCQ handler
  const handlePickMcq = (idx: number) => {
    if (props.mode !== 'mcq' || submitted) return;
    const thinkSeconds = (Date.now() - startTimeRef.current) / 1000;
    setMcqChoice(idx);
    setSubmitted(true);
    const isCorrect = idx === props.question.correctIndex;
    window.setTimeout(() => {
      props.onResult({ isCorrect, thinkSeconds, selectedIndex: idx });
    }, 950);
  };

  // Compact 1-screen True/False 4-statement submit
  const handleSubmitTf4 = () => {
    if (props.mode !== 'tf4' || submitted) return;
    if (tfChoices.some((c) => c === null)) return;
    const thinkSeconds = (Date.now() - startTimeRef.current) / 1000;
    const correctStatements = props.question.statements.reduce(
      (acc, st, i) => acc + (tfChoices[i] === st.isTrue ? 1 : 0),
      0
    );
    setSubmitted(true);
    const isCorrect = correctStatements === 4;
    window.setTimeout(() => {
      props.onResult({ isCorrect, correctStatements, thinkSeconds });
    }, 1150);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-[#163A70]/65"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-[#DCE8F8] shadow-2xl p-4 sm:p-5 space-y-3">
        {/* Top meta bar */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <span
            className="font-bold"
            style={{ color: props.accentColor ?? '#2563EB' }}
          >
            {props.badgeText}
          </span>
          <div className="flex items-center gap-2 min-w-0">
            {props.mode === 'mcq' &&
              (props.question.questionType === 'true-false' ||
                props.question.options.length === 2) && (
                <span className="px-2 py-0.5 rounded-md bg-[#FEF3C7] text-[#B45309] font-bold shrink-0">
                  Đúng / Sai
                </span>
              )}
            <span className="text-[#647899] truncate">{props.question.topic}</span>
          </div>
        </div>

        {/* Question Prompt */}
        <h3 className="text-sm sm:text-base font-bold text-[#163A70] leading-snug">
          {props.question.prompt}
        </h3>

        {/* Optional Hint Strip (e.g., Torch tool in Treasure Hunt) */}
        {props.mode === 'mcq' && props.hintText && !submitted && (
          <div className="px-3 py-1.5 rounded-xl bg-[#FEF9C3] border border-[#FDE047] text-xs font-semibold text-[#854D0E]">
            🔦 Gợi ý: {props.hintText}
          </div>
        )}

        {/* MCQ 2x2 Compact Grid (always fits 1 screen without scrolling!) */}
        {props.mode === 'mcq' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {props.question.options.map((opt, idx) => {
              const isEliminated = props.eliminatedIndices?.includes(idx) ?? false;
              const isSelected = mcqChoice === idx;
              const isCorrect = idx === props.question.correctIndex;
              let btnStyle =
                'bg-[#F8FBFF] border-[#DCE8F8] hover:border-[#2563EB] hover:bg-[#EEF6FF] text-[#1A2B49]';
              let badgeStyle = 'bg-white text-[#163A70] border border-[#DCE8F8]';

              if (isEliminated && !submitted) {
                btnStyle =
                  'bg-[#F8FAFC] border-[#E8EFF8] text-[#B0BDCE] line-through opacity-55 cursor-not-allowed';
                badgeStyle = 'bg-[#EDF2F9] text-[#B0BDCE] border border-[#E2E8F0]';
              } else if (submitted) {
                if (isCorrect) {
                  btnStyle = 'bg-[#ECFDF5] border-[#10B981] text-[#065F46]';
                  badgeStyle = 'bg-[#10B981] text-white border-[#10B981]';
                } else if (isSelected && !isCorrect) {
                  btnStyle = 'bg-[#FEF2F2] border-[#EF4444] text-[#991B1B]';
                  badgeStyle = 'bg-[#EF4444] text-white border-[#EF4444]';
                } else {
                  btnStyle = 'bg-[#F8FAFC] border-[#E8EFF8] text-[#94A3B8]';
                }
              }

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={submitted || isEliminated}
                  onClick={() => handlePickMcq(idx)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors touch-manipulation cursor-pointer select-none ${btnStyle}`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 ${badgeStyle}`}
                  >
                    {props.question.questionType === 'true-false' ||
                    props.question.options.length === 2
                      ? TF_LABELS[idx] ?? LETTERS[idx]
                      : LETTERS[idx]}
                  </span>
                  <span className="text-xs sm:text-sm font-medium leading-snug flex-1">
                    {opt}
                  </span>
                  {submitted && isCorrect && (
                    <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                  )}
                  {submitted && isSelected && !isCorrect && (
                    <XCircle className="w-4 h-4 text-[#EF4444] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* True/False 4-Statement Compact Rows */}
        {props.mode === 'tf4' && (
          <div className="space-y-2">
            {props.question.statements.map((st, idx) => {
              const choice = tfChoices[idx];
              const isRight = submitted && choice === st.isTrue;
              const isWrong = submitted && choice !== st.isTrue;
              return (
                <div
                  key={idx}
                  className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border ${
                    isRight
                      ? 'bg-[#ECFDF5] border-[#10B981]'
                      : isWrong
                        ? 'bg-[#FEF2F2] border-[#EF4444]'
                        : 'bg-[#F8FBFF] border-[#DCE8F8]'
                  }`}
                >
                  <span className="text-xs sm:text-sm font-medium text-[#1A2B49] leading-snug flex-1">
                    <strong className="text-[#2563EB] mr-1">{LETTERS[idx].toLowerCase()})</strong>
                    {st.text}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={submitted}
                      onClick={() =>
                        setTfChoices((prev) => prev.map((v, i) => (i === idx ? true : v)))
                      }
                      className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors touch-manipulation cursor-pointer ${
                        choice === true
                          ? 'bg-[#10B981] text-white border-[#10B981]'
                          : 'bg-white text-[#475569] border-[#CBD5E1] hover:border-[#10B981]'
                      }`}
                    >
                      Đúng
                    </button>
                    <button
                      type="button"
                      disabled={submitted}
                      onClick={() =>
                        setTfChoices((prev) => prev.map((v, i) => (i === idx ? false : v)))
                      }
                      className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors touch-manipulation cursor-pointer ${
                        choice === false
                          ? 'bg-[#EF4444] text-white border-[#EF4444]'
                          : 'bg-white text-[#475569] border-[#CBD5E1] hover:border-[#EF4444]'
                      }`}
                    >
                      Sai
                    </button>
                  </div>
                </div>
              );
            })}

            {!submitted && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={tfChoices.some((c) => c === null)}
                  onClick={handleSubmitTf4}
                  className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white text-xs sm:text-sm font-bold transition-colors"
                >
                  Xác nhận cả 4 ý
                </button>
              </div>
            )}
          </div>
        )}

        {/* Instant compact explanation footer */}
        {submitted && (
          <div className="px-3 py-2 rounded-xl bg-[#F1F7FF] text-xs text-[#334155] leading-snug">
            <strong className="text-[#163A70]">Giải thích: </strong>
            {props.question.explanation}
          </div>
        )}
      </div>
    </div>
  );
}
