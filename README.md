# 🎓 EduMind ICT Online

**EduMind ICT Online** là nền tảng web ôn tập và tương tác môn Tin học cấp THCS (khối 6, 7, 8, 9), bám sát chương trình Giáo dục phổ thông mới (bộ sách *Kết nối tri thức với cuộc sống*). Dự án kết hợp giữa **Ngân hàng câu hỏi chuẩn hóa**, **Trò chơi hóa 2D/3D (Gamification)**, **Trợ lý Trí tuệ nhân tạo (AI)** và **Hệ thống phân tích học tập thời gian thực**.

---

## ✨ Tính năng nổi bật

### 👨‍🎓 Dành cho Học sinh
* **Học liệu & Luyện tập theo chuẩn chương trình:** Hệ thống hóa kiến thức và câu hỏi trắc nghiệm cho đầy đủ 4 khối lớp (6, 7, 8, 9) kèm phản hồi đúng/sai tức thì.
* **Kho 8 trò chơi học tập 2D & 3D tương tác:**
  * *Đồ họa 3D (Three.js):* Đường đua tri thức (`KnowledgeRace3D`), Nấc thang trên mây (`CloudStairs3D`), Ngày hội sức khỏe (`HealthFestival3D`).
  * *Trò chơi 2D tương tác:* Nông trại tri thức (`KnowledgeFarmGame`), Ô chữ Tin học (`IctCrosswordGame`), Hộp quà bí ẩn (`MysteryGiftBoxGame`), Ghép mảnh tri thức (`PuzzlePiecesGame`), Bản đồ săn kho báu (`TreasureHuntMapGame`).
* **Trợ lý học tập AI:** Giải đáp thắc mắc, hướng dẫn tư duy và giải thích chi tiết các câu hỏi khó.
* **Phòng thi đấu trực tuyến (`ClassroomLobby`):** Tham gia ôn tập và thi đua trực tiếp cùng bạn bè trong lớp.
* **Theo dõi tiến độ cá nhân (`ProgressView`):** Trực quan hóa điểm số, lịch sử luyện tập và mức độ hoàn thành từng chủ đề.

### 👩‍🏫 Dành cho Giáo viên
* **Sinh câu hỏi tự động bằng AI (`AiQuestionGeneratorModal`):** Hỗ trợ tạo nhanh câu hỏi trắc nghiệm mới theo chủ đề và mức độ nhận thức.
* **Báo cáo & Thống kê toàn diện (`TeacherReportView`):** Theo dõi kết quả học tập của từng học sinh, phát hiện lỗ hổng kiến thức theo lớp/khối và hỗ trợ xuất dữ liệu thống kê định dạng CSV.

### 🔒 Bảo mật & Kiểm thử
* **Phân quyền dữ liệu chặt chẽ:** Thiết lập quy tắc bảo mật trực tiếp ở tầng cơ sở dữ liệu thông qua `firestore.rules` và tài liệu đặc tả `security_spec.md`.
* **Kiểm thử tự động:** Tích hợp mã kiểm thử quy tắc bảo mật (`firestore.rules.test.ts`) và cơ chế bắt lỗi giao diện (`ErrorBoundary`).

---

## 🛠️ Công nghệ sử dụng

| Thành phần | Công nghệ / Thư viện |
| :--- | :--- |
| **Giao diện (Frontend)** | React, TypeScript, Vite, CSS |
| **Đồ họa 3D & Âm thanh** | Three.js (`threeHelpers.ts`), Web Audio / Sound FX (`soundFx.ts`) |
| **Máy chủ (Backend)** | TypeScript Server (`backend/server.ts`) |
| **Cơ sở dữ liệu & Xác thực** | Firebase / Cloud Firestore (`firestoreAnalytics.ts`, `firestore.rules`) |
| **Trình quản lý gói** | Bun / npm |

---

## 📂 Cấu trúc thư mục

```text
edumind-ict-online/
├── backend/                  # Mã nguồn máy chủ xử lý nghiệp vụ và tích hợp AI
│   └── server.ts
├── data/                     # Dữ liệu chương trình học & ngân hàng câu hỏi
│   ├── kntt/                 # Học liệu Tin học khối 6, 7, 8, 9 (sách KNTT)
│   ├── curriculum.ts         # Cấu trúc chương trình giảng dạy
│   ├── games.ts              # Cấu hình danh sách trò chơi
│   ├── questionBank.ts       # Ngân hàng câu hỏi tổng hợp
│   └── importedStudentsSeed.ts
├── public/                   # Tài nguyên tĩnh và tệp dữ liệu thống kê mẫu
├── src/
│   ├── assets/images/        # Hình ảnh giao diện, avatar, thẻ trò chơi
│   ├── components/           # Các thành phần giao diện chính
│   │   ├── games/            # 8 trò chơi tương tác 2D & 3D
│   │   ├── AiQuestionGeneratorModal.tsx
│   │   ├── AssistantView.tsx
│   │   ├── AuthScreen.tsx
│   │   ├── ClassroomLobby.tsx
│   │   ├── CurriculumView.tsx
│   │   ├── PracticeView.tsx
│   │   ├── ProgressView.tsx
│   │   └── TeacherReportView.tsx
│   ├── hooks/                # Quản lý trạng thái ứng dụng (useEduMindStore.ts)
│   ├── services/             # Dịch vụ phân tích dữ liệu (firestoreAnalytics.ts)
│   ├── utils/                # Tiện ích đồ họa 3D và hiệu ứng âm thanh
│   ├── App.tsx               # Thành phần gốc của ứng dụng
│   ├── firebase.ts           # Khởi tạo kết nối Firebase
│   └── types.ts              # Định nghĩa kiểu dữ liệu TypeScript
├── firestore.rules           # Luật phân quyền bảo mật Cloud Firestore
├── firestore.rules.test.ts   # Kịch bản kiểm thử bảo mật tự động
├── security_spec.md          # Tài liệu đặc tả kiến trúc bảo mật
├── .env.example              # Mẫu cấu hình biến môi trường
├── package.json              # Danh sách thư viện và kịch bản chạy
└── vite.config.ts            # Cấu hình công cụ đóng gói Vite
```

---

## 🚀 Hướng dẫn cài đặt và chạy dự án

### 1. Yêu cầu môi trường
* **Node.js** (phiên bản `>= 18.x`) hoặc **Bun** (khuyến nghị vì dự án sử dụng `bun.lock`).
* Tài khoản **Firebase** (nếu triển khai cơ sở dữ liệu riêng) và khóa API cho tính năng Trợ lý AI.

### 2. Cài đặt thư viện
Mở cửa sổ dòng lệnh (Terminal) tại thư mục gốc của dự án và chạy:

```bash
# Sử dụng Bun (khuyến nghị)
bun install

# Hoặc sử dụng npm
npm install
```

### 3. Cấu hình biến môi trường
Tạo tệp `.env` từ tệp mẫu `.env.example`:

```bash
cp .env.example .env
```

Sau đó mở tệp `.env` và điền đầy đủ các khóa cấu hình cần thiết (API Key AI, cấu hình Firebase, cổng chạy máy chủ...).

### 4. Khởi chạy ứng dụng (Môi trường phát triển)

```bash
# Chạy bằng Bun
bun run dev

# Hoặc chạy bằng npm
npm run dev
```

Mở trình duyệt và truy cập địa chỉ hiển thị trên Terminal (thường là `http://localhost:5173`).

### 5. Đóng gói bản chính thức (Production Build)

```bash
# Kiểm tra mã nguồn & đóng gói
bun run build
# Hoặc: npm run build
```

---

## 🧪 Kiểm thử bảo mật (Firestore Security Rules)

Dự án đi kèm bộ kiểm thử tự động cho các quy tắc phân quyền dữ liệu (giáo viên, học sinh, quyền đọc/ghi điểm số). Bạn có thể tham khảo chi tiết tại `security_spec.md` và chạy kiểm thử tệp `firestore.rules.test.ts` với Firebase Emulator Suite.

---

## 📈 Định hướng phát triển

* Mở rộng kho học liệu cho các bộ sách giáo khoa khác và nhân rộng sang các môn học khác ở bậc THCS.
* Cá nhân hóa lộ trình ôn tập bằng thuật toán AI dựa trên lịch sử lỗi sai của từng học sinh (*Adaptive Learning*).
* Tích hợp công nghệ PWA hỗ trợ ôn tập ngoại tuyến (Offline Mode) tại các khu vực có kết nối Internet hạn chế.