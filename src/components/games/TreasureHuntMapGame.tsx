import React, { useCallback, useRef, useState } from 'react';
import {
  ArrowLeft,
  Compass,
  Flame,
  Heart,
  KeyRound,
  RotateCcw,
  Shield,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { FEATURED_GAMES_LIST } from '../../../data/games';
import { pickRandomQuestions } from '../../../data/questionBank';
import { Grade, Question, SessionRecord } from '../../types';
import {
  isSoundMuted,
  playBoostSound,
  playCorrectSound,
  playHarvestSound,
  playVictorySound,
  playWrongSound,
  setSoundMuted,
} from '../../utils/soundFx';
import CompactQuestionModal from '../CompactQuestionModal';

interface TreasureHuntMapGameProps {
  grade: Grade;
  playerName: string;
  customQuestions: Question[];
  onExit: () => void;
  onCompleteSession: (
    session: Omit<SessionRecord, 'id' | 'completedAt'>,
    topicBreakdown: { grade: Grade; topic: string; isCorrect: boolean }[]
  ) => void;
}

interface IslandLandmark {
  id: number;
  name: string;
  emoji: string;
  xPct: number;
  yPct: number;
  rewardGem: string;
}

const LANDMARKS: IslandLandmark[] = [
  { id: 0, name: 'Bến Thuyền Khởi Hành', emoji: '⛵', xPct: 12, yPct: 76, rewardGem: '💠 Lam ngọc' },
  { id: 1, name: 'Rừng Dừa Mã Hóa', emoji: '🌴', xPct: 30, yPct: 58, rewardGem: '💚 Lục bảo' },
  { id: 2, name: 'Cầu Tre Dữ Liệu', emoji: '🌉', xPct: 47, yPct: 68, rewardGem: '💛 Hoàng ngọc' },
  { id: 3, name: 'Hang Động Thuật Toán', emoji: '⛰️', xPct: 60, yPct: 42, rewardGem: '💜 Thạch anh' },
  { id: 4, name: 'Đỉnh Núi Mạng Số', emoji: '🔥', xPct: 74, yPct: 24, rewardGem: '❤️ Hồng ngọc' },
  { id: 5, name: 'Rương Kho Báu Vàng', emoji: '👑', xPct: 87, yPct: 55, rewardGem: '👑 Rương Vàng' },
];

export default function TreasureHuntMapGame({
  grade,
  playerName,
  customQuestions,
  onExit,
  onCompleteSession,
}: TreasureHuntMapGameProps) {
  const gameMeta = FEATURED_GAMES_LIST.find((g) => g.id === 'treasure-hunt-map')!;

  const buildQuestions = useCallback(
    () => pickRandomQuestions(grade, LANDMARKS.length, { customQuestions }),
    [customQuestions, grade]
  );

  const [questions, setQuestions] = useState<Question[]>(() => buildQuestions());
  const [currentStop, setCurrentStop] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [keysCollected, setKeysCollected] = useState(0);
  const [score, setScore] = useState(0);
  const [collectedGems, setCollectedGems] = useState<string[]>([]);

  // 3 Adventure Tools (1 use each)
  const [compassUsed, setCompassUsed] = useState(false);
  const [torchUsed, setTorchUsed] = useState(false);
  const [shieldUsed, setShieldUsed] = useState(false);
  const [shieldArmed, setShieldArmed] = useState(false);

  const [eliminatedForActive, setEliminatedForActive] = useState<number[]>([]);
  const [hintForActive, setHintForActive] = useState<string | undefined>(undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [finished, setFinished] = useState<'won' | 'lost' | null>(null);
  const [muted, setMuted] = useState(() => isSoundMuted());
  const [banner, setBanner] = useState(
    'Chạm vào Chặng hiện tại trên bản đồ Đảo Số để giải mật mã và thu thập Chìa Khóa Vàng!'
  );
  const [topicLog, setTopicLog] = useState<
    { grade: Grade; topic: string; isCorrect: boolean }[]
  >([]);

  const startTimeRef = useRef(Date.now());
  const recordedRef = useRef(false);

  const activeQuestion = questions[currentStop] ?? questions[0];

  const concludeExpedition = useCallback(
    (
      outcome: 'won' | 'lost',
      finalScore: number,
      finalKeys: number,
      log: { grade: Grade; topic: string; isCorrect: boolean }[]
    ) => {
      setFinished(outcome);
      if (outcome === 'won') playVictorySound();
      if (!recordedRef.current) {
        recordedRef.current = true;
        onCompleteSession(
          {
            type: 'game',
            title: 'Truy Tìm Kho Báu Đảo Số',
            gameId: 'treasure-hunt-map',
            grade,
            score: finalScore,
            maxScore: 200,
            correctCount: finalKeys,
            totalQuestions: LANDMARKS.length,
            gemsUnlocked: finalKeys,
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

  const handleUseCompass = () => {
    if (compassUsed || !activeQuestion) return;
    if (activeQuestion.options.length <= 2) {
      setBanner('🧭 La bàn 50/50 chỉ áp dụng cho câu hỏi 4 lựa chọn — hãy giữ lại cho chặng sau!');
      return;
    }
    playBoostSound();
    const wrongIdx = activeQuestion.options
      .map((_, i) => i)
      .filter((i) => i !== activeQuestion.correctIndex);
    const shuffled = [...wrongIdx].sort(() => Math.random() - 0.5);
    setEliminatedForActive(shuffled.slice(0, 2));
    setCompassUsed(true);
    setBanner('🧭 Đã bật La bàn 50/50! 2 đáp án sai sẽ tự động bị gạch bỏ ở chặng này.');
  };

  const handleUseTorch = () => {
    if (torchUsed || !activeQuestion) return;
    playBoostSound();
    setHintForActive(
      `Kiến thức thuộc chủ đề “${activeQuestion.topic}” — Hãy chú ý từ khóa chính trong câu hỏi!`
    );
    setTorchUsed(true);
    setBanner('🔦 Đã thắp Đuốc soi đường! Gợi ý kiến thức sẽ hiện ngay trên bảng câu hỏi.');
  };

  const handleUseShield = () => {
    if (shieldUsed) return;
    playBoostSound();
    setShieldUsed(true);
    setShieldArmed(true);
    setBanner('🛡️ Đã trang bị Khiên hộ mệnh! Bạn sẽ không bị mất tim nếu lỡ trả lời sai chặng này.');
  };

  const handleStopAnswer = (isCorrect: boolean) => {
    setModalOpen(false);
    setEliminatedForActive([]);
    setHintForActive(undefined);

    const nextLog = [
      ...topicLog,
      { grade: activeQuestion.grade, topic: activeQuestion.topic, isCorrect },
    ];
    setTopicLog(nextLog);

    if (isCorrect) {
      playCorrectSound();
      playHarvestSound();
      const landmark = LANDMARKS[currentStop];
      const isChest = currentStop === LANDMARKS.length - 1;
      const gained = isChest ? 50 : 30;
      const nextScore = score + gained;
      const nextKeys = keysCollected + 1;

      setScore(nextScore);
      setKeysCollected(nextKeys);
      setCollectedGems((prev) => [...prev, landmark.rewardGem]);
      setShieldArmed(false);

      if (isChest) {
        concludeExpedition('won', nextScore, nextKeys, nextLog);
      } else {
        setCurrentStop((s) => s + 1);
        setBanner(
          `🗝️ Tuyệt vời! Vượt qua ${landmark.name} (+${gained}đ & ${landmark.rewardGem})! Tiến tới ${LANDMARKS[currentStop + 1].name}!`
        );
      }
    } else {
      playWrongSound();
      if (shieldArmed) {
        setShieldArmed(false);
        setBanner('🛡️ Khiên hộ mệnh đã đỡ đòn giúp bạn giữ nguyên trái tim! Chạm lại trạm để vượt qua nhé.');
      } else {
        const nextHearts = Math.max(0, hearts - 1);
        setHearts(nextHearts);
        if (nextHearts === 0) {
          concludeExpedition('lost', score, keysCollected, nextLog);
        } else {
          setBanner(
            `💔 Mất 1 trái tim (còn ${nextHearts}/3)! Đọc kỹ giải thích và thử chinh phục lại trạm này nhé.`
          );
        }
      }
    }
  };

  const handleRestart = () => {
    setQuestions(buildQuestions());
    setCurrentStop(0);
    setHearts(3);
    setKeysCollected(0);
    setScore(0);
    setCollectedGems([]);
    setCompassUsed(false);
    setTorchUsed(false);
    setShieldUsed(false);
    setShieldArmed(false);
    setEliminatedForActive([]);
    setHintForActive(undefined);
    setModalOpen(false);
    setFinished(null);
    setTopicLog([]);
    recordedRef.current = false;
    startTimeRef.current = Date.now();
    setBanner('Chuyến thám hiểm Đảo Số mới bắt đầu! Chạm Chặng #1 để khởi hành.');
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
  };

  // ==================== FINISHED TREASURE CELEBRATION ====================
  if (finished) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-[#A5F3FC] p-6 sm:p-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[#ECFEFF] border border-[#A5F3FC] mx-auto flex items-center justify-center text-3xl">
          {finished === 'won' ? '👑' : '🗺️'}
        </div>
        <div>
          <div className="text-xs font-extrabold text-[#0891B2]">
            Truy Tìm Kho Báu Đảo Số · Tin học {grade}
          </div>
          <h2 className="text-2xl font-extrabold text-[#163A70] mt-1">
            {finished === 'won'
              ? `Chúc mừng ${playerName} đã mở khóa Rương Kho Báu Vàng!`
              : 'Hết trái tim thám hiểm — Hãy lên thuyền thử lại nhé!'}
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-[#ECFEFF]">
            <div className="text-xs text-[#647899]">Điểm kho báu</div>
            <div className="text-2xl font-extrabold text-[#0891B2] tabular-nums">
              {score}đ
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[#FEFCE8]">
            <div className="text-xs text-[#647899]">Chìa khóa vàng</div>
            <div className="text-2xl font-extrabold text-[#CA8A04] tabular-nums">
              🗝️ {keysCollected}/{LANDMARKS.length}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[#FFF1F2]">
            <div className="text-xs text-[#647899]">Trái tim còn lại</div>
            <div className="text-2xl font-extrabold text-[#E11D48] tabular-nums">
              ❤️ {hearts}/3
            </div>
          </div>
        </div>

        {collectedGems.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {collectedGems.map((g) => (
              <span
                key={g}
                className="px-3 py-1.5 rounded-xl bg-[#F0FDFA] border border-[#99F6E4] text-xs font-bold text-[#163A70]"
              >
                {g}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={handleRestart}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0891B2] hover:bg-[#0E7490] text-white text-sm font-bold"
          >
            <RotateCcw className="w-4 h-4" />
            Thám hiểm chuyến mới
          </button>
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-[#DCE8F8] hover:bg-[#F5F9FF] text-[#163A70] text-sm font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            Về danh sách trò chơi
          </button>
        </div>
      </div>
    );
  }

  const currentLandmark = LANDMARKS[currentStop];

  // ==================== 1-SCREEN INTERACTIVE TREASURE ISLAND MAP ====================
  return (
    <div className="space-y-3">
      {/* Compact Header HUD */}
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
            🗺️ Truy Tìm Kho Báu Đảo Số · Tin học {grade}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-bold tabular-nums">
          <div className="flex items-center gap-0.5" aria-label={`Còn ${hearts} trái tim`}>
            {[0, 1, 2].map((i) => (
              <Heart
                key={i}
                className={`w-4 h-4 ${
                  i < hearts ? 'text-[#E11D48] fill-[#E11D48]' : 'text-[#CBD5E1]'
                }`}
              />
            ))}
          </div>
          <span className="text-[#CA8A04] inline-flex items-center gap-1">
            <KeyRound className="w-3.5 h-3.5" />
            {keysCollected}/{LANDMARKS.length} chìa khóa
          </span>
          <span className="text-[#0891B2] inline-flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5" />
            {score} điểm
          </span>
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

      {/* Main 1-Screen Map + Tools Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left: Illustrated Island Adventure Map */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-[#A5F3FC] p-3.5 sm:p-4 space-y-2.5">
          <div className="relative w-full aspect-[16/9] max-h-[430px] rounded-2xl overflow-hidden border border-[#BAE6FD]">
            <img
              src={gameMeta.imageUrl}
              alt="Bản đồ Đảo Số Truy Tìm Kho Báu"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-[#163A70]/15 pointer-events-none" />

            {/* Dotted SVG Adventure Path connecting the 6 Landmarks */}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              <polyline
                fill="none"
                stroke="#FEF08A"
                strokeWidth="1.2"
                strokeDasharray="2 1.8"
                points={LANDMARKS.map((l) => `${l.xPct},${l.yPct}`).join(' ')}
              />
            </svg>

            {/* 6 Interactive Island Landmark Pins */}
            {LANDMARKS.map((lm) => {
              const isCompleted = lm.id < currentStop;
              const isCurrent = lm.id === currentStop;
              return (
                <button
                  key={lm.id}
                  type="button"
                  disabled={!isCurrent}
                  onClick={() => isCurrent && setModalOpen(true)}
                  style={{ left: `${lm.xPct}%`, top: `${lm.yPct}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-all ${
                    isCurrent
                      ? 'z-20 scale-110 cursor-pointer'
                      : 'z-10 cursor-default'
                  }`}
                >
                  <div
                    className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl border-2 flex items-center justify-center text-xl shadow-md transition-transform ${
                      isCurrent
                        ? 'bg-[#FEF9C3] border-[#EAB308] ring-4 ring-[#FDE047]/60 hover:scale-110'
                        : isCompleted
                          ? 'bg-[#ECFDF5] border-[#10B981]'
                          : 'bg-white/90 border-[#94A3B8] opacity-85'
                    }`}
                  >
                    <span>{isCompleted ? '✅' : lm.emoji}</span>
                  </div>
                  <span
                    className={`mt-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold whitespace-nowrap shadow-xs ${
                      isCurrent
                        ? 'bg-[#163A70] text-[#FEF08A]'
                        : 'bg-white/95 text-[#163A70]'
                    }`}
                  >
                    {lm.id + 1}. {lm.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Current Expedition Action + 3 Adventure Tools */}
        <div className="lg:col-span-4 bg-white rounded-3xl border border-[#DCE8F8] p-4 sm:p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="text-xs font-extrabold text-[#0891B2] inline-flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              <span>Chặng {currentStop + 1}/{LANDMARKS.length}: {currentLandmark.name}</span>
            </div>

            <div className="p-3 rounded-2xl bg-[#ECFEFF] border border-[#A5F3FC] text-xs font-bold text-[#163A70] leading-snug">
              {banner}
            </div>

            {/* 3 Adventure Tools */}
            <div className="space-y-2">
              <div className="text-xs font-extrabold text-[#163A70]">
                Bảo bối thám hiểm (dùng trước khi mở câu hỏi)
              </div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  disabled={compassUsed}
                  onClick={handleUseCompass}
                  className="flex items-center justify-between px-3 py-2 rounded-xl border border-[#BAE6FD] bg-[#F0F9FF] hover:bg-[#E0F2FE] disabled:opacity-45 text-xs font-bold text-[#0369A1] transition-colors"
                >
                  <span className="inline-flex items-center gap-2">
                    <Compass className="w-4 h-4" />
                    La bàn 50/50 (loại 2 đáp án sai)
                  </span>
                  <span>{compassUsed ? 'Đã dùng' : 'Còn 1'}</span>
                </button>

                <button
                  type="button"
                  disabled={torchUsed}
                  onClick={handleUseTorch}
                  className="flex items-center justify-between px-3 py-2 rounded-xl border border-[#FDE047] bg-[#FEFCE8] hover:bg-[#FEF08A] disabled:opacity-45 text-xs font-bold text-[#854D0E] transition-colors"
                >
                  <span className="inline-flex items-center gap-2">
                    <Flame className="w-4 h-4" />
                    Đuốc soi đường (gợi ý kiến thức)
                  </span>
                  <span>{torchUsed ? 'Đã dùng' : 'Còn 1'}</span>
                </button>

                <button
                  type="button"
                  disabled={shieldUsed}
                  onClick={handleUseShield}
                  className="flex items-center justify-between px-3 py-2 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] hover:bg-[#D1FAE5] disabled:opacity-45 text-xs font-bold text-[#047857] transition-colors"
                >
                  <span className="inline-flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Khiên hộ mệnh (giữ tim nếu sai)
                  </span>
                  <span>{shieldArmed ? 'Đang bật!' : shieldUsed ? 'Đã dùng' : 'Còn 1'}</span>
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#0891B2] to-[#0284C7] hover:opacity-95 text-white text-sm font-extrabold shadow-xs transition-opacity"
          >
            <KeyRound className="w-4 h-4" />
            Mở thử thách {currentLandmark.name}
          </button>
        </div>
      </div>

      {/* 1-Screen Compact Question Modal with Compass 50/50 & Torch Hint support */}
      {modalOpen && activeQuestion && (
        <CompactQuestionModal
          mode="mcq"
          question={activeQuestion}
          badgeText={`🗺️ Chặng ${currentStop + 1}/6 · ${currentLandmark.name}`}
          accentColor="#0891B2"
          eliminatedIndices={eliminatedForActive}
          hintText={hintForActive}
          onResult={(r) => handleStopAnswer(r.isCorrect)}
        />
      )}
    </div>
  );
}
