/** Lightweight open-channel hydraulics used by the explanatory simulation. */

/** Approximate 6.1 km real-world intake run used by the research branch. */
export const CANAL_REAL_LENGTH = 6100
/** Authored scene drop between the intake and the water tower. */
export const CANAL_AUTHORED_DROP = 6
export const CANAL_SLOPE = CANAL_AUTHORED_DROP / CANAL_REAL_LENGTH
/** Mid-range value for a plastered masonry channel. */
export const MANNING_N = 0.015

export const CHANNEL_WIDTH = {
  trunk: 0.78,
  upper: 0.52,
  palace: 0.52,
  drain: 0.42,
} as const

/**
 * Solve the rectangular-channel form of Manning's equation for normal depth.
 * This keeps the visual section and the stated capacity mathematically
 * compatible without pretending the result is a measured Alhambra section.
 */
export function normalDepth(
  capacity: number,
  width: number,
  slope = CANAL_SLOPE,
  roughness = MANNING_N,
): number {
  if (capacity <= 0 || width <= 0 || slope <= 0 || roughness <= 0) return 0

  const dischargeAt = (depth: number): number => {
    const area = width * depth
    const hydraulicRadius = area / (width + depth * 2)
    return (
      (area * Math.pow(hydraulicRadius, 2 / 3) * Math.sqrt(slope)) /
      roughness
    )
  }

  let low = 0
  let high = 1
  while (dischargeAt(high) < capacity && high < 64) high *= 2
  for (let index = 0; index < 56; index += 1) {
    const middle = (low + high) * 0.5
    if (dischargeAt(middle) < capacity) low = middle
    else high = middle
  }
  return (low + high) * 0.5
}

export interface ChannelSection {
  readonly width: number
  readonly fullDepth: number
  readonly freeboard: number
  readonly wallHeight: number
}

export function channelSection(
  width: number,
  capacity: number,
): ChannelSection {
  const fullDepth = normalDepth(capacity, width)
  const freeboard = Math.max(0.12, fullDepth * 0.25)
  return {
    width,
    fullDepth,
    freeboard,
    wallHeight: fullDepth + freeboard,
  }
}

/** Map an edge fill ratio to a readable, non-linear visual water depth. */
export function depthRatio(fill: number): number {
  return Math.pow(clamp01(fill), 0.58)
}

/** Map an edge fill ratio to a readable flow-animation speed. */
export function velocityRatio(fill: number): number {
  return Math.pow(clamp01(fill), 0.34)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}

