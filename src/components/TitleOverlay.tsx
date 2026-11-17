import { Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import type { GameMode, PersistedStats } from '../game/types.ts';

interface TitleOverlayProps {
  editionNumber: number;
  dateKey: string;
  selectedMode: GameMode;
  stats: PersistedStats;
  onSelectMode: (mode: GameMode) => void;
  onStartGame: () => void;
  onViewTodayProof: () => void;
  onToggleMute: () => void;
}

export function TitleOverlay({
  editionNumber,
  dateKey,
  selectedMode,
  stats,
  onSelectMode,
  onStartGame,
  onViewTodayProof,
  onToggleMute,
}: TitleOverlayProps) {
  const [imgError, setImgError] = useState(false);
  const dailyDone = Boolean(stats.todayRecord);

  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-between p-6 md:p-10 pointer-events-none">
      {/* Subtle risograph studio illustration backdrop */}
      {!imgError && (
        <img
          src="/src/assets/images/title_riso_backdrop_1794945714448.jpg"
          alt="Risograph paper-cut studio desk"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="absolute inset-0 w-full h-full object-cover opacity-28 pointer-events-none select-none"
        />
      )}

      {/* Top quiet edition metadata + sound control */}
      <div className="relative z-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-xs font-mono text-[#4A4640] tabular-nums">
          <span>Edition #{editionNumber}</span>
          <span aria-hidden="true">·</span>
          <span>{dateKey}</span>
          <span aria-hidden="true">·</span>
          <span>Streak {stats.currentStreak}</span>
          {stats.bestScore > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>Best {stats.bestScore}</span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={stats.muted ? 'Unmute audio' : 'Mute audio'}
          className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-md border border-[#1E1D1B]/20 bg-[#F4EFE6]/90 text-xs font-medium text-[#1E1D1B] hover:border-[#1E1D1B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {stats.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          <span>{stats.muted ? 'Muted' : 'Sound On'}</span>
        </button>
      </div>

      {/* Main focal lockup anchored on left calm negative space */}
      <div className="relative z-10 max-w-lg my-auto pointer-events-auto">
        {/* Bespoke inline SVG letterpress title lockup */}
        <svg
          viewBox="0 0 460 112"
          className="w-full max-w-[440px] h-auto mb-4 overflow-visible"
          role="img"
          aria-label="PAPERWEIGHT"
        >
          {/* Offset risograph registration shadow */}
          <g transform="translate(3, 3)" opacity="0.22">
            <polygon points="18,86 38,50 58,86" fill="#1F5CA8" />
            <rect x="6" y="42" width="64" height="8" rx="2" fill="#E84A38" />
            <text
              x="86"
              y="72"
              fontFamily="Fraunces, Georgia, serif"
              fontWeight="700"
              fontSize="44"
              letterSpacing="-1"
              fill="#1F5CA8"
            >
              PAPERWEIGHT
            </text>
          </g>
          {/* Crisp charcoal ink print */}
          <g>
            <polygon
              points="18,86 38,50 58,86"
              fill="#B8863B"
              stroke="#1E1D1B"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <rect
              x="6"
              y="42"
              width="64"
              height="8"
              rx="2"
              transform="rotate(-7 38 46)"
              fill="#E84A38"
              stroke="#1E1D1B"
              strokeWidth="2"
            />
            <circle cx="38" cy="46" r="4" fill="#F4EFE6" stroke="#1E1D1B" strokeWidth="2" />
            <text
              x="86"
              y="72"
              fontFamily="Fraunces, Georgia, serif"
              fontWeight="700"
              fontSize="44"
              letterSpacing="-1"
              fill="#1E1D1B"
            >
              PAPERWEIGHT
            </text>
          </g>
          <text
            x="88"
            y="96"
            fontFamily="Plus Jakarta Sans, sans-serif"
            fontWeight="600"
            fontSize="13.5"
            fill="#4A4640"
          >
            Daily Risograph Balance &amp; Scissor-Snip Arcade
          </text>
        </svg>

        <p className="text-[15px] leading-relaxed text-[#383530] mb-6 max-w-md">
          Drop interlocking paper-cut shapes onto a live brass counterweight beam, lock 5 press tiers, and slice tipping overhangs in half before the tower topples.
        </p>

        {/* Mode selector segmented control */}
        <div className="inline-flex items-center p-1 rounded-lg border border-[#1E1D1B]/18 bg-[#E6DFD3]/90 mb-5">
          <button
            type="button"
            onClick={() => onSelectMode('DAILY')}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              selectedMode === 'DAILY'
                ? 'bg-[#1E1D1B] text-[#F4EFE6]'
                : 'text-[#4A4640] hover:text-[#1E1D1B]'
            }`}
          >
            Daily Edition #{editionNumber}
          </button>
          <button
            type="button"
            onClick={() => onSelectMode('FREE_PRESS')}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              selectedMode === 'FREE_PRESS'
                ? 'bg-[#1E1D1B] text-[#F4EFE6]'
                : 'text-[#4A4640] hover:text-[#1E1D1B]'
            }`}
          >
            Free Press (Endless)
          </button>
        </div>

        {/* Primary CTA row */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {selectedMode === 'DAILY' && dailyDone ? (
            <>
              <button
                type="button"
                onClick={onViewTodayProof}
                className="px-6 py-3 rounded-md bg-[#1F5CA8] text-[#F4EFE6] text-sm font-semibold border border-[#1E1D1B] hover:bg-[#194B8A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                View Today&apos;s Proof
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectMode('FREE_PRESS');
                  onStartGame();
                }}
                className="px-5 py-3 rounded-md bg-[#F4EFE6] text-[#1E1D1B] text-sm font-semibold border border-[#1E1D1B] hover:bg-[#E6DFD3] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Play Free Press
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onStartGame}
              className="px-7 py-3 rounded-md bg-[#E84A38] text-[#FFFDF9] text-sm font-semibold border border-[#1E1D1B] shadow-[3px_3px_0px_#1E1D1B] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_#1E1D1B] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              Start Game
            </button>
          )}
        </div>

        {/* Clean 3-verb craft summary (no pill boxes) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-[#4A4640]">
          <span>1. Drop &amp; Counterbalance</span>
          <span aria-hidden="true">·</span>
          <span>2. Lock Registration Tiers</span>
          <span aria-hidden="true">·</span>
          <span>3. Snip Overhangs (3 Blades)</span>
        </div>
      </div>

      {/* Bottom single flat control-hint line */}
      <div className="relative z-10 flex items-center justify-between text-xs font-mono text-[#4A4640]">
        <span>A/D or Drag Move · Q/E Rotate · Space Drop · X Snip · Esc Pause</span>
      </div>
    </div>
  );
}
