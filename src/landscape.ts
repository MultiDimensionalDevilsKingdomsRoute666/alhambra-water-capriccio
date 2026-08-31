import { WORLD, heightAt } from './worldSpec'

export type SitePlotId =
  | 'generalifeUpper'
  | 'generalifeMiddle'
  | 'generalifeLower'
  | 'albercones'
  | 'palaceLions'
  | 'palaceMuqarnas'
  | 'palaceComares'
  | 'palaceBath'

/**
 * A deliberately authored, level building plot within the otherwise procedural
 * landscape. Coordinates use the world X/Z plane; heights use world Y.
 */
export interface SitePlot {
  readonly id: SitePlotId
  /** [x, z] */
  readonly center: readonly [number, number]
  /** [width, depth] */
  readonly size: readonly [number, number]
  /** Finished walking surface / top of the architectural terrace. */
  readonly floorY: number
  /** Prepared ground beneath the terrace or foundation. */
  readonly foundationY: number
  /** Width of the smooth transition back to natural ground. */
  readonly feather: number
  /** Radius of the footprint's corners in the X/Z plane. */
  readonly cornerRadius: number
}

export const SITE_PLOTS = {
  generalifeUpper: {
    id: 'generalifeUpper',
    center: [-8, -30],
    size: [31, 8],
    floorY: 30.4,
    foundationY: 29.3,
    feather: 4.2,
    cornerRadius: 1.35,
  },
  generalifeMiddle: {
    id: 'generalifeMiddle',
    center: [-5, -20.5],
    size: [34, 8],
    floorY: 28.7,
    foundationY: 27.6,
    feather: 4.2,
    cornerRadius: 1.35,
  },
  generalifeLower: {
    id: 'generalifeLower',
    center: [-1, -11.2],
    size: [32, 7.5],
    floorY: 27.2,
    foundationY: 26.1,
    feather: 4,
    cornerRadius: 1.25,
  },
  albercones: {
    id: 'albercones',
    center: [-31, -36],
    size: [14, 9],
    floorY: 32.2,
    foundationY: 30.7,
    feather: 4.5,
    cornerRadius: 1.6,
  },
  // The palace is not one giant slab. These four overlapping plots describe
  // a chain of compact, stepped hydraulic courts. A shared substructure datum
  // keeps their overlap zones stable while the finished floors retain the
  // gentle water descent between the courts.
  palaceLions: {
    id: 'palaceLions',
    center: [54, -8],
    size: [20.5, 15],
    floorY: 21.9,
    foundationY: 20,
    feather: 3.5,
    cornerRadius: 1.8,
  },
  palaceMuqarnas: {
    id: 'palaceMuqarnas',
    center: [58, -16.3],
    size: [9, 6.4],
    floorY: 21.9,
    foundationY: 20,
    feather: 3,
    cornerRadius: 1.35,
  },
  palaceComares: {
    id: 'palaceComares',
    center: [65, 4],
    size: [23, 13],
    floorY: 21.6,
    foundationY: 20,
    feather: 4,
    cornerRadius: 1.8,
  },
  palaceBath: {
    id: 'palaceBath',
    center: [59, 11],
    size: [11, 8],
    floorY: 21.2,
    foundationY: 20,
    feather: 3,
    cornerRadius: 1.45,
  },
} as const satisfies Readonly<Record<SitePlotId, SitePlot>>

const SITE_PLOT_LIST: readonly SitePlot[] = [
  SITE_PLOTS.generalifeUpper,
  SITE_PLOTS.generalifeMiddle,
  SITE_PLOTS.generalifeLower,
  SITE_PLOTS.albercones,
  SITE_PLOTS.palaceLions,
  SITE_PLOTS.palaceMuqarnas,
  SITE_PLOTS.palaceComares,
  SITE_PLOTS.palaceBath,
]

const MAIN_CANAL_ROUTE = [
  WORLD.water.intake,
  WORLD.water.contourA,
  WORLD.water.contourB,
  WORLD.water.partidor,
  WORLD.water.generalife,
  WORLD.water.waterTower,
] as const

const CANAL_HALF_WIDTH = 2.7
const CANAL_BED_DROP = 0.22
const CANAL_BANK_RISE = 3.3

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function smoothstep01(value: number): number {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

/**
 * Signed distance to an axis-aligned rounded rectangle. Values at or below zero
 * are inside the authored plot.
 */
function roundedPlotDistance(
  x: number,
  z: number,
  plot: SitePlot,
): number {
  const [centerX, centerZ] = plot.center
  const [width, depth] = plot.size
  const halfWidth = width * 0.5
  const halfDepth = depth * 0.5
  const radius = Math.min(
    Math.max(0, plot.cornerRadius),
    halfWidth,
    halfDepth,
  )
  const localX = Math.abs(x - centerX) - (halfWidth - radius)
  const localZ = Math.abs(z - centerZ) - (halfDepth - radius)
  const outside = Math.hypot(
    Math.max(localX, 0),
    Math.max(localZ, 0),
  )
  const inside = Math.min(Math.max(localX, localZ), 0)
  return outside + inside - radius
}

/**
 * Returns the authored plot that owns a point inside a prepared footprint.
 *
 * Palace plots intentionally overlap. Choosing the smallest containing
 * footprint makes the compact inner court authoritative at those overlaps and
 * gives site-detail geometry a stable way to avoid building two retaining walls
 * through the same court. Feather zones are not ownership: they remain terrain.
 */
export function plotOwnerAt(x: number, z: number): SitePlot | null {
  let owner: SitePlot | null = null
  let ownerArea = Number.POSITIVE_INFINITY

  for (const plot of SITE_PLOT_LIST) {
    if (roundedPlotDistance(x, z, plot) > 0) continue
    const area = plot.size[0] * plot.size[1]
    if (area < ownerArea) {
      owner = plot
      ownerArea = area
    }
  }

  return owner
}

function plotInfluenceAt(
  x: number,
  z: number,
  plot: SitePlot,
): number {
  const distance = roundedPlotDistance(x, z, plot)
  if (distance <= 0) return 1
  if (plot.feather <= 0 || distance >= plot.feather) return 0
  return 1 - smoothstep01(distance / plot.feather)
}

export function naturalGroundHeightAt(x: number, z: number): number {
  return heightAt(x, z)
}

/**
 * Returns natural terrain reshaped by all authored plots at once.
 *
 * The target datum is a normalized weighted mean, while the blend strength is
 * the union of every influence. This makes overlapping feather zones
 * commutative: changing SITE_PLOT_LIST order cannot make one plot overwrite
 * another.
 */
export function preparedGroundHeightAt(x: number, z: number): number {
  const naturalHeight = naturalGroundHeightAt(x, z)
  let weightSum = 0
  let weightedFoundationSum = 0
  let uncovered = 1

  for (const plot of SITE_PLOT_LIST) {
    const influence = plotInfluenceAt(x, z, plot)
    if (influence <= 0) continue
    weightSum += influence
    weightedFoundationSum += plot.foundationY * influence
    uncovered *= 1 - influence
  }

  if (weightSum <= 0) return naturalHeight

  const targetHeight = weightedFoundationSum / weightSum
  const combinedInfluence = 1 - uncovered
  return naturalHeight + (targetHeight - naturalHeight) * combinedInfluence
}

/**
 * Prepared terrain with the current Acequia Real route cut into it. Keeping the
 * channel operation last guarantees that a terrace can never fill the canal.
 */
export function groundHeightAt(x: number, z: number): number {
  let groundHeight = preparedGroundHeightAt(x, z)

  for (let i = 0; i < MAIN_CANAL_ROUTE.length - 1; i += 1) {
    const start = MAIN_CANAL_ROUTE[i]
    const end = MAIN_CANAL_ROUTE[i + 1]
    const segmentX = end.x - start.x
    const segmentZ = end.z - start.z
    const segmentLengthSquared =
      segmentX * segmentX + segmentZ * segmentZ
    if (segmentLengthSquared <= Number.EPSILON) continue

    const amount = clamp01(
      ((x - start.x) * segmentX + (z - start.z) * segmentZ) /
        segmentLengthSquared,
    )
    const nearestX = start.x + segmentX * amount
    const nearestZ = start.z + segmentZ * amount
    const distance = Math.hypot(x - nearestX, z - nearestZ)
    if (distance > CANAL_HALF_WIDTH) continue

    const channelY = start.y + (end.y - start.y) * amount
    const bankRise =
      Math.pow(distance / CANAL_HALF_WIDTH, 1.7) *
      CANAL_BANK_RISE
    groundHeight = Math.min(
      groundHeight,
      channelY - CANAL_BED_DROP + bankRise,
    )
  }

  return groundHeight
}

export function getSitePlot(id: SitePlotId): SitePlot {
  return SITE_PLOTS[id]
}
