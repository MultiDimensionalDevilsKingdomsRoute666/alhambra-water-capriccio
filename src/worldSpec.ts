import * as THREE from 'three'

export const WORLD = {
  sizeX: 220,
  sizeZ: 132,
  water: {
    intake: new THREE.Vector3(-96, 29.2, 28),
    contourA: new THREE.Vector3(-76, 29.0, 14),
    contourB: new THREE.Vector3(-52, 28.6, -1),
    partidor: new THREE.Vector3(-31, 28.2, -17),
    generalife: new THREE.Vector3(-7, 26.1, -17),
    // Pulled northwest of the Generalife terraces so the high reservoir reads
    // as a distinct hydraulic shelf rather than intersecting the upper garden.
    albercones: new THREE.Vector3(-31, 32.2, -36),
    waterTower: new THREE.Vector3(27, 23.2, -5),
    city: new THREE.Vector3(43, 22.4, -2),
    lions: new THREE.Vector3(54, 21.9, -8),
    comares: new THREE.Vector3(65, 21.6, 4),
    bath: new THREE.Vector3(59, 21.2, 11),
    drain: new THREE.Vector3(82, 15.8, 24),
  },
} as const

export function riverZAt(x: number): number {
  return 29 + Math.sin(x * 0.034) * 7 + Math.sin(x * 0.011) * 3
}

export function heightAt(x: number, z: number): number {
  const base = 17 - x * 0.18
  const sabika =
    13 *
    Math.exp(
      -Math.pow((x - 48) / 57, 2) -
        Math.pow((z + 1) / 22, 2),
    )
  const cerro =
    7.5 *
    Math.exp(
      -Math.pow((x + 22) / 49, 2) -
        Math.pow((z + 25) / 31, 2),
    )
  const valley =
    6.3 * Math.exp(-Math.pow((z - riverZAt(x)) / 9.5, 2))
  const broadNoise =
    Math.sin(x * 0.073 + z * 0.039) * 0.65 +
    Math.sin(x * 0.021 - z * 0.083) * 0.38
  return base + sabika + cerro - valley + broadNoise
}

export function terrainPoint(x: number, z: number, lift = 0): THREE.Vector3 {
  return new THREE.Vector3(x, heightAt(x, z) + lift, z)
}
