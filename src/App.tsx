import React, { useEffect, useState } from 'react';
import AiQuestionGeneratorModal from './components/AiQuestionGeneratorModal';
import AssistantView from './components/AssistantView';
import AuthScreen from './components/AuthScreen';
import CurriculumView from './components/CurriculumView';
import GamePlayView from './components/GamePlayView';
import GamesHubView from './components/GamesHubView';
import OverviewView from './components/OverviewView';
import PracticeView from './components/PracticeView';
import ProfileModal from './components/ProfileModal';
import ProgressView from './components/ProgressView';
import Sidebar from './components/Sidebar';
import TeacherReportView from './components/TeacherReportView';
import Topbar from './components/Topbar';
import CloudStairs3D from './components/games/CloudStairs3D';
import HealthFestival3D from './components/games/HealthFestival3D';
import IctCrosswordGame from './components/games/IctCrosswordGame';
import KnowledgeFarmGame from './components/games/KnowledgeFarmGame';
import KnowledgeRace3D from './components/games/KnowledgeRace3D';
import MysteryGiftBoxGame from './components/games/MysteryGiftBoxGame';
import PuzzlePiecesGame from './components/games/PuzzlePiecesGame';
import TreasureHuntMapGame from './components/games/TreasureHuntMapGame';
import { getGameTitleById } from '../data/games';
import { useEduMindStore } from './hooks/useEduMindStore';
import { GameId, Grade, NavSection } from './types';

const VALID_GAME_IDS: GameId[] = [
  'knowledge-race-3d',
  'cloud-stairs-3d',
  'health-festival-3d',
  'knowledge-farm',
  'mystery-gift-box',
  'ict-crossword',
  'puzzle-pieces',
  'treasure-hunt-map',
  'speed-race',
  'streak-challenge',
  'knowledge-treasure',
  'school-survival',
  'sage-arena',
];

export default function App() {
  const {
    user,
    authToken,
    progress,
    customQuestions,
    studentSyncVersion,
    invalidateStudentCache,
    updateUser,
    loginUser,
    updateAuthToken,
    logoutUser,
    toggleLessonComplete,
    markLessonComplete,
    recordSession,
    resetProgress,
    addCustomQuestion,
    addCustomQuestionsBatch,
    deleteCustomQuestion,
  } = useEduMindStore();

  const [activeSection, setActiveSection] = useState<NavSection>(() =>
    user && (user.role === 'teacher' || user.role === 'admin')
      ? 'teacher-report'
      : 'games'
  );
  const [selectedGrade, setSelectedGrade] = useState<Grade>(() => user?.grade ?? 8);
  const [activeGame, setActiveGame] = useState<{ gameId: GameId; grade: Grade } | null>(null);
  const [pendingPracticeTopic, setPendingPracticeTopic] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [aiGenGrade, setAiGenGrade] = useState<Grade | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [autoLogoutNotice, setAutoLogoutNotice] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<'connected' | 'checking' | 'offline'>('checking');

  // Deep-link support when a student opens a Classroom game invite link on their device
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinGame = params.get('game') as GameId | null;
    const joinGradeNum = Number(params.get('grade'));
    if (joinGame && VALID_GAME_IDS.includes(joinGame)) {
      const validGrade: Grade =
        joinGradeNum === 6 || joinGradeNum === 7 || joinGradeNum === 8 || joinGradeNum === 9
          ? joinGradeNum
          : 8;
      setSelectedGrade(validGrade);
      setActiveSection('games');
      setActiveGame({ gameId: joinGame, grade: validGrade });
    }
  }, []);

  // Keep selectedGrade synced when user changes grade in profile
  useEffect(() => {
    if (user?.grade) {
      setSelectedGrade(user.grade);
    }
  }, [user?.grade]);

  // Real server health check (optimized 60s interval, paused while tab is hidden)
  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/health');
        if (!active) return;
        setServerStatus(res.ok ? 'connected' : 'offline');
      } catch {
        if (!active) return;
        setServerStatus('offline');
      }
    };
    void checkHealth();
    const interval = window.setInterval(() => {
      void checkHealth();
    }, 60000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const handleLogout = (notice?: string) => {
    setActiveGame(null);
    setPendingPracticeTopic(null);
    setProfileOpen(false);
    setAiGenGrade(null);
    setMobileMenuOpen(false);
    setActiveSection('games');
    setAutoLogoutNotice(typeof notice === 'string' ? notice : null);
    logoutUser();
  };

  // Auto-clear student login if a student finishes studying and forgets to log out
  // (after 10 minutes of inactivity or 5 minutes after leaving/minimizing the tab).
  useEffect(() => {
    if (!user || user.role !== 'student') return;

    const IDLE_LIMIT_MS = 10 * 60 * 1000;
    const HIDDEN_LIMIT_MS = 5 * 60 * 1000;
    let idleTimer: number | null = null;
    let hiddenAt: number | null = null;

    const triggerAutoLogout = () => {
      handleLogout(
        'Hệ thống đã tự động xóa tên đăng nhập của học sinh trước do hết thời gian hoạt động. Mời nhập họ tên để bắt đầu học.'
      );
    };

    const resetIdleTimer = () => {
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer);
      }
      idleTimer = window.setTimeout(triggerAutoLogout, IDLE_LIMIT_MS);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else {
        if (hiddenAt !== null && Date.now() - hiddenAt >= HIDDEN_LIMIT_MS) {
          triggerAutoLogout();
          return;
        }
        hiddenAt = null;
        resetIdleTimer();
      }
    };

    const activityEvents: (keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'click',
    ];
    activityEvents.forEach((evt) =>
      window.addEventListener(evt, resetIdleTimer, { passive: true })
    );
    document.addEventListener('visibilitychange', handleVisibilityChange);
    resetIdleTimer();

    return () => {
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      activityEvents.forEach((evt) =>
        window.removeEventListener(evt, resetIdleTimer)
      );
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.name, user?.className, user?.grade]);

  if (!user) {
    return (
      <AuthScreen
        noticeMessage={autoLogoutNotice}
        onLogin={(profile, token) => {
          setAutoLogoutNotice(null);
          setActiveGame(null);
          setPendingPracticeTopic(null);
          loginUser(profile, token);
          if (profile.role === 'teacher' || profile.role === 'admin') {
            setActiveSection('teacher-report');
          } else {
            setSelectedGrade(profile.grade);
            setActiveSection('games');
          }
        }}
      />
    );
  }

  const workspaceSessionKey = `${user.role}::${user.grade}::${user.className}::${user.name.trim().toLowerCase()}`;

  const handleSelectSection = (section: NavSection) => {
    setActiveGame(null);
    setActiveSection(section);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartGame = (gameId: GameId, grade: Grade) => {
    setSelectedGrade(grade);
    setActiveSection('games');
    setActiveGame({ gameId, grade });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePracticeTopicFromCurriculum = (grade: Grade, topic: string) => {
    setSelectedGrade(grade);
    setPendingPracticeTopic(topic);
    setActiveGame(null);
    setActiveSection('practice');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const activeGameTitle = activeGame ? getGameTitleById(activeGame.gameId) : null;

  const renderActiveGame = () => {
    if (!activeGame) return null;

    if (activeGame.gameId === 'knowledge-race-3d') {
      return (
        <KnowledgeRace3D
          grade={activeGame.grade}
          defaultClassName={user.className}
          defaultPlayerName={user.name}
          customQuestions={customQuestions}
          onExit={() => setActiveGame(null)}
          onCompleteSession={recordSession}
        />
      );
    }

    if (activeGame.gameId === 'cloud-stairs-3d') {
      return (
        <CloudStairs3D
          grade={activeGame.grade}
          defaultClassName={user.className}
          defaultPlayerName={user.name}
          customQuestions={customQuestions}
          onExit={() => setActiveGame(null)}
          onCompleteSession={recordSession}
        />
      );
    }

    if (activeGame.gameId === 'health-festival-3d') {
      return (
        <HealthFestival3D
          grade={activeGame.grade}
          defaultClassName={user.className}
          defaultPlayerName={user.name}
          customQuestions={customQuestions}
          onExit={() => setActiveGame(null)}
          onCompleteSession={recordSession}
        />
      );
    }

    if (activeGame.gameId === 'knowledge-farm') {
      return (
        <KnowledgeFarmGame
          grade={activeGame.grade}
          playerName={user.name}
          customQuestions={customQuestions}
          onExit={() => setActiveGame(null)}
          onCompleteSession={recordSession}
        />
      );
    }

    if (activeGame.gameId === 'mystery-gift-box') {
      return (
        <MysteryGiftBoxGame
          grade={activeGame.grade}
          playerName={user.name}
          customQuestions={customQuestions}
          onExit={() => setActiveGame(null)}
          onCompleteSession={recordSession}
        />
      );
    }

    if (activeGame.gameId === 'ict-crossword') {
      return (
        <IctCrosswordGame
          grade={activeGame.grade}
          playerName={user.name}
          onExit={() => setActiveGame(null)}
          onCompleteSession={recordSession}
        />
      );
    }

    if (activeGame.gameId === 'puzzle-pieces') {
      return (
        <PuzzlePiecesGame
          grade={activeGame.grade}
          playerName={user.name}
          customQuestions={customQuestions}
          onExit={() => setActiveGame(null)}
          onCompleteSession={recordSession}
        />
      );
    }

    if (activeGame.gameId === 'treasure-hunt-map') {
      return (
        <TreasureHuntMapGame
          grade={activeGame.grade}
          playerName={user.name}
          customQuestions={customQuestions}
          onExit={() => setActiveGame(null)}
          onCompleteSession={recordSession}
        />
      );
    }

    return (
      <GamePlayView
        gameId={activeGame.gameId}
        grade={activeGame.grade}
        customQuestions={customQuestions}
        onExit={() => setActiveGame(null)}
        onCompleteSession={recordSession}
      />
    );
  };

  return (
    <div
      key={workspaceSessionKey}
      className="min-h-screen bg-gradient-to-br from-[#F4FAFF] via-[#F9FCFF] to-[#F3FBF7] text-[#1A2B49]"
    >
      <Sidebar
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        user={user}
        onOpenProfile={() => setProfileOpen(true)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Layout shifted right on desktop for fixed 268px Sidebar */}
      <div className="lg:pl-[268px] min-h-screen flex flex-col">
        <Topbar
          activeSection={activeSection}
          activeGameTitle={activeGameTitle}
          serverStatus={serverStatus}
          user={user}
          onOpenProfile={() => setProfileOpen(true)}
          onLogout={() => handleLogout()}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 w-full max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          {activeSection === 'overview' && (
            <OverviewView
              user={user}
              progress={progress}
              onNavigate={handleSelectSection}
              onQuickStartGame={handleStartGame}
            />
          )}

          {activeSection === 'curriculum' && (
            <CurriculumView
              selectedGrade={selectedGrade}
              onSelectGrade={setSelectedGrade}
              completedLessonIds={progress.completedLessonIds}
              customQuestions={customQuestions}
              onToggleLesson={toggleLessonComplete}
              onMarkLessonComplete={markLessonComplete}
              onPracticeTopic={handlePracticeTopicFromCurriculum}
              onCompleteSession={recordSession}
            />
          )}

          {activeSection === 'practice' && (
            <PracticeView
              selectedGrade={selectedGrade}
              onSelectGrade={setSelectedGrade}
              completedLessonIds={progress.completedLessonIds}
              customQuestions={customQuestions}
              initialTopic={pendingPracticeTopic}
              onClearInitialTopic={() => setPendingPracticeTopic(null)}
              onOpenAiGenerator={(grade) => setAiGenGrade(grade)}
              onCompleteSession={recordSession}
            />
          )}

          {activeSection === 'games' &&
            (activeGame ? (
              renderActiveGame()
            ) : (
              <GamesHubView
                selectedGrade={selectedGrade}
                onSelectGrade={setSelectedGrade}
                progress={progress}
                customQuestions={customQuestions}
                onStartGame={handleStartGame}
                onOpenAiGenerator={(grade) => setAiGenGrade(grade)}
              />
            ))}

          {activeSection === 'progress' && (
            <ProgressView
              progress={progress}
              defaultGrade={selectedGrade}
              onStartGame={handleStartGame}
            />
          )}

          {activeSection === 'assistant' && (
            <AssistantView
              user={user}
              selectedGrade={selectedGrade}
              onSelectGrade={setSelectedGrade}
            />
          )}

          {activeSection === 'teacher-report' && (
            <TeacherReportView
              user={user}
              authToken={authToken}
              customQuestions={customQuestions}
              studentSyncVersion={studentSyncVersion}
              onInvalidateStudentCache={invalidateStudentCache}
              onAddQuestion={addCustomQuestion}
              onDeleteQuestion={deleteCustomQuestion}
              onOpenAiGenerator={(grade) => setAiGenGrade(grade)}
              onAuthTokenUpdate={updateAuthToken}
              onRequireStaffLogin={() => handleLogout()}
            />
          )}
        </main>
      </div>

      {profileOpen && (
        <ProfileModal
          user={user}
          onUpdate={updateUser}
          onResetProgress={resetProgress}
          onClose={() => setProfileOpen(false)}
        />
      )}

      {aiGenGrade !== null && (
        <AiQuestionGeneratorModal
          defaultGrade={aiGenGrade}
          userRole={user.role}
          customQuestions={customQuestions}
          onSaveQuestions={(newQuestions) => {
            addCustomQuestionsBatch(newQuestions);
          }}
          onClose={() => setAiGenGrade(null)}
        />
      )}
    </div>
  );
}
