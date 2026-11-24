import { Difficulty, Grade, Question, TrueFalse4Question } from '../src/types';
import { CURRICULUM_CHAPTERS, getLessonTitlesByGrade } from './curriculum';
import { GRADE6_QUESTIONS } from './kntt/grade6';
import { GRADE6_EXTRA_A } from './kntt/grade6ExtraA';
import { GRADE6_EXTRA_B } from './kntt/grade6ExtraB';
import { GRADE7_QUESTIONS } from './kntt/grade7';
import { GRADE7_EXTRA_A } from './kntt/grade7ExtraA';
import { GRADE7_EXTRA_B } from './kntt/grade7ExtraB';
import { GRADE8_QUESTIONS } from './kntt/grade8';
import { GRADE8_EXTRA_A } from './kntt/grade8ExtraA';
import { GRADE8_EXTRA_B } from './kntt/grade8ExtraB';
import { GRADE9_QUESTIONS } from './kntt/grade9';
import { GRADE9_EXTRA_A } from './kntt/grade9ExtraA';
import { GRADE9_EXTRA_B } from './kntt/grade9ExtraB';

const PERMUTATIONS_4: [number, number, number, number][] = [
  [0, 1, 2, 3],
  [0, 1, 3, 2],
  [0, 2, 1, 3],
  [0, 2, 3, 1],
  [0, 3, 1, 2],
  [0, 3, 2, 1],
  [1, 0, 2, 3],
  [1, 0, 3, 2],
  [1, 2, 0, 3],
  [1, 2, 3, 0],
  [1, 3, 0, 2],
  [1, 3, 2, 0],
  [2, 0, 1, 3],
  [2, 0, 3, 1],
  [2, 1, 0, 3],
  [2, 1, 3, 0],
  [2, 3, 0, 1],
  [2, 3, 1, 0],
  [3, 0, 1, 2],
  [3, 0, 2, 1],
  [3, 1, 0, 2],
  [3, 1, 2, 0],
  [3, 2, 0, 1],
  [3, 2, 1, 0],
];

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hasPositionalOptionRef(options: readonly string[]): boolean {
  return options.some((o) =>
    /\b(cả\s+[a-d]\s+và\s+[a-d]|cả\s+ba\s+(đáp án|phương án)\s+trên|tất cả\s+(các\s+)?(đáp án|phương án|ý)\s+trên)\b/i.test(
      o
    )
  );
}

/**
 * Deterministically permutes a 4-option MCQ based on its ID so static bank answers
 * are evenly distributed (~25% A, ~25% B, ~25% C, ~25% D) instead of mostly A.
 */
export function shuffleMcqOptionsDeterministic(q: Question): Question {
  if (q.questionType === 'true-false' || q.options.length !== 4) return q;
  if (hasPositionalOptionRef(q.options)) return q;
  const perm = PERMUTATIONS_4[hashString(q.id + '::' + q.prompt.slice(0, 24)) % PERMUTATIONS_4.length];
  const nextOptions = perm.map((idx) => q.options[idx]) as [string, string, string, string];
  const nextCorrect = perm.indexOf(q.correctIndex);
  return {
    ...q,
    options: nextOptions,
    correctIndex: nextCorrect >= 0 ? nextCorrect : 0,
  };
}

/**
 * Randomly shuffles a 4-option MCQ for live practice, mock exams, and games so
 * answer positions (A, B, C, D) stay unpredictable and engaging every session.
 */
export function shuffleMcqOptionsRandom(q: Question): Question {
  if (q.questionType === 'true-false' || q.options.length !== 4) return q;
  if (hasPositionalOptionRef(q.options)) return q;
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const nextOptions = order.map((idx) => q.options[idx]) as [string, string, string, string];
  const nextCorrect = order.indexOf(q.correctIndex);
  return {
    ...q,
    options: nextOptions,
    correctIndex: nextCorrect >= 0 ? nextCorrect : 0,
  };
}

const RAW_QUESTION_BANK: Question[] = [
  ...GRADE6_QUESTIONS,
  ...GRADE6_EXTRA_A,
  ...GRADE6_EXTRA_B,
  ...GRADE7_QUESTIONS,
  ...GRADE7_EXTRA_A,
  ...GRADE7_EXTRA_B,
  ...GRADE8_QUESTIONS,
  ...GRADE8_EXTRA_A,
  ...GRADE8_EXTRA_B,
  ...GRADE9_QUESTIONS,
  ...GRADE9_EXTRA_A,
  ...GRADE9_EXTRA_B,
];

// 1.280 câu hỏi Tin học 6, 7, 8, 9 (20 câu/bài × 16 bài/khối = 320 câu/khối)
// Đáp án trắc nghiệm được phân bổ đều giữa A, B, C, D.
export const QUESTION_BANK: Question[] = RAW_QUESTION_BANK.map(shuffleMcqOptionsDeterministic);

export function getMergedQuestionBank(customQuestions: Question[] = []): Question[] {
  return [...customQuestions, ...QUESTION_BANK];
}

export function getQuestionsByGrade(grade: Grade, customQuestions: Question[] = []): Question[] {
  return getMergedQuestionBank(customQuestions).filter((q) => q.grade === grade);
}

export function getQuestionsByLesson(
  grade: Grade,
  lessonTitle: string,
  customQuestions: Question[] = []
): Question[] {
  return getMergedQuestionBank(customQuestions).filter(
    (q) => q.grade === grade && q.topic === lessonTitle
  );
}

export function getTopicsByGrade(grade: Grade, customQuestions: Question[] = []): string[] {
  const ordered = new Set<string>(getLessonTitlesByGrade(grade));
  for (const q of getMergedQuestionBank(customQuestions)) {
    if (q.grade === grade) ordered.add(q.topic);
  }
  return Array.from(ordered);
}

export function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Track recently served question IDs per grade so consecutive games avoid repeating questions
const RECENT_IDS_BY_GRADE: Record<number, Set<string>> = {
  6: new Set(),
  7: new Set(),
  8: new Set(),
  9: new Set(),
};

export function resetSeenQuestionsForGrade(grade: Grade) {
  RECENT_IDS_BY_GRADE[grade]?.clear();
}

export function resetAllSeenQuestions() {
  RECENT_IDS_BY_GRADE[6]?.clear();
  RECENT_IDS_BY_GRADE[7]?.clear();
  RECENT_IDS_BY_GRADE[8]?.clear();
  RECENT_IDS_BY_GRADE[9]?.clear();
}

export function pickRandomQuestions(
  grade: Grade,
  count: number,
  options?: {
    topic?: string;
    strictTopic?: boolean;
    ascendingDifficulty?: boolean;
    customQuestions?: Question[];
  }
): Question[] {
  let pool = getMergedQuestionBank(options?.customQuestions).filter((q) => q.grade === grade);
  if (options?.topic) {
    const topicPool = pool.filter((q) => q.topic === options.topic);
    if (options.strictTopic) {
      pool = topicPool;
    } else if (topicPool.length > 0) {
      pool = topicPool;
    }
  }

  if (pool.length === 0) return [];

  if (options?.strictTopic) {
    const rank: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };
    const isTf = (q: Question) => q.questionType === 'true-false' || q.options.length === 2;
    const aiFirst = shuffleArray(
      pool.filter((q) => q.id.startsWith('ai-') || q.id.startsWith('custom-'))
    );
    const coreMcq = shuffleArray(
      pool.filter((q) => !q.id.startsWith('ai-') && !q.id.startsWith('custom-') && !isTf(q))
    ).sort((a, b) => rank[a.difficulty] - rank[b.difficulty]);
    const coreTf = shuffleArray(
      pool.filter((q) => !q.id.startsWith('ai-') && !q.id.startsWith('custom-') && isTf(q))
    ).sort((a, b) => rank[a.difficulty] - rank[b.difficulty]);

    if (count >= pool.length) {
      return [...aiFirst, ...coreMcq, ...coreTf].map(shuffleMcqOptionsRandom);
    }

    const tfTarget = Math.min(coreTf.length, Math.max(2, Math.round(count * 0.25)));
    const mcqTarget = Math.max(0, count - aiFirst.length - tfTarget);
    const picked = [
      ...aiFirst.slice(0, count),
      ...coreMcq.slice(0, mcqTarget),
      ...coreTf.slice(0, tfTarget),
    ].slice(0, Math.min(count, pool.length));
    return picked
      .sort((a, b) => {
        const ta = isTf(a) ? 1 : 0;
        const tb = isTf(b) ? 1 : 0;
        if (ta !== tb) return ta - tb;
        return rank[a.difficulty] - rank[b.difficulty];
      })
      .map(shuffleMcqOptionsRandom);
  }

  const seenSet = RECENT_IDS_BY_GRADE[grade] ?? new Set<string>();
  const unseen = pool.filter((q) => !seenSet.has(q.id));
  const seen = pool.filter((q) => seenSet.has(q.id));

  const prioritizeFresh = (items: Question[]): Question[] => {
    const freshCustom = shuffleArray(
      items.filter(
        (q) => !seenSet.has(q.id) && (q.id.startsWith('ai-') || q.id.startsWith('custom-'))
      )
    );
    const freshCore = shuffleArray(
      items.filter(
        (q) => !seenSet.has(q.id) && !q.id.startsWith('ai-') && !q.id.startsWith('custom-')
      )
    );
    const recycled = shuffleArray(items.filter((q) => seenSet.has(q.id)));
    return [...freshCustom, ...freshCore, ...recycled];
  };

  let result: Question[];

  if (options?.ascendingDifficulty) {
    const rank: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };
    const easy = prioritizeFresh(pool.filter((q) => q.difficulty === 'easy'));
    const medium = prioritizeFresh(pool.filter((q) => q.difficulty === 'medium'));
    const hard = prioritizeFresh(pool.filter((q) => q.difficulty === 'hard'));
    const ordered = [...easy, ...medium, ...hard];
    if (ordered.length >= count) {
      const eTake = Math.min(easy.length, Math.max(2, Math.floor(count * 0.35)));
      const hTake = Math.min(hard.length, Math.max(2, Math.floor(count * 0.3)));
      const mTake = count - eTake - hTake;
      const picked = [
        ...easy.slice(0, eTake),
        ...medium.slice(0, Math.max(0, mTake)),
        ...hard.slice(0, hTake),
      ];
      const used = new Set(picked.map((p) => p.id));
      for (const item of ordered) {
        if (picked.length >= count) break;
        if (!used.has(item.id)) {
          picked.push(item);
          used.add(item.id);
        }
      }
      result = picked.sort((a, b) => rank[a.difficulty] - rank[b.difficulty]).slice(0, count);
    } else {
      result = ordered;
    }
  } else {
    const prioritized = prioritizeFresh(unseen.length > 0 ? [...unseen, ...seen] : pool);
    result = prioritized.slice(0, Math.min(count, pool.length));
  }

  if (unseen.length < count) {
    seenSet.clear();
  }
  for (const q of result) {
    seenSet.add(q.id);
  }
  RECENT_IDS_BY_GRADE[grade] = seenSet;

  return result.map(shuffleMcqOptionsRandom);
}

export interface MockExamBuildResult {
  mcqQuestions: Question[];
  tf4Questions: TrueFalse4Question[];
  selectedLessons: { lessonNumber: number; title: string }[];
}

/**
 * Builds a 16-question Mock Exam (12 MCQs with shuffled A/B/C/D options + 4 True/False
 * questions of 4 statements each = 16 statements) strictly from the selected lessons.
 */
export function buildMockExamSet(
  grade: Grade,
  selectedLessonNumbers: number[],
  customQuestions: Question[] = []
): MockExamBuildResult {
  const gradeLessons = CURRICULUM_CHAPTERS.filter((c) => c.grade === grade)
    .flatMap((c) => c.lessons)
    .map((l, idx) => ({ ...l, lessonNum: l.lessonNumber ?? idx + 1 }))
    .sort((a, b) => a.lessonNum - b.lessonNum);

  const chosenNumSet = new Set(
    selectedLessonNumbers.length > 0
      ? selectedLessonNumbers
      : gradeLessons.map((l) => l.lessonNum)
  );
  const selectedLessons = gradeLessons
    .filter((l) => chosenNumSet.has(l.lessonNum))
    .map((l) => ({ lessonNumber: l.lessonNum, title: l.title }));
  const selectedTitleSet = new Set(selectedLessons.map((l) => l.title));

  const allGradePool = getMergedQuestionBank(customQuestions).filter((q) => {
    if (q.grade !== grade) return false;
    if (q.lessonNumber !== undefined && chosenNumSet.has(q.lessonNumber)) return true;
    return selectedTitleSet.has(q.topic);
  });

  const isTf = (q: Question) => q.questionType === 'true-false' || q.options.length === 2;
  const mcqPool = allGradePool.filter((q) => !isTf(q) && q.options.length === 4);
  const tfSinglePool = allGradePool.filter(isTf);

  // 1. Distribute 12 MCQs fairly across the selected lessons
  const mcqByLesson = new Map<string, Question[]>();
  for (const l of selectedLessons) {
    mcqByLesson.set(
      l.title,
      shuffleArray(mcqPool.filter((q) => q.topic === l.title))
    );
  }
  const pickedMcqs: Question[] = [];
  const usedMcqIds = new Set<string>();
  const lessonOrder = shuffleArray(selectedLessons.map((l) => l.title));
  let round = 0;
  while (pickedMcqs.length < 12 && round < 30) {
    let addedInRound = false;
    for (const title of lessonOrder) {
      if (pickedMcqs.length >= 12) break;
      const bucket = mcqByLesson.get(title) ?? [];
      if (round < bucket.length) {
        const candidate = bucket[round];
        if (!usedMcqIds.has(candidate.id)) {
          usedMcqIds.add(candidate.id);
          pickedMcqs.push(shuffleMcqOptionsRandom(candidate));
          addedInRound = true;
        }
      }
    }
    if (!addedInRound) break;
    round++;
  }
  // Top up if fewer than 12 (e.g., if custom lesson has extra questions)
  if (pickedMcqs.length < 12) {
    for (const q of shuffleArray(mcqPool)) {
      if (pickedMcqs.length >= 12) break;
      if (!usedMcqIds.has(q.id)) {
        usedMcqIds.add(q.id);
        pickedMcqs.push(shuffleMcqOptionsRandom(q));
      }
    }
  }

  // 2. Build 4 True/False 4-statement questions (16 statements) strictly from selected lessons
  interface SingleStatement {
    topic: string;
    text: string;
    isTrue: boolean;
    explanation: string;
  }

  const statementsPool: SingleStatement[] = [];
  const tfByLesson = new Map<string, Question[]>();
  for (const l of selectedLessons) {
    tfByLesson.set(
      l.title,
      shuffleArray(tfSinglePool.filter((q) => q.topic === l.title))
    );
  }
  const tfLessonOrder = shuffleArray(selectedLessons.map((l) => l.title));
  let tfRound = 0;
  while (statementsPool.length < 16 && tfRound < 12) {
    let added = false;
    for (const title of tfLessonOrder) {
      if (statementsPool.length >= 16) break;
      const bucket = tfByLesson.get(title) ?? [];
      if (tfRound < bucket.length) {
        const item = bucket[tfRound];
        const cleanText = item.prompt
          .replace(/^Nhận định sau Đúng hay Sai:\s*/i, '')
          .replace(/^Phát biểu sau Đúng hay Sai:\s*/i, '')
          .trim();
        statementsPool.push({
          topic: item.topic,
          text: cleanText,
          isTrue: item.correctIndex === 0,
          explanation: item.explanation,
        });
        added = true;
      }
    }
    if (!added) break;
    tfRound++;
  }

  // If the student chose only 1–3 lessons (< 16 native True/False statements), synthesize
  // additional statements strictly from unused MCQs inside those exact chosen lessons
  if (statementsPool.length < 16) {
    const fallbackMcqs = shuffleArray([
      ...mcqPool.filter((q) => !usedMcqIds.has(q.id)),
      ...mcqPool.filter((q) => usedMcqIds.has(q.id)),
    ]);
    for (let i = 0; i < fallbackMcqs.length && statementsPool.length < 16; i++) {
      const m = fallbackMcqs[i];
      const makeTrue = statementsPool.length % 2 === 0;
      const chosenOptIdx = makeTrue
        ? m.correctIndex
        : (m.correctIndex + 1) % m.options.length;
      const stem = m.prompt.replace(/[?:.]\s*$/, '');
      statementsPool.push({
        topic: m.topic,
        text: `${stem} — ${m.options[chosenOptIdx]}.`,
        isTrue: makeTrue,
        explanation: m.explanation,
      });
    }
  }

  const tf4Questions: TrueFalse4Question[] = [];
  const shuffledStatements = shuffleArray(statementsPool.slice(0, 16));
  const letters = ['a', 'b', 'c', 'd'];

  for (let i = 0; i < 4; i++) {
    const chunk = shuffledStatements.slice(i * 4, i * 4 + 4);
    if (chunk.length < 4) break;
    const topicsInCard = Array.from(new Set(chunk.map((c) => c.topic)));
    const topicLabel =
      topicsInCard.length === 1
        ? topicsInCard[0]
        : topicsInCard.slice(0, 2).join(' · ') +
          (topicsInCard.length > 2 ? ` (+${topicsInCard.length - 2} bài)` : '');

    tf4Questions.push({
      id: `mock-tf4-${grade}-${Date.now()}-${i + 1}`,
      grade,
      topic: topicLabel,
      prompt: `Xét các nhận định sau về kiến thức Tin học ${grade} (chọn Đúng hoặc Sai cho từng ý a, b, c, d):`,
      statements: chunk.map((c) => ({ text: c.text, isTrue: c.isTrue })) as [
        { text: string; isTrue: boolean },
        { text: string; isTrue: boolean },
        { text: string; isTrue: boolean },
        { text: string; isTrue: boolean },
      ],
      explanation: chunk
        .map((c, idx) => `${letters[idx]}) ${c.isTrue ? 'Đúng' : 'Sai'} — ${c.explanation}`)
        .join(' '),
    });
  }

  return {
    mcqQuestions: pickedMcqs,
    tf4Questions,
    selectedLessons,
  };
}

export const TRUE_FALSE_4_BANK: TrueFalse4Question[] = [
  // Tin học 6
  {
    id: 'tf6-1',
    grade: 6,
    topic: 'Bài 3: Thông tin trong máy tính',
    prompt: 'Xét các nhận định sau về Tin học 6:',
    statements: [
      { text: '1 Byte bằng đúng 8 Bit.', isTrue: true },
      { text: 'Bàn phím và chuột đều là thiết bị ra.', isTrue: false },
      { text: '1 KB lớn hơn 1 MB về dung lượng lưu trữ.', isTrue: false },
      { text: 'Mọi dữ liệu trong máy tính đều được biểu diễn bằng dãy bit (0 và 1).', isTrue: true },
    ],
    explanation:
      '1 Byte = 8 Bit (Đúng); bàn phím/chuột là thiết bị vào (Sai); 1 MB = 1024 KB nên KB nhỏ hơn MB (Sai); máy tính biểu diễn mọi dữ liệu bằng dãy bit (Đúng).',
  },
  {
    id: 'tf6-2',
    grade: 6,
    topic: 'Bài 8: Thư điện tử',
    prompt: 'Xét các nhận định về Internet, thư điện tử và thuật toán (Tin học 6):',
    statements: [
      { text: 'Trình duyệt web (Chrome, Edge) dùng để truy cập các trang web.', isTrue: true },
      { text: 'Gửi Email qua mục BCC giúp ẩn danh sách địa chỉ người nhận với nhau.', isTrue: true },
      { text: 'Mật khẩu "12345678" là mật khẩu mạnh và an toàn.', isTrue: false },
      { text: 'Trong sơ đồ khối thuật toán, hình thoi dùng để kiểm tra điều kiện.', isTrue: true },
    ],
    explanation:
      'Chrome/Edge là trình duyệt (Đúng), BCC ẩn địa chỉ người nhận (Đúng), "12345678" là mật khẩu rất yếu (Sai), hình thoi là kiểm tra điều kiện (Đúng).',
  },
  // Tin học 7
  {
    id: 'tf7-1',
    grade: 7,
    topic: 'Bài 8: Công cụ hỗ trợ tính toán',
    prompt: 'Xét các phát biểu về phần mềm bảng tính Excel (Tin học 7):',
    statements: [
      { text: 'Mọi công thức trong Excel đều bắt đầu bằng dấu bằng (=).', isTrue: true },
      { text: 'Hàm =AVERAGE(A1:A5) dùng để tính tổng các ô từ A1 đến A5.', isTrue: false },
      { text: 'Vùng ô C2:E4 gồm tổng cộng 9 ô tính.', isTrue: true },
      { text: 'Dãy dấu ####### báo hiệu độ rộng cột quá hẹp so với giá trị số.', isTrue: true },
    ],
    explanation:
      'AVERAGE tính trung bình cộng chứ không phải tổng (SUM); các nhận định còn lại đều đúng.',
  },
  {
    id: 'tf7-2',
    grade: 7,
    topic: 'Bài 15: Thuật toán tìm kiếm nhị phân',
    prompt: 'Xét các phát biểu về thuật toán tìm kiếm và phần mềm (Tin học 7):',
    statements: [
      { text: 'Tìm kiếm nhị phân yêu cầu danh sách phải được sắp xếp trước.', isTrue: true },
      { text: 'Windows 11 và Linux là các hệ điều hành máy tính.', isTrue: true },
      { text: 'Tìm kiếm tuần tự luôn nhanh hơn tìm kiếm nhị phân trên danh sách 1000 số đã sắp xếp.', isTrue: false },
      { text: 'Phím F5 trong PowerPoint dùng để trình chiếu từ trang chiếu đầu tiên.', isTrue: true },
    ],
    explanation:
      'Trên danh sách lớn đã sắp xếp, tìm kiếm nhị phân nhanh hơn vượt trội so với tìm kiếm tuần tự.',
  },
  // Tin học 8
  {
    id: 'tf8-1',
    grade: 8,
    topic: 'Bài 5: Sử dụng bảng tính giải quyết bài toán thực tế',
    prompt: 'Xét các phát biểu về địa chỉ ô, lọc dữ liệu và biểu đồ (Tin học 8):',
    statements: [
      { text: '$A$1 là địa chỉ tuyệt đối, không thay đổi khi sao chép công thức.', isTrue: true },
      { text: 'Khi Lọc dữ liệu (Filter), các hàng không thỏa điều kiện sẽ bị xóa vĩnh viễn.', isTrue: false },
      { text: 'Biểu đồ hình tròn (Pie) phù hợp thể hiện tỉ lệ phần trăm của tổng thể.', isTrue: true },
      { text: 'Phím F4 hỗ trợ chuyển nhanh giữa địa chỉ tương đối, tuyệt đối và hỗn hợp.', isTrue: true },
    ],
    explanation:
      'Filter chỉ tạm thời ẩn các hàng không thỏa điều kiện chứ không xóa dữ liệu gốc.',
  },
  {
    id: 'tf8-2',
    grade: 8,
    topic: 'Bài 13: Biểu diễn dữ liệu',
    prompt: 'Xét các phát biểu về lập trình Scratch và lịch sử máy tính (Tin học 8):',
    statements: [
      { text: 'Biến (Variable) dùng để lưu trữ giá trị có thể thay đổi trong chương trình.', isTrue: true },
      { text: 'Biểu thức logic (10 > 5) VÀ (3 = 7) có giá trị Đúng (True).', isTrue: false },
      { text: 'Máy tính thế hệ thứ nhất ENIAC sử dụng đèn điện tử chân không.', isTrue: true },
      { text: 'Tìm nguyên nhân và sửa sai cho chương trình chạy đúng gọi là gỡ lỗi (Debugging).', isTrue: true },
    ],
    explanation:
      'Phép VÀ (AND) chỉ Đúng khi cả hai vế đều Đúng; vì 3 = 7 Sai nên biểu thức là Sai.',
  },
  // Tin học 9
  {
    id: 'tf9-1',
    grade: 9,
    topic: 'Bài 11a: Sử dụng hàm SUMIF',
    prompt: 'Xét các phát biểu về bảng tính quản lí tài chính (Tin học 9):',
    statements: [
      { text: 'Hàm COUNTIF dùng để đếm số ô thỏa mãn một điều kiện cho trước.', isTrue: true },
      { text: 'Hàm SUMIF dùng để tính tổng các giá trị thỏa mãn điều kiện.', isTrue: true },
      { text: 'Data Validation dùng để xóa toàn bộ dữ liệu trong trang tính.', isTrue: false },
      { text: 'Có thể lồng nhiều hàm IF vào nhau để phân loại nhiều mức kết quả.', isTrue: true },
    ],
    explanation:
      'Data Validation dùng để xác thực, giới hạn dữ liệu hợp lệ khi nhập vào ô.',
  },
  {
    id: 'tf9-2',
    grade: 9,
    topic: 'Bài 2: Thông tin trong giải quyết vấn đề',
    prompt: 'Xét các phát biểu về chất lượng thông tin, mô phỏng và bài toán tin học (Tin học 9):',
    statements: [
      { text: 'Bốn tiêu chí chất lượng thông tin gồm: Tính mới, chính xác, đầy đủ, sử dụng được.', isTrue: true },
      { text: 'Phần mềm mô phỏng giúp thực hiện thí nghiệm khoa học an toàn, trực quan.', isTrue: true },
      { text: 'Tài khoản mạng ẩn danh vi phạm pháp luật thì cơ quan chức năng không thể xử lí.', isTrue: false },
      { text: 'Bước đầu tiên giải bài toán tin học là xác định Đầu vào (Input) và Đầu ra (Output).', isTrue: true },
    ],
    explanation:
      'Mọi hành vi vi phạm pháp luật trên không gian mạng đều có thể bị truy vết và xử lí theo quy định.',
  },
];

export function getTrueFalse4ByGrade(grade: Grade): TrueFalse4Question[] {
  return TRUE_FALSE_4_BANK.filter((q) => q.grade === grade);
}
