import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Dices,
  Gift,
  RotateCcw,
  Sparkles,
  Trophy,
  Users,
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

interface MysteryGiftBoxGameProps {
  grade: Grade;
  playerName: string;
  customQuestions: Question[];
  onExit: () => void;
  onCompleteSession: (
    session: Omit<SessionRecord, 'id' | 'completedAt'>,
    topicBreakdown: { grade: Grade; topic: string; isCorrect: boolean }[]
  ) => void;
}

interface RewardSpec {
  emoji: string;
  label: string;
  points: number;
  grantsDouble?: boolean;
}

interface GiftBoxItem {
  id: number;
  question: Question;
  reward: RewardSpec;
  status: 'locked' | 'opened' | 'missed';
  openedByTeam?: 0 | 1;
  earnedPoints?: number;
  ribbonColor: string;
  boxBg: string;
  boxBorder: string;
}

const BOX_STYLES = [
  { boxBg: '#FFF1F2', boxBorder: '#FDA4AF', ribbonColor: '#E11D48' },
  { boxBg: '#EFF6FF', boxBorder: '#93C5FD', ribbonColor: '#2563EB' },
  { boxBg: '#ECFDF5', boxBorder: '#6EE7B7', ribbonColor: '#059669' },
  { boxBg: '#FEFCE8', boxBorder: '#FDE047', ribbonColor: '#CA8A04' },
  { boxBg: '#F5F3FF', boxBorder: '#C4B5FD', ribbonColor: '#7C3AED' },
  { boxBg: '#ECFEFF', boxBorder: '#67E8F9', ribbonColor: '#0891B2' },
  { boxBg: '#FFF7ED', boxBorder: '#FDBA74', ribbonColor: '#EA580C' },
  { boxBg: '#FDF2F8', boxBorder: '#F9A8D4', ribbonColor: '#DB2777' },
  { boxBg: '#F0FDF4', boxBorder: '#86EFAC', ribbonColor: '#16A34A' },
];

const REWARD_POOL: RewardSpec[] = [
  { emoji: '💎', label: 'Kim cương rực rỡ', points: 50 },
  { emoji: '⭐', label: 'Ngôi sao vàng', points: 30 },
  { emoji: '🔥', label: 'Thẻ Nhân Đôi x2 lượt sau', points: 20, grantsDouble: true },
  { emoji: '🏆', label: 'Cúp Trí Tuệ', points: 40 },
  { emoji: '🎁', label: 'Hộp Quà May Mắn', points: 35 },
  { emoji: '🌟', label: 'Sao Siêu Tốc', points: 25 },
  { emoji: '👑', label: 'Vương miện Tin học', points: 45 },
  { emoji: '🍀', label: 'Cỏ bốn lá may mắn', points: 25 },
  { emoji: '🚀', label: 'Tên lửa điểm số', points: 30 },
];

export default function MysteryGiftBoxGame({
  grade,
  playerName,
  customQuestions,
  onExit,
  onCompleteSession,
}: MysteryGiftBoxGameProps) {
  const gameMeta = FEATURED_GAMES_LIST.find((g) => g.id === 'mystery-gift-box')!;

  const buildBoxes = useCallback((): GiftBoxItem[] => {
    const qs = pickRandomQuestions(grade, 9, { customQuestions });
    const shuffledRewards = [...REWARD_POOL].sort(() => Math.random() - 0.5);
    return qs.slice(0, 9).map((q, idx) => ({
      id: idx + 1,
      question: q,
      reward: shuffledRewards[idx % shuffledRewards.length],
      status: 'locked',
      ...BOX_STYLES[idx % BOX_STYLES.length],
    }));
  }, [customQuestions, grade]);

  const [boxes, setBoxes] = useState<GiftBoxItem[]>(() => buildBoxes());
  const [teamMode, setTeamMode] = useState(false);
  const [activeTeam, setActiveTeam] = useState<0 | 1>(0);
  const [teamScores, setTeamScores] = useState<[number, number]>([0, 0]);
  const [soloScore, setSoloScore] = useState(0);
  const [doubleNext, setDoubleNext] = useState(false);
  const [activeBoxId, setActiveBoxId] = useState<number | null>(null);
  const [spinningId, setSpinningId] = useState<number | null>(null);
  const [muted, setMuted] = useState(() => isSoundMuted());
  const [finished, setFinished] = useState(false);
  const [banner, setBanner] = useState(
    'Chọn 1 trong 9 hộp quà rực rỡ hoặc bấm Quay hộp ngẫu nhiên để bắt đầu khui quà!'
  );
  const [topicLog, setTopicLog] = useState<
    { grade: Grade; topic: string; isCorrect: boolean }[]
  >([]);

  const startTimeRef = useRef(Date.now());
  const recordedRef = useRef(false);

  const activeBox = useMemo(
    () => boxes.find((b) => b.id === activeBoxId) ?? null,
    [activeBoxId, boxes]
  );

  const remainingLocked = useMemo(
    () => boxes.filter((b) => b.status === 'locked'),
    [boxes]
  );

  const finishGame = useCallback(
    (
      finalBoxes: GiftBoxItem[],
      finalSoloScore: number,
      finalTeamScores: [number, number],
      log: { grade: Grade; topic: string; isCorrect: boolean }[]
    ) => {
      setFinished(true);
      playVictorySound();
      if (!recordedRef.current) {
        recordedRef.current = true;
        const openedCount = finalBoxes.filter((b) => b.status === 'opened').length;
        const totalScore = teamMode
          ? Math.max(finalTeamScores[0], finalTeamScores[1])
          : finalSoloScore;
        onCompleteSession(
          {
            type: 'game',
            title: 'Mở Hộp Quà Bí Ẩn',
            gameId: 'mystery-gift-box',
            grade,
            score: totalScore,
            maxScore: 310,
            correctCount: openedCount,
            totalQuestions: finalBoxes.length,
            durationSeconds: Math.max(
              10,
              Math.round((Date.now() - startTimeRef.current) / 1000)
            ),
          },
          log
        );
      }
    },
    [grade, onCompleteSession, teamMode]
  );

  const handleRandomPick = () => {
    if (remainingLocked.length === 0 || spinningId !== null || activeBoxId !== null) return;
    playBoostSound();
    let steps = 0;
    const maxSteps = 10;
    const timer = window.setInterval(() => {
      const pick = remainingLocked[Math.floor(Math.random() * remainingLocked.length)];
      setSpinningId(pick.id);
      steps += 1;
      if (steps >= maxSteps) {
        window.clearInterval(timer);
        setSpinningId(null);
        setActiveBoxId(pick.id);
      }
    }, 95);
  };

  const handleBoxAnswer = (isCorrect: boolean) => {
    if (!activeBox) return;
    const targetBox = activeBox;
    setActiveBoxId(null);

    const nextLog = [
      ...topicLog,
      { grade: targetBox.question.grade, topic: targetBox.question.topic, isCorrect },
    ];
    setTopicLog(nextLog);

    let earned = 0;
    let nextSolo = soloScore;
    let nextTeams: [number, number] = [teamScores[0], teamScores[1]];

    if (isCorrect) {
      playCorrectSound();
      playHarvestSound();
      const multiplier = doubleNext ? 2 : 1;
      earned = targetBox.reward.points * multiplier;
      nextSolo = soloScore + earned;
      if (teamMode) {
        nextTeams =
          activeTeam === 0
            ? [teamScores[0] + earned, teamScores[1]]
            : [teamScores[0], teamScores[1] + earned];
      }
      setSoloScore(nextSolo);
      setTeamScores(nextTeams);
      setDoubleNext(Boolean(targetBox.reward.grantsDouble));
      setBanner(
        `${targetBox.reward.emoji} Khui thành công Hộp #${targetBox.id}: ${targetBox.reward.label} (+${earned} điểm${
          multiplier === 2 ? ' · đã nhân đôi x2!' : ''
        })${targetBox.reward.grantsDouble ? ' — Lượt sau sẽ được x2 điểm!' : ''}`
      );
    } else {
      playWrongSound();
      setDoubleNext(false);
      setBanner(
        `😅 Hộp #${targetBox.id} tạm đóng khóa vì chưa chính xác — Hãy thử vận may ở hộp tiếp theo nhé!`
      );
    }

    const updatedBoxes: GiftBoxItem[] = boxes.map((b) =>
      b.id === targetBox.id
        ? {
            ...b,
            status: isCorrect ? 'opened' : 'missed',
            openedByTeam: teamMode ? activeTeam : undefined,
            earnedPoints: earned,
          }
        : b
    );
    setBoxes(updatedBoxes);

    if (teamMode) {
      setActiveTeam((prev) => (prev === 0 ? 1 : 0));
    }

    if (updatedBoxes.every((b) => b.status !== 'locked')) {
      window.setTimeout(() => {
        finishGame(updatedBoxes, nextSolo, nextTeams, nextLog);
      }, 650);
    }
  };

  const handleRestart = () => {
    setBoxes(buildBoxes());
    setSoloScore(0);
    setTeamScores([0, 0]);
    setActiveTeam(0);
    setDoubleNext(false);
    setActiveBoxId(null);
    setFinished(false);
    setTopicLog([]);
    recordedRef.current = false;
    startTimeRef.current = Date.now();
    setBanner('Bộ 9 hộp quà mới đã sẵn sàng! Chọn hộp hoặc bấm Quay ngẫu nhiên.');
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
  };

  const openedCount = boxes.filter((b) => b.status === 'opened').length;

  // ==================== SUMMARY SCREEN ====================
  if (finished) {
    const winnerText = teamMode
      ? teamScores[0] > teamScores[1]
        ? '🏆 Đội Xanh giành chiến thắng!'
        : teamScores[1] > teamScores[0]
          ? '🏆 Đội Cam giành chiến thắng!'
          : '🤝 Hai đội hòa điểm đầy kịch tính!'
      : `Chúc mừng ${playerName} đã khui hết 9 hộp quà!`;

    return (
      <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-[#FECDD3] p-6 sm:p-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[#FFF1F2] border border-[#FECDD3] mx-auto flex items-center justify-center text-3xl">
          🎁
        </div>
        <div>
          <div className="text-xs font-extrabold text-[#E11D48]">
            Mở Hộp Quà Bí Ẩn · Tin học {grade}
          </div>
          <h2 className="text-2xl font-extrabold text-[#163A70] mt-1">{winnerText}</h2>
        </div>

        {teamMode ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-[#EFF6FF] border border-[#BFDBFE]">
              <div className="text-xs font-bold text-[#2563EB]">Đội Xanh</div>
              <div className="text-2xl font-extrabold text-[#163A70] tabular-nums mt-1">
                {teamScores[0]} điểm
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-[#FFF7ED] border border-[#FED7AA]">
              <div className="text-xs font-bold text-[#EA580C]">Đội Cam</div>
              <div className="text-2xl font-extrabold text-[#163A70] tabular-nums mt-1">
                {teamScores[1]} điểm
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-[#FFF1F2]">
              <div className="text-xs text-[#647899]">Tổng điểm thưởng</div>
              <div className="text-2xl font-extrabold text-[#E11D48] tabular-nums">
                {soloScore} điểm
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-[#ECFDF5]">
              <div className="text-xs text-[#647899]">Hộp quà khui thành công</div>
              <div className="text-2xl font-extrabold text-[#059669] tabular-nums">
                {openedCount}/{boxes.length} hộp
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={handleRestart}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-bold"
          >
            <RotateCcw className="w-4 h-4" />
            Mở bộ hộp quà mới
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

  // ==================== 1-SCREEN MYSTERY GIFT BOX BOARD ====================
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
            🎁 Mở Hộp Quà Bí Ẩn · Tin học {grade}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => setTeamMode((m) => !m)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-colors ${
              teamMode
                ? 'bg-[#EFF6FF] border-[#93C5FD] text-[#2563EB]'
                : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#475569]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            {teamMode ? 'Đang bật: 2 Đội lớp học' : 'Chế độ: Chơi đơn'}
          </button>

          {teamMode ? (
            <div className="flex items-center gap-2 tabular-nums">
              <span
                className={`px-2.5 py-1 rounded-lg ${
                  activeTeam === 0
                    ? 'bg-[#2563EB] text-white'
                    : 'bg-[#EFF6FF] text-[#2563EB]'
                }`}
              >
                Đội Xanh: {teamScores[0]}đ
              </span>
              <span
                className={`px-2.5 py-1 rounded-lg ${
                  activeTeam === 1
                    ? 'bg-[#EA580C] text-white'
                    : 'bg-[#FFF7ED] text-[#EA580C]'
                }`}
              >
                Đội Cam: {teamScores[1]}đ
              </span>
            </div>
          ) : (
            <span className="text-[#E11D48] tabular-nums inline-flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5" />
              {soloScore} điểm
            </span>
          )}

          {doubleNext && (
            <span className="px-2 py-1 rounded-lg bg-[#FEF9C3] text-[#A16207]">
              🔥 Đang có x2 lượt này!
            </span>
          )}

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

      {/* Main 1-Screen Board */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left 3x3 Mystery Gift Grid */}
        <div className="lg:col-span-8 bg-gradient-to-br from-[#FFF1F2] via-[#FFFFFF] to-[#EFF6FF] rounded-3xl border border-[#FECDD3] p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white/95 rounded-2xl px-3.5 py-2 border border-[#FFE4E6]">
            <span className="text-xs font-bold text-[#163A70] leading-snug">{banner}</span>
            <button
              type="button"
              disabled={remainingLocked.length === 0 || spinningId !== null}
              onClick={handleRandomPick}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-45 text-white text-xs font-bold whitespace-nowrap shrink-0 transition-colors"
            >
              <Dices className="w-3.5 h-3.5" />
              Quay hộp ngẫu nhiên
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {boxes.map((box) => {
              const isHighlighted = spinningId === box.id;
              return (
                <button
                  key={box.id}
                  type="button"
                  disabled={box.status !== 'locked'}
                  onClick={() => setActiveBoxId(box.id)}
                  style={{
                    backgroundColor:
                      box.status === 'opened'
                        ? '#ECFDF5'
                        : box.status === 'missed'
                          ? '#F8FAFC'
                          : box.boxBg,
                    borderColor: isHighlighted
                      ? '#E11D48'
                      : box.status === 'opened'
                        ? '#10B981'
                        : box.status === 'missed'
                          ? '#CBD5E1'
                          : box.boxBorder,
                  }}
                  className={`relative rounded-2xl border-2 h-28 sm:h-32 p-3 flex flex-col items-center justify-center gap-1 transition-all ${
                    box.status === 'locked'
                      ? 'hover:-translate-y-1 hover:shadow-md cursor-pointer'
                      : 'cursor-default'
                  } ${isHighlighted ? 'scale-105 ring-4 ring-[#FDA4AF]' : ''}`}
                >
                  {box.status === 'locked' ? (
                    <>
                      <div
                        className="w-11 h-11 rounded-2xl bg-white/90 shadow-xs flex items-center justify-center text-2xl"
                        style={{ color: box.ribbonColor }}
                      >
                        <Gift className="w-6 h-6" />
                      </div>
                      <span
                        className="text-xs sm:text-sm font-extrabold mt-0.5"
                        style={{ color: box.ribbonColor }}
                      >
                        Hộp quà #{box.id}
                      </span>
                      <span className="text-[11px] font-medium text-[#647899]">
                        Chạm để khui quà
                      </span>
                    </>
                  ) : box.status === 'opened' ? (
                    <>
                      <span className="text-3xl">{box.reward.emoji}</span>
                      <span className="text-[11px] font-extrabold text-[#059669] leading-tight text-center">
                        {box.reward.label}
                      </span>
                      <span className="text-xs font-extrabold text-[#163A70] tabular-nums">
                        +{box.earnedPoints}đ
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl opacity-50">🔒</span>
                      <span className="text-xs font-bold text-[#94A3B8]">
                        Hộp #{box.id} · Chưa mở
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Info & Visual Panel */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <div className="relative h-36 rounded-2xl overflow-hidden border border-[#FECDD3]">
            <img
              src={gameMeta.imageUrl}
              alt="Mở Hộp Quà Bí Ẩn"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#163A70]/75 via-[#163A70]/20 to-transparent flex items-end p-4">
              <div className="text-white">
                <div className="text-[11px] font-bold text-[#FECDD3] inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Đã mở {openedCount}/9 hộp quà
                </div>
                <div className="text-sm font-extrabold">
                  {teamMode
                    ? `Đang đến lượt: ${activeTeam === 0 ? 'Đội Xanh' : 'Đội Cam'}`
                    : `Người chơi: ${playerName}`}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#DCE8F8] p-4 flex-1 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="text-xs font-extrabold text-[#163A70]">
                Bảng phần thưởng ẩn giấu bên trong
              </div>
              <div className="grid grid-cols-1 gap-1.5 text-xs text-[#4B6384]">
                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-[#FFF1F2]">
                  <span>💎 Kim cương rực rỡ</span>
                  <strong className="text-[#E11D48]">+50 điểm</strong>
                </div>
                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-[#FEFCE8]">
                  <span>👑 Vương miện / Cúp</span>
                  <strong className="text-[#CA8A04]">+40–45 điểm</strong>
                </div>
                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-[#EFF6FF]">
                  <span>🔥 Thẻ Nhân Đôi x2</span>
                  <strong className="text-[#2563EB]">x2 lượt sau</strong>
                </div>
                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-[#ECFDF5]">
                  <span>⭐ Ngôi sao / May mắn</span>
                  <strong className="text-[#059669]">+25–35 điểm</strong>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRestart}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#F4F8FF] hover:bg-[#E0EEFF] text-[#163A70] text-xs font-bold transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Đổi bộ 9 câu hỏi & trộn quà mới
            </button>
          </div>
        </div>
      </div>

      {/* 1-Screen Question Modal */}
      {activeBox && (
        <CompactQuestionModal
          mode="mcq"
          question={activeBox.question}
          badgeText={`🎁 Khui Hộp Quà #${activeBox.id}${
            teamMode ? ` · Lượt ${activeTeam === 0 ? 'Đội Xanh' : 'Đội Cam'}` : ''
          }`}
          accentColor="#E11D48"
          onResult={(r) => handleBoxAnswer(r.isCorrect)}
        />
      )}
    </div>
  );
}
