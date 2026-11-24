import React from 'react';
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Gamepad2,
  Play,
  TrendingUp,
} from 'lucide-react';
import { CURRICULUM_CHAPTERS } from '../../data/curriculum';
import { FEATURED_GAMES_LIST } from '../../data/games';
import {
  GameId,
  Grade,
  NavSection,
  StudentProgress,
  UserProfile,
} from '../types';

interface OverviewViewProps {
  user: UserProfile;
  progress: StudentProgress;
  onNavigate: (section: NavSection) => void;
  onQuickStartGame: (gameId: GameId, grade: Grade) => void;
}

function formatRelativeTime(iso: string): string {
  const diffMin = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} giờ trước`;
  return `${Math.floor(diffHr / 24)} ngày trước`;
}

export default function OverviewView({
  user,
  progress,
  onNavigate,
  onQuickStartGame,
}: OverviewViewProps) {
  const gradeChapters = CURRICULUM_CHAPTERS.filter((c) => c.grade === user.grade);
  const gradeLessons = gradeChapters.flatMap((c) => c.lessons);
  const completedInGrade = gradeLessons.filter((l) =>
    progress.completedLessonIds.includes(l.id)
  ).length;

  const totalPoints = progress.sessions.reduce((sum, s) => sum + s.score, 0);
  const totalAnswered = progress.sessions.reduce((sum, s) => sum + s.totalQuestions, 0);
  const totalCorrect = progress.sessions.reduce((sum, s) => sum + s.correctCount, 0);
  const avgAccuracy =
    totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  const gradeTopicStats = Object.values(progress.topicStats).filter(
    (t) => t.grade === user.grade
  );

  return (
    <div className="space-y-7">
      {/* Bright Welcome Header Banner */}
      <section className="bg-gradient-to-r from-[#E0F2FE] via-[#EEF7FF] to-[#ECFDF5] border border-[#C6E4FD] rounded-3xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-extrabold text-[#0284C7] mb-1">
            Xin chào, {user.name} ·{' '}
            {user.role === 'admin'
              ? 'Quản trị hệ thống'
              : user.role === 'teacher'
                ? 'Giáo viên Tin học'
                : `Lớp ${user.className} · Tin học ${user.grade}`}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#163A70] tracking-tight">
            Tổng quan học tập hôm nay
          </h1>
          <p className="text-sm text-[#4B6384] mt-1">
            Học bài mới, luyện tập nhanh và thi đua cùng cả lớp qua các trò chơi 3D & Nông Trại Tin học THCS.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('practice')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-[#CFE2FA] hover:border-[#2563EB] text-sm font-bold text-[#163A70] transition-colors whitespace-nowrap"
          >
            <ClipboardCheck className="w-4 h-4 text-[#2563EB]" />
            Luyện tập ngay
          </button>
          <button
            type="button"
            onClick={() => onNavigate('games')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-bold transition-colors whitespace-nowrap shadow-xs"
          >
            <Gamepad2 className="w-4 h-4" />
            Vào Trò chơi kiến thức
          </button>
        </div>
      </section>

      {/* 4 KPI Summary Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-[#E4EBF5] p-5">
          <div className="text-xs font-medium text-[#71809A]">Bài học Tin học {user.grade}</div>
          <div className="text-2xl font-bold text-[#102A56] tabular-nums mt-1.5">
            {completedInGrade}/{gradeLessons.length}
          </div>
          <div className="text-xs text-[#159B72] font-medium mt-1">
            Đã hoàn thành {gradeLessons.length > 0 ? Math.round((completedInGrade / gradeLessons.length) * 100) : 0}%
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E4EBF5] p-5">
          <div className="text-xs font-medium text-[#71809A]">Điểm tích lũy</div>
          <div className="text-2xl font-bold text-[#2864E8] tabular-nums mt-1.5">
            {totalPoints}
          </div>
          <div className="text-xs text-[#71809A] mt-1 tabular-nums">
            Từ {progress.sessions.length} lượt học & chơi
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E4EBF5] p-5">
          <div className="text-xs font-medium text-[#71809A]">Độ chính xác trung bình</div>
          <div className="text-2xl font-bold text-[#159B72] tabular-nums mt-1.5">
            {avgAccuracy}%
          </div>
          <div className="text-xs text-[#71809A] mt-1 tabular-nums">
            {totalCorrect}/{totalAnswered} câu trả lời đúng
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E4EBF5] p-5">
          <div className="text-xs font-medium text-[#71809A]">Chuỗi ngày học liên tiếp</div>
          <div className="text-2xl font-bold text-[#E7A23B] tabular-nums mt-1.5">
            {progress.dailyStreak} ngày
          </div>
          <div className="text-xs text-[#71809A] mt-1">
            Duy trì mỗi ngày 10 phút
          </div>
        </div>
      </section>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Featured 4 New 3D & Farm Games Quick Launcher */}
        <section className="lg:col-span-7 bg-white rounded-3xl border border-[#DCE8F8] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-[#163A70]">
                Sân chơi 3D & Nông trại nổi bật · Tin học {user.grade}
              </h2>
              <p className="text-xs text-[#647899] mt-0.5">
                Câu hỏi lấy trực tiếp theo khối lớp của bạn · Chơi vui cùng cả lớp ngay trên mọi thiết bị.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('games')}
              className="text-xs font-bold text-[#2563EB] hover:underline whitespace-nowrap shrink-0"
            >
              Xem tất cả →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {FEATURED_GAMES_LIST.map((game) => {
              const rec = progress.gameRecords[game.id];
              return (
                <div
                  key={game.id}
                  style={{ borderColor: game.borderColor }}
                  className="rounded-2xl border bg-white overflow-hidden flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <div className="relative h-28 bg-[#EFF6FF] overflow-hidden">
                    <img
                      src={game.imageUrl}
                      alt={game.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#163A70]/75 via-[#163A70]/15 to-transparent" />
                    <div className="absolute bottom-2 left-3 right-3 text-white">
                      <div className="text-sm font-extrabold leading-snug flex items-center gap-1">
                        <span>{game.emoji}</span>
                        <span className="truncate">{game.title}</span>
                      </div>
                      <div className="text-[11px] text-[#E0F2FE] truncate">{game.subtitle}</div>
                    </div>
                  </div>

                  <div
                    style={{ backgroundColor: game.bgColor }}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-2"
                  >
                    <span className="text-xs font-semibold text-[#4B6384] tabular-nums truncate">
                      {rec ? `Kỷ lục: ${rec.bestScore}đ` : `Tin học ${user.grade}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => onQuickStartGame(game.id, user.grade)}
                      style={{ backgroundColor: game.accentColor }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-xs font-bold hover:opacity-95 transition-opacity whitespace-nowrap shrink-0"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      Chơi ngay
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right: Mastery Snapshot + Recent Activity */}
        <div className="lg:col-span-5 space-y-6">
          {/* Topic Mastery */}
          <section className="bg-white rounded-2xl border border-[#E4EBF5] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#102A56] flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#2864E8]" />
                Mức độ nắm vững chủ đề
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('progress')}
                className="text-xs font-semibold text-[#2864E8] hover:underline"
              >
                Chi tiết
              </button>
            </div>

            {gradeTopicStats.length > 0 ? (
              <div className="space-y-3.5">
                {gradeTopicStats.slice(0, 4).map((stat) => {
                  const pct = Math.round((stat.correct / Math.max(1, stat.total)) * 100);
                  const barColor =
                    pct >= 80 ? '#159B72' : pct >= 60 ? '#2864E8' : '#E7A23B';
                  return (
                    <div key={stat.topic} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[#17233C] truncate pr-2">
                          {stat.topic}
                        </span>
                        <span className="font-semibold text-[#102A56] tabular-nums shrink-0">
                          {pct}% ({stat.correct}/{stat.total})
                        </span>
                      </div>
                      <div className="h-2 bg-[#EEF3FA] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: barColor }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-[#71809A]">
                Hoàn thành một lượt luyện tập hoặc trò chơi Tin học {user.grade} để xem mức độ thành thạo theo từng chủ đề.
              </p>
            )}
          </section>

          {/* Recent Activity */}
          <section className="bg-white rounded-2xl border border-[#E4EBF5] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#102A56]">Hoạt động gần đây</h2>
              <button
                type="button"
                onClick={() => onNavigate('curriculum')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#2864E8] hover:underline"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Học bài mới
              </button>
            </div>

            <div className="divide-y divide-[#EDF2F9]">
              {progress.sessions.slice(0, 4).map((session) => (
                <div
                  key={session.id}
                  className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#17233C] truncate">
                      {session.title}
                    </div>
                    <div className="text-xs text-[#71809A] mt-0.5">
                      Tin học {session.grade} · {formatRelativeTime(session.completedAt)}
                    </div>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <div className="text-sm font-bold text-[#2864E8]">
                      {session.score} điểm
                    </div>
                    <div className="text-xs text-[#159B72]">
                      {session.correctCount}/{session.totalQuestions} đúng
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onNavigate('assistant')}
              className="w-full pt-3 border-t border-[#EDF2F9] flex items-center justify-between text-xs font-semibold text-[#102A56] hover:text-[#2864E8] transition-colors"
            >
              <span>Cần giải đáp nhanh bài tập Tin học? Hỏi Trợ lý học tập</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
