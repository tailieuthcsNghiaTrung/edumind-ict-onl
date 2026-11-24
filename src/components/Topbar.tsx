import React from 'react';
import { LogOut, Menu, Wifi, WifiOff } from 'lucide-react';
import { BRAND_ROBOT_LOGO } from '../hooks/useEduMindStore';
import { NavSection, UserProfile } from '../types';

interface TopbarProps {
  activeSection: NavSection;
  activeGameTitle?: string | null;
  serverStatus: 'connected' | 'checking' | 'offline';
  user: UserProfile;
  onOpenProfile: () => void;
  onLogout: () => void;
  onOpenMobileMenu: () => void;
}

const SECTION_TITLES: Record<NavSection, string> = {
  overview: 'Tổng quan',
  curriculum: 'Chương trình học',
  practice: 'Luyện tập',
  games: 'Trò chơi kiến thức',
  progress: 'Tiến bộ của tôi',
  assistant: 'Trợ lý học tập',
  'teacher-report': 'Báo cáo lớp học',
};

export default function Topbar({
  activeSection,
  activeGameTitle,
  serverStatus,
  user,
  onOpenProfile,
  onLogout,
  onOpenMobileMenu,
}: TopbarProps) {
  const currentTitle = SECTION_TITLES[activeSection];

  return (
    <header className="sticky top-0 z-20 h-16 bg-white/95 backdrop-blur-sm border-b border-[#E2ECF9] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
      {/* Left: Mobile menu trigger + EduMind ICT / Current Page breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-1 rounded-lg text-[#163A70] hover:bg-[#EFF6FF]"
          aria-label="Mở menu điều hướng"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-sm min-w-0">
          <img
            src={BRAND_ROBOT_LOGO}
            alt="EduMind ICT Robot AI"
            referrerPolicy="no-referrer"
            className="w-7 h-7 rounded-lg object-cover border border-[#CBE0FF] bg-[#EAF4FF] shrink-0"
          />
          <span className="font-extrabold text-[#163A70] whitespace-nowrap shrink-0">
            EduMind ICT
          </span>
          <span className="text-[#CBD5E1] shrink-0" aria-hidden="true">
            /
          </span>
          <span className="font-bold text-[#334155] truncate">
            {currentTitle}
          </span>
          {activeGameTitle && (
            <>
              <span className="hidden sm:inline text-[#CBD5E1] shrink-0" aria-hidden="true">
                /
              </span>
              <span className="hidden sm:inline text-[#2563EB] font-bold truncate">
                {activeGameTitle}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right: Real server status + Profile + Logout */}
      <div className="flex items-center gap-3 sm:gap-5 shrink-0">
        <div
          className="hidden md:flex items-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0"
          title="Trạng thái kết nối với máy chủ EduMind ICT"
        >
          {serverStatus === 'offline' ? (
            <>
              <WifiOff className="w-3.5 h-3.5 text-[#D95B67]" />
              <span className="text-[#D95B67]">Mất kết nối máy chủ</span>
            </>
          ) : serverStatus === 'checking' ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-[#E7A23B]" />
              <span className="text-[#71809A]">Đang kiểm tra máy chủ</span>
            </>
          ) : (
            <>
              <Wifi className="w-3.5 h-3.5 text-[#159B72]" />
              <span className="text-[#159B72]">Máy chủ đã kết nối</span>
            </>
          )}
        </div>

        <div className="hidden md:block h-5 w-px bg-[#E4EBF5]" aria-hidden="true" />

        <button
          type="button"
          onClick={onOpenProfile}
          className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-sm font-medium text-[#17233C] hover:bg-[#F4F7FC] transition-colors whitespace-nowrap shrink-0"
        >
          <img
            src={user.avatarUrl}
            alt={user.name}
            referrerPolicy="no-referrer"
            className="w-7 h-7 rounded-full object-cover border border-[#CBE0FF] bg-[#EAF2FF] shrink-0"
          />
          <span className="hidden sm:inline">Hồ sơ</span>
          <span className="sr-only">{user.name}</span>
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-[#17233C] border border-[#DCE5F2] hover:bg-[#FFF5F5] hover:text-[#D95B67] hover:border-[#F2C6CB] transition-colors whitespace-nowrap shrink-0"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Đăng xuất</span>
        </button>
      </div>
    </header>
  );
}
