import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Coins,
  Droplets,
  Leaf,
  Save,
  Sparkles,
  Sun,
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

interface KnowledgeFarmGameProps {
  grade: Grade;
  playerName: string;
  customQuestions: Question[];
  onExit: () => void;
  onCompleteSession: (
    session: Omit<SessionRecord, 'id' | 'completedAt'>,
    topicBreakdown: { grade: Grade; topic: string; isCorrect: boolean }[]
  ) => void;
}

interface CropDef {
  id: 'carrot' | 'corn' | 'strawberry' | 'sunflower';
  name: string;
  emoji: string;
  sproutEmoji: string;
  seedCost: number;
  sellValue: number;
  growSeconds: number;
  unlockLevel: number;
  tileBg: string;
}

const CROPS: CropDef[] = [
  {
    id: 'carrot',
    name: 'Cà rốt',
    emoji: '🥕',
    sproutEmoji: '🌱',
    seedCost: 10,
    sellValue: 28,
    growSeconds: 12,
    unlockLevel: 1,
    tileBg: '#FFF7ED',
  },
  {
    id: 'corn',
    name: 'Ngô vàng',
    emoji: '🌽',
    sproutEmoji: '🌿',
    seedCost: 18,
    sellValue: 46,
    growSeconds: 16,
    unlockLevel: 1,
    tileBg: '#FEFCE8',
  },
  {
    id: 'strawberry',
    name: 'Dâu tây',
    emoji: '🍓',
    sproutEmoji: '🪴',
    seedCost: 26,
    sellValue: 68,
    growSeconds: 20,
    unlockLevel: 2,
    tileBg: '#FFF1F2',
  },
  {
    id: 'sunflower',
    name: 'Hướng dương',
    emoji: '🌻',
    sproutEmoji: '🌷',
    seedCost: 35,
    sellValue: 95,
    growSeconds: 24,
    unlockLevel: 3,
    tileBg: '#FEF9C3',
  },
];

interface PlotState {
  id: number;
  cropId: CropDef['id'] | null;
  progress: number; // 0..100
  hasCrow: boolean;
}

interface AnimalState {
  id: string;
  name: string;
  emoji: string;
  productEmoji: string;
  rewardCoins: number;
  ready: boolean;
}

type PendingFarmAction =
  | { kind: 'plant'; plotId: number; crop: CropDef }
  | { kind: 'water'; plotId: number }
  | { kind: 'crow'; plotId: number }
  | { kind: 'animal'; animalId: string };

const INITIAL_ANIMALS: AnimalState[] = [
  { id: 'cow', name: 'Bò sữa', emoji: '🐄', productEmoji: '🥛', rewardCoins: 40, ready: true },
  { id: 'sheep', name: 'Cừu bông', emoji: '🐑', productEmoji: '🧶', rewardCoins: 35, ready: true },
  { id: 'hen', name: 'Gà mái', emoji: '🐔', productEmoji: '🥚', rewardCoins: 25, ready: true },
];

export default function KnowledgeFarmGame({
  grade,
  playerName,
  customQuestions,
  onExit,
  onCompleteSession,
}: KnowledgeFarmGameProps) {
  const gameMeta = FEATURED_GAMES_LIST[3];

  const [coins, setCoins] = useState(50);
  const [xp, setXp] = useState(0);
  const [harvestCount, setHarvestCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);
  const [selectedCropId, setSelectedCropId] = useState<CropDef['id']>('carrot');
  const [sunnyBonus, setSunnyBonus] = useState(true);
  const [muted, setMuted] = useState(() => isSoundMuted());
  const [bannerMsg, setBannerMsg] = useState(
    'Chạm vào ô đất trống để gieo hạt, tưới nước siêu tốc hoặc chăm thú nuôi bằng câu hỏi Tin học!'
  );

  const [plots, setPlots] = useState<PlotState[]>(() =>
    Array.from({ length: 9 }, (_, i) => ({
      id: i,
      cropId: i === 0 ? 'carrot' : i === 1 ? 'corn' : null,
      progress: i === 0 ? 100 : i === 1 ? 50 : 0,
      hasCrow: false,
    }))
  );
  const [animals, setAnimals] = useState<AnimalState[]>(INITIAL_ANIMALS);

  const [activeAction, setActiveAction] = useState<PendingFarmAction | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [topicLog, setTopicLog] = useState<
    { grade: Grade; topic: string; isCorrect: boolean }[]
  >([]);
  const [savedSummary, setSavedSummary] = useState(false);

  const questionDeckRef = useRef<Question[]>([]);
  const questionCursorRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const recordedRef = useRef(false);

  const farmLevel = Math.min(5, 1 + Math.floor(xp / 60));

  const getNextQuestion = useCallback((): Question => {
    if (
      questionDeckRef.current.length === 0 ||
      questionCursorRef.current >= questionDeckRef.current.length
    ) {
      questionDeckRef.current = pickRandomQuestions(grade, 20, { customQuestions });
      questionCursorRef.current = 0;
    }
    const q = questionDeckRef.current[questionCursorRef.current];
    questionCursorRef.current += 1;
    return q;
  }, [customQuestions, grade]);

  // Passive crop growth & occasional playful crow visitor
  useEffect(() => {
    if (savedSummary) return;
    const id = window.setInterval(() => {
      if (activeQuestion) return;

      setPlots((prev) =>
        prev.map((p) => {
          if (!p.cropId) return p;
          if (p.hasCrow) return p; // Crow pauses growth until chased away!
          if (p.progress >= 100) return p;
          const def = CROPS.find((c) => c.id === p.cropId) ?? CROPS[0];
          const step = Math.round(100 / def.growSeconds);
          return { ...p, progress: Math.min(100, p.progress + step) };
        })
      );

      // Refresh animals occasionally
      if (Math.random() < 0.14) {
        setAnimals((prev) => prev.map((a) => (a.ready ? a : { ...a, ready: true })));
      }

      // Fun Crow event on a growing crop (max 1 crow at a time)
      if (Math.random() < 0.08) {
        setPlots((prev) => {
          if (prev.some((p) => p.hasCrow)) return prev;
          const candidates = prev.filter((p) => p.cropId && p.progress < 100);
          if (candidates.length === 0) return prev;
          const pick = candidates[Math.floor(Math.random() * candidates.length)];
          setBannerMsg(
            '🐦‍⬛ Ôi không! Quạ phá mùa vừa đậu xuống luống cây — Chạm vào chú quạ để trả lời câu hỏi đuổi quạ (+30 Xu)!'
          );
          return prev.map((p) => (p.id === pick.id ? { ...p, hasCrow: true } : p));
        });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [activeQuestion, savedSummary]);

  // Toggle sunny weather bonus every 25s
  useEffect(() => {
    const id = window.setInterval(() => {
      setSunnyBonus((prev) => !prev);
    }, 25000);
    return () => window.clearInterval(id);
  }, []);

  const selectedCrop = useMemo(
    () => CROPS.find((c) => c.id === selectedCropId) ?? CROPS[0],
    [selectedCropId]
  );

  const openQuizForAction = (action: PendingFarmAction) => {
    setActiveAction(action);
    setActiveQuestion(getNextQuestion());
  };

  const handlePlotClick = (plot: PlotState) => {
    if (plot.hasCrow) {
      openQuizForAction({ kind: 'crow', plotId: plot.id });
      return;
    }

    // Empty plot -> plant selected crop
    if (!plot.cropId) {
      if (selectedCrop.unlockLevel > farmLevel) {
        setBannerMsg(
          `🔒 ${selectedCrop.name} mở khóa ở Nông trại Cấp ${selectedCrop.unlockLevel}! Hãy trồng thêm cây để lên cấp nhé.`
        );
        return;
      }
      if (coins < selectedCrop.seedCost) {
        setBannerMsg(
          `🪙 Chưa đủ ${selectedCrop.seedCost} Xu để mua hạt ${selectedCrop.name}. Hãy thu hoạch cây chín hoặc chăm thú nuôi!`
        );
        return;
      }
      openQuizForAction({ kind: 'plant', plotId: plot.id, crop: selectedCrop });
      return;
    }

    // Mature crop -> harvest immediately!
    if (plot.progress >= 100) {
      const def = CROPS.find((c) => c.id === plot.cropId) ?? CROPS[0];
      const earned = sunnyBonus ? Math.round(def.sellValue * 1.2) : def.sellValue;
      playHarvestSound();
      setCoins((c) => c + earned);
      setXp((x) => x + 15);
      setHarvestCount((h) => h + 1);
      setPlots((prev) =>
        prev.map((p) =>
          p.id === plot.id ? { ...p, cropId: null, progress: 0, hasCrow: false } : p
        )
      );
      setBannerMsg(
        `🎉 Thu hoạch ${def.emoji} ${def.name} thành công! Nhận +${earned} Xu${
          sunnyBonus ? ' (Nắng vàng +20%)' : ''
        } và +15 XP!`
      );
      return;
    }

    // Growing crop -> water instantly with 1 ICT question!
    openQuizForAction({ kind: 'water', plotId: plot.id });
  };

  const handleAnimalClick = (animal: AnimalState) => {
    if (!animal.ready) {
      setBannerMsg(`${animal.emoji} ${animal.name} đang nghỉ ngơi, sẽ sẵn sàng sau ít giây nữa!`);
      return;
    }
    openQuizForAction({ kind: 'animal', animalId: animal.id });
  };

  const handleQuestionResult = (isCorrect: boolean) => {
    if (!activeAction || !activeQuestion) return;
    const action = activeAction;
    const q = activeQuestion;

    setActiveAction(null);
    setActiveQuestion(null);
    setTotalAnswered((t) => t + 1);
    setTopicLog((prev) => [
      ...prev,
      { grade: q.grade, topic: q.topic, isCorrect },
    ]);

    if (isCorrect) {
      playCorrectSound();
      setCorrectCount((c) => c + 1);
      setXp((x) => x + 20);

      if (action.kind === 'plant') {
        setCoins((c) => Math.max(0, c - action.crop.seedCost));
        setPlots((prev) =>
          prev.map((p) =>
            p.id === action.plotId
              ? { ...p, cropId: action.crop.id, progress: 35, hasCrow: false }
              : p
          )
        );
        setBannerMsg(
          `🌱 Đã gieo hạt ${action.crop.emoji} ${action.crop.name}! Chạm lần nữa để tưới nước lớn tức thì!`
        );
      } else if (action.kind === 'water') {
        playBoostSound();
        setPlots((prev) =>
          prev.map((p) => (p.id === action.plotId ? { ...p, progress: 100 } : p))
        );
        setBannerMsg('💧 Tưới nước Tri Thức thành công! Cây đã chín rộ — Chạm vào ô đất để thu hoạch ngay!');
      } else if (action.kind === 'crow') {
        playHarvestSound();
        setCoins((c) => c + 30);
        setPlots((prev) =>
          prev.map((p) => (p.id === action.plotId ? { ...p, hasCrow: false } : p))
        );
        setBannerMsg('✨ Quạ phá mùa đã bay đi! Bạn nhận thưởng bảo vệ mùa màng +30 Xu!');
      } else if (action.kind === 'animal') {
        const target = animals.find((a) => a.id === action.animalId);
        if (target) {
          const earned = sunnyBonus ? Math.round(target.rewardCoins * 1.2) : target.rewardCoins;
          playHarvestSound();
          setCoins((c) => c + earned);
          setAnimals((prev) =>
            prev.map((a) => (a.id === target.id ? { ...a, ready: false } : a))
          );
          setBannerMsg(
            `${target.productEmoji} Thu hoạch từ ${target.name} thành công! Nhận +${earned} Xu và +20 XP!`
          );
        }
      }
    } else {
      playWrongSound();
      if (action.kind === 'crow') {
        setBannerMsg('🐦‍⬛ Chú quạ vẫn đang cười khì khì — Chạm lại để trả lời đúng và đuổi nó đi nhé!');
      } else {
        setBannerMsg('💡 Chưa chính xác — Đọc kỹ giải thích vừa rồi và thử lại ô đất nhé, bạn không bị mất Xu!');
      }
    }
  };

  const handleSaveAndFinish = () => {
    playVictorySound();
    setSavedSummary(true);
    if (!recordedRef.current && totalAnswered > 0) {
      recordedRef.current = true;
      const elapsedSec = Math.max(10, Math.round((Date.now() - startTimeRef.current) / 1000));
      onCompleteSession(
        {
          type: 'game',
          title: 'Nông Trại Tri Thức',
          gameId: 'knowledge-farm',
          grade,
          score: coins + harvestCount * 10,
          maxScore: Math.max(100, totalAnswered * 20),
          correctCount,
          totalQuestions: totalAnswered,
          durationSeconds: elapsedSec,
        },
        topicLog
      );
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
  };

  // ==================== SAVED SUMMARY ====================
  if (savedSummary) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-[#DCE8F8] p-6 sm:p-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[#FEF9C3] border border-[#FDE047] mx-auto flex items-center justify-center text-3xl">
          🌾
        </div>
        <div>
          <div className="text-xs font-bold text-[#7C3AED]">
            Nông Trại Tri Thức · Tin học {grade}
          </div>
          <h2 className="text-2xl font-extrabold text-[#163A70] mt-1">
            Mùa màng bội thu, {playerName} ơi!
          </h2>
          <p className="text-sm text-[#647899] mt-1">
            Thành quả nông trại và số câu trả lời Tin học đúng đã được lưu vào Tiến bộ của tôi.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-[#FEFCE8]">
            <div className="text-xs text-[#647899]">Xu tích lũy</div>
            <div className="text-xl font-extrabold text-[#CA8A04] tabular-nums">🪙 {coins}</div>
          </div>
          <div className="p-4 rounded-2xl bg-[#ECFDF5]">
            <div className="text-xs text-[#647899]">Vụ thu hoạch</div>
            <div className="text-xl font-extrabold text-[#059669] tabular-nums">
              {harvestCount} vụ
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[#F5F3FF]">
            <div className="text-xs text-[#647899]">Câu Tin học đúng</div>
            <div className="text-xl font-extrabold text-[#7C3AED] tabular-nums">
              {correctCount}/{totalAnswered}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => setSavedSummary(false)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold"
          >
            <Leaf className="w-4 h-4" />
            Tiếp tục chăm nông trại
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

  // ==================== COMPACT 1-SCREEN FARM WORKSPACE ====================
  return (
    <div className="space-y-3">
      {/* Top Sunny Farm Bar */}
      <div className="bg-white rounded-2xl border border-[#DCE8F8] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
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
            🌾 Nông Trại Tri Thức · Tin học {grade}
          </span>
          <span
            className={`hidden sm:inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-lg ${
              sunnyBonus
                ? 'bg-[#FEF9C3] text-[#A16207]'
                : 'bg-[#ECFAFF] text-[#0369A1]'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            {sunnyBonus ? 'Nắng vàng (+20% Xu)' : 'Gió mát lành'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-bold tabular-nums">
          <span className="text-[#CA8A04] inline-flex items-center gap-1">
            <Coins className="w-4 h-4" />
            {coins} Xu
          </span>
          <span className="text-[#059669]">Cấp {farmLevel} ({xp} XP)</span>
          <span className="text-[#7C3AED]">Đúng: {correctCount}/{totalAnswered}</span>
          <button
            type="button"
            onClick={toggleMute}
            className="p-1.5 rounded-lg border border-[#DCE8F8] text-[#647899] hover:text-[#163A70]"
            aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleSaveAndFinish}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold"
          >
            <Save className="w-3.5 h-3.5" />
            Lưu & Tổng kết
          </button>
        </div>
      </div>

      {/* Main 2-Column 1-Screen Farm Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left: 3x3 Sunny Garden Field */}
        <div className="lg:col-span-7 bg-gradient-to-b from-[#ECFDF5] to-[#FEFCE8] rounded-3xl border border-[#BBF7D0] p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2 bg-white/90 rounded-2xl px-3.5 py-2 border border-[#DCFCE7]">
            <span className="text-xs font-bold text-[#163A70] leading-snug">
              {bannerMsg}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {plots.map((plot) => {
              const cropDef = plot.cropId
                ? CROPS.find((c) => c.id === plot.cropId)
                : null;
              const isReady = cropDef && plot.progress >= 100 && !plot.hasCrow;

              return (
                <button
                  key={plot.id}
                  type="button"
                  onClick={() => handlePlotClick(plot)}
                  style={{
                    backgroundColor: plot.hasCrow
                      ? '#FFF1F2'
                      : cropDef
                        ? cropDef.tileBg
                        : '#FFFFFF',
                  }}
                  className={`relative rounded-2xl border-2 p-3 h-28 sm:h-32 flex flex-col items-center justify-center gap-1 transition-all hover:-translate-y-0.5 active:scale-[0.98] ${
                    plot.hasCrow
                      ? 'border-[#FB7185]'
                      : isReady
                        ? 'border-[#10B981] shadow-sm'
                        : cropDef
                          ? 'border-[#FCD34D]'
                          : 'border-dashed border-[#A7F3D0] hover:border-[#10B981]'
                  }`}
                >
                  {plot.hasCrow ? (
                    <>
                      <span className="text-3xl">🐦‍⬛</span>
                      <span className="text-[11px] font-extrabold text-[#E11D48]">
                        Đuổi quạ (+30 Xu)
                      </span>
                    </>
                  ) : !cropDef ? (
                    <>
                      <span className="text-2xl opacity-60">➕</span>
                      <span className="text-[11px] font-bold text-[#059669]">
                        Gieo {selectedCrop.name}
                      </span>
                    </>
                  ) : isReady ? (
                    <>
                      <span className="text-3xl">{cropDef.emoji}</span>
                      <span className="text-[11px] font-extrabold text-[#059669] bg-[#ECFDF5] px-2 py-0.5 rounded-lg">
                        Thu hoạch!
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl">{cropDef.sproutEmoji}</span>
                      <div className="w-full max-w-[90px] h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#10B981] rounded-full transition-all"
                          style={{ width: `${plot.progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-[#0284C7] inline-flex items-center gap-0.5">
                        <Droplets className="w-3 h-3" />
                        Tưới nhanh ({plot.progress}%)
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Seed Shop + Barn Animals + Visual Banner */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          {/* Decorative Farm Header Strip */}
          <div className="relative h-28 rounded-2xl overflow-hidden border border-[#DDD6FE]">
            <img
              src={gameMeta.imageUrl}
              alt="Nông Trại Tri Thức"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#163A70]/75 via-[#163A70]/35 to-transparent flex items-center px-4">
              <div className="text-white">
                <div className="text-[11px] font-bold text-[#FDE047] inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Nông dân {playerName} · Cấp {farmLevel}
                </div>
                <div className="text-sm font-extrabold mt-0.5">
                  Đã thu hoạch {harvestCount} vụ mùa rực rỡ
                </div>
              </div>
            </div>
          </div>

          {/* Seed Picker */}
          <div className="bg-white rounded-2xl border border-[#DCE8F8] p-3.5 space-y-2">
            <div className="text-xs font-extrabold text-[#163A70]">
              1. Chọn hạt giống để gieo vào ô trống
            </div>
            <div className="grid grid-cols-2 gap-2">
              {CROPS.map((crop) => {
                const locked = crop.unlockLevel > farmLevel;
                const active = selectedCropId === crop.id;
                return (
                  <button
                    key={crop.id}
                    type="button"
                    disabled={locked}
                    onClick={() => setSelectedCropId(crop.id)}
                    className={`p-2.5 rounded-xl border text-left transition-colors ${
                      locked
                        ? 'bg-[#F8FAFC] border-[#E2E8F0] opacity-55 cursor-not-allowed'
                        : active
                          ? 'bg-[#ECFDF5] border-[#059669] text-[#163A70]'
                          : 'bg-white border-[#E2ECF9] hover:border-[#059669]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg">{crop.emoji}</span>
                      <span className="text-[11px] font-extrabold text-[#CA8A04] tabular-nums">
                        {locked ? `Cấp ${crop.unlockLevel}` : `-${crop.seedCost} Xu`}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-[#163A70] mt-0.5">{crop.name}</div>
                    <div className="text-[11px] text-[#059669] font-semibold">
                      Bán +{crop.sellValue} Xu
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Barn Animals */}
          <div className="bg-white rounded-2xl border border-[#DCE8F8] p-3.5 space-y-2">
            <div className="text-xs font-extrabold text-[#163A70] flex items-center justify-between">
              <span>2. Chuồng thú vui nhộn (Trả lời 1 câu nhận Xu)</span>
              <Trophy className="w-3.5 h-3.5 text-[#D97706]" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {animals.map((animal) => (
                <button
                  key={animal.id}
                  type="button"
                  onClick={() => handleAnimalClick(animal)}
                  className={`p-2.5 rounded-xl border text-center transition-colors ${
                    animal.ready
                      ? 'bg-[#FFFBEB] border-[#FCD34D] hover:bg-[#FEF3C7]'
                      : 'bg-[#F8FAFC] border-[#E2E8F0] opacity-55'
                  }`}
                >
                  <div className="text-2xl">{animal.emoji}</div>
                  <div className="text-[11px] font-bold text-[#163A70] mt-0.5">
                    {animal.name}
                  </div>
                  <div className="text-[11px] font-extrabold text-[#CA8A04]">
                    {animal.ready ? `+${animal.rewardCoins} Xu` : 'Đang nghỉ'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 1-Screen Compact Question Modal */}
      {activeQuestion && activeAction && (
        <CompactQuestionModal
          mode="mcq"
          question={activeQuestion}
          badgeText={
            activeAction.kind === 'crow'
              ? '🐦‍⬛ Đuổi Quạ phá mùa (+30 Xu)'
              : activeAction.kind === 'water'
                ? '💧 Tưới nước Tri Thức giúp cây chín ngay!'
                : activeAction.kind === 'animal'
                  ? '🐄 Chăm sóc thú nuôi nhận thưởng Xu!'
                  : `🌱 Gieo hạt ${activeAction.crop.emoji} ${activeAction.crop.name}`
          }
          accentColor="#7C3AED"
          onResult={(r) => handleQuestionResult(r.isCorrect)}
        />
      )}
    </div>
  );
}
