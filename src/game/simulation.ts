import Matter from 'matter-js';
import { soundFX } from './audio.ts';
import { generateDailyTiers, generateFreePressTier } from './pieces.ts';
import { polygonArea, polygonCentroid, sliceBodyParts } from './polygonSlicer.ts';
import { createRng, getDailyEditionInfo } from './seed.ts';
import type {
  BalanceZone,
  GameMode,
  GameState,
  HudSnapshot,
  LockedSpecimen,
  PieceBlueprint,
  PieceOutcome,
  RunSummary,
  TierSpec,
  Vec2,
} from './types.ts';

const { Engine, World, Bodies, Body, Constraint, Events } = Matter;

export const LOGICAL_W = 1000;
export const LOGICAL_H = 720;

const RAIL_Y = 92;
const GRIPPER_Y = 136;
const RAIL_LIMIT_X = 205;
const PIVOT_X = 0;
const PIVOT_Y = 492;
const BEAM_WIDTH = 460;
const BEAM_HEIGHT = 22;
const MAX_SAFE_TILT_DEG = 22;
const CRITICAL_HOLD_LIMIT_S = 1.45;
const TIER_LOCK_HOLD_S = 0.85;
const MAX_SNIPS = 3;
const MAX_RESERVE_SHEETS = 3;

interface ActivePieceEntity {
  body: Matter.Body;
  blueprint: PieceBlueprint;
  /** Local convex parts relative to body centroid for crisp custom rendering & slicing */
  localParts: Vec2[][];
  isSnipScrap: boolean;
  hasTouchedBeam: boolean;
  squashScale: number;
  hitFlash: number;
  spawnedAt: number;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vRot: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  shape: 'dot' | 'scrap';
}

interface FloatingStamp {
  text: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

interface MobileHangNode {
  anchorX: number;
  anchorY: number;
  rodLen: number;
  angle: number;
  vel: number;
  color: string;
  size: number;
  shape: 'circle' | 'triangle' | 'arch' | 'diamond';
}

export interface SimulationCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onRunEnd: (summary: RunSummary) => void;
  onStateChange: (state: GameState) => void;
}

export class PaperweightSimulation {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: SimulationCallbacks;

  private engine: Matter.Engine;
  private beam!: Matter.Body;
  private pivotConstraint!: Matter.Constraint;

  private rafId: number | null = null;
  private lastFrameTime = 0;
  private accumulator = 0;

  private gameState: GameState = 'TITLE_MENU';
  private mode: GameMode = 'DAILY';
  private editionNumber = 1;
  private dateKey = '';

  private tiers: TierSpec[] = [];
  private freePressRng: () => number = createRng(1);
  private currentTierIdx = 0;
  private tierPlacedCount = 0;
  private pieceQueue: PieceBlueprint[] = [];
  private activeBlueprint: PieceBlueprint | null = null;

  private gripperX = 0;
  private gripperAngleDeg = 0;
  private visualAngleDeg = 0;
  private dropCooldown = 0;
  private settleTimer = 0;
  private dangerTimer = 0;
  private trimBiasRad = 0;

  private snipsRemaining = MAX_SNIPS;
  private snipsUsed = 0;
  private snipMode = false;
  private snipDragStart: Vec2 | null = null;
  private snipDragEnd: Vec2 | null = null;

  private reserveSheets = MAX_RESERVE_SHEETS;
  private score = 0;
  private peakTiltDeg = 0;
  private tiltSamples: number[] = [];
  private pieceLog: PieceOutcome[] = [];
  private tierStars: boolean[] = [];
  private registrationHits = 0;
  private lockedSpecimens: LockedSpecimen[] = [];

  private windPhaseTimer = 0;
  private windState: 'CALM' | 'WINDUP' | 'GUSTING' = 'CALM';
  private windDirection: -1 | 1 = 1;

  private hitstopTimer = 0;
  private shakeTime = 0;
  private shakeIntensity = 0;
  private statusBanner: string | null = null;
  private statusBannerTimer = 0;
  private pressSlamAnim = 0;

  private entities: ActivePieceEntity[] = [];
  private particles: Particle[] = [];
  private stamps: FloatingStamp[] = [];

  // Input state: held vs justPressed
  private heldKeys = new Set<string>();
  private bufferedDrop = false;
  private pointerWorld: Vec2 = { x: 0, y: 200 };
  private pointerActive = false;

  // Title screen interactive mobile
  private titleNodes: MobileHangNode[] = [];
  private titleTime = 0;

  // Cached paper grain pattern
  private paperPattern: CanvasPattern | null = null;
  private halftonePatterns: Map<string, CanvasPattern> = new Map();
  private lastHudEmit = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: SimulationCallbacks) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not initialize 2D canvas context');
    }
    this.ctx = context;
    this.callbacks = callbacks;

    this.engine = Engine.create({
      gravity: { x: 0, y: 1, scale: 0.001 },
      positionIterations: 10,
      velocityIterations: 8,
    });

    this.initParticlePool();
    this.initPaperGrainPattern();
    this.initTitleMobile();
    this.bindPhysicsEvents();
    this.setupWorldBeam();
  }

  private initParticlePool(): void {
    this.particles = Array.from({ length: 140 }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      rot: 0,
      vRot: 0,
      size: 4,
      life: 0,
      maxLife: 1,
      color: '#E84A38',
      shape: 'dot',
    }));
  }

  private initPaperGrainPattern(): void {
    const tile = document.createElement('canvas');
    tile.width = 128;
    tile.height = 128;
    const tctx = tile.getContext('2d');
    if (!tctx) return;

    tctx.fillStyle = '#F4EFE6';
    tctx.fillRect(0, 0, 128, 128);

    const rng = createRng(90210);
    for (let i = 0; i < 420; i++) {
      const x = rng() * 128;
      const y = rng() * 128;
      const dark = rng() > 0.45;
      tctx.fillStyle = dark ? 'rgba(30, 29, 27, 0.032)' : 'rgba(255, 252, 245, 0.55)';
      tctx.fillRect(x, y, 1.5, 1.5);
    }
    for (let i = 0; i < 24; i++) {
      const x = rng() * 128;
      const y = rng() * 128;
      const len = 4 + rng() * 10;
      const angle = rng() * Math.PI;
      tctx.strokeStyle = 'rgba(184, 134, 59, 0.045)';
      tctx.lineWidth = 0.8;
      tctx.beginPath();
      tctx.moveTo(x, y);
      tctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      tctx.stroke();
    }

    this.paperPattern = this.ctx.createPattern(tile, 'repeat');
  }

  private getHalftonePattern(color: string): CanvasPattern | null {
    const existing = this.halftonePatterns.get(color);
    if (existing) return existing;

    const tile = document.createElement('canvas');
    tile.width = 10;
    tile.height = 10;
    const tctx = tile.getContext('2d');
    if (!tctx) return null;

    tctx.fillStyle = color;
    tctx.beginPath();
    tctx.arc(3, 3, 1.35, 0, Math.PI * 2);
    tctx.arc(8, 8, 1.35, 0, Math.PI * 2);
    tctx.fill();

    const pat = this.ctx.createPattern(tile, 'repeat');
    if (pat) this.halftonePatterns.set(color, pat);
    return pat;
  }

  private initTitleMobile(): void {
    this.titleNodes = [
      { anchorX: 165, anchorY: 85, rodLen: 120, angle: 0.06, vel: 0, color: '#E84A38', size: 34, shape: 'triangle' },
      { anchorX: 280, anchorY: 135, rodLen: 105, angle: -0.08, vel: 0, color: '#1F5CA8', size: 38, shape: 'arch' },
      { anchorX: 115, anchorY: 205, rodLen: 95, angle: 0.04, vel: 0, color: '#E5A922', size: 28, shape: 'circle' },
      { anchorX: 235, anchorY: 245, rodLen: 115, angle: -0.05, vel: 0, color: '#1A7F64', size: 32, shape: 'diamond' },
    ];
  }

  private setupWorldBeam(): void {
    World.clear(this.engine.world, false);
    this.entities = [];

    this.beam = Bodies.rectangle(PIVOT_X, PIVOT_Y, BEAM_WIDTH, BEAM_HEIGHT, {
      density: 0.012,
      friction: 0.92,
      frictionStatic: 1.0,
      restitution: 0.04,
      chamfer: { radius: 4 },
      label: 'fulcrum_beam',
    });

    this.pivotConstraint = Constraint.create({
      pointA: { x: PIVOT_X, y: PIVOT_Y },
      bodyB: this.beam,
      pointB: { x: 0, y: 0 },
      stiffness: 1,
      length: 0,
    });

    World.add(this.engine.world, [this.beam, this.pivotConstraint]);
  }

  private bindPhysicsEvents(): void {
    Events.on(this.engine, 'beforeUpdate', () => {
      if (this.gameState !== 'PLAYING') return;

      // Calibrated counterweight restoring torque around fulcrum
      const angleErr = this.beam.angle - this.trimBiasRad;
      const dt = 1 / 60;
      const nextOmega =
        this.beam.angularVelocity +
        (-5.4 * angleErr - 4.1 * this.beam.angularVelocity) * dt;
      Body.setAngularVelocity(this.beam, nextOmega);

      // Keep pivot cleanly pinned at zero drift
      Body.setPosition(this.beam, { x: PIVOT_X, y: PIVOT_Y });
      Body.setVelocity(this.beam, { x: 0, y: 0 });

      // Apply crosswind to falling or lightweight pieces during gust
      if (this.windState === 'GUSTING') {
        const tier = this.tiers[this.currentTierIdx];
        const strength = tier ? Math.abs(tier.windStrength) : 0.4;
        const fx = this.windDirection * strength * 0.00055;
        for (const ent of this.entities) {
          if (!ent.hasTouchedBeam || ent.blueprint.archetype === 'ORIGAMI_MOTH') {
            Body.applyForce(ent.body, ent.body.position, {
              x: fx * ent.blueprint.windFactor * ent.body.mass,
              y: 0,
            });
          }
        }
      }
    });

    Events.on(this.engine, 'collisionStart', (evt) => {
      if (this.gameState !== 'PLAYING') return;
      for (const pair of evt.pairs) {
        const entA = this.entities.find(
          (e) => e.body === pair.bodyA || e.body === pair.bodyA.parent
        );
        const entB = this.entities.find(
          (e) => e.body === pair.bodyB || e.body === pair.bodyB.parent
        );
        const hitsBeam =
          pair.bodyA === this.beam || pair.bodyB === this.beam;

        if (entA) {
          const speed = Math.hypot(entA.body.velocity.x, entA.body.velocity.y);
          if (hitsBeam || entB?.hasTouchedBeam) {
            entA.hasTouchedBeam = true;
          }
          if (speed > 1.2) {
            this.onPieceImpact(entA, speed);
          }
        }
        if (entB) {
          const speed = Math.hypot(entB.body.velocity.x, entB.body.velocity.y);
          if (hitsBeam || entA?.hasTouchedBeam) {
            entB.hasTouchedBeam = true;
          }
          if (speed > 1.2) {
            this.onPieceImpact(entB, speed);
          }
        }
      }
    });
  }

  private onPieceImpact(ent: ActivePieceEntity, speed: number): void {
    const intensity = Math.min(1, speed / 9.5);
    soundFX.playPaperThwack(intensity, ent.blueprint.archetype);

    ent.hitFlash = Math.min(1, intensity * 0.85);
    ent.squashScale = ent.blueprint.archetype === 'ACCORDION' ? 0.28 : 0.14 * intensity;

    if (intensity > 0.55) {
      this.triggerShake(intensity * 4.5, 0.12);
      if (ent.blueprint.archetype === 'LEAD_SLUG' && intensity > 0.65) {
        this.hitstopTimer = 0.038;
      }
    }

    if (intensity > 0.35) {
      this.spawnBurst(
        ent.body.position.x,
        ent.body.position.y + 10,
        6,
        ent.blueprint.fillColor,
        'dot'
      );
    }
  }

  start(): void {
    if (this.rafId !== null) return;
    this.lastFrameTime = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;
      const dt = Math.min(Math.max(rawDt, 0), 0.05);

      this.update(dt, now);
      this.render();

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  startNewRun(mode: GameMode): void {
    const daily = getDailyEditionInfo();
    this.mode = mode;
    this.editionNumber = daily.editionNumber;
    this.dateKey = daily.dateKey;

    if (mode === 'DAILY') {
      this.tiers = generateDailyTiers(daily.seed);
    } else {
      this.freePressRng = createRng(Date.now() ^ 0x9e3779b9);
      this.tiers = [
        generateFreePressTier(1, this.freePressRng),
        generateFreePressTier(2, this.freePressRng),
        generateFreePressTier(3, this.freePressRng),
      ];
    }

    this.currentTierIdx = 0;
    this.tierPlacedCount = 0;
    this.gripperX = 0;
    this.gripperAngleDeg = 0;
    this.visualAngleDeg = 0;
    this.dropCooldown = 0.25;
    this.settleTimer = 0;
    this.dangerTimer = 0;
    this.trimBiasRad = 0;

    this.snipsRemaining = MAX_SNIPS;
    this.snipsUsed = 0;
    this.snipMode = false;
    this.snipDragStart = null;
    this.snipDragEnd = null;

    this.reserveSheets = MAX_RESERVE_SHEETS;
    this.score = 0;
    this.peakTiltDeg = 0;
    this.tiltSamples = [];
    this.pieceLog = [];
    this.tierStars = [];
    this.registrationHits = 0;
    this.lockedSpecimens = [];

    this.windPhaseTimer = 0;
    this.windState = 'CALM';
    this.windDirection = 1;
    this.statusBanner = null;
    this.statusBannerTimer = 0;
    this.pressSlamAnim = 0;
    this.bufferedDrop = false;

    this.setupWorldBeam();
    this.loadTierQueue(0);
    this.setGameState('PLAYING');
    this.emitHud(true);
  }

  private loadTierQueue(idx: number): void {
    if (this.mode === 'FREE_PRESS' && idx >= this.tiers.length) {
      this.tiers.push(generateFreePressTier(idx + 1, this.freePressRng));
    }
    const tier = this.tiers[idx];
    this.tierPlacedCount = 0;
    this.settleTimer = 0;
    this.pieceQueue = [...tier.pieces];
    this.activeBlueprint = this.pieceQueue.shift() ?? null;
    this.windPhaseTimer = 0;
    this.windState = 'CALM';
    this.windDirection = tier.windStrength >= 0 ? 1 : -1;
  }

  setGameState(next: GameState): void {
    this.gameState = next;
    this.callbacks.onStateChange(next);
    if (next !== 'PLAYING') {
      this.heldKeys.clear();
      this.snipDragStart = null;
      this.snipDragEnd = null;
    }
  }

  togglePause(): void {
    if (this.gameState === 'PLAYING') {
      this.setGameState('PAUSED');
    } else if (this.gameState === 'PAUSED') {
      this.setGameState('PLAYING');
    }
  }

  toggleSnipMode(): void {
    if (this.gameState !== 'PLAYING') return;
    if (this.snipsRemaining <= 0) {
      this.showBanner('NO SNIPS LEFT');
      return;
    }
    this.snipMode = !this.snipMode;
    this.snipDragStart = null;
    this.snipDragEnd = null;
    this.emitHud(true);
  }

  rotateActivePiece(deltaDeg: number): void {
    if (this.gameState !== 'PLAYING' || !this.activeBlueprint) return;
    this.gripperAngleDeg = (this.gripperAngleDeg + deltaDeg + 360) % 360;
    soundFX.playRotateClick();
    this.emitHud(true);
  }

  triggerDrop(): void {
    if (this.gameState !== 'PLAYING') return;
    if (this.snipMode) return;
    this.bufferedDrop = true;
  }

  handleKeyDown(code: string): void {
    if (code === 'Escape') {
      if (this.gameState === 'PLAYING' || this.gameState === 'PAUSED') {
        this.togglePause();
      }
      return;
    }

    if (this.gameState !== 'PLAYING') return;

    if (!this.heldKeys.has(code)) {
      if (code === 'KeyQ') {
        this.rotateActivePiece(-30);
      } else if (code === 'KeyE' || code === 'KeyR' || code === 'ArrowUp' || code === 'KeyW') {
        this.rotateActivePiece(30);
      } else if (code === 'Space' || code === 'ArrowDown' || code === 'KeyS') {
        this.triggerDrop();
      } else if (code === 'KeyX') {
        this.toggleSnipMode();
      }
    }

    this.heldKeys.add(code);
  }

  handleKeyUp(code: string): void {
    this.heldKeys.delete(code);
  }

  clearHeldInputs(): void {
    this.heldKeys.clear();
    this.snipDragStart = null;
    this.snipDragEnd = null;
  }

  private getViewportTransform(): { scale: number; offsetX: number; offsetY: number } {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const scale = Math.min(w / LOGICAL_W, h / LOGICAL_H);
    const offsetX = (w - LOGICAL_W * scale) * 0.5;
    const offsetY = (h - LOGICAL_H * scale) * 0.5;
    return { scale, offsetX, offsetY };
  }

  screenToLogical(clientX: number, clientY: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    const { scale, offsetX, offsetY } = this.getViewportTransform();
    const lx = (clientX - rect.left - offsetX) / scale;
    const ly = (clientY - rect.top - offsetY) / scale;
    // Shift origin horizontally to center (PIVOT_X = 0)
    return {
      x: lx - LOGICAL_W * 0.5,
      y: ly,
    };
  }

  handlePointerMove(clientX: number, clientY: number): void {
    const pt = this.screenToLogical(clientX, clientY);
    this.pointerWorld = pt;
    this.pointerActive = true;

    if (this.gameState === 'PLAYING') {
      if (this.snipMode && this.snipDragStart) {
        this.snipDragEnd = pt;
      } else if (!this.snipMode && this.activeBlueprint) {
        this.gripperX = Math.max(-RAIL_LIMIT_X, Math.min(RAIL_LIMIT_X, pt.x));
      }
    }
  }

  handlePointerDown(clientX: number, clientY: number, button: number): void {
    const pt = this.screenToLogical(clientX, clientY);
    this.pointerWorld = pt;
    this.pointerActive = true;

    if (this.gameState !== 'PLAYING') return;

    // Right click toggles snip drag smoothly
    if (button === 2) {
      if (this.snipsRemaining > 0) {
        this.snipMode = true;
        this.snipDragStart = pt;
        this.snipDragEnd = pt;
        this.emitHud(true);
      }
      return;
    }

    if (this.snipMode) {
      this.snipDragStart = pt;
      this.snipDragEnd = pt;
      return;
    }

    // Move gripper to pointer X and drop
    if (this.activeBlueprint && pt.y > 70 && pt.y < 590) {
      this.gripperX = Math.max(-RAIL_LIMIT_X, Math.min(RAIL_LIMIT_X, pt.x));
      this.triggerDrop();
    }
  }

  handlePointerUp(): void {
    if (this.gameState !== 'PLAYING') return;
    if (this.snipMode && this.snipDragStart && this.snipDragEnd) {
      const dist = Math.hypot(
        this.snipDragEnd.x - this.snipDragStart.x,
        this.snipDragEnd.y - this.snipDragStart.y
      );
      if (dist > 18) {
        this.executeSnip(this.snipDragStart, this.snipDragEnd);
      }
      this.snipDragStart = null;
      this.snipDragEnd = null;
    }
  }

  handleWheel(deltaY: number): void {
    if (this.gameState !== 'PLAYING') return;
    this.rotateActivePiece(deltaY > 0 ? 30 : -30);
  }

  private executeSnip(segA: Vec2, segB: Vec2): void {
    if (this.snipsRemaining <= 0) return;

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      const worldParts = this.getBodyWorldParts(ent);
      const sliced = sliceBodyParts(worldParts, segA, segB);

      if (sliced) {
        World.remove(this.engine.world, ent.body);
        this.entities.splice(i, 1);

        const leftArea = sliced.leftParts.reduce((s, p) => s + polygonArea(p), 0);
        const rightArea = sliced.rightParts.reduce((s, p) => s + polygonArea(p), 0);

        const cutDirX = segB.x - segA.x;
        const cutDirY = segB.y - segA.y;
        const len = Math.max(1, Math.hypot(cutDirX, cutDirY));
        const nx = -cutDirY / len;
        const ny = cutDirX / len;

        const leftFrag = this.spawnFragmentBody(
          sliced.leftParts,
          ent.blueprint,
          ent.body.velocity,
          { x: nx * 1.35, y: ny * 1.35 - 0.8 },
          leftArea < rightArea
        );
        const rightFrag = this.spawnFragmentBody(
          sliced.rightParts,
          ent.blueprint,
          ent.body.velocity,
          { x: -nx * 1.35, y: -ny * 1.35 - 0.8 },
          rightArea < leftArea
        );

        this.entities.push(leftFrag, rightFrag);

        this.snipsRemaining--;
        this.snipsUsed++;
        this.snipMode = false;
        this.pieceLog.push('snipped');
        this.score += 75;
        this.hitstopTimer = 0.05;
        this.triggerShake(5.5, 0.16);
        soundFX.playSnipShear();

        const midX = (segA.x + segB.x) * 0.5;
        const midY = (segA.y + segB.y) * 0.5;
        this.spawnBurst(midX, midY, 18, '#E84A38', 'scrap');
        this.addFloatingStamp('SNIP!', midX, midY - 14, '#E84A38');
        this.showBanner('CLEAN CUT');
        this.emitHud(true);
        return;
      }
    }

    this.showBanner('DRAG ACROSS A PIECE TO SNIP');
  }

  private getBodyWorldParts(ent: ActivePieceEntity): Vec2[][] {
    const pos = ent.body.position;
    const cos = Math.cos(ent.body.angle);
    const sin = Math.sin(ent.body.angle);
    return ent.localParts.map((part) =>
      part.map((v) => ({
        x: pos.x + v.x * cos - v.y * sin,
        y: pos.y + v.x * sin + v.y * cos,
      }))
    );
  }

  private spawnFragmentBody(
    worldParts: Vec2[][],
    blueprint: PieceBlueprint,
    baseVel: Vec2,
    impulseVel: Vec2,
    isSmallerScrap: boolean
  ): ActivePieceEntity {
    const allPts = worldParts.flat();
    const centroid = polygonCentroid(allPts);

    const localParts = worldParts.map((part) =>
      part.map((v) => ({ x: v.x - centroid.x, y: v.y - centroid.y }))
    );

    const matterParts = localParts.map((lp) => {
      const partCenter = polygonCentroid(lp);
      return Bodies.fromVertices(
        centroid.x + partCenter.x,
        centroid.y + partCenter.y,
        [lp],
        {
          density: blueprint.density,
          restitution: blueprint.restitution,
          friction: blueprint.friction,
          frictionAir: blueprint.frictionAir,
        }
      );
    });

    const body =
      matterParts.length === 1
        ? matterParts[0]
        : Body.create({
            parts: matterParts,
            density: blueprint.density,
            restitution: blueprint.restitution,
            friction: blueprint.friction,
            frictionAir: blueprint.frictionAir,
          });

    // Re-center localParts accurately around Matter.js computed body.position
    const syncedLocal = worldParts.map((part) =>
      part.map((v) => ({
        x: v.x - body.position.x,
        y: v.y - body.position.y,
      }))
    );

    Body.setVelocity(body, {
      x: baseVel.x + impulseVel.x,
      y: baseVel.y + impulseVel.y,
    });
    Body.setAngularVelocity(body, (isSmallerScrap ? 1 : -1) * 0.045);

    World.add(this.engine.world, body);

    return {
      body,
      blueprint,
      localParts: syncedLocal,
      isSnipScrap: isSmallerScrap,
      hasTouchedBeam: true,
      squashScale: 0.16,
      hitFlash: 0.7,
      spawnedAt: performance.now(),
    };
  }

  private spawnPieceFromGripper(): void {
    if (!this.activeBlueprint) return;
    const bp = this.activeBlueprint;
    const rad = (this.gripperAngleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const spawnX = this.gripperX;
    const spawnY = GRIPPER_Y + 28;

    const worldParts = bp.parts.map((part) =>
      part.map((v) => ({
        x: spawnX + v.x * cos - v.y * sin,
        y: spawnY + v.x * sin + v.y * cos,
      }))
    );

    const matterParts = worldParts.map((wp) => {
      const c = polygonCentroid(wp);
      return Bodies.fromVertices(c.x, c.y, [wp], {
        density: bp.density,
        restitution: bp.restitution,
        friction: bp.friction,
        frictionAir: bp.frictionAir,
      });
    });

    const body =
      matterParts.length === 1
        ? matterParts[0]
        : Body.create({
            parts: matterParts,
            density: bp.density,
            restitution: bp.restitution,
            friction: bp.friction,
            frictionAir: bp.frictionAir,
          });

    // Store localParts in body's angle=0 space (Matter sets body.angle=0 on create)
    const localParts = worldParts.map((wp) =>
      wp.map((v) => ({
        x: v.x - body.position.x,
        y: v.y - body.position.y,
      }))
    );

    Body.setVelocity(body, { x: 0, y: 1.6 });
    World.add(this.engine.world, body);

    this.entities.push({
      body,
      blueprint: bp,
      localParts,
      isSnipScrap: false,
      hasTouchedBeam: false,
      squashScale: 0,
      hitFlash: 0,
      spawnedAt: performance.now(),
    });

    soundFX.playDropRelease();
    this.tierPlacedCount++;
    this.dropCooldown = 0.42;

    if (this.pieceQueue.length > 0) {
      this.activeBlueprint = this.pieceQueue.shift() ?? null;
      this.gripperAngleDeg = 0;
      this.visualAngleDeg = 0;
    } else {
      this.activeBlueprint = null;
    }

    this.emitHud(true);
  }

  private update(dt: number, nowMs: number): void {
    if (this.gameState === 'TITLE_MENU') {
      this.updateTitleMobile(dt);
      return;
    }

    if (this.gameState !== 'PLAYING') {
      this.updateParticlesAndStamps(dt);
      return;
    }

    // Smooth visual rotation interpolation
    const angleDiff = ((this.gripperAngleDeg - this.visualAngleDeg + 540) % 360) - 180;
    this.visualAngleDeg += angleDiff * Math.min(1, dt * 18);

    // Held keyboard rail movement
    const moveLeft = this.heldKeys.has('ArrowLeft') || this.heldKeys.has('KeyA');
    const moveRight = this.heldKeys.has('ArrowRight') || this.heldKeys.has('KeyD');
    if (moveLeft !== moveRight) {
      const dir = moveRight ? 1 : -1;
      this.gripperX = Math.max(
        -RAIL_LIMIT_X,
        Math.min(RAIL_LIMIT_X, this.gripperX + dir * 290 * dt)
      );
    }

    // Decay timers
    if (this.dropCooldown > 0) this.dropCooldown = Math.max(0, this.dropCooldown - dt);
    if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.pressSlamAnim > 0) this.pressSlamAnim = Math.max(0, this.pressSlamAnim - dt * 2.5);
    if (this.statusBannerTimer > 0) {
      this.statusBannerTimer -= dt;
      if (this.statusBannerTimer <= 0) this.statusBanner = null;
    }

    // Consume buffered drop
    if (this.bufferedDrop && this.dropCooldown <= 0 && this.activeBlueprint && !this.snipMode) {
      this.bufferedDrop = false;
      this.spawnPieceFromGripper();
    } else if (this.dropCooldown > 0.25) {
      // Clear stale buffer only if way too early
    }

    // Update Wind Telegraph & Gust cycle
    this.updateWindCycle(dt);

    // Hitstop pauses physics step briefly while particles & shake stay responsive
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
    } else {
      this.accumulator += dt;
      const fixedStep = 1 / 60;
      let steps = 0;
      while (this.accumulator >= fixedStep && steps < 3) {
        Engine.update(this.engine, fixedStep * 1000);
        this.accumulator -= fixedStep;
        steps++;
      }
    }

    // Animate squash/flash decay & check off-screen falls
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      ent.squashScale *= Math.pow(0.02, dt);
      ent.hitFlash *= Math.pow(0.01, dt);

      if (ent.body.position.y > LOGICAL_H + 80) {
        World.remove(this.engine.world, ent.body);
        this.entities.splice(i, 1);

        if (!ent.isSnipScrap) {
          this.handleWholePieceDropped();
          if (this.gameState !== 'PLAYING') return;
        }
      }
    }

    this.updateParticlesAndStamps(dt);

    // Evaluate Fulcrum Tilt & Tier Lock / Topple
    const tiltDeg = (this.beam.angle * 180) / Math.PI;
    const absTilt = Math.abs(tiltDeg);
    this.peakTiltDeg = Math.max(this.peakTiltDeg, absTilt);
    this.tiltSamples.push(absTilt);

    if (absTilt > MAX_SAFE_TILT_DEG) {
      this.dangerTimer += dt;
      soundFX.playCreakTick(Math.min(1, this.dangerTimer / CRITICAL_HOLD_LIMIT_S));
      if (this.dangerTimer >= CRITICAL_HOLD_LIMIT_S) {
        this.finishRun(false, `Scale tipped past ${MAX_SAFE_TILT_DEG}°`);
        return;
      }
    } else {
      this.dangerTimer = Math.max(0, this.dangerTimer - dt * 1.8);
    }

    // Check Tier completion
    const tier = this.tiers[this.currentTierIdx];
    const hasSettledPieces = this.entities.filter((e) => !e.isSnipScrap);
    if (
      tier &&
      !this.activeBlueprint &&
      this.pieceQueue.length === 0 &&
      hasSettledPieces.length > 0
    ) {
      const allSlow = hasSettledPieces.every(
        (e) =>
          e.hasTouchedBeam &&
          Math.hypot(e.body.velocity.x, e.body.velocity.y) < 0.75 &&
          Math.abs(e.body.angularVelocity) < 0.035
      );
      if (allSlow && absTilt <= 13.5) {
        this.settleTimer += dt;
        if (this.settleTimer >= TIER_LOCK_HOLD_S) {
          this.lockCurrentTier(tiltDeg);
        }
      } else {
        this.settleTimer = Math.max(0, this.settleTimer - dt * 1.2);
      }
    }

    if (nowMs - this.lastHudEmit > 55) {
      this.emitHud(false);
    }
  }

  private updateTitleMobile(dt: number): void {
    this.titleTime += dt;
    const breezeX = this.pointerActive ? (this.pointerWorld.x / 500) * 0.6 : 0;
    for (let i = 0; i < this.titleNodes.length; i++) {
      const n = this.titleNodes[i];
      const wind = Math.sin(this.titleTime * 1.3 + i * 1.4) * 0.25 + breezeX * 0.45;
      const accel = -4.2 * n.angle - 0.85 * n.vel + wind;
      n.vel += accel * dt;
      n.angle += n.vel * dt;
    }
  }

  private updateWindCycle(dt: number): void {
    const tier = this.tiers[this.currentTierIdx];
    if (!tier || Math.abs(tier.windStrength) < 0.05) {
      this.windState = 'CALM';
      return;
    }

    this.windPhaseTimer += dt;
    const cycle = this.windPhaseTimer % 7.5;
    if (cycle < 3.4) {
      this.windState = 'CALM';
    } else if (cycle < 5.0) {
      this.windState = 'WINDUP';
    } else {
      if (this.windState !== 'GUSTING') {
        soundFX.playWindWhoosh();
      }
      this.windState = 'GUSTING';
    }
  }

  private handleWholePieceDropped(): void {
    this.reserveSheets--;
    this.pieceLog.push('dropped');
    this.triggerShake(6, 0.2);
    this.showBanner('SHEET SLIPPED!');
    this.addFloatingStamp('SLIPPED!', 0, PIVOT_Y - 70, '#E84A38');

    if (this.reserveSheets <= 0) {
      this.finishRun(false, 'All 3 Reserve Sheets slipped off the scale');
      return;
    }

    // Feed a replacement Kraft Block so the tier never soft-locks
    const fallback = {
      ...generateFreePressTier(this.currentTierIdx + 1, createRng(this.tierPlacedCount + 77)).pieces[0],
      id: `res_${Date.now()}`,
      name: 'Reserve Sheet',
    };
    if (!this.activeBlueprint) {
      this.activeBlueprint = fallback;
    } else {
      this.pieceQueue.push(fallback);
    }
    this.settleTimer = 0;
    this.emitHud(true);
  }

  private evaluateRegistrationTarget(tier: TierSpec): boolean {
    const resting = this.entities.filter((e) => !e.isSnipScrap && e.hasTouchedBeam);
    if (resting.length === 0) return false;

    if (tier.targetType === 'HEIGHT') {
      const targetY = PIVOT_Y - BEAM_HEIGHT * 0.5 - tier.targetValue;
      return resting.some((e) => e.body.bounds.min.y <= targetY);
    } else {
      let minX = Infinity;
      let maxX = -Infinity;
      for (const e of resting) {
        minX = Math.min(minX, e.body.bounds.min.x);
        maxX = Math.max(maxX, e.body.bounds.max.x);
      }
      return minX <= -tier.targetValue && maxX >= tier.targetValue;
    }
  }

  private lockCurrentTier(tiltDeg: number): void {
    const tier = this.tiers[this.currentTierIdx];
    const absTilt = Math.abs(tiltDeg);
    const regHit = this.evaluateRegistrationTarget(tier);

    // Record piece outcomes for this tier
    const tierScoreBase = 250;
    const levelBonus = Math.round(Math.max(0, 15 - absTilt) * 18);
    const regBonus = regHit ? 300 : 0;
    this.score += tierScoreBase + levelBonus + regBonus;

    if (regHit) this.registrationHits++;
    this.tierStars.push(regHit);

    const outcome: PieceOutcome =
      absTilt <= 5 ? 'level' : absTilt <= 13 ? 'lean' : 'critical';
    for (let i = 0; i < 3; i++) {
      this.pieceLog.push(outcome);
    }

    // Archive miniature specimen on desk shelf
    const silhouettes = this.entities
      .filter((e) => !e.isSnipScrap)
      .map((e) => {
        const worldVerts = this.getBodyWorldParts(e)[0] ?? [];
        return {
          vertices: worldVerts.map((v) => ({
            x: (v.x - PIVOT_X) * 0.16,
            y: (v.y - (PIVOT_Y - 60)) * 0.16,
          })),
          fillColor: e.blueprint.fillColor,
          strokeColor: e.blueprint.strokeColor,
        };
      });

    this.lockedSpecimens.push({
      tierNumber: tier.tierNumber,
      tiltDeg,
      registrationHit: regHit,
      silhouettes,
    });

    // Clear active beam pieces cleanly & carry subtle trim bias into next tier
    for (const ent of this.entities) {
      World.remove(this.engine.world, ent.body);
    }
    this.entities = [];
    this.trimBiasRad = Math.max(-0.09, Math.min(0.09, this.beam.angle * 0.35));

    this.pressSlamAnim = 1;
    this.hitstopTimer = 0.045;
    this.triggerShake(7, 0.22);
    soundFX.playTierStamp();
    this.spawnBurst(0, PIVOT_Y - 50, 24, regHit ? '#1F5CA8' : '#1A7F64', 'scrap');
    this.addFloatingStamp(
      regHit ? `TIER ${tier.tierNumber} LOCKED ★` : `TIER ${tier.tierNumber} LOCKED`,
      0,
      PIVOT_Y - 120,
      regHit ? '#1F5CA8' : '#1A7F64'
    );

    const totalTargetTiers = this.mode === 'DAILY' ? this.tiers.length : Infinity;
    if (this.currentTierIdx + 1 >= totalTargetTiers) {
      this.finishRun(true, 'All 5 Daily Press Tiers Locked!');
      return;
    }

    this.currentTierIdx++;
    this.loadTierQueue(this.currentTierIdx);
    this.emitHud(true);
  }

  private finishRun(victory: boolean, reason: string): void {
    if (victory) {
      this.score += this.snipsRemaining * 100 + this.reserveSheets * 100;
      soundFX.playVictoryFanfare();
      this.setGameState('VICTORY');
    } else {
      this.pieceLog.push('toppled');
      soundFX.playToppleCascade();
      this.triggerShake(10, 0.35);
      this.setGameState('GAME_OVER');
    }

    const avgTilt =
      this.tiltSamples.length > 0
        ? this.tiltSamples.reduce((a, b) => a + b, 0) / this.tiltSamples.length
        : 0;

    const summary: RunSummary = {
      mode: this.mode,
      editionNumber: this.editionNumber,
      dateKey: this.dateKey,
      victory,
      score: this.score,
      tiersLocked: this.lockedSpecimens.length,
      totalTiers: this.mode === 'DAILY' ? 5 : this.currentTierIdx + 1,
      piecesPlaced: this.lockedSpecimens.length * 3 + this.tierPlacedCount,
      totalPieces: this.mode === 'DAILY' ? 15 : this.lockedSpecimens.length * 3 + 3,
      snipsUsed: this.snipsUsed,
      maxSnips: MAX_SNIPS,
      avgTiltDeg: Number(avgTilt.toFixed(1)),
      peakTiltDeg: Number(this.peakTiltDeg.toFixed(1)),
      registrationHits: this.registrationHits,
      pieceLog: this.pieceLog,
      tierStars: this.tierStars,
      endReason: reason,
    };

    this.emitHud(true);
    this.callbacks.onRunEnd(summary);
  }

  private triggerShake(intensity: number, duration: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  private showBanner(text: string): void {
    this.statusBanner = text;
    this.statusBannerTimer = 1.6;
  }

  private addFloatingStamp(text: string, x: number, y: number, color: string): void {
    this.stamps.push({
      text,
      x,
      y,
      vy: -36,
      life: 1.15,
      maxLife: 1.15,
      color,
    });
  }

  private spawnBurst(
    x: number,
    y: number,
    count: number,
    color: string,
    shape: 'dot' | 'scrap'
  ): void {
    let spawned = 0;
    for (const p of this.particles) {
      if (!p.active) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 70 + Math.random() * 190;
        p.active = true;
        p.x = x;
        p.y = y;
        p.vx = Math.cos(angle) * spd;
        p.vy = Math.sin(angle) * spd - 65;
        p.rot = Math.random() * Math.PI * 2;
        p.vRot = (Math.random() - 0.5) * 9;
        p.size = shape === 'scrap' ? 5 + Math.random() * 6 : 2.5 + Math.random() * 3.5;
        p.maxLife = 0.45 + Math.random() * 0.45;
        p.life = p.maxLife;
        p.color = color;
        p.shape = shape;
        spawned++;
        if (spawned >= count) break;
      }
    }
  }

  private updateParticlesAndStamps(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy += 320 * dt;
      p.vx *= Math.pow(0.35, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vRot * dt;
    }

    for (let i = this.stamps.length - 1; i >= 0; i--) {
      const s = this.stamps[i];
      s.life -= dt;
      s.y += s.vy * dt;
      if (s.life <= 0) {
        this.stamps.splice(i, 1);
      }
    }
  }

  private emitHud(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastHudEmit < 50) return;
    this.lastHudEmit = now;

    const tiltDeg = (this.beam.angle * 180) / Math.PI;
    const absTilt = Math.abs(tiltDeg);
    const balanceZone: BalanceZone =
      absTilt <= 8 ? 'LEVEL' : absTilt <= 16 ? 'LEANING' : 'CRITICAL';

    const tier = this.tiers[this.currentTierIdx];
    const targetMet = tier ? this.evaluateRegistrationTarget(tier) : false;

    const snapshot: HudSnapshot = {
      mode: this.mode,
      editionNumber: this.editionNumber,
      dateKey: this.dateKey,
      score: this.score,
      tierIndex: this.currentTierIdx,
      totalTiers: this.mode === 'DAILY' ? 5 : this.currentTierIdx + 1,
      tierTitle: tier?.title ?? '',
      tierPlaced: this.tierPlacedCount,
      tierQuota: 3,
      targetType: tier?.targetType ?? 'HEIGHT',
      targetLabel:
        tier?.targetType === 'HEIGHT'
          ? 'Reach Cobalt Height Line'
          : 'Span Both Cobalt Marks',
      targetMet,
      settleProgress: Math.min(1, this.settleTimer / TIER_LOCK_HOLD_S),
      tiltDeg,
      balanceZone,
      dangerRatio: Math.min(1, this.dangerTimer / CRITICAL_HOLD_LIMIT_S),
      snipsRemaining: this.snipsRemaining,
      maxSnips: MAX_SNIPS,
      snipMode: this.snipMode,
      reserveSheets: this.reserveSheets,
      maxReserveSheets: MAX_RESERVE_SHEETS,
      activePiece: this.activeBlueprint,
      activePieceAngleDeg: this.gripperAngleDeg,
      nextPieces: this.pieceQueue.slice(0, 2),
      windState: this.windState,
      windDirection: this.windDirection,
      windLabel:
        this.windState === 'CALM'
          ? 'CALM'
          : this.windState === 'WINDUP'
          ? 'BREEZE BUILDING'
          : 'CROSSWIND',
      canDrop: this.dropCooldown <= 0 && Boolean(this.activeBlueprint) && !this.snipMode,
      statusBanner: this.statusBanner,
    };

    this.callbacks.onHudUpdate(snapshot);
  }

  private render(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Fill warm archival rag paper background
    ctx.fillStyle = this.paperPattern ?? '#F4EFE6';
    ctx.fillRect(0, 0, rect.width, rect.height);

    const { scale, offsetX, offsetY } = this.getViewportTransform();
    ctx.translate(offsetX + LOGICAL_W * 0.5 * scale, offsetY);
    ctx.scale(scale, scale);

    if (this.shakeTime > 0) {
      const mag = this.shakeIntensity * (this.shakeTime / 0.25);
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    if (this.gameState === 'TITLE_MENU') {
      this.renderTitleMobile(ctx);
      ctx.restore();
      return;
    }

    this.renderRegistrationMarks(ctx);
    this.renderWindIndicator(ctx);
    this.renderOverheadRailAndGripper(ctx);
    this.renderFulcrumAndBeam(ctx);
    this.renderActivePieces(ctx);
    this.renderDeskSpecimens(ctx);
    this.renderSnipOverlay(ctx);
    this.renderParticlesAndStamps(ctx);

    ctx.restore();
  }

  private renderTitleMobile(ctx: CanvasRenderingContext2D): void {
    // Render a poised kinetic paper-cut mobile on the right side of the Title viewport
    ctx.save();
    ctx.strokeStyle = 'rgba(30, 29, 27, 0.28)';
    ctx.lineWidth = 1.5;

    // Main horizontal brass rod
    ctx.beginPath();
    ctx.moveTo(85, 85);
    ctx.lineTo(310, 135);
    ctx.stroke();

    for (const node of this.titleNodes) {
      const endX = node.anchorX + Math.sin(node.angle) * node.rodLen;
      const endY = node.anchorY + Math.cos(node.angle) * node.rodLen;

      ctx.strokeStyle = 'rgba(30, 29, 27, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(node.anchorX, node.anchorY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Brass eyelet joint
      ctx.fillStyle = '#B8863B';
      ctx.beginPath();
      ctx.arc(node.anchorX, node.anchorY, 4, 0, Math.PI * 2);
      ctx.fill();

      // Paper-cut shape with offset riso shadow
      ctx.save();
      ctx.translate(endX, endY);
      ctx.rotate(-node.angle * 0.85);

      ctx.fillStyle = 'rgba(30, 29, 27, 0.12)';
      this.drawMobileShape(ctx, 4, 5, node.size, node.shape);
      ctx.fill();

      ctx.fillStyle = node.color;
      this.drawMobileShape(ctx, 0, 0, node.size, node.shape);
      ctx.fill();

      ctx.strokeStyle = '#1E1D1B';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawMobileShape(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    size: number,
    shape: MobileHangNode['shape']
  ): void {
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(ox, oy, size, 0, Math.PI * 2);
    } else if (shape === 'triangle') {
      ctx.moveTo(ox, oy - size);
      ctx.lineTo(ox + size * 1.1, oy + size * 0.8);
      ctx.lineTo(ox - size * 1.1, oy + size * 0.8);
      ctx.closePath();
    } else if (shape === 'diamond') {
      ctx.moveTo(ox, oy - size);
      ctx.lineTo(ox + size * 0.85, oy);
      ctx.lineTo(ox, oy + size);
      ctx.lineTo(ox - size * 0.85, oy);
      ctx.closePath();
    } else {
      ctx.roundRect(ox - size * 1.1, oy - size * 0.45, size * 2.2, size * 0.9, 8);
    }
  }

  private renderRegistrationMarks(ctx: CanvasRenderingContext2D): void {
    const tier = this.tiers[this.currentTierIdx];
    if (!tier) return;

    const met = this.evaluateRegistrationTarget(tier);
    const stroke = met ? '#1A7F64' : '#1F5CA8';

    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.fillStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 5]);

    if (tier.targetType === 'HEIGHT') {
      const targetY = PIVOT_Y - BEAM_HEIGHT * 0.5 - tier.targetValue;
      ctx.beginPath();
      ctx.moveTo(-245, targetY);
      ctx.lineTo(245, targetY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(met ? 'HEIGHT MARK ★' : 'HEIGHT TARGET', 245, targetY - 7);
    } else {
      const span = tier.targetValue;
      const topY = PIVOT_Y - 125;
      const botY = PIVOT_Y - 18;
      for (const sx of [-span, span]) {
        ctx.beginPath();
        ctx.moveTo(sx, topY);
        ctx.lineTo(sx, botY);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(met ? 'SPAN MARK ★' : 'SPAN TARGET', 0, topY - 8);
    }

    // Corner crop marks framing the print sheet
    ctx.strokeStyle = 'rgba(30, 29, 27, 0.22)';
    ctx.lineWidth = 1;
    for (const [cx, cy, dx, dy] of [
      [-430, 72, 14, 14],
      [430, 72, -14, 14],
      [-430, 620, 14, -14],
      [430, 620, -14, -14],
    ]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + dy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + dx, cy);
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderWindIndicator(ctx: CanvasRenderingContext2D): void {
    if (this.windState === 'CALM') return;

    ctx.save();
    const isGust = this.windState === 'GUSTING';
    const xBase = this.windDirection > 0 ? -360 : 360;
    const dir = this.windDirection;

    ctx.strokeStyle = isGust ? '#1F5CA8' : 'rgba(31, 92, 168, 0.55)';
    ctx.lineWidth = isGust ? 2.5 : 1.5;

    for (let i = 0; i < 3; i++) {
      const offset = ((performance.now() * (isGust ? 0.25 : 0.09) + i * 45) % 130) * dir;
      const y = 210 + i * 54;
      ctx.beginPath();
      ctx.moveTo(xBase + offset, y);
      ctx.lineTo(xBase + offset + 56 * dir, y);
      ctx.lineTo(xBase + offset + 46 * dir, y - 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderOverheadRailAndGripper(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // Brass overhead rail
    ctx.strokeStyle = '#B8863B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-RAIL_LIMIT_X - 30, RAIL_Y);
    ctx.lineTo(RAIL_LIMIT_X + 30, RAIL_Y);
    ctx.stroke();

    // Rail end stops
    ctx.fillStyle = '#1E1D1B';
    for (const endX of [-RAIL_LIMIT_X - 30, RAIL_LIMIT_X + 30]) {
      ctx.beginPath();
      ctx.arc(endX, RAIL_Y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.activeBlueprint && !this.snipMode) {
      // Drop guide line
      ctx.save();
      ctx.strokeStyle = 'rgba(31, 92, 168, 0.34)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(this.gripperX, GRIPPER_Y + 34);
      ctx.lineTo(this.gripperX, PIVOT_Y - 20);
      ctx.stroke();
      ctx.restore();

      // Brass carriage & jaw
      ctx.fillStyle = '#B8863B';
      ctx.strokeStyle = '#1E1D1B';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(this.gripperX - 18, RAIL_Y - 7, 36, 14, 4);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(this.gripperX, RAIL_Y + 7);
      ctx.lineTo(this.gripperX, GRIPPER_Y);
      ctx.stroke();

      // Piece held in gripper
      ctx.save();
      ctx.translate(this.gripperX, GRIPPER_Y + 28);
      ctx.rotate((this.visualAngleDeg * Math.PI) / 180);
      this.drawBlueprintParts(ctx, this.activeBlueprint.parts, this.activeBlueprint, 1);
      ctx.restore();
    }

    ctx.restore();
  }

  private renderFulcrumAndBeam(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // Triangular brass knife-edge fulcrum pedestal
    ctx.fillStyle = '#E6DFD3';
    ctx.strokeStyle = '#1E1D1B';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(PIVOT_X, PIVOT_Y + 6);
    ctx.lineTo(PIVOT_X + 34, PIVOT_Y + 74);
    ctx.lineTo(PIVOT_X - 34, PIVOT_Y + 74);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Base plinth
    ctx.fillStyle = '#1E1D1B';
    ctx.fillRect(PIVOT_X - 54, PIVOT_Y + 74, 108, 7);

    // Beam body
    const pressDrop = this.pressSlamAnim > 0 ? Math.sin(this.pressSlamAnim * Math.PI) * 8 : 0;
    ctx.save();
    ctx.translate(this.beam.position.x, this.beam.position.y + pressDrop);
    ctx.rotate(this.beam.angle);

    // Offset shadow
    ctx.fillStyle = 'rgba(30, 29, 27, 0.14)';
    ctx.beginPath();
    ctx.roundRect(-BEAM_WIDTH * 0.5 + 4, -BEAM_HEIGHT * 0.5 + 6, BEAM_WIDTH, BEAM_HEIGHT, 5);
    ctx.fill();

    // Main beam plank
    const absTilt = Math.abs((this.beam.angle * 180) / Math.PI);
    ctx.fillStyle = absTilt > 16 ? '#F5D5CE' : '#E6DFD3';
    ctx.strokeStyle = absTilt > 16 ? '#E84A38' : '#1E1D1B';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-BEAM_WIDTH * 0.5, -BEAM_HEIGHT * 0.5, BEAM_WIDTH, BEAM_HEIGHT, 5);
    ctx.fill();
    ctx.stroke();

    // Brass calibration ticks along top edge
    ctx.strokeStyle = '#B8863B';
    ctx.lineWidth = 1.5;
    for (let x = -200; x <= 200; x += 25) {
      const h = x % 50 === 0 ? 7 : 4;
      ctx.beginPath();
      ctx.moveTo(x, -BEAM_HEIGHT * 0.5);
      ctx.lineTo(x, -BEAM_HEIGHT * 0.5 + h);
      ctx.stroke();
    }

    // Center pivot hub
    ctx.fillStyle = '#B8863B';
    ctx.strokeStyle = '#1E1D1B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Settle lock ring around hub
    if (this.settleTimer > 0.02) {
      const progress = Math.min(1, this.settleTimer / TIER_LOCK_HOLD_S);
      ctx.strokeStyle = '#1A7F64';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, 0, 16, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * progress);
      ctx.stroke();
    }

    ctx.restore();
    ctx.restore();
  }

  private renderActivePieces(ctx: CanvasRenderingContext2D): void {
    for (const ent of this.entities) {
      ctx.save();
      ctx.translate(ent.body.position.x, ent.body.position.y);
      ctx.rotate(ent.body.angle);

      if (ent.squashScale > 0.005) {
        const sx = 1 + ent.squashScale;
        const sy = 1 - ent.squashScale * 0.8;
        ctx.scale(sx, sy);
      }

      this.drawBlueprintParts(ctx, ent.localParts, ent.blueprint, 1 - ent.hitFlash * 0.25);

      if (ent.hitFlash > 0.05) {
        ctx.globalAlpha = ent.hitFlash * 0.45;
        ctx.fillStyle = '#FFFDF8';
        for (const part of ent.localParts) {
          this.tracePolygon(ctx, part);
          ctx.fill();
        }
      }

      ctx.restore();
    }
  }

  private drawBlueprintParts(
    ctx: CanvasRenderingContext2D,
    parts: Vec2[][],
    bp: PieceBlueprint,
    alpha: number
  ): void {
    ctx.save();
    ctx.globalAlpha = alpha;

    // Paper-cut offset shadow
    ctx.fillStyle = 'rgba(30, 29, 27, 0.14)';
    for (const part of parts) {
      ctx.save();
      ctx.translate(4, 5);
      this.tracePolygon(ctx, part);
      ctx.fill();
      ctx.restore();
    }

    // Soy-ink fill + halftone overlay
    const halftone = this.getHalftonePattern(bp.halftoneColor);
    for (const part of parts) {
      this.tracePolygon(ctx, part);
      ctx.fillStyle = bp.fillColor;
      ctx.fill();

      if (halftone) {
        ctx.fillStyle = halftone;
        ctx.fill();
      }

      ctx.strokeStyle = bp.strokeColor;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    // Signature craft marks per archetype
    if (bp.archetype === 'LEAD_SLUG') {
      ctx.fillStyle = '#F4EFE6';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('2x', 0, 0);
    } else if (bp.archetype === 'BRASS_PIN') {
      ctx.strokeStyle = '#1E1D1B';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.stroke();
    } else if (bp.archetype === 'ACCORDION') {
      ctx.strokeStyle = '#1E1D1B';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-30, -8);
      ctx.lineTo(-15, 8);
      ctx.lineTo(0, -8);
      ctx.lineTo(15, 8);
      ctx.lineTo(30, -8);
      ctx.stroke();
    }

    ctx.restore();
  }

  private tracePolygon(ctx: CanvasRenderingContext2D, pts: Vec2[]): void {
    if (pts.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
  }

  private renderDeskSpecimens(ctx: CanvasRenderingContext2D): void {
    if (this.lockedSpecimens.length === 0) return;
    ctx.save();
    const baseY = 635;
    const spacing = 86;
    const startX = -((this.lockedSpecimens.length - 1) * spacing) * 0.5;

    for (let i = 0; i < this.lockedSpecimens.length; i++) {
      const spec = this.lockedSpecimens[i];
      const cx = startX + i * spacing;

      ctx.fillStyle = '#E6DFD3';
      ctx.strokeStyle = spec.registrationHit ? '#1F5CA8' : '#1E1D1B';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(cx - 34, baseY - 26, 68, 52, 4);
      ctx.fill();
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, baseY + 6);
      for (const sil of spec.silhouettes) {
        if (sil.vertices.length < 3) continue;
        ctx.fillStyle = sil.fillColor;
        ctx.strokeStyle = sil.strokeColor;
        ctx.lineWidth = 1;
        this.tracePolygon(ctx, sil.vertices);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      ctx.fillStyle = spec.registrationHit ? '#1F5CA8' : '#1E1D1B';
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        spec.registrationHit ? `T${spec.tierNumber} ★` : `T${spec.tierNumber}`,
        cx,
        baseY + 21
      );
    }
    ctx.restore();
  }

  private renderSnipOverlay(ctx: CanvasRenderingContext2D): void {
    if (!this.snipMode) return;

    ctx.save();
    if (this.snipDragStart && this.snipDragEnd) {
      ctx.strokeStyle = '#E84A38';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(this.snipDragStart.x, this.snipDragStart.y);
      ctx.lineTo(this.snipDragEnd.x, this.snipDragEnd.y);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = '#E84A38';
      ctx.beginPath();
      ctx.arc(this.snipDragStart.x, this.snipDragStart.y, 4.5, 0, Math.PI * 2);
      ctx.arc(this.snipDragEnd.x, this.snipDragEnd.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.pointerActive) {
      // Crosshair scissor indicator at pointer
      ctx.strokeStyle = '#E84A38';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(this.pointerWorld.x, this.pointerWorld.y, 12, 0, Math.PI * 2);
      ctx.moveTo(this.pointerWorld.x - 16, this.pointerWorld.y);
      ctx.lineTo(this.pointerWorld.x + 16, this.pointerWorld.y);
      ctx.moveTo(this.pointerWorld.x, this.pointerWorld.y - 16);
      ctx.lineTo(this.pointerWorld.x, this.pointerWorld.y + 16);
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderParticlesAndStamps(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const p of this.particles) {
      if (!p.active) continue;
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 'dot') {
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size * 0.6, -p.size * 0.4, p.size * 1.2, p.size * 0.8);
        ctx.strokeStyle = '#1E1D1B';
        ctx.lineWidth = 1;
        ctx.strokeRect(-p.size * 0.6, -p.size * 0.4, p.size * 1.2, p.size * 0.8);
      }
      ctx.restore();
    }

    for (const s of this.stamps) {
      const alpha = Math.min(1, (s.life / s.maxLife) * 1.4);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      ctx.font = '700 18px "Fraunces", serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.text, s.x, s.y);
      ctx.restore();
    }
    ctx.restore();
  }
}
