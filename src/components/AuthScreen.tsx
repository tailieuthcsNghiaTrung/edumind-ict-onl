import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { HERO_BRIGHT_BANNER } from '../../data/games';
import { signInStaffWithGoogle } from '../firebase';
import {
  BRAND_ROBOT_LOGO,
  getStudentAvatarByGender,
  inferGenderFromVietnameseName,
  STUDENT_BOY_AVATAR,
  STUDENT_GIRL_AVATAR,
  TEACHER_AVATAR,
} from '../hooks/useEduMindStore';
import { Grade, StudentGender, UserProfile, UserRole } from '../types';

interface AuthScreenProps {
  onLogin: (profile: UserProfile, token?: string | null) => void;
  noticeMessage?: string | null;
}

interface AuthStatusResponse {
  envConfigured: { admin: boolean; teacher: boolean };
  configured: { admin: boolean; teacher: boolean };
  requiresFirstRunSetup: boolean;
}

export default function AuthScreen({ onLogin, noticeMessage }: AuthScreenProps) {
  const [role, setRole] = useState<UserRole>('student');

  // Student form fields (zero demo names)
  const [name, setName] = useState('');
  const [gender, setGender] = useState<StudentGender>('female');
  const [genderManual, setGenderManual] = useState(false);
  const [grade, setGrade] = useState<Grade>(8);
  const [className, setClassName] = useState('8A1');

  // Teacher / Admin server auth status
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Teacher / Admin login fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // First-run setup fields (when Teacher / Admin credentials have not been created yet)
  const [adminSetupUser, setAdminSetupUser] = useState('HOÀNG KHÔI VỸ');
  const [adminSetupPass, setAdminSetupPass] = useState('');
  const [adminSetupConfirm, setAdminSetupConfirm] = useState('');
  const [teacherSetupUser, setTeacherSetupUser] = useState('');
  const [teacherSetupPass, setTeacherSetupPass] = useState('');
  const [teacherSetupConfirm, setTeacherSetupConfirm] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchAuthStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/auth/status');
      if (res.ok) {
        const data = (await res.json()) as AuthStatusResponse;
        setAuthStatus(data);
      }
    } catch {
      // Handled smoothly in UI
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    void fetchAuthStatus();
  }, []);

  const switchRole = (nextRole: UserRole) => {
    setRole(nextRole);
    setErrorMsg(null);
    setSuccessMsg(null);
    setPassword('');
  };

  const handleStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg('Vui lòng nhập họ và tên học sinh.');
      return;
    }
    const cleanClass = className.trim().toUpperCase() || `${grade}A1`;
    onLogin(
      {
        id: `st-${Date.now()}`,
        name: trimmedName,
        role: 'student',
        gender,
        grade,
        className: cleanClass,
        school: 'Trường THCS',
        avatarUrl: getStudentAvatarByGender(gender, trimmedName),
      },
      null
    );
  };

  const handleFirstRunSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const needAdmin = !authStatus?.configured.admin;
    const needTeacher = !authStatus?.configured.teacher;

    if (needAdmin && adminSetupPass !== adminSetupConfirm) {
      setErrorMsg('Xác nhận mật khẩu Quản trị viên chưa khớp.');
      return;
    }
    if (needTeacher && teacherSetupPass !== teacherSetupConfirm) {
      setErrorMsg('Xác nhận mật khẩu Giáo viên chưa khớp.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminUsername: adminSetupUser.trim(),
          adminPassword: adminSetupPass,
          adminDisplayName: 'HOÀNG KHÔI VỸ',
          teacherUsername: teacherSetupUser.trim(),
          teacherPassword: teacherSetupPass,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Không thể thiết lập tài khoản. Vui lòng kiểm tra lại.');
        return;
      }

      const prefillUser = role === 'admin' ? adminSetupUser.trim() : teacherSetupUser.trim();
      setUsername(prefillUser);
      setPassword('');
      setAdminSetupPass('');
      setAdminSetupConfirm('');
      setTeacherSetupPass('');
      setTeacherSetupConfirm('');
      await fetchAuthStatus();
      setSuccessMsg(
        'Đã tạo tên đăng nhập và mật khẩu cho Giáo viên & Quản trị thành công! Mời nhập mật khẩu vừa tạo để đăng nhập.'
      );
    } catch {
      setErrorMsg('Không kết nối được tới máy chủ xác thực.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrivilegedLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role !== 'teacher' && role !== 'admin') return;
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!username.trim() || !password) {
      setErrorMsg('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          username: username.trim(),
          password,
        }),
      });
      const data = (await res.json()) as {
        token?: string;
        profile?: UserProfile;
        error?: string;
      };
      if (!res.ok || !data.token || !data.profile) {
        setErrorMsg(data.error ?? 'Tên đăng nhập hoặc mật khẩu không chính xác.');
        return;
      }
      onLogin(data.profile, data.token);
    } catch {
      setErrorMsg('Không thể kết nối máy chủ để xác thực tài khoản.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleStaffLogin = async () => {
    if (role !== 'teacher' && role !== 'admin') return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const cred = await signInStaffWithGoogle();
      const fbUser = cred.user;
      if (!fbUser || !fbUser.emailVerified) {
        setErrorMsg('Tài khoản Google chưa xác minh email. Vui lòng dùng tài khoản hợp lệ.');
        return;
      }
      onLogin(
        {
          id: `fb-${fbUser.uid}`,
          name:
            fbUser.email === 'khanhbp0805@gmail.com'
              ? 'HOÀNG KHÔI VỸ'
              : fbUser.displayName || fbUser.email || 'Giáo viên Tin học',
          role: role === 'admin' || fbUser.email === 'khanhbp0805@gmail.com' ? 'admin' : 'teacher',
          grade: 8,
          className: role === 'admin' ? 'Quản trị viên' : 'Tổ Tin học THCS',
          school: 'Trường THCS',
          avatarUrl: TEACHER_AVATAR,
        },
        null
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('popup-closed-by-user')) {
        setErrorMsg('Không thể đăng nhập bằng Google Firebase. Vui lòng thử lại.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isPrivilegedRole = role === 'teacher' || role === 'admin';
  const showSetupForm =
    isPrivilegedRole &&
    !loadingStatus &&
    authStatus !== null &&
    !authStatus.configured[role];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EFF7FF] via-[#F7FBFF] to-[#ECFDF5] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-4xl bg-white rounded-3xl border border-[#D8E7FA] overflow-hidden grid grid-cols-1 md:grid-cols-12 shadow-sm">
        {/* Left Bright Visual Brand Panel */}
        <div className="md:col-span-5 relative bg-gradient-to-b from-[#E0F2FE] via-[#EFF6FF] to-[#ECFDF5] p-6 sm:p-7 flex flex-col justify-between border-b md:border-b-0 md:border-r border-[#DCEAF9]">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-white shadow-sm bg-[#EAF4FF] shrink-0">
                <img
                  src={BRAND_ROBOT_LOGO}
                  alt="EduMind ICT Robot AI"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <div className="text-lg font-extrabold tracking-tight text-[#163A70]">
                  EduMind ICT
                </div>
                <div className="text-[11px] font-semibold text-[#0284C7]">
                  Tin học THCS trực tuyến · Kết nối tri thức
                </div>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden border border-white shadow-xs h-40">
              <img
                src={HERO_BRIGHT_BANNER}
                alt="Không gian học tập Tin học THCS tươi sáng"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>

            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold leading-snug text-[#163A70] text-balance">
                Vui học và chơi với Tin học
              </h1>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-[#D3E5FA] flex items-center gap-2 text-xs font-semibold text-[#0284C7]">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Chương trình GDPT 2018 · Tin học 6, 7, 8, 9 KNTT</span>
          </div>
        </div>

        {/* Right Clean Login / First-Run Setup Form */}
        <div className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-center">
          <div className="mb-5">
            <h2 className="text-2xl font-extrabold text-[#163A70]">
              Đăng nhập EduMind ICT
            </h2>
            <p className="text-sm text-[#647899] mt-1">
              Chọn đúng vai trò để vào học tập hoặc quản lí thống kê lớp học.
            </p>
          </div>

          {/* Role Tabs */}
          <div className="mb-5">
            <label className="block text-xs font-bold text-[#163A70] mb-1.5">
              Vai trò sử dụng
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#EFF6FF] rounded-xl border border-[#DCEAF9]">
              <button
                type="button"
                onClick={() => switchRole('student')}
                className={`py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-colors ${
                  role === 'student'
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : 'text-[#526582] hover:text-[#163A70]'
                }`}
              >
                Học sinh
              </button>
              <button
                type="button"
                onClick={() => switchRole('teacher')}
                className={`py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-colors ${
                  role === 'teacher'
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : 'text-[#526582] hover:text-[#163A70]'
                }`}
              >
                Giáo viên
              </button>
              <button
                type="button"
                onClick={() => switchRole('admin')}
                className={`py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-colors ${
                  role === 'admin'
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : 'text-[#526582] hover:text-[#163A70]'
                }`}
              >
                Quản trị
              </button>
            </div>
          </div>

          {noticeMessage && !errorMsg && !successMsg && (
            <div className="mb-4 p-3 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] text-xs sm:text-sm text-[#1E40AF] flex items-start gap-2">
              <UserCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{noticeMessage}</span>
            </div>
          )}

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs sm:text-sm text-[#991B1B] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-xs sm:text-sm text-[#065F46] flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ==================== STUDENT LOGIN FORM ==================== */}
          {role === 'student' && (
            <form onSubmit={handleStudentSubmit} autoComplete="off" className="space-y-4">
              <div>
                <label
                  htmlFor="login-name"
                  className="block text-xs font-bold text-[#163A70] mb-1.5"
                >
                  Họ và tên học sinh
                </label>
                <input
                  id="login-name"
                  name="edumind_student_fullname"
                  type="text"
                  autoComplete="off"
                  value={name}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setName(nextVal);
                    if (!genderManual) {
                      const inferred = inferGenderFromVietnameseName(nextVal);
                      if (inferred) setGender(inferred);
                    }
                  }}
                  placeholder="Nhập họ và tên của em..."
                  className="w-full px-4 py-3 rounded-xl border border-[#D4E3F7] text-sm text-[#163A70] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#163A70] mb-1.5">
                  Giới tính (tự chọn hình đại diện)
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setGender('male');
                      setGenderManual(true);
                    }}
                    className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-colors ${
                      gender === 'male'
                        ? 'bg-[#EEF6FF] border-[#2563EB] text-[#163A70] ring-1 ring-[#2563EB]/25'
                        : 'bg-white border-[#D4E3F7] text-[#526582] hover:border-[#93C5FD]'
                    }`}
                  >
                    <img
                      src={STUDENT_BOY_AVATAR}
                      alt="Hình đại diện bé trai"
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full object-cover border border-[#CBE0FF] shrink-0"
                    />
                    <div className="leading-tight">
                      <div className="text-xs font-extrabold">Nam</div>
                      <div className="text-[11px] text-[#647899]">Hình bé trai</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setGender('female');
                      setGenderManual(true);
                    }}
                    className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-colors ${
                      gender === 'female'
                        ? 'bg-[#FFF0F6] border-[#EC4899] text-[#831843] ring-1 ring-[#EC4899]/25'
                        : 'bg-white border-[#D4E3F7] text-[#526582] hover:border-[#F9A8D4]'
                    }`}
                  >
                    <img
                      src={STUDENT_GIRL_AVATAR}
                      alt="Hình đại diện bé gái"
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full object-cover border border-[#FBCFE8] shrink-0"
                    />
                    <div className="leading-tight">
                      <div className="text-xs font-extrabold">Nữ</div>
                      <div className="text-[11px] text-[#647899]">Hình bé gái</div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#163A70] mb-1.5">
                    Khối lớp
                  </label>
                  <select
                    value={grade}
                    onChange={(e) => {
                      const g = Number(e.target.value) as Grade;
                      setGrade(g);
                      setClassName(`${g}A1`);
                    }}
                    className="w-full px-3.5 py-3 rounded-xl border border-[#D4E3F7] text-sm text-[#163A70] bg-white focus:outline-none focus:border-[#2563EB]"
                  >
                    <option value={6}>Khối 6 (Tin học 6)</option>
                    <option value={7}>Khối 7 (Tin học 7)</option>
                    <option value={8}>Khối 8 (Tin học 8)</option>
                    <option value={9}>Khối 9 (Tin học 9)</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="login-class"
                    className="block text-xs font-bold text-[#163A70] mb-1.5"
                  >
                    Lớp học
                  </label>
                  <input
                    id="login-class"
                    type="text"
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    placeholder="Ví dụ: 8A1"
                    className="w-full px-3.5 py-3 rounded-xl border border-[#D4E3F7] text-sm text-[#163A70] focus:outline-none focus:border-[#2563EB]"
                    required
                  />
                </div>
              </div>

              <p className="text-[11px] text-[#647899]">
                Thông tin khối và lớp giúp hệ thống tự động chọn đúng bài học SGK và ghi nhận kết quả vào báo cáo của giáo viên.
              </p>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#0EA5E9] hover:from-[#1D4ED8] hover:to-[#0284C7] text-white text-sm font-bold shadow-xs transition-all"
              >
                Vào không gian học tập
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* ==================== FIRST-RUN SETUP (TEACHER & ADMIN) ==================== */}
          {showSetupForm && (
            <form onSubmit={handleFirstRunSetup} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#F0F7FF] border border-[#BFDBFE] text-xs text-[#1E3A8A] flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Thiết lập tên đăng nhập &amp; mật khẩu lần đầu</div>
                  <p className="mt-0.5 text-[#3B5998] leading-relaxed">
                    Hệ thống chưa có tài khoản Giáo viên &amp; Quản trị. Hãy thiết lập tên đăng nhập (3–60 kí tự) và mật khẩu (tối thiểu 6 kí tự) ngay dưới đây.
                  </p>
                </div>
              </div>

              {!authStatus?.configured.admin && (
                <div className="p-3.5 rounded-xl border border-[#DCE8F8] bg-[#FAFBFD] space-y-2.5">
                  <div className="text-xs font-extrabold text-[#163A70] flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-[#2563EB]" />
                    1. Tài khoản Quản trị viên (HOÀNG KHÔI VỸ)
                  </div>
                  <input
                    type="text"
                    value={adminSetupUser}
                    onChange={(e) => setAdminSetupUser(e.target.value)}
                    placeholder="Tên đăng nhập Quản trị: HOÀNG KHÔI VỸ"
                    autoComplete="username"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#D4E3F7] bg-white text-sm text-[#163A70] focus:outline-none focus:border-[#2563EB]"
                    required
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="password"
                      value={adminSetupPass}
                      onChange={(e) => setAdminSetupPass(e.target.value)}
                      placeholder="Mật khẩu Quản trị (≥ 6 kí tự)"
                      autoComplete="new-password"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D4E3F7] bg-white text-sm text-[#163A70] focus:outline-none focus:border-[#2563EB]"
                      required
                    />
                    <input
                      type="password"
                      value={adminSetupConfirm}
                      onChange={(e) => setAdminSetupConfirm(e.target.value)}
                      placeholder="Nhập lại mật khẩu Quản trị"
                      autoComplete="new-password"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D4E3F7] bg-white text-sm text-[#163A70] focus:outline-none focus:border-[#2563EB]"
                      required
                    />
                  </div>
                </div>
              )}

              {!authStatus?.configured.teacher && (
                <div className="p-3.5 rounded-xl border border-[#DCE8F8] bg-[#FAFBFD] space-y-2.5">
                  <div className="text-xs font-extrabold text-[#163A70] flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-[#059669]" />
                    2. Tài khoản Giáo viên Tin học
                  </div>
                  <input
                    type="text"
                    value={teacherSetupUser}
                    onChange={(e) => setTeacherSetupUser(e.target.value)}
                    placeholder="Tên đăng nhập Giáo viên (vd: gv_tinhoc)"
                    autoComplete="username"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#D4E3F7] bg-white text-sm text-[#163A70] focus:outline-none focus:border-[#2563EB]"
                    required
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="password"
                      value={teacherSetupPass}
                      onChange={(e) => setTeacherSetupPass(e.target.value)}
                      placeholder="Mật khẩu Giáo viên (≥ 6 kí tự)"
                      autoComplete="new-password"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D4E3F7] bg-white text-sm text-[#163A70] focus:outline-none focus:border-[#2563EB]"
                      required
                    />
                    <input
                      type="password"
                      value={teacherSetupConfirm}
                      onChange={(e) => setTeacherSetupConfirm(e.target.value)}
                      placeholder="Nhập lại mật khẩu Giáo viên"
                      autoComplete="new-password"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D4E3F7] bg-white text-sm text-[#163A70] focus:outline-none focus:border-[#2563EB]"
                      required
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-gradient-to-r from-[#059669] to-[#0EA5E9] hover:from-[#047857] hover:to-[#0284C7] disabled:opacity-50 text-white text-sm font-bold shadow-xs transition-all"
              >
                <ShieldCheck className="w-4 h-4" />
                {submitting ? 'Đang lưu cấu hình...' : 'Hoàn tất tạo tài khoản GV & Admin'}
              </button>
            </form>
          )}

          {/* ==================== TEACHER / ADMIN PASSWORD LOGIN ==================== */}
          {isPrivilegedRole && !showSetupForm && (
            <form onSubmit={handlePrivilegedLogin} className="space-y-4">
              {loadingStatus ? (
                <div className="py-6 text-center text-sm text-[#647899]">
                  Đang kiểm tra trạng thái xác thực...
                </div>
              ) : (
                <>
                  <div>
                    <label
                      htmlFor="staff-username"
                      className="block text-xs font-bold text-[#163A70] mb-1.5"
                    >
                      Tên đăng nhập {role === 'admin' ? 'Quản trị viên' : 'Giáo viên'}
                    </label>
                    <input
                      id="staff-username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={
                        role === 'admin'
                          ? 'Nhập tên đăng nhập: HOÀNG KHÔI VỸ'
                          : 'Nhập tên đăng nhập Giáo viên...'
                      }
                      autoComplete="username"
                      className="w-full px-4 py-3 rounded-xl border border-[#D4E3F7] text-sm text-[#163A70] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="staff-password"
                      className="block text-xs font-bold text-[#163A70] mb-1.5"
                    >
                      Mật khẩu
                    </label>
                    <div className="relative">
                      <input
                        id="staff-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Nhập mật khẩu tài khoản..."
                        autoComplete="current-password"
                        className="w-full pl-4 pr-11 py-3 rounded-xl border border-[#D4E3F7] text-sm text-[#163A70] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#647899] hover:text-[#163A70]"
                        aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#F8FBFF] border border-[#E2ECF9] text-[11px] text-[#526582] flex items-start gap-2">
                    <Lock className="w-3.5 h-3.5 text-[#2563EB] shrink-0 mt-0.5" />
                    <span>
                      Sau khi đăng nhập, thầy/cô hoặc quản trị viên có thể đổi hoặc tạo lại tên đăng nhập và mật khẩu tại mục{' '}
                      <strong className="text-[#163A70]">Báo cáo lớp học → Tài khoản GV &amp; Admin</strong>.
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#0EA5E9] hover:from-[#1D4ED8] hover:to-[#0284C7] disabled:opacity-50 text-white text-sm font-bold shadow-xs transition-all"
                  >
                    <Lock className="w-4 h-4" />
                    {submitting
                      ? 'Đang xác thực...'
                      : role === 'admin'
                        ? 'Đăng nhập Quản trị viên'
                        : 'Đăng nhập Giáo viên'}
                  </button>

                  <div className="relative flex items-center py-1">
                    <div className="flex-1 border-t border-[#E2ECF9]" />
                    <span className="px-3 text-[11px] font-semibold text-[#71809A]">
                      hoặc đọc thẳng dữ liệu Firebase
                    </span>
                    <div className="flex-1 border-t border-[#E2ECF9]" />
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleGoogleStaffLogin()}
                    disabled={submitting}
                    className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-white border border-[#CBDDF5] hover:bg-[#F4F8FF] disabled:opacity-50 text-[#163A70] text-sm font-bold transition-colors"
                  >
                    <Cloud className="w-4 h-4 text-[#2563EB]" />
                    Đăng nhập bằng Google Quản trị (Firebase)
                  </button>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
