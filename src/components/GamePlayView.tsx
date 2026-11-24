import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Crown,
  Flame,
  Gem,
  Heart,
  RotateCcw,
  Shield,
  Sparkles,
  Trophy,
  XCircle,
  Zap,
} from 'lucide-react';
import { GAMES_LIST, getArenaRank, TREASURE_GEMS } from '../../data/games';
import { pickRandomQuestions } from '../../data/questionBank';
import {
  AnswerReviewItem,
  Difficulty,
  GameId,
  Grade,
  Question,
  SessionRecord,
} from '../types';

interface GamePlayViewProps {
  gameId: GameId;
  grade: Grade;
  customQuestions: Question[];
  onExit: () => void;
  onCompleteSession: (
    session: Omit<SessionRecord, 'id' | 'completedAt'>,
    topicBreakdown: { grade: Grade; topic: string; isCorrect: boolean }[]
  ) => void;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;
const SPEED_SECONDS_PER_Q = 15;
const SURVIVAL_INITIAL_HEARTS = 3;

function getArenaPoints(difficulty: Difficulty): number {
  if (difficulty === 'hard') return 20;
  if (difficulty === 'medium') return 15;
  return 10;
}

function getDifficultyLabel(difficulty: Difficulty): string {
  if (difficulty === 'hard') return 'Vận dụng';
  if (difficulty === 'medium') return 'Thông hiểu';
  return 'Nhận biết';
}

export default function GamePlayView({
  gameId,
  grade,
  customQuestions,
  onExit,
  onCompleteSession,
}: GamePlayViewProps) {
  const gameMeta = useMemo(
    () => GAMES_LIST.find((g) => g.id === gameId) ?? GAMES_LIST[0],
    [gameId]
  );

  const buildQuestionSet = useCallback((): Question[] => {
    const ascending = gameId === 'school-survival' || gameId === 'sage-arena';
    return pickRandomQuestions(grade, gameMeta.questionCount, {
      ascendingDifficulty: ascending,
      customQuestions,
    });
  }, [customQuestions, gameId, grade, gameMeta.questionCount]);

  const [questions, setQuestions] = useState<Question[]>(() => buildQuestionSet());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  // Shared stats
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [reviews, setReviews] = useState<AnswerReviewItem[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Game 1: Speed Race timer
  const [speedCountdown, setSpeedCountdown] = useState(SPEED_SECONDS_PER_Q);

  // Game 2: Streak Challenge
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  // Game 3: Knowledge Treasure
  const [unlockedGems, setUnlockedGems] = useState(0);

  // Game 4: School Survival
  const [hearts, setHearts] = useState(SURVIVAL_INITIAL_HEARTS);
  const [usedFiftyFifty, setUsedFiftyFifty] = useState(false);
  const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([]);

  // Game 5: Sage Arena
  const [usedDoubleBoost, setUsedDoubleBoost] = useState(false);
  const [doubleBoostActive, setDoubleBoostActive] = useState(false);

  const [showReviewList, setShowReviewList] = useState(false);
  const hasRecordedRef = useRef(false);

  const currentQuestion = questions[currentIndex];

  // Overall game clock
  useEffect(() => {
    if (isFinished) return;
    const id = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [isFinished]);

  const finalizeGame = useCallback(
    (
      finalReviews: AnswerReviewItem[],
      finalScore: number,
      finalCorrect: number,
      finalBestStreak: number,
      finalGems: number,
      finalElapsed: number
    ) => {
      setIsFinished(true);
      if (hasRecordedRef.current) return;
      hasRecordedRef.current = true;

      const maxScore =
        gameId === 'sage-arena'
          ? questions.reduce((acc, q) => acc + getArenaPoints(q.difficulty), 0)
          : questions.length * 10;

      const rankTitle =
        gameId === 'sage-arena' ? getArenaRank(finalScore).title : undefined;

      onCompleteSession(
        {
          type: 'game',
          title: gameMeta.title,
          gameId,
          grade,
          score: finalScore,
          maxScore,
          correctCount: finalCorrect,
          totalQuestions: finalReviews.length,
          durationSeconds: Math.max(1, finalElapsed),
          bestStreak: gameId === 'streak-challenge' ? finalBestStreak : undefined,
          gemsUnlocked: gameId === 'knowledge-treasure' ? finalGems : undefined,
          rankTitle,
        },
        finalReviews.map((r) => ({
          grade: r.question.grade,
          topic: r.question.topic,
          isCorrect: r.isCorrect,
        }))
      );
    },
    [gameId, gameMeta.title, grade, onCompleteSession, questions]
  );

  const handleSelectAnswer = useCallback(
    (optionIndex: number | null) => {
      if (isRevealed || isFinished || !currentQuestion) return;

      const isCorrect = optionIndex === currentQuestion.correctIndex;
      setSelectedOption(optionIndex);
      setIsRevealed(true);

      let pointsEarned = 0;
      if (isCorrect) {
        if (gameId === 'sage-arena') {
          const base = getArenaPoints(currentQuestion.difficulty);
          pointsEarned = doubleBoostActive ? base * 2 : base;
        } else {
          pointsEarned = 10;
        }
      }

      if (doubleBoostActive) {
        setDoubleBoostActive(false);
        setUsedDoubleBoost(true);
      }

      const nextScore = score + pointsEarned;
      const nextCorrect = correctCount + (isCorrect ? 1 : 0);
      setScore(nextScore);
      setCorrectCount(nextCorrect);

      let nextBestStreak = bestStreak;
      if (gameId === 'streak-challenge') {
        if (isCorrect) {
          const nextCur = currentStreak + 1;
          setCurrentStreak(nextCur);
          nextBestStreak = Math.max(bestStreak, nextCur);
          setBestStreak(nextBestStreak);
        } else {
          setCurrentStreak(0);
        }
      }

      let nextGems = unlockedGems;
      if (gameId === 'knowledge-treasure' && isCorrect) {
        nextGems = unlockedGems + 1;
        setUnlockedGems(nextGems);
      }

      let nextHearts = hearts;
      if (gameId === 'school-survival' && !isCorrect) {
        nextHearts = Math.max(0, hearts - 1);
        setHearts(nextHearts);
      }

      const newReview: AnswerReviewItem = {
        question: currentQuestion,
        selectedIndex: optionIndex,
        isCorrect,
        pointsEarned,
      };
      const updatedReviews = [...reviews, newReview];
      setReviews(updatedReviews);

      // If survival ran out of hearts, keep revealed state so student sees explanation before clicking finish
      if (gameId === 'school-survival' && nextHearts === 0) {
        // handled when clicking "Xem kết quả"
      }
    },
    [
      bestStreak,
      correctCount,
      currentQuestion,
      currentStreak,
      doubleBoostActive,
      gameId,
      hearts,
      isFinished,
      isRevealed,
      reviews,
      score,
      unlockedGems,
    ]
  );

  // Speed Race countdown timer
  useEffect(() => {
    if (gameId !== 'speed-race' || isRevealed || isFinished) return;
    if (speedCountdown <= 0) {
      handleSelectAnswer(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setSpeedCountdown((prev) => prev - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [gameId, handleSelectAnswer, isFinished, isRevealed, speedCountdown]);

  const handleNext = useCallback(() => {
    if (!isRevealed) return;
    const survivalOut = gameId === 'school-survival' && hearts <= 0;
    const reachedEnd = currentIndex + 1 >= questions.length;

    if (survivalOut || reachedEnd) {
      finalizeGame(
        reviews,
        score,
        correctCount,
        bestStreak,
        unlockedGems,
        elapsedSeconds
      );
      return;
    }

    setCurrentIndex((prev) => prev + 1);
    setSelectedOption(null);
    setIsRevealed(false);
    setEliminatedOptions([]);
    setSpeedCountdown(SPEED_SECONDS_PER_Q);
  }, [
    bestStreak,
    correctCount,
    currentIndex,
    elapsedSeconds,
    finalizeGame,
    gameId,
    hearts,
    isRevealed,
    questions.length,
    reviews,
    score,
    unlockedGems,
  ]);

  // Keyboard shortcuts (1-4 / A-D to answer, Enter to advance)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isFinished) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (!isRevealed) {
        const keyMap: Record<string, number> = {
          '1': 0,
          '2': 1,
          '3': 2,
          '4': 3,
          a: 0,
          b: 1,
          c: 2,
          d: 3,
        };
        const idx = keyMap[e.key.toLowerCase()];
        if (
          idx !== undefined &&
          currentQuestion &&
          idx < currentQuestion.options.length &&
          !eliminatedOptions.includes(idx)
        ) {
          e.preventDefault();
          handleSelectAnswer(idx);
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [eliminatedOptions, handleNext, handleSelectAnswer, isFinished, isRevealed]);

  const handleReplay = () => {
    hasRecordedRef.current = false;
    setQuestions(buildQuestionSet());
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsRevealed(false);
    setIsFinished(false);
    setScore(0);
    setCorrectCount(0);
    setReviews([]);
    setElapsedSeconds(0);
    setSpeedCountdown(SPEED_SECONDS_PER_Q);
    setCurrentStreak(0);
    setBestStreak(0);
    setUnlockedGems(0);
    setHearts(SURVIVAL_INITIAL_HEARTS);
    setUsedFiftyFifty(false);
    setEliminatedOptions([]);
    setUsedDoubleBoost(false);
    setDoubleBoostActive(false);
    setShowReviewList(false);
  };

  const handleUseFiftyFifty = () => {
    if (usedFiftyFifty || isRevealed || !currentQuestion || currentQuestion.options.length <= 2) return;
    const wrongIndices = currentQuestion.options
      .map((_, i) => i)
      .filter((i) => i !== currentQuestion.correctIndex);
    // Shuffle and eliminate 2 wrong options
    const shuffled = [...wrongIndices].sort(() => Math.random() - 0.5);
    setEliminatedOptions(shuffled.slice(0, 2));
    setUsedFiftyFifty(true);
  };

  // ==================== FINISHED SUMMARY VIEW ====================
  if (isFinished) {
    const accuracy =
      reviews.length > 0 ? Math.round((correctCount / reviews.length) * 100) : 0;
    const arenaRank = getArenaRank(score);
    const chestOpened = unlockedGems >= 5;
    const survivedAll = gameId === 'school-survival' && hearts > 0 && reviews.length === questions.length;

    let headline = 'Hoàn thành xuất sắc thử thách!';
    if (gameId === 'school-survival' && hearts === 0) {
      headline = 'Hết mạng sinh tồn – Hãy thử lại nhé!';
    } else if (gameId === 'knowledge-treasure' && chestOpened) {
      headline = 'Chúc mừng! Bạn đã mở khóa Rương Kho Báu Vàng!';
    } else if (accuracy < 50) {
      headline = 'Cố gắng thêm chút nữa nhé!';
    }

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div
          style={{ backgroundColor: gameMeta.bgColor, borderColor: gameMeta.borderColor }}
          className="rounded-2xl border p-6 sm:p-8 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-white mx-auto mb-4 flex items-center justify-center text-3xl shadow-xs">
            <span>{gameMeta.emoji}</span>
          </div>
          <div className="text-xs font-semibold mb-1" style={{ color: gameMeta.accentColor }}>
            {gameMeta.title} · Tin học {grade}
          </div>
          <h2 className="text-2xl font-bold text-[#102A56] mb-2">{headline}</h2>
          <p className="text-sm text-[#52627E] max-w-md mx-auto">
            Kết quả lượt chơi đã được tự động lưu vào mục Tiến bộ của tôi để theo dõi mức độ thành thạo từng chủ đề.
          </p>

          {/* Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            <div className="bg-white rounded-xl p-4 border border-black/5">
              <div className="text-xs text-[#71809A]">Tổng điểm</div>
              <div className="text-2xl font-bold text-[#2864E8] tabular-nums mt-0.5">
                {score}
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-black/5">
              <div className="text-xs text-[#71809A]">Số câu đúng</div>
              <div className="text-2xl font-bold text-[#159B72] tabular-nums mt-0.5">
                {correctCount}/{reviews.length}
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-black/5">
              <div className="text-xs text-[#71809A]">Độ chính xác</div>
              <div className="text-2xl font-bold text-[#102A56] tabular-nums mt-0.5">
                {accuracy}%
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-black/5">
              {gameId === 'speed-race' && (
                <>
                  <div className="text-xs text-[#71809A]">Thời gian về đích</div>
                  <div className="text-2xl font-bold text-[#E7A23B] tabular-nums mt-0.5">
                    {elapsedSeconds}s
                  </div>
                </>
              )}
              {gameId === 'streak-challenge' && (
                <>
                  <div className="text-xs text-[#71809A]">Chuỗi đúng cao nhất</div>
                  <div className="text-2xl font-bold text-[#D95B67] tabular-nums mt-0.5">
                    {bestStreak} câu
                  </div>
                </>
              )}
              {gameId === 'knowledge-treasure' && (
                <>
                  <div className="text-xs text-[#71809A]">Viên ngọc mở khóa</div>
                  <div className="text-2xl font-bold text-[#0E7CA8] tabular-nums mt-0.5">
                    {unlockedGems}/{questions.length}
                  </div>
                </>
              )}
              {gameId === 'school-survival' && (
                <>
                  <div className="text-xs text-[#71809A]">Trái tim còn lại</div>
                  <div className="text-2xl font-bold text-[#159B72] tabular-nums mt-0.5">
                    {survivedAll ? `${hearts}/${SURVIVAL_INITIAL_HEARTS}` : '0/3'}
                  </div>
                </>
              )}
              {gameId === 'sage-arena' && (
                <>
                  <div className="text-xs text-[#71809A]">Danh hiệu đạt được</div>
                  <div className="text-base font-bold text-[#5B45C6] mt-1.5 leading-tight">
                    {arenaRank.title}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Treasure gem showcase */}
          {gameId === 'knowledge-treasure' && (
            <div className="mt-5 pt-5 border-t border-black/8">
              <div className="text-xs font-semibold text-[#102A56] mb-3">
                Bộ sưu tập ngọc tri thức trong lượt chơi
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {TREASURE_GEMS.slice(0, questions.length).map((gem, idx) => {
                  const unlocked = idx < unlockedGems;
                  return (
                    <div
                      key={gem.name}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border ${
                        unlocked
                          ? 'bg-white border-[#BEE5F7] text-[#102A56]'
                          : 'bg-white/40 border-dashed border-[#B9D3E4] text-[#8FA2BC]'
                      }`}
                    >
                      <Gem
                        className="w-3.5 h-3.5"
                        style={{ color: unlocked ? gem.color : '#B0C0D4' }}
                      />
                      <span>{gem.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-7">
            <button
              type="button"
              onClick={handleReplay}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2864E8] hover:bg-[#1E53C9] text-white text-sm font-semibold transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Chơi lại lượt mới
            </button>
            <button
              type="button"
              onClick={onExit}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white hover:bg-[#F4F7FC] text-[#102A56] border border-[#D4DFEE] text-sm font-semibold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Chọn trò chơi khác
            </button>
          </div>
        </div>

        {/* Review Accordion */}
        <div className="bg-white rounded-2xl border border-[#E4EBF5] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowReviewList((prev) => !prev)}
            className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-[#FAFBFD] transition-colors"
          >
            <div>
              <h3 className="text-base font-bold text-[#102A56]">
                Xem lại chi tiết {reviews.length} câu hỏi vừa trả lời
              </h3>
              <p className="text-xs text-[#71809A] mt-0.5">
                Kiểm tra đáp án đúng và lời giải thích cho từng câu hỏi.
              </p>
            </div>
            <span className="text-sm font-semibold text-[#2864E8] whitespace-nowrap">
              {showReviewList ? 'Thu gọn' : 'Mở xem chi tiết'}
            </span>
          </button>

          {showReviewList && (
            <div className="divide-y divide-[#EDF2F9] border-t border-[#EDF2F9]">
              {reviews.map((item, idx) => (
                <div key={item.question.id} className="p-5 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold text-[#17233C]">
                      Câu {idx + 1}. {item.question.prompt}
                    </div>
                    <span
                      className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                        item.isCorrect ? 'text-[#159B72]' : 'text-[#D95B67]'
                      }`}
                    >
                      {item.isCorrect ? `+${item.pointsEarned} điểm` : 'Chưa đúng'}
                    </span>
                  </div>
                  <div className="text-xs text-[#52627E] space-y-1">
                    <div>
                      Bạn chọn:{' '}
                      <span className="font-semibold text-[#17233C]">
                        {item.selectedIndex === null
                          ? 'Hết giờ chưa chọn'
                          : `${
                              item.question.options.length === 2
                                ? item.selectedIndex === 0
                                  ? 'Đ'
                                  : 'S'
                                : OPTION_LABELS[item.selectedIndex]
                            }. ${item.question.options[item.selectedIndex]}`}
                      </span>
                    </div>
                    {!item.isCorrect && (
                      <div>
                        Đáp án đúng:{' '}
                        <span className="font-semibold text-[#159B72]">
                          {item.question.options.length === 2
                            ? item.question.correctIndex === 0
                              ? 'Đ'
                              : 'S'
                            : OPTION_LABELS[item.question.correctIndex]}
                          . {item.question.options[item.question.correctIndex]}
                        </span>
                      </div>
                    )}
                    <div className="pt-1 text-[#71809A]">
                      Giải thích: {item.question.explanation}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const progressPct = Math.round(
    ((currentIndex + (isRevealed ? 1 : 0)) / questions.length) * 100
  );
  const currentRank = getArenaRank(score);
  const isFinalStep =
    (gameId === 'school-survival' && hearts === 0) ||
    currentIndex + 1 >= questions.length;

  return (
    <div className="max-w-4xl mx-auto space-y-3">
      {/* Top Game Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#647899] hover:text-[#163A70] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại danh sách trò chơi
        </button>

        <div className="flex items-center gap-3 text-xs sm:text-sm font-bold tabular-nums">
          <span className="text-[#647899]">Tin học {grade}</span>
          <span className="text-[#C1CDDF]" aria-hidden="true">·</span>
          <span className="text-[#163A70]">
            Câu {currentIndex + 1}/{questions.length}
          </span>
          <span className="text-[#C1CDDF]" aria-hidden="true">·</span>
          <span className="text-[#2563EB]">{score} điểm</span>
        </div>
      </div>

      {/* Compact Game-Specific Interactive HUD */}
      <div
        style={{ backgroundColor: gameMeta.bgColor, borderColor: gameMeta.borderColor }}
        className="rounded-2xl border px-4 py-3"
      >
        {/* 1. Speed Race HUD */}
        {gameId === 'speed-race' && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-[#163A70]">
                <Zap className="w-4 h-4 text-[#D97706]" />
                <span>Đường đua tốc độ</span>
              </div>
              <div
                className={`flex items-center gap-1.5 text-xs sm:text-sm font-bold tabular-nums ${
                  speedCountdown <= 5 ? 'text-[#E11D48]' : 'text-[#163A70]'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Còn {speedCountdown} giây</span>
              </div>
            </div>
            <div className="relative h-2 bg-white/85 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#2563EB] rounded-full transition-all duration-300"
                style={{ width: `${Math.max(8, progressPct)}%` }}
              />
            </div>
          </div>
        )}

        {/* 2. Streak Challenge HUD */}
        {gameId === 'streak-challenge' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-[#E11D48]" />
              <span className="font-bold text-[#163A70] text-sm">Thử thách chuỗi đúng</span>
            </div>
            <div className="flex items-center gap-4 text-xs sm:text-sm font-bold tabular-nums">
              <span className="text-[#E11D48]">Chuỗi hiện tại: {currentStreak}</span>
              <span className="text-[#163A70]">Cao nhất: {bestStreak}</span>
            </div>
          </div>
        )}

        {/* 3. Knowledge Treasure HUD */}
        {gameId === 'knowledge-treasure' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[#163A70]">
              <Gem className="w-4 h-4 text-[#0284C7]" />
              <span>Kho báu tri thức ({unlockedGems}/{questions.length} ngọc)</span>
            </div>
            <div className="flex items-center gap-1.5">
              {TREASURE_GEMS.slice(0, questions.length).map((gem, idx) => {
                const isUnlocked = idx < unlockedGems;
                return (
                  <div
                    key={gem.name}
                    title={gem.name}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
                      isUnlocked
                        ? 'bg-white border-[#7DD3FC]'
                        : 'bg-white/50 border-dashed border-[#B8D7E8]'
                    }`}
                  >
                    <Gem
                      className="w-3.5 h-3.5"
                      style={{ color: isUnlocked ? gem.color : '#A3BDCE' }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. School Survival HUD */}
        {gameId === 'school-survival' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Shield className="w-4 h-4 text-[#059669]" />
              <span className="font-bold text-[#163A70] text-sm">Sinh tồn học đường</span>
              <div className="flex items-center gap-1" aria-label={`Còn ${hearts} mạng`}>
                {[0, 1, 2].map((i) => (
                  <Heart
                    key={i}
                    className={`w-4 h-4 ${
                      i < hearts
                        ? 'text-[#E11D48] fill-[#E11D48]'
                        : 'text-[#B8C7BE]'
                    }`}
                  />
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleUseFiftyFifty}
              disabled={usedFiftyFifty || isRevealed || currentQuestion.options.length <= 2}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap ${
                usedFiftyFifty || isRevealed || currentQuestion.options.length <= 2
                  ? 'bg-white/50 text-[#91A39B] border-[#CDE0D4] cursor-not-allowed'
                  : 'bg-white text-[#059669] border-[#059669]/40 hover:bg-[#059669] hover:text-white'
              }`}
            >
              {usedFiftyFifty
                ? 'Đã dùng 50/50'
                : currentQuestion.options.length <= 2
                  ? '50/50 (chỉ dùng cho 4 lựa chọn)'
                  : 'Trợ giúp 50/50 (còn 1)'}
            </button>
          </div>
        )}

        {/* 5. Sage Arena HUD */}
        {gameId === 'sage-arena' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[#163A70]">
              <Crown className="w-4 h-4 text-[#7C3AED]" />
              <span>
                Đấu trường · Hạng:{' '}
                <span className="text-[#7C3AED]">{currentRank.title}</span>
              </span>
              <span className="text-xs font-medium text-[#645A8A]">
                ({getDifficultyLabel(currentQuestion.difficulty)} · +
                {doubleBoostActive
                  ? getArenaPoints(currentQuestion.difficulty) * 2
                  : getArenaPoints(currentQuestion.difficulty)}
                đ)
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!usedDoubleBoost && !isRevealed) {
                  setDoubleBoostActive((prev) => !prev);
                }
              }}
              disabled={usedDoubleBoost || isRevealed}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap ${
                usedDoubleBoost
                  ? 'bg-white/50 text-[#9A93B5] border-[#D7D0EE] cursor-not-allowed'
                  : doubleBoostActive
                    ? 'bg-[#7C3AED] text-white border-[#7C3AED]'
                    : 'bg-white text-[#7C3AED] border-[#7C3AED]/40 hover:bg-[#7C3AED] hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {usedDoubleBoost
                ? 'Đã dùng thẻ x2'
                : doubleBoostActive
                  ? 'Đang bật x2'
                  : 'Nhân đôi điểm (x2)'}
            </button>
          </div>
        )}
      </div>

      {/* Main 1-Screen Compact Question Card (No Vertical Scroll Needed) */}
      <div className="bg-white rounded-2xl border border-[#DCE8F8] p-4 sm:p-6 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#647899]">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#2563EB]">{currentQuestion.topic}</span>
            <span aria-hidden="true">·</span>
            <span>Mức độ: {getDifficultyLabel(currentQuestion.difficulty)}</span>
          </div>
          <span className="hidden sm:inline text-[11px]">Phím tắt: 1–4 chọn đáp án · Enter đi tiếp</span>
        </div>

        <h2 className="text-base sm:text-lg font-extrabold text-[#163A70] leading-snug">
          {currentQuestion.prompt}
        </h2>

        {/* 4 Choices in Compact 2x2 Grid so all answers stay visible on 1 screen */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {currentQuestion.options.map((option, idx) => {
            const isEliminated = eliminatedOptions.includes(idx);
            const isSelected = selectedOption === idx;
            const isCorrectChoice = idx === currentQuestion.correctIndex;

            let optionStyle =
              'bg-white border-[#D8E6F8] hover:border-[#2563EB] hover:bg-[#F3F8FF] text-[#1A2B49]';
            let labelStyle = 'bg-[#EEF5FF] text-[#163A70]';

            if (isEliminated && !isRevealed) {
              optionStyle =
                'bg-[#F8FAFD] border-[#E9EFF8] text-[#B0BDCE] line-through cursor-not-allowed';
              labelStyle = 'bg-[#EEF2F8] text-[#B0BDCE]';
            } else if (isRevealed) {
              if (isCorrectChoice) {
                optionStyle = 'bg-[#ECFDF5] border-[#10B981] text-[#065F46]';
                labelStyle = 'bg-[#10B981] text-white';
              } else if (isSelected && !isCorrectChoice) {
                optionStyle = 'bg-[#FFF1F2] border-[#F43F5E] text-[#9F1239]';
                labelStyle = 'bg-[#F43F5E] text-white';
              } else {
                optionStyle = 'bg-[#FAFBFD] border-[#E8EEF7] text-[#8E9DB5]';
                labelStyle = 'bg-[#EDF2F9] text-[#8E9DB5]';
              }
            }

            return (
              <button
                key={idx}
                type="button"
                disabled={isRevealed || isEliminated}
                onClick={() => handleSelectAnswer(idx)}
                className={`w-full flex items-center gap-3 p-3 sm:p-3.5 rounded-xl border text-left transition-colors ${optionStyle}`}
              >
                <span
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 ${labelStyle}`}
                >
                  {currentQuestion.options.length === 2
                    ? idx === 0
                      ? 'Đ'
                      : 'S'
                    : OPTION_LABELS[idx]}
                </span>
                <span className="text-xs sm:text-sm font-semibold flex-1 leading-snug">
                  {option}
                </span>
                {isRevealed && isCorrectChoice && (
                  <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                )}
                {isRevealed && isSelected && !isCorrectChoice && (
                  <XCircle className="w-4 h-4 text-[#F43F5E] shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Immediate Compact Feedback & Next Button */}
        {isRevealed && (
          <div className="pt-3 border-t border-[#EDF4FC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5 flex-1">
              <div
                className={`text-xs sm:text-sm font-bold flex items-center gap-1.5 ${
                  selectedOption === currentQuestion.correctIndex
                    ? 'text-[#059669]'
                    : 'text-[#E11D48]'
                }`}
              >
                {selectedOption === currentQuestion.correctIndex ? (
                  <>
                    <Trophy className="w-4 h-4" />
                    <span>Chính xác! Bạn đã ghi điểm cho câu hỏi này.</span>
                  </>
                ) : selectedOption === null ? (
                  <span>
                    Hết giờ! Đáp án đúng là{' '}
                    {currentQuestion.options.length === 2
                      ? currentQuestion.options[currentQuestion.correctIndex]
                      : OPTION_LABELS[currentQuestion.correctIndex]}
                    .
                  </span>
                ) : (
                  <span>
                    Chưa đúng. Đáp án đúng là{' '}
                    {currentQuestion.options.length === 2
                      ? currentQuestion.options[currentQuestion.correctIndex]
                      : OPTION_LABELS[currentQuestion.correctIndex]}
                    .
                  </span>
                )}
              </div>
              <p className="text-xs text-[#526582] leading-snug">
                {currentQuestion.explanation}
              </p>
            </div>

            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-bold transition-colors whitespace-nowrap shrink-0"
            >
              <span>{isFinalStep ? 'Xem tổng kết' : 'Câu tiếp theo'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
