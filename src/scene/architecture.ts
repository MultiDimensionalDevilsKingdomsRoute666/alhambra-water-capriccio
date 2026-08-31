import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  SITE_PLOTS,
  groundHeightAt,
  type SitePlot,
} from '../landscape'
import {
  addOutline,
  boxMesh,
  createArcade,
  createBattlements,
  createCypress,
  createOrangeTree,
  createPyramidalRoof,
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
  type SiteEdge,
} from './siteDetails'

export interface ArchitectureResult {
  group: THREE.Group
  lionsFountain: THREE.Group
  comaresPool: THREE.Mesh
}

function registerStone(
  mesh: THREE.Mesh,
  registry: SceneRegistry,
): THREE.Mesh {
  registry.wettableStone.push(mesh)
  return mesh
}

interface FootprintGround {
  minimum: number
  maximum: number
  median: number
}

function sampleFootprintGround(
  x: number,
  z: number,
  width: number,
  depth: number,
): FootprintGround {
  const heights: number[] = []
  for (let iz = 0; iz < 3; iz += 1) {
    for (let ix = 0; ix < 3; ix += 1) {
      heights.push(
        groundHeightAt(
          x + (ix - 1) * width * 0.5,
          z + (iz - 1) * depth * 0.5,
        ),
      )
    }
  }
  heights.sort((a, b) => a - b)
  return {
    minimum: heights[0],
    maximum: heights[heights.length - 1],
    median: heights[Math.floor(heights.length * 0.5)],
  }
}

function addWallBetween(
  parent: THREE.Group,
  a: THREE.Vector2,
  b: THREE.Vector2,
  height: number,
  thickness: number,
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
): THREE.Mesh {
  const length = a.distanceTo(b)
  const segmentCount = Math.max(1, Math.ceil(length / 3.4))
  const rotation = -Math.atan2(b.y - a.y, b.x - a.x)
  const segmentGeometries: THREE.BufferGeometry[] = []

  for (let index = 0; index < segmentCount; index += 1) {
    const startAmount = index / segmentCount
    const endAmount = (index + 1) / segmentCount
    const start = a.clone().lerp(b, startAmount)
    const end = a.clone().lerp(b, endAmount)
    const midpoint = start.clone().add(end).multiplyScalar(0.5)
    const startGround = groundHeightAt(start.x, start.y)
    const middleGround = groundHeightAt(midpoint.x, midpoint.y)
    const endGround = groundHeightAt(end.x, end.y)
    const bottomY = Math.min(
      startGround,
      middleGround,
      endGround,
    ) - 0.28
    const topY = Math.max(
      startGround,
      middleGround,
      endGround,
    ) + height
    const segmentLength = start.distanceTo(end) + 0.05
    const geometry = new THREE.BoxGeometry(
      segmentLength,
      topY - bottomY,
      thickness,
    )
    geometry.rotateY(rotation)
    geometry.translate(
      midpoint.x,
      bottomY + (topY - bottomY) * 0.5,
      midpoint.y,
    )
    segmentGeometries.push(geometry)
  }

  const mergedGeometry = mergeGeometries(segmentGeometries, false)
  for (const geometry of segmentGeometries) geometry.dispose()
  if (mergedGeometry === null) {
    throw new Error('Unable to build stepped citadel wall.')
  }
  const wall = new THREE.Mesh(mergedGeometry, materials.stone)
  addOutline(wall, materials.ink, wall, 34)
  wall.userData.architecture = 'citadel-wall'
  parent.add(wall)
  registerStone(wall, registry)
  return wall
}

function createTower(
  width: number,
  depth: number,
  height: number,
  materials: AlhambraSceneMaterials,
  roofed = false,
  baseExtension = 0,
): THREE.Group {
  const group = new THREE.Group()
  const bodyHeight = height + baseExtension
  const body = outlinedBox(
    width,
    bodyHeight,
    depth,
    materials.stone,
    materials.ink,
  )
  body.position.y = bodyHeight / 2
  group.add(body)

  if (roofed) {
    const roof = createPyramidalRoof(
      width * 1.16,
      depth * 1.16,
      2.1,
      materials.roof,
      materials.ink,
    )
    roof.position.y = baseExtension + height + 1.02
    group.add(roof)
  } else {
    const battlements = createBattlements(
      width * 0.9,
      depth * 0.88,
      0.52,
      0.65,
      materials.paleStone,
    )
    battlements.position.y = baseExtension + height
    group.add(battlements)
  }

  const slitGeometry = new THREE.BoxGeometry(0.24, 0.85, 0.05)
  for (const x of [-width * 0.22, width * 0.22]) {
    const slit = new THREE.Mesh(slitGeometry, materials.deepStone)
    slit.position.set(
      x,
      baseExtension + height * 0.58,
      depth / 2 + 0.03,
    )
    group.add(slit)
  }
  enableShadows(group)
  return group
}

function addLocalPlotEngineering(
  positionedGroup: THREE.Group,
  plot: SitePlot,
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
  buttressEdges: readonly SiteEdge[],
): void {
  const worldDetails = new THREE.Group()
  worldDetails.name = `${plot.id} earthwork`
  worldDetails.position.copy(positionedGroup.position).multiplyScalar(-1)
  worldDetails.add(
    createRetainingWall(
      plot,
      materials,
      registry,
      groundHeightAt,
    ),
    createButtressRhythm(
      plot,
      materials,
      registry,
      {
        edges: buttressEdges,
        spacing: 4.4,
        projection: 0.92,
        baseY: plot.foundationY,
      },
    ),
  )
  positionedGroup.add(worldDetails)
}

function createCitadelWalls(
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'Citadel walls'
  const wallPath = [
    new THREE.Vector2(26, -14),
    new THREE.Vector2(43, -20),
    new THREE.Vector2(74, -18),
    new THREE.Vector2(91, -8),
    new THREE.Vector2(88, 14),
    new THREE.Vector2(68, 20),
    new THREE.Vector2(40, 15),
    new THREE.Vector2(27, 6),
  ]

  for (let i = 0; i < wallPath.length; i += 1) {
    addWallBetween(
      group,
      wallPath[i],
      wallPath[(i + 1) % wallPath.length],
      3.5,
      0.7,
      materials,
      registry,
    )
  }

  const towerSites: Array<{
    x: number
    z: number
    width: number
    height: number
    roofed?: boolean
  }> = [
    { x: 27, z: -5, width: 5.3, height: 8.1 },
    { x: 38, z: -17, width: 4.8, height: 6.5 },
    { x: 74, z: -17, width: 5.8, height: 7.1 },
    { x: 89, z: -6, width: 5.2, height: 7.8 },
    { x: 86, z: 13, width: 5.1, height: 6.6, roofed: true },
    { x: 41, z: 15, width: 5.2, height: 7.2 },
  ]
  for (const site of towerSites) {
    const depth = site.width * 0.86
    const ground = sampleFootprintGround(
      site.x,
      site.z,
      site.width,
      depth,
    )
    const bottomY = ground.minimum - 0.3
    const baseExtension = ground.maximum - bottomY
    const tower = createTower(
      site.width,
      depth,
      site.height,
      materials,
      site.roofed,
      baseExtension,
    )
    tower.position.set(site.x, bottomY, site.z)
    group.add(tower)
    tower.traverse((child) => {
      if (child instanceof THREE.Mesh) registerStone(child, registry)
    })
  }
  return group
}

function createLionsFountain(
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
): THREE.Group {
  const fountain = new THREE.Group()
  fountain.name = 'Fountain of Lions abstraction'
  fountain.userData.interactionId = 'lionsFountain'

  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(1.32, 1.12, 0.24, 16),
    materials.paleStone,
  )
  basin.position.y = 0.92
  addOutline(basin, materials.ink)
  fountain.add(basin)
  registerStone(basin, registry)

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1.14, 24),
    materials.waterBright,
  )
  water.rotation.x = -Math.PI / 2
  water.position.y = 1.055
  water.userData.waterSurfaceId = 'lions-basin'
  fountain.add(water)
  registry.waterSurfaces.push(water)

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.26, 0.74, 8),
    materials.paleStone,
  )
  column.position.y = 0.47
  fountain.add(column)

  const lionBodyGeometry = new THREE.DodecahedronGeometry(0.23, 0)
  const lionHeadGeometry = new THREE.DodecahedronGeometry(0.13, 0)
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2
    const lion = new THREE.Group()
    lion.rotation.y = -angle + Math.PI / 2
    lion.position.set(Math.cos(angle) * 0.72, 0.2, Math.sin(angle) * 0.72)

    const body = new THREE.Mesh(lionBodyGeometry, materials.stone)
    body.scale.set(1.45, 0.82, 0.74)
    const head = new THREE.Mesh(lionHeadGeometry, materials.stone)
    head.position.x = 0.3
    head.position.y = 0.05
    lion.add(body, head)
    fountain.add(lion)
  }
  enableShadows(fountain)
  return fountain
}

function createLionsCourtyard(
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
): { group: THREE.Group; fountain: THREE.Group } {
  const group = new THREE.Group()
  group.name = 'Court of Lions'
  const plot = SITE_PLOTS.palaceLions
  group.position.set(
    plot.center[0],
    plot.floorY,
    plot.center[1],
  )

  const platform = outlinedBox(
    plot.size[0] - 0.3,
    0.22,
    plot.size[1] - 0.3,
    materials.paleStone,
    materials.ink,
  )
  platform.position.y = -0.11
  group.add(platform)
  registerStone(platform, registry)
  addLocalPlotEngineering(
    group,
    plot,
    materials,
    registry,
    ['north', 'east', 'south'],
  )

  const north = createArcade(
    17,
    8,
    2.2,
    materials.paleStone,
    materials.ink,
    materials.plaster,
  )
  north.position.set(0, 0.05, -5.5)
  const south = north.clone()
  south.position.z = 5.5
  south.rotation.y = Math.PI
  const west = createArcade(
    10,
    5,
    2.2,
    materials.paleStone,
    materials.ink,
    materials.plaster,
  )
  west.rotation.y = Math.PI / 2
  west.position.set(-8.2, 0.05, 0)
  const east = west.clone()
  east.position.x = 8.2
  east.rotation.y = -Math.PI / 2
  group.add(north, south, west, east)

  const fountain = createLionsFountain(materials, registry)
  fountain.position.y = 0.06
  group.add(fountain)

  const channels = [
    { width: 6.6, depth: 0.35, x: 4.25, z: 0 },
    { width: 6.6, depth: 0.35, x: -4.25, z: 0 },
    { width: 0.35, depth: 4.1, x: 0, z: 3.1 },
    { width: 0.35, depth: 4.1, x: 0, z: -3.1 },
  ]
  for (const channel of channels) {
    const water = boxMesh(
      channel.width,
      0.035,
      channel.depth,
      materials.waterBright,
    )
    water.position.set(channel.x, 0.08, channel.z)
    water.userData.waterSurfaceId = 'lions-rill'
    group.add(water)
    registry.waterSurfaces.push(water)
  }
  return { group, fountain }
}

function createComaresCourtyard(
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
): { group: THREE.Group; pool: THREE.Mesh } {
  const group = new THREE.Group()
  group.name = 'Comares and Court of Myrtles'
  const plot = SITE_PLOTS.palaceComares
  group.position.set(
    plot.center[0],
    plot.floorY,
    plot.center[1],
  )

  const platform = outlinedBox(
    plot.size[0] - 0.3,
    0.22,
    plot.size[1] - 0.3,
    materials.stone,
    materials.ink,
  )
  platform.position.y = -0.11
  group.add(platform)
  registerStone(platform, registry)
  addLocalPlotEngineering(
    group,
    plot,
    materials,
    registry,
    ['north', 'east'],
  )

  const poolFrame = outlinedBox(
    12.8,
    0.28,
    3.5,
    materials.deepStone,
    materials.ink,
  )
  poolFrame.position.y = 0.02
  group.add(poolFrame)
  registerStone(poolFrame, registry)

  const pool = boxMesh(12.2, 0.08, 2.9, materials.water)
  pool.position.y = 0.19
  pool.name = 'Comares reflecting pool'
  pool.userData.interactionId = 'comaresPool'
  pool.userData.waterSurfaceId = 'comares'
  group.add(pool)
  registry.waterSurfaces.push(pool)

  const endArcade = createArcade(
    9,
    5,
    2.45,
    materials.paleStone,
    materials.ink,
    materials.plaster,
  )
  endArcade.rotation.y = Math.PI / 2
  endArcade.position.x = -9.2
  group.add(endArcade)

  const tower = createTower(8.4, 7.5, 10.8, materials)
  tower.position.set(10, 0, 0)
  tower.name = 'Comares Tower'
  group.add(tower)
  tower.traverse((child) => {
    if (child instanceof THREE.Mesh) registerStone(child, registry)
  })

  for (const z of [-2.45, 2.45]) {
    for (let i = 0; i < 7; i += 1) {
      const shrub = boxMesh(1.2, 0.7, 0.65, materials.garden)
      shrub.position.set(-5.2 + i * 1.72, 0.43, z)
      group.add(shrub)
      registry.vegetation.push(shrub)
    }
  }
  return { group, pool }
}

function createMuqarnasPavilion(
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'Muqarnas light pavilion'
  const plot = SITE_PLOTS.palaceMuqarnas
  group.position.set(
    plot.center[0],
    plot.floorY,
    plot.center[1],
  )
  // Only the rear half needs its own engineered shelf. The north/front arcade
  // lands directly on the Lions terrace; cropping the duplicate slab removes
  // the coplanar overlap and makes the two courts read as one continuous floor.
  const rearPlot: SitePlot = {
    ...plot,
    center: [plot.center[0], plot.center[1] - 1.05],
    size: [8.1, 4.2],
    cornerRadius: 1.05,
  }
  const rearLocalZ = rearPlot.center[1] - plot.center[1]

  const foundationBottom = plot.foundationY - plot.floorY
  const foundationTop = -0.32
  const foundationHeight = foundationTop - foundationBottom
  const foundation = outlinedBox(
    7.45,
    foundationHeight,
    3.55,
    materials.stone,
    materials.ink,
  )
  foundation.position.y =
    foundationBottom + foundationHeight * 0.5
  foundation.position.z = rearLocalZ
  foundation.userData.architecture = 'muqarnas-foundation'
  group.add(foundation)
  registerStone(foundation, registry)

  const plinthCourse = outlinedBox(
    7.65,
    0.18,
    3.75,
    materials.paleStone,
    materials.ink,
    40,
  )
  plinthCourse.position.set(0, -0.25, rearLocalZ)
  group.add(plinthCourse)
  registerStone(plinthCourse, registry)

  const floor = outlinedBox(
    7.78,
    0.18,
    3.88,
    materials.stone,
    materials.ink,
  )
  floor.position.set(0, -0.09, rearLocalZ)
  group.add(floor)
  registerStone(floor, registry)
  addLocalPlotEngineering(
    group,
    rearPlot,
    materials,
    registry,
    ['east', 'south', 'west'],
  )

  const front = createArcade(
    6.6,
    3,
    2.55,
    materials.paleStone,
    materials.ink,
    materials.plaster,
  )
  front.position.z = 2.15
  const rear = front.clone()
  rear.position.z = -2.15
  rear.rotation.y = Math.PI
  group.add(front, rear)

  for (const x of [-3.34, 3.34]) {
    const sideBeam = outlinedBox(
      0.36,
      0.34,
      4.58,
      materials.plaster,
      materials.ink,
      38,
    )
    sideBeam.position.set(x, 3.57, 0)
    group.add(sideBeam)
    registerStone(sideBeam, registry)
  }

  const ceiling = new THREE.Group()
  ceiling.name = 'Nested muqarnas ceiling'

  const tiers = [
    {
      width: 5.65,
      depth: 3.78,
      plateY: 3.84,
      cellsX: 5,
      cellsZ: 2,
      cellRadius: 0.23,
      cellHeight: 0.36,
    },
    {
      width: 4.05,
      depth: 2.62,
      plateY: 3.57,
      cellsX: 4,
      cellsZ: 2,
      cellRadius: 0.24,
      cellHeight: 0.4,
    },
    {
      width: 2.45,
      depth: 1.48,
      plateY: 3.28,
      cellsX: 3,
      cellsZ: 2,
      cellRadius: 0.26,
      cellHeight: 0.44,
    },
  ] as const

  for (const [tierIndex, tier] of tiers.entries()) {
    const plate = outlinedBox(
      tier.width,
      0.14,
      tier.depth,
      tierIndex === 0 ? materials.plaster : materials.paleStone,
      materials.ink,
      42,
    )
    plate.position.y = tier.plateY
    ceiling.add(plate)
    registerStone(plate, registry)

    const cellGeometry = new THREE.ConeGeometry(
      tier.cellRadius,
      tier.cellHeight,
      4,
      1,
    )
    cellGeometry.rotateZ(Math.PI)
    const cellY = tier.plateY - 0.07 - tier.cellHeight * 0.5
    const edgeX = tier.width * 0.5 - tier.cellRadius * 1.2
    const edgeZ = tier.depth * 0.5 - tier.cellRadius * 1.2

    for (let ix = 0; ix < tier.cellsX; ix += 1) {
      const amount = ix / (tier.cellsX - 1)
      const x = THREE.MathUtils.lerp(-edgeX, edgeX, amount)
      for (const z of [-edgeZ, edgeZ]) {
        const cell = new THREE.Mesh(
          cellGeometry,
          materials.paleStone,
        )
        cell.position.set(x, cellY, z)
        cell.rotation.y = (ix + tierIndex) * Math.PI * 0.25
        ceiling.add(cell)
      }
    }

    for (let iz = 0; iz < tier.cellsZ; iz += 1) {
      const amount = (iz + 1) / (tier.cellsZ + 1)
      const z = THREE.MathUtils.lerp(-edgeZ, edgeZ, amount)
      for (const x of [-edgeX, edgeX]) {
        const cell = new THREE.Mesh(
          cellGeometry,
          materials.paleStone,
        )
        cell.position.set(x, cellY, z)
        cell.rotation.y = (iz + tierIndex + 1) * Math.PI * 0.25
        ceiling.add(cell)
      }
    }
  }

  const pendantGeometry = new THREE.ConeGeometry(0.3, 0.52, 4, 1)
  pendantGeometry.rotateZ(Math.PI)
  const pendant = new THREE.Mesh(
    pendantGeometry,
    materials.paleStone,
  )
  pendant.position.y = 2.95
  pendant.rotation.y = Math.PI / 4
  ceiling.add(pendant)
  group.add(ceiling)

  const roofDrum = outlinedBox(
    7.12,
    0.42,
    4.78,
    materials.plaster,
    materials.ink,
    38,
  )
  roofDrum.position.y = 3.87
  group.add(roofDrum)
  registerStone(roofDrum, registry)

  const roof = createPyramidalRoof(
    7.8,
    5.35,
    1.6,
    materials.roof,
    materials.ink,
  )
  roof.position.y = 4.78
  group.add(roof)
  enableShadows(group)
  return group
}

function createBathHouse(
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'Comares bath abstraction'
  const plot = SITE_PLOTS.palaceBath
  group.position.set(
    plot.center[0],
    plot.floorY,
    plot.center[1],
  )

  const floor = outlinedBox(
    plot.size[0] - 0.3,
    0.22,
    plot.size[1] - 0.3,
    materials.stone,
    materials.ink,
  )
  floor.position.y = -0.11
  group.add(floor)
  registerStone(floor, registry)
  addLocalPlotEngineering(
    group,
    plot,
    materials,
    registry,
    ['north', 'east'],
  )

  const body = outlinedBox(
    9.5,
    3.4,
    6.4,
    materials.stone,
    materials.ink,
  )
  body.position.y = 1.7
  group.add(body)
  registerStone(body, registry)

  const vault = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.2, 9.5, 10, 1, false, 0, Math.PI),
    materials.paleStone,
  )
  vault.rotation.set(0, 0, Math.PI / 2)
  vault.position.y = 3.4
  vault.scale.z = 0.82
  group.add(vault)

  const skylightGeometry = new THREE.CylinderGeometry(0.12, 0.16, 0.12, 5)
  for (let ix = -2; ix <= 2; ix += 1) {
    for (const z of [-1.2, 0, 1.2]) {
      const light = new THREE.Mesh(
        skylightGeometry,
        materials.waterBright,
      )
      light.position.set(ix * 1.25, 5.75 - Math.abs(z) * 0.08, z)
      group.add(light)
    }
  }
  enableShadows(group)
  return group
}

function createBackgroundPalaceMasses(
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'Palatine city'
  const masses = [
    { x: 37, z: -7, w: 9, d: 6, h: 4.2, roof: true },
    { x: 44, z: 7, w: 11, d: 5, h: 3.8, roof: false },
    { x: 51, z: 14, w: 8, d: 5, h: 4.8, roof: true },
    { x: 76, z: 12, w: 10, d: 6, h: 4.2, roof: true },
    { x: 78, z: -8, w: 12, d: 6, h: 3.6, roof: false },
    { x: 66, z: -13, w: 7, d: 5, h: 4.5, roof: true },
  ]

  for (const mass of masses) {
    const ground = sampleFootprintGround(
      mass.x,
      mass.z,
      mass.w,
      mass.d,
    )
    const localDatum = Math.max(
      ground.median + 0.35,
      ground.maximum + 0.08,
    )
    const floorY = Math.ceil(localDatum * 2) * 0.5
    const bottomY = ground.minimum - 0.28
    const roofLineY = floorY + mass.h
    const groundedHeight = roofLineY - bottomY
    const body = outlinedBox(
      mass.w,
      groundedHeight,
      mass.d,
      materials.stone,
      materials.ink,
    )
    body.position.set(
      mass.x,
      bottomY + groundedHeight * 0.5,
      mass.z,
    )
    body.userData.foundationDepth = floorY - bottomY
    group.add(body)
    registerStone(body, registry)

    const plinthCourse = outlinedBox(
      mass.w + 0.18,
      0.18,
      mass.d + 0.18,
      materials.paleStone,
      materials.ink,
      42,
    )
    plinthCourse.position.set(mass.x, floorY + 0.09, mass.z)
    group.add(plinthCourse)
    registerStone(plinthCourse, registry)

    if (mass.roof) {
      const roof = createPyramidalRoof(
        mass.w * 1.08,
        mass.d * 1.1,
        1.6,
        materials.roof,
        materials.ink,
      )
      roof.position.set(mass.x, roofLineY + 0.75, mass.z)
      group.add(roof)
    }
  }
  enableShadows(group)
  return group
}

function createGeneralife(
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'Generalife terraces'

  const terraces: readonly SitePlot[] = [
    SITE_PLOTS.generalifeUpper,
    SITE_PLOTS.generalifeMiddle,
    SITE_PLOTS.generalifeLower,
  ]
  for (const [index, terrace] of terraces.entries()) {
    const floorPlate = outlinedBox(
      terrace.size[0] - 0.28,
      0.18,
      terrace.size[1] - 0.28,
      index === 1 ? materials.paleStone : materials.stone,
      materials.ink,
    )
    floorPlate.position.set(
      terrace.center[0],
      terrace.floorY - 0.09,
      terrace.center[1],
    )
    floorPlate.userData.architecture = 'generalife-floor'
    group.add(floorPlate)
    registerStone(floorPlate, registry)

    group.add(
      createRetainingWall(
        terrace,
        materials,
        registry,
        groundHeightAt,
      ),
      createButtressRhythm(
        terrace,
        materials,
        registry,
        {
          edges: index === 0
            ? ['north', 'west']
            : ['north'],
          spacing: index === 0 ? 5.6 : 5,
          projection: index === 0 ? 1.05 : 0.82,
        },
      ),
    )
  }

  group.add(
    createTerraceStair(
      SITE_PLOTS.generalifeUpper,
      materials,
      registry,
      {
        edge: 'north',
        centerOffset: 7.2,
        width: 3.6,
        baseY: SITE_PLOTS.generalifeMiddle.floorY,
      },
    ),
    createTerraceStair(
      SITE_PLOTS.generalifeMiddle,
      materials,
      registry,
      {
        edge: 'north',
        centerOffset: -6.4,
        width: 3.4,
        baseY: SITE_PLOTS.generalifeLower.floorY,
      },
    ),
    createOverflowSpout(
      SITE_PLOTS.generalifeMiddle,
      materials,
      registry,
      {
        edge: 'north',
        centerOffset: 13.1,
        sillDrop: 0.64,
      },
    ),
  )

  const patioFloorY = SITE_PLOTS.generalifeMiddle.floorY + 0.08
  const canalFrame = outlinedBox(
    25.5,
    0.25,
    1.35,
    materials.deepStone,
    materials.ink,
  )
  canalFrame.position.set(-6, patioFloorY, -20.5)
  group.add(canalFrame)
  registerStone(canalFrame, registry)

  const canalWater = boxMesh(
    24.8,
    0.055,
    0.82,
    materials.waterBright,
  )
  canalWater.position.set(-6, patioFloorY + 0.16, -20.5)
  canalWater.userData.waterSurfaceId = 'generalife-patio'
  group.add(canalWater)
  registry.waterSurfaces.push(canalWater)

  const arcade = createArcade(
    26,
    10,
    2.4,
    materials.paleStone,
    materials.ink,
    materials.plaster,
  )
  arcade.position.set(-6, patioFloorY + 0.05, -23.75)
  group.add(arcade)

  const pavilion = outlinedBox(
    7.2,
    4.3,
    6.8,
    materials.plaster,
    materials.ink,
  )
  pavilion.position.set(10.8, patioFloorY + 2.6, -20.5)
  group.add(pavilion)
  registerStone(pavilion, registry)
  const pavilionPlinth = outlinedBox(
    7.65,
    0.46,
    7.15,
    materials.stone,
    materials.ink,
  )
  pavilionPlinth.position.set(10.8, patioFloorY + 0.23, -20.5)
  group.add(pavilionPlinth)
  registerStone(pavilionPlinth, registry)

  const windowGeometry = new THREE.BoxGeometry(0.72, 1.28, 0.08)
  for (const x of [8.75, 10.8, 12.85]) {
    const recess = new THREE.Mesh(windowGeometry, materials.deepStone)
    recess.position.set(x, patioFloorY + 2.7, -17.06)
    recess.userData.architecture = 'generalife-window-recess'
    group.add(recess)
  }
  const roof = createPyramidalRoof(
    8.2,
    7.7,
    2,
    materials.roof,
    materials.ink,
  )
  roof.position.set(10.8, patioFloorY + 5.65, -20.5)
  group.add(roof)

  for (const [terraceIndex, terrace] of terraces.entries()) {
    const bedCount = terraceIndex === 1 ? 6 : 5
    const bedWidth = terrace.size[0] * 0.13
    const bedGap = terrace.size[0] * 0.03
    const totalBedsWidth = bedCount * bedWidth + (bedCount - 1) * bedGap
    const bedStart = terrace.center[0] - totalBedsWidth * 0.5 + bedWidth * 0.5
    for (const side of [-1, 1]) {
      for (let i = 0; i < bedCount; i += 1) {
        const bed = outlinedBox(
          bedWidth,
          0.12,
          1.35,
          materials.garden,
          materials.ink,
          40,
        )
        const bedX = bedStart + i * (bedWidth + bedGap)
        const bedZ =
          terrace.center[1] +
          side * Math.min(2.15, terrace.size[1] * 0.27)
        bed.position.set(bedX, terrace.floorY + 0.06, bedZ)
        group.add(bed)

        if ((i + terraceIndex + (side > 0 ? 1 : 0)) % 2 === 0) {
          const tree =
            i === 0 || i === bedCount - 1
              ? createCypress(3.2, materials.garden, materials.trunk)
              : createOrangeTree(2.05, materials.garden, materials.trunk)
          tree.position.set(
            bedX,
            terrace.floorY + 0.12,
            bedZ,
          )
          group.add(tree)
          registry.vegetation.push(tree)
        }
      }
    }
  }
  enableShadows(group)
  return group
}

export function createArchitecture(
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
): ArchitectureResult {
  const group = new THREE.Group()
  group.name = 'Alhambra capriccio architecture'

  const walls = createCitadelWalls(materials, registry)
  const palaceMasses = createBackgroundPalaceMasses(materials, registry)
  const generalife = createGeneralife(materials, registry)
  const lions = createLionsCourtyard(materials, registry)
  const comares = createComaresCourtyard(materials, registry)
  const muqarnas = createMuqarnasPavilion(materials, registry)
  const bath = createBathHouse(materials, registry)
  group.add(
    walls,
    palaceMasses,
    generalife,
    lions.group,
    comares.group,
    muqarnas,
    bath,
  )
  enableShadows(group)

  return {
    group,
    lionsFountain: lions.fountain,
    comaresPool: comares.pool,
  }
}
