import * as THREE from 'three'
import { WORLD } from '../worldSpec'
import { createArchitecture } from './architecture'
import { resolveAlhambraMaterials } from './materials'
import { createTerrain } from './terrain'
import type {
  AlhambraFocusId,
  AlhambraFocusPosition,
  AlhambraSceneMaterials,
  AlhambraSceneResult,
} from './types'
import { createWaterworks } from './waterworks'

export type {
  AlhambraClimateTargets,
  AlhambraFocusId,
  AlhambraFocusPosition,
  AlhambraInteractionId,
  AlhambraSceneMaterials,
  AlhambraSceneResult,
} from './types'

function focus(
  id: AlhambraFocusId,
  target: THREE.Vector3,
  camera: THREE.Vector3,
): AlhambraFocusPosition {
  return { id, target, camera }
}

function createFocusPositions(): Record<
  AlhambraFocusId,
  AlhambraFocusPosition
> {
  return {
    overview: focus(
      'overview',
      new THREE.Vector3(10, 23, -1),
      new THREE.Vector3(-61, 69, 92),
    ),
    generalife: focus(
      'generalife',
      new THREE.Vector3(-6, 29, -20),
      new THREE.Vector3(-38, 43, 11),
    ),
    albercones: focus(
      'albercones',
      WORLD.water.albercones.clone().add(new THREE.Vector3(0, 2, 0)),
      new THREE.Vector3(-55, 46, -6),
    ),
    waterTower: focus(
      'waterTower',
      WORLD.water.waterTower.clone().add(new THREE.Vector3(0, 2, 0)),
      new THREE.Vector3(4, 38, 18),
    ),
    lions: focus(
      'lions',
      WORLD.water.lions.clone().add(new THREE.Vector3(0, 1, 0)),
      new THREE.Vector3(39, 32, 10),
    ),
    comares: focus(
      'comares',
      WORLD.water.comares.clone().add(new THREE.Vector3(0, 2, 0)),
      new THREE.Vector3(47, 34, 26),
    ),
  }
}

export function createAlhambraScene(
  suppliedMaterials: Partial<AlhambraSceneMaterials> = {},
): AlhambraSceneResult {
  const materials = resolveAlhambraMaterials(suppliedMaterials)
  const root = new THREE.Group()
  root.name = 'Alhambra — a hydraulic capriccio'

  const registry = {
    wettableStone: [] as THREE.Mesh[],
    waterSurfaces: [] as THREE.Mesh[],
    vegetation: [] as THREE.Object3D[],
  }
  const terrain = createTerrain(materials, registry)
  const architecture = createArchitecture(materials, registry)
  const waterworks = createWaterworks(materials, registry)
  root.add(terrain.group, architecture.group, waterworks.group)

  const focusPositions = createFocusPositions()
  for (const site of Object.values(focusPositions)) {
    const marker = new THREE.Object3D()
    marker.name = `${site.id} focus target`
    marker.position.copy(site.target)
    marker.userData.focusId = site.id
    root.add(marker)
  }

  root.updateMatrixWorld(true)
  return {
    root,
    focusPositions,
    interactiveObjects: {
      intakeGate: waterworks.intakeGate,
      partidorGate: waterworks.partidorGate,
      waterWheel: waterworks.waterWheel,
      lionsFountain: architecture.lionsFountain,
      comaresPool: architecture.comaresPool,
    },
    waterWheel: waterworks.waterWheel,
    climateTargets: {
      terrain: terrain.terrain,
      vegetation: registry.vegetation,
      waterSurfaces: registry.waterSurfaces,
      wettableStone: registry.wettableStone,
      exposedMaterials: {
        terrain: materials.terrain,
        garden: materials.garden,
        stone: materials.stone,
        water: materials.water,
      },
    },
    waterSurfaces: registry.waterSurfaces,
  }
}
