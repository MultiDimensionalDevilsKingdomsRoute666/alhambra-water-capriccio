/**
 * Hydraulic storage values shared by the network solver and, later, the
 * visible water-level animation.  These are intentionally compact design
 * values: this project explains the system rather than reproducing a survey.
 */

export interface BasinSpec {
  /** Plan area in square metres. */
  readonly area: number
  /** Useful water depth in metres. */
  readonly depth: number
  /** Storage volume in cubic metres. */
  readonly volume: number
  /** Approximate time constant used when a full basin drains. */
  readonly drainTime: number
}

function basin(
  area: number,
  depth: number,
  drainTime: number,
  volume = area * depth,
): BasinSpec {
  return { area, depth, volume, drainTime }
}

export const BASINS = {
  // The four shallow rills plus the central fountain bowl are treated as one
  // small, quick-responding store.
  lions: basin(13.8, 0.12, 26),
  // A shallow reflecting depth is enough for the visual idea of the court.
  comares: basin(12.2 * 2.9, 0.45, 140),
  // Several bath basins are collapsed into one explanatory store.
  bath: basin(20, 0.6, 95),
  // The 400 m3 figure is retained from the Claude research branch.  It is a
  // long-term reservoir, so visual demonstrations should accelerate time.
  albercones: basin(12 * 7.6, 400 / (12 * 7.6), 16 * 60 * 60, 400),
  // The Patio de la Acequia is represented as a modest hydraulic buffer.
  generalife: basin(21, 0.28, 110),
} as const satisfies Readonly<Record<string, BasinSpec>>

