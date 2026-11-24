export type Grade = 6 | 7 | 8 | 9;

export type UserRole = 'student' | 'teacher' | 'admin';

export type NavSection =
  | 'overview'
  | 'curriculum'
  | 'practice'
  | 'games'
  | 'progress'
  | 'assistant'
  | 'teacher-report';

export type GameId =
  | 'knowledge-race-3d'
  | 'cloud-stairs-3d'
  | 'health-festival-3d'
  | 'knowledge-farm'
  | 'mystery-gift-box'
  | 'ict-crossword'
  | 'puzzle-pieces'
  | 'treasure-hunt-map'
  | 'speed-race'
  | 'streak-challenge'
  | 'knowledge-treasure'
  | 'school-survival'
  | 'sage-arena';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type StudentGender = 'male' | 'female';

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  gender?: StudentGender;
  grade: Grade;
  className: string;
  school: string;
  avatarUrl: string;
}

export type QuestionType = 'mcq' | 'true-false';

export interface Question {
  id: string;
  grade: Grade;
  lessonNumber?: number;
  topic: string;
  questionType?: QuestionType;
  difficulty: Difficulty;
  prompt: string;
  options: [string, string, string, string] | [string, string];
  correctIndex: number;
  explanation: string;
}

export interface StudentAnalyticsRecord {
  id: string;
  name: string;
  grade: Grade;
  className: string;
  loginCount: number;
  firstLoginAt: string;
  lastActiveAt: string;
  lessonsCompleted: number;
  totalLessons: number;
  sessionsCount: number;
  gamesPlayed: number;
  practiceCount: number;
  mockExamCount: number;
  totalCorrect: number;
  totalQuestions: number;
  avgAccuracy: number;
  totalPoints: number;
  weakTopic: string;
  recentSessions: {
    id: string;
    type: 'game' | 'practice' | 'mock-exam';
    title: string;
    score: number;
    maxScore: number;
    correctCount: number;
    totalQuestions: number;
    completedAt: string;
  }[];
}

export interface GradeAnalyticsSummary {
  grade: Grade;
  studentCount: number;
  classCount: number;
  totalSessions: number;
  avgAccuracy: number;
  avgPoints: number;
}

export interface ClassAnalyticsSummary {
  className: string;
  grade: Grade;
  studentCount: number;
  totalSessions: number;
  gamesPlayed: number;
  practiceCount: number;
  avgAccuracy: number;
  avgPoints: number;
}

export interface AnalyticsOverviewResponse {
  totalStudents: number;
  totalClasses: number;
  totalSessions: number;
  overallAccuracy: number;
  byGrade: GradeAnalyticsSummary[];
  byClass: ClassAnalyticsSummary[];
  students: StudentAnalyticsRecord[];
}

export interface TrueFalse4Question {
  id: string;
  grade: Grade;
  topic: string;
  prompt: string;
  statements: [
    { text: string; isTrue: boolean },
    { text: string; isTrue: boolean },
    { text: string; isTrue: boolean },
    { text: string; isTrue: boolean },
  ];
  explanation: string;
}

export interface Lesson {
  id: string;
  lessonNumber?: number;
  title: string;
  durationMinutes: number;
  summary: string;
  keyPoints: string[];
  exampleTitle: string;
  exampleCodeOrNote: string;
}

export interface Chapter {
  id: string;
  grade: Grade;
  topic: string;
  title: string;
  description: string;
  lessons: Lesson[];
}

export interface GameMeta {
  id: GameId;
  title: string;
  emoji: string;
  shortTag: string;
  description: string;
  bgColor: string;
  accentColor: string;
  borderColor: string;
  questionCount: number;
  scoringRule: string;
  mechanicSummary: string;
}

export interface AnswerReviewItem {
  question: Question;
  selectedIndex: number | null;
  isCorrect: boolean;
  timeSpentSeconds?: number;
  pointsEarned: number;
}

export interface SessionRecord {
  id: string;
  type: 'game' | 'practice' | 'mock-exam';
  title: string;
  gameId?: GameId;
  grade: Grade;
  topic?: string;
  score: number;
  maxScore: number;
  correctCount: number;
  totalQuestions: number;
  durationSeconds: number;
  bestStreak?: number;
  gemsUnlocked?: number;
  rankTitle?: string;
  completedAt: string;
}

export interface GameRecordSummary {
  bestScore: number;
  plays: number;
  bestStreak?: number;
  bestTimeSeconds?: number;
  bestGems?: number;
  bestRank?: string;
}

export interface TopicStat {
  grade: Grade;
  topic: string;
  correct: number;
  total: number;
}

export interface StudentProgress {
  completedLessonIds: string[];
  sessions: SessionRecord[];
  gameRecords: Partial<Record<GameId, GameRecordSummary>>;
  topicStats: Record<string, TopicStat>;
  dailyStreak: number;
}

export interface ClassStudentRecord {
  id: string;
  name: string;
  className: string;
  grade: Grade;
  lessonsCompleted: number;
  totalLessons: number;
  gamesPlayed: number;
  avgAccuracy: number;
  totalPoints: number;
  weakTopic: string;
  lastActive: string;
  isCurrentUser?: boolean;
}
