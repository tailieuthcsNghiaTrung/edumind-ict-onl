import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Flag,
  Fuel,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { FEATURED_GAMES_LIST } from '../../../data/games';
import { pickRandomQuestions } from '../../../data/questionBank';
import { Grade, Question, SessionRecord } from '../../types';
import {
  isSoundMuted,
  playBoostSound,
  playCorrectSound,
  playVictorySound,
  playWrongSound,
  setSoundMuted,
} from '../../utils/soundFx';
import {
  buildCheckpointArch,
  buildCompositeRaceCar,
  buildCompositeTree,
  buildGasStation,
  buildHorizonHills,
  createRoadTexture,
  createStudio3D,
} from '../../utils/threeHelpers';
import ClassroomLobby, {
  CarPreset,
  LobbyPlayer,
  RACE_CAR_PRESETS,
} from '../ClassroomLobby';
import CompactQuestionModal from '../CompactQuestionModal';

interface KnowledgeRace3DProps {
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

interface PowerItem {
  id: 'banana' | 'flame' | 'rocket' | 'aura' | 'ink';
  milestone: number;
  emoji: string;
  label: string;
  offensive: boolean;
  used: boolean;
}

const ITEM_MILESTONES: Omit<PowerItem, 'used'>[] = [
  { id: 'banana', milestone: 3, emoji: '🍌', label: 'Chuối trượt', offensive: true },
  { id: 'flame', milestone: 6, emoji: '🔥', label: 'Lửa đuôi xe', offensive: false },
  { id: 'rocket', milestone: 9, emoji: '🚀', label: 'Tên lửa', offensive: true },
  { id: 'aura', milestone: 12, emoji: '✨', label: 'Hào quang', offensive: false },
  { id: 'ink', milestone: 15, emoji: '🐙', label: 'Bom mực', offensive: true },
];

const LANES = [-3.1, 0, 3.1] as const;
const RACE_TARGET_DISTANCE = 1000;
const RACE_DURATION_SECONDS = 120;

interface RacerHud {
  id: string;
  name: string;
  distance: number;
  isAnswering: boolean;
  isPlayer: boolean;
  color: string;
}

export default function KnowledgeRace3D({
  grade,
  defaultClassName,
  defaultPlayerName,
  customQuestions,
  onExit,
  onCompleteSession,
}: KnowledgeRace3DProps) {
  const gameMeta = FEATURED_GAMES_LIST[0];
  const [phase, setPhase] = useState<'lobby' | 'playing' | 'finished'>('lobby');
  const [activeGrade, setActiveGrade] = useState<Grade>(grade);
  const [matchConfig, setMatchConfig] = useState<{
    selectedGrade: Grade;
    className: string;
    playerName: string;
    carPreset: CarPreset;
    players: LobbyPlayer[];
  } | null>(null);

  const [muted, setMuted] = useState(isSoundMuted());
  const [cameraMode, setCameraMode] = useState<'chase' | 'wide'>('chase');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const cameraModeRef = useRef<'chase' | 'wide'>('chase');
  cameraModeRef.current = cameraMode;

  // Live HUD state
  const [distance, setDistance] = useState(0);
  const [fuel, setFuel] = useState(100);
  const [speedKmh, setSpeedKmh] = useState(90);
  const [timeLeft, setTimeLeft] = useState(RACE_DURATION_SECONDS);
  const [consecutiveDodges, setConsecutiveDodges] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);
  const [items, setItems] = useState<PowerItem[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [statusBanner, setStatusBanner] = useState<string>(
    'Lách hoặc đâm rào chắn để trả lời câu hỏi bứt tốc · Ghé trạm xăng xanh để đổ xăng!'
  );
  const [racersHud, setRacersHud] = useState<RacerHud[]>([]);
  const [topicLog, setTopicLog] = useState<
    { grade: Grade; topic: string; isCorrect: boolean }[]
  >([]);

  const canvasMountRef = useRef<HTMLDivElement>(null);
  const questionPoolRef = useRef<Question[]>([]);
  const questionCursorRef = useRef(0);
  const recordedRef = useRef(false);

  // Mutable 3D game state in ref so WebGL canvas never remounts
  const simRef = useRef({
    laneIndex: 1,
    carX: 0,
    speed: 24,
    baseSpeed: 24,
    distance: 0,
    fuel: 100,
    pausedForQuestion: false,
    flipTimer: 0,
    boostTimer: 0,
    auraTimer: 0,
    dodges: 0,
    nextRowClosed: false,
    rivals: [] as {
      id: string;
      name: string;
      lane: number;
      distance: number;
      speed: number;
      isAnswering: boolean;
      answerTimer: number;
      slowTimer: number;
      color: string;
    }[],
    finished: false,
  });

  const nextQuestion = useCallback((): Question => {
    if (
      questionPoolRef.current.length === 0 ||
      questionCursorRef.current >= questionPoolRef.current.length
    ) {
      questionPoolRef.current = pickRandomQuestions(activeGrade, 16, { customQuestions });
      questionCursorRef.current = 0;
    }
    const q = questionPoolRef.current[questionCursorRef.current];
    questionCursorRef.current += 1;
    return q;
  }, [activeGrade, customQuestions]);

  const finishRace = useCallback(
    (finalCorrect: number, finalTotal: number, finalDist: number, log: { grade: Grade; topic: string; isCorrect: boolean }[]) => {
      if (simRef.current.finished) return;
      simRef.current.finished = true;
      setPhase('finished');
      playVictorySound();
      if (!recordedRef.current) {
        recordedRef.current = true;
        onCompleteSession(
          {
            type: 'game',
            title: 'Đường đua tri thức 3D',
            gameId: 'knowledge-race-3d',
            grade: activeGrade,
            score: finalCorrect * 15 + Math.round(finalDist / 20),
            maxScore: Math.max(150, finalTotal * 15 + 50),
            correctCount: finalCorrect,
            totalQuestions: Math.max(1, finalTotal),
            durationSeconds: Math.max(10, RACE_DURATION_SECONDS - timeLeft),
          },
          log
        );
      }
    },
    [activeGrade, onCompleteSession, timeLeft]
  );

  // Start match from lobby
  const handleStartMatch = (config: {
    selectedGrade: Grade;
    className: string;
    playerName: string;
    carPreset: CarPreset;
    players: LobbyPlayer[];
  }) => {
    setActiveGrade(config.selectedGrade);
    setMatchConfig(config);
    questionPoolRef.current = pickRandomQuestions(config.selectedGrade, 16, { customQuestions });
    questionCursorRef.current = 0;
    recordedRef.current = false;

    const rivals = config.players
      .filter((p) => p.id !== 'player-self')
      .slice(0, 4)
      .map((p, idx) => ({
        id: p.id,
        name: p.name,
        lane: idx % 3,
        distance: 10 + idx * 8,
        speed: 17 + Math.random() * 6,
        isAnswering: false,
        answerTimer: 2 + idx * 2,
        slowTimer: 0,
        color: RACE_CAR_PRESETS[(idx + 1) % RACE_CAR_PRESETS.length].swatch,
      }));

    simRef.current = {
      laneIndex: 1,
      carX: 0,
      speed: 24,
      baseSpeed: 24,
      distance: 0,
      fuel: 100,
      pausedForQuestion: false,
      flipTimer: 0,
      boostTimer: 0,
      auraTimer: 0,
      dodges: 0,
      nextRowClosed: false,
      rivals,
      finished: false,
    };

    setDistance(0);
    setFuel(100);
    setSpeedKmh(90);
    setTimeLeft(RACE_DURATION_SECONDS);
    setConsecutiveDodges(0);
    setCorrectCount(0);
    setTotalAnswered(0);
    setItems([]);
    setActiveQuestion(null);
    setTopicLog([]);
    setStatusBanner('Xuất phát! Lách hoặc đâm rào chắn để giải câu hỏi · Ghé trạm xăng xanh để đổ xăng!');
    setPhase('playing');
  };

  const steerLane = useCallback((dir: -1 | 1) => {
    if (simRef.current.pausedForQuestion || simRef.current.finished) return;
    simRef.current.laneIndex = Math.max(
      0,
      Math.min(2, simRef.current.laneIndex + dir)
    );
  }, []);

  // Keyboard steering
  useEffect(() => {
    if (phase !== 'playing') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') steerLane(-1);
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') steerLane(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, steerLane]);

  // Race countdown timer
  useEffect(() => {
    if (phase !== 'playing') return;
    const id = window.setInterval(() => {
      if (simRef.current.pausedForQuestion || simRef.current.finished) return;
      setTimeLeft((prev) => {
        if (prev <= 1) {
          finishRace(correctCount, totalAnswered, simRef.current.distance, topicLog);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [correctCount, finishRace, phase, topicLog, totalAnswered]);

  // Three.js 3D Racing Scene
  useEffect(() => {
    if (phase !== 'playing' || !canvasMountRef.current || !matchConfig) return;
    const container = canvasMountRef.current;
    const studio = createStudio3D(container, 0xbae6fd, 35, 130);
    const { renderer, scene } = studio;

    const camera = new THREE.PerspectiveCamera(
      58,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      200
    );
    camera.position.set(0, 5.4, 9.8);
    camera.lookAt(0, 1.1, -12);

    // Wide green countryside ground extending to fog horizon (no boxed walls!)
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x86efac,
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.04;
    ground.receiveShadow = true;
    scene.add(ground);

    // Procedural asphalt highway road
    const roadTex = createRoadTexture(renderer);
    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTex,
      roughness: 0.72,
    });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(10.8, 170), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -60);
    road.receiveShadow = true;
    scene.add(road);

    // Distant rolling hills fading into horizon fog
    const hills = buildHorizonHills();
    scene.add(hills);

    // Scrolling checkpoint arches
    const arches: THREE.Group[] = [];
    for (let i = 0; i < 2; i++) {
      const arch = buildCheckpointArch(0xea580c);
      arch.position.set(0, 0, -42 - i * 74);
      scene.add(arch);
      arches.push(arch);
    }

    // Roadside pine trees
    const trees: THREE.Group[] = [];
    for (let i = 0; i < 24; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const t = buildCompositeTree(0.9 + (i % 3) * 0.2);
      t.position.set(side * (8.2 + (i % 4) * 2.2), 0, -i * 6.5 + 10);
      scene.add(t);
      trees.push(t);
    }

    // Player Composite 3D Race Car
    const playerCar = buildCompositeRaceCar(
      matchConfig.carPreset.bodyHex,
      matchConfig.carPreset.trimHex
    );
    playerCar.position.set(0, 0, 2.2);
    scene.add(playerCar);

    // Aura ring around car (visible when aura active)
    const auraMesh = new THREE.Mesh(
      new THREE.TorusGeometry(1.75, 0.08, 10, 32),
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xfacc15,
        emissiveIntensity: 0.9,
      })
    );
    auraMesh.rotation.x = Math.PI / 2;
    auraMesh.position.y = 0.25;
    auraMesh.visible = false;
    playerCar.add(auraMesh);

    // Rival Composite 3D Cars
    const rivalMeshes = simRef.current.rivals.map((r, idx) => {
      const preset = RACE_CAR_PRESETS[(idx + 1) % RACE_CAR_PRESETS.length];
      const mesh = buildCompositeRaceCar(preset.bodyHex, preset.trimHex);
      mesh.position.set(LANES[r.lane], 0, -14 - idx * 10);
      scene.add(mesh);
      return mesh;
    });

    // Obstacle Rows (Barriers + Gas Stations)
    interface ObstacleRow {
      z: number;
      barrierLanes: number[];
      gasLane: number | null;
      passed: boolean;
      hit: boolean;
      closedAll: boolean;
      meshes: THREE.Object3D[];
    }

    const barrierMatRed = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.4,
    });
    const barrierMatWhite = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
    });

    const createBarrierMesh = (closedAll: boolean) => {
      const g = new THREE.Group();
      const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.35, 8);
      [-1.05, 1.05].forEach((x) => {
        const p = new THREE.Mesh(postGeo, barrierMatWhite);
        p.position.set(x, 0.675, 0);
        g.add(p);
      });
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(2.35, 0.65, 0.22),
        closedAll ? barrierMatRed : barrierMatRed
      );
      board.position.set(0, 1.0, 0);
      board.castShadow = true;
      g.add(board);
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.67, 0.24),
        barrierMatWhite
      );
      stripe.position.set(0, 1.0, 0);
      g.add(stripe);
      return g;
    };

    const rows: ObstacleRow[] = [];
    const spawnRow = (zPos: number, forceCloseAll = false) => {
      const closedAll = forceCloseAll;
      let barrierLanes: number[] = [];
      let gasLane: number | null = null;

      if (closedAll) {
        barrierLanes = [0, 1, 2];
      } else {
        // 1 or 2 barriers, leaving at least 1 open lane; 35% chance open lane has a gas station
        const openLane = Math.floor(Math.random() * 3);
        barrierLanes = [0, 1, 2].filter((l) => l !== openLane);
        if (Math.random() < 0.45) {
          gasLane = openLane;
        }
      }

      const meshes: THREE.Object3D[] = [];
      for (const l of barrierLanes) {
        const b = createBarrierMesh(closedAll);
        b.position.set(LANES[l], 0, zPos);
        scene.add(b);
        meshes.push(b);
      }
      if (gasLane !== null) {
        const gas = buildGasStation();
        gas.position.set(LANES[gasLane], 0, zPos);
        scene.add(gas);
        meshes.push(gas);
      }
      rows.push({
        z: zPos,
        barrierLanes,
        gasLane,
        passed: false,
        hit: false,
        closedAll,
        meshes,
      });
    };

    spawnRow(-34, false);
    spawnRow(-66, false);
    spawnRow(-98, false);

    if (!studio.isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    let hudAccumulator = 0;

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
      const sim = simRef.current;

      // Update rivals even gently while racing
      if (!sim.finished) {
        for (let i = 0; i < sim.rivals.length; i++) {
          const r = sim.rivals[i];
          r.answerTimer -= dt;
          if (r.answerTimer <= 0) {
            r.isAnswering = !r.isAnswering;
            r.answerTimer = r.isAnswering ? 3.5 + Math.random() * 2.5 : 4 + Math.random() * 4;
          }
          if (r.slowTimer > 0) r.slowTimer = Math.max(0, r.slowTimer - dt);
          const rSpeed = r.isAnswering ? 0 : r.slowTimer > 0 ? r.speed * 0.35 : r.speed;
          r.distance = Math.min(RACE_TARGET_DISTANCE, r.distance + rSpeed * dt);
          const relZ = 2.2 - (r.distance - sim.distance) * 0.45;
          rivalMeshes[i].position.set(LANES[r.lane], 0, relZ);
          rivalMeshes[i].visible = relZ > -95 && relZ < 20;
          const rWheels = rivalMeshes[i].userData?.wheels as THREE.Group[] | undefined;
          if (rWheels && rSpeed > 0) {
            for (const w of rWheels) w.rotation.x -= rSpeed * dt * 0.55;
          }
        }
      }

      if (!sim.pausedForQuestion && !sim.finished) {
        if (sim.boostTimer > 0) sim.boostTimer = Math.max(0, sim.boostTimer - dt);
        if (sim.auraTimer > 0) sim.auraTimer = Math.max(0, sim.auraTimer - dt);
        if (sim.flipTimer > 0) sim.flipTimer = Math.max(0, sim.flipTimer - dt);

        // Fuel drain
        sim.fuel = Math.max(8, sim.fuel - dt * 2.8);
        const fuelFactor = sim.fuel <= 15 ? 0.55 : 1;
        const targetSpeed =
          sim.flipTimer > 0
            ? 8
            : (sim.boostTimer > 0 ? 40 : sim.auraTimer > 0 ? 34 : sim.baseSpeed) *
              fuelFactor;
        sim.speed = THREE.MathUtils.damp(sim.speed, targetSpeed, 5, dt);
        sim.distance += sim.speed * dt;

        // Scroll road texture, checkpoint arches & roadside trees
        roadTex.offset.y -= sim.speed * dt * 0.085;
        for (const arch of arches) {
          arch.position.z += sim.speed * dt;
          if (arch.position.z > 16) arch.position.z -= 148;
        }
        for (const t of trees) {
          t.position.z += sim.speed * dt;
          if (t.position.z > 16) t.position.z -= 156;
        }

        // Spin player car wheels & animate turbo exhaust flames
        const pWheels = playerCar.userData?.wheels as THREE.Group[] | undefined;
        if (pWheels) {
          for (const w of pWheels) w.rotation.x -= sim.speed * dt * 0.6;
        }
        const pFlames = playerCar.userData?.flames as THREE.Mesh[] | undefined;
        if (pFlames) {
          const boosting = sim.boostTimer > 0 || sim.auraTimer > 0;
          const pulse = 0.85 + Math.sin(clock.elapsedTime * 38) * 0.25;
          for (const fl of pFlames) {
            fl.visible = boosting;
            if (boosting) fl.scale.set(1, pulse, 1);
          }
        }

        // Smooth lane steering & flip animation
        const targetX = LANES[sim.laneIndex];
        sim.carX = THREE.MathUtils.damp(sim.carX, targetX, 11, dt);
        playerCar.position.x = sim.carX;
        playerCar.rotation.z =
          sim.flipTimer > 0
            ? (1 - sim.flipTimer / 0.9) * Math.PI * 2
            : THREE.MathUtils.damp(playerCar.rotation.z, (sim.carX - targetX) * 0.12, 10, dt);
        playerCar.position.y =
          sim.flipTimer > 0 ? Math.sin((sim.flipTimer / 0.9) * Math.PI) * 1.4 : 0;
        auraMesh.visible = sim.auraTimer > 0;
        if (auraMesh.visible) auraMesh.rotation.z += dt * 3;

        // Camera smooth follow + chase/wide mode + speed FOV feel
        const wide = cameraModeRef.current === 'wide';
        camera.position.x = THREE.MathUtils.damp(camera.position.x, sim.carX * 0.45, 5, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, wide ? 7.8 : 5.4, 4.5, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, wide ? 13.4 : 9.8, 4.5, dt);
        camera.lookAt(sim.carX * 0.25, 1.1, -12);
        const targetFov = sim.boostTimer > 0 ? (wide ? 66 : 67) : wide ? 60 : 58;
        if (Math.abs(camera.fov - targetFov) > 0.1) {
          camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 5, dt);
          camera.updateProjectionMatrix();
        }

        // Move & check obstacle rows
        for (let i = rows.length - 1; i >= 0; i--) {
          const row = rows[i];
          row.z += sim.speed * dt;
          for (const m of row.meshes) m.position.z = row.z;

          // Check collision near player car z = 2.2
          if (!row.hit && row.z >= 0.4 && row.z <= 3.6) {
            if (row.gasLane !== null && sim.laneIndex === row.gasLane) {
              row.hit = true;
              sim.fuel = Math.min(100, sim.fuel + 42);
              playBoostSound();
              setStatusBanner('⛽ Đã đổ đầy xăng tại trạm! Tiếp tục tăng tốc!');
            } else if (row.barrierLanes.includes(sim.laneIndex)) {
              row.hit = true;
              // STOP CAR COMPLETELY before showing question!
              sim.speed = 0;
              sim.pausedForQuestion = true;
              sim.dodges = 0;
              setConsecutiveDodges(0);
              // Clear collided row visuals so path is open after answering
              for (const m of row.meshes) scene.remove(m);
              rows.splice(i, 1);
              spawnRow(-96, false);
              setActiveQuestion(nextQuestion());
              setStatusBanner('🛑 Xe đã dừng hẳn trước rào chắn — Hãy đọc kỹ câu hỏi và trả lời!');
              break;
            }
          }

          // Passed without hitting barrier -> increment dodge streak
          if (!row.passed && !row.hit && row.z > 4.2) {
            row.passed = true;
            sim.dodges += 1;
            setConsecutiveDodges(sim.dodges);
            if (sim.dodges >= 5) {
              sim.nextRowClosed = true;
              setStatusBanner(
                '⚠️ Bạn đã né 5 hàng liên tiếp! Hàng rào phía trước sẽ đóng kín cả 3 làn đường!'
              );
            }
          }

          // Recycle row far behind camera
          if (row.z > 14) {
            for (const m of row.meshes) scene.remove(m);
            rows.splice(i, 1);
            const forceClose = sim.nextRowClosed;
            if (forceClose) sim.nextRowClosed = false;
            spawnRow(-92, forceClose);
          }
        }

        // Check finish line
        if (sim.distance >= RACE_TARGET_DISTANCE) {
          sim.distance = RACE_TARGET_DISTANCE;
        }
      }

      renderer.render(scene, camera);

      // Sync React HUD cleanly at ~8Hz
      hudAccumulator += dt;
      if (hudAccumulator >= 0.12) {
        hudAccumulator = 0;
        setDistance(Math.min(RACE_TARGET_DISTANCE, Math.round(sim.distance)));
        setFuel(Math.round(sim.fuel));
        setSpeedKmh(sim.pausedForQuestion ? 0 : Math.round(sim.speed * 3.8));
        const board: RacerHud[] = [
          {
            id: 'player-self',
            name: matchConfig.playerName,
            distance: Math.round(sim.distance),
            isAnswering: sim.pausedForQuestion,
            isPlayer: true,
            color: matchConfig.carPreset.swatch,
          },
          ...sim.rivals.map((r) => ({
            id: r.id,
            name: r.name,
            distance: Math.round(r.distance),
            isAnswering: r.isAnswering,
            isPlayer: false,
            color: r.color,
          })),
        ].sort((a, b) => b.distance - a.distance);
        setRacersHud(board);
      }

      studio.scheduleNext(tick);
    };

    studio.scheduleNext(tick);

    return () => {
      window.removeEventListener('resize', handleResize);
      roadTex.dispose();
      studio.dispose();
    };
  }, [matchConfig, nextQuestion, phase]);

  // Trigger race finish when distance hits target
  useEffect(() => {
    if (phase === 'playing' && distance >= RACE_TARGET_DISTANCE) {
      finishRace(correctCount, totalAnswered, distance, topicLog);
    }
  }, [correctCount, distance, finishRace, phase, topicLog, totalAnswered]);

  // Handle Answer from CompactQuestionModal
  const handleQuestionResult = (res: {
    isCorrect: boolean;
    thinkSeconds: number;
    selectedIndex: number;
  }) => {
    const q = activeQuestion;
    setActiveQuestion(null);
    const nextTotal = totalAnswered + 1;
    const nextCorrect = correctCount + (res.isCorrect ? 1 : 0);
    setTotalAnswered(nextTotal);
    setCorrectCount(nextCorrect);

    if (q) {
      setTopicLog((prev) => [
        ...prev,
        { grade: q.grade, topic: q.topic, isCorrect: res.isCorrect },
      ]);
    }

    const sim = simRef.current;
    sim.pausedForQuestion = false;

    if (res.isCorrect) {
      playCorrectSound();
      sim.boostTimer = 2.8;
      // Thoughtful reading bonus: refund a bit of race time when student reads carefully (>= 2.2s)
      const timeBonus = res.thinkSeconds >= 2.2 ? 3 : 0;
      if (timeBonus > 0) {
        setTimeLeft((prev) => Math.min(RACE_DURATION_SECONDS, prev + timeBonus));
      }

      // Check item reward milestones (3, 6, 9, 12, 15; from 2nd item requires >= 60% accuracy)
      const acc = nextCorrect / Math.max(1, nextTotal);
      let unlockedMsg = '';
      setItems((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const nextList = [...prev];
        for (let idx = 0; idx < ITEM_MILESTONES.length; idx++) {
          const m = ITEM_MILESTONES[idx];
          const meetsAccuracy = idx === 0 || acc >= 0.6;
          if (nextCorrect >= m.milestone && meetsAccuracy && !existingIds.has(m.id)) {
            nextList.push({ ...m, used: false });
            unlockedMsg = ` · Mở khóa quà: ${m.emoji} ${m.label}!`;
          }
        }
        return nextList;
      });

      setStatusBanner(
        `🚀 Chính xác! Tăng tốc Turbo${timeBonus > 0 ? ' + bù 3 giây suy nghĩ kỹ' : ''}${unlockedMsg}`
      );
    } else {
      playWrongSound();
      sim.flipTimer = 0.9; // 3D barrel flip!
      const reckless = res.thinkSeconds < 1.2;
      setStatusBanner(
        reckless
          ? '💥 Bấm vội quá nhanh và sai! Xe bị lật nhào — Hãy đọc kỹ câu hỏi nhé!'
          : '💥 Trả lời chưa chính xác! Xe bị lật nhào và giảm tốc độ!'
      );
    }
  };

  // Use Unlocked Item (enforcing rule: CANNOT throw at any rival stopped answering a question!)
  const handleUseItem = (itemId: PowerItem['id']) => {
    const targetItem = items.find((i) => i.id === itemId && !i.used);
    if (!targetItem) return;

    const sim = simRef.current;
    if (targetItem.offensive) {
      const validTargets = sim.rivals.filter((r) => !r.isAnswering);
      if (validTargets.length === 0) {
        setStatusBanner(
          '🛡️ Các đối thủ đều đang dừng trả lời câu hỏi — Không ai được ném bạn đang trả lời!'
        );
        return;
      }
      // Hit the leading moving rival
      validTargets.sort((a, b) => b.distance - a.distance);
      const victim = validTargets[0];
      victim.slowTimer = 4.5;
      playBoostSound();
      setStatusBanner(
        `${targetItem.emoji} Đã dùng ${targetItem.label} trúng ${victim.name} (đang chạy trên đường)!`
      );
    } else {
      playBoostSound();
      if (targetItem.id === 'flame') {
        sim.boostTimer = 4.0;
        setStatusBanner('🔥 Kích hoạt Lửa đuôi xe — Bứt tốc cực mạnh!');
      } else {
        sim.auraTimer = 6.0;
        sim.fuel = Math.min(100, sim.fuel + 30);
        setStatusBanner('✨ Kích hoạt Hào quang — Bảo vệ & tăng tốc bền bỉ!');
      }
    }

    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, used: true } : i))
    );
  };

  const accuracyPct = useMemo(
    () => (totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 100),
    [correctCount, totalAnswered]
  );

  // ==================== LOBBY PHASE ====================
  if (phase === 'lobby') {
    return (
      <ClassroomLobby
        gameId="knowledge-race-3d"
        title={gameMeta.title}
        subtitle={gameMeta.subtitle}
        openButtonLabel="Mở đường đua"
        heroImage={gameMeta.imageUrl}
        accentColor="#EA580C"
        grade={grade}
        defaultClassName={defaultClassName}
        defaultPlayerName={defaultPlayerName}
        showCarPicker
        onExit={onExit}
        onStartMatch={handleStartMatch}
      />
    );
  }

  // ==================== FINISHED PODIUM ====================
  if (phase === 'finished') {
    const rankPos = racersHud.findIndex((r) => r.isPlayer) + 1;
    return (
      <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-[#DCE8F8] p-6 sm:p-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[#FFF7E6] border border-[#FDE2A7] mx-auto flex items-center justify-center">
          <Trophy className="w-8 h-8 text-[#D97706]" />
        </div>
        <div>
          <div className="text-xs font-bold text-[#D97706]">
            Đường Đua Tri Thức 3D · Lớp {activeGrade} · Tin học {activeGrade}
          </div>
          <h2 className="text-2xl font-extrabold text-[#163A70] mt-1">
            {rankPos === 1
              ? 'Quán quân Đường Đua Tri Thức! 🏆'
              : `Hoàn thành chặng đua ở vị trí hạng #${Math.max(1, rankPos)}!`}
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-[#F5F9FF]">
            <div className="text-xs text-[#647899]">Quãng đường</div>
            <div className="text-xl font-extrabold text-[#2563EB] tabular-nums">
              {distance}/{RACE_TARGET_DISTANCE}m
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[#ECFDF5]">
            <div className="text-xs text-[#647899]">Câu đúng</div>
            <div className="text-xl font-extrabold text-[#059669] tabular-nums">
              {correctCount}/{totalAnswered}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[#FFF7E6]">
            <div className="text-xs text-[#647899]">Độ chính xác</div>
            <div className="text-xl font-extrabold text-[#D97706] tabular-nums">
              {accuracyPct}%
            </div>
          </div>
        </div>

        {/* Class Standings */}
        <div className="text-left rounded-2xl border border-[#E4EDF9] divide-y divide-[#EEF4FC]">
          {racersHud.map((r, idx) => (
            <div
              key={r.id}
              className={`px-4 py-2.5 flex items-center justify-between text-sm ${
                r.isPlayer ? 'bg-[#EEF6FF] font-bold text-[#163A70]' : 'text-[#475569]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-6 text-center font-extrabold tabular-nums">#{idx + 1}</span>
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
                <span>{r.name}</span>
              </div>
              <span className="tabular-nums font-semibold">{r.distance}m</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => matchConfig && handleStartMatch(matchConfig)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-bold"
          >
            <RotateCcw className="w-4 h-4" />
            Đua lại trận mới
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

  // ==================== ACTIVE 3D GAMEPLAY ====================
  return (
    <div className="space-y-2.5">
      {/* Compact Top Bar */}
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
            🏎️ Đường Đua Tri Thức · Tin học {activeGrade}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-xs font-bold tabular-nums">
          <span className="text-[#2563EB] flex items-center gap-1">
            <Flag className="w-3.5 h-3.5" />
            {distance}/{RACE_TARGET_DISTANCE}m
          </span>
          <span className={`flex items-center gap-1 ${fuel <= 25 ? 'text-[#EF4444]' : 'text-[#059669]'}`}>
            <Fuel className="w-3.5 h-3.5" />
            Xăng: {fuel}%
          </span>
          <span className={consecutiveDodges >= 4 ? 'text-[#D97706]' : 'text-[#475569]'}>
            Né liên tiếp: {consecutiveDodges}/5
          </span>
          <span className="text-[#059669]">
            Đúng: {correctCount}/{totalAnswered} ({accuracyPct}%)
          </span>
          <span className="text-[#163A70]">⏱ {timeLeft}s</span>
          <button
            type="button"
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setSoundMuted(next);
            }}
            className="p-1.5 rounded-lg bg-[#F4F9FF] text-[#163A70]"
            aria-label="Bật/tắt âm thanh"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 3D Viewport Container */}
      <div className="relative w-full h-[64vh] min-h-[380px] max-h-[560px] rounded-3xl overflow-hidden border border-[#CBE0F7] bg-[#BAE6FD]">
        {/* Isolated WebGL Mount */}
        <div ref={canvasMountRef} className="w-full h-full" />

        {/* Minimal Top-Left Speed & Status Strip (solid surface, zero backdrop-blur over WebGL) */}
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-3 pointer-events-none">
          <div className="bg-white/95 border border-[#DCE8F8] rounded-xl px-3.5 py-2 shadow-sm max-w-md">
            <div className="text-xs font-bold text-[#163A70]">{statusBanner}</div>
            <div className="text-[11px] text-[#647899] mt-0.5 tabular-nums">
              Tốc độ: <strong className="text-[#2563EB]">{speedKmh} km/h</strong> · Quà mốc: 3🍌 6🔥 9🚀 12✨ 15🐙
            </div>
          </div>

          {/* Live Mini Class Ranking */}
          <div className="hidden md:block bg-white/95 border border-[#DCE8F8] rounded-xl px-3 py-2 shadow-sm min-w-[170px]">
            <div className="text-[11px] font-bold text-[#647899] mb-1">
              Bảng đua Lớp {matchConfig?.className}
            </div>
            <div className="space-y-1">
              {racersHud.slice(0, 4).map((r, i) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between gap-2 text-[11px] tabular-nums ${
                    r.isPlayer ? 'font-extrabold text-[#2563EB]' : 'text-[#334155]'
                  }`}
                >
                  <span className="truncate">
                    {i + 1}. {r.name} {r.isAnswering ? '🛑' : ''}
                  </span>
                  <span>{r.distance}m</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Collapsible Unified Bottom Control Dock (solid surface, zero backdrop-blur) */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[94%] max-w-2xl flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCameraMode((m) => (m === 'chase' ? 'wide' : 'chase'))}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/95 border border-[#DCE8F8] text-[11px] font-bold text-[#163A70] hover:bg-[#EEF6FF] shadow-sm"
            >
              <Camera className="w-3.5 h-3.5 text-[#2563EB]" />
              {cameraMode === 'chase' ? 'Góc nhìn rộng' : 'Góc nhìn sát xe'}
            </button>
            <button
              type="button"
              onClick={() => setDockCollapsed((c) => !c)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/95 border border-[#DCE8F8] text-[11px] font-bold text-[#475569] hover:text-[#163A70] shadow-sm"
            >
              {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {dockCollapsed ? 'Mở điều khiển' : 'Thu gọn'}
            </button>
          </div>

          {!dockCollapsed && (
            <div className="w-full bg-white/95 border border-[#DCE8F8] rounded-2xl px-3 py-2.5 shadow-md flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => steerLane(-1)}
                  className="inline-flex items-center gap-1 px-4 py-2.5 rounded-xl bg-[#EEF6FF] hover:bg-[#2563EB] text-[#163A70] hover:text-white text-xs sm:text-sm font-bold transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Lách trái
                </button>
                <button
                  type="button"
                  onClick={() => steerLane(1)}
                  className="inline-flex items-center gap-1 px-4 py-2.5 rounded-xl bg-[#EEF6FF] hover:bg-[#2563EB] text-[#163A70] hover:text-white text-xs sm:text-sm font-bold transition-colors"
                >
                  Lách phải
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Item Powerups */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {items.length === 0 ? (
                  <span className="text-[11px] font-semibold text-[#647899] flex items-center gap-1 px-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#D97706]" />
                    Đúng 3 câu mở 🍌 Chuối
                  </span>
                ) : (
                  items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={item.used}
                      onClick={() => handleUseItem(item.id)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                        item.used
                          ? 'bg-[#F1F5F9] text-[#94A3B8] border-[#E2E8F0] line-through'
                          : 'bg-[#FFF7E6] border-[#FCD34D] text-[#92400E] hover:bg-[#FDE68A]'
                      }`}
                    >
                      {item.emoji} {item.label}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compact 1-Screen Question Modal when car stops at barrier */}
      {activeQuestion && (
        <CompactQuestionModal
          mode="mcq"
          question={activeQuestion}
          badgeText="🛑 Xe đã dừng trước rào chắn · Trả lời đúng để tăng tốc!"
          accentColor="#EA580C"
          onResult={handleQuestionResult}
        />
      )}

      {consecutiveDodges >= 5 && (
        <div className="flex items-center gap-2 text-xs font-bold text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-3.5 py-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          Hàng rào phía trước đã đóng kín cả 3 làn vì bạn né quá 5 hàng liên tiếp — chuẩn bị trả lời câu hỏi nhé!
        </div>
      )}
    </div>
  );
}
