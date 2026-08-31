import * as THREE from 'three'
import { groundHeightAt } from '../landscape'
import { WORLD, riverZAt } from '../worldSpec'
import {
  addOutline,
  enableShadows,
  mulberry32,
  outlinedBox,
  type SceneRegistry,
} from './geometry'
import type { AlhambraSceneMaterials } from './types'

export interface TerrainResult {
  group: THREE.Group
  terrain: THREE.Mesh
}

function createTerrainGeometry(): THREE.BufferGeometry {
  // Roughly 1.4 world units per sample: dense enough for authored terrace
  // shoulders without turning the whole landscape into an expensive mesh.
  const segmentsX = 160
  const segmentsZ = 96
  const vertices: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let iz = 0; iz <= segmentsZ; iz += 1) {
    const vz = iz / segmentsZ
    const z = (vz - 0.5) * WORLD.sizeZ
    for (let ix = 0; ix <= segmentsX; ix += 1) {
      const vx = ix / segmentsX
      const x = (vx - 0.5) * WORLD.sizeX
      vertices.push(x, groundHeightAt(x, z), z)
      uvs.push(vx, vz)
    }
  }

  const stride = segmentsX + 1
  for (let iz = 0; iz < segmentsZ; iz += 1) {
    for (let ix = 0; ix < segmentsX; ix += 1) {
      const a = iz * stride + ix
      const b = a + 1
      const c = a + stride
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  )
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function createRiver(material: THREE.Material): THREE.Mesh {
  const samples = 72
  const vertices: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples
    const x = -WORLD.sizeX / 2 + t * WORLD.sizeX
    const z = riverZAt(x)
    const dx = 0.2
    const tangent = new THREE.Vector2(
      dx,
      riverZAt(x + dx) - riverZAt(x - dx),
    ).normalize()
    const normal = new THREE.Vector2(-tangent.y, tangent.x)
    const halfWidth = 1.15 + Math.sin(t * Math.PI * 5.2) * 0.22
    for (const side of [-1, 1]) {
      const px = x + normal.x * halfWidth * side
      const pz = z + normal.y * halfWidth * side
      vertices.push(px, groundHeightAt(px, pz) + 0.16, pz)
      uvs.push(t, side === -1 ? 0 : 1)
    }
  }

  for (let i = 0; i < samples; i += 1) {
    const a = i * 2
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  )
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const river = new THREE.Mesh(geometry, material)
  river.receiveShadow = true
  river.renderOrder = 2
  river.userData.waterSurfaceId = 'darro'
  return river
}

function createHillsideVegetation(
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
): THREE.Group {
  const group = new THREE.Group()
  const random = mulberry32(1492)
  const treeCount = 92
  const crown = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 6, 2),
    materials.garden,
    treeCount,
  )
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1, 5),
    materials.trunk,
    treeCount,
  )
  const transform = new THREE.Object3D()
  let placed = 0
  let attempts = 0

  while (placed < treeCount && attempts < treeCount * 8) {
    attempts += 1
    const x = -104 + random() * 208
    const z = -60 + random() * 120
    const insidePalace =
      x > 18 && x < 91 && z > -23 && z < 21
    const insideGeneralife =
      x > -31 && x < 16 && z > -39 && z < -4
    const besideRiver = Math.abs(z - riverZAt(x)) < 8.5
    if (insidePalace || insideGeneralife || besideRiver) continue

    const ground = groundHeightAt(x, z)
    const height = 1.5 + random() * 2.8
    const width = 0.22 + height * 0.1
    const lean = (random() - 0.5) * 0.08

    transform.position.set(x, ground + height * 0.58, z)
    transform.rotation.set(lean, random() * Math.PI, -lean)
    transform.scale.set(width, height, width)
    transform.updateMatrix()
    crown.setMatrixAt(placed, transform.matrix)

    transform.position.set(x, ground + height * 0.16, z)
    transform.rotation.set(0, 0, 0)
    transform.scale.set(0.07, height * 0.32, 0.07)
    transform.updateMatrix()
    trunks.setMatrixAt(placed, transform.matrix)
    placed += 1
  }

  crown.count = placed
  trunks.count = placed
  crown.instanceMatrix.needsUpdate = true
  trunks.instanceMatrix.needsUpdate = true
  crown.castShadow = true
  crown.receiveShadow = true
  trunks.castShadow = true
  group.add(trunks, crown)
  registry.vegetation.push(group)
  return group
}

export function createTerrain(
  materials: AlhambraSceneMaterials,
  registry: SceneRegistry,
): TerrainResult {
  const group = new THREE.Group()
  group.name = 'Sabika landscape'

  const base = outlinedBox(
    WORLD.sizeX + 2,
    6,
    WORLD.sizeZ + 2,
    materials.cliff,
    materials.ink,
  )
  base.position.y = -3.1
  base.receiveShadow = true
  registry.wettableStone.push(base)
  group.add(base)

  const terrain = new THREE.Mesh(
    createTerrainGeometry(),
    materials.terrain,
  )
  terrain.name = 'Sabika and Cerro del Sol'
  terrain.receiveShadow = true
  group.add(terrain)

  const river = createRiver(materials.water)
  group.add(river)
  registry.waterSurfaces.push(river)

  const vegetation = createHillsideVegetation(materials, registry)
  group.add(vegetation)

  const intakeRock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.3, 0),
    materials.deepStone,
  )
  intakeRock.scale.set(2.4, 0.8, 1.1)
  intakeRock.position.set(
    WORLD.water.intake.x - 1.8,
    groundHeightAt(WORLD.water.intake.x - 1.8, WORLD.water.intake.z) + 0.65,
    WORLD.water.intake.z,
  )
  addOutline(intakeRock, materials.ink)
  group.add(intakeRock)
  registry.wettableStone.push(intakeRock)

  enableShadows(group)
  return { group, terrain }
}
