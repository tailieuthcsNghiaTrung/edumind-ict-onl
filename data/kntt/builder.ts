import { Difficulty, Grade, Question } from '../../src/types';

export type McqSpec = [
  Difficulty,
  string,
  [string, string, string, string],
  number,
  string,
];

export type TfSpec = [Difficulty, string, boolean, string];

export function buildLessonBank(
  grade: Grade,
  lessonNumber: number,
  topic: string,
  mcqs: McqSpec[],
  tfs: TfSpec[]
): Question[] {
  const pad = String(lessonNumber).padStart(2, '0');
  const mcqItems: Question[] = mcqs.map(([difficulty, prompt, options, correctIndex, explanation], idx) => ({
    id: `k${grade}-${pad}-m${idx + 1}`,
    grade,
    lessonNumber,
    topic,
    questionType: 'mcq',
    difficulty,
    prompt,
    options,
    correctIndex,
    explanation,
  }));

  const tfItems: Question[] = tfs.map(([difficulty, prompt, isTrue, explanation], idx) => ({
    id: `k${grade}-${pad}-tf${idx + 1}`,
    grade,
    lessonNumber,
    topic,
    questionType: 'true-false',
    difficulty,
    prompt,
    options: ['Đúng', 'Sai'],
    correctIndex: isTrue ? 0 : 1,
    explanation,
  }));

  return [...mcqItems, ...tfItems];
}
