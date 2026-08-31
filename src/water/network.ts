import { BASINS } from './basins'
import {
  WATER_EDGES,
  WATER_NODES,
  type WaterEdgeSpec,
  type WaterNodeId,
} from './graph'

/**
 * A small quasi-steady network model.  It is deliberately not CFD: its job is
 * to make gates, lifting, storage and overflow causally legible while keeping
 * the scene light enough for an interactive browser.
 */

export interface WaterControls {
  /** Intake sluice opening, 0..1. */
  intakeGate: number
  /** Water available in the Darro, 0..1. */
  supply: number
  /** Low/main branch gate below the partidor, 0..1. */
  mainGate: number
  /** High branch gate below the partidor, 0..1. */
  tercioGate: number
  /** Animal-powered lift drive, 0..1. */
  liftDrive: number
}

export interface EdgeFlow {
  readonly spec: WaterEdgeSpec
  readonly capacity: number
  flow: number
  fill: number
}

export interface NodeFlow {
  readonly id: WaterNodeId
  inflow: number
  outflow: number
  storage: number
  dStorage: number
  spill: number
}

export interface NetworkState {
  readonly nodes: Record<WaterNodeId, NodeFlow>
  readonly edges: Record<string, EdgeFlow>
  elapsed: number
}

/** A modest explanatory intake capacity in cubic metres per second. */
export const INTAKE_CAPACITY = 0.42

/**
 * Approximate lift capacity derived from a 600 W animal drive, 50% efficiency
 * and a 17.4 m head.  The value is useful for relative behaviour, not a claim
 * about the historic machine's exact output.
 */
export const LIFT_CAPACITY = (600 * 0.5) / (1000 * 9.81 * 17.4)

const EDGE_CAPACITY: Readonly<Record<string, number>> = {
  'intake-contour-a': INTAKE_CAPACITY,
  'contour-a-b': INTAKE_CAPACITY,
  'contour-b-partidor': INTAKE_CAPACITY,
  'partidor-generalife': 0.29,
  'partidor-albercones': LIFT_CAPACITY,
  'generalife-tower': 0.26,
  'albercones-tower': LIFT_CAPACITY,
  'tower-city': 0.26,
  'city-lions': 0.08,
  'city-comares': 0.1,
  'city-bath': 0.07,
  'lions-drain': 0.12,
  'comares-drain': 0.14,
  'bath-drain': 0.11,
}

const STORAGE_CAPACITY: Partial<Record<WaterNodeId, number>> = {
  albercones: BASINS.albercones.volume,
  lions: BASINS.lions.volume,
  comares: BASINS.comares.volume,
  bath: BASINS.bath.volume,
}

const STORAGE_TAU: Partial<Record<WaterNodeId, number>> = {
  albercones: BASINS.albercones.drainTime,
  lions: BASINS.lions.drainTime,
  comares: BASINS.comares.drainTime,
  bath: BASINS.bath.drainTime,
}

export function edgeKey(from: WaterNodeId, to: WaterNodeId): string {
  return `${from}->${to}`
}

export function capacityOf(spec: WaterEdgeSpec): number {
  return EDGE_CAPACITY[spec.id] ?? 0.05
}

const OUT_EDGES = new Map<WaterNodeId, WaterEdgeSpec[]>()
for (const spec of WATER_EDGES) {
  const list = OUT_EDGES.get(spec.from)
  if (list) list.push(spec)
  else OUT_EDGES.set(spec.from, [spec])
}

/** Derived topological order also acts as a guard against accidental cycles. */
export const TOPO_ORDER: readonly WaterNodeId[] = (() => {
  const indegree = new Map<WaterNodeId, number>()
  const downstream = new Map<WaterNodeId, WaterNodeId[]>()
  for (const node of WATER_NODES) {
    indegree.set(node.id, 0)
    downstream.set(node.id, [])
  }
  for (const edge of WATER_EDGES) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1)
    downstream.get(edge.from)?.push(edge.to)
  }

  const queue = WATER_NODES
    .map((node) => node.id)
    .filter((id) => indegree.get(id) === 0)
  const order: WaterNodeId[] = []
  while (queue.length > 0) {
    const id = queue.shift() as WaterNodeId
    order.push(id)
    for (const next of downstream.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1
      indegree.set(next, remaining)
      if (remaining === 0) queue.push(next)
    }
  }
  if (order.length !== WATER_NODES.length) {
    throw new Error('The authored water network must remain acyclic.')
  }
  return order
})()

export function createNetworkState(primed = true): NetworkState {
  const nodes = {} as Record<WaterNodeId, NodeFlow>
  for (const spec of WATER_NODES) {
    const capacity = STORAGE_CAPACITY[spec.id] ?? 0
    nodes[spec.id] = {
      id: spec.id,
      inflow: 0,
      outflow: 0,
      storage: primed ? capacity : 0,
      dStorage: 0,
      spill: 0,
    }
  }

  const edges: Record<string, EdgeFlow> = {}
  for (const spec of WATER_EDGES) {
    edges[edgeKey(spec.from, spec.to)] = {
      spec,
      capacity: capacityOf(spec),
      flow: 0,
      fill: 0,
    }
  }
  return { nodes, edges, elapsed: 0 }
}

/** Small substeps prevent visible basin levels from depending on frame rate. */
export const MAX_SUBSTEP = 0.5

export function solveNetwork(
  state: NetworkState,
  controls: WaterControls,
  deltaSeconds: number,
): void {
  const total = Math.min(Math.max(deltaSeconds, 0), 20)
  if (total === 0) {
    solveStep(state, controls, 0)
    return
  }
  const steps = Math.ceil(total / MAX_SUBSTEP)
  const step = total / steps
  for (let index = 0; index < steps; index += 1) {
    solveStep(state, controls, step)
  }
}

function solveStep(
  state: NetworkState,
  controls: WaterControls,
  deltaSeconds: number,
): void {
  for (const node of Object.values(state.nodes)) {
    node.inflow = 0
    node.outflow = 0
    node.dStorage = 0
    node.spill = 0
  }
  state.nodes.intake.inflow =
    clamp01(controls.intakeGate) *
    clamp01(controls.supply) *
    INTAKE_CAPACITY

  for (const id of TOPO_ORDER) {
    const node = state.nodes[id]
    const outgoing = OUT_EDGES.get(id) ?? []
    if (outgoing.length === 0) {
      node.outflow = node.inflow
      continue
    }

    const storageCapacity = STORAGE_CAPACITY[id] ?? 0
    const tau = STORAGE_TAU[id]
    let available = node.inflow
    if (storageCapacity > 0) {
      const safeDelta = Math.max(deltaSeconds, 1e-6)
      const roomRate = (storageCapacity - node.storage) / safeDelta
      const overflowRate = Math.max(0, node.inflow - roomRate)
      available =
        overflowRate + (tau && tau > 0 ? node.storage / tau : 0)
    }

    const capacityTotal = outgoing.reduce(
      (sum, spec) => sum + capacityOf(spec),
      0,
    )
    let outflow = 0
    for (const spec of outgoing) {
      const capacity = capacityOf(spec)
      const share = capacityTotal > 0 ? capacity / capacityTotal : 0
      let flow = Math.min(available * share, capacity)

      if (spec.id === 'partidor-generalife') {
        flow = Math.min(flow, capacity * clamp01(controls.mainGate))
      }
      if (spec.id === 'partidor-albercones') {
        flow = Math.min(
          flow,
          capacity * clamp01(controls.tercioGate),
          capacity * clamp01(controls.liftDrive),
        )
      }

      const edge = state.edges[edgeKey(spec.from, spec.to)]
      edge.flow = flow
      edge.fill = capacity > 0 ? clamp01(flow / capacity) : 0
      state.nodes[spec.to].inflow += flow
      outflow += flow
    }
    node.outflow = outflow

    const net = node.inflow - node.outflow
    if (storageCapacity <= 0) {
      node.spill = net
      continue
    }

    const safeDelta = Math.max(deltaSeconds, 1e-6)
    const roomRate = (storageCapacity - node.storage) / safeDelta
    const minimumRate = -node.storage / safeDelta
    const storedRate = Math.min(Math.max(net, minimumRate), roomRate)
    node.dStorage = storedRate
    node.spill = net - storedRate
    node.storage = Math.min(
      storageCapacity,
      Math.max(0, node.storage + storedRate * deltaSeconds),
    )
  }
  state.elapsed += deltaSeconds
}

export function nodeLevel(state: NetworkState, id: WaterNodeId): number {
  const capacity = STORAGE_CAPACITY[id] ?? 0
  return capacity > 0 ? clamp01(state.nodes[id].storage / capacity) : 0
}

export function waterwheelDrive(state: NetworkState): number {
  const lifted = state.edges[edgeKey('partidor', 'albercones')]
  return lifted ? lifted.fill : 0
}

export function jetHeight(state: NetworkState, id: WaterNodeId): number {
  const target = WATER_NODES.find((node) => node.id === id)
  if (!target) return 0

  let bestHead = 0
  let incomingCapacity = 0
  for (const edge of WATER_EDGES) {
    if (edge.to !== id) continue
    const source = WATER_NODES.find((node) => node.id === edge.from)
    if (source) {
      bestHead = Math.max(bestHead, source.position.y - target.position.y)
    }
    incomingCapacity += capacityOf(edge)
  }
  const wet =
    incomingCapacity > 0
      ? clamp01(state.nodes[id].inflow / incomingCapacity)
      : 0
  return (
    Math.sqrt(Math.max(bestHead, 0)) *
    0.42 *
    Math.max(wet, nodeLevel(state, id) * 0.35)
  )
}

/** Maximum node conservation residual for diagnostics and tests. */
export function maxBalanceError(state: NetworkState): number {
  return Object.values(state.nodes).reduce(
    (largest, node) =>
      Math.max(
        largest,
        Math.abs(node.inflow - node.outflow - node.dStorage - node.spill),
      ),
    0,
  )
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}

