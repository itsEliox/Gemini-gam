import { ArrowDownToLine, Pause, RotateCcw, RotateCw, Scissors, Volume2, VolumeX } from 'lucide-react';
import type { HudSnapshot } from '../game/types.ts';

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onDrop: () => void;
  onToggleSnip: () => void;
}

export function GameHud({
  hud,
  muted,
  onToggleMute,
  onPause,
  onRotateLeft,
  onRotateRight,
  onDrop,
  onToggleSnip,
}: GameHudProps) {
  const tiltSign = hud.tiltDeg >= 0 ? '+' : '-';
  const formattedTilt = `${tiltSign}${Math.abs(hud.tiltDeg).toFixed(1).padStart(4, '0')}°`;

  const zoneColor =
    hud.balanceZone === 'LEVEL'
      ? 'text-[#1A7F64]'
      : hud.balanceZone === 'LEANING'
      ? 'text-[#B87A0A]'
      : 'text-[#E84A38]';

  const modeLabel =
    hud.mode === 'DAILY' ? `Daily #${hud.editionNumber}` : 'Free Press';

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-5">
      {/* Top Perimeter Status Strip */}
      <div className="flex items-start justify-between gap-4">
        {/* Left: Edition, Tier & Reserve Sheets */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-[#1E1D1B]">
            <span className="font-mono font-bold">{modeLabel}</span>
            <span aria-hidden="true" className="text-[#857D71]">·</span>
            <span className="tabular-nums">
              Tier {hud.tierIndex + 1}/{hud.totalTiers}
            </span>
            <span aria-hidden="true" className="text-[#857D71]">·</span>
            <span className="tabular-nums">
              Sheet {Math.min(hud.tierPlaced + (hud.activePiece ? 1 : 0), hud.tierQuota)}/{hud.tierQuota}
            </span>
            <span aria-hidden="true" className="text-[#857D71]">·</span>
            <span className="tabular-nums text-[#4A4640]">
              Reserves {hud.reserveSheets}/{hud.maxReserveSheets}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#1F5CA8]">
            <span>{hud.targetLabel}</span>
            {hud.targetMet && (
              <span className="font-bold text-[#1A7F64]">· MARK MET ★</span>
            )}
            {hud.windState !== 'CALM' && (
              <span className="text-[#1F5CA8] font-bold">
                · {hud.windLabel} {hud.windDirection > 0 ? '→' : '←'}
              </span>
            )}
          </div>
        </div>

        {/* Center: Live Equilibrium Readout */}
        <div className="hidden sm:flex flex-col items-center">
          <div className="flex items-baseline gap-2 font-mono">
            <span className={`text-lg font-bold tabular-nums ${zoneColor}`}>
              {formattedTilt}
            </span>
            <span className={`text-xs font-bold tracking-wide ${zoneColor}`}>
              {hud.balanceZone}
            </span>
          </div>
          {hud.dangerRatio > 0.04 && (
            <div className="w-28 h-1.5 bg-[#E6DFD3] rounded-full overflow-hidden mt-1 border border-[#1E1D1B]/20">
              <div
                className="h-full bg-[#E84A38] transition-[width] duration-75"
                style={{ width: `${Math.round(hud.dangerRatio * 100)}%` }}
              />
            </div>
          )}
          {hud.settleProgress > 0.05 && hud.dangerRatio <= 0.04 && (
            <div className="w-28 h-1.5 bg-[#E6DFD3] rounded-full overflow-hidden mt-1 border border-[#1E1D1B]/20">
              <div
                className="h-full bg-[#1A7F64] transition-[width] duration-75"
                style={{ width: `${Math.round(hud.settleProgress * 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Right: Score, Mute, Pause */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="mr-2 text-right">
            <div className="text-[11px] font-mono text-[#5B564E]">SCORE</div>
            <div className="text-base md:text-lg font-mono font-bold tabular-nums text-[#1E1D1B] leading-none">
              {hud.score}
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="w-10 h-10 flex items-center justify-center rounded-md border border-[#1E1D1B]/25 bg-[#F4EFE6]/90 text-[#1E1D1B] hover:border-[#1E1D1B] transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onPause}
            aria-label="Pause game"
            className="w-10 h-10 flex items-center justify-center rounded-md border border-[#1E1D1B]/25 bg-[#F4EFE6]/90 text-[#1E1D1B] hover:border-[#1E1D1B] transition-colors cursor-pointer"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Transient non-blocking banner */}
      {hud.statusBanner && (
        <div className="self-center px-4 py-1.5 rounded border border-[#1E1D1B] bg-[#F4EFE6] text-xs font-mono font-bold text-[#E84A38] shadow-[2px_2px_0px_#1E1D1B]">
          {hud.statusBanner}
        </div>
      )}

      {/* Bottom Perimeter: Active Piece Queue & Tactile Controls */}
      <div className="flex items-end justify-between gap-4">
        {/* Left: Current & Next Piece Info (unboxed crisp metadata) */}
        <div className="text-xs text-[#383530] space-y-1">
          {hud.activePiece ? (
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-2.5 h-2.5 rounded-xs border border-[#1E1D1B]"
                style={{ backgroundColor: hud.activePiece.fillColor }}
              />
              <span className="font-semibold text-[#1E1D1B]">{hud.activePiece.name}</span>
              <span className="font-mono text-[#5B564E] tabular-nums">
                {hud.activePiece.weightTag} · {hud.activePieceAngleDeg}°
              </span>
            </div>
          ) : (
            <div className="font-mono text-[#1A7F64] font-semibold">
              Hold steady to lock tier...
            </div>
          )}

          {hud.nextPieces.length > 0 && (
            <div className="text-[11px] font-mono text-[#5B564E]">
              Next: {hud.nextPieces.map((p) => `${p.name} (${p.weightTag})`).join(' · ')}
            </div>
          )}
        </div>

        {/* Right: Tactile Action Buttons (Touch + Click parity) */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={onRotateLeft}
            disabled={!hud.activePiece || hud.snipMode}
            title="Rotate Left (Q)"
            className="h-10 px-3 flex items-center gap-1.5 rounded-md border border-[#1E1D1B] bg-[#F4EFE6] text-xs font-semibold text-[#1E1D1B] hover:bg-[#E6DFD3] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Q</span>
          </button>

          <button
            type="button"
            onClick={onRotateRight}
            disabled={!hud.activePiece || hud.snipMode}
            title="Rotate Right (E)"
            className="h-10 px-3 flex items-center gap-1.5 rounded-md border border-[#1E1D1B] bg-[#F4EFE6] text-xs font-semibold text-[#1E1D1B] hover:bg-[#E6DFD3] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">E</span>
          </button>

          <button
            type="button"
            onClick={onDrop}
            disabled={!hud.canDrop}
            title="Drop Piece (Space)"
            className="h-10 px-4 flex items-center gap-1.5 rounded-md border border-[#1E1D1B] bg-[#1E1D1B] text-xs font-semibold text-[#F4EFE6] hover:bg-[#34322E] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Drop</span>
          </button>

          <button
            type="button"
            onClick={onToggleSnip}
            disabled={hud.snipsRemaining <= 0 && !hud.snipMode}
            title="Scissor Snip Tool (X)"
            className={`h-10 px-3.5 flex items-center gap-1.5 rounded-md border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              hud.snipMode
                ? 'border-[#1E1D1B] bg-[#E84A38] text-[#FFFDF9] shadow-[2px_2px_0px_#1E1D1B]'
                : 'border-[#1E1D1B] bg-[#F4EFE6] text-[#1E1D1B] hover:bg-[#E6DFD3] disabled:opacity-40'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span className="tabular-nums">
              {hud.snipMode ? 'Cancel Snip' : `Snip (${hud.snipsRemaining})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
