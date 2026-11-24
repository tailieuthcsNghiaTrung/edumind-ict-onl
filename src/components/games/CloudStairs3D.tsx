import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  ChevronUp,
  Cloud,
  Gift,
  RotateCcw,
  Shield,
  Trophy,
  Zap,
} from 'lucide-react';
import { FEATURED_GAMES_LIST } from '../../../data/games';
import {
  getTrueFalse4ByGrade,
  pickRandomQuestions,
} from '../../../data/questionBank';
import { Grade, Question, SessionRecord, TrueFalse4Question } from '../../types';
import {
  playBoostSound,
  playCorrectSound,
  playVictorySound,
  playWrongSound,
} from '../../utils/soundFx';
import {
  buildCloudCluster,
  buildCompositeRunner,
  buildFloatingCrown,
  createStudio3D,
} from '../../utils/threeHelpers';
import ClassroomLobby, { CarPreset, LobbyPlayer } from '../ClassroomLobby';
import CompactQuestionModal from '../CompactQuestionModal';

interface CloudStairs3DProps {
  grade: Grade;
  defaultClassName: string;
  defaultPlayerName: string;
  customQuestions: Question[];
  onExit: () => void;
  onCompleteSession: (
    session: Omit<SessionRecord, 'id' | 'completedAt'>,
    topicBreakdown: { grade: Grade; topic: string; isCorrect: boolean }[]
  ) => void;
}

type CloudGateItem =
  | {
      uid: string;
      kind: 'mcq';
      question: Question;
      attempts: number;
      firstAttemptScored: boolean;
    }
  | {
      uid: string;
      kind: 'tf4';
      question: TrueFalse4Question;
      attempts: number;
      firstAttemptScored: boolean;
    };

interface TeamState {
  name: string;
  color: string;
  hex: number;
  score: number;
  floor: number;
  hasShield: boolean;
}

const MATCH_SECONDS = 180;

export default function CloudStairs3D({
  grade,
  defaultClassName,
  defaultPlayerName,
  customQuestions,
  onExit,
  onCompleteSession,
}: CloudStairs3DProps) {
  const gameMeta = FEATURED_GAMES_LIST[1];
  const [phase, setPhase] = useState<'lobby' | 'playing' | 'finished'>('lobby');
  const [activeGrade, setActiveGrade] = useState<Grade>(grade);
  const [deckSize, setDeckSize] = useState<number>(6);
  const [matchClass, setMatchClass] = useState(String(grade));
  const [playerName, setPlayerName] = useState(defaultPlayerName);
  const [playerTeamIdx, setPlayerTeamIdx] = useState(0);

  const [queue, setQueue] = useState<CloudGateItem[]>([]);
  const [floorReached, setFloorReached] = useState(0);
  const [totalTargetFloors, setTotalTargetFloors] = useState(6);
  const [firstTryScore, setFirstTryScore] = useState(0);
  const [firstTryCorrect, setFirstTryCorrect] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [timeLeft, setTimeLeft] = useState(MATCH_SECONDS);
  const [activeGate, setActiveGate] = useState<CloudGateItem | null>(null);
  const [bannerMsg, setBannerMsg] = useState(
    'Chạm Cổng Mây để leo tầng! Sai lần 1 câu sẽ quay lại sau 2 tầng (điểm tính theo lượt 1).'
  );
  const [teams, setTeams] = useState<TeamState[]>([
    { name: 'Đội Mây Xanh', color: '#0284C7', hex: 0x0284c7, score: 0, floor: 0, hasShield: false },
    { name: 'Đội Nắng Vàng', color: '#D97706', hex: 0xf59e0b, score: 0, floor: 0, hasShield: false },
    { name: 'Đội Cầu Vồng', color: '#7C3AED', hex: 0x8b5cf6, score: 0, floor: 0, hasShield: false },
  ]);
  const [topicLog, setTopicLog] = useState<
    { grade: Grade; topic: string; isCorrect: boolean }[]
  >([]);

  const [dockCollapsed, setDockCollapsed] = useState(false);
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const recordedRef = useRef(false);
  const targetOrbitOffsetRef = useRef(0);
  const teamsRef = useRef(teams);
  teamsRef.current = teams;

  const buildDeck = useCallback((targetGrade: Grade): CloudGateItem[] => {
    const tfPool = getTrueFalse4ByGrade(targetGrade);
    const tfCount = Math.min(2, tfPool.length);
    const mcqCount = Math.max(4, deckSize - tfCount);
    const mcqs = pickRandomQuestions(targetGrade, mcqCount, { customQuestions });

    const items: CloudGateItem[] = [];
    for (let i = 0; i < mcqs.length; i++) {
      items.push({
        uid: `mcq-${mcqs[i].id}-${i}`,
        kind: 'mcq',
        question: mcqs[i],
        attempts: 0,
        firstAttemptScored: false,
      });
      if (i === 1 && tfPool[0]) {
        items.push({
          uid: `tf-${tfPool[0].id}`,
          kind: 'tf4',
          question: tfPool[0],
          attempts: 0,
          firstAttemptScored: false,
        });
      }
      if (i === 3 && tfPool[1]) {
        items.push({
          uid: `tf-${tfPool[1].id}`,
          kind: 'tf4',
          question: tfPool[1],
          attempts: 0,
          firstAttemptScored: false,
        });
      }
    }
    return items.slice(0, Math.max(5, deckSize));
  }, [customQuestions, deckSize]);

  const finishTower = useCallback(
    (finalScore: number, finalFirstCorrect: number, totalDeck: number, log: { grade: Grade; topic: string; isCorrect: boolean }[]) => {
      setPhase('finished');
      playVictorySound();
      if (!recordedRef.current) {
        recordedRef.current = true;
        onCompleteSession(
          {
            type: 'game',
            title: 'Bậc Thang Lên Mây 3D',
            gameId: 'cloud-stairs-3d',
            grade: activeGrade,
            score: finalScore,
            maxScore: totalDeck * 20,
            correctCount: finalFirstCorrect,
            totalQuestions: totalDeck,
            durationSeconds: Math.max(10, MATCH_SECONDS - timeLeft),
          },
          log
        );
      }
    },
    [activeGrade, onCompleteSession, timeLeft]
  );

  const handleStartMatch = (config: {
    selectedGrade: Grade;
    className: string;
    playerName: string;
    carPreset: CarPreset;
    players: LobbyPlayer[];
  }) => {
    setActiveGrade(config.selectedGrade);
    const deck = buildDeck(config.selectedGrade);
    const initialTeams = [
      { name: 'Đội Mây Xanh', color: '#0284C7', hex: 0x0284c7, score: 0, floor: 0, hasShield: false },
      { name: 'Đội Nắng Vàng', color: '#D97706', hex: 0xf59e0b, score: 0, floor: 0, hasShield: false },
      { name: 'Đội Cầu Vồng', color: '#7C3AED', hex: 0x8b5cf6, score: 0, floor: 0, hasShield: false },
    ];
    const chosenTeamName = config.players[0]?.team;
    const matchedIdx = initialTeams.findIndex((t) => t.name === chosenTeamName);
    const chosenIdx = matchedIdx >= 0 ? matchedIdx : 0;

    setMatchClass(String(config.selectedGrade));
    setPlayerName(config.playerName);
    setPlayerTeamIdx(chosenIdx);
    setQueue(deck);
    setTotalTargetFloors(deck.length);
    setFloorReached(0);
    setFirstTryScore(0);
    setFirstTryCorrect(0);
    setTotalAttempts(0);
    setTimeLeft(MATCH_SECONDS);
    setActiveGate(null);
    setTopicLog([]);
    recordedRef.current = false;
    setTeams(initialTeams);
    setBannerMsg(
      `Bạn thuộc ${initialTeams[chosenIdx].name}! Nhấn “Mở Cổng Mây tầng 1” để bắt đầu leo tháp (${deck.length} tầng).`
    );
    setPhase('playing');
  };

  // Match countdown + lively simulated rival team climbers
  useEffect(() => {
    if (phase !== 'playing') return;
    const id = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          finishTower(firstTryScore, firstTryCorrect, totalTargetFloors, topicLog);
          return 0;
        }
        return prev - 1;
      });
      // Advance rival teams organically
      setTeams((prev) =>
        prev.map((t, idx) => {
          if (idx === playerTeamIdx) return t;
          if (Math.random() < 0.22 && t.floor < totalTargetFloors) {
            return {
              ...t,
              floor: Math.min(totalTargetFloors, t.floor + 1),
              score: t.score + 20,
            };
          }
          return t;
        })
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, [finishTower, firstTryCorrect, firstTryScore, phase, playerTeamIdx, topicLog, totalTargetFloors]);

  // Three.js 3D Cloud Tower Scene
  useEffect(() => {
    if (phase !== 'playing' || !canvasMountRef.current) return;
    const container = canvasMountRef.current;
    const studio = createStudio3D(container, 0x93d5ff, 30, 120);
    const { renderer, scene } = studio;

    const camera = new THREE.PerspectiveCamera(
      52,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      180
    );
    camera.position.set(0, 6.5, 16);

    // Spiraling Cloud Staircase Steps
    const stepCount = Math.max(8, totalTargetFloors + 2);
    const stepCoords: THREE.Vector3[] = [];
    const stepMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.35,
      metalness: 0.15,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.25,
      metalness: 0.6,
    });

    for (let i = 0; i <= stepCount; i++) {
      const angle = i * 0.65;
      const radius = 5.4;
      const x = Math.sin(angle) * radius;
      const y = i * 2.1;
      const z = Math.cos(angle) * radius - 3;
      stepCoords.push(new THREE.Vector3(x, y, z));

      const platform = new THREE.Group();
      const slab = new THREE.Mesh(
        new THREE.CylinderGeometry(1.75, 1.45, 0.45, 18),
        i === totalTargetFloors ? goldMat : stepMat
      );
      slab.receiveShadow = true;
      platform.add(slab);

      const trim = new THREE.Mesh(
        new THREE.TorusGeometry(1.78, 0.08, 8, 24),
        goldMat
      );
      trim.rotation.x = Math.PI / 2;
      trim.position.y = 0.2;
      platform.add(trim);

      // Decorative cloud puffs below platform
      const cloudBase = buildCloudCluster(0.75);
      cloudBase.position.set(0, -0.55, 0);
      platform.add(cloudBase);

      platform.position.set(x, y, z);
      scene.add(platform);
    }

    // Floating background clouds
    const bgClouds: THREE.Group[] = [];
    for (let i = 0; i < 16; i++) {
      const c = buildCloudCluster(1.2 + (i % 3) * 0.45);
      c.position.set(
        (i % 2 === 0 ? -1 : 1) * (12 + (i % 4) * 4),
        i * 1.9,
        -12 - (i % 5) * 6
      );
      scene.add(c);
      bgClouds.push(c);
    }

    // Golden floating summit crown above top floor
    const summitIdx = Math.min(stepCoords.length - 1, totalTargetFloors);
    const summitCoord = stepCoords[summitIdx];
    const crown = buildFloatingCrown();
    crown.position.set(summitCoord.x, summitCoord.y + 2.35, summitCoord.z);
    scene.add(crown);

    // 3 Team Climber Avatars
    const teamAvatars = [0x0284c7, 0xf59e0b, 0x8b5cf6].map((hex, idx) => {
      const avatar = buildCompositeRunner(hex, 0xffffff);
      const startPos = stepCoords[0];
      avatar.position.set(startPos.x + (idx - 1) * 0.75, startPos.y + 0.25, startPos.z);
      scene.add(avatar);
      return avatar;
    });

    if (!studio.isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Drag-to-orbit camera azimuth smoothly on pointer drag
    let isDragging = false;
    let lastPointerX = 0;
    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      lastPointerX = e.clientX;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastPointerX;
      lastPointerX = e.clientX;
      targetOrbitOffsetRef.current -= dx * 0.008;
    };
    const onPointerUp = () => {
      isDragging = false;
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const clock = new THREE.Clock();
    let currentOrbit = 0;
    const handleResize = () => {
      const w = Math.max(320, container.clientWidth);
      const h = Math.max(240, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();
      const liveTeams = teamsRef.current;

      // Rotate and bob summit golden crown
      crown.rotation.y = elapsed * 1.4;
      crown.position.y = summitCoord.y + 2.35 + Math.sin(elapsed * 2.5) * 0.22;

      // Gently drift background clouds
      for (let i = 0; i < bgClouds.length; i++) {
        bgClouds[i].position.x += Math.sin(elapsed * 0.4 + i) * dt * 0.35;
      }

      // Smoothly move each team avatar onto their current floor + animate articulated limbs
      for (let i = 0; i < teamAvatars.length; i++) {
        const floorIdx = Math.min(stepCoords.length - 1, liveTeams[i]?.floor ?? 0);
        const target = stepCoords[floorIdx];
        const offset = (i - 1) * 0.65;
        const avatar = teamAvatars[i];
        const dx = target.x + offset - avatar.position.x;
        const dy = target.y + 0.25 - avatar.position.y;
        const dz = target.z - avatar.position.z;
        const isMoving = Math.hypot(dx, dy, dz) > 0.25;

        avatar.position.x = THREE.MathUtils.damp(avatar.position.x, target.x + offset, 4.5, dt);
        avatar.position.y = THREE.MathUtils.damp(
          avatar.position.y,
          target.y + 0.25 + Math.abs(Math.sin(elapsed * (isMoving ? 9 : 3) + i)) * (isMoving ? 0.22 : 0.08),
          4.5,
          dt
        );
        avatar.position.z = THREE.MathUtils.damp(avatar.position.z, target.z, 4.5, dt);

        const limbs = avatar.userData as {
          leftLeg?: THREE.Group;
          rightLeg?: THREE.Group;
          leftArm?: THREE.Group;
          rightArm?: THREE.Group;
        };
        if (limbs.leftLeg && limbs.rightLeg && limbs.leftArm && limbs.rightArm) {
          const swingSpeed = isMoving ? 12 : 3.2;
          const amp = isMoving ? 0.65 : 0.12;
          limbs.leftLeg.rotation.x = Math.sin(elapsed * swingSpeed + i) * amp;
          limbs.rightLeg.rotation.x = -Math.sin(elapsed * swingSpeed + i) * amp;
          limbs.leftArm.rotation.x = -Math.sin(elapsed * swingSpeed + i) * (amp * 0.9);
          limbs.rightArm.rotation.x = Math.sin(elapsed * swingSpeed + i) * (amp * 0.9);
        }
      }

      // Smooth damped camera orbit following player's team height
      const myPos = teamAvatars[0].position;
      currentOrbit = THREE.MathUtils.damp(currentOrbit, targetOrbitOffsetRef.current, 4.5, dt);
      const camRadius = 15.5;
      const desiredCamX = myPos.x * 0.45 + Math.sin(currentOrbit) * camRadius;
      const desiredCamZ = myPos.z + Math.cos(currentOrbit) * camRadius;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredCamX, 3.8, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, myPos.y + 5.2, 3.2, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredCamZ, 3.8, dt);
      camera.lookAt(myPos.x * 0.45, myPos.y + 1.4, myPos.z);

      renderer.render(scene, camera);
      studio.scheduleNext(tick);
    };

    studio.scheduleNext(tick);
    return () => {
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', handleResize);
      studio.dispose();
    };
  }, [phase, totalTargetFloors]);

  const handleOpenNextGate = () => {
    if (queue.length === 0 || activeGate) return;
    setActiveGate(queue[0]);
  };

  const handleGateAnswer = (isCorrect: boolean) => {
    if (!activeGate) return;
    const current = activeGate;
    setActiveGate(null);
    setTotalAttempts((p) => p + 1);

    const rest = queue.slice(1);
    const nextAttempt = current.attempts + 1;

    setTopicLog((prev) => [
      ...prev,
      {
        grade: current.question.grade,
        topic: current.question.topic,
        isCorrect,
      },
    ]);

    if (isCorrect) {
      playCorrectSound();
      const scoredNow = current.attempts === 0; // Score strictly on attempt 1!
      const ptsEarned = scoredNow ? 20 : 0;
      const nextScore = firstTryScore + ptsEarned;
      const nextFirstCorrect = firstTryCorrect + (scoredNow ? 1 : 0);
      const nextFloor = Math.min(totalTargetFloors, floorReached + 1);

      setFirstTryScore(nextScore);
      setFirstTryCorrect(nextFirstCorrect);
      setFloorReached(nextFloor);
      setTeams((prev) =>
        prev.map((t, idx) =>
          idx === playerTeamIdx
            ? { ...t, floor: nextFloor, score: t.score + ptsEarned }
            : t
        )
      );
      setQueue(rest);

      setBannerMsg(
        scoredNow
          ? `☁️ Tuyệt vời! Vượt Cổng Mây tầng ${nextFloor} (+20 điểm lượt 1 cho đội)!`
          : `✅ Đã sửa đúng câu quay lại! Tiến lên tầng ${nextFloor} (điểm được tính ở lượt 1).`
      );

      if (rest.length === 0) {
        finishTower(nextScore, nextFirstCorrect, totalTargetFloors, [
          ...topicLog,
          { grade: current.question.grade, topic: current.question.topic, isCorrect: true },
        ]);
      }
    } else {
      playWrongSound();
      if (nextAttempt < 2) {
        // Max 2 attempts: wrong on attempt 1 -> return after 2 floors!
        const updatedItem: CloudGateItem = {
          ...current,
          attempts: nextAttempt,
        };
        const insertPos = Math.min(2, rest.length);
        const nextQueue = [
          ...rest.slice(0, insertPos),
          updatedItem,
          ...rest.slice(insertPos),
        ];
        setQueue(nextQueue);
        setBannerMsg(
          '🔄 Chưa đúng lượt 1 — Câu hỏi này sẽ quay lại sau 2 tầng để bạn chinh phục lại nhé!'
        );
      } else {
        // Exhausted 2 attempts -> advance past gate with 0 pts
        const nextFloor = Math.min(totalTargetFloors, floorReached + 1);
        setFloorReached(nextFloor);
        setQueue(rest);
        setBannerMsg(
          '☁️ Đã dùng hết 2 lượt cho câu này — Tiếp tục bước lên cổng mây tiếp theo!'
        );
        if (rest.length === 0) {
          finishTower(firstTryScore, firstTryCorrect, totalTargetFloors, topicLog);
        }
      }
    }
  };

  // Team Powers unlocked via Team Score
  const myTeam = teams[playerTeamIdx];
  const handleUseTeamPower = (power: 'gift' | 'lightning' | 'shield') => {
    const cost = power === 'gift' ? 20 : power === 'shield' ? 30 : 40;
    if (myTeam.score < cost) return;
    playBoostSound();

    if (power === 'gift') {
      const bonus = 15 + Math.floor(Math.random() * 20);
      setTeams((prev) =>
        prev.map((t, i) =>
          i === playerTeamIdx ? { ...t, score: t.score - cost + bonus } : t
        )
      );
      setBannerMsg(`🎁 Mở Hộp Quà Mây! Đội bạn nhận thưởng +${bonus} điểm đội!`);
    } else if (power === 'shield') {
      setTeams((prev) =>
        prev.map((t, i) =>
          i === playerTeamIdx ? { ...t, score: t.score - cost, hasShield: true } : t
        )
      );
      setBannerMsg('🛡️ Đã bật Khiên Mây bảo vệ đội khỏi sấm sét từ đội bạn!');
    } else {
      // Lightning hits leading rival without shield
      setTeams((prev) => {
        const rivals = prev
          .map((t, idx) => ({ t, idx }))
          .filter((x) => x.idx !== playerTeamIdx)
          .sort((a, b) => b.t.score - a.t.score);
        const target = rivals[0];
        return prev.map((t, i) => {
          if (i === playerTeamIdx) return { ...t, score: t.score - cost };
          if (target && i === target.idx) {
            if (t.hasShield) return { ...t, hasShield: false };
            return { ...t, floor: Math.max(0, t.floor - 1), score: Math.max(0, t.score - 10) };
          }
          return t;
        });
      });
      setBannerMsg('⚡ Phóng Sấm Sét lên đội dẫn đầu đối thủ!');
    }
  };

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => b.score - a.score || b.floor - a.floor),
    [teams]
  );

  // ==================== LOBBY ====================
  if (phase === 'lobby') {
    return (
      <ClassroomLobby
        gameId="cloud-stairs-3d"
        title={gameMeta.title}
        subtitle={gameMeta.subtitle}
        openButtonLabel="Mở tháp mây"
        heroImage={gameMeta.imageUrl}
        accentColor="#0284C7"
        grade={grade}
        defaultClassName={defaultClassName}
        defaultPlayerName={defaultPlayerName}
        showTeams
        extraConfig={
          <div>
            <label className="block text-xs font-bold text-[#163A70] mb-1.5">
              2. Số cổng mây (tối thiểu 5 câu · Trắc nghiệm + Đúng/Sai 4 ý)
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {[5, 6, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDeckSize(n)}
                  className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                    deckSize === n
                      ? 'bg-[#0284C7] text-white border-[#0284C7]'
                      : 'bg-white text-[#1A2B49] border-[#D8E5F7]'
                  }`}
                >
                  {n} cổng mây
                </button>
              ))}
            </div>
          </div>
        }
        onExit={onExit}
        onStartMatch={handleStartMatch}
      />
    );
  }

  // ==================== FINISHED PODIUM ====================
  if (phase === 'finished') {
    return (
      <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-[#DCE8F8] p-6 sm:p-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[#ECFAFF] border border-[#BAE6FD] mx-auto flex items-center justify-center">
          <Trophy className="w-8 h-8 text-[#0284C7]" />
        </div>
        <div>
          <div className="text-xs font-bold text-[#0284C7]">
            Bậc Thang Lên Mây 3D · Lớp {activeGrade} · Tin học {activeGrade}
          </div>
          <h2 className="text-2xl font-extrabold text-[#163A70] mt-1">
            Chúc mừng {playerName} đã chạm đỉnh Tháp Mây! ☁️
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-[#ECFAFF]">
            <div className="text-xs text-[#647899]">Điểm lượt 1</div>
            <div className="text-xl font-extrabold text-[#0284C7] tabular-nums">
              {firstTryScore} điểm
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[#ECFDF5]">
            <div className="text-xs text-[#647899]">Đúng ngay lượt 1</div>
            <div className="text-xl font-extrabold text-[#059669] tabular-nums">
              {firstTryCorrect}/{totalTargetFloors}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[#F5F3FF]">
            <div className="text-xs text-[#647899]">Tổng lượt trả lời</div>
            <div className="text-xl font-extrabold text-[#7C3AED] tabular-nums">
              {totalAttempts} lượt
            </div>
          </div>
        </div>

        {/* Team Standings */}
        <div className="text-left rounded-2xl border border-[#E4EDF9] divide-y divide-[#EEF4FC]">
          {sortedTeams.map((t, idx) => (
            <div
              key={t.name}
              className={`px-4 py-3 flex items-center justify-between text-sm ${
                t.name === myTeam.name ? 'bg-[#ECFAFF] font-bold text-[#163A70]' : 'text-[#475569]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="font-extrabold">#{idx + 1}</span>
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                <span>{t.name}</span>
              </div>
              <div className="tabular-nums text-xs sm:text-sm font-bold">
                Tầng {t.floor}/{totalTargetFloors} · {t.score} điểm đội
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => setPhase('lobby')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-sm font-bold"
          >
            <RotateCcw className="w-4 h-4" />
            Leo tháp trận mới
          </button>
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-[#DCE8F8] hover:bg-[#F5F9FF] text-[#163A70] text-sm font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            Về danh sách trò chơi
          </button>
        </div>
      </div>
    );
  }

  // ==================== ACTIVE 3D CLOUD TOWER ====================
  return (
    <div className="space-y-2.5">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-2xl border border-[#DCE8F8] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#647899] hover:text-[#163A70]"
          >
            <ArrowLeft className="w-4 h-4" />
            Thoát
          </button>
          <span className="text-sm font-extrabold text-[#163A70]">
            ☁️ Bậc Thang Lên Mây · Lớp {matchClass}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-bold tabular-nums">
          <span className="text-[#0284C7]">
            Tầng: {floorReached}/{totalTargetFloors}
          </span>
          <span className="text-[#059669]">Điểm lượt 1: {firstTryScore}</span>
          <span className="text-[#7C3AED]">Còn lại: {queue.length} cổng</span>
          <span className="text-[#163A70]">⏱ {timeLeft}s</span>
        </div>
      </div>

      {/* 3D Viewport */}
      <div className="relative w-full h-[64vh] min-h-[380px] max-h-[560px] rounded-3xl overflow-hidden border border-[#BAE6FD] bg-[#93D5FF]">
        <div ref={canvasMountRef} className="w-full h-full" />

        {/* Top Overlay: Banner + Team Standings */}
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-3 pointer-events-none">
          <div className="bg-white/95 border border-[#BAE6FD] rounded-xl px-3.5 py-2 shadow-sm max-w-md">
            <div className="text-xs font-bold text-[#163A70]">{bannerMsg}</div>
            <div className="text-[11px] text-[#647899] mt-0.5">
              {myTeam.hasShield ? '🛡️ Đội bạn đang được Khiên bảo vệ' : 'Tích điểm đội để mở Hộp quà, Sấm sét và Khiên'}
            </div>
          </div>

          <div className="hidden md:block bg-white/95 border border-[#BAE6FD] rounded-xl px-3 py-2 shadow-sm min-w-[195px]">
            <div className="text-[11px] font-bold text-[#647899] mb-1">Xếp hạng 3 đội</div>
            <div className="space-y-1">
              {sortedTeams.map((t) => (
                <div
                  key={t.name}
                  className="flex items-center justify-between gap-2 text-[11px] font-bold tabular-nums"
                >
                  <span style={{ color: t.color }}>
                    {t.name} {t.hasShield ? '🛡️' : ''}
                  </span>
                  <span className="text-[#163A70]">
                    T.{t.floor} · {t.score}đ
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Collapsible Bottom Unified Action Dock */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[94%] max-w-2xl flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                targetOrbitOffsetRef.current += Math.PI / 3;
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/95 border border-[#BAE6FD] text-[11px] font-bold text-[#163A70] hover:bg-[#ECFAFF] shadow-sm"
            >
              <Camera className="w-3.5 h-3.5 text-[#0284C7]" />
              Xoay góc nhìn tháp
            </button>
            <button
              type="button"
              onClick={() => setDockCollapsed((c) => !c)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/95 border border-[#BAE6FD] text-[11px] font-bold text-[#475569] hover:text-[#163A70] shadow-sm"
            >
              {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {dockCollapsed ? 'Mở điều khiển' : 'Thu gọn'}
            </button>
          </div>

          {!dockCollapsed && (
            <div className="w-full bg-white/95 border border-[#BAE6FD] rounded-2xl px-3.5 py-2.5 shadow-md flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={queue.length === 0 || !!activeGate}
                onClick={handleOpenNextGate}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] disabled:opacity-45 text-white text-xs sm:text-sm font-bold transition-colors"
              >
                <Cloud className="w-4 h-4" />
                {queue[0]?.attempts === 1
                  ? 'Thử lại Cổng Mây (Lượt 2)'
                  : `Mở Cổng Mây tầng ${Math.min(totalTargetFloors, floorReached + 1)}`}
              </button>

              {/* Team Power Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  disabled={myTeam.score < 20}
                  onClick={() => handleUseTeamPower('gift')}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-[#FFF7E6] border border-[#FDE2A7] text-[#B45309] disabled:opacity-40 hover:bg-[#FEF3C7]"
                >
                  <Gift className="w-3.5 h-3.5" />
                  Hộp quà (20đ)
                </button>
                <button
                  type="button"
                  disabled={myTeam.score < 30 || myTeam.hasShield}
                  onClick={() => handleUseTeamPower('shield')}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-[#ECFAFF] border border-[#BAE6FD] text-[#0369A1] disabled:opacity-40 hover:bg-[#E0F2FE]"
                >
                  <Shield className="w-3.5 h-3.5" />
                  Khiên (30đ)
                </button>
                <button
                  type="button"
                  disabled={myTeam.score < 40}
                  onClick={() => handleUseTeamPower('lightning')}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-[#F5F3FF] border border-[#DDD6FE] text-[#6D28D9] disabled:opacity-40 hover:bg-[#EDE9FE]"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Sấm sét (40đ)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 1-Screen Compact Question Modal (Supports both MCQ and True/False 4-statement!) */}
      {activeGate && activeGate.kind === 'mcq' && (
        <CompactQuestionModal
          mode="mcq"
          question={activeGate.question}
          badgeText={
            activeGate.attempts === 0
              ? '☁️ Cổng Mây (Trắc nghiệm · Lượt 1 – Tính điểm đội)'
              : '🔄 Cổng Mây quay lại (Lượt 2/2)'
          }
          accentColor="#0284C7"
          onResult={(r) => handleGateAnswer(r.isCorrect)}
        />
      )}

      {activeGate && activeGate.kind === 'tf4' && (
        <CompactQuestionModal
          mode="tf4"
          question={activeGate.question}
          badgeText={
            activeGate.attempts === 0
              ? '☁️ Cổng Mây (Đúng/Sai 4 ý · Lượt 1 – Tính điểm đội)'
              : '🔄 Cổng Mây Đúng/Sai quay lại (Lượt 2/2)'
          }
          accentColor="#7C3AED"
          onResult={(r) => handleGateAnswer(r.isCorrect)}
        />
      )}
    </div>
  );
}
