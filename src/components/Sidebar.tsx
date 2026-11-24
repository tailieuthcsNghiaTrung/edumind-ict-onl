import React from 'react';
import {
  BarChart3,
  BookOpen,
  Bot,
  ClipboardCheck,
  Gamepad2,
  LayoutDashboard,
  TrendingUp,
  X,
} from 'lucide-react';
import { BRAND_ROBOT_LOGO } from '../hooks/useEduMindStore';
import { NavSection, UserProfile } from '../types';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  user: UserProfile;
  onOpenProfile: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const STUDENT_NAV: { id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'curriculum', label: 'Chương trình học', icon: BookOpen },
  { id: 'practice', label: 'Luyện tập', icon: ClipboardCheck },
  { id: 'games', label: 'Trò chơi kiến thức', icon: Gamepad2 },
  { id: 'progress', label: 'Tiến bộ của tôi', icon: TrendingUp },
  { id: 'assistant', label: 'Trợ lý học tập', icon: Bot },
];

const TEACHER_NAV: { id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'teacher-report', label: 'Báo cáo lớp học', icon: BarChart3 },
];

export default function Sidebar({
  activeSection,
  onSelectSection,
  user,
  onOpenProfile,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const handleSelect = (id: NavSection) => {
    onSelectSection(id);
    onCloseMobile();
  };

  const renderNavButton = (
    item: { id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }
  ) => {
    const Icon = item.icon;
    const isActive = activeSection === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => handleSelect(item.id)}
        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] ${
          isActive
            ? 'bg-[#EAF3FF] text-[#1D5BF0] border border-[#CFE2FE]'
            : 'text-[#334155] hover:bg-[#F3F8FF] hover:text-[#163A70] border border-transparent'
        }`}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon
          className={`w-[18px] h-[18px] shrink-0 ${
            isActive ? 'text-[#2563EB]' : 'text-[#7A8DA8]'
          }`}
        />
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-[#E2ECF9] w-[268px]">
      {/* Brand header */}
      <div className="flex items-center justify-between px-5 h-16 border-b border-[#E2ECF9] shrink-0">
        <button
          type="button"
          onClick={() => handleSelect('overview')}
          className="flex items-center gap-2.5 text-left focus-visible:outline-2 focus-visible:outline-[#2563EB] rounded-lg"
        >
          <div className="w-10 h-10 rounded-xl overflow-hidden border border-[#CBE0FF] bg-[#EAF4FF] shrink-0 shadow-xs">
            <img
              src={BRAND_ROBOT_LOGO}
              alt="EduMind ICT Robot AI"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-extrabold tracking-tight text-[#163A70] whitespace-nowrap">
              EduMind ICT
            </div>
            <div className="text-[11px] font-semibold text-[#0284C7] whitespace-nowrap">
              Tin học THCS trực tuyến
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-2 rounded-lg text-[#647899] hover:bg-[#F3F8FF] hover:text-[#163A70]"
          aria-label="Đóng thanh điều hướng"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation groups */}
      <nav className="flex-1 overflow-y-auto px-3.5 py-5 space-y-6" aria-label="Điều hướng chính">
        <div>
          <div className="px-3 mb-2 text-xs font-bold text-[#7A8DA8]">
            Dành cho học sinh
          </div>
          <div className="space-y-1">{STUDENT_NAV.map(renderNavButton)}</div>
        </div>

        <div className="pt-4 border-t border-[#EDF4FC]">
          <div className="px-3 mb-2 text-xs font-bold text-[#7A8DA8]">
            Dành cho giáo viên
          </div>
          <div className="space-y-1">{TEACHER_NAV.map(renderNavButton)}</div>
        </div>
      </nav>

      {/* Bottom platform intro & account profile */}
      <div className="p-3.5 border-t border-[#E2ECF9] space-y-3 shrink-0 bg-[#F8FBFF]">
        <div className="px-3 py-2.5 rounded-xl bg-gradient-to-br from-[#EAF4FF] to-[#ECFDF5] border border-[#D4E7FC] text-xs leading-relaxed text-[#4B6384]">
          <div className="font-extrabold text-[#163A70] mb-0.5">EduMind ICT Online</div>
          Học bài, luyện đề và tranh tài cùng trò chơi 3D & Nông Trại Tin học lớp 6 – 9.
        </div>

        <button
          type="button"
          onClick={() => {
            onOpenProfile();
            onCloseMobile();
          }}
          className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white border border-[#E4EBF5] hover:border-[#2864E8]/40 transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-full overflow-hidden bg-[#EAF2FF] shrink-0 border border-[#DCE6F7]">
            <img
              src={user.avatarUrl}
              alt={user.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-[#17233C] truncate">
              {user.name}
            </div>
            <div className="text-xs text-[#71809A] truncate">
              {user.role === 'admin'
                ? 'Quản trị hệ thống'
                : user.role === 'teacher'
                  ? 'Giáo viên Tin học'
                  : `Học sinh · Lớp ${user.className}`}
            </div>
          </div>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 z-30 w-[268px]">
        {sidebarContent}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#102A56]/40 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
