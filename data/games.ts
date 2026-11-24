import { GameId, GameMeta } from '../src/types';

export const HERO_BRIGHT_BANNER =
  '/src/assets/images/hero_edumind_bright_1795273496659.jpg';

export interface FeaturedGameMeta {
  id:
    | 'knowledge-race-3d'
    | 'cloud-stairs-3d'
    | 'health-festival-3d'
    | 'knowledge-farm'
    | 'mystery-gift-box'
    | 'ict-crossword'
    | 'puzzle-pieces'
    | 'treasure-hunt-map';
  title: string;
  emoji: string;
  subtitle: string;
  description: string;
  imageUrl: string;
  bgColor: string;
  accentColor: string;
  borderColor: string;
  highlights: string[];
  ctaLabel: string;
  is3D: boolean;
}

export const FEATURED_GAMES_LIST: FeaturedGameMeta[] = [
  {
    id: 'knowledge-race-3d',
    title: 'Đường đua tri thức',
    emoji: '🏎️',
    subtitle: 'Đua xe 3D trên điện thoại · cả lớp cùng lúc',
    description:
      'Mở đường đua cho cả lớp, chọn xe 3D, lách rào chắn, vào trạm xăng và trả lời đúng để bứt tốc, nhận quà Chuối, Lửa đuôi xe, Tên lửa, Hào quang, Bom mực!',
    imageUrl: '/src/assets/images/game_card_racing_1795273495374.jpg',
    bgColor: '#FFF7E6',
    accentColor: '#D97706',
    borderColor: '#FDE2A7',
    highlights: [
      'Đâm rào chắn xe dừng hẳn mới hiện câu hỏi',
      'Trả lời đúng tăng tốc, sai hoặc bấm bừa xe lật 3D',
      'Né quá 5 hàng rào sau đóng kín · 5 mốc quà vật phẩm',
    ],
    ctaLabel: 'Mở đường đua',
    is3D: true,
  },
  {
    id: 'cloud-stairs-3d',
    title: 'Bậc Thang Lên Mây',
    emoji: '☁️',
    subtitle: 'Leo tháp mây 3D theo đội · Trắc nghiệm + Đúng/Sai',
    description:
      'Mở tháp mây 3D, cả lớp chia đội tự động cùng leo cổng mây. Câu sai quay lại sau 2 tầng, tích điểm đội mở Hộp quà, Sấm sét và Khiên bảo vệ!',
    imageUrl: '/src/assets/images/game_card_clouds_1795273497223.jpg',
    bgColor: '#ECFAFF',
    accentColor: '#0284C7',
    borderColor: '#BAE6FD',
    highlights: [
      'Kết hợp câu Trắc nghiệm 4 đáp án & Đúng/Sai 4 ý',
      'Làm tối đa 2 lần (sai quay lại sau 2 tầng, tính điểm lượt 1)',
      'Điểm đội mở Hộp quà, Sấm sét và Khiên',
    ],
    ctaLabel: 'Mở tháp mây',
    is3D: true,
  },
  {
    id: 'health-festival-3d',
    title: 'Hội Khoẻ Tri Thức',
    emoji: '🏃',
    subtitle: 'Chạy việt dã 3D vượt rào · Trạm nước kiến thức',
    description:
      'Mở sân vận động 3D, nhảy vượt chướng ngại và ghé trạm nước trả lời câu hỏi. Đúng nhận chai nước chạy khoẻ hơn; cuối trận quy ra điểm 10 và xuất tệp Excel!',
    imageUrl: '/src/assets/images/game_card_stadium_1795273495375.jpg',
    bgColor: '#ECFDF5',
    accentColor: '#059669',
    borderColor: '#A7F3D0',
    highlights: [
      'Nhảy vượt rào 3D & dừng tại trạm nước trả lời câu hỏi',
      'Sai bị mệt, câu quay lại trạm sau (sửa đúng được nửa điểm)',
      'Bảng thành tích cả lớp quy ra điểm 10 & xuất tệp Excel',
    ],
    ctaLabel: 'Mở sân vận động',
    is3D: true,
  },
  {
    id: 'knowledge-farm',
    title: 'Nông Trại Tri Thức',
    emoji: '🌾',
    subtitle: 'Trồng trọt & chăn nuôi vui nhộn bằng kiến thức Tin học',
    description:
      'Xây dựng khu nông trại rực rỡ của riêng bạn! Trả lời câu hỏi Tin học theo khối lớp để gieo hạt, tưới nước siêu tốc, chăm bò sữa – cừu bông và đuổi quạ bảo vệ mùa màng.',
    imageUrl: '/src/assets/images/game_card_farm_1795273496232.jpg',
    bgColor: '#F5F3FF',
    accentColor: '#7C3AED',
    borderColor: '#DDD6FE',
    highlights: [
      'Trồng Cà rốt, Ngô vàng, Dâu tây, Hướng dương & nuôi thú',
      'Sự kiện Quạ phá mùa & Thời tiết nắng vàng nhân đôi xu',
      'Mở khóa giống cây quý và nâng cấp nông trại vui nhộn',
    ],
    ctaLabel: 'Vào nông trại',
    is3D: false,
  },
  {
    id: 'mystery-gift-box',
    title: 'Mở Hộp Quà Bí Ẩn',
    emoji: '🎁',
    subtitle: '9 hộp quà bất ngờ · Chơi đơn hoặc chia 2 đội lớp học',
    description:
      'Chọn 1 trong 9 hộp quà rực rỡ hoặc bấm Quay hộp ngẫu nhiên! Trả lời đúng câu hỏi Tin học để khui ngay Kim cương, Ngôi sao, Thẻ nhân đôi điểm x2 và quà bí mật.',
    imageUrl: '/src/assets/images/game_card_giftbox_1795275493493.jpg',
    bgColor: '#FFF1F2',
    accentColor: '#E11D48',
    borderColor: '#FECDD3',
    highlights: [
      '9 hộp quà bất ngờ kèm nút Quay chọn hộp ngẫu nhiên cho cả lớp',
      'Hỗ trợ chế độ thi đua 2 đội (Đội Xanh vs Đội Cam)',
      'Phần thưởng ngẫu nhiên: Kim cương +50đ, Thẻ x2 điểm lượt sau',
    ],
    ctaLabel: 'Mở hộp quà ngay',
    is3D: false,
  },
  {
    id: 'ict-crossword',
    title: 'Ô Chữ Tin Học',
    emoji: '🧩',
    subtitle: 'Giải 6 hàng ngang · Khám phá Từ Khóa Bí Mật theo khối lớp',
    description:
      'Chinh phục bảng ô chữ Tin học chuẩn GDPT 2018 riêng cho từng khối 6, 7, 8, 9! Gõ trực tiếp hoặc bật gợi ý trắc nghiệm 4 đáp án để lật mở cột Từ Khóa Vàng.',
    imageUrl: '/src/assets/images/game_card_crossword_1795275492718.jpg',
    bgColor: '#EFF6FF',
    accentColor: '#2563EB',
    borderColor: '#BFDBFE',
    highlights: [
      'Bộ ô chữ & Từ khóa hàng dọc chuẩn kiến thức Tin học lớp 6 – 9',
      'Vừa gõ từ nhanh vừa có nút Gợi ý trắc nghiệm 4 đáp án 1 màn hình',
      'Đoán đúng Từ Khóa Bí Mật hàng dọc thưởng ngay +60 điểm',
    ],
    ctaLabel: 'Giải ô chữ ngay',
    is3D: false,
  },
  {
    id: 'puzzle-pieces',
    title: 'Lật Mảnh Ghép Bí Ẩn',
    emoji: '🖼️',
    subtitle: 'Lật 6 mảnh ghép đầy màu sắc · Đoán bức tranh bí mật',
    description:
      'Mỗi mảnh ghép ẩn chứa một câu hỏi Tin học thú vị. Trả lời đúng để lật mở từng góc bức tranh rực rỡ phía sau và giành thưởng lớn khi đoán đúng chủ đề bức tranh!',
    imageUrl: '/src/assets/images/game_card_jigsaw_1795275492462.jpg',
    bgColor: '#FEFCE8',
    accentColor: '#CA8A04',
    borderColor: '#FDE047',
    highlights: [
      '6 mảnh ghép sắc màu che giấu nhiều bức tranh Tin học sống động',
      'Mở từ 2 mảnh trở lên có thể bấm Đoán nhanh bức tranh (+50đ)',
      'Nhiều vòng tranh thú vị kèm kiến thức mở rộng bất ngờ',
    ],
    ctaLabel: 'Lật mảnh ghép',
    is3D: false,
  },
  {
    id: 'treasure-hunt-map',
    title: 'Truy Tìm Kho Báu Đảo Số',
    emoji: '🗺️',
    subtitle: 'Phiêu lưu bản đồ 6 trạm · Thu thập chìa khóa mở Rương Vàng',
    description:
      'Hóa thân thành nhà thám hiểm vượt qua 6 địa danh trên Đảo Số! Sử dụng La bàn 50/50, Đuốc gợi ý và Khiên bảo vệ để vượt thử thách Tin học và mở Rương Kho Báu.',
    imageUrl: '/src/assets/images/game_card_treasure_hunt_1795275492546.jpg',
    bgColor: '#ECFEFF',
    accentColor: '#0891B2',
    borderColor: '#A5F3FC',
    highlights: [
      'Bản đồ Đảo Số 6 chặng với nhân vật thám hiểm di chuyển trực quan',
      '3 bảo bối hỗ trợ: La bàn 50/50, Đuốc soi gợi ý và Khiên hộ mệnh',
      'Mở Rương Kho Báu Vàng nhận bộ sưu tập ngọc quý và bảng thưởng',
    ],
    ctaLabel: 'Bắt đầu thám hiểm',
    is3D: false,
  },
];

export const GAMES_LIST: GameMeta[] = [
  {
    id: 'speed-race',
    title: 'Đường đua tốc độ',
    emoji: '⚡',
    shortTag: '5 câu hỏi · Phản xạ nhanh',
    description:
      'Rèn luyện khả năng nhận biết và trả lời nhanh các câu hỏi Tin học dưới đồng hồ đếm ngược 15 giây mỗi chặng.',
    bgColor: '#FFF7E6',
    accentColor: '#D97706',
    borderColor: '#FDE2A7',
    questionCount: 5,
    scoringRule: '10 điểm / câu đúng · Ghi nhận kỷ lục thời gian',
    mechanicSummary: '5 câu ngẫu nhiên, đồng hồ 15 giây/câu, tổng hợp điểm và tốc độ về đích.',
  },
  {
    id: 'streak-challenge',
    title: 'Thử thách chuỗi đúng',
    emoji: '🔥',
    shortTag: '7 câu hỏi · Duy trì phong độ',
    description:
      'Duy trì độ chính xác liên tiếp qua 7 câu hỏi. Trả lời sai sẽ đưa chuỗi hiện tại về 0 — giữ vững ngọn lửa!',
    bgColor: '#FFF0F3',
    accentColor: '#E11D48',
    borderColor: '#FECDD3',
    questionCount: 7,
    scoringRule: '10 điểm / câu đúng · Lưu chuỗi đúng cao nhất',
    mechanicSummary: '7 câu hỏi, theo dõi chuỗi đúng liên tiếp và lưu kỷ lục chuỗi cao nhất.',
  },
  {
    id: 'knowledge-treasure',
    title: 'Kho báu tri thức',
    emoji: '💎',
    shortTag: '7 viên ngọc · Chinh phục rương vàng',
    description:
      'Mỗi câu trả lời đúng mở khóa một viên ngọc quý lấp lánh để tiến tới Rương Kho Báu Vàng.',
    bgColor: '#ECFAFF',
    accentColor: '#0284C7',
    borderColor: '#BAE6FD',
    questionCount: 7,
    scoringRule: 'Mở khóa 7 viên ngọc quý · Đạt từ 5 ngọc mở Rương Vàng',
    mechanicSummary: '7 thử thách mở khóa 7 viên ngọc quý từ Thạch anh đến Kim cương vương miện.',
  },
  {
    id: 'school-survival',
    title: 'Sinh tồn học đường',
    emoji: '🛡️',
    shortTag: '10 chặng · 3 trái tim sinh tồn',
    description:
      'Vượt qua tối đa 10 câu hỏi tăng dần độ khó với 3 mạng trái tim và 1 quyền trợ giúp 50/50 chiến lược.',
    bgColor: '#ECFDF5',
    accentColor: '#059669',
    borderColor: '#A7F3D0',
    questionCount: 10,
    scoringRule: '10 điểm / chặng vượt qua · Mất 1 tim khi trả lời sai',
    mechanicSummary: 'Tối đa 10 câu tăng dần độ khó, 3 mạng trái tim và 1 quyền loại trừ 50/50.',
  },
  {
    id: 'sage-arena',
    title: 'Đấu trường nhà thông thái',
    emoji: '👑',
    shortTag: '8 vòng đấu · Thăng hạng danh hiệu',
    description:
      'Chinh phục 8 vòng thi phân cấp độ khó kèm thẻ Nhân đôi điểm (x2) để đạt danh hiệu Nhà thông thái.',
    bgColor: '#F5F3FF',
    accentColor: '#7C3AED',
    borderColor: '#DDD6FE',
    questionCount: 8,
    scoringRule: '10 / 15 / 20 điểm theo độ khó · 1 lượt Nhân đôi (x2)',
    mechanicSummary: '8 vòng đấu leo bậc danh hiệu từ Tập sự đến Nhà thông thái với thẻ x2 điểm.',
  },
];

export function getGameTitleById(id: GameId): string {
  const f = FEATURED_GAMES_LIST.find((g) => g.id === id);
  if (f) return f.title;
  return GAMES_LIST.find((g) => g.id === id)?.title ?? 'Trò chơi kiến thức';
}

export const TREASURE_GEMS = [
  { name: 'Thạch anh tím', color: '#8B5CF6' },
  { name: 'Ngọc lục bảo', color: '#10B981' },
  { name: 'Lam ngọc biển', color: '#0284C7' },
  { name: 'Hoàng ngọc', color: '#F59E0B' },
  { name: 'Hồng ngọc', color: '#F43F5E' },
  { name: 'Ngọc bích băng', color: '#06B6D4' },
  { name: 'Kim cương vương miện', color: '#2563EB' },
];

export function getArenaRank(score: number): { title: string; nextTarget: number } {
  if (score >= 110) return { title: 'Nhà thông thái', nextTarget: 130 };
  if (score >= 80) return { title: 'Chuyên gia ICT', nextTarget: 110 };
  if (score >= 45) return { title: 'Học giả trẻ', nextTarget: 80 };
  return { title: 'Tập sự Tin học', nextTarget: 45 };
}
