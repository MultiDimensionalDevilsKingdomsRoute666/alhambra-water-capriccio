import type * as THREE from 'three'

export type ClimateId = 'dawn' | 'sun' | 'rain'

export interface FocusSite {
  id: string
  eyebrow: string
  title: string
  description: string
  principle: string
  progress: number
  cameraPosition: THREE.Vector3
  cameraTarget: THREE.Vector3
  worldPosition: THREE.Vector3
}

export interface EngravingPalette {
  paper: THREE.ColorRepresentation
  stone: THREE.ColorRepresentation
  paleStone: THREE.ColorRepresentation
  deepStone: THREE.ColorRepresentation
  ink: THREE.ColorRepresentation
  accent: THREE.ColorRepresentation
  garden: THREE.ColorRepresentation
}
