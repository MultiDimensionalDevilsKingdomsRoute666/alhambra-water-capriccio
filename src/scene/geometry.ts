import * as THREE from 'three'

export interface SceneRegistry {
  wettableStone: THREE.Mesh[]
  waterSurfaces: THREE.Mesh[]
  vegetation: THREE.Object3D[]
}

export function enableShadows(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })
}

export function addOutline(
  mesh: THREE.Mesh,
  ink: THREE.LineBasicMaterial,
  parent: THREE.Object3D = mesh,
  thresholdAngle = 32,
): THREE.LineSegments {
  const line = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, thresholdAngle),
    ink,
  )
  line.renderOrder = 4
  line.userData.isSceneOutline = true
  parent.add(line)
  return line
}

export function boxMesh(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material,
  )
}

export function outlinedBox(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  ink: THREE.LineBasicMaterial,
  thresholdAngle = 32,
): THREE.Mesh {
  const mesh = boxMesh(width, height, depth, material)
  addOutline(mesh, ink, mesh, thresholdAngle)
  return mesh
}

export function placeOnGround(
  object: THREE.Object3D,
  x: number,
  z: number,
  groundY: number,
): void {
  object.position.set(x, groundY, z)
}

export function createBattlements(
  width: number,
  depth: number,
  blockWidth: number,
  blockHeight: number,
  material: THREE.Material,
): THREE.Group {
  const group = new THREE.Group()
  const countX = Math.max(2, Math.floor(width / (blockWidth * 1.75)))
  const countZ = Math.max(2, Math.floor(depth / (blockWidth * 1.75)))

  for (let i = 0; i <= countX; i += 1) {
    const x = -width / 2 + (i / countX) * width
    for (const z of [-depth / 2, depth / 2]) {
      const block = boxMesh(blockWidth, blockHeight, blockWidth, material)
      block.position.set(x, blockHeight / 2, z)
      group.add(block)
    }
  }

  for (let i = 1; i < countZ; i += 1) {
    const z = -depth / 2 + (i / countZ) * depth
    for (const x of [-width / 2, width / 2]) {
      const block = boxMesh(blockWidth, blockHeight, blockWidth, material)
      block.position.set(x, blockHeight / 2, z)
      group.add(block)
    }
  }
  return group
}

export function createArcade(
  span: number,
  bays: number,
  columnHeight: number,
  material: THREE.Material,
  ink: THREE.LineBasicMaterial,
  accentMaterial: THREE.Material = material,
): THREE.Group {
  const group = new THREE.Group()
  const bayWidth = span / bays
  const columnGeometry = new THREE.CylinderGeometry(
    bayWidth * 0.075,
    bayWidth * 0.09,
    columnHeight,
    8,
    1,
  )
  const baseGeometry = new THREE.CylinderGeometry(
    bayWidth * 0.13,
    bayWidth * 0.15,
    0.16,
    8,
  )
  const neckGeometry = new THREE.CylinderGeometry(
    bayWidth * 0.105,
    bayWidth * 0.085,
    0.18,
    8,
  )
  const capitalGeometry = new THREE.BoxGeometry(
    bayWidth * 0.25,
    0.16,
    bayWidth * 0.25,
  )
  const abacusGeometry = new THREE.BoxGeometry(
    bayWidth * 0.31,
    0.11,
    bayWidth * 0.31,
  )

  for (let i = 0; i <= bays; i += 1) {
    const x = -span / 2 + i * bayWidth
    const base = new THREE.Mesh(baseGeometry, accentMaterial)
    base.position.set(x, 0.08, 0)
    group.add(base)

    const column = new THREE.Mesh(columnGeometry, material)
    column.position.set(x, columnHeight / 2 + 0.12, 0)
    group.add(column)

    const neck = new THREE.Mesh(neckGeometry, accentMaterial)
    neck.position.set(x, columnHeight + 0.14, 0)
    const capital = new THREE.Mesh(capitalGeometry, accentMaterial)
    capital.position.set(x, columnHeight + 0.28, 0)
    const abacus = new THREE.Mesh(abacusGeometry, accentMaterial)
    abacus.position.set(x, columnHeight + 0.415, 0)
    group.add(neck, capital, abacus)
  }

  const archGeometry = new THREE.TorusGeometry(
    bayWidth * 0.38,
    bayWidth * 0.075,
    5,
    18,
    Math.PI,
  )
  const archBandGeometry = new THREE.TorusGeometry(
    bayWidth * 0.38,
    bayWidth * 0.028,
    4,
    18,
    Math.PI,
  )
  for (let i = 0; i < bays; i += 1) {
    const arch = new THREE.Mesh(archGeometry, material)
    arch.position.set(
      -span / 2 + bayWidth * (i + 0.5),
      columnHeight + 0.42,
      0,
    )
    const archBand = new THREE.Mesh(archBandGeometry, accentMaterial)
    archBand.position.copy(arch.position)
    archBand.position.z += bayWidth * 0.086
    group.add(arch, archBand)
  }

  const lintel = outlinedBox(
    span + bayWidth * 0.18,
    0.28,
    bayWidth * 0.31,
    material,
    ink,
  )
  lintel.position.y = columnHeight + bayWidth * 0.45
  const cornice = outlinedBox(
    span + bayWidth * 0.3,
    0.14,
    bayWidth * 0.4,
    accentMaterial,
    ink,
  )
  cornice.position.y = lintel.position.y + 0.21
  group.add(lintel, cornice)
  enableShadows(group)
  return group
}

export function createPyramidalRoof(
  width: number,
  depth: number,
  height: number,
  material: THREE.Material,
  ink: THREE.LineBasicMaterial,
): THREE.Mesh {
  const radius = Math.SQRT2 * 0.5
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(radius, height, 4, 1, false, Math.PI / 4),
    material,
  )
  roof.scale.set(width, 1, depth)
  addOutline(roof, ink)
  return roof
}

export function createCypress(
  height: number,
  garden: THREE.Material,
  trunk: THREE.Material,
): THREE.Group {
  const group = new THREE.Group()
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.13, height * 0.42, 5),
    trunk,
  )
  stem.position.y = height * 0.22
  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(height * 0.13, height, 7, 2),
    garden,
  )
  crown.position.y = height * 0.58
  group.add(stem, crown)
  return group
}

export function createOrangeTree(
  height: number,
  garden: THREE.Material,
  trunk: THREE.Material,
): THREE.Group {
  const group = new THREE.Group()
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.16, height * 0.44, 5),
    trunk,
  )
  stem.position.y = height * 0.22
  const crown = new THREE.Mesh(
    new THREE.IcosahedronGeometry(height * 0.3, 1),
    garden,
  )
  crown.scale.y = 0.78
  crown.position.y = height * 0.68
  group.add(stem, crown)
  return group
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
