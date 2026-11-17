import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud.tsx';
import { ProofModal } from './components/ProofModal.tsx';
import { TitleOverlay } from './components/TitleOverlay.tsx';
import { soundFX } from './game/audio.ts';
import { getDailyEditionInfo } from './game/seed.ts';
import { PaperweightSimulation } from './game/simulation.ts';
import { loadPersistedStats, recordRunResult, saveMutedPref } from './game/storage.ts';
import type { GameMode, GameState, HudSnapshot, PersistedStats, RunSummary } from './game/types.ts';

export default function App() {
  const dailyInfo = getDailyEditionInfo();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<PaperweightSimulation | null>(null);

  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [selectedMode, setSelectedMode] = useState<GameMode>('DAILY');
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [stats, setStats] = useState<PersistedStats>(() => {
    const initial = loadPersistedStats(dailyInfo.dateKey);
    soundFX.setMuted(initial.muted);
    return initial;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sim = new PaperweightSimulation(canvas, {
      onHudUpdate: (snapshot) => setHud(snapshot),
      onStateChange: (nextState) => setGameState(nextState),
      onRunEnd: (summary) => {
        setRunSummary(summary);
        const updated = recordRunResult(summary, dailyInfo.dateKey);
        setStats(updated);
      },
    });

    simRef.current = sim;
    sim.start();

    const onKeyDown = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (simRef.current) {
        if (e.code === 'Enter' || e.code === 'Space') {
          // Allow keyboard Start from Title Screen if daily isn't locked out
        }
        simRef.current.handleKeyDown(e.code);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      simRef.current?.handleKeyUp(e.code);
    };

    const onBlur = () => {
      simRef.current?.clearHeldInputs();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      sim.destroy();
      simRef.current = null;
    };
  }, [dailyInfo.dateKey]);

  const handleStartGame = useCallback(
    (modeOverride?: GameMode) => {
      const modeToStart = modeOverride ?? selectedMode;
      setRunSummary(null);
      simRef.current?.startNewRun(modeToStart);
    },
    [selectedMode]
  );

  // Support Enter/Space to start on Title Screen
  useEffect(() => {
    if (gameState !== 'TITLE_MENU') return;
    const onTitleKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        if (selectedMode === 'DAILY' && stats.todayRecord) {
          setRunSummary(stats.todayRecord.summary);
          setGameState(stats.todayRecord.victory ? 'VICTORY' : 'GAME_OVER');
        } else {
          handleStartGame();
        }
      }
    };
    window.addEventListener('keydown', onTitleKey);
    return () => window.removeEventListener('keydown', onTitleKey);
  }, [gameState, selectedMode, stats.todayRecord, handleStartGame]);

  const handleToggleMute = () => {
    const nextMuted = !stats.muted;
    soundFX.setMuted(nextMuted);
    saveMutedPref(nextMuted);
    setStats((prev) => ({ ...prev, muted: nextMuted }));
  };

  const handleViewTodayProof = () => {
    if (!stats.todayRecord) return;
    setRunSummary(stats.todayRecord.summary);
    setGameState(stats.todayRecord.victory ? 'VICTORY' : 'GAME_OVER');
  };

  return (
    <main
      className="relative w-full h-[100dvh] overflow-hidden bg-[#F4EFE6]"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Isolated 60fps Canvas Container */}
      <canvas
        ref={canvasRef}
        onPointerMove={(e) => simRef.current?.handlePointerMove(e.clientX, e.clientY)}
        onPointerDown={(e) => simRef.current?.handlePointerDown(e.clientX, e.clientY, e.button)}
        onPointerUp={() => simRef.current?.handlePointerUp()}
        onWheel={(e) => simRef.current?.handleWheel(e.deltaY)}
        className={`block w-full h-full ${
          gameState === 'PLAYING' && hud?.snipMode ? 'cursor-crosshair' : 'cursor-default'
        }`}
      />

      {gameState === 'TITLE_MENU' && (
        <TitleOverlay
          editionNumber={dailyInfo.editionNumber}
          dateKey={dailyInfo.dateKey}
          selectedMode={selectedMode}
          stats={stats}
          onSelectMode={setSelectedMode}
          onStartGame={() => handleStartGame()}
          onViewTodayProof={handleViewTodayProof}
          onToggleMute={handleToggleMute}
        />
      )}

      {(gameState === 'PLAYING' || gameState === 'PAUSED') && hud && (
        <GameHud
          hud={hud}
          muted={stats.muted}
          onToggleMute={handleToggleMute}
          onPause={() => simRef.current?.togglePause()}
          onRotateLeft={() => simRef.current?.rotateActivePiece(-30)}
          onRotateRight={() => simRef.current?.rotateActivePiece(30)}
          onDrop={() => simRef.current?.triggerDrop()}
          onToggleSnip={() => simRef.current?.toggleSnipMode()}
        />
      )}

      {(gameState === 'PAUSED' || gameState === 'VICTORY' || gameState === 'GAME_OVER') && (
        <ProofModal
          gameState={gameState}
          summary={runSummary}
          stats={stats}
          onResume={() => simRef.current?.togglePause()}
          onRestart={() => handleStartGame(runSummary?.mode ?? selectedMode)}
          onPlayFreePress={() => {
            setSelectedMode('FREE_PRESS');
            handleStartGame('FREE_PRESS');
          }}
          onExitToTitle={() => {
            setRunSummary(null);
            simRef.current?.setGameState('TITLE_MENU');
          }}
        />
      )}
    </main>
  );
}
