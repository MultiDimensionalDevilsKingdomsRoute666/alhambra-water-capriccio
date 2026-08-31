import * as THREE from 'three'
import { SITE_PLOTS, groundHeightAt } from '../landscape'
import { WORLD } from '../worldSpec'
import {
  addOutline,
  boxMesh,
  enableShadows,
  outlinedBox,
  type SceneRegistry,
} from './geometry'
import type { AlhambraSceneMaterials } from './types'
import {
  createButtressRhythm,
  createOverflowSpout,
  createRetainingWall,
  createTerraceStair,
} from './siteDetails'

export interface WaterworksResult {
  group: THREE.Group
  intakeGate: THREE.Group
  partidorGate: THREE.Group
  waterWheel: THREE.Group
}

function createRibbonGeometry(
  curve: THREE.CatmullRomCurve3,
  segments: number,
  width: number,
  lift: number,
): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments
    const point = curve.getPointAt(t)
    const tangent = curve.getTangentAt(t)
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize()
    for (const side of [-1, 1]) {
      const vertex = point
        .clone()
        .addScaledVector(normal, side * width * 0.5)
      vertex.y += lift
      positions.push(vertex.x, vertex.y, vertex.z)
      uvs.push(t, side === -1 ? 0 : 1)
    }
  }

  for (let i = 0; i < segments; i += 1) {
    const a = i * 2
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  )
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function createChannel(
  points: THREE.Vector3[],
  routeId: string,
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
  width = 0.92,
): THREE.Group {
  const group = new THREE.Group()
  group.name = `${routeId} channel`
  const curve = new THREE.CatmullRomCurve3(
    points.map((point) => point.clone()),
    false,
    'centripetal',
  )
  const segments = Math.max(12, points.length * 8)
  const sampled = curve.getSpacedPoints(segments)

  const offsetCurve = (amount: number): THREE.CatmullRomCurve3 => {
    const offsetPoints = sampled.map((point, index) => {
      const before = sampled[Math.max(0, index - 1)]
      const after = sampled[Math.min(sampled.length - 1, index + 1)]
      const tangent = after.clone().sub(before).normalize()
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize()
      return point.clone().addScaledVector(normal, amount)
    })
    return new THREE.CatmullRomCurve3(
      offsetPoints,
      false,
      'centripetal',
    )
  }

  const bed = new THREE.Mesh(
    createRibbonGeometry(curve, segments, width + 0.34, -0.11),
    materials.deepStone,
  )
  bed.receiveShadow = true
  group.add(bed)
  registry.wettableStone.push(bed)

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.TubeGeometry(
        offsetCurve(side * (width * 0.5 + 0.14)),
        segments,
        0.13,
        4,
        false,
      ),
      materials.stone,
    )
    rail.castShadow = true
    rail.receiveShadow = true
    group.add(rail)
    registry.wettableStone.push(rail)
  }

  const water = new THREE.Mesh(
    createRibbonGeometry(curve, segments, width, 0.015),
    materials.waterBright,
  )
  water.name = `${routeId} visible water`
  water.renderOrder = 3
  water.userData.waterSurfaceId = routeId
  water.userData.flowDirection = 1
  group.add(water)
  registry.waterSurfaces.push(water)
  return group
}

function createIntakeGate(
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'Presa Real intake'
  group.position.copy(WORLD.water.intake)
  group.userData.interactionId = 'intakeGate'

  const dam = outlinedBox(
    0.9,
    2.4,
    5.2,
    materials.deepStone,
    materials.ink,
  )
  dam.position.y = 0.55
  group.add(dam)
  registry.wettableStone.push(dam)

  const gate = outlinedBox(
    0.28,
    1.35,
    1.45,
    materials.metal,
    materials.ink,
  )
  gate.position.set(0.52, 0.35, -1.25)
  gate.name = 'Intake sluice leaf'
  group.add(gate)

  const stem = boxMesh(0.14, 2.1, 0.14, materials.metal)
  stem.position.set(0.52, 1.7, -1.25)
  group.add(stem)
  enableShadows(group)
  return group
}

function createPartidorGate(
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'Partidor de Fuentepeña abstraction'
  group.position.copy(WORLD.water.partidor)
  group.userData.interactionId = 'partidorGate'

  const basin = outlinedBox(
    5.2,
    0.4,
    3.3,
    materials.deepStone,
    materials.ink,
  )
  basin.position.y = -0.14
  group.add(basin)
  registry.wettableStone.push(basin)

  const splitter = new THREE.Mesh(
    new THREE.ConeGeometry(0.72, 0.55, 3, 1),
    materials.paleStone,
  )
  splitter.rotation.set(Math.PI / 2, 0, Math.PI / 2)
  splitter.position.set(0.45, 0.28, 0)
  addOutline(splitter, materials.ink)
  group.add(splitter)
  registry.wettableStone.push(splitter)

  const lever = new THREE.Group()
  lever.name = 'Partidor lever'
  const arm = boxMesh(0.16, 0.16, 2.4, materials.metal)
  arm.position.y = 0.95
  arm.rotation.x = -0.28
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.6, 8),
    materials.metal,
  )
  handle.rotation.z = Math.PI / 2
  handle.position.set(0, 1.28, -1.02)
  lever.add(arm, handle)
  group.add(lever)
  enableShadows(group)
  return group
}

function createWaterWheel(
  materials: AlhambraSceneMaterials,
): THREE.Group {
  const wheel = new THREE.Group()
  wheel.name = 'Albercones lifting wheel'
  wheel.userData.interactionId = 'waterWheel'
  wheel.userData.rotationAxis = 'z'

  const radius = 2.35
  const rimGeometry = new THREE.TorusGeometry(radius, 0.14, 6, 32)
  for (const z of [-0.32, 0.32]) {
    const rim = new THREE.Mesh(rimGeometry, materials.metal)
    rim.position.z = z
    wheel.add(rim)
  }

  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI
    const spoke = boxMesh(radius * 1.82, 0.11, 0.12, materials.metal)
    spoke.rotation.z = angle
    wheel.add(spoke)
  }

  const bucketProfile = new THREE.Shape()
  bucketProfile.moveTo(-0.29, -0.2)
  bucketProfile.lineTo(0.27, -0.2)
  bucketProfile.lineTo(0.22, 0.2)
  bucketProfile.lineTo(-0.17, 0.28)
  bucketProfile.closePath()
  const bucketGeometry = new THREE.ExtrudeGeometry(bucketProfile, {
    depth: 0.68,
    bevelEnabled: true,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    bevelSegments: 1,
  })
  bucketGeometry.translate(0, 0, -0.34)
  const pinGeometry = new THREE.CylinderGeometry(0.07, 0.07, 0.88, 6)
  pinGeometry.rotateX(Math.PI / 2)
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2
    const bucket = new THREE.Mesh(bucketGeometry, materials.deepStone)
    bucket.position.set(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      0,
    )
    bucket.rotation.z = angle
    const pin = new THREE.Mesh(pinGeometry, materials.metal)
    pin.position.copy(bucket.position)
    wheel.add(bucket, pin)
  }

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 1.15, 10),
    materials.metal,
  )
  hub.rotation.x = Math.PI / 2
  wheel.add(hub)

  const gear = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.58, 0.11, 6, 24),
    materials.metal,
  )
  gear.position.z = -0.54
  wheel.add(gear)
  const toothGeometry = new THREE.BoxGeometry(0.25, 0.15, 0.16)
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2
    const tooth = new THREE.Mesh(toothGeometry, materials.metal)
    tooth.position.set(
      Math.cos(angle) * radius * 0.7,
      Math.sin(angle) * radius * 0.7,
      -0.54,
    )
    tooth.rotation.z = angle
    wheel.add(tooth)
  }
  enableShadows(wheel)
  return wheel
}

function createAlbercones(
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
): {
  group: THREE.Group
  wheel: THREE.Group
  siteDetails: THREE.Group
} {
  const group = new THREE.Group()
  group.name = 'Albercones reservoir and lifting works'
  group.position.copy(WORLD.water.albercones)

  const terrace = outlinedBox(
    SITE_PLOTS.albercones.size[0] - 0.3,
    0.18,
    SITE_PLOTS.albercones.size[1] - 0.3,
    materials.stone,
    materials.ink,
  )
  terrace.position.y = -0.09
  group.add(terrace)
  registry.wettableStone.push(terrace)

  const cistern = outlinedBox(
    9.5,
    0.55,
    5.8,
    materials.deepStone,
    materials.ink,
  )
  cistern.position.set(1.8, 0.02, -0.5)
  group.add(cistern)
  registry.wettableStone.push(cistern)

  const reservoir = boxMesh(8.8, 0.08, 5.1, materials.water)
  reservoir.position.set(1.8, 0.34, -0.5)
  reservoir.userData.waterSurfaceId = 'albercones-reservoir'
  group.add(reservoir)
  registry.waterSurfaces.push(reservoir)

  const wheel = createWaterWheel(materials)
  wheel.position.set(-5.1, 2.75, 1.1)
  group.add(wheel)

  for (const z of [0.2, 2]) {
    const support = outlinedBox(
      0.5,
      5.3,
      0.5,
      materials.stone,
      materials.ink,
    )
    support.position.set(-5.1, 2.35, z)
    group.add(support)
    registry.wettableStone.push(support)
  }

  const crossbeam = outlinedBox(
    0.62,
    0.48,
    3.25,
    materials.metal,
    materials.ink,
  )
  crossbeam.position.set(-5.1, 4.82, 1.1)
  group.add(crossbeam)
  for (const z of [0.2, 2]) {
    const brace = outlinedBox(
      3.5,
      0.22,
      0.24,
      materials.metal,
      materials.ink,
    )
    brace.position.set(-3.92, 1.65, z)
    brace.rotation.z = -0.72
    group.add(brace)
  }

  const well = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.25, 0.65, 14, 1, true),
    materials.deepStone,
  )
  well.position.set(-5.1, 0.22, 1.1)
  addOutline(well, materials.ink)
  group.add(well)
  registry.wettableStone.push(well)

  const liftChannel = boxMesh(
    5.5,
    0.22,
    0.7,
    materials.paleStone,
  )
  liftChannel.position.set(-1.55, 4.6, 1.1)
  group.add(liftChannel)
  registry.wettableStone.push(liftChannel)

  const fallingWater = boxMesh(
    0.18,
    4.2,
    0.45,
    materials.waterBright,
  )
  fallingWater.position.set(-2.9, 2.55, 1.1)
  fallingWater.userData.waterSurfaceId = 'albercones-lift'
  group.add(fallingWater)
  registry.waterSurfaces.push(fallingWater)

  const siteDetails = new THREE.Group()
  siteDetails.name = 'Albercones engineered shelf'
  siteDetails.add(
    createRetainingWall(
      SITE_PLOTS.albercones,
      materials,
      registry,
      groundHeightAt,
    ),
    createButtressRhythm(
      SITE_PLOTS.albercones,
      materials,
      registry,
      {
        edges: ['north', 'east', 'west'],
        spacing: 4.2,
        projection: 1.12,
      },
    ),
    createTerraceStair(
      SITE_PLOTS.albercones,
      materials,
      registry,
      {
        edge: 'east',
        centerOffset: -1.4,
        width: 2.4,
        baseY: SITE_PLOTS.albercones.foundationY,
      },
    ),
    createOverflowSpout(
      SITE_PLOTS.albercones,
      materials,
      registry,
      {
        edge: 'north',
        centerOffset: 3.8,
        sillDrop: 0.58,
        projection: 0.92,
      },
    ),
  )
  enableShadows(group)
  return { group, wheel, siteDetails }
}

function createWaterTowerPortal(
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'Water Tower portal'
  group.position.copy(WORLD.water.waterTower)

  const frame = outlinedBox(
    1.15,
    3.2,
    4.8,
    materials.deepStone,
    materials.ink,
  )
  frame.position.y = 1.15
  group.add(frame)
  registry.wettableStone.push(frame)

  const waterSlot = boxMesh(
    1.32,
    0.38,
    1.55,
    materials.waterBright,
  )
  waterSlot.position.set(-0.12, 0.2, 0)
  waterSlot.userData.waterSurfaceId = 'water-tower-threshold'
  group.add(waterSlot)
  registry.waterSurfaces.push(waterSlot)
  return group
}

export function createWaterworks(
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
): WaterworksResult {
  const group = new THREE.Group()
  group.name = 'Visible hydraulic network'

  const mainChannel = createChannel(
    [
      WORLD.water.intake,
      WORLD.water.contourA,
      WORLD.water.contourB,
      WORLD.water.partidor,
      WORLD.water.generalife,
      WORLD.water.waterTower,
    ],
    'acequia-real',
    materials,
    registry,
    0.78,
  )
  const palaceChannel = createChannel(
    [
      WORLD.water.waterTower,
      WORLD.water.city,
      WORLD.water.lions,
    ],
    'palace-main',
    materials,
    registry,
    0.52,
  )
  const comaresBranch = createChannel(
    [
      WORLD.water.city,
      WORLD.water.comares,
      WORLD.water.bath,
    ],
    'comares-branch',
    materials,
    registry,
    0.42,
  )

  const intakeGate = createIntakeGate(materials, registry)
  const partidorGate = createPartidorGate(materials, registry)
  const albercones = createAlbercones(materials, registry)
  const waterTower = createWaterTowerPortal(materials, registry)
  group.add(
    mainChannel,
    palaceChannel,
    comaresBranch,
    intakeGate,
    partidorGate,
    albercones.group,
    albercones.siteDetails,
    waterTower,
  )
  enableShadows(group)
  return {
    group,
    intakeGate,
    partidorGate,
    waterWheel: albercones.wheel,
  }
}
