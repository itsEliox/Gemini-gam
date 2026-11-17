import type { Vec2 } from './types.ts';

const EPS = 1e-6;
const MIN_FRAGMENT_AREA = 140;

function sideOfLine(p: Vec2, a: Vec2, b: Vec2): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

function lerpPoint(p1: Vec2, p2: Vec2, t: number): Vec2 {
  return {
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t,
  };
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const s1 = sideOfLine(c, a, b);
  const s2 = sideOfLine(d, a, b);
  const s3 = sideOfLine(a, c, d);
  const s4 = sideOfLine(b, c, d);
  return ((s1 > EPS && s2 < -EPS) || (s1 < -EPS && s2 > EPS)) &&
         ((s3 > EPS && s4 < -EPS) || (s3 < -EPS && s4 > EPS));
}

export function polygonArea(verts: Vec2[]): number {
  if (verts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) * 0.5;
}

export function polygonCentroid(verts: Vec2[]): Vec2 {
  if (verts.length === 0) return { x: 0, y: 0 };
  let signedArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    const cross = a.x * b.y - b.x * a.y;
    signedArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  signedArea *= 0.5;
  if (Math.abs(signedArea) < EPS) {
    const avgX = verts.reduce((acc, v) => acc + v.x, 0) / verts.length;
    const avgY = verts.reduce((acc, v) => acc + v.y, 0) / verts.length;
    return { x: avgX, y: avgY };
  }
  return {
    x: cx / (6 * signedArea),
    y: cy / (6 * signedArea),
  };
}

function cleanPolygon(verts: Vec2[]): Vec2[] {
  const deduped: Vec2[] = [];
  for (const v of verts) {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.hypot(v.x - prev.x, v.y - prev.y) > 0.75) {
      deduped.push(v);
    }
  }
  if (deduped.length > 1) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) <= 0.75) {
      deduped.pop();
    }
  }
  if (deduped.length < 3) return [];

  // Ensure CCW winding for Matter.js compatibility
  let signedArea = 0;
  for (let i = 0; i < deduped.length; i++) {
    const a = deduped[i];
    const b = deduped[(i + 1) % deduped.length];
    signedArea += a.x * b.y - b.x * a.y;
  }
  if (signedArea < 0) {
    deduped.reverse();
  }
  return deduped;
}

export function segmentHitsPolygon(verts: Vec2[], segA: Vec2, segB: Vec2): boolean {
  if (verts.length < 3) return false;
  let crossings = 0;
  for (let i = 0; i < verts.length; i++) {
    const p1 = verts[i];
    const p2 = verts[(i + 1) % verts.length];
    if (segmentsIntersect(segA, segB, p1, p2)) {
      crossings++;
    }
  }
  return crossings >= 2;
}

export function splitConvexPolygon(
  verts: Vec2[],
  lineA: Vec2,
  lineB: Vec2
): { left: Vec2[]; right: Vec2[] } {
  const leftRaw: Vec2[] = [];
  const rightRaw: Vec2[] = [];

  for (let i = 0; i < verts.length; i++) {
    const curr = verts[i];
    const next = verts[(i + 1) % verts.length];
    const d1 = sideOfLine(curr, lineA, lineB);
    const d2 = sideOfLine(next, lineA, lineB);

    if (d1 >= -EPS) {
      leftRaw.push(curr);
    }
    if (d1 <= EPS) {
      rightRaw.push(curr);
    }

    if ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) {
      const t = d1 / (d1 - d2);
      const hit = lerpPoint(curr, next, t);
      leftRaw.push(hit);
      rightRaw.push(hit);
    }
  }

  return {
    left: cleanPolygon(leftRaw),
    right: cleanPolygon(rightRaw),
  };
}

export interface SlicedFragments {
  leftParts: Vec2[][];
  rightParts: Vec2[][];
}

/**
 * Slices a compound convex-part body by finite cut segment (segA, segB).
 * Returns null if the segment does not cleanly sever the body into two valid fragments.
 */
export function sliceBodyParts(
  worldParts: Vec2[][],
  segA: Vec2,
  segB: Vec2
): SlicedFragments | null {
  const hitsAny = worldParts.some((part) => segmentHitsPolygon(part, segA, segB));
  if (!hitsAny) return null;

  const leftParts: Vec2[][] = [];
  const rightParts: Vec2[][] = [];

  for (const part of worldParts) {
    const { left, right } = splitConvexPolygon(part, segA, segB);
    if (left.length >= 3 && polygonArea(left) >= MIN_FRAGMENT_AREA) {
      leftParts.push(left);
    }
    if (right.length >= 3 && polygonArea(right) >= MIN_FRAGMENT_AREA) {
      rightParts.push(right);
    }
  }

  if (leftParts.length === 0 || rightParts.length === 0) {
    return null;
  }

  return { leftParts, rightParts };
}
