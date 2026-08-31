import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { plotOwnerAt, type SitePlot } from '../landscape'
import {
  addOutline,
  enableShadows,
  type SceneRegistry,
} from './geometry'
import type { AlhambraSceneMaterials } from './types'

export type SiteEdge = 'north' | 'east' | 'south' | 'west'

export type GroundSampler = (x: number, z: number) => number

export interface TerraceStairOptions {
  edge?: SiteEdge
  width?: number
  centerOffset?: number
  baseY?: number
  stepCount?: number
  treadDepth?: number
  landingDepth?: number
  curbWidth?: number
}

export interface ButtressRhythmOptions {
  edges?: readonly SiteEdge[]
  spacing?: number
  width?: number
  projection?: number
  baseY?: number
  topInset?: number
  cornerClearance?: number
}

export interface OverflowSpoutOptions {
  edge?: SiteEdge
  centerOffset?: number
  sillDrop?: number
  projection?: number
}

interface PlanPoint {
  x: number
  z: number
}

interface RetainingSample {
  point: PlanPoint
  outward: PlanPoint
  /** Rendered distance from the plot edge to the exposed outer wall face. */
  reach: number
  /** Lowest sampled ground across the retained band, before foundation embed. */
  outerBottomY: number
  /** Finished terrace datum minus the true exterior ground. */
  retained: number
}

interface RetainingRun {
  samples: readonly RetainingSample[]
  closed: boolean
}

interface StripProfile {
  inner: PlanPoint
  outer: PlanPoint
  bottomY: number
  topY: number
}

const DEFAULT_EDGE: SiteEdge = 'south'
const EDGE_ROTATION: Record<SiteEdge, number> = {
  north: -Math.PI / 2,
  east: 0,
  south: Math.PI / 2,
  west: Math.PI,
}

const RETAINED_WALL_THRESHOLD = 0.6
const RETAINING_SAMPLE_STEP = 0.9
const RETAINING_PROBE_STEP = 0.2
const RETAINING_MAX_REACH = 2.6
const RETAINING_MIN_REACH = 0.34
const RETAINING_EMBED = 0.12
const RETAINING_TAPER_THRESHOLD = 0.15
const RETAINING_TAPER_SAMPLES = 2

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function distance2d(a: PlanPoint, b: PlanPoint): number {
  return Math.hypot(b.x - a.x, b.z - a.z)
}

function appendLine(
  points: PlanPoint[],
  from: PlanPoint,
  to: PlanPoint,
  maxSegmentLength: number,
): void {
  const segments = Math.max(1, Math.ceil(distance2d(from, to) / maxSegmentLength))
  if (points.length === 0) {
    points.push(from)
  }
  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments
    points.push({
      x: THREE.MathUtils.lerp(from.x, to.x, t),
      z: THREE.MathUtils.lerp(from.z, to.z, t),
    })
  }
}

function appendArc(
  points: PlanPoint[],
  center: PlanPoint,
  radius: number,
  startAngle: number,
  endAngle: number,
  maxSegmentLength: number,
): void {
  const arcLength = Math.abs(endAngle - startAngle) * radius
  const segments = Math.max(2, Math.ceil(arcLength / maxSegmentLength))
  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments
    const angle = THREE.MathUtils.lerp(startAngle, endAngle, t)
    points.push({
      x: center.x + Math.cos(angle) * radius,
      z: center.z + Math.sin(angle) * radius,
    })
  }
}

function createRoundedPerimeter(
  plot: SitePlot,
  maxSegmentLength = 2.8,
): PlanPoint[] {
  const halfWidth = Math.max(0.2, plot.size[0] * 0.5)
  const halfDepth = Math.max(0.2, plot.size[1] * 0.5)
  const radius = clamp(
    plot.cornerRadius,
    0,
    Math.max(0, Math.min(halfWidth, halfDepth) - 0.08),
  )
  const points: PlanPoint[] = []

  if (radius < 0.04) {
    appendLine(
      points,
      { x: halfWidth, z: halfDepth },
      { x: -halfWidth, z: halfDepth },
      maxSegmentLength,
    )
    appendLine(
      points,
      { x: -halfWidth, z: halfDepth },
      { x: -halfWidth, z: -halfDepth },
      maxSegmentLength,
    )
    appendLine(
      points,
      { x: -halfWidth, z: -halfDepth },
      { x: halfWidth, z: -halfDepth },
      maxSegmentLength,
    )
    appendLine(
      points,
      { x: halfWidth, z: -halfDepth },
      { x: halfWidth, z: halfDepth },
      maxSegmentLength,
    )
  } else {
    appendLine(
      points,
      { x: halfWidth - radius, z: halfDepth },
      { x: -halfWidth + radius, z: halfDepth },
      maxSegmentLength,
    )
    appendArc(
      points,
      { x: -halfWidth + radius, z: halfDepth - radius },
      radius,
      Math.PI / 2,
      Math.PI,
      maxSegmentLength,
    )
    appendLine(
      points,
      { x: -halfWidth, z: halfDepth - radius },
      { x: -halfWidth, z: -halfDepth + radius },
      maxSegmentLength,
    )
    appendArc(
      points,
      { x: -halfWidth + radius, z: -halfDepth + radius },
      radius,
      Math.PI,
      Math.PI * 1.5,
      maxSegmentLength,
    )
    appendLine(
      points,
      { x: -halfWidth + radius, z: -halfDepth },
      { x: halfWidth - radius, z: -halfDepth },
      maxSegmentLength,
    )
    appendArc(
      points,
      { x: halfWidth - radius, z: -halfDepth + radius },
      radius,
      Math.PI * 1.5,
      Math.PI * 2,
      maxSegmentLength,
    )
    appendLine(
      points,
      { x: halfWidth, z: -halfDepth + radius },
      { x: halfWidth, z: halfDepth - radius },
      maxSegmentLength,
    )
    appendArc(
      points,
      { x: halfWidth - radius, z: halfDepth - radius },
      radius,
      0,
      Math.PI / 2,
      maxSegmentLength,
    )
  }

  if (
    points.length > 1
    && distance2d(points[0], points[points.length - 1]) < 0.001
  ) {
    points.pop()
  }
  return points
}

function calculateOutwardNormals(points: readonly PlanPoint[]): PlanPoint[] {
  return points.map((_, index) => {
    const previous = points[(index - 1 + points.length) % points.length]
    const next = points[(index + 1) % points.length]
    const tangentX = next.x - previous.x
    const tangentZ = next.z - previous.z
    const length = Math.max(0.0001, Math.hypot(tangentX, tangentZ))
    return {
      x: tangentZ / length,
      z: -tangentX / length,
    }
  })
}

function offsetPoint(
  point: PlanPoint,
  outward: PlanPoint,
  distance: number,
): PlanPoint {
  return {
    x: point.x + outward.x * distance,
    z: point.z + outward.z * distance,
  }
}

function toVector3(point: PlanPoint, y: number): THREE.Vector3 {
  return new THREE.Vector3(point.x, y, point.z)
}

function addQuad(
  positions: number[],
  indices: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
  normalHint: THREE.Vector3,
): void {
  const edgeA = new THREE.Vector3().subVectors(b, a)
  const edgeB = new THREE.Vector3().subVectors(c, a)
  const normal = new THREE.Vector3().crossVectors(edgeA, edgeB)
  const vertices = normal.dot(normalHint) >= 0
    ? [a, b, c, d]
    : [a, d, c, b]
  const start = positions.length / 3
  for (const vertex of vertices) {
    positions.push(vertex.x, vertex.y, vertex.z)
  }
  indices.push(
    start,
    start + 1,
    start + 2,
    start,
    start + 2,
    start + 3,
  )
}

function finishGeometry(
  positions: number[],
  indices: number[],
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  )
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

function finiteGroundAt(
  sampler: GroundSampler | undefined,
  x: number,
  z: number,
  fallback: number,
): number {
  const sampled = sampler?.(x, z)
  return sampled !== undefined && Number.isFinite(sampled)
    ? sampled
    : fallback
}

/**
 * Samples a narrow earthwork band outside the rounded plot. The probe stops
 * before entering another authored footprint, so a Generalife terrace cannot
 * push its retaining mass into the next terrace and nested palace courts do not
 * receive duplicate walls.
 */
function sampleRetainingPerimeter(
  plot: SitePlot,
  groundSampler: GroundSampler | undefined,
): RetainingSample[] {
  const points = createRoundedPerimeter(plot, RETAINING_SAMPLE_STEP)
  const outwardNormals = calculateOutwardNormals(points)
  const wantedReach = clamp(
    plot.feather * 0.5,
    RETAINING_MIN_REACH,
    RETAINING_MAX_REACH,
  )

  return points.map((point, index) => {
    const outward = outwardNormals[index]
    const worldX = plot.center[0] + point.x
    const worldZ = plot.center[1] + point.z
    let reach = 0
    let lowestGround = finiteGroundAt(
      groundSampler,
      worldX + outward.x * 0.03,
      worldZ + outward.z * 0.03,
      plot.foundationY,
    )
    let adjacentPlot: SitePlot | null = null

    for (
      let distance = RETAINING_PROBE_STEP;
      distance <= wantedReach + 1e-6;
      distance += RETAINING_PROBE_STEP
    ) {
      const sampleX = worldX + outward.x * distance
      const sampleZ = worldZ + outward.z * distance
      const owner = plotOwnerAt(sampleX, sampleZ)
      if (owner !== null && owner !== plot) {
        adjacentPlot = owner
        break
      }
      reach = distance
      lowestGround = Math.min(
        lowestGround,
        finiteGroundAt(
          groundSampler,
          sampleX,
          sampleZ,
          plot.foundationY,
        ),
      )
    }

    // If another plot begins directly across the edge, the exterior datum is
    // that court's walking surface, not its buried foundation. Only a terrace
    // genuinely higher than its neighbour may own a thin step wall here.
    if (adjacentPlot !== null && reach < RETAINING_MIN_REACH) {
      const neighbourY = adjacentPlot.floorY
      return {
        point,
        outward,
        reach: Math.max(0.12, reach),
        outerBottomY: neighbourY,
        retained: plot.floorY - neighbourY,
      }
    }

    return {
      point,
      outward,
      reach: Math.max(RETAINING_MIN_REACH, reach),
      outerBottomY: lowestGround,
      retained: plot.floorY - lowestGround,
    }
  })
}

/** Splits cyclic perimeter samples into the runs that actually retain soil. */
function buildRetainingRuns(
  samples: readonly RetainingSample[],
): RetainingRun[] {
  if (samples.length < 2) return []
  const required = samples.map(
    (sample) => sample.retained >= RETAINED_WALL_THRESHOLD,
  )
  if (required.every(Boolean)) {
    return [{ samples: [...samples], closed: true }]
  }
  if (required.every((value) => !value)) return []

  const keep = required.map((value, index) => {
    if (value) return true
    if (samples[index].retained < RETAINING_TAPER_THRESHOLD) return false
    for (let offset = 1; offset <= RETAINING_TAPER_SAMPLES; offset += 1) {
      const before = (index - offset + samples.length * 2) % samples.length
      const after = (index + offset) % samples.length
      if (required[before] || required[after]) return true
    }
    return false
  })

  const firstGap = keep.indexOf(false)
  const runs: RetainingRun[] = []
  let current: RetainingSample[] = []
  for (let offset = 1; offset <= samples.length; offset += 1) {
    const index = (firstGap + offset) % samples.length
    if (keep[index]) {
      current.push(samples[index])
      continue
    }
    if (current.length >= 2) {
      runs.push({ samples: current, closed: false })
    }
    current = []
  }
  if (current.length >= 2) {
    runs.push({ samples: current, closed: false })
  }
  return runs
}

function createStripGeometry(
  profiles: readonly StripProfile[],
  closed: boolean,
): THREE.BufferGeometry | null {
  if (profiles.length < 2) return null
  const positions: number[] = []
  const indices: number[] = []
  const up = new THREE.Vector3(0, 1, 0)
  const down = new THREE.Vector3(0, -1, 0)
  const segmentCount = closed ? profiles.length : profiles.length - 1

  for (let index = 0; index < segmentCount; index += 1) {
    const current = profiles[index]
    const next = profiles[(index + 1) % profiles.length]
    const outwardHint = new THREE.Vector3(
      (current.outer.x - current.inner.x)
        + (next.outer.x - next.inner.x),
      0,
      (current.outer.z - current.inner.z)
        + (next.outer.z - next.inner.z),
    ).normalize()
    addQuad(
      positions,
      indices,
      toVector3(current.outer, current.topY),
      toVector3(next.outer, next.topY),
      toVector3(next.outer, next.bottomY),
      toVector3(current.outer, current.bottomY),
      outwardHint,
    )
    addQuad(
      positions,
      indices,
      toVector3(current.inner, current.topY),
      toVector3(current.inner, current.bottomY),
      toVector3(next.inner, next.bottomY),
      toVector3(next.inner, next.topY),
      outwardHint.clone().multiplyScalar(-1),
    )
    addQuad(
      positions,
      indices,
      toVector3(current.inner, current.topY),
      toVector3(next.inner, next.topY),
      toVector3(next.outer, next.topY),
      toVector3(current.outer, current.topY),
      up,
    )
    addQuad(
      positions,
      indices,
      toVector3(current.inner, current.bottomY),
      toVector3(current.outer, current.bottomY),
      toVector3(next.outer, next.bottomY),
      toVector3(next.inner, next.bottomY),
      down,
    )
  }

  if (!closed) {
    for (const [profile, neighbour] of [
      [profiles[0], profiles[1]],
      [profiles[profiles.length - 1], profiles[profiles.length - 2]],
    ] as const) {
      const endHint = new THREE.Vector3(
        profile.inner.x - neighbour.inner.x,
        0,
        profile.inner.z - neighbour.inner.z,
      ).normalize()
      addQuad(
        positions,
        indices,
        toVector3(profile.inner, profile.topY),
        toVector3(profile.outer, profile.topY),
        toVector3(profile.outer, profile.bottomY),
        toVector3(profile.inner, profile.bottomY),
        endHint,
      )
    }
  }

  return finishGeometry(positions, indices)
}

function bodyProfile(
  sample: RetainingSample,
  topY: number,
): StripProfile {
  return {
    inner: sample.point,
    outer: offsetPoint(sample.point, sample.outward, sample.reach),
    bottomY: Math.min(
      sample.outerBottomY - RETAINING_EMBED,
      topY - 0.26,
    ),
    topY,
  }
}

function copingProfile(
  sample: RetainingSample,
  bottomY: number,
  topY: number,
): StripProfile {
  const overhang = 0.06
  return {
    inner: offsetPoint(sample.point, sample.outward, -overhang),
    outer: offsetPoint(
      sample.point,
      sample.outward,
      sample.reach + overhang,
    ),
    bottomY,
    topY,
  }
}

function createCourseLines(
  runs: readonly RetainingRun[],
  topY: number,
  ink: THREE.LineBasicMaterial,
): THREE.LineSegments | null {
  const positions: number[] = []

  for (const run of runs) {
    const segmentCount = run.closed
      ? run.samples.length
      : run.samples.length - 1
    for (let index = 0; index < segmentCount; index += 1) {
      const current = run.samples[index]
      const next = run.samples[(index + 1) % run.samples.length]
      const visibleHeight = Math.min(
        topY - current.outerBottomY,
        topY - next.outerBottomY,
      )
      if (visibleHeight <= 0.5) continue
      const spacing = clamp(visibleHeight / 5.5, 0.56, 0.86)
      const count = Math.min(8, Math.floor(visibleHeight / spacing))
      const currentOuter = offsetPoint(
        current.point,
        current.outward,
        current.reach + 0.014,
      )
      const nextOuter = offsetPoint(
        next.point,
        next.outward,
        next.reach + 0.014,
      )
      for (let course = 1; course <= count; course += 1) {
        const y = topY - course * spacing
        if (y <= Math.max(
          current.outerBottomY,
          next.outerBottomY,
        ) + 0.06) {
          continue
        }
        positions.push(
          currentOuter.x,
          y,
          currentOuter.z,
          nextOuter.x,
          y,
          nextOuter.z,
        )
      }
    }
  }

  if (positions.length === 0) return null
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  )
  const lines = new THREE.LineSegments(geometry, ink)
  lines.renderOrder = 4
  lines.userData.isSceneOutline = true
  return lines
}

function registerStone(mesh: THREE.Mesh, registry: SceneRegistry): void {
  mesh.castShadow = true
  mesh.receiveShadow = true
  registry.wettableStone.push(mesh)
}

function edgeSpan(plot: SitePlot, edge: SiteEdge): number {
  return edge === 'north' || edge === 'south'
    ? plot.size[0]
    : plot.size[1]
}

function edgeOrigin(
  plot: SitePlot,
  edge: SiteEdge,
  centerOffset: number,
  outwardOffset = 0,
): PlanPoint {
  const halfWidth = plot.size[0] * 0.5
  const halfDepth = plot.size[1] * 0.5
  switch (edge) {
    case 'north':
      return { x: centerOffset, z: halfDepth + outwardOffset }
    case 'east':
      return { x: halfWidth + outwardOffset, z: centerOffset }
    case 'south':
      return { x: centerOffset, z: -halfDepth - outwardOffset }
    case 'west':
      return { x: -halfWidth - outwardOffset, z: centerOffset }
  }
}

function mergeGeometryList(
  geometries: readonly THREE.BufferGeometry[],
): THREE.BufferGeometry {
  const merged = mergeGeometries([...geometries], false)
  if (merged === null) {
    throw new Error('Unable to merge compatible site-detail geometries.')
  }
  return merged
}

/**
 * Creates only the retaining-wall runs where the terrace stands materially
 * above its exterior ground. Each run reaches across the authored feather band,
 * embeds below the lowest sampled exterior datum and closes its exposed ends.
 */
export function createRetainingWall(
  plot: SitePlot,
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
  groundSampler?: GroundSampler,
): THREE.Group {
  const group = new THREE.Group()
  group.name = `site-${plot.id}-retaining-wall`
  group.position.set(plot.center[0], 0, plot.center[1])
  group.userData.siteDetail = 'retaining-wall'
  group.userData.siteId = plot.id

  const copingHeight = clamp(
    Math.abs(plot.floorY - plot.foundationY) * 0.08,
    0.14,
    0.24,
  )
  const wallTopY = plot.floorY - copingHeight
  const samples = sampleRetainingPerimeter(plot, groundSampler)
  const runs = buildRetainingRuns(samples)
  group.userData.retainingRunCount = runs.length
  group.userData.retainingSampleCount = samples.length
  if (runs.length === 0) return group

  const addBatchedGeometry = (
    geometries: THREE.BufferGeometry[],
    material: THREE.Material,
    name: string,
    outlineThreshold: number,
  ): void => {
    if (geometries.length === 0) return
    const merged = geometries.length === 1
      ? geometries[0]
      : mergeGeometries(geometries, false)
    if (merged !== null) {
      const mesh = new THREE.Mesh(merged, material)
      mesh.name = name
      addOutline(mesh, materials.ink, mesh, outlineThreshold)
      registerStone(mesh, registry)
      group.add(mesh)
      if (geometries.length > 1) {
        for (const geometry of geometries) geometry.dispose()
      }
      return
    }
    for (const [index, geometry] of geometries.entries()) {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = `${name}-${index + 1}`
      addOutline(mesh, materials.ink, mesh, outlineThreshold)
      registerStone(mesh, registry)
      group.add(mesh)
    }
  }

  const bodyGeometries: THREE.BufferGeometry[] = []
  const copingGeometries: THREE.BufferGeometry[] = []
  for (const run of runs) {
    const body = createStripGeometry(
      run.samples.map((sample) => bodyProfile(sample, wallTopY)),
      run.closed,
    )
    if (body !== null) bodyGeometries.push(body)
    const coping = createStripGeometry(
      run.samples.map((sample) => copingProfile(
        sample,
        wallTopY,
        plot.floorY,
      )),
      run.closed,
    )
    if (coping !== null) copingGeometries.push(coping)
  }
  addBatchedGeometry(
    bodyGeometries,
    materials.stone,
    'retaining-wall-curtain',
    38,
  )
  addBatchedGeometry(
    copingGeometries,
    materials.paleStone,
    'retaining-wall-coping',
    34,
  )

  const courses = createCourseLines(runs, wallTopY, materials.ink)
  if (courses !== null) {
    courses.name = 'retaining-wall-courses'
    group.add(courses)
  }

  enableShadows(group)
  return group
}

/**
 * Creates one monolithic stepped body with two sloping cheek walls. All three
 * solids are merged into one outlined mesh, keeping a large stair at two draws.
 */
export function createTerraceStair(
  plot: SitePlot,
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
  options: TerraceStairOptions = {},
): THREE.Group {
  const edge = options.edge ?? DEFAULT_EDGE
  const group = new THREE.Group()
  group.name = `site-${plot.id}-terrace-stair`
  group.userData.siteDetail = 'terrace-stair'
  group.userData.siteId = plot.id

  const span = edgeSpan(plot, edge)
  const cornerClearance = Math.max(0.35, plot.cornerRadius + 0.28)
  const maximumWidth = Math.max(0.8, span - cornerClearance * 2)
  const width = clamp(
    options.width ?? Math.min(5.2, span * 0.46),
    0.8,
    maximumWidth,
  )
  const centerLimit = Math.max(0, (span - width) * 0.5 - cornerClearance)
  const centerOffset = clamp(
    options.centerOffset ?? 0,
    -centerLimit,
    centerLimit,
  )
  const baseY = Math.min(
    options.baseY ?? plot.foundationY,
    plot.floorY - 0.32,
  )
  const totalRise = plot.floorY - baseY
  const stepCount = Math.round(clamp(
    options.stepCount ?? Math.round(totalRise / 0.22),
    2,
    24,
  ))
  const riserHeight = totalRise / stepCount
  const treadDepth = clamp(
    options.treadDepth ?? riserHeight * 1.45 + 0.12,
    0.28,
    0.5,
  )
  const landingDepth = clamp(options.landingDepth ?? 0.82, 0.35, 1.8)
  const curbWidth = clamp(options.curbWidth ?? 0.22, 0.12, width * 0.12)
  const run = landingDepth + stepCount * treadDepth

  const stairProfile = new THREE.Shape()
  stairProfile.moveTo(0, 0)
  stairProfile.lineTo(0, totalRise)
  stairProfile.lineTo(landingDepth, totalRise)
  for (let step = 0; step < stepCount; step += 1) {
    const outerX = landingDepth + (step + 1) * treadDepth
    const treadY = totalRise - step * riserHeight
    const nextY = totalRise - (step + 1) * riserHeight
    stairProfile.lineTo(outerX, treadY)
    stairProfile.lineTo(outerX, nextY)
  }
  stairProfile.lineTo(0, 0)

  const stairGeometry = new THREE.ExtrudeGeometry(stairProfile, {
    depth: width,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  })
  stairGeometry.translate(0, 0, -width * 0.5)

  const curbHeight = clamp(totalRise * 0.1, 0.24, 0.42)
  const curbProfile = new THREE.Shape()
  curbProfile.moveTo(0, 0)
  curbProfile.lineTo(0, totalRise + curbHeight)
  curbProfile.lineTo(run, curbHeight)
  curbProfile.lineTo(run, 0)
  curbProfile.lineTo(0, 0)

  const leftCurb = new THREE.ExtrudeGeometry(curbProfile, {
    depth: curbWidth,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  })
  leftCurb.translate(0, 0, -width * 0.5 - curbWidth)
  const rightCurb = leftCurb.clone()
  rightCurb.translate(0, 0, width + curbWidth)

  const mergedGeometry = mergeGeometryList([
    stairGeometry,
    leftCurb,
    rightCurb,
  ])
  stairGeometry.dispose()
  leftCurb.dispose()
  rightCurb.dispose()

  const stair = new THREE.Mesh(mergedGeometry, materials.paleStone)
  stair.name = 'terrace-stair-body'
  addOutline(stair, materials.ink, stair, 26)
  registerStone(stair, registry)
  group.add(stair)

  const origin = edgeOrigin(plot, edge, centerOffset)
  group.position.set(
    plot.center[0] + origin.x,
    baseY,
    plot.center[1] + origin.z,
  )
  group.rotation.y = EDGE_ROTATION[edge]
  enableShadows(group)
  return group
}

function createButtressProfileGeometry(
  height: number,
  width: number,
  projection: number,
): THREE.ExtrudeGeometry {
  const toeHeight = clamp(height * 0.2, 0.2, 0.5)
  const profile = new THREE.Shape()
  profile.moveTo(0, 0)
  profile.lineTo(0, height)
  profile.lineTo(projection, toeHeight)
  profile.lineTo(projection, 0)
  profile.lineTo(0, 0)
  const geometry = new THREE.ExtrudeGeometry(profile, {
    depth: width,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  })
  geometry.translate(0, 0, -width * 0.5)
  return geometry
}

/**
 * Adds a sparse, evenly centered rhythm of tapered buttresses to selected plot
 * edges. Every buttress is baked into one geometry before the outline is made.
 */
export function createButtressRhythm(
  plot: SitePlot,
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
  options: ButtressRhythmOptions = {},
): THREE.Group {
  const group = new THREE.Group()
  group.name = `site-${plot.id}-buttress-rhythm`
  group.position.set(plot.center[0], 0, plot.center[1])
  group.userData.siteDetail = 'buttress-rhythm'
  group.userData.siteId = plot.id

  const edges = options.edges ?? ['north', 'east', 'south', 'west']
  const baseY = options.baseY ?? plot.foundationY
  const topY = plot.floorY - clamp(options.topInset ?? 0.18, 0, 0.8)
  const height = topY - baseY
  if (height < 0.28 || edges.length === 0) {
    return group
  }

  const spacing = clamp(
    options.spacing ?? Math.min(...plot.size) * 0.36,
    3.2,
    6.4,
  )
  const width = clamp(options.width ?? 0.62, 0.35, 1.1)
  const projection = clamp(options.projection ?? 0.86, 0.42, 1.6)
  const cornerClearance = Math.max(
    options.cornerClearance ?? spacing * 0.62,
    plot.cornerRadius + width,
  )
  const source = createButtressProfileGeometry(height, width, projection)
  const instances: THREE.BufferGeometry[] = []

  for (const edge of edges) {
    const span = edgeSpan(plot, edge)
    const usableSpan = span - cornerClearance * 2
    if (usableSpan < width) {
      continue
    }
    const count = Math.max(1, Math.floor(usableSpan / spacing) + 1)
    const interval = count > 1 ? usableSpan / (count - 1) : 0
    for (let index = 0; index < count; index += 1) {
      const offset = count === 1
        ? 0
        : -usableSpan * 0.5 + index * interval
      const origin = edgeOrigin(plot, edge, offset, 0.01)
      const geometry = source.clone()
      const transform = new THREE.Matrix4().compose(
        new THREE.Vector3(origin.x, baseY, origin.z),
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          EDGE_ROTATION[edge],
        ),
        new THREE.Vector3(1, 1, 1),
      )
      geometry.applyMatrix4(transform)
      instances.push(geometry)
    }
  }
  source.dispose()

  if (instances.length === 0) {
    return group
  }
  const mergedGeometry = mergeGeometryList(instances)
  for (const geometry of instances) {
    geometry.dispose()
  }
  const buttresses = new THREE.Mesh(mergedGeometry, materials.stone)
  buttresses.name = 'terrace-buttresses'
  addOutline(buttresses, materials.ink, buttresses, 28)
  registerStone(buttresses, registry)
  group.add(buttresses)
  enableShadows(group)
  return group
}

/**
 * A compact stone overflow detail for a retaining-wall edge. It intentionally
 * remains dry: callers can align a water ribbon or particle drip to the nozzle.
 */
export function createOverflowSpout(
  plot: SitePlot,
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
  options: OverflowSpoutOptions = {},
): THREE.Group {
  const edge = options.edge ?? DEFAULT_EDGE
  const group = new THREE.Group()
  group.name = `site-${plot.id}-overflow-spout`
  group.userData.siteDetail = 'overflow-spout'
  group.userData.siteId = plot.id

  const span = edgeSpan(plot, edge)
  const centerLimit = Math.max(0, span * 0.5 - plot.cornerRadius - 0.5)
  const centerOffset = clamp(
    options.centerOffset ?? 0,
    -centerLimit,
    centerLimit,
  )
  const projection = clamp(options.projection ?? 0.72, 0.38, 1.2)
  const sillY = plot.floorY - clamp(options.sillDrop ?? 0.72, 0.34, 1.5)
  const origin = edgeOrigin(plot, edge, centerOffset, 0.02)
  group.position.set(
    plot.center[0] + origin.x,
    sillY,
    plot.center[1] + origin.z,
  )
  group.rotation.y = EDGE_ROTATION[edge]

  const niche = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.62, 0.54),
    materials.deepStone,
  )
  niche.name = 'overflow-niche'
  niche.position.x = 0.03
  addOutline(niche, materials.ink)
  registerStone(niche, registry)
  group.add(niche)

  const corbel = new THREE.Mesh(
    new THREE.BoxGeometry(projection * 0.76, 0.13, 0.4),
    materials.paleStone,
  )
  corbel.name = 'overflow-corbel'
  corbel.position.set(projection * 0.4, -0.22, 0)
  addOutline(corbel, materials.ink)
  registerStone(corbel, registry)
  group.add(corbel)

  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.13, projection, 8, 1, true),
    materials.paleStone,
  )
  nozzle.name = 'overflow-nozzle'
  nozzle.rotation.z = -Math.PI / 2
  nozzle.position.set(projection * 0.52, -0.02, 0)
  addOutline(nozzle, materials.ink, nozzle, 34)
  registerStone(nozzle, registry)
  group.add(nozzle)

  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(0.115, 0.035, 4, 8),
    materials.paleStone,
  )
  lip.name = 'overflow-lip'
  lip.rotation.y = Math.PI / 2
  lip.position.set(projection + 0.035, -0.02, 0)
  addOutline(lip, materials.ink, lip, 30)
  registerStone(lip, registry)
  group.add(lip)

  enableShadows(group)
  return group
}
