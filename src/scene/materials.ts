import * as THREE from 'three'
import type { AlhambraSceneMaterials } from './types'

function standard(
  color: THREE.ColorRepresentation,
  roughness = 0.88,
  metalness = 0,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading: true,
  })
}

export function resolveAlhambraMaterials(
  supplied: Partial<AlhambraSceneMaterials>,
): AlhambraSceneMaterials {
  const terrain =
    supplied.terrain ??
    standard('#b5a27f', 1)
  const cliff =
    supplied.cliff ??
    standard('#8c7657', 1)
  const stone =
    supplied.stone ??
    standard('#c9b794', 0.95)
  const paleStone =
    supplied.paleStone ??
    standard('#ddceb0', 0.92)
  const deepStone =
    supplied.deepStone ??
    standard('#776047', 0.98)
  const plaster =
    supplied.plaster ??
    standard('#d5bd91', 0.96)
  const roof =
    supplied.roof ??
    standard('#7d4936', 0.92)
  const garden =
    supplied.garden ??
    standard('#40583a', 0.98)
  const trunk =
    supplied.trunk ??
    standard('#5c4935', 1)
  const water =
    supplied.water ??
    new THREE.MeshPhysicalMaterial({
      color: '#2f7680',
      roughness: 0.18,
      metalness: 0.02,
      transmission: 0.12,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  const waterBright =
    supplied.waterBright ??
    new THREE.MeshBasicMaterial({
      color: '#79c5c4',
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  const metal =
    supplied.metal ??
    standard('#4f4032', 0.65, 0.2)
  const ink =
    supplied.ink ??
    new THREE.LineBasicMaterial({
      color: '#302a24',
      transparent: true,
      opacity: 0.48,
    })

  return {
    terrain,
    cliff,
    stone,
    paleStone,
    deepStone,
    plaster,
    roof,
    garden,
    trunk,
    water,
    waterBright,
    metal,
    ink,
  }
}
