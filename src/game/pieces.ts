import { createRng } from './seed.ts';
import type { PieceBlueprint, TierSpec, Vec2 } from './types.ts';

function rectPart(cx: number, cy: number, w: number, h: number): Vec2[] {
  const hw = w / 2;
  const hh = h / 2;
  return [
    { x: cx - hw, y: cy - hh },
    { x: cx + hw, y: cy - hh },
    { x: cx + hw, y: cy + hh },
    { x: cx - hw, y: cy + hh },
  ];
}

function regularPolygon(sides: number, radius: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    pts.push({
      x: Math.cos(a) * radius,
      y: Math.sin(a) * radius,
    });
  }
  return pts;
}

const BLUEPRINT_LIBRARY: Record<string, Omit<PieceBlueprint, 'id'>> = {
  KRAFT_PLANK: {
    archetype: 'KRAFT_BLOCK',
    name: 'Kraft Strip',
    weightTag: '1.0x',
    fillColor: '#D8C7AE',
    shadeColor: '#C4AE8E',
    strokeColor: '#1E1D1B',
    halftoneColor: 'rgba(30, 29, 27, 0.14)',
    density: 0.0018,
    restitution: 0.08,
    friction: 0.85,
    frictionAir: 0.012,
    windFactor: 0.4,
    parts: [rectPart(0, 0, 134, 24)],
  },
  KRAFT_WEDGE: {
    archetype: 'KRAFT_BLOCK',
    name: 'Deckle Wedge',
    weightTag: '1.0x',
    fillColor: '#DECDB5',
    shadeColor: '#C5B091',
    strokeColor: '#1E1D1B',
    halftoneColor: 'rgba(30, 29, 27, 0.14)',
    density: 0.0019,
    restitution: 0.08,
    friction: 0.85,
    frictionAir: 0.012,
    windFactor: 0.45,
    parts: [
      [
        { x: -46, y: -14 },
        { x: 24, y: -18 },
        { x: 50, y: 16 },
        { x: -46, y: 16 },
      ],
    ],
  },
  KRAFT_L_CORNER: {
    archetype: 'KRAFT_BLOCK',
    name: 'Corner Bracket',
    weightTag: '1.1x',
    fillColor: '#CEBA9B',
    shadeColor: '#B59E7C',
    strokeColor: '#1E1D1B',
    halftoneColor: 'rgba(30, 29, 27, 0.15)',
    density: 0.0018,
    restitution: 0.07,
    friction: 0.88,
    frictionAir: 0.012,
    windFactor: 0.4,
    parts: [
      rectPart(-24, -10, 24, 60),
      rectPart(8, 12, 88, 22),
    ],
  },
  KRAFT_PILLAR: {
    archetype: 'KRAFT_BLOCK',
    name: 'Folio Column',
    weightTag: '1.0x',
    fillColor: '#E2D4BF',
    shadeColor: '#CBB89D',
    strokeColor: '#1E1D1B',
    halftoneColor: 'rgba(30, 29, 27, 0.12)',
    density: 0.0019,
    restitution: 0.06,
    friction: 0.86,
    frictionAir: 0.012,
    windFactor: 0.35,
    parts: [rectPart(0, 0, 34, 78)],
  },
  LEAD_SLUG: {
    archetype: 'LEAD_SLUG',
    name: 'Lead Type Slug',
    weightTag: '2.4x',
    fillColor: '#2B2926',
    shadeColor: '#191816',
    strokeColor: '#1E1D1B',
    halftoneColor: 'rgba(244, 239, 230, 0.16)',
    density: 0.0046,
    restitution: 0.04,
    friction: 0.92,
    frictionAir: 0.006,
    windFactor: 0.1,
    parts: [rectPart(0, 0, 62, 34)],
  },
  LEAD_ANVIL: {
    archetype: 'LEAD_SLUG',
    name: 'Press Ingot',
    weightTag: '2.3x',
    fillColor: '#36332F',
    shadeColor: '#1E1D1B',
    strokeColor: '#1E1D1B',
    halftoneColor: 'rgba(244, 239, 230, 0.14)',
    density: 0.0043,
    restitution: 0.05,
    friction: 0.9,
    frictionAir: 0.006,
    windFactor: 0.12,
    parts: [
      [
        { x: -30, y: -16 },
        { x: 30, y: -16 },
        { x: 42, y: 16 },
        { x: -42, y: 16 },
      ],
    ],
  },
  ACCORDION: {
    archetype: 'ACCORDION',
    name: 'Accordion Fold',
    weightTag: 'SPRING',
    fillColor: '#E5A922',
    shadeColor: '#C48A12',
    strokeColor: '#1E1D1B',
    halftoneColor: 'rgba(30, 29, 27, 0.18)',
    density: 0.0017,
    restitution: 0.44,
    friction: 0.8,
    frictionAir: 0.015,
    windFactor: 0.6,
    parts: [rectPart(0, 0, 88, 30)],
  },
  CRESCENT_ARCH: {
    archetype: 'CRESCENT_ARCH',
    name: 'Cobalt Arch',
    weightTag: '1.2x',
    fillColor: '#1F5CA8',
    shadeColor: '#16437D',
    strokeColor: '#1E1D1B',
    halftoneColor: 'rgba(244, 239, 230, 0.2)',
    density: 0.0018,
    restitution: 0.08,
    friction: 0.85,
    frictionAir: 0.013,
    windFactor: 0.45,
    parts: [
      rectPart(-42, 8, 24, 42),
      rectPart(0, -14, 108, 20),
      rectPart(42, 8, 24, 42),
    ],
  },
  ORIGAMI_MOTH: {
    archetype: 'ORIGAMI_MOTH',
    name: 'Origami Moth',
    weightTag: '0.5x',
    fillColor: '#E84A38',
    shadeColor: '#C23424',
    strokeColor: '#1E1D1B',
    halftoneColor: 'rgba(244, 239, 230, 0.22)',
    density: 0.00095,
    restitution: 0.12,
    friction: 0.78,
    frictionAir: 0.03,
    windFactor: 2.35,
    parts: [
      [
        { x: -58, y: -14 },
        { x: 0, y: -4 },
        { x: -12, y: 18 },
        { x: -46, y: 10 },
      ],
      [
        { x: 0, y: -4 },
        { x: 58, y: -14 },
        { x: 46, y: 10 },
        { x: 12, y: 18 },
      ],
    ],
  },
  BRASS_PIN: {
    archetype: 'BRASS_PIN',
    name: 'Brass Eyelet',
    weightTag: 'ROLL',
    fillColor: '#C5923E',
    shadeColor: '#986B22',
    strokeColor: '#1E1D1B',
    halftoneColor: 'rgba(30, 29, 27, 0.18)',
    density: 0.0031,
    restitution: 0.16,
    friction: 0.48,
    frictionAir: 0.008,
    windFactor: 0.2,
    parts: [regularPolygon(12, 24)],
  },
};

function clonePiece(key: keyof typeof BLUEPRINT_LIBRARY, uid: string): PieceBlueprint {
  const tpl = BLUEPRINT_LIBRARY[key];
  return {
    ...tpl,
    id: uid,
    parts: tpl.parts.map((part) => part.map((v) => ({ ...v }))),
  };
}

function pickFrom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function generateDailyTiers(seed: number): TierSpec[] {
  const rng = createRng(seed);

  return [
    {
      tierNumber: 1,
      title: 'Foundation Folio',
      targetType: 'HEIGHT',
      targetValue: 64,
      windStrength: 0,
      pieces: [
        clonePiece('KRAFT_PLANK', 'd_t1_p1'),
        clonePiece(pickFrom(['KRAFT_WEDGE', 'KRAFT_L_CORNER'], rng), 'd_t1_p2'),
        clonePiece(pickFrom(['KRAFT_PILLAR', 'CRESCENT_ARCH'], rng), 'd_t1_p3'),
      ],
    },
    {
      tierNumber: 2,
      title: 'Wide Registration',
      targetType: 'SPAN',
      targetValue: 112,
      windStrength: 0,
      pieces: [
        clonePiece('CRESCENT_ARCH', 'd_t2_p1'),
        clonePiece(pickFrom(['KRAFT_PLANK', 'KRAFT_L_CORNER'], rng), 'd_t2_p2'),
        clonePiece(pickFrom(['ACCORDION', 'KRAFT_WEDGE'], rng), 'd_t2_p3'),
      ],
    },
    {
      tierNumber: 3,
      title: 'Heavy Counterweight',
      targetType: 'HEIGHT',
      targetValue: 78,
      windStrength: (rng() > 0.5 ? 1 : -1) * 0.45,
      pieces: [
        clonePiece(pickFrom(['LEAD_SLUG', 'LEAD_ANVIL'], rng), 'd_t3_p1'),
        clonePiece(pickFrom(['KRAFT_PLANK', 'CRESCENT_ARCH'], rng), 'd_t3_p2'),
        clonePiece(pickFrom(['ORIGAMI_MOTH', 'ACCORDION'], rng), 'd_t3_p3'),
      ],
    },
    {
      tierNumber: 4,
      title: 'Crosswind Tension',
      targetType: 'SPAN',
      targetValue: 126,
      windStrength: (rng() > 0.5 ? 1 : -1) * 0.72,
      pieces: [
        clonePiece('BRASS_PIN', 'd_t4_p1'),
        clonePiece(pickFrom(['KRAFT_L_CORNER', 'CRESCENT_ARCH'], rng), 'd_t4_p2'),
        clonePiece(pickFrom(['LEAD_SLUG', 'ORIGAMI_MOTH'], rng), 'd_t4_p3'),
      ],
    },
    {
      tierNumber: 5,
      title: 'Master Proof',
      targetType: 'HEIGHT',
      targetValue: 96,
      windStrength: (rng() > 0.5 ? 1 : -1) * 0.9,
      pieces: [
        clonePiece('ACCORDION', 'd_t5_p1'),
        clonePiece(pickFrom(['LEAD_ANVIL', 'BRASS_PIN'], rng), 'd_t5_p2'),
        clonePiece('ORIGAMI_MOTH', 'd_t5_p3'),
      ],
    },
  ];
}

export function generateFreePressTier(tierNumber: number, rng: () => number): TierSpec {
  const keys = Object.keys(BLUEPRINT_LIBRARY) as Array<keyof typeof BLUEPRINT_LIBRARY>;
  const targetType = tierNumber % 2 === 1 ? 'HEIGHT' : 'SPAN';
  const targetValue =
    targetType === 'HEIGHT'
      ? Math.min(115, 60 + tierNumber * 8)
      : Math.min(140, 100 + tierNumber * 6);
  const windStrength =
    tierNumber < 2
      ? 0
      : (rng() > 0.5 ? 1 : -1) * Math.min(1, 0.35 + (tierNumber - 2) * 0.14);

  const pieces = [0, 1, 2].map((idx) => {
    const key = pickFrom(keys, rng);
    return clonePiece(key, `fp_t${tierNumber}_p${idx}_${Math.floor(rng() * 1e6)}`);
  });

  return {
    tierNumber,
    title: `Press Sheet ${tierNumber}`,
    targetType,
    targetValue,
    windStrength,
    pieces,
  };
}
