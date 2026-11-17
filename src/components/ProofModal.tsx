import { Check, Copy, Play, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { GameState, PersistedStats, PieceOutcome, RunSummary } from '../game/types.ts';

interface ProofModalProps {
  gameState: Extract<GameState, 'PAUSED' | 'VICTORY' | 'GAME_OVER'>;
  summary: RunSummary | null;
  stats: PersistedStats;
  onResume: () => void;
  onRestart: () => void;
  onPlayFreePress: () => void;
  onExitToTitle: () => void;
}

function outcomeToEmoji(o: PieceOutcome): string {
  switch (o) {
    case 'level':
      return '🟩';
    case 'lean':
      return '🟨';
    case 'critical':
      return '🟥';
    case 'snipped':
      return '✂️';
    case 'dropped':
      return '⬇️';
    case 'toppled':
      return '💥';
  }
}

function buildShareText(summary: RunSummary): string {
  const header =
    summary.mode === 'DAILY'
      ? `PAPERWEIGHT #${summary.editionNumber}`
      : `PAPERWEIGHT Free Press`;
  const stamp = summary.victory
    ? `PRESSED ${summary.tiersLocked}/${summary.totalTiers}`
    : `TOPPLED at Tier ${Math.min(summary.tiersLocked + 1, summary.totalTiers)}`;

  const stars = summary.tierStars.map((hit) => (hit ? '★' : '☆')).join('');
  const strip = summary.pieceLog.slice(0, 18).map(outcomeToEmoji).join('');

  return [
    `${header} — ${stamp}`,
    `Score: ${summary.score} · Avg Tilt: ${summary.avgTiltDeg}° · Snips: ${summary.snipsUsed}/${summary.maxSnips}`,
    stars ? `Marks: ${stars}` : '',
    strip || '💥',
  ]
    .filter(Boolean)
    .join('\n');
}

export function ProofModal({
  gameState,
  summary,
  stats,
  onResume,
  onRestart,
  onPlayFreePress,
  onExitToTitle,
}: ProofModalProps) {
  const [copied, setCopied] = useState(false);

  if (gameState === 'PAUSED') {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#1E1D1B]/35 p-4">
        <div className="w-full max-w-sm rounded-lg border-2 border-[#1E1D1B] bg-[#F4EFE6] p-6 shadow-[6px_6px_0px_#1E1D1B]">
          <h2 className="font-display text-2xl font-bold text-[#1E1D1B] mb-1">
            Press Paused
          </h2>
          <p className="text-sm text-[#4A4640] mb-6">
            The brass fulcrum is held steady. Resume when ready.
          </p>
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="w-full py-2.5 px-4 rounded-md bg-[#E84A38] text-[#FFFDF9] text-sm font-semibold border border-[#1E1D1B] flex items-center justify-center gap-2 hover:bg-[#D23D2C] transition-colors cursor-pointer"
            >
              <Play className="w-4 h-4" />
              <span>Resume</span>
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-2.5 px-4 rounded-md bg-[#E6DFD3] text-[#1E1D1B] text-sm font-semibold border border-[#1E1D1B] flex items-center justify-center gap-2 hover:bg-[#D8C7AE] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Restart</span>
            </button>
            <button
              type="button"
              onClick={onExitToTitle}
              className="w-full py-2 px-4 rounded-md text-sm font-medium text-[#4A4640] hover:text-[#1E1D1B] transition-colors cursor-pointer"
            >
              Back to Title
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const shareText = buildShareText(summary);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback copy unavailable in restricted context
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#1E1D1B]/40 p-4">
      <div className="w-full max-w-md rounded-lg border-2 border-[#1E1D1B] bg-[#F4EFE6] p-6 md:p-7 shadow-[6px_6px_0px_#1E1D1B]">
        {/* Header & Edition Stamp */}
        <div className="flex items-start justify-between gap-4 border-b border-[#1E1D1B]/15 pb-4 mb-5">
          <div>
            <div className="text-xs font-mono text-[#5B564E]">
              {summary.mode === 'DAILY'
                ? `DAILY EDITION #${summary.editionNumber} · ${summary.dateKey}`
                : 'FREE PRESS EDITION'}
            </div>
            <h2 className="font-display text-3xl font-bold text-[#1E1D1B] mt-0.5">
              {summary.victory ? 'Print Proof Pressed' : 'Tower Toppled'}
            </h2>
            <p className="text-xs text-[#4A4640] mt-1">{summary.endReason}</p>
          </div>

          <div
            className={`px-2.5 py-1 border-2 font-mono text-xs font-bold tracking-wider uppercase rotate-[-4deg] shrink-0 ${
              summary.victory
                ? 'border-[#1A7F64] text-[#1A7F64]'
                : 'border-[#E84A38] text-[#E84A38]'
            }`}
          >
            {summary.victory ? 'PRESSED' : 'TOPPLED'}
          </div>
        </div>

        {/* 4 Key Telemetry Metrics */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div>
            <div className="text-[11px] font-mono text-[#5B564E]">SCORE</div>
            <div className="text-lg font-mono font-bold tabular-nums text-[#1E1D1B]">
              {summary.score}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-mono text-[#5B564E]">TIERS</div>
            <div className="text-lg font-mono font-bold tabular-nums text-[#1E1D1B]">
              {summary.tiersLocked}/{summary.totalTiers}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-mono text-[#5B564E]">AVG TILT</div>
            <div className="text-lg font-mono font-bold tabular-nums text-[#1E1D1B]">
              {summary.avgTiltDeg}°
            </div>
          </div>
          <div>
            <div className="text-[11px] font-mono text-[#5B564E]">STREAK</div>
            <div className="text-lg font-mono font-bold tabular-nums text-[#1E1D1B]">
              {stats.currentStreak}
            </div>
          </div>
        </div>

        {/* Visual Print Proof Strip */}
        <div className="rounded-md border border-[#1E1D1B]/20 bg-[#EDE6D8] p-3.5 mb-5">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#5B564E] mb-2">
            <span>PRINT PROOF STRIP</span>
            <span>
              Peak Clutch {summary.peakTiltDeg}° · Snips {summary.snipsUsed}/{summary.maxSnips}
            </span>
          </div>
          <div className="text-base tracking-widest leading-relaxed break-all">
            {summary.pieceLog.length > 0
              ? summary.pieceLog.slice(0, 18).map(outcomeToEmoji).join('')
              : '💥'}
          </div>
          {summary.tierStars.length > 0 && (
            <div className="mt-2 text-xs font-mono text-[#1F5CA8]">
              Registration Marks: {summary.tierStars.map((h) => (h ? '★' : '☆')).join(' ')}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 py-2.5 px-4 rounded-md bg-[#1F5CA8] text-[#FFFDF9] text-sm font-semibold border border-[#1E1D1B] flex items-center justify-center gap-2 hover:bg-[#194B8A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied Proof Card' : 'Copy Proof Card'}</span>
          </button>

          {summary.mode === 'DAILY' ? (
            <button
              type="button"
              onClick={onPlayFreePress}
              className="py-2.5 px-4 rounded-md bg-[#E84A38] text-[#FFFDF9] text-sm font-semibold border border-[#1E1D1B] hover:bg-[#D23D2C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Play Free Press
            </button>
          ) : (
            <button
              type="button"
              onClick={onRestart}
              className="py-2.5 px-4 rounded-md bg-[#E84A38] text-[#FFFDF9] text-sm font-semibold border border-[#1E1D1B] hover:bg-[#D23D2C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Play Again
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onExitToTitle}
          className="w-full mt-3 py-1.5 text-xs font-medium text-[#4A4640] hover:text-[#1E1D1B] transition-colors cursor-pointer"
        >
          Return to Title
        </button>
      </div>
    </div>
  );
}
