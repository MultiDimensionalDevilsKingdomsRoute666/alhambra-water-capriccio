import type * as THREE from 'three'

export type AlhambraFocusId =
  | 'overview'
  | 'generalife'
  | 'albercones'
  | 'waterTower'
  | 'lions'
  | 'comares'

export type AlhambraInteractionId =
  | 'intakeGate'
  | 'partidorGate'
  | 'waterWheel'
  | 'lionsFountain'
  | 'comaresPool'

export interface AlhambraSceneMaterials {
  terrain: THREE.Material
  cliff: THREE.Material
  stone: THREE.Material
  paleStone: THREE.Material
  deepStone: THREE.Material
  plaster: THREE.Material
  roof: THREE.Material
  garden: THREE.Material
  trunk: THREE.Material
  water: THREE.Material
  waterBright: THREE.Material
  metal: THREE.Material
  ink: THREE.LineBasicMaterial
}

export interface AlhambraFocusPosition {
  id: AlhambraFocusId
  target: THREE.Vector3
  camera: THREE.Vector3
}

export interface AlhambraClimateTargets {
  terrain: THREE.Mesh
  vegetation: THREE.Object3D[]
  waterSurfaces: THREE.Mesh[]
  wettableStone: THREE.Mesh[]
  exposedMaterials: {
    terrain: THREE.Material
    garden: THREE.Material
    stone: THREE.Material
    water: THREE.Material
  }
}

export interface AlhambraSceneResult {
  root: THREE.Group
  focusPositions: Record<AlhambraFocusId, AlhambraFocusPosition>
  interactiveObjects: Record<AlhambraInteractionId, THREE.Object3D>
  waterWheel: THREE.Group
  climateTargets: AlhambraClimateTargets
  waterSurfaces: THREE.Mesh[]
}
