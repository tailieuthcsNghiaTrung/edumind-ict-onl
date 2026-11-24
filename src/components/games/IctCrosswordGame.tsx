import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Grade, SessionRecord } from '../../types';
import {
  isSoundMuted,
  playBoostSound,
  playCorrectSound,
  playVictorySound,
  playWrongSound,
  setSoundMuted,
} from '../../utils/soundFx';

interface IctCrosswordGameProps {
  grade: Grade;
  playerName: string;
  onExit: () => void;
  onCompleteSession: (
    session: Omit<SessionRecord, 'id' | 'completedAt'>,
    topicBreakdown: { grade: Grade; topic: string; isCorrect: boolean }[]
  ) => void;
}

interface CrosswordRowDef {
  id: number;
  answer: string; // Normalized uppercase letters without spaces
  displayWord: string; // Proper Vietnamese with diacritics
  keyIndex: number; // 0-based index forming the golden vertical keyword
  clue: string;
  topic: string;
  choices: [string, string, string, string]; // 4 quick MCQ options (includes displayWord)
}

interface GradeCrosswordPack {
  keyword: string;
  keywordDisplay: string;
  keywordHint: string;
  rows: CrosswordRowDef[];
}

function normalizeAnswer(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

const CROSSWORD_PACKS: Record<Grade, GradeCrosswordPack> = {
  6: {
    keyword: 'TINHOC',
    keywordDisplay: 'TIN HỌC',
    keywordHint: 'Tên môn học khám phá máy tính, thông tin và thế giới số ở THCS (6 chữ cái).',
    rows: [
      {
        id: 1,
        answer: 'MAYTINH',
        displayWord: 'MÁY TÍNH',
        keyIndex: 3, // T
        clue: 'Thiết bị điện tử thông minh giúp thu nhận, lưu trữ, xử lý và truyền thông tin.',
        topic: 'Máy tính và cộng đồng',
        choices: ['MÁY TÍNH', 'MÁY QUÉT', 'BÀN PHÍM', 'LOA NGHE'],
      },
      {
        id: 2,
        answer: 'INTERNET',
        displayWord: 'INTERNET',
        keyIndex: 0, // I
        clue: 'Mạng máy tính khổng lồ toàn cầu kết nối hàng tỉ thiết bị với nhau.',
        topic: 'Mạng máy tính và Internet',
        choices: ['INTERNET', 'BLUETOOTH', 'MẠNG LAN', 'CỔNG USB'],
      },
      {
        id: 3,
        answer: 'NHIPHAN',
        displayWord: 'NHỊ PHÂN',
        keyIndex: 0, // N
        clue: 'Hệ đếm chỉ dùng hai chữ số 0 và 1 để biểu diễn mọi dữ liệu trong máy tính.',
        topic: 'Biểu diễn thông tin',
        choices: ['THẬP PHÂN', 'NHỊ PHÂN', 'LỤC PHÂN', 'LA MÃ'],
      },
      {
        id: 4,
        answer: 'THUMUC',
        displayWord: 'THƯ MỤC',
        keyIndex: 1, // H
        clue: 'Nơi dùng để chứa và phân loại các tệp tin gọn gàng trên ổ đĩa.',
        topic: 'Tổ chức lưu trữ thông tin',
        choices: ['TỆP TIN', 'Ổ ĐĨA C', 'THƯ MỤC', 'PHÍM TẮT'],
      },
      {
        id: 5,
        answer: 'SOANTHAO',
        displayWord: 'SOẠN THẢO',
        keyIndex: 1, // O
        clue: 'Công việc nhập chữ, chỉnh sửa và định dạng văn bản trên phần mềm Word.',
        topic: 'Soạn thảo văn bản',
        choices: ['TRÌNH CHIẾU', 'SOẠN THẢO', 'TÍNH TOÁN', 'VẼ TRANH'],
      },
      {
        id: 6,
        answer: 'CHUOT',
        displayWord: 'CHUỘT',
        keyIndex: 0, // C
        clue: 'Thiết bị vào giúp di chuyển con trỏ và nháy chọn biểu tượng trên màn hình.',
        topic: 'Thiết bị vào – ra',
        choices: ['MÀN HÌNH', 'MÁY IN', 'CHUỘT', 'TAI NGHE'],
      },
    ],
  },
  7: {
    keyword: 'DULIEU',
    keywordDisplay: 'DỮ LIỆU',
    keywordHint: 'Các con số, văn bản, bảng biểu mà máy tính tiếp nhận và xử lý (6 chữ cái).',
    rows: [
      {
        id: 1,
        answer: 'HEDIEUHANH',
        displayWord: 'HỆ ĐIỀU HÀNH',
        keyIndex: 2, // D
        clue: 'Phần mềm hệ thống quản lý phần cứng và điều khiển mọi chương trình ứng dụng.',
        topic: 'Hệ điều hành',
        choices: ['HỆ ĐIỀU HÀNH', 'TRÌNH DUYỆT', 'PHẦN CỨNG', 'TƯỜNG LỬA'],
      },
      {
        id: 2,
        answer: 'CONGTHUC',
        displayWord: 'CÔNG THỨC',
        keyIndex: 6, // U
        clue: 'Biểu thức tính toán trong bảng tính Excel, luôn bắt đầu bằng dấu bằng (=).',
        topic: 'Bảng tính điện tử',
        choices: ['TRANG TÍNH', 'CÔNG THỨC', 'ĐỊNH DẠNG', 'SẮP XẾP'],
      },
      {
        id: 3,
        answer: 'EXCEL',
        displayWord: 'EXCEL',
        keyIndex: 4, // L
        clue: 'Phần mềm bảng tính điện tử nổi tiếng giúp lập bảng, tính toán và vẽ biểu đồ.',
        topic: 'Bảng tính điện tử',
        choices: ['WORD', 'PAINT', 'EXCEL', 'SCRATCH'],
      },
      {
        id: 4,
        answer: 'MANGXAHOI',
        displayWord: 'MẠNG XÃ HỘI',
        keyIndex: 8, // I
        clue: 'Không gian trực tuyến giúp kết nối bạn bè, chia sẻ bài viết và trò chuyện.',
        topic: 'Ứng xử văn minh trên mạng',
        choices: ['THƯ ĐIỆN TỬ', 'MẠNG XÃ HỘI', 'MÁY TÌM KIẾM', 'BẢN ĐỒ SỐ'],
      },
      {
        id: 5,
        answer: 'AVERAGE',
        displayWord: 'AVERAGE',
        keyIndex: 2, // E
        clue: 'Tên hàm trong bảng tính dùng để tính giá trị trung bình cộng của dãy số.',
        topic: 'Hàm trong bảng tính',
        choices: ['SUM', 'MAX', 'AVERAGE', 'COUNT'],
      },
      {
        id: 6,
        answer: 'BIEUDO',
        displayWord: 'BIỂU ĐỒ',
        keyIndex: 3, // U
        clue: 'Hình vẽ trực quan hóa số liệu bảng tính thành dạng cột, hình tròn hoặc đường.',
        topic: 'Trình bày dữ liệu',
        choices: ['VĂN BẢN', 'BIỂU ĐỒ', 'THƯ MỤC', 'BẢNG CHỌN'],
      },
    ],
  },
  8: {
    keyword: 'BAOMAT',
    keywordDisplay: 'BẢO MẬT',
    keywordHint: 'Nguyên tắc giữ an toàn cho tài khoản, mật khẩu và dữ liệu cá nhân trên mạng (6 chữ cái).',
    rows: [
      {
        id: 1,
        answer: 'BANQUYEN',
        displayWord: 'BẢN QUYỀN',
        keyIndex: 0, // B
        clue: 'Quyền hợp pháp của tác giả đối với tác phẩm, phần mềm hay hình ảnh số họ tạo ra.',
        topic: 'Đạo đức & pháp luật số',
        choices: ['BẢN QUYỀN', 'MÃ NGUỒN', 'TÀI KHOẢN', 'TÊN MIỀN'],
      },
      {
        id: 2,
        answer: 'SCRATCH',
        displayWord: 'SCRATCH',
        keyIndex: 3, // A
        clue: 'Ngôn ngữ lập trình kéo thả khối lệnh trực quan rất phổ biến ở Tin học 8.',
        topic: 'Lập trình trực quan Scratch',
        choices: ['PYTHON', 'SCRATCH', 'EXCEL', 'POWERPOINT'],
      },
      {
        id: 3,
        answer: 'VONGLAP',
        displayWord: 'VÒNG LẶP',
        keyIndex: 1, // O
        clue: 'Cấu trúc điều khiển giúp thực hiện lặp đi lặp lại một nhóm lệnh nhiều lần.',
        topic: 'Thuật toán & Lập trình',
        choices: ['RẼ NHÁNH', 'VÒNG LẶP', 'BIẾN NHỚ', 'HẰNG SỐ'],
      },
      {
        id: 4,
        answer: 'HAMSUM',
        displayWord: 'HÀM SUM',
        keyIndex: 2, // M
        clue: 'Tên hàm quen thuộc trong bảng tính dùng để tính tổng một vùng ô số.',
        topic: 'Bảng tính nâng cao',
        choices: ['HÀM MIN', 'HÀM MAX', 'HÀM SUM', 'HÀM NOW'],
      },
      {
        id: 5,
        answer: 'DIACHI',
        displayWord: 'ĐỊA CHỈ',
        keyIndex: 2, // A
        clue: 'Trong Excel gồm loại tương đối (A1) và tuyệt đối có dấu đô la ($A$1).',
        topic: 'Bảng tính nâng cao',
        choices: ['ĐỊA CHỈ', 'CÔNG CỤ', 'HÀNG NGANG', 'BỘ LỌC'],
      },
      {
        id: 6,
        answer: 'THUATTOAN',
        displayWord: 'THUẬT TOÁN',
        keyIndex: 0, // T
        clue: 'Dãy các bước hữu hạn, rõ ràng để hướng dẫn máy tính giải quyết một bài toán.',
        topic: 'Giải quyết vấn đề',
        choices: ['THUẬT TOÁN', 'PHẦN CỨNG', 'TỆP DỮ LIỆU', 'TRANG WEB'],
      },
    ],
  },
  9: {
    keyword: 'TRITUE',
    keywordDisplay: 'TRÍ TUỆ',
    keywordHint: 'Năng lực tư duy thông minh — gắn liền với cụm từ “... nhân tạo (AI)” (6 chữ cái).',
    rows: [
      {
        id: 1,
        answer: 'THONGMINH',
        displayWord: 'THÔNG MINH',
        keyIndex: 0, // T
        clue: 'Đặc tính của các thiết bị có gắn bộ xử lý tự động như nhà, đồng hồ, ô tô...',
        topic: 'Thế giới kĩ thuật số',
        choices: ['THÔNG MINH', 'THỦ CÔNG', 'CỔ ĐIỂN', 'VẬT LÝ'],
      },
      {
        id: 2,
        answer: 'LAPTRINH',
        displayWord: 'LẬP TRÌNH',
        keyIndex: 4, // R
        clue: 'Nghề nghiệp viết mã lệnh để xây dựng phần mềm, ứng dụng di động và website.',
        topic: 'Hướng nghiệp Tin học',
        choices: ['THIẾT KẾ', 'LẬP TRÌNH', 'KIỂM THỬ', 'QUẢN TRỊ'],
      },
      {
        id: 3,
        answer: 'COUNTIF',
        displayWord: 'COUNTIF',
        keyIndex: 5, // I
        clue: 'Hàm trong bảng tính dùng để đếm số ô thỏa mãn một điều kiện cho trước.',
        topic: 'Giải quyết bài toán bằng bảng tính',
        choices: ['SUMIF', 'COUNTIF', 'AVERAGE', 'VLOOKUP'],
      },
      {
        id: 4,
        answer: 'THIETKE',
        displayWord: 'THIẾT KẾ',
        keyIndex: 0, // T
        clue: 'Công việc sáng tạo bố cục đồ họa, giao diện web hoặc ấn phẩm đa phương tiện.',
        topic: 'Hướng nghiệp Tin học',
        choices: ['THIẾT KẾ', 'LẮP RÁP', 'LƯU TRỮ', 'NÉN TỆP'],
      },
      {
        id: 5,
        answer: 'SUMIF',
        displayWord: 'SUMIF',
        keyIndex: 1, // U
        clue: 'Hàm trong Excel giúp tính tổng các ô trong vùng dữ liệu theo một điều kiện.',
        topic: 'Giải quyết bài toán bằng bảng tính',
        choices: ['COUNTIF', 'SUMIF', 'IFERROR', 'RANK'],
      },
      {
        id: 6,
        answer: 'VIDEO',
        displayWord: 'VIDEO',
        keyIndex: 3, // E
        clue: 'Sản phẩm đa phương tiện kết hợp hình ảnh chuyển động, âm thanh và phụ đề.',
        topic: 'Làm video & đa phương tiện',
        choices: ['BẢNG TÍNH', 'VĂN BẢN', 'VIDEO', 'BIỂU MẪU'],
      },
    ],
  },
};

export default function IctCrosswordGame({
  grade,
  playerName,
  onExit,
  onCompleteSession,
}: IctCrosswordGameProps) {
  const pack = CROSSWORD_PACKS[grade];
  const maxKeyCol = useMemo(
    () => Math.max(...pack.rows.map((r) => r.keyIndex)),
    [pack]
  );

  const [selectedRowId, setSelectedRowId] = useState<number>(1);
  const [solvedIds, setSolvedIds] = useState<number[]>([]);
  const [revealedLetterRows, setRevealedLetterRows] = useState<number[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [showChoicesMode, setShowChoicesMode] = useState(true);
  const [keywordModalOpen, setKeywordModalOpen] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  const [keywordSolved, setKeywordSolved] = useState(false);
  const [score, setScore] = useState(0);
  const [muted, setMuted] = useState(() => isSoundMuted());
  const [feedback, setFeedback] = useState(
    'Chọn hàng ngang bên trái, đọc gợi ý rồi chọn nhanh đáp án hoặc tự gõ chữ!'
  );
  const [topicLog, setTopicLog] = useState<
    { grade: Grade; topic: string; isCorrect: boolean }[]
  >([]);

  const startTimeRef = useRef(Date.now());
  const recordedRef = useRef(false);

  const activeRow =
    pack.rows.find((r) => r.id === selectedRowId) ?? pack.rows[0];
  const isAllComplete = keywordSolved || solvedIds.length === pack.rows.length;

  const recordCompletion = (
    finalScore: number,
    finalSolvedCount: number,
    log: { grade: Grade; topic: string; isCorrect: boolean }[]
  ) => {
    if (recordedRef.current) return;
    recordedRef.current = true;
    onCompleteSession(
      {
        type: 'game',
        title: 'Ô Chữ Tin Học',
        gameId: 'ict-crossword',
        grade,
        score: finalScore,
        maxScore: pack.rows.length * 20 + 60,
        correctCount: finalSolvedCount,
        totalQuestions: pack.rows.length,
        durationSeconds: Math.max(
          10,
          Math.round((Date.now() - startTimeRef.current) / 1000)
        ),
      },
      log
    );
  };

  const handleSolveAttempt = (candidateRaw: string, usedChoices: boolean) => {
    if (solvedIds.includes(activeRow.id)) return;
    const normalized = normalizeAnswer(candidateRaw);
    const isCorrect = normalized === activeRow.answer;

    const nextLog = [
      ...topicLog,
      { grade, topic: activeRow.topic, isCorrect },
    ];
    setTopicLog(nextLog);

    if (isCorrect) {
      playCorrectSound();
      const earned = usedChoices ? 15 : 25;
      const nextScore = score + earned;
      const nextSolved = [...solvedIds, activeRow.id];
      setScore(nextScore);
      setSolvedIds(nextSolved);
      setInputVal('');
      setFeedback(
        `✅ Chính xác! Hàng ngang #${activeRow.id} là “${activeRow.displayWord}” (+${earned} điểm)!`
      );

      // Jump to next unsolved row automatically
      const nextRow = pack.rows.find((r) => !nextSolved.includes(r.id));
      if (nextRow) {
        setSelectedRowId(nextRow.id);
      } else {
        playVictorySound();
        setKeywordSolved(true);
        const bonusTotal = nextScore + 40;
        setScore(bonusTotal);
        recordCompletion(bonusTotal, nextSolved.length, nextLog);
      }
    } else {
      playWrongSound();
      setFeedback(
        `❌ Chưa khớp hàng ngang #${activeRow.id} (${activeRow.answer.length} chữ cái). Thử lại hoặc bấm Gợi ý nhé!`
      );
    }
  };

  const handleKeywordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (normalizeAnswer(keywordInput) === pack.keyword) {
      playVictorySound();
      const finalScore = score + 60;
      setScore(finalScore);
      setSolvedIds(pack.rows.map((r) => r.id));
      setKeywordSolved(true);
      setKeywordModalOpen(false);
      recordCompletion(finalScore, pack.rows.length, topicLog);
    } else {
      playWrongSound();
      setFeedback('🔑 Từ khóa dọc chưa chính xác — Hãy mở thêm hàng ngang để nhìn rõ cột màu vàng nhé!');
      setKeywordModalOpen(false);
    }
  };

  const handleRestart = () => {
    setSelectedRowId(1);
    setSolvedIds([]);
    setRevealedLetterRows([]);
    setInputVal('');
    setKeywordInput('');
    setKeywordSolved(false);
    setScore(0);
    setTopicLog([]);
    recordedRef.current = false;
    startTimeRef.current = Date.now();
    setFeedback('Bắt đầu lượt giải Ô Chữ Tin Học mới!');
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
  };

  // ==================== COMPLETED VICTORY VIEW ====================
  if (isAllComplete) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-[#BFDBFE] p-6 sm:p-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[#EFF6FF] border border-[#BFDBFE] mx-auto flex items-center justify-center text-3xl">
          🧩
        </div>
        <div>
          <div className="text-xs font-extrabold text-[#2563EB]">
            Ô Chữ Tin Học · Tin học {grade}
          </div>
          <h2 className="text-2xl font-extrabold text-[#163A70] mt-1">
            Xuất sắc {playerName}! Từ khóa bí mật là “{pack.keywordDisplay}”
          </h2>
          <p className="text-sm text-[#647899] mt-1">{pack.keywordHint}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-[#EFF6FF]">
            <div className="text-xs text-[#647899]">Tổng điểm ô chữ</div>
            <div className="text-2xl font-extrabold text-[#2563EB] tabular-nums">
              {score} điểm
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[#ECFDF5]">
            <div className="text-xs text-[#647899]">Hàng ngang hoàn thành</div>
            <div className="text-2xl font-extrabold text-[#059669] tabular-nums">
              {solvedIds.length}/{pack.rows.length}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={handleRestart}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-bold"
          >
            <RotateCcw className="w-4 h-4" />
            Chơi lại ô chữ
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

  // ==================== 1-SCREEN CROSSWORD WORKSPACE ====================
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
            🧩 Ô Chữ Tin Học · Tin học {grade}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-bold tabular-nums">
          <span className="text-[#2563EB] inline-flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5" />
            {score} điểm
          </span>
          <span className="text-[#059669]">
            Đã giải: {solvedIds.length}/{pack.rows.length}
          </span>
          <button
            type="button"
            onClick={() => setKeywordModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FEF9C3] hover:bg-[#FDE047] border border-[#FACC15] text-[#854D0E] text-xs font-extrabold transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5" />
            Đoán Từ Khóa Dọc (+60đ)
          </button>
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

      {/* Main 1-Screen Split Grid: Left Crossword Matrix + Right Interactive Clue Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left: Aligned Crossword Board with Golden Vertical Keyword Column */}
        <div className="lg:col-span-7 bg-gradient-to-br from-[#EFF6FF] via-[#FFFFFF] to-[#F0FDF4] rounded-3xl border border-[#BFDBFE] p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-extrabold text-[#163A70]">
              Cột vàng dọc là Từ Khóa Bí Mật ({pack.keyword.length} chữ cái)
            </span>
            <span className="text-[#0284C7] font-bold">Chạm từng hàng để giải</span>
          </div>

          <div className="space-y-2 overflow-x-auto py-1">
            {pack.rows.map((row) => {
              const isSolved = solvedIds.includes(row.id);
              const isSelected = selectedRowId === row.id;
              const hasHintLetter = revealedLetterRows.includes(row.id);
              const leftOffset = maxKeyCol - row.keyIndex;

              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedRowId(row.id)}
                  className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-2xl border transition-all text-left ${
                    isSelected
                      ? 'bg-[#DBEAFE]/70 border-[#2563EB]'
                      : isSolved
                        ? 'bg-[#ECFDF5]/60 border-[#A7F3D0]'
                        : 'bg-white/80 border-transparent hover:border-[#BFDBFE]'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 ${
                      isSolved
                        ? 'bg-[#10B981] text-white'
                        : isSelected
                          ? 'bg-[#2563EB] text-white'
                          : 'bg-[#E2ECF9] text-[#163A70]'
                    }`}
                  >
                    {row.id}
                  </span>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: leftOffset }).map((_, i) => (
                      <span
                        key={`pad-${i}`}
                        className="w-7 h-7 sm:w-8 sm:h-8 shrink-0"
                        aria-hidden="true"
                      />
                    ))}

                    {row.answer.split('').map((char, cIdx) => {
                      const isKeyCell = cIdx === row.keyIndex;
                      const showChar =
                        isSolved || (hasHintLetter && (cIdx === 0 || isKeyCell));
                      return (
                        <span
                          key={cIdx}
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-xs sm:text-sm font-extrabold border-2 transition-colors shrink-0 ${
                            isKeyCell
                              ? isSolved
                                ? 'bg-[#FACC15] border-[#CA8A04] text-[#163A70]'
                                : 'bg-[#FEF9C3] border-[#FACC15] text-[#854D0E]'
                              : isSolved
                                ? 'bg-white border-[#10B981] text-[#065F46]'
                                : 'bg-white border-[#CBD5E1] text-[#163A70]'
                          }`}
                        >
                          {showChar ? char : ''}
                        </span>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="px-3 py-2 rounded-xl bg-white/90 border border-[#DBEAFE] text-xs font-semibold text-[#163A70]">
            {feedback}
          </div>
        </div>

        {/* Right: Active Row Clue + 1-Screen Answer Input / 4-Choice Helper */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-[#DCE8F8] p-4 sm:p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-[#2563EB]">
                HÀNG NGANG #{activeRow.id} · {activeRow.answer.length} CHỮ CÁI
              </span>
              <span className="text-[11px] font-semibold text-[#647899]">
                {activeRow.topic}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F4F9FF] border border-[#DBEAFE]">
              <div className="text-sm sm:text-base font-bold text-[#163A70] leading-snug">
                {activeRow.clue}
              </div>
            </div>

            {solvedIds.includes(activeRow.id) ? (
              <div className="p-4 rounded-2xl bg-[#ECFDF5] border border-[#A7F3D0] flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-[#10B981] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#059669]">Đã giải xong hàng này!</div>
                  <div className="text-base font-extrabold text-[#163A70]">
                    {activeRow.displayWord}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Toggle between Quick 4 Choices & Direct Typing */}
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#EFF6FF] rounded-xl">
                  <button
                    type="button"
                    onClick={() => setShowChoicesMode(true)}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      showChoicesMode
                        ? 'bg-[#2563EB] text-white'
                        : 'text-[#4B6384] hover:text-[#163A70]'
                    }`}
                  >
                    Chọn nhanh 4 đáp án (+15đ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowChoicesMode(false)}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      !showChoicesMode
                        ? 'bg-[#2563EB] text-white'
                        : 'text-[#4B6384] hover:text-[#163A70]'
                    }`}
                  >
                    Tự gõ đáp án (+25đ)
                  </button>
                </div>

                {showChoicesMode ? (
                  <div className="grid grid-cols-2 gap-2">
                    {activeRow.choices.map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => handleSolveAttempt(ch, true)}
                        className="px-3 py-3 rounded-xl border border-[#D8E6F8] bg-[#F8FBFF] hover:border-[#2563EB] hover:bg-[#EEF6FF] text-xs sm:text-sm font-extrabold text-[#163A70] transition-colors"
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSolveAttempt(inputVal, false);
                    }}
                    className="space-y-2.5"
                  >
                    <input
                      type="text"
                      value={inputVal}
                      onChange={(e) => setInputVal(e.target.value)}
                      placeholder="Gõ từ khóa (có dấu hoặc không dấu)..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-sm font-bold text-[#163A70] focus:outline-none focus:border-[#2563EB]"
                    />
                    <button
                      type="submit"
                      className="w-full py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-bold"
                    >
                      Kiểm tra ô chữ
                    </button>
                  </form>
                )}

                <button
                  type="button"
                  disabled={revealedLetterRows.includes(activeRow.id)}
                  onClick={() => {
                    playBoostSound();
                    setRevealedLetterRows((prev) => [...prev, activeRow.id]);
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#FEFCE8] hover:bg-[#FEF08A] disabled:opacity-45 border border-[#FDE047] text-[#854D0E] text-xs font-bold transition-colors"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  {revealedLetterRows.includes(activeRow.id)
                    ? 'Đã mở chữ cái gợi ý'
                    : 'Mở chữ cái đầu & chữ cột vàng'}
                </button>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[#EDF4FC] text-xs text-[#647899] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
            <span>Gợi ý Từ khóa dọc: {pack.keywordHint}</span>
          </div>
        </div>
      </div>

      {/* Vertical Keyword Guess Modal */}
      {keywordModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#163A70]/60"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleKeywordSubmit}
            className="w-full max-w-md bg-white rounded-2xl border border-[#FDE047] p-5 space-y-4 shadow-2xl"
          >
            <div>
              <div className="text-xs font-extrabold text-[#CA8A04]">
                🔑 ĐOÁN TỪ KHÓA HÀNG DỌC (+60 ĐIỂM)
              </div>
              <p className="text-sm text-[#4B6384] mt-1">{pack.keywordHint}</p>
            </div>
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder={`Nhập ${pack.keyword.length} chữ cái...`}
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-[#D4E3F7] text-base font-extrabold uppercase tracking-wider text-[#163A70] focus:outline-none focus:border-[#2563EB]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setKeywordModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#DCE8F8] text-xs font-bold text-[#647899]"
              >
                Đóng
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold"
              >
                Xác nhận Từ khóa
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
