import React, { useState } from 'react';
import { Lock, RotateCcw, Save, X } from 'lucide-react';
import {
  getStudentAvatarByGender,
  inferGenderFromVietnameseName,
  STUDENT_BOY_AVATAR,
  STUDENT_GIRL_AVATAR,
} from '../hooks/useEduMindStore';
import { Grade, StudentGender, UserProfile } from '../types';

interface ProfileModalProps {
  user: UserProfile;
  onUpdate: (patch: Partial<UserProfile>) => void;
  onResetProgress: () => void;
  onClose: () => void;
}

const GRADES: Grade[] = [6, 7, 8, 9];

export default function ProfileModal({
  user,
  onUpdate,
  onResetProgress,
  onClose,
}: ProfileModalProps) {
  const [name, setName] = useState(user.name);
  const [gender, setGender] = useState<StudentGender>(
    () => user.gender ?? inferGenderFromVietnameseName(user.name) ?? 'female'
  );
  const [grade, setGrade] = useState<Grade>(user.grade);
  const [className, setClassName] = useState(user.className);
  const [school, setSchool] = useState(user.school);
  const [resetDone, setResetDone] = useState(false);

  const previewAvatar =
    user.role === 'student'
      ? getStudentAvatarByGender(gender, name)
      : user.avatarUrl;

  const roleLabel =
    user.role === 'admin'
      ? 'Quản trị hệ thống'
      : user.role === 'teacher'
        ? 'Giáo viên Tin học'
        : 'Học sinh THCS';

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedName = name.trim() || user.name;
    const cleanedClass =
      user.role === 'admin'
        ? className.trim() || 'Quản trị hệ thống'
        : user.role === 'teacher'
          ? className.trim() || 'Tổ Tin học THCS'
          : className.trim().toUpperCase() || `${grade}A1`;

    onUpdate({
      name: cleanedName,
      gender: user.role === 'student' ? gender : undefined,
      grade,
      className: cleanedClass,
      school: school.trim() || 'Trường THCS',
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#102A56]/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl border border-[#DCE5F2] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EDF2F9]">
          <h2 id="profile-modal-title" className="text-lg font-bold text-[#102A56]">
            Hồ sơ người dùng
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[#71809A] hover:bg-[#F4F7FC] hover:text-[#17233C]"
            aria-label="Đóng hộp thoại hồ sơ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Read-only Role Banner with User Avatar */}
          <div className="p-3.5 rounded-xl bg-[#F4F8FF] border border-[#DCE8F8] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={previewAvatar}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-xs bg-[#EAF2FF] shrink-0"
              />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-[#647899]">
                  Vai trò đang đăng nhập
                </div>
                <div className="text-sm font-bold text-[#102A56] mt-0.5 truncate">
                  {roleLabel}
                </div>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 text-[11px] text-[#647899] bg-white px-2.5 py-1.5 rounded-lg border border-[#DCE8F8] shrink-0">
              <Lock className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Đăng xuất để đổi vai trò</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="profile-name" className="block text-xs font-semibold text-[#71809A] mb-1.5">
                Họ và tên hiển thị
              </label>
              <input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8E2F0] text-sm text-[#17233C] focus:outline-none focus:border-[#2864E8]"
                required
              />
            </div>

            {user.role === 'student' && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[#71809A] mb-1.5">
                  Giới tính &amp; Hình đại diện
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setGender('male')}
                    className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-colors ${
                      gender === 'male'
                        ? 'bg-[#EEF6FF] border-[#2864E8] text-[#102A56]'
                        : 'bg-white border-[#D8E2F0] text-[#526582] hover:bg-[#F4F7FC]'
                    }`}
                  >
                    <img
                      src={STUDENT_BOY_AVATAR}
                      alt="Hình đại diện bé trai"
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full object-cover border border-[#CBE0FF] shrink-0"
                    />
                    <span className="text-xs font-bold">Nam (Bé trai)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('female')}
                    className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-colors ${
                      gender === 'female'
                        ? 'bg-[#FFF0F6] border-[#EC4899] text-[#831843]'
                        : 'bg-white border-[#D8E2F0] text-[#526582] hover:bg-[#F4F7FC]'
                    }`}
                  >
                    <img
                      src={STUDENT_GIRL_AVATAR}
                      alt="Hình đại diện bé gái"
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full object-cover border border-[#FBCFE8] shrink-0"
                    />
                    <span className="text-xs font-bold">Nữ (Bé gái)</span>
                  </button>
                </div>
              </div>
            )}

            {user.role === 'student' && (
              <div>
                <label className="block text-xs font-semibold text-[#71809A] mb-1.5">
                  Khối lớp
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {GRADES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => {
                        setGrade(g);
                        setClassName(`${g}A1`);
                      }}
                      className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                        grade === g
                          ? 'bg-[#2864E8] text-white border-[#2864E8]'
                          : 'bg-white text-[#17233C] border-[#D8E2F0] hover:bg-[#F4F7FC]'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={user.role !== 'student' ? 'sm:col-span-2' : ''}>
              <label htmlFor="profile-class" className="block text-xs font-semibold text-[#71809A] mb-1.5">
                {user.role === 'student' ? 'Tên lớp học' : 'Đơn vị / Tổ chuyên môn'}
              </label>
              <input
                id="profile-class"
                type="text"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8E2F0] text-sm text-[#17233C] focus:outline-none focus:border-[#2864E8]"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="profile-school" className="block text-xs font-semibold text-[#71809A] mb-1.5">
                Trường THCS
              </label>
              <input
                id="profile-school"
                type="text"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8E2F0] text-sm text-[#17233C] focus:outline-none focus:border-[#2864E8]"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-[#EDF2F9] flex flex-wrap items-center justify-between gap-3">
            {user.role === 'student' ? (
              <button
                type="button"
                onClick={() => {
                  onResetProgress();
                  setResetDone(true);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#71809A] hover:text-[#D95B67] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {resetDone ? 'Đã xóa tiến độ luyện tập cá nhân' : 'Đặt lại tiến độ trên máy này'}
              </button>
            ) : (
              <span className="text-xs text-[#71809A]">
                Đổi mật khẩu tại mục Báo cáo lớp học
              </span>
            )}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-medium text-[#71809A] hover:bg-[#F4F7FC] transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white bg-[#2864E8] hover:bg-[#1E53C9] transition-colors"
              >
                <Save className="w-4 h-4" />
                Lưu thay đổi
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
