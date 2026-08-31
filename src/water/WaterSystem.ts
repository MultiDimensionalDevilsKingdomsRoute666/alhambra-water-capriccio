import * as THREE from 'three'

import {
  WATER_EDGES,
  WATER_NODES,
  WATER_STAGES,
  getWaterNode,
  type WaterEdgeRole,
  type WaterEdgeSpec,
  type WaterNodeId,
  type WaterNodeSpec,
  type WaterStageId,
} from './graph'
import { velocityRatio } from './hydraulics'
import {
  createNetworkState,
  edgeKey,
  jetHeight,
  nodeLevel,
  solveNetwork,
  waterwheelDrive,
  type NetworkState,
  type WaterControls,
} from './network'
import { createFlowMaterial } from './shaders'

export interface WaterSystemOptions {
  ink?: THREE.ColorRepresentation
  glow?: THREE.ColorRepresentation
  trace?: THREE.ColorRepresentation
  lift?: number
  smoothing?: number
}

export interface WaterStageState {
  id: WaterStageId
  index: number
  title: string
  eyebrow: string
  description: string
  start: number
  end: number
  localProgress: number
  focus: THREE.Vector3
}

interface EdgeVisual {
  spec: WaterEdgeSpec
  curve: THREE.CatmullRomCurve3
  material: THREE.ShaderMaterial
  hatchGeometry: THREE.BufferGeometry
  hatchSegmentCount: number
  pulse: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  pulseSeed: number
}

interface NodeVisual {
  spec: WaterNodeSpec
  group: THREE.Group
  coreMaterial: THREE.MeshBasicMaterial
  ringMaterial: THREE.MeshBasicMaterial
  echoMaterial: THREE.MeshBasicMaterial
  stemMaterial: THREE.MeshBasicMaterial
  activity: number
}

const ROLE_RADIUS: Readonly<Record<WaterEdgeRole, number>> = {
  trunk: 0.22,
  upper: 0.18,
  palace: 0.15,
  drain: 0.135,
}

const ROLE_OPACITY: Readonly<Record<WaterEdgeRole, number>> = {
  trunk: 0.96,
  upper: 0.88,
  palace: 0.86,
  drain: 0.68,
}

export class WaterSystem {
  readonly root = new THREE.Group()

  private readonly ink: THREE.Color
  private readonly glow: THREE.Color
  private readonly trace: THREE.Color
  private readonly lift: number
  private readonly smoothing: number
  private readonly edgeVisuals: EdgeVisual[] = []
  private readonly nodeVisuals = new Map<WaterNodeId, NodeVisual>()
  private readonly pulseGeometry = new THREE.SphereGeometry(0.3, 8, 5)
  private readonly nodeRingGeometry = new THREE.RingGeometry(0.38, 0.61, 28)
  private readonly nodeEchoGeometry = new THREE.RingGeometry(0.78, 0.84, 32)
  private readonly nodeCoreGeometry = new THREE.CircleGeometry(0.19, 20)
  private readonly nodeStemGeometry = new THREE.CylinderGeometry(
    0.026,
    0.026,
    1.12,
    6,
  )

  private targetProgress = 0
  private displayProgress = 0
  private elapsed = 0
  private wheelDrive = 0

  /**
   * The narrative progress and the hydraulic state are deliberately separate:
   * progress decides what has been introduced, while this state decides where
   * water can physically be present.
   */
  readonly network: NetworkState = createNetworkState(true)

  /** Defaults keep the existing first impression wet and alive. */
  readonly controls: WaterControls = {
    intakeGate: 1,
    supply: 1,
    mainGate: 1,
    tercioGate: 1,
    liftDrive: 1,
  }

  /** One real second represents ninety explanatory seconds. */
  simRate = 90

  constructor(options: WaterSystemOptions = {}) {
    this.ink = new THREE.Color(options.ink ?? '#0b5860')
    this.glow = new THREE.Color(options.glow ?? '#6ee7dc')
    this.trace = new THREE.Color(options.trace ?? '#16464a')
    this.lift = options.lift ?? 0.24
    this.smoothing = Math.max(0, options.smoothing ?? 13)

    this.root.name = 'WaterSystem'
    this.root.userData.waterSystem = true
    this.root.renderOrder = 20

    this.buildEdges()
    this.buildNodes()
    this.syncVisuals(0)
  }

  get progress(): number {
    return this.targetProgress
  }

  get renderedProgress(): number {
    return this.displayProgress
  }

  get waterwheelDrive(): number {
    return this.wheelDrive
  }

  private flowOf(spec: WaterEdgeSpec): number {
    return this.network.edges[edgeKey(spec.from, spec.to)]?.fill ?? 0
  }

  /** Actual discharge divided by the authored capacity of a visible edge. */
  fillOf(edgeId: string): number {
    const visual = this.edgeVisuals.find((edge) => edge.spec.id === edgeId)
    return visual ? this.flowOf(visual.spec) : 0
  }

  /** Stored water level, 0..1. Non-storage nodes return zero. */
  levelAt(id: WaterNodeId): number {
    return nodeLevel(this.network, id)
  }

  /** Readable fountain-jet height in metres. */
  jetAt(id: WaterNodeId): number {
    return jetHeight(this.network, id)
  }

  /** Current inflow at a water node in cubic metres per second. */
  inflowAt(id: WaterNodeId): number {
    return this.network.nodes[id]?.inflow ?? 0
  }

  setProgress(value: number, immediate = false): void {
    this.targetProgress = THREE.MathUtils.clamp(value, 0, 1)
    if (immediate || this.smoothing === 0) {
      this.displayProgress = this.targetProgress
      this.syncVisuals(this.displayProgress)
    }
  }

  update(deltaSeconds: number, elapsedSeconds?: number): void {
    const delta = THREE.MathUtils.clamp(deltaSeconds, 0, 0.1)
    this.elapsed =
      elapsedSeconds === undefined ? this.elapsed + delta : elapsedSeconds

    solveNetwork(this.network, this.controls, delta * this.simRate)

    this.displayProgress =
      this.smoothing === 0
        ? this.targetProgress
        : THREE.MathUtils.damp(
            this.displayProgress,
            this.targetProgress,
            this.smoothing,
            delta,
          )

    this.syncVisuals(this.displayProgress)
  }

  getStage(progress = this.targetProgress): WaterStageState {
    const normalized = THREE.MathUtils.clamp(progress, 0, 1)
    const index = Math.max(
      0,
      WATER_STAGES.findIndex((stage) => normalized < stage.end),
    )
    const stage = WATER_STAGES[index] ?? WATER_STAGES[WATER_STAGES.length - 1]
    const span = Math.max(0.000001, stage.end - stage.start)

    return {
      id: stage.id,
      index,
      title: stage.title,
      eyebrow: stage.eyebrow,
      description: stage.description,
      start: stage.start,
      end: Math.min(stage.end, 1),
      localProgress: THREE.MathUtils.clamp(
        (normalized - stage.start) / span,
        0,
        1,
      ),
      focus: getWaterNode(stage.focusNode).position.clone(),
    }
  }

  getNodeActivity(id: WaterNodeId): number {
    return this.nodeVisuals.get(id)?.activity ?? 0
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()

    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) {
        return
      }

      geometries.add(object.geometry)
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => materials.add(material))
      } else {
        materials.add(object.material)
      }
    })

    geometries.forEach((geometry) => geometry.dispose())
    materials.forEach((material) => material.dispose())
    this.root.clear()
    this.edgeVisuals.length = 0
    this.nodeVisuals.clear()
  }

  private buildEdges(): void {
    WATER_EDGES.forEach((spec, edgeIndex) => {
      const curve = this.createCurve(spec)
      const edgeGroup = new THREE.Group()
      edgeGroup.name = `water-edge:${spec.id}`
      edgeGroup.userData.waterEdgeId = spec.id
      edgeGroup.userData.waterRole = spec.role

      const curveLength = curve.getLength()
      const tubularSegments = THREE.MathUtils.clamp(
        Math.ceil(curveLength * 1.7),
        24,
        96,
      )
      const geometry = new THREE.TubeGeometry(
        curve,
        tubularSegments,
        ROLE_RADIUS[spec.role],
        spec.role === 'trunk' ? 6 : 5,
        false,
      )
      const material = createFlowMaterial({
        ink: this.ink,
        glow: this.glow,
        opacity: ROLE_OPACITY[spec.role],
      })
      const tube = new THREE.Mesh(geometry, material)
      tube.name = `water-ink:${spec.id}`
      tube.renderOrder = 22
      tube.frustumCulled = false
      edgeGroup.add(tube)

      const traceGeometry = new THREE.BufferGeometry().setFromPoints(
        curve.getPoints(
          THREE.MathUtils.clamp(Math.ceil(curveLength * 1.2), 18, 72),
        ),
      )
      const traceMaterial = new THREE.LineBasicMaterial({
        color: this.trace,
        transparent: true,
        opacity: spec.role === 'trunk' ? 0.19 : 0.125,
        depthWrite: false,
        toneMapped: false,
      })
      const traceLine = new THREE.Line(traceGeometry, traceMaterial)
      traceLine.name = `water-trace:${spec.id}`
      traceLine.renderOrder = 19
      traceLine.frustumCulled = false
      edgeGroup.add(traceLine)

      const hatch = this.createHatch(curve, curveLength, spec.role)
      const hatchMaterial = new THREE.LineBasicMaterial({
        color: this.ink,
        transparent: true,
        opacity: spec.role === 'drain' ? 0.38 : 0.63,
        depthWrite: false,
        toneMapped: false,
      })
      const hatchLines = new THREE.LineSegments(
        hatch.geometry,
        hatchMaterial,
      )
      hatchLines.name = `water-hatch:${spec.id}`
      hatchLines.renderOrder = 23
      hatchLines.frustumCulled = false
      edgeGroup.add(hatchLines)

      const pulseMaterial = new THREE.MeshBasicMaterial({
        color: this.glow,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
      const pulse = new THREE.Mesh(this.pulseGeometry, pulseMaterial)
      pulse.name = `water-pulse:${spec.id}`
      pulse.renderOrder = 24
      pulse.visible = false
      edgeGroup.add(pulse)

      this.edgeVisuals.push({
        spec,
        curve,
        material,
        hatchGeometry: hatch.geometry,
        hatchSegmentCount: hatch.segmentCount,
        pulse,
        pulseSeed: (edgeIndex * 0.173 + 0.11) % 1,
      })
      this.root.add(edgeGroup)
    })
  }

  private buildNodes(): void {
    WATER_NODES.forEach((spec) => {
      const group = new THREE.Group()
      group.name = `water-node:${spec.id}`
      group.position.copy(spec.position)
      group.position.y += this.lift + 0.02
      group.userData.waterNodeId = spec.id
      group.userData.waterNodeKind = spec.kind
      group.userData.waterProgress = spec.progress
      group.renderOrder = 26

      const coreMaterial = this.createNodeMaterial(this.glow, 0)
      const core = new THREE.Mesh(this.nodeCoreGeometry, coreMaterial)
      core.rotation.x = -Math.PI / 2
      core.renderOrder = 27
      group.add(core)

      const ringMaterial = this.createNodeMaterial(this.ink, 0)
      const ring = new THREE.Mesh(this.nodeRingGeometry, ringMaterial)
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.006
      ring.renderOrder = 26
      group.add(ring)

      const echoMaterial = this.createNodeMaterial(this.glow, 0)
      const echo = new THREE.Mesh(this.nodeEchoGeometry, echoMaterial)
      echo.rotation.x = -Math.PI / 2
      echo.position.y = 0.012
      echo.renderOrder = 25
      group.add(echo)

      const stemMaterial = this.createNodeMaterial(this.glow, 0)
      const stem = new THREE.Mesh(this.nodeStemGeometry, stemMaterial)
      stem.name = 'water-node-stem'
      stem.position.y = 0.56
      stem.renderOrder = 25
      group.add(stem)

      group.visible = false
      this.nodeVisuals.set(spec.id, {
        spec,
        group,
        coreMaterial,
        ringMaterial,
        echoMaterial,
        stemMaterial,
        activity: 0,
      })
      this.root.add(group)
    })
  }

  private createCurve(spec: WaterEdgeSpec): THREE.CatmullRomCurve3 {
    const points: THREE.Vector3[] = [
      getWaterNode(spec.from).position.clone(),
      ...(spec.via ?? []).map(
        ([x, y, z]) => new THREE.Vector3(x, y, z),
      ),
      getWaterNode(spec.to).position.clone(),
    ]
    points.forEach((point) => {
      point.y += this.lift
    })
    return new THREE.CatmullRomCurve3(
      points,
      false,
      'centripetal',
      0.28,
    )
  }

  private createHatch(
    curve: THREE.CatmullRomCurve3,
    curveLength: number,
    role: WaterEdgeRole,
  ): { geometry: THREE.BufferGeometry; segmentCount: number } {
    const segmentCount = THREE.MathUtils.clamp(
      Math.floor(curveLength / (role === 'trunk' ? 1.35 : 1.7)),
      8,
      42,
    )
    const positions: number[] = []

    for (let index = 1; index <= segmentCount; index += 1) {
      const t = index / (segmentCount + 1)
      const point = curve.getPointAt(t)
      const tangent = curve.getTangentAt(t)
      const lateral = new THREE.Vector3(-tangent.z, 0, tangent.x)
      if (lateral.lengthSq() < 0.0001) {
        lateral.set(1, 0, 0)
      } else {
        lateral.normalize()
      }

      const halfWidth =
        ROLE_RADIUS[role] *
        (1.9 + 0.32 * Math.sin(index * 2.17 + curveLength))
      const tilt = new THREE.Vector3(
        tangent.x * 0.07,
        0.018 * Math.sin(index * 1.7),
        tangent.z * 0.07,
      )
      const from = point
        .clone()
        .addScaledVector(lateral, -halfWidth)
        .sub(tilt)
      const to = point
        .clone()
        .addScaledVector(lateral, halfWidth)
        .add(tilt)
      positions.push(from.x, from.y, from.z, to.x, to.y, to.z)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    )
    geometry.setDrawRange(0, 0)
    return { geometry, segmentCount }
  }

  private createNodeMaterial(
    color: THREE.ColorRepresentation,
    opacity: number,
  ): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
  }

  private syncVisuals(progress: number): void {
    this.wheelDrive = waterwheelDrive(this.network)

    this.edgeVisuals.forEach((visual) => {
      const span = Math.max(0.000001, visual.spec.end - visual.spec.start)
      const told = THREE.MathUtils.smoothstep(
        progress,
        visual.spec.start,
        visual.spec.end,
      )
      const fill = this.flowOf(visual.spec)
      const reveal =
        told * THREE.MathUtils.smoothstep(fill, 0.002, 0.12)
      const flowSpeed = velocityRatio(fill)

      visual.material.uniforms.uTime.value = this.elapsed
      visual.material.uniforms.uReveal.value = reveal
      visual.material.uniforms.uFlow.value = flowSpeed

      const drawnSegments = Math.floor(
        visual.hatchSegmentCount * reveal,
      )
      visual.hatchGeometry.setDrawRange(0, drawnSegments * 2)

      const pulseVisibility = THREE.MathUtils.smoothstep(
        reveal,
        0.025,
        0.18,
      )
      visual.pulse.visible = pulseVisibility > 0.001
      visual.pulse.material.opacity =
        pulseVisibility * (visual.spec.role === 'drain' ? 0.52 : 0.82)

      const pulseTravel =
        ((this.elapsed * (0.028 + flowSpeed * 0.122) +
          visual.pulseSeed) %
          1) *
        Math.max(0.018, reveal)
      visual.curve.getPointAt(
        THREE.MathUtils.clamp(pulseTravel, 0, 0.999999),
        visual.pulse.position,
      )
      const pulseScale =
        0.72 +
        0.22 *
          Math.sin(
            this.elapsed * 5.2 + visual.pulseSeed * Math.PI * 2,
          )
      visual.pulse.scale.setScalar(pulseScale)

      visual.material.uniforms.uOpacity.value =
        ROLE_OPACITY[visual.spec.role] *
        (0.84 + 0.16 * Math.min(1, span * 8))
    })

    this.nodeVisuals.forEach((visual) => {
      const told = THREE.MathUtils.smoothstep(
        progress,
        visual.spec.progress - 0.026,
        visual.spec.progress + 0.018,
      )
      const wet = Math.max(
        THREE.MathUtils.smoothstep(
          this.inflowAt(visual.spec.id),
          0.0001,
          0.05,
        ),
        this.levelAt(visual.spec.id),
      )
      const activity = told * wet
      const distance = Math.abs(progress - visual.spec.progress)
      const attention = Math.exp(
        -Math.pow(distance / 0.055, 2),
      )
      const heartbeat =
        0.5 + 0.5 * Math.sin(this.elapsed * 4.6 + visual.spec.progress * 11)

      visual.activity = activity
      visual.group.visible = activity > 0.001 || attention > 0.025
      visual.coreMaterial.opacity =
        activity * (0.5 + attention * 0.46)
      visual.ringMaterial.opacity =
        activity * (0.28 + attention * 0.46)
      visual.echoMaterial.opacity =
        activity * attention * (0.18 + heartbeat * 0.32)
      visual.stemMaterial.opacity =
        activity * (0.12 + attention * 0.5)

      const emphasis = attention * (0.08 + heartbeat * 0.11)
      visual.group.scale.setScalar(0.72 + activity * 0.28 + emphasis)
      const stem = visual.group.getObjectByName('water-node-stem')
      if (stem) {
        stem.scale.y = Math.max(0.001, activity)
      }
    })
  }
}
