import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { pickRandomQuestions } from '../../../data/questionBank';
import { Grade, Question, SessionRecord } from '../../types';
import {
  isSoundMuted,
  playBoostSound,
  playCorrectSound,
  playVictorySound,
  playWrongSound,
  setSoundMuted,
} from '../../utils/soundFx';
import CompactQuestionModal from '../CompactQuestionModal';

interface PuzzlePiecesGameProps {
  grade: Grade;
  playerName: string;
  customQuestions: Question[];
  onExit: () => void;
  onCompleteSession: (
    session: Omit<SessionRecord, 'id' | 'completedAt'>,
    topicBreakdown: { grade: Grade; topic: string; isCorrect: boolean }[]
  ) => void;
}

interface MysteryPictureDef {
  id: string;
  title: string;
  imageUrl: string;
  funFact: string;
  options: [string, string, string, string];
}

const MYSTERY_PICTURES: MysteryPictureDef[] = [
  {
    id: 'pic-digital-world',
    title: 'Thế giới Robot & Lập trình sáng tạo',
    imageUrl: '/src/assets/images/game_card_jigsaw_1795275492462.jpg',
    funFact:
      'Lập trình trực quan giúp học sinh ghép các khối lệnh như những mảnh ghép để điều khiển robot và trò chơi!',
    options: [
      'Thế giới Robot & Lập trình sáng tạo',
      'Trạm vũ trụ ngoài hành tinh',
      'Khu rừng cổ tích mùa đông',
      'Nhà máy sản xuất ô tô điện',
    ],
  },
  {
    id: 'pic-cloud-tower',
    title: 'Điện toán đám mây kết nối tri thức',
    imageUrl: '/src/assets/images/game_card_clouds_1795273497223.jpg',
    funFact:
      'Lưu trữ đám mây (Cloud) giúp em mở tài liệu học tập trên mọi máy tính và điện thoại có kết nối Internet.',
    options: [
      'Thung lũng hoa hướng dương',
      'Điện toán đám mây kết nối tri thức',
      'Đường hầm tàu điện siêu tốc',
      'Bến cảng tàu thủy quốc tế',
    ],
  },
  {
    id: 'pic-smart-farm',
    title: 'Nông trại thông minh ứng dụng công nghệ',
    imageUrl: '/src/assets/images/game_card_farm_1795273496232.jpg',
    funFact:
      'Nông nghiệp số dùng cảm biến nhiệt độ, độ ẩm và hệ thống tưới tự động giúp cây trồng phát triển bền vững.',
    options: [
      'Siêu thị bán hàng tự động',
      'Thư viện sách điện tử hiện đại',
      'Nông trại thông minh ứng dụng công nghệ',
      'Sân vận động thể thao Olympic',
    ],
  },
];

const PIECE_COLORS = [
  { bg: '#EFF6FF', border: '#93C5FD', text: '#1D4ED8', numBg: '#2563EB' },
  { bg: '#ECFDF5', border: '#6EE7B7', text: '#047857', numBg: '#059669' },
  { bg: '#FEFCE8', border: '#FDE047', text: '#A16207', numBg: '#CA8A04' },
  { bg: '#FFF1F2', border: '#FDA4AF', text: '#BE123C', numBg: '#E11D48' },
  { bg: '#F5F3FF', border: '#C4B5FD', text: '#6D28D9', numBg: '#7C3AED' },
  { bg: '#ECFEFF', border: '#67E8F9', text: '#0E7490', numBg: '#0891B2' },
];

export default function PuzzlePiecesGame({
  grade,
  playerName,
  customQuestions,
  onExit,
  onCompleteSession,
}: PuzzlePiecesGameProps) {
  const [pictureIdx, setPictureIdx] = useState(0);
  const picture = MYSTERY_PICTURES[pictureIdx % MYSTERY_PICTURES.length];

  const buildQuestions = useCallback(
    () => pickRandomQuestions(grade, 6, { customQuestions }),
    [customQuestions, grade]
  );

  const [questions, setQuestions] = useState<Question[]>(() => buildQuestions());
  const [openedPieces, setOpenedPieces] = useState<number[]>([]);
  const [activePieceIdx, setActivePieceIdx] = useState<number | null>(null);
  const [guessModalOpen, setGuessModalOpen] = useState(false);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [muted, setMuted] = useState(() => isSoundMuted());
  const [revealedFull, setRevealedFull] = useState(false);
  const [banner, setBanner] = useState(
    'Chạm từng mảnh ghép (1–6) để trả lời câu hỏi Tin học và lật mở bức tranh ẩn giấu bên dưới!'
  );
  const [topicLog, setTopicLog] = useState<
    { grade: Grade; topic: string; isCorrect: boolean }[]
  >([]);

  const startTimeRef = useRef(Date.now());
  const recordedRef = useRef(false);

  const activeQuestion =
    activePieceIdx !== null ? questions[activePieceIdx] ?? null : null;

  const finishRound = useCallback(
    (
      finalScore: number,
      finalCorrect: number,
      finalTotal: number,
      log: { grade: Grade; topic: string; isCorrect: boolean }[]
    ) => {
      setRevealedFull(true);
      setOpenedPieces([0, 1, 2, 3, 4, 5]);
      playVictorySound();
      if (!recordedRef.current) {
        recordedRef.current = true;
        onCompleteSession(
          {
            type: 'game',
            title: 'Lật Mảnh Ghép Bí Ẩn',
            gameId: 'puzzle-pieces',
            grade,
            score: finalScore,
            maxScore: 170,
            correctCount: finalCorrect,
            totalQuestions: Math.max(1, finalTotal),
            durationSeconds: Math.max(
              10,
              Math.round((Date.now() - startTimeRef.current) / 1000)
            ),
          },
          log
        );
      }
    },
    [grade, onCompleteSession]
  );

  const handlePieceResult = (isCorrect: boolean) => {
    if (activePieceIdx === null || !activeQuestion) return;
    const idx = activePieceIdx;
    const q = activeQuestion;
    setActivePieceIdx(null);

    const nextTotal = totalAttempts + 1;
    setTotalAttempts(nextTotal);
    const nextLog = [...topicLog, { grade: q.grade, topic: q.topic, isCorrect }];
    setTopicLog(nextLog);

    if (isCorrect) {
      playCorrectSound();
      const nextOpened = openedPieces.includes(idx)
        ? openedPieces
        : [...openedPieces, idx];
      const nextScore = score + 20;
      const nextCorrect = correctCount + 1;

      setOpenedPieces(nextOpened);
      setScore(nextScore);
      setCorrectCount(nextCorrect);
      setBanner(
        `✨ Đã lật mở Mảnh ghép #${idx + 1} (+20 điểm)! ${
          nextOpened.length >= 2 && nextOpened.length < 6
            ? 'Bạn đã có thể bấm “Đoán bức tranh” để nhận thưởng +50 điểm!'
            : ''
        }`
      );

      if (nextOpened.length >= 6) {
        finishRound(nextScore + 30, nextCorrect, nextTotal, nextLog);
      }
    } else {
      playWrongSound();
      setBanner(
        `🧩 Mảnh ghép #${idx + 1} vẫn đang khóa — Bạn có thể mở mảnh khác hoặc thử chinh phục lại mảnh này nhé!`
      );
    }
  };

  const handleGuessPicture = (choice: string) => {
    setGuessModalOpen(false);
    if (choice === picture.title) {
      playBoostSound();
      const bonus = 50;
      const finalScore = score + bonus;
      setScore(finalScore);
      finishRound(finalScore, correctCount + 1, totalAttempts + 1, topicLog);
    } else {
      playWrongSound();
      setBanner('❌ Chưa phải chủ đề bức tranh rồi — Hãy lật thêm mảnh ghép để nhìn rõ hơn nhé!');
    }
  };

  const handleNextPicture = () => {
    setPictureIdx((p) => p + 1);
    setQuestions(buildQuestions());
    setOpenedPieces([]);
    setActivePieceIdx(null);
    setRevealedFull(false);
    setScore(0);
    setCorrectCount(0);
    setTotalAttempts(0);
    setTopicLog([]);
    recordedRef.current = false;
    startTimeRef.current = Date.now();
    setBanner('Bức tranh bí ẩn mới đã sẵn sàng! Chạm vào mảnh ghép bất kỳ để bắt đầu lật mở.');
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
  };

  const canGuessEarly = useMemo(
    () => openedPieces.length >= 2 && !revealedFull,
    [openedPieces.length, revealedFull]
  );

  return (
    <div className="space-y-3">
      {/* Compact Top Bar */}
      <div className="bg-white rounded-2xl border border-[#DCE8F8] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#647899] hover:text-[#163A70]"
          >
            <ArrowLeft className="w-4 h-4" />
            Thoát
          </button>
          <span className="text-sm font-extrabold text-[#163A70]">
            🖼️ Lật Mảnh Ghép Bí Ẩn · Tin học {grade}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-bold tabular-nums">
          <span className="text-[#CA8A04] inline-flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5" />
            {score} điểm
          </span>
          <span className="text-[#059669]">Đã lật: {openedPieces.length}/6 mảnh</span>
          <button
            type="button"
            onClick={toggleMute}
            className="p-1.5 rounded-lg border border-[#DCE8F8] text-[#647899] hover:text-[#163A70]"
            aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main 1-Screen Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left: Hidden Picture with 6 Interactive Overlay Puzzle Pieces */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-[#FDE047] p-3.5 sm:p-4 space-y-3">
          <div className="relative w-full aspect-[16/9] max-h-[430px] rounded-2xl overflow-hidden border border-[#E2ECF9] bg-[#EFF6FF]">
            {/* Full Secret Picture underneath */}
            <img
              src={picture.imageUrl}
              alt="Bức tranh bí ẩn Tin học"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />

            {/* 3x2 Interactive Puzzle Pieces Overlay */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-2">
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const isOpen = openedPieces.includes(idx) || revealedFull;
                const palette = PIECE_COLORS[idx];
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isOpen}
                    onClick={() => setActivePieceIdx(idx)}
                    style={
                      isOpen
                        ? undefined
                        : {
                            backgroundColor: palette.bg,
                            borderColor: palette.border,
                          }
                    }
                    className={`relative flex flex-col items-center justify-center gap-1.5 border transition-all duration-500 ${
                      isOpen
                        ? 'opacity-0 pointer-events-none scale-90'
                        : 'opacity-100 hover:brightness-95 cursor-pointer'
                    }`}
                  >
                    <span
                      style={{ backgroundColor: palette.numBg }}
                      className="w-10 h-10 rounded-2xl text-white text-base font-extrabold flex items-center justify-center shadow-xs"
                    >
                      {idx + 1}
                    </span>
                    <span
                      style={{ color: palette.text }}
                      className="text-xs font-extrabold"
                    >
                      Mảnh ghép #{idx + 1}
                    </span>
                  </button>
                );
              })}
            </div>

            {revealedFull && (
              <div className="absolute bottom-3 left-3 right-3 bg-white/95 border border-[#A7F3D0] rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-[#10B981] shrink-0" />
                  <div>
                    <div className="text-xs sm:text-sm font-extrabold text-[#163A70]">
                      {picture.title}
                    </div>
                    <div className="text-[11px] text-[#4B6384]">{picture.funFact}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Mission Status + Early Guess Button */}
        <div className="lg:col-span-4 bg-white rounded-3xl border border-[#DCE8F8] p-4 sm:p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#CA8A04]">
              <Sparkles className="w-4 h-4" />
              <span>Bức tranh #{(pictureIdx % MYSTERY_PICTURES.length) + 1} · {playerName}</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FEFCE8] border border-[#FDE047] text-xs sm:text-sm font-semibold text-[#163A70] leading-snug">
              {revealedFull
                ? `🎉 Tuyệt vời! Bạn đã hoàn thành bức tranh với ${score} điểm!`
                : banner}
            </div>

            <div className="space-y-1.5 text-xs text-[#4B6384]">
              <div className="font-bold text-[#163A70]">Cách chơi nhanh:</div>
              <div>1. Chạm vào mảnh ghép số 1–6 bất kỳ trên bảng tranh.</div>
              <div>2. Trả lời đúng câu hỏi Tin học {grade} để lật mở mảnh ghép (+20đ).</div>
              <div>3. Mở từ 2 mảnh trở lên có thể bấm Đoán nhanh bức tranh (+50đ)!</div>
            </div>
          </div>

          <div className="space-y-2">
            {!revealedFull ? (
              <button
                type="button"
                disabled={!canGuessEarly}
                onClick={() => setGuessModalOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#CA8A04] hover:bg-[#A16207] disabled:opacity-45 text-white text-sm font-bold transition-colors"
              >
                <Eye className="w-4 h-4" />
                {canGuessEarly
                  ? 'Đoán chủ đề bức tranh (+50đ)'
                  : `Mở ít nhất 2 mảnh để đoán (${openedPieces.length}/2)`}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNextPicture}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-bold transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Chơi bức tranh bí ẩn tiếp theo
              </button>
            )}

            <button
              type="button"
              onClick={handleNextPicture}
              className="w-full py-2.5 rounded-xl bg-[#F4F8FF] hover:bg-[#E0EEFF] text-[#163A70] text-xs font-bold transition-colors"
            >
              Đổi bức tranh khác
            </button>
          </div>
        </div>
      </div>

      {/* 1-Screen Question Modal */}
      {activeQuestion && activePieceIdx !== null && (
        <CompactQuestionModal
          mode="mcq"
          question={activeQuestion}
          badgeText={`🖼️ Lật Mảnh Ghép #${activePieceIdx + 1} · Tin học ${grade}`}
          accentColor="#CA8A04"
          onResult={(r) => handlePieceResult(r.isCorrect)}
        />
      )}

      {/* 1-Screen Picture Theme Guess Modal */}
      {guessModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#163A70]/60"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl bg-white rounded-2xl border border-[#FDE047] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-extrabold text-[#163A70]">
                🔍 Bức tranh bí ẩn phía sau nói về chủ đề nào? (+50 điểm)
              </div>
              <button
                type="button"
                onClick={() => setGuessModalOpen(false)}
                className="text-xs font-bold text-[#647899] hover:text-[#163A70]"
              >
                Đóng
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {picture.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleGuessPicture(opt)}
                  className="p-3.5 rounded-xl border border-[#D8E6F8] bg-[#F8FBFF] hover:border-[#CA8A04] hover:bg-[#FEFCE8] text-left text-xs sm:text-sm font-bold text-[#163A70] transition-colors"
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
