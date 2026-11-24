import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ArrowLeft,
  ArrowUp,
  Camera,
  ChevronDown,
  ChevronUp,
  Download,
  Droplets,
  Flame,
  RotateCcw,
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
  playJumpSound,
  playVictorySound,
  playWrongSound,
  setSoundMuted,
} from '../../utils/soundFx';
import {
  buildCheckpointArch,
  buildCompositeRunner,
  buildCompositeTree,
  buildHorizonHills,
  buildWaterStation,
  createStudio3D,
  createTrackTexture,
} from '../../utils/threeHelpers';
import ClassroomLobby, { CarPreset, LobbyPlayer } from '../ClassroomLobby';
import CompactQuestionModal from '../CompactQuestionModal';

interface HealthFestival3DProps {
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

interface StationQuestion {
  uid: string;
  question: Question;
  isRetry: boolean;
}

interface ClassResultRow {
  id: string;
  name: string;
  isMe: boolean;
  firstTryCorrect: number;
  retryFixed: number;
  rawScore: number;
  score10: number;
  bottles: number;
  timeSec: number;
}

const TOTAL_PRIMARY_STATIONS = 6;

function getGradeClassification(score10: number): string {
  if (score10 >= 9) return 'Xuất sắc';
  if (score10 >= 8) return 'Giỏi';
  if (score10 >= 6.5) return 'Khá';
  return 'Đạt';
}

export default function HealthFestival3D({
  grade,
  defaultClassName,
  defaultPlayerName,
  customQuestions,
  onExit,
  onCompleteSession,
}: HealthFestival3DProps) {
  const gameMeta = FEATURED_GAMES_LIST[2];
  const [phase, setPhase] = useState<'lobby' | 'playing' | 'finished'>('lobby');
  const [activeGrade, setActiveGrade] = useState<Grade>(grade);
  const [matchClass, setMatchClass] = useState(String(grade));
  const [playerName, setPlayerName] = useState(defaultPlayerName);
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([]);

  const [stationQueue, setStationQueue] = useState<StationQuestion[]>([]);
  const [stationsDone, setStationsDone] = useState(0);
  const [bottles, setBottles] = useState(0);
  const [firstTryCorrect, setFirstTryCorrect] = useState(0);
  const [retryFixed, setRetryFixed] = useState(0);
  const [rawScore, setRawScore] = useState(0);
  const [stamina, setStamina] = useState(100);
  const [distanceM, setDistanceM] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [muted, setMuted] = useState(() => isSoundMuted());
  const [activeStation, setActiveStation] = useState<StationQuestion | null>(null);
  const [statusBanner, setStatusBanner] = useState(
    'Nhấn phím Space hoặc nút Nhảy để vượt rào chắn! Dừng ở Trạm Nước để nạp năng lượng.'
  );
  const [topicLog, setTopicLog] = useState<
    { grade: Grade; topic: string; isCorrect: boolean }[]
  >([]);
  const [finalStandings, setFinalStandings] = useState<ClassResultRow[]>([]);
  const [cameraMode, setCameraMode] = useState<'chase' | 'wide'>('chase');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const cameraModeRef = useRef<'chase' | 'wide'>('chase');
  cameraModeRef.current = cameraMode;

  const canvasMountRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const jumpVelocityRef = useRef(0);
  const runnerYRef = useRef(0);
  const staminaRef = useRef(100);
  const speedBoostUntilRef = useRef(0);
  const stumbleUntilRef = useRef(0);
  const queueRef = useRef<StationQuestion[]>([]);
  const recordedRef = useRef(false);

  staminaRef.current = stamina;
  queueRef.current = stationQueue;
  pausedRef.current = activeStation !== null || phase !== 'playing';

  const triggerJump = useCallback(() => {
    if (pausedRef.current) return;
    if (runnerYRef.current <= 0.08) {
      jumpVelocityRef.current = 9.4;
      playJumpSound();
    }
  }, []);

  // Keyboard jump support
  useEffect(() => {
    if (phase !== 'playing') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        if (!pausedRef.current) {
          e.preventDefault();
          triggerJump();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, triggerJump]);

  // Match timer
  useEffect(() => {
    if (phase !== 'playing' || activeStation) return;
    const id = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [activeStation, phase]);

  const finishFestival = useCallback(
    (
      finalRaw: number,
      finalFirst: number,
      finalRetry: number,
      finalBottles: number,
      finalElapsed: number,
      log: { grade: Grade; topic: string; isCorrect: boolean }[]
    ) => {
      setPhase('finished');
      playVictorySound();

      const myScore10 = Math.min(
        10,
        Math.round((finalRaw / TOTAL_PRIMARY_STATIONS) * 100) / 10
      );

      const classmates = lobbyPlayers.filter((p) => p.id !== 'player-self');
      const rows: ClassResultRow[] = [
        {
          id: 'player-self',
          name: playerName,
          isMe: true,
          firstTryCorrect: finalFirst,
          retryFixed: finalRetry,
          rawScore: finalRaw,
          score10: myScore10,
          bottles: finalBottles,
          timeSec: Math.max(15, finalElapsed),
        },
        ...classmates.map((mate, idx) => {
          const f1 = Math.max(2, Math.min(TOTAL_PRIMARY_STATIONS, 3 + ((idx * 2 + 1) % 4)));
          const missed = TOTAL_PRIMARY_STATIONS - f1;
          const rFix = missed > 0 ? Math.min(missed, idx % 2 === 0 ? 1 : missed) : 0;
          const raw = f1 + rFix * 0.5;
          const s10 = Math.min(10, Math.round((raw / TOTAL_PRIMARY_STATIONS) * 100) / 10);
          return {
            id: mate.id,
            name: mate.name,
            isMe: false,
            firstTryCorrect: f1,
            retryFixed: rFix,
            rawScore: raw,
            score10: s10,
            bottles: f1 + rFix,
            timeSec: Math.max(24, finalElapsed + (idx - 2) * 7),
          };
        }),
      ].sort((a, b) => b.score10 - a.score10 || a.timeSec - b.timeSec);

      setFinalStandings(rows);

      if (!recordedRef.current) {
        recordedRef.current = true;
        onCompleteSession(
          {
            type: 'game',
            title: 'Hội Khoẻ Tri Thức 3D',
            gameId: 'health-festival-3d',
            grade: activeGrade,
            score: Math.round(myScore10 * 10),
            maxScore: 100,
            correctCount: finalFirst + finalRetry,
            totalQuestions: TOTAL_PRIMARY_STATIONS,
            durationSeconds: Math.max(15, finalElapsed),
          },
          log
        );
      }
    },
    [activeGrade, lobbyPlayers, onCompleteSession, playerName]
  );

  const handleStartMatch = (config: {
    selectedGrade: Grade;
    className: string;
    playerName: string;
    carPreset: CarPreset;
    players: LobbyPlayer[];
  }) => {
    setActiveGrade(config.selectedGrade);
    const picked = pickRandomQuestions(config.selectedGrade, TOTAL_PRIMARY_STATIONS, { customQuestions });
    const initialQueue: StationQuestion[] = picked.map((q, idx) => ({
      uid: `st-${q.id}-${idx}`,
      question: q,
      isRetry: false,
    }));

    setMatchClass(String(config.selectedGrade));
    setPlayerName(config.playerName);
    setLobbyPlayers(config.players);
    setStationQueue(initialQueue);
    setStationsDone(0);
    setBottles(0);
    setFirstTryCorrect(0);
    setRetryFixed(0);
    setRawScore(0);
    setStamina(100);
    setDistanceM(0);
    setElapsedSec(0);
    setActiveStation(null);
    setTopicLog([]);
    recordedRef.current = false;
    runnerYRef.current = 0;
    jumpVelocityRef.current = 0;
    setStatusBanner(
      'Xuất phát! Bấm Space hoặc Nhảy vượt rào, trả lời đúng tại Trạm Nước để nhận chai nước tăng thể lực!'
    );
    setPhase('playing');
  };

  // Three.js 3D Cross-Country Stadium Scene
  useEffect(() => {
    if (phase !== 'playing' || !canvasMountRef.current) return;
    const container = canvasMountRef.current;
    const studio = createStudio3D(container, 0xbae6fd, 28, 125);
    const { renderer, scene } = studio;

    const camera = new THREE.PerspectiveCamera(
      54,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      190
    );
    camera.position.set(0, 4.4, 10.5);
    camera.lookAt(0, 1.3, -14);

    // Wide sunny green stadium grass
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 260),
      new THREE.MeshStandardMaterial({ color: 0x65c96e, roughness: 0.92 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.02, -70);
    grass.receiveShadow = true;
    scene.add(grass);

    // Distant rolling hills fading into horizon fog
    const hills = buildHorizonHills();
    scene.add(hills);

    // Procedural scrolling terracotta athletic running track
    const trackTex = createTrackTexture(renderer);
    const track = new THREE.Mesh(
      new THREE.PlaneGeometry(10.6, 260),
      new THREE.MeshStandardMaterial({ map: trackTex, roughness: 0.78 })
    );
    track.rotation.x = -Math.PI / 2;
    track.position.set(0, 0, -70);
    track.receiveShadow = true;
    scene.add(track);

    // Stadium checkpoint arch scrolling periodically
    const festivalArch = buildCheckpointArch(0x059669);
    festivalArch.position.set(0, 0, -28);
    scene.add(festivalArch);

    // Stadium trees & colorful banners lining both sides
    const trees: THREE.Group[] = [];
    for (let i = 0; i < 16; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const tree = buildCompositeTree(0.95 + (i % 3) * 0.15);
      tree.position.set(side * (8.2 + (i % 2) * 2.4), 0, -i * 12 + 4);
      scene.add(tree);
      trees.push(tree);
    }

    // Player composite 3D runner + 2 classmate rival runners
    const playerRunner = buildCompositeRunner(0x059669, 0x163a70);
    playerRunner.position.set(0, 0, 2.2);
    scene.add(playerRunner);

    const rivalLeft = buildCompositeRunner(0x2563eb, 0x1e293b);
    rivalLeft.position.set(-3.3, 0, -1.5);
    scene.add(rivalLeft);

    const rivalRight = buildCompositeRunner(0xf59e0b, 0x1e293b);
    rivalRight.position.set(3.3, 0, -3.5);
    scene.add(rivalRight);

    // Hurdles on player's center lane
    const hurdleGroupList: { mesh: THREE.Group; hit: boolean }[] = [];
    const buildHurdle = () => {
      const g = new THREE.Group();
      const postMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
      const barMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });
      for (const px of [-1.25, 1.25]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.12), postMat);
        post.position.set(px, 0.48, 0);
        g.add(post);
      }
      const topBar = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.22, 0.14), barMat);
      topBar.position.set(0, 0.88, 0);
      g.add(topBar);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.23, 0.15), postMat);
      stripe.position.set(0, 0.88, 0);
      g.add(stripe);
      return g;
    };

    for (let i = 0; i < 3; i++) {
      const h = buildHurdle();
      h.position.set(0, 0, -18 - i * 24);
      scene.add(h);
      hurdleGroupList.push({ mesh: h, hit: false });
    }

    // Water Station Arch approaching periodically
    const waterArch = buildWaterStation();
    waterArch.position.set(3.6, 0, -46);
    scene.add(waterArch);

    // Overhead station ribbon across player lane
    const ribbon = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.35, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 })
    );
    ribbon.position.set(-3.6, 2.5, 0);
    waterArch.add(ribbon);

    if (!studio.isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    let distAccum = 0;
    let lastDistReport = 0;

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

      if (!pausedRef.current) {
        const now = performance.now();
        const isBoosted = now < speedBoostUntilRef.current;
        const isStumbled = now < stumbleUntilRef.current;
        const staminaFactor = 0.55 + (staminaRef.current / 100) * 0.6;
        const runSpeed =
          (isBoosted ? 21 : isStumbled ? 7.5 : 14.5) * staminaFactor;

        distAccum += runSpeed * dt * 1.4;
        if (Math.floor(distAccum) > lastDistReport) {
          lastDistReport = Math.floor(distAccum);
          setDistanceM(lastDistReport);
        }

        // Scroll tartan running track texture & stadium arch
        trackTex.offset.y -= runSpeed * dt * 0.09;
        festivalArch.position.z += runSpeed * dt;
        if (festivalArch.position.z > 14) festivalArch.position.z -= 96;

        // Jump physics + dynamic sprint posture
        if (runnerYRef.current > 0 || jumpVelocityRef.current !== 0) {
          runnerYRef.current += jumpVelocityRef.current * dt;
          jumpVelocityRef.current -= 26 * dt;
          if (runnerYRef.current <= 0) {
            runnerYRef.current = 0;
            jumpVelocityRef.current = 0;
          }
        }
        playerRunner.position.y = runnerYRef.current;
        playerRunner.rotation.x = THREE.MathUtils.damp(
          playerRunner.rotation.x,
          isBoosted ? -0.18 : isStumbled ? 0.24 : -0.06,
          8,
          dt
        );

        // Animate articulated running limbs on player + both rival runners
        const animateRunner = (runner: THREE.Group, phaseOffset: number, speedMult: number, airborne: boolean) => {
          const stride = elapsed * speedMult + phaseOffset;
          const legL = runner.getObjectByName('legL');
          const legR = runner.getObjectByName('legR');
          const armL = runner.getObjectByName('armL');
          const armR = runner.getObjectByName('armR');
          if (legL && legR && armL && armR) {
            const amp = airborne ? 0.3 : 0.78;
            legL.rotation.x = Math.sin(stride) * amp;
            legR.rotation.x = -Math.sin(stride) * amp;
            armL.rotation.x = -Math.sin(stride) * amp * 0.85;
            armR.rotation.x = Math.sin(stride) * amp * 0.85;
          }
        };

        animateRunner(playerRunner, 0, isBoosted ? 16 : 11.5, runnerYRef.current > 0.1);
        animateRunner(rivalLeft, 1.2, 10.8, false);
        animateRunner(rivalRight, 2.5, 11.2, false);

        // Gentle rival oscillation
        rivalLeft.position.z = -1.8 + Math.sin(elapsed * 0.9) * 3.5;
        rivalRight.position.z = -3.2 + Math.cos(elapsed * 0.75) * 4.2;

        // Smooth damped camera tracking jump + wide/chase mode
        const wide = cameraModeRef.current === 'wide';
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          (wide ? 6.6 : 4.4) + runnerYRef.current * 0.35,
          5,
          dt
        );
        camera.position.z = THREE.MathUtils.damp(camera.position.z, wide ? 14.2 : 10.5, 4.5, dt);
        camera.lookAt(0, 1.3 + runnerYRef.current * 0.2, -14);

        // Scroll trees
        for (const t of trees) {
          t.position.z += runSpeed * dt;
          if (t.position.z > 14) t.position.z -= 192;
        }

        // Scroll hurdles & check jump clearance
        for (const h of hurdleGroupList) {
          h.mesh.position.z += runSpeed * dt;
          if (!h.hit && Math.abs(h.mesh.position.z - playerRunner.position.z) < 0.75) {
            if (runnerYRef.current < 0.65) {
              h.hit = true;
              stumbleUntilRef.current = performance.now() + 900;
              playWrongSound();
              setStamina((prev) => Math.max(25, prev - 10));
              setStatusBanner(
                '⚠️ Vấp rào chắn! Nhấn Space hoặc nút Nhảy sớm hơn một nhịp nhé!'
              );
            }
          }
          if (h.mesh.position.z > 12) {
            h.mesh.position.z -= 72;
            h.hit = false;
          }
        }

        // Move Water Station toward player
        waterArch.position.z += runSpeed * dt;
        if (waterArch.position.z >= playerRunner.position.z - 0.8) {
          waterArch.position.z = -46;
          if (queueRef.current.length > 0) {
            pausedRef.current = true;
            setActiveStation(queueRef.current[0]);
          }
        }
      }

      renderer.render(scene, camera);
      studio.scheduleNext(tick);
    };

    studio.scheduleNext(tick);
    return () => {
      window.removeEventListener('resize', handleResize);
      trackTex.dispose();
      studio.dispose();
    };
  }, [phase]);

  const handleStationResult = (isCorrect: boolean) => {
    if (!activeStation) return;
    const current = activeStation;
    setActiveStation(null);

    const rest = stationQueue.slice(1);
    const nextLog = [
      ...topicLog,
      {
        grade: current.question.grade,
        topic: current.question.topic,
        isCorrect,
      },
    ];
    setTopicLog(nextLog);

    if (isCorrect) {
      playCorrectSound();
      playBoostSound();
      const gained = current.isRetry ? 0.5 : 1.0;
      const nextRaw = rawScore + gained;
      const nextBottles = bottles + 1;
      const nextFirst = firstTryCorrect + (current.isRetry ? 0 : 1);
      const nextRetry = retryFixed + (current.isRetry ? 1 : 0);

      setRawScore(nextRaw);
      setBottles(nextBottles);
      setFirstTryCorrect(nextFirst);
      setRetryFixed(nextRetry);
      setStationsDone((p) => p + 1);
      setStamina(100);
      speedBoostUntilRef.current = performance.now() + 3500;
      setQueueAndCheckFinish(
        rest,
        nextRaw,
        nextFirst,
        nextRetry,
        nextBottles,
        nextLog,
        current.isRetry
          ? '💧 Sửa đúng câu quay lại (+0.5 điểm)! Nhận chai nước và lấy lại tốc độ!'
          : '💧 Chính xác (+1.0 điểm)! Nhận chai nước mát lành và bứt tốc khoẻ hơn!'
      );
    } else {
      playWrongSound();
      setStamina((prev) => Math.max(30, prev - 32));
      if (!current.isRetry) {
        // Wrong on 1st try -> tired, question returns at a later water station!
        const retryItem: StationQuestion = {
          uid: `${current.uid}-retry`,
          question: current.question,
          isRetry: true,
        };
        const insertAt = Math.min(2, rest.length);
        const nextQ = [...rest.slice(0, insertAt), retryItem, ...rest.slice(insertAt)];
        setStationQueue(nextQ);
        setStatusBanner(
          '😓 Trả lời sai nên hơi mệt (chạy chậm lại) — Câu này sẽ quay lại ở trạm nước sau (sửa đúng được 0.5 điểm)!'
        );
      } else {
        setStationsDone((p) => p + 1);
        setQueueAndCheckFinish(
          rest,
          rawScore,
          firstTryCorrect,
          retryFixed,
          bottles,
          nextLog,
          '😓 Chưa chính xác ở lượt sửa lại — Cố lên ở trạm nước tiếp theo nhé!'
        );
      }
    }
  };

  const setQueueAndCheckFinish = (
    nextQueue: StationQuestion[],
    nextRaw: number,
    nextFirst: number,
    nextRetry: number,
    nextBottles: number,
    nextLog: { grade: Grade; topic: string; isCorrect: boolean }[],
    msg: string
  ) => {
    setStationQueue(nextQueue);
    setStatusBanner(msg);
    if (nextQueue.length === 0) {
      finishFestival(nextRaw, nextFirst, nextRetry, nextBottles, elapsedSec, nextLog);
    }
  };

  const handleExportExcel = () => {
    const rowsHtml = finalStandings
      .map(
        (r, i) => `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td>${r.name}</td>
        <td style="text-align:center;">${matchClass}</td>
        <td style="text-align:center;">${r.firstTryCorrect}/${TOTAL_PRIMARY_STATIONS}</td>
        <td style="text-align:center;">${r.retryFixed}</td>
        <td style="text-align:center;">${r.bottles}</td>
        <td style="text-align:center;font-weight:bold;color:#059669;">${r.score10.toFixed(1)}</td>
        <td style="text-align:center;">${getGradeClassification(r.score10)}</td>
      </tr>`
      )
      .join('');

    const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
<meta charset="utf-8" />
<style>
  table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 13px; }
  th { background: #163A70; color: #ffffff; padding: 8px 12px; border: 1px solid #cbd5e1; }
  td { padding: 7px 12px; border: 1px solid #cbd5e1; }
</style>
</head>
<body>
  <h3>BẢNG THÀNH TÍCH HỘI KHOẺ TRI THỨC 3D – LỚP ${activeGrade} (TIN HỌC ${activeGrade})</h3>
  <table>
    <thead>
      <tr>
        <th>Hạng</th>
        <th>Họ và tên học sinh</th>
        <th>Lớp</th>
        <th>Đúng lần 1</th>
        <th>Sửa đúng (+0.5đ)</th>
        <th>Chai nước nhận được</th>
        <th>Điểm quy đổi (Thang 10)</th>
        <th>Xếp loại</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;

    const blob = new Blob(['\ufeff', html], {
      type: 'application/vnd.ms-excel;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BangDiem_HoiKhoeTriThuc_Lop_${matchClass}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
  };

  const liveScore10 = useMemo(
    () => Math.min(10, Math.round((rawScore / TOTAL_PRIMARY_STATIONS) * 100) / 10),
    [rawScore]
  );

  // ==================== LOBBY ====================
  if (phase === 'lobby') {
    return (
      <ClassroomLobby
        gameId="health-festival-3d"
        title={gameMeta.title}
        subtitle={gameMeta.subtitle}
        openButtonLabel="Mở sân vận động"
        heroImage={gameMeta.imageUrl}
        accentColor="#059669"
        grade={grade}
        defaultClassName={defaultClassName}
        defaultPlayerName={defaultPlayerName}
        onExit={onExit}
        onStartMatch={handleStartMatch}
      />
    );
  }

  // ==================== FINISHED PODIUM + EXCEL EXPORT ====================
  if (phase === 'finished') {
    return (
      <div className="max-w-4xl mx-auto bg-white rounded-3xl border border-[#DCE8F8] p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EDF4FC] pb-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center shrink-0">
              <Trophy className="w-7 h-7 text-[#059669]" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#059669]">
                Hội Khoẻ Tri Thức 3D · Lớp {activeGrade} · Tin học {activeGrade}
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#163A70]">
                Bảng thành tích cả lớp (Quy đổi thang điểm 10)
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-sm font-bold transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            Xuất tệp Excel (.xls)
          </button>
        </div>

        {/* Highlight Player Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-[#ECFDF5]">
            <div className="text-xs text-[#647899]">Điểm quy đổi thang 10</div>
            <div className="text-2xl font-extrabold text-[#059669] tabular-nums">
              {liveScore10.toFixed(1)}/10
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[#ECFAFF]">
            <div className="text-xs text-[#647899]">Chai nước nhận được</div>
            <div className="text-2xl font-extrabold text-[#0284C7] tabular-nums">
              💧 {bottles} chai
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[#FFF7E6]">
            <div className="text-xs text-[#647899]">Đúng lần 1 / Sửa lại</div>
            <div className="text-2xl font-extrabold text-[#D97706] tabular-nums">
              {firstTryCorrect} / +{retryFixed}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[#F5F3FF]">
            <div className="text-xs text-[#647899]">Quãng đường</div>
            <div className="text-2xl font-extrabold text-[#7C3AED] tabular-nums">
              {distanceM}m
            </div>
          </div>
        </div>

        {/* Full Class Table */}
        <div className="overflow-x-auto rounded-2xl border border-[#E4EDF9]">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#F4F9FF] text-xs font-bold text-[#163A70] border-b border-[#E4EDF9]">
                <th className="py-3 px-3 text-center">Hạng</th>
                <th className="py-3 px-3">Họ và tên</th>
                <th className="py-3 px-3 text-center">Đúng lần 1</th>
                <th className="py-3 px-3 text-center">Sửa (+0.5đ)</th>
                <th className="py-3 px-3 text-center">Chai nước</th>
                <th className="py-3 px-3 text-center">Điểm hệ 10</th>
                <th className="py-3 px-3 text-center">Xếp loại</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF4FC]">
              {finalStandings.map((row, idx) => (
                <tr
                  key={row.id}
                  className={row.isMe ? 'bg-[#ECFDF5] font-bold text-[#163A70]' : 'text-[#475569]'}
                >
                  <td className="py-2.5 px-3 text-center font-extrabold tabular-nums">
                    #{idx + 1}
                  </td>
                  <td className="py-2.5 px-3">
                    {row.name} {row.isMe && <span className="text-[#059669]">(Bạn)</span>}
                  </td>
                  <td className="py-2.5 px-3 text-center tabular-nums">
                    {row.firstTryCorrect}/{TOTAL_PRIMARY_STATIONS}
                  </td>
                  <td className="py-2.5 px-3 text-center tabular-nums">{row.retryFixed}</td>
                  <td className="py-2.5 px-3 text-center tabular-nums">💧 {row.bottles}</td>
                  <td className="py-2.5 px-3 text-center font-extrabold text-[#059669] tabular-nums">
                    {row.score10.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-3 text-center text-xs font-semibold">
                    {getGradeClassification(row.score10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => setPhase('lobby')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-sm font-bold"
          >
            <RotateCcw className="w-4 h-4" />
            Chạy giải mới
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

  // ==================== ACTIVE 3D CROSS-COUNTRY RUN ====================
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
            🏃 Hội Khoẻ Tri Thức · Lớp {matchClass}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3.5 text-xs font-bold tabular-nums">
          <span className="text-[#0284C7] inline-flex items-center gap-1">
            <Droplets className="w-3.5 h-3.5" />
            {bottles} chai nước
          </span>
          <span className="text-[#059669]">Điểm hệ 10: {liveScore10.toFixed(1)}</span>
          <span className="text-[#7C3AED]">Còn {stationQueue.length} trạm</span>
          <span className="text-[#163A70]">{distanceM}m</span>
          <button
            type="button"
            onClick={toggleMute}
            className="p-1.5 rounded-lg border border-[#DCE8F8] text-[#647899] hover:text-[#163A70]"
            aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 3D Stadium Viewport */}
      <div className="relative w-full h-[64vh] min-h-[380px] max-h-[560px] rounded-3xl overflow-hidden border border-[#A7F3D0] bg-[#BAE6FD]">
        <div ref={canvasMountRef} className="w-full h-full" />

        {/* Top HUD Overlay (no backdrop-blur over WebGL) */}
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-3 pointer-events-none">
          <div className="bg-white/95 border border-[#A7F3D0] rounded-xl px-3.5 py-2 shadow-sm max-w-md">
            <div className="text-xs font-bold text-[#163A70]">{statusBanner}</div>
            <div className="text-[11px] text-[#647899] mt-0.5">
              Đã qua {stationsDone} trạm nước · {elapsedSec}s
            </div>
          </div>

          <div className="bg-white/95 border border-[#A7F3D0] rounded-xl px-3.5 py-2 shadow-sm min-w-[165px]">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#163A70] mb-1">
              <span className="inline-flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-[#F59E0B]" />
                Thể lực
              </span>
              <span className="tabular-nums">{stamina}%</span>
            </div>
            <div className="h-2 bg-[#E2F6EE] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${stamina}%`,
                  backgroundColor:
                    stamina >= 65 ? '#10B981' : stamina >= 40 ? '#F59E0B' : '#EF4444',
                }}
              />
            </div>
          </div>
        </div>

        {/* Collapsible Bottom Jump + Fast Station Control Dock */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCameraMode((m) => (m === 'chase' ? 'wide' : 'chase'))}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/95 border border-[#A7F3D0] text-[11px] font-bold text-[#163A70] hover:bg-[#ECFDF5] shadow-sm"
            >
              <Camera className="w-3.5 h-3.5 text-[#059669]" />
              {cameraMode === 'chase' ? 'Góc nhìn toàn sân' : 'Góc nhìn sát đường chạy'}
            </button>
            <button
              type="button"
              onClick={() => setDockCollapsed((c) => !c)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/95 border border-[#A7F3D0] text-[11px] font-bold text-[#475569] hover:text-[#163A70] shadow-sm"
            >
              {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {dockCollapsed ? 'Mở điều khiển' : 'Thu gọn'}
            </button>
          </div>

          {!dockCollapsed && (
            <div className="flex items-center gap-2.5 bg-white/95 border border-[#A7F3D0] rounded-2xl px-4 py-2.5 shadow-md">
              <button
                type="button"
                onClick={triggerJump}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] active:scale-95 text-white text-sm font-extrabold transition-all"
              >
                <ArrowUp className="w-4 h-4" />
                Nhảy vượt rào (Space)
              </button>

              {stationQueue.length > 0 && !activeStation && (
                <button
                  type="button"
                  onClick={() => setActiveStation(stationQueue[0])}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#ECFAFF] hover:bg-[#DBEAFE] border border-[#BAE6FD] text-[#0284C7] text-xs font-bold transition-colors whitespace-nowrap"
                >
                  <Droplets className="w-4 h-4" />
                  Vào Trạm Nước ngay
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 1-Screen Compact Water Station Question Modal */}
      {activeStation && (
        <CompactQuestionModal
          mode="mcq"
          question={activeStation.question}
          badgeText={
            activeStation.isRetry
              ? '💧 Trạm Nước – Câu quay lại (Sửa đúng được +0.5 điểm!)'
              : `💧 Trạm Nước #${stationsDone + 1} – Trả lời đúng nhận chai nước (+1.0 điểm)`
          }
          accentColor="#059669"
          onResult={(res) => handleStationResult(res.isCorrect)}
        />
      )}
    </div>
  );
}
