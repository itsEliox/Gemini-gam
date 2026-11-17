export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'GAME_OVER';

export type GameMode = 'DAILY' | 'FREE_PRESS';

export type PieceArchetype =
  | 'KRAFT_BLOCK'
  | 'LEAD_SLUG'
  | 'ACCORDION'
  | 'CRESCENT_ARCH'
  | 'ORIGAMI_MOTH'
  | 'BRASS_PIN';

export type BalanceZone = 'LEVEL' | 'LEANING' | 'CRITICAL';

export type PieceOutcome = 'level' | 'lean' | 'critical' | 'snipped' | 'dropped' | 'toppled';

export type RegistrationTargetType = 'HEIGHT' | 'SPAN';

export interface Vec2 {
  x: number;
  y: number;
}

export interface PieceBlueprint {
  id: string;
  archetype: PieceArchetype;
  name: string;
  weightTag: string;
  fillColor: string;
  shadeColor: string;
  strokeColor: string;
  halftoneColor: string;
  density: number;
  restitution: number;
  friction: number;
  frictionAir: number;
  windFactor: number;
  /** Convex polygon parts in local piece space (centered near 0,0) */
  parts: Vec2[][];
}

export interface TierSpec {
  tierNumber: number;
  title: string;
  targetType: RegistrationTargetType;
  /** Height in px above beam surface (for HEIGHT) or half-span in px from center (for SPAN) */
  targetValue: number;
  /** Peak crosswind force factor (-1..1, 0 = calm) */
  windStrength: number;
  pieces: PieceBlueprint[];
}

export interface LockedSpecimen {
  tierNumber: number;
  tiltDeg: number;
  registrationHit: boolean;
  silhouettes: {
    vertices: Vec2[];
    fillColor: string;
    strokeColor: string;
  }[];
}

export interface HudSnapshot {
  mode: GameMode;
  editionNumber: number;
  dateKey: string;
  score: number;
  tierIndex: number;
  totalTiers: number;
  tierTitle: string;
  tierPlaced: number;
  tierQuota: number;
  targetType: RegistrationTargetType;
  targetLabel: string;
  targetMet: boolean;
  settleProgress: number; // 0..1
  tiltDeg: number;
  balanceZone: BalanceZone;
  dangerRatio: number; // 0..1
  snipsRemaining: number;
  maxSnips: number;
  snipMode: boolean;
  reserveSheets: number;
  maxReserveSheets: number;
  activePiece: PieceBlueprint | null;
  activePieceAngleDeg: number;
  nextPieces: PieceBlueprint[];
  windState: 'CALM' | 'WINDUP' | 'GUSTING';
  windDirection: -1 | 1;
  windLabel: string;
  canDrop: boolean;
  statusBanner: string | null;
}

export interface RunSummary {
  mode: GameMode;
  editionNumber: number;
  dateKey: string;
  victory: boolean;
  score: number;
  tiersLocked: number;
  totalTiers: number;
  piecesPlaced: number;
  totalPieces: number;
  snipsUsed: number;
  maxSnips: number;
  avgTiltDeg: number;
  peakTiltDeg: number;
  registrationHits: number;
  pieceLog: PieceOutcome[];
  tierStars: boolean[];
  endReason: string;
}

export interface DailyRecord {
  dateKey: string;
  editionNumber: number;
  victory: boolean;
  score: number;
  tiersLocked: number;
  summary: RunSummary;
}

export interface PersistedStats {
  muted: boolean;
  currentStreak: number;
  bestStreak: number;
  bestScore: number;
  gamesPlayed: number;
  lastDailyDateKey: string | null;
  todayRecord: DailyRecord | null;
}
