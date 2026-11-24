import React, { useState } from 'react';
import {
  CheckCircle2,
  Lightbulb,
  Play,
  Sparkles,
  Trophy,
  Wand2,
} from 'lucide-react';
import {
  FEATURED_GAMES_LIST,
  GAMES_LIST,
  HERO_BRIGHT_BANNER,
} from '../../data/games';
import { getQuestionsByGrade } from '../../data/questionBank';
import { GameId, Grade, Question, StudentProgress } from '../types';

interface GamesHubViewProps {
  selectedGrade: Grade;
  onSelectGrade: (grade: Grade) => void;
  progress: StudentProgress;
  customQuestions: Question[];
  onStartGame: (gameId: GameId, grade: Grade) => void;
  onOpenAiGenerator: (grade: Grade) => void;
}

const GRADES: Grade[] = [6, 7, 8, 9];

export default function GamesHubView({
  selectedGrade,
  onSelectGrade,
  progress,
  customQuestions,
  onStartGame,
  onOpenAiGenerator,
}: GamesHubViewProps) {
  const [bannerError, setBannerError] = useState(false);
  const availableQuestions = getQuestionsByGrade(selectedGrade, customQuestions).length;
  const aiAddedCount = customQuestions.filter((q) => q.grade === selectedGrade).length;

  return (
    <div className="space-y-8">
      {/* Bright Cheerful Hero Banner */}
      <section className="bg-gradient-to-r from-[#E0F2FE] via-[#EEF7FF] to-[#ECFDF5] rounded-3xl border border-[#C6E4FD] overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch shadow-xs">
        <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center">
          <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#0284C7] mb-2">
            <Sparkles className="w-4 h-4" />
            <span>Học mà chơi – Chơi mà học · Tin học THCS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight text-[#163A70] text-balance mb-3">
            Sẵn sàng chinh phục sân chơi Tin học 3D?
          </h1>
          <p className="text-sm sm:text-[15px] text-[#465E80] leading-relaxed max-w-xl mb-5">
            Chọn khối lớp của bạn để hệ thống tự động lấy câu hỏi mới không lặp lại từ ngân hàng Luyện tập & AI. Cùng cả lớp đua xe 3D, leo tháp mây, chạy hội khoẻ hoặc giải đố!
          </p>

          {/* Grade selector & AI Question Generator CTA */}
          <div>
            <div className="text-xs font-bold text-[#163A70] mb-2">
              Chọn khối lớp tham gia ({availableQuestions} câu hỏi Tin học {selectedGrade} sẵn sàng
              {aiAddedCount > 0 ? ` · gồm +${aiAddedCount} câu AI/mới` : ''})
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex flex-wrap items-center gap-1.5 p-1.5 bg-white/90 border border-[#D4E6FA] rounded-2xl shadow-2xs">
                {GRADES.map((grade) => {
                  const isActive = selectedGrade === grade;
                  return (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => onSelectGrade(grade)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors whitespace-nowrap shrink-0 ${
                        isActive
                          ? 'bg-[#2563EB] text-white shadow-xs'
                          : 'text-[#4B6384] hover:bg-[#EFF6FF] hover:text-[#163A70]'
                      }`}
                    >
                      Tin học {grade}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => onOpenAiGenerator(selectedGrade)}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#2563EB] hover:from-[#6D28D9] hover:to-[#1D4ED8] text-white text-sm font-bold shadow-xs transition-all whitespace-nowrap shrink-0"
              >
                <Wand2 className="w-4 h-4" />
                <span>Tạo câu hỏi bằng AI</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bright Illustrated Visual Column */}
        <div className="lg:col-span-5 relative min-h-[210px] lg:min-h-full bg-[#DCEEFF]">
          {!bannerError ? (
            <img
              src={HERO_BRIGHT_BANNER}
              alt="Minh họa không gian trò chơi Tin học 3D tươi sáng"
              referrerPolicy="no-referrer"
              onError={() => setBannerError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-8 text-center">
              <div className="space-y-2">
                <Trophy className="w-12 h-12 text-[#2563EB] mx-auto" />
                <div className="text-sm font-bold text-[#163A70]">
                  Sân chơi Tin học THCS
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 8 Featured Interactive 3D, Farm & Puzzle Games */}
      <section aria-labelledby="featured-games-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <h2
              id="featured-games-heading"
              className="text-xl font-extrabold text-[#163A70]"
            >
              8 Trò chơi tương tác 3D, Nông trại & Giải đố nổi bật
            </h2>
            <p className="text-sm text-[#647899] mt-0.5">
              Đang dùng ngân hàng câu hỏi <strong className="text-[#163A70]">Tin học {selectedGrade}</strong> · Đua xe 3D, Tháp mây, Hội khoẻ, Nông trại, Mở hộp quà, Ô chữ, Mảnh ghép & Truy tìm kho báu.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {FEATURED_GAMES_LIST.map((game) => {
            const record = progress.gameRecords[game.id];
            return (
              <article
                key={game.id}
                style={{ backgroundColor: '#FFFFFF', borderColor: game.borderColor }}
                className="rounded-3xl border overflow-hidden flex flex-col justify-between shadow-xs transition-transform duration-150 hover:-translate-y-0.5"
              >
                <div>
                  {/* Crisp Artwork Header */}
                  <div className="relative h-44 overflow-hidden bg-[#EFF6FF]">
                    <img
                      src={game.imageUrl}
                      alt={game.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#163A70]/75 via-[#163A70]/15 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2 text-white">
                      <div>
                        <div className="text-xs font-bold text-[#E0F2FE]">
                          {game.subtitle}
                        </div>
                        <h3 className="text-lg font-extrabold leading-tight flex items-center gap-1.5 mt-0.5">
                          <span role="img" aria-label={game.title}>
                            {game.emoji}
                          </span>
                          <span>{game.title}</span>
                        </h3>
                      </div>
                      {record && (
                        <div className="text-right text-[11px] font-bold bg-white/95 text-[#163A70] px-2.5 py-1 rounded-xl shrink-0 tabular-nums">
                          Kỷ lục: {record.bestScore}đ
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-5 space-y-3">
                    <p className="text-sm text-[#4B6384] leading-relaxed">
                      {game.description}
                    </p>
                    <ul className="space-y-1.5">
                      {game.highlights.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2 text-xs font-medium text-[#334155]"
                        >
                          <CheckCircle2
                            className="w-3.5 h-3.5 mt-0.5 shrink-0"
                            style={{ color: game.accentColor }}
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div
                  style={{ backgroundColor: game.bgColor, borderColor: game.borderColor }}
                  className="px-5 py-3.5 border-t flex items-center justify-between gap-3"
                >
                  <div className="text-xs font-bold text-[#4B6384]">
                    Tin học {selectedGrade}
                  </div>
                  <button
                    type="button"
                    onClick={() => onStartGame(game.id, selectedGrade)}
                    style={{ backgroundColor: game.accentColor }}
                    className="inline-flex items-center gap-2 py-2 px-4 rounded-xl text-white text-xs sm:text-sm font-bold hover:opacity-95 transition-opacity whitespace-nowrap shrink-0"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    {game.ctaLabel}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* 5 Quick Quiz Games */}
      <section aria-labelledby="classic-games-heading">
        <div className="mb-4">
          <h2 id="classic-games-heading" className="text-lg font-extrabold text-[#163A70]">
            Trò chơi trắc nghiệm luyện nhanh
          </h2>
          <p className="text-sm text-[#647899] mt-0.5">
            Câu hỏi và 4 đáp án hiển thị gọn trên 1 màn hình duy nhất, không cần kéo thanh trượt.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {GAMES_LIST.map((game) => {
            const record = progress.gameRecords[game.id];
            return (
              <article
                key={game.id}
                style={{ backgroundColor: game.bgColor, borderColor: game.borderColor }}
                className="rounded-2xl border p-5 flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl bg-white border border-black/5 flex items-center justify-center text-2xl shrink-0">
                      <span role="img" aria-label={game.title}>
                        {game.emoji}
                      </span>
                    </div>
                    <div className="text-right text-xs font-medium text-[#647899] tabular-nums">
                      {record ? (
                        <div className="font-bold text-[#163A70]">
                          Kỷ lục: {record.bestScore} điểm
                        </div>
                      ) : (
                        <div>Chưa thử sức</div>
                      )}
                    </div>
                  </div>

                  <div
                    className="text-xs font-bold mb-0.5"
                    style={{ color: game.accentColor }}
                  >
                    {game.shortTag}
                  </div>
                  <h3 className="text-base font-extrabold text-[#163A70] mb-1.5">
                    {game.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#4B6384] leading-relaxed mb-3">
                    {game.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-black/6 space-y-2.5">
                  <div className="text-xs text-[#526582] leading-snug">
                    {game.scoringRule}
                  </div>
                  <button
                    type="button"
                    onClick={() => onStartGame(game.id, selectedGrade)}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-bold transition-colors whitespace-nowrap"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Chơi ngay
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Study Tips Box */}
      <section className="bg-white rounded-2xl border border-[#DCE8F8] p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#EAF4FF] flex items-center justify-center shrink-0">
            <Lightbulb className="w-5 h-5 text-[#2563EB]" />
          </div>
          <div className="space-y-2">
            <h3 className="text-base font-extrabold text-[#163A70]">
              Mẹo nhỏ giúp bạn đạt điểm cao hơn
            </h3>
            <ul className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-sm text-[#4B6384]">
              <li>
                <span className="font-bold text-[#163A70]">1. Suy nghĩ kỹ trước khi chọn:</span> Trong Đường đua tri thức, suy nghĩ chắc chắn vừa tránh lật xe vừa được bù thời gian!
              </li>
              <li>
                <span className="font-bold text-[#163A70]">2. Học lại câu sai ngay:</span> Ở Bậc Thang Lên Mây & Hội Khoẻ Tri Thức, câu làm sai sẽ quay lại để bạn chinh phục lần hai.
              </li>
              <li>
                <span className="font-bold text-[#163A70]">3. Chơi mượt trên mọi thiết bị:</span> Hỗ trợ mã phòng và đường dẫn mời tham gia trực tiếp trên điện thoại, máy tính bảng hoặc máy chiếu.
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
