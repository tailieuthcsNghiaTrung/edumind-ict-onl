import React, { useMemo, useState } from 'react';
import { Award, BookOpen, CheckCircle2, Circle, Play, TrendingUp } from 'lucide-react';
import { CURRICULUM_CHAPTERS } from '../../data/curriculum';
import { GAMES_LIST } from '../../data/games';
import { GameId, Grade, StudentProgress } from '../types';

interface ProgressViewProps {
  progress: StudentProgress;
  defaultGrade: Grade;
  onStartGame: (gameId: GameId, grade: Grade) => void;
}

const GRADES: (Grade | 'all')[] = ['all', 6, 7, 8, 9];
const GRADE_LIST: Grade[] = [6, 7, 8, 9];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getMasteryStatus(pct: number): { label: string; color: string } {
  if (pct >= 80) return { label: 'Thành thạo', color: '#159B72' };
  if (pct >= 60) return { label: 'Khá tốt', color: '#2864E8' };
  return { label: 'Cần ôn tập', color: '#E7A23B' };
}

export default function ProgressView({
  progress,
  defaultGrade,
  onStartGame,
}: ProgressViewProps) {
  const [gradeFilter, setGradeFilter] = useState<Grade | 'all'>('all');
  const [lessonsGradeTab, setLessonsGradeTab] = useState<Grade>(defaultGrade);
  const [lessonStatusFilter, setLessonStatusFilter] = useState<'all' | 'done' | 'todo'>('all');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'game' | 'practice'>('all');

  const totalPoints = progress.sessions.reduce((sum, s) => sum + s.score, 0);
  const totalQuestions = progress.sessions.reduce((sum, s) => sum + s.totalQuestions, 0);
  const totalCorrect = progress.sessions.reduce((sum, s) => sum + s.correctCount, 0);
  const overallAccuracy =
    totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  // Completed lessons stats for default grade & selected tab grade
  const defaultGradeLessons = useMemo(
    () =>
      CURRICULUM_CHAPTERS.filter((c) => c.grade === defaultGrade).flatMap(
        (c) => c.lessons
      ),
    [defaultGrade]
  );
  const completedInDefaultGrade = useMemo(
    () =>
      defaultGradeLessons.filter((l) =>
        progress.completedLessonIds.includes(l.id)
      ).length,
    [defaultGradeLessons, progress.completedLessonIds]
  );
  const defaultGradeCompletionPct =
    defaultGradeLessons.length > 0
      ? Math.round((completedInDefaultGrade / defaultGradeLessons.length) * 100)
      : 0;

  const tabGradeLessons = useMemo(
    () =>
      CURRICULUM_CHAPTERS.filter((c) => c.grade === lessonsGradeTab).flatMap((c) =>
        c.lessons.map((lesson, idx) => {
          const isDone = progress.completedLessonIds.includes(lesson.id);
          const topicStat = Object.values(progress.topicStats).find(
            (t) =>
              t.grade === lessonsGradeTab &&
              t.topic.trim().toLowerCase() === lesson.title.trim().toLowerCase()
          );
          const practiceSessions = progress.sessions.filter(
            (s) =>
              s.grade === lessonsGradeTab &&
              s.type === 'practice' &&
              (s.topic?.trim().toLowerCase() === lesson.title.trim().toLowerCase() ||
                s.title.toLowerCase().includes(lesson.title.trim().toLowerCase()))
          );
          const accuracyPct =
            topicStat && topicStat.total > 0
              ? Math.round((topicStat.correct / topicStat.total) * 100)
              : null;
          return {
            ...lesson,
            lessonNum: lesson.lessonNumber ?? idx + 1,
            chapterTitle: c.title,
            isDone,
            accuracyPct,
            practiceCount: practiceSessions.length,
          };
        })
      ),
    [lessonsGradeTab, progress.completedLessonIds, progress.sessions, progress.topicStats]
  );

  const tabCompletedCount = useMemo(
    () => tabGradeLessons.filter((l) => l.isDone).length,
    [tabGradeLessons]
  );
  const tabCompletionPct =
    tabGradeLessons.length > 0
      ? Math.round((tabCompletedCount / tabGradeLessons.length) * 100)
      : 0;

  const visibleLessons = useMemo(() => {
    if (lessonStatusFilter === 'done') return tabGradeLessons.filter((l) => l.isDone);
    if (lessonStatusFilter === 'todo') return tabGradeLessons.filter((l) => !l.isDone);
    return tabGradeLessons;
  }, [lessonStatusFilter, tabGradeLessons]);

  const topicRows = useMemo(() => {
    const all = Object.values(progress.topicStats);
    const filtered =
      gradeFilter === 'all' ? all : all.filter((t) => t.grade === gradeFilter);
    return filtered.sort((a, b) => {
      const pctA = a.correct / Math.max(1, a.total);
      const pctB = b.correct / Math.max(1, b.total);
      return pctB - pctA;
    });
  }, [gradeFilter, progress.topicStats]);

  const filteredSessions = useMemo(() => {
    return progress.sessions.filter((s) => {
      if (historyFilter === 'all') return true;
      if (historyFilter === 'game') return s.type === 'game';
      return s.type === 'practice' || s.type === 'mock-exam';
    });
  }, [historyFilter, progress.sessions]);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold text-[#102A56]">Tiến bộ của tôi</h1>
        <p className="text-sm text-[#71809A] mt-1">
          Thống kê chi tiết các bài học đã hoàn thành, mức độ thành thạo từng chủ đề và kỷ lục cá nhân qua các trò chơi kiến thức.
        </p>
      </div>

      {/* Overview Stats */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-[#E4EBF5] p-5">
          <div className="text-xs font-medium text-[#71809A]">Tổng điểm đạt được</div>
          <div className="text-2xl font-bold text-[#2864E8] tabular-nums mt-1.5">
            {totalPoints}
          </div>
          <div className="text-xs text-[#71809A] mt-1">Cộng dồn tất cả phiên học</div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E4EBF5] p-5">
          <div className="text-xs font-medium text-[#71809A]">Tỉ lệ trả lời đúng</div>
          <div className="text-2xl font-bold text-[#159B72] tabular-nums mt-1.5">
            {overallAccuracy}%
          </div>
          <div className="text-xs text-[#71809A] mt-1 tabular-nums">
            {totalCorrect}/{totalQuestions} câu hỏi
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E4EBF5] p-5">
          <div className="text-xs font-medium text-[#71809A]">
            Bài đã học (Lớp {defaultGrade})
          </div>
          <div className="text-2xl font-bold text-[#159B72] tabular-nums mt-1.5">
            {completedInDefaultGrade}/{defaultGradeLessons.length} bài
          </div>
          <div className="text-xs text-[#71809A] mt-1 tabular-nums">
            Đạt {defaultGradeCompletionPct}%
            {progress.completedLessonIds.length > completedInDefaultGrade
              ? ` · Tổng ${progress.completedLessonIds.length} bài toàn cấp`
              : ''}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E4EBF5] p-5">
          <div className="text-xs font-medium text-[#71809A]">Tổng số lượt chơi &amp; thi</div>
          <div className="text-2xl font-bold text-[#102A56] tabular-nums mt-1.5">
            {progress.sessions.length} lượt
          </div>
          <div className="text-xs text-[#71809A] mt-1">Dữ liệu cập nhật tự động</div>
        </div>
      </section>

      {/* Completed Lessons Statistics Section (Bài 1 - Bài 16) */}
      <section className="bg-white rounded-2xl border border-[#E4EBF5] p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#102A56] flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#159B72]" />
              Thống kê các bài đã học · Tin học {lessonsGradeTab}
            </h2>
            <p className="text-xs text-[#71809A] mt-0.5 tabular-nums">
              Đã học <strong className="text-[#159B72]">{tabCompletedCount}/{tabGradeLessons.length}</strong> bài ({tabCompletionPct}%) · Còn lại {Math.max(0, tabGradeLessons.length - tabCompletedCount)} bài chưa học
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 p-1 bg-[#F4F7FC] rounded-xl">
              {GRADE_LIST.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setLessonsGradeTab(g)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    lessonsGradeTab === g
                      ? 'bg-[#102A56] text-white'
                      : 'text-[#71809A] hover:text-[#102A56]'
                  }`}
                >
                  Lớp {g}
                </button>
              ))}
            </div>

            <div className="inline-flex items-center gap-1 p-1 bg-[#F4F7FC] rounded-xl">
              {(
                [
                  { id: 'all', label: `Tất cả (${tabGradeLessons.length})` },
                  { id: 'done', label: `Đã học (${tabCompletedCount})` },
                  {
                    id: 'todo',
                    label: `Chưa học (${tabGradeLessons.length - tabCompletedCount})`,
                  },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setLessonStatusFilter(f.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    lessonStatusFilter === f.id
                      ? 'bg-white text-[#102A56] shadow-xs'
                      : 'text-[#71809A] hover:text-[#102A56]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="space-y-1.5">
          <div className="h-2.5 w-full bg-[#EEF3FA] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#159B72] rounded-full transition-all"
              style={{ width: `${tabCompletionPct}%` }}
            />
          </div>
        </div>

        {/* 16-Lesson Checklist Grid */}
        {visibleLessons.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visibleLessons.map((lesson) => (
              <div
                key={lesson.id}
                className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
                  lesson.isDone
                    ? 'bg-[#F4FDF9] border-[#A7F3D0]'
                    : 'bg-[#FAFBFD] border-[#E4EBF5]'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  {lesson.isDone ? (
                    <CheckCircle2 className="w-4.5 h-4.5 text-[#159B72] shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-4.5 h-4.5 text-[#CBD5E1] shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#102A56] leading-snug">
                      {lesson.title}
                    </div>
                    <div className="text-xs text-[#647899] mt-0.5">
                      {lesson.chapterTitle}
                      {lesson.accuracyPct !== null && (
                        <span className="ml-2 font-semibold text-[#2864E8] tabular-nums">
                          · Chính xác {lesson.accuracyPct}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 whitespace-nowrap ${
                    lesson.isDone
                      ? 'bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]'
                      : 'bg-white text-[#71809A] border border-[#E2E8F0]'
                  }`}
                >
                  {lesson.isDone ? 'Đã học' : 'Chưa học'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-[#71809A]">
            {lessonStatusFilter === 'done'
              ? `Em chưa hoàn thành bài học nào ở lớp ${lessonsGradeTab}. Hãy vào mục Chương trình học hoặc Luyện tập để học bài đầu tiên!`
              : `Tuyệt vời! Em đã học xong toàn bộ các bài của lớp ${lessonsGradeTab}.`}
          </div>
        )}
      </section>

      {/* 5 Game High Scores Board */}
      <section className="bg-white rounded-2xl border border-[#E4EBF5] p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-[#102A56] flex items-center gap-2">
            <Award className="w-4 h-4 text-[#2864E8]" />
            Kỷ lục cá nhân – Trò chơi kiến thức
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {GAMES_LIST.map((game) => {
            const rec = progress.gameRecords[game.id];
            return (
              <div
                key={game.id}
                style={{ backgroundColor: game.bgColor, borderColor: game.borderColor }}
                className="rounded-xl border p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xl" role="img" aria-label={game.title}>
                      {game.emoji}
                    </span>
                    <span className="text-xs font-semibold text-[#52627E] tabular-nums">
                      {rec ? `${rec.plays} lượt` : '0 lượt'}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-[#102A56] leading-snug">
                    {game.title}
                  </div>
                  <div className="text-xl font-bold text-[#2864E8] tabular-nums mt-2">
                    {rec ? `${rec.bestScore} điểm` : '—'}
                  </div>
                  <div className="text-xs text-[#556582] mt-0.5 tabular-nums">
                    {game.id === 'speed-race' && rec?.bestTimeSeconds
                      ? `Nhanh nhất: ${rec.bestTimeSeconds}s`
                      : game.id === 'streak-challenge' && rec?.bestStreak
                        ? `Chuỗi cao nhất: ${rec.bestStreak}`
                        : game.id === 'knowledge-treasure' && rec?.bestGems !== undefined
                          ? `Ngọc tối đa: ${rec.bestGems}/7`
                          : game.id === 'sage-arena' && rec?.bestRank
                            ? `Hạng: ${rec.bestRank}`
                            : rec
                              ? 'Đã tham gia'
                              : 'Chưa chơi'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onStartGame(game.id, defaultGrade)}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-white hover:bg-[#2864E8] text-[#102A56] hover:text-white text-xs font-semibold border border-black/8 transition-colors"
                >
                  <Play className="w-3 h-3 fill-current" />
                  {rec ? 'Phá kỷ lục' : 'Chơi ngay'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Topic Mastery Breakdown */}
      <section className="bg-white rounded-2xl border border-[#E4EBF5] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[#102A56] flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#2864E8]" />
            Mức độ thành thạo theo chủ đề
          </h2>

          <div className="inline-flex items-center gap-1 p-1 bg-[#F4F7FC] rounded-xl">
            {GRADES.map((g) => (
              <button
                key={String(g)}
                type="button"
                onClick={() => setGradeFilter(g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  gradeFilter === g
                    ? 'bg-white text-[#102A56] shadow-xs'
                    : 'text-[#71809A] hover:text-[#102A56]'
                }`}
              >
                {g === 'all' ? 'Tất cả' : `Lớp ${g}`}
              </button>
            ))}
          </div>
        </div>

        {topicRows.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            {topicRows.map((stat) => {
              const pct = Math.round((stat.correct / Math.max(1, stat.total)) * 100);
              const status = getMasteryStatus(pct);
              return (
                <div key={`${stat.grade}-${stat.topic}`} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-[#17233C]">
                        {stat.topic}
                      </span>
                      <span className="text-xs text-[#71809A] ml-2">
                        Lớp {stat.grade}
                      </span>
                    </div>
                    <div className="text-xs font-semibold tabular-nums shrink-0 flex items-center gap-2">
                      <span style={{ color: status.color }}>{status.label}</span>
                      <span className="text-[#102A56]">
                        {pct}% ({stat.correct}/{stat.total})
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 bg-[#EEF3FA] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: status.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-[#71809A]">
            Chưa có dữ liệu thống kê cho khối lớp này. Hãy tham gia luyện tập hoặc chơi một trò chơi để ghi nhận kết quả.
          </div>
        )}
      </section>

      {/* Session History Table */}
      <section className="bg-white rounded-2xl border border-[#E4EBF5] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#EDF2F9] flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[#102A56] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#159B72]" />
            Lịch sử hoạt động gần đây
          </h2>

          <div className="inline-flex items-center gap-1 p-1 bg-[#F4F7FC] rounded-xl">
            {(
              [
                { id: 'all', label: 'Tất cả' },
                { id: 'game', label: 'Trò chơi' },
                { id: 'practice', label: 'Luyện tập & Thi thử' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setHistoryFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  historyFilter === tab.id
                    ? 'bg-white text-[#102A56] shadow-xs'
                    : 'text-[#71809A] hover:text-[#102A56]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#EDF2F9] text-xs font-semibold text-[#71809A] bg-[#FAFBFD]">
                <th className="py-3 px-6">Hoạt động</th>
                <th className="py-3 px-4">Khối lớp</th>
                <th className="py-3 px-4 text-right">Kết quả</th>
                <th className="py-3 px-4 text-right">Điểm số</th>
                <th className="py-3 px-6 text-right">Thời điểm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDF2F9] text-sm">
              {filteredSessions.length > 0 ? (
                filteredSessions.map((s) => (
                  <tr key={s.id} className="hover:bg-[#FAFBFD]">
                    <td className="py-3.5 px-6">
                      <div className="font-semibold text-[#17233C]">{s.title}</div>
                      <div className="text-xs text-[#71809A]">
                        {s.type === 'game'
                          ? 'Trò chơi kiến thức'
                          : s.type === 'mock-exam'
                            ? 'Đề thi thử 15 phút'
                            : 'Luyện tập theo chủ đề'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-[#52627E] whitespace-nowrap">
                      Tin học {s.grade}
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium text-[#159B72] tabular-nums whitespace-nowrap">
                      {s.correctCount}/{s.totalQuestions} câu đúng
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-[#2864E8] tabular-nums whitespace-nowrap">
                      {s.score} điểm
                    </td>
                    <td className="py-3.5 px-6 text-right text-xs text-[#71809A] tabular-nums whitespace-nowrap">
                      {formatDateTime(s.completedAt)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-[#71809A]">
                    Chưa có hoạt động nào thuộc mục này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
