import { Chapter, ClassStudentRecord, Grade } from '../src/types';
import { GRADE6_CHAPTERS } from './kntt/grade6';
import { GRADE7_CHAPTERS } from './kntt/grade7';
import { GRADE8_CHAPTERS } from './kntt/grade8';
import { GRADE9_CHAPTERS } from './kntt/grade9';

export const CURRICULUM_CHAPTERS: Chapter[] = [
  ...GRADE6_CHAPTERS,
  ...GRADE7_CHAPTERS,
  ...GRADE8_CHAPTERS,
  ...GRADE9_CHAPTERS,
];

export function getChaptersByGrade(grade: Grade): Chapter[] {
  return CURRICULUM_CHAPTERS.filter((c) => c.grade === grade);
}

export function getLessonTitlesByGrade(grade: Grade): string[] {
  const titles: string[] = [];
  for (const ch of getChaptersByGrade(grade)) {
    for (const lesson of ch.lessons) {
      titles.push(lesson.title);
    }
  }
  return titles;
}

export const CLASS_ROSTER_SEED: ClassStudentRecord[] = [
  // Lớp 8A1
  {
    id: 'st-8a1-02',
    name: 'Trần Quốc Bảo',
    className: '8A1',
    grade: 8,
    lessonsCompleted: 14,
    totalLessons: 16,
    gamesPlayed: 9,
    avgAccuracy: 92,
    totalPoints: 580,
    weakTopic: 'Bài 15: Gỡ lỗi',
    lastActive: 'Hôm nay, 09:15',
  },
  {
    id: 'st-8a1-03',
    name: 'Lê Thảo Vy',
    className: '8A1',
    grade: 8,
    lessonsCompleted: 12,
    totalLessons: 16,
    gamesPlayed: 6,
    avgAccuracy: 84,
    totalPoints: 410,
    weakTopic: 'Bài 5: Sử dụng bảng tính giải quyết bài toán thực tế',
    lastActive: 'Hôm nay, 08:40',
  },
  {
    id: 'st-8a1-04',
    name: 'Phạm Gia Huy',
    className: '8A1',
    grade: 8,
    lessonsCompleted: 8,
    totalLessons: 16,
    gamesPlayed: 4,
    avgAccuracy: 64,
    totalPoints: 230,
    weakTopic: 'Bài 6: Sắp xếp và lọc dữ liệu',
    lastActive: 'Hôm qua',
  },
  {
    id: 'st-8a1-05',
    name: 'Đỗ Hoàng Khánh Linh',
    className: '8A1',
    grade: 8,
    lessonsCompleted: 15,
    totalLessons: 16,
    gamesPlayed: 8,
    avgAccuracy: 89,
    totalPoints: 520,
    weakTopic: 'Bài 13: Biểu diễn dữ liệu',
    lastActive: 'Hôm nay, 07:55',
  },
  {
    id: 'st-8a1-06',
    name: 'Vũ Đức Mạnh',
    className: '8A1',
    grade: 8,
    lessonsCompleted: 6,
    totalLessons: 16,
    gamesPlayed: 3,
    avgAccuracy: 58,
    totalPoints: 175,
    weakTopic: 'Bài 14: Cấu trúc điều khiển',
    lastActive: '2 ngày trước',
  },

  // Lớp 6A1
  {
    id: 'st-6a1-01',
    name: 'Nguyễn Ngọc Hân',
    className: '6A1',
    grade: 6,
    lessonsCompleted: 15,
    totalLessons: 16,
    gamesPlayed: 7,
    avgAccuracy: 91,
    totalPoints: 490,
    weakTopic: 'Bài 16: Các cấu trúc điều khiển',
    lastActive: 'Hôm nay, 10:05',
  },
  {
    id: 'st-6a1-02',
    name: 'Bùi Nhật Minh',
    className: '6A1',
    grade: 6,
    lessonsCompleted: 11,
    totalLessons: 16,
    gamesPlayed: 5,
    avgAccuracy: 78,
    totalPoints: 340,
    weakTopic: 'Bài 8: Thư điện tử',
    lastActive: 'Hôm qua',
  },
  {
    id: 'st-6a1-03',
    name: 'Hoàng Thanh Trúc',
    className: '6A1',
    grade: 6,
    lessonsCompleted: 9,
    totalLessons: 16,
    gamesPlayed: 3,
    avgAccuracy: 62,
    totalPoints: 195,
    weakTopic: 'Bài 3: Thông tin trong máy tính',
    lastActive: '2 ngày trước',
  },

  // Lớp 7A2
  {
    id: 'st-7a2-01',
    name: 'Đặng Tuấn Kiệt',
    className: '7A2',
    grade: 7,
    lessonsCompleted: 14,
    totalLessons: 16,
    gamesPlayed: 8,
    avgAccuracy: 88,
    totalPoints: 510,
    weakTopic: 'Bài 15: Thuật toán tìm kiếm nhị phân',
    lastActive: 'Hôm nay, 09:45',
  },
  {
    id: 'st-7a2-02',
    name: 'Ngô Phương Anh',
    className: '7A2',
    grade: 7,
    lessonsCompleted: 10,
    totalLessons: 16,
    gamesPlayed: 5,
    avgAccuracy: 74,
    totalPoints: 320,
    weakTopic: 'Bài 8: Công cụ hỗ trợ tính toán',
    lastActive: 'Hôm qua',
  },
  {
    id: 'st-7a2-03',
    name: 'Phan Hải Đăng',
    className: '7A2',
    grade: 7,
    lessonsCompleted: 7,
    totalLessons: 16,
    gamesPlayed: 2,
    avgAccuracy: 55,
    totalPoints: 140,
    weakTopic: 'Bài 16: Thuật toán sắp xếp',
    lastActive: '3 ngày trước',
  },

  // Lớp 9A1
  {
    id: 'st-9a1-01',
    name: 'Tạ Minh Quân',
    className: '9A1',
    grade: 9,
    lessonsCompleted: 16,
    totalLessons: 16,
    gamesPlayed: 11,
    avgAccuracy: 94,
    totalPoints: 670,
    weakTopic: 'Bài 11a: Sử dụng hàm SUMIF',
    lastActive: 'Hôm nay, 10:20',
  },
  {
    id: 'st-9a1-02',
    name: 'Lương Bảo Ngọc',
    className: '9A1',
    grade: 9,
    lessonsCompleted: 13,
    totalLessons: 16,
    gamesPlayed: 7,
    avgAccuracy: 86,
    totalPoints: 470,
    weakTopic: 'Bài 12a: Sử dụng hàm IF',
    lastActive: 'Hôm nay, 08:15',
  },
  {
    id: 'st-9a1-03',
    name: 'Trịnh Gia Bảo',
    className: '9A1',
    grade: 9,
    lessonsCompleted: 9,
    totalLessons: 16,
    gamesPlayed: 4,
    avgAccuracy: 67,
    totalPoints: 260,
    weakTopic: 'Bài 10a: Sử dụng hàm COUNTIF',
    lastActive: 'Hôm qua',
  },
];
