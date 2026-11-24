import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Hash,
  Link2,
  Play,
  RefreshCw,
  UserPlus,
  Users,
} from 'lucide-react';
import { Grade } from '../types';

export interface LobbyPlayer {
  id: string;
  name: string;
  team?: string;
  carId?: string;
  isHuman?: boolean;
}

export interface CarPreset {
  id: string;
  name: string;
  bodyHex: number;
  trimHex: number;
  swatch: string;
}

export const RACE_CAR_PRESETS: CarPreset[] = [
  { id: 'red-bolt', name: 'Tia Chớp Đỏ', bodyHex: 0xef4444, trimHex: 0xfef08a, swatch: '#EF4444' },
  { id: 'sky-arrow', name: 'Mũi Tên Xanh', bodyHex: 0x2563eb, trimHex: 0x38bdf8, swatch: '#2563EB' },
  { id: 'mint-turbo', name: 'Ngọc Bích Turbo', bodyHex: 0x10b981, trimHex: 0xffffff, swatch: '#10B981' },
  { id: 'violet-star', name: 'Bão Tím Sao', bodyHex: 0x8b5cf6, trimHex: 0xfde047, swatch: '#8B5CF6' },
];

const GRADE_OPTIONS: Grade[] = [6, 7, 8, 9];

const ROSTER_BY_GRADE: Record<Grade, string[]> = {
  6: ['Ngọc Hân', 'Nhật Minh', 'Thanh Trúc', 'Gia Khánh', 'Bảo An', 'Minh Khôi'],
  7: ['Tuấn Kiệt', 'Phương Anh', 'Hải Đăng', 'Khánh Vy', 'Quang Minh', 'Thảo Nguyên'],
  8: ['Quốc Bảo', 'Thảo Vy', 'Gia Huy', 'Khánh Linh', 'Đức Mạnh', 'Hải Yến'],
  9: ['Minh Quân', 'Bảo Ngọc', 'Gia Bảo', 'Thu Trang', 'Hoàng Nam', 'Lan Anh'],
};

const TEAMS = ['Đội Mây Xanh', 'Đội Nắng Vàng', 'Đội Cầu Vồng'];

function generateRoomCode(grade: Grade): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `TIN${grade}-${digits}`;
}

interface ClassroomLobbyProps {
  gameId: string;
  title: string;
  subtitle: string;
  openButtonLabel: string;
  heroImage: string;
  accentColor: string;
  grade: Grade;
  defaultClassName?: string;
  defaultPlayerName: string;
  showCarPicker?: boolean;
  showTeams?: boolean;
  extraConfig?: React.ReactNode;
  onExit: () => void;
  onStartMatch: (config: {
    selectedGrade: Grade;
    className: string;
    playerName: string;
    carPreset: CarPreset;
    players: LobbyPlayer[];
  }) => void;
}

export default function ClassroomLobby({
  gameId,
  title,
  subtitle,
  openButtonLabel,
  heroImage,
  accentColor,
  grade,
  defaultPlayerName,
  showCarPicker = false,
  showTeams = false,
  extraConfig,
  onExit,
  onStartMatch,
}: ClassroomLobbyProps) {
  const [selectedGrade, setSelectedGrade] = useState<Grade>(grade);
  const [playerName, setPlayerName] = useState<string>(defaultPlayerName || 'Học sinh');
  const [selectedCar, setSelectedCar] = useState<CarPreset>(RACE_CAR_PRESETS[0]);
  const [selectedTeam, setSelectedTeam] = useState<string>(TEAMS[0]);
  const [roomCode, setRoomCode] = useState<string>(() => {
    const urlRoom = new URLSearchParams(window.location.search).get('room');
    return urlRoom && urlRoom.trim().length >= 4
      ? urlRoom.trim().toUpperCase()
      : generateRoomCode(grade);
  });
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [customPlayerInput, setCustomPlayerInput] = useState('');
  const [extraPlayers, setExtraPlayers] = useState<string[]>([]);
  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);
  const [roomNotice, setRoomNotice] = useState<string | null>(null);

  useEffect(() => {
    setSelectedGrade(grade);
  }, [grade]);

  const classNamesList = useMemo(() => {
    const base = ROSTER_BY_GRADE[selectedGrade] ?? ROSTER_BY_GRADE[8];
    const merged = [...extraPlayers, ...base];
    return Array.from(new Set(merged));
  }, [extraPlayers, selectedGrade]);

  const joinUrl = useMemo(() => {
    const base = `${window.location.origin}${window.location.pathname}`;
    const params = new URLSearchParams({
      game: gameId,
      grade: String(selectedGrade),
      room: roomCode,
    });
    return `${base}?${params.toString()}`;
  }, [gameId, roomCode, selectedGrade]);

  const handleGradeChange = (nextGrade: Grade) => {
    setSelectedGrade(nextGrade);
    setRoomCode((prev) =>
      /^TIN[6-9]-\d{4}$/.test(prev)
        ? `TIN${nextGrade}-${prev.slice(-4)}`
        : generateRoomCode(nextGrade)
    );
  };

  const handleCopy = async (text: string, type: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setRoomNotice(
        type === 'code'
          ? `Đã sao chép mã phòng ${roomCode}!`
          : 'Đã sao chép đường dẫn tham gia lớp học!'
      );
      window.setTimeout(() => setCopiedType(null), 2000);
    } catch {
      setRoomNotice(
        type === 'code'
          ? `Mã phòng hiện tại: ${roomCode}`
          : `Đường dẫn phòng: ${joinUrl}`
      );
    }
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCodeInput.trim().toUpperCase();
    if (cleaned.length < 3) return;
    setRoomCode(cleaned);
    setJoinCodeInput('');
    setRoomNotice(`Đã tham gia phòng ${cleaned} thành công!`);
  };

  const handleAddClassmate = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customPlayerInput.trim();
    if (!cleaned) return;
    setExtraPlayers((prev) => [cleaned, ...prev.filter((n) => n !== cleaned)]);
    setCustomPlayerInput('');
  };

  const handleLaunch = () => {
    const cleanName = playerName.trim() || 'Bạn';
    const finalPlayers: LobbyPlayer[] = [
      {
        id: 'player-self',
        name: cleanName,
        team: selectedTeam,
        carId: selectedCar.id,
        isHuman: true,
      },
      ...classNamesList
        .filter((nm) => nm !== cleanName)
        .slice(0, 5)
        .map((nm, i) => ({
          id: `bot-${i + 1}`,
          name: nm,
          team: TEAMS[(i + 1) % TEAMS.length],
          carId: RACE_CAR_PRESETS[(i + 1) % RACE_CAR_PRESETS.length].id,
        })),
    ];

    onStartMatch({
      selectedGrade,
      className: String(selectedGrade),
      playerName: cleanName,
      carPreset: selectedCar,
      players: finalPlayers,
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#647899] hover:text-[#163A70] transition-colors touch-manipulation"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại danh sách trò chơi
        </button>
        <div className="text-xs font-semibold text-[#2563EB] tabular-nums">
          Tin học {selectedGrade} · Mã phòng: {roomCode}
        </div>
      </div>

      {/* Main Bright Card */}
      <div className="bg-white rounded-3xl border border-[#DCE8F8] overflow-hidden shadow-xs">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Left Visual & Match Setup */}
          <div className="lg:col-span-5 relative bg-[#EFF6FF] flex flex-col justify-between">
            <div className="h-44 lg:h-52 relative overflow-hidden">
              <img
                src={heroImage}
                alt={title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#163A70]/75 via-[#163A70]/15 to-transparent" />
              <div className="absolute bottom-3 left-4 right-4 text-white">
                <div className="text-xs font-semibold text-[#BAE6FD]">{subtitle}</div>
                <h1 className="text-xl font-bold leading-tight">{title}</h1>
              </div>
            </div>

            <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-[#163A70] mb-1.5">
                    1. Chọn lớp tham gia
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {GRADE_OPTIONS.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => handleGradeChange(g)}
                        className={`py-2.5 rounded-xl text-sm font-extrabold border transition-colors touch-manipulation ${
                          selectedGrade === g
                            ? 'bg-[#2563EB] text-white border-[#2563EB] shadow-xs'
                            : 'bg-white text-[#1A2B49] border-[#D8E5F7] hover:border-[#2563EB]'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {extraConfig}

                {showCarPicker && (
                  <div>
                    <label className="block text-xs font-bold text-[#163A70] mb-1.5">
                      2. Chọn mẫu xe 3D của bạn
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {RACE_CAR_PRESETS.map((car) => {
                        const active = selectedCar.id === car.id;
                        return (
                          <button
                            key={car.id}
                            type="button"
                            onClick={() => setSelectedCar(car)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left text-xs font-semibold transition-colors touch-manipulation ${
                              active
                                ? 'bg-white border-[#2563EB] text-[#163A70] shadow-xs'
                                : 'bg-white/70 border-[#DCE8F8] text-[#526582] hover:bg-white'
                            }`}
                          >
                            <span
                              className="w-4 h-4 rounded-full shrink-0 border border-black/10"
                              style={{ backgroundColor: car.swatch }}
                            />
                            <span className="truncate">{car.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {showTeams && (
                  <div>
                    <label className="block text-xs font-bold text-[#163A70] mb-1.5">
                      3. Chọn đội thi đua của bạn
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {TEAMS.map((team) => {
                        const active = selectedTeam === team;
                        return (
                          <button
                            key={team}
                            type="button"
                            onClick={() => setSelectedTeam(team)}
                            className={`py-2 px-2 rounded-xl border text-center text-[11px] font-bold transition-colors touch-manipulation ${
                              active
                                ? 'bg-[#0284C7] text-white border-[#0284C7]'
                                : 'bg-white text-[#1A2B49] border-[#D8E5F7] hover:border-[#0284C7]'
                            }`}
                          >
                            {team.replace('Đội ', '')}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleLaunch}
                style={{ backgroundColor: accentColor }}
                className="w-full py-3 px-4 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 hover:opacity-95 transition-opacity touch-manipulation"
              >
                <Play className="w-4 h-4 fill-current" />
                {openButtonLabel}
              </button>
            </div>
          </div>

          {/* Right: Classroom Room Code, Share Link & Classmates Roster (NO QR Code) */}
          <div className="lg:col-span-7 p-6 flex flex-col justify-between bg-white space-y-5">
            <div className="space-y-4">
              {/* Room Code & Direct Share Link Panel (No QR Code) */}
              <div className="p-4 rounded-2xl bg-[#F4F9FF] border border-[#DCE8F8] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-extrabold text-[#2563EB] flex items-center gap-1">
                      <Hash className="w-3.5 h-3.5" />
                      PHÒNG THI ĐUA LỚP {selectedGrade}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xl sm:text-2xl font-extrabold tracking-wider text-[#163A70] tabular-nums">
                        {roomCode}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = generateRoomCode(selectedGrade);
                          setRoomCode(next);
                          setRoomNotice(`Đã tạo mã phòng mới: ${next}`);
                        }}
                        className="p-1.5 rounded-lg bg-white border border-[#DCE8F8] text-[#526582] hover:text-[#163A70]"
                        title="Tạo mã phòng mới"
                        aria-label="Tạo mã phòng mới"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopy(roomCode, 'code')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#D4E6FA] hover:border-[#2563EB] text-xs font-bold text-[#163A70] transition-colors"
                    >
                      {copiedType === 'code' ? (
                        <Check className="w-3.5 h-3.5 text-[#10B981]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-[#2563EB]" />
                      )}
                      Sao chép mã
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopy(joinUrl, 'link')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-xs font-bold text-white transition-colors"
                    >
                      {copiedType === 'link' ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Link2 className="w-3.5 h-3.5" />
                      )}
                      Sao chép link mời
                    </button>
                  </div>
                </div>

                {/* Join existing room code form */}
                <form
                  onSubmit={handleJoinByCode}
                  className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-[#E2ECF9]"
                >
                  <input
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value)}
                    placeholder="Hoặc nhập mã phòng của giáo viên (VD: TIN8-1234)..."
                    className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#DCE8F8] text-xs font-semibold text-[#1A2B49] focus:outline-none focus:border-[#2563EB]"
                  />
                  <button
                    type="submit"
                    disabled={joinCodeInput.trim().length < 3}
                    className="px-3.5 py-2 rounded-xl bg-[#163A70] hover:bg-[#1E4A8A] disabled:opacity-40 text-white text-xs font-bold transition-colors whitespace-nowrap"
                  >
                    Vào mã phòng
                  </button>
                </form>

                {roomNotice && (
                  <div className="text-[11px] font-semibold text-[#059669]">
                    {roomNotice}
                  </div>
                )}
              </div>

              {/* Player Name + Live Classroom Roster */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[#163A70] flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-[#2563EB]" />
                    Người chơi trong phòng ({classNamesList.length} bạn lớp {selectedGrade})
                  </span>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Nhập tên của bạn..."
                    className="px-3 py-1.5 rounded-lg border border-[#DCE8F8] text-xs font-semibold text-[#1A2B49] sm:w-48 focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {classNamesList.slice(0, 9).map((nm, idx) => {
                    const isMe = playerName === nm;
                    const teamLabel = TEAMS[idx % TEAMS.length];
                    return (
                      <button
                        key={nm}
                        type="button"
                        onClick={() => setPlayerName(nm)}
                        className={`px-3 py-2 rounded-xl border text-left transition-colors touch-manipulation ${
                          isMe
                            ? 'bg-[#EEF6FF] border-[#2563EB] text-[#163A70]'
                            : 'bg-white border-[#E4EDF9] hover:border-[#93C5FD] text-[#1A2B49]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold truncate">{nm}</span>
                          {isMe && <Check className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />}
                        </div>
                        {showTeams && (
                          <div className="text-[11px] text-[#647899] mt-0.5">{teamLabel}</div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Quick Add Classmate to Lobby */}
                <form
                  onSubmit={handleAddClassmate}
                  className="flex items-center gap-2 pt-1"
                >
                  <input
                    type="text"
                    value={customPlayerInput}
                    onChange={(e) => setCustomPlayerInput(e.target.value)}
                    placeholder="Thêm tên học sinh cùng thi đua..."
                    className="flex-1 px-3 py-1.5 rounded-lg border border-[#E4EDF9] text-xs text-[#1A2B49] focus:outline-none focus:border-[#2563EB]"
                  />
                  <button
                    type="submit"
                    disabled={!customPlayerInput.trim()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#EEF6FF] hover:bg-[#DBEAFE] disabled:opacity-45 text-[#163A70] text-xs font-bold transition-colors whitespace-nowrap"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-[#2563EB]" />
                    Thêm vào phòng
                  </button>
                </form>
              </div>
            </div>

            <div className="pt-4 border-t border-[#EDF4FC] flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-[#647899]">
                Câu hỏi sẽ được chọn tự động từ ngân hàng{' '}
                <strong className="text-[#163A70]">Tin học {selectedGrade}</strong>.
              </span>
              <button
                type="button"
                onClick={handleLaunch}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-sm font-bold transition-colors touch-manipulation"
              >
                <Play className="w-4 h-4 fill-current" />
                Bắt đầu chơi ngay!
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
