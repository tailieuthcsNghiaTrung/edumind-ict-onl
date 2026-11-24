import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bot, RotateCcw, Send, User } from 'lucide-react';
import { Grade, UserProfile } from '../types';

interface AssistantViewProps {
  user: UserProfile;
  selectedGrade: Grade;
  onSelectGrade: (grade: Grade) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

const GRADES: Grade[] = [6, 7, 8, 9];

const SUGGESTIONS_BY_GRADE: Record<Grade, string[]> = {
  6: [
    'Giải thích giúp em cách quy đổi Bit, Byte, KB, MB, GB dễ nhớ nhất.',
    'Trong sơ đồ khối thuật toán, hình thoi và hình chữ nhật khác nhau thế nào?',
    'Mục CC và BCC khi gửi Email có điểm gì khác nhau?',
  ],
  7: [
    'Tại sao Tìm kiếm nhị phân lại cần danh sách đã sắp xếp trước?',
    'Cho ví dụ phân biệt các hàm SUM, AVERAGE, MAX, MIN trong Excel.',
    'Thuật toán sắp xếp nổi bọt (Bubble Sort) hoạt động qua các bước nào?',
  ],
  8: [
    'Phân biệt địa chỉ tương đối (A1) và địa chỉ tuyệt đối ($A$1) trong Excel.',
    'Giải thích cách dùng Biến và vòng lặp repeat until trong Scratch.',
    'Nêu 4 thế hệ phát triển linh kiện của máy tính điện tử.',
  ],
  9: [
    'Cách phân biệt hàm COUNTIF và SUMIF bằng ví dụ quản lí chi tiêu.',
    '4 tiêu chí đánh giá chất lượng thông tin gồm những gì?',
    'Hướng dẫn cách viết hàm IF lồng nhau xếp loại học lực Giỏi, Khá, Đạt.',
  ],
};

function renderFormattedText(text: string) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;

        // Render **bold** and `code` inline safely
        const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        return (
          <p key={i} className="text-sm whitespace-pre-wrap break-words">
            {parts.map((part, idx) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return (
                  <strong key={idx} className="font-semibold text-[#102A56]">
                    {part.slice(2, -2)}
                  </strong>
                );
              }
              if (part.startsWith('`') && part.endsWith('`')) {
                return (
                  <code
                    key={idx}
                    className="font-mono text-xs px-1.5 py-0.5 rounded bg-[#EAF2FF] text-[#102A56]"
                  >
                    {part.slice(1, -1)}
                  </code>
                );
              }
              return <React.Fragment key={idx}>{part}</React.Fragment>;
            })}
          </p>
        );
      })}
    </div>
  );
}

export default function AssistantView({
  user,
  selectedGrade,
  onSelectGrade,
}: AssistantViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: `Chào ${user.name}! Mình là Trợ lý học tập môn Tin học THCS của EduMind ICT. Bạn đang ôn tập chủ đề nào của Tin học lớp ${selectedGrade}? Hãy đặt câu hỏi hoặc chọn một gợi ý bên dưới nhé.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isLoading]);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isLoading) return;

    setErrorMsg(null);
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);

    try {
      const payloadMessages = nextMessages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, text: m.text }));

      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: payloadMessages,
          grade: selectedGrade,
          userName: user.name,
        }),
      });

      const data = (await res.json()) as { reply?: string; error?: string };

      if (!res.ok || !data.reply) {
        setErrorMsg(
          data.error ?? 'Trợ lý học tập đang tạm bận. Vui lòng thử lại sau ít phút.'
        );
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: data.reply as string,
        },
      ]);
    } catch {
      setErrorMsg(
        'Không thể kết nối tới máy chủ Trợ lý học tập. Vui lòng kiểm tra lại kết nối mạng.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleResetChat = () => {
    setErrorMsg(null);
    setMessages([
      {
        id: 'welcome',
        role: 'model',
        text: `Chào ${user.name}! Phiên hỏi đáp đã được làm mới cho môn Tin học lớp ${selectedGrade}. Bạn muốn hỏi kiến thức hoặc bài tập nào?`,
      },
    ]);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header & Grade Context */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#102A56]">Trợ lý học tập Tin học</h1>
          <p className="text-sm text-[#71809A] mt-1">
            Hỗ trợ giải thích khái niệm, công thức bảng tính, thuật toán và bài tập Tin học THCS lớp 6 – 9.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start">
          <div className="inline-flex items-center gap-1 p-1 bg-white border border-[#DCE5F2] rounded-xl">
            {GRADES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => onSelectGrade(g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  selectedGrade === g
                    ? 'bg-[#102A56] text-white'
                    : 'text-[#71809A] hover:text-[#102A56]'
                }`}
              >
                Lớp {g}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleResetChat}
            title="Làm mới cuộc trò chuyện"
            className="p-2.5 rounded-xl bg-white border border-[#DCE5F2] text-[#71809A] hover:text-[#102A56] hover:bg-[#F4F7FC] transition-colors"
            aria-label="Làm mới cuộc trò chuyện"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chat Container */}
      <div className="bg-white rounded-2xl border border-[#E4EBF5] flex flex-col h-[560px] overflow-hidden">
        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isUser
                      ? 'bg-[#2864E8] text-white'
                      : 'bg-[#102A56] text-[#35C6D4]'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-3 ${
                    isUser
                      ? 'bg-[#2864E8] text-white text-sm leading-relaxed'
                      : 'bg-[#F4F7FC] text-[#17233C] border border-[#E5ECF7]'
                  }`}
                >
                  {isUser ? msg.text : renderFormattedText(msg.text)}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#102A56] text-[#35C6D4] flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="rounded-2xl px-4 py-3 bg-[#F4F7FC] border border-[#E5ECF7] text-sm text-[#71809A]">
                Trợ lý đang soạn lời giải thích cho bạn...
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-[#FDF0F1] border border-[#F4C7CC] text-xs sm:text-sm text-[#A62E3A] flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Starter Prompts */}
        <div className="px-5 py-3 border-t border-[#EDF2F9] bg-[#FAFBFD]">
          <div className="text-xs font-medium text-[#71809A] mb-2">
            Gợi ý câu hỏi nhanh – Tin học {selectedGrade}
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS_BY_GRADE[selectedGrade].map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={isLoading}
                onClick={() => sendMessage(prompt)}
                className="text-left text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-[#DCE5F2] text-[#17233C] hover:border-[#2864E8] hover:text-[#2864E8] transition-colors disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Input Form */}
        <form
          onSubmit={handleSubmit}
          className="p-4 border-t border-[#E4EBF5] bg-white flex items-center gap-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Nhập câu hỏi Tin học lớp ${selectedGrade} cần giải đáp...`}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-xl border border-[#D8E2F0] text-sm text-[#17233C] focus:outline-none focus:border-[#2864E8] disabled:bg-[#F4F7FC]"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2864E8] hover:bg-[#1E53C9] disabled:opacity-50 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <Send className="w-4 h-4" />
            Gửi câu hỏi
          </button>
        </form>
      </div>
    </div>
  );
}
