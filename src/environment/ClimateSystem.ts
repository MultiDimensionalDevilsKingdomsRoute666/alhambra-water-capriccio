import * as THREE from 'three'
import type { ClimateId } from '../types'
import { groundHeightAt } from '../landscape'
import {
  setEngravingWetness,
  syncEngravingLightModel,
} from '../render/engraving'

interface ClimateProfile {
  background: THREE.Color
  fog: THREE.Color
  sun: THREE.Color
  hemiSky: THREE.Color
  hemiGround: THREE.Color
  sunIntensity: number
  hemiIntensity: number
  fogDensity: number
  wetness: number
  sunPosition: THREE.Vector3
}

const PROFILES: Record<ClimateId, ClimateProfile> = {
  dawn: {
    background: new THREE.Color(0xd7a878),
    fog: new THREE.Color(0xd5ae83),
    sun: new THREE.Color(0xffd19a),
    hemiSky: new THREE.Color(0xe8c39d),
    hemiGround: new THREE.Color(0x5d5548),
    sunIntensity: 3.2,
    hemiIntensity: 1.55,
    fogDensity: 0.0068,
    wetness: 0.08,
    sunPosition: new THREE.Vector3(-94, 42, -70),
  },
  sun: {
    background: new THREE.Color(0xead8b7),
    fog: new THREE.Color(0xdac8a5),
    sun: new THREE.Color(0xffe2b1),
    hemiSky: new THREE.Color(0xf0dfbf),
    hemiGround: new THREE.Color(0x6c604b),
    sunIntensity: 4.2,
    hemiIntensity: 1.72,
    fogDensity: 0.0048,
    wetness: 0,
    sunPosition: new THREE.Vector3(-56, 96, -44),
  },
  rain: {
    background: new THREE.Color(0x859c99),
    fog: new THREE.Color(0x879995),
    sun: new THREE.Color(0xc7d3cc),
    hemiSky: new THREE.Color(0xaebdb8),
    hemiGround: new THREE.Color(0x414c48),
    sunIntensity: 1.7,
    hemiIntensity: 1.18,
    fogDensity: 0.0115,
    wetness: 0.92,
    sunPosition: new THREE.Vector3(-34, 68, -24),
  },
}

export class ClimateSystem {
  readonly root = new THREE.Group()
  readonly sun = new THREE.DirectionalLight()
  readonly hemisphere = new THREE.HemisphereLight()
  readonly rain: THREE.Points

  private current: ClimateProfile
  private target: ClimateProfile
  private rainPositions: Float32Array
  private rainSeeds: Float32Array
  private climate: ClimateId = 'dawn'

  constructor(private readonly scene: THREE.Scene) {
    this.current = cloneProfile(PROFILES.dawn)
    this.target = cloneProfile(PROFILES.dawn)

    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.left = -95
    this.sun.shadow.camera.right = 95
    this.sun.shadow.camera.top = 74
    this.sun.shadow.camera.bottom = -54
    this.sun.shadow.camera.near = 20
    this.sun.shadow.camera.far = 260
    this.sun.shadow.bias = -0.00032
    this.sun.shadow.normalBias = 0.045
    this.root.add(this.sun)
    this.root.add(this.sun.target)
    this.root.add(this.hemisphere)

    const rainGeometry = new THREE.BufferGeometry()
    const count = 920
    this.rainPositions = new Float32Array(count * 3)
    this.rainSeeds = new Float32Array(count)
    for (let i = 0; i < count; i += 1) {
      const i3 = i * 3
      const x = THREE.MathUtils.randFloatSpread(210)
      const z = THREE.MathUtils.randFloatSpread(125)
      this.rainPositions[i3] = x
      this.rainPositions[i3 + 1] = THREE.MathUtils.randFloat(18, 78)
      this.rainPositions[i3 + 2] = z
      this.rainSeeds[i] = Math.random()
    }
    rainGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.rainPositions, 3),
    )
    this.rain = new THREE.Points(
      rainGeometry,
      new THREE.PointsMaterial({
        color: 0xc4dedb,
        transparent: true,
        opacity: 0,
        size: 0.16,
        sizeAttenuation: true,
        depthWrite: false,
      }),
    )
    this.rain.frustumCulled = false
    this.rain.renderOrder = 8
    this.root.add(this.rain)

    this.scene.add(this.root)
    this.applyImmediate()
  }

  setClimate(climate: ClimateId): void {
    this.climate = climate
    this.target = cloneProfile(PROFILES[climate])
  }

  update(delta: number): void {
    const t = 1 - Math.exp(-delta * 1.45)
    this.current.background.lerp(this.target.background, t)
    this.current.fog.lerp(this.target.fog, t)
    this.current.sun.lerp(this.target.sun, t)
    this.current.hemiSky.lerp(this.target.hemiSky, t)
    this.current.hemiGround.lerp(this.target.hemiGround, t)
    this.current.sunIntensity = THREE.MathUtils.lerp(
      this.current.sunIntensity,
      this.target.sunIntensity,
      t,
    )
    this.current.hemiIntensity = THREE.MathUtils.lerp(
      this.current.hemiIntensity,
      this.target.hemiIntensity,
      t,
    )
    this.current.fogDensity = THREE.MathUtils.lerp(
      this.current.fogDensity,
      this.target.fogDensity,
      t,
    )
    this.current.wetness = THREE.MathUtils.lerp(
      this.current.wetness,
      this.target.wetness,
      t,
    )
    this.current.sunPosition.lerp(this.target.sunPosition, t)
    this.applyImmediate()

    const rainOpacityTarget = this.climate === 'rain' ? 0.58 : 0
    const rainMaterial = this.rain.material as THREE.PointsMaterial
    rainMaterial.opacity = THREE.MathUtils.lerp(
      rainMaterial.opacity,
      rainOpacityTarget,
      1 - Math.exp(-delta * 2.2),
    )
    this.rain.visible = rainMaterial.opacity > 0.008

    if (this.rain.visible) {
      for (let i = 0; i < this.rainSeeds.length; i += 1) {
        const i3 = i * 3
        this.rainPositions[i3] += delta * (1.8 + this.rainSeeds[i] * 2.6)
        this.rainPositions[i3 + 1] -=
          delta * (21 + this.rainSeeds[i] * 22)
        const ground = groundHeightAt(
          this.rainPositions[i3],
          this.rainPositions[i3 + 2],
        )
        if (this.rainPositions[i3 + 1] < ground + 0.7) {
          this.rainPositions[i3 + 1] = 68 + this.rainSeeds[i] * 18
          this.rainPositions[i3] = THREE.MathUtils.randFloatSpread(210)
          this.rainPositions[i3 + 2] = THREE.MathUtils.randFloatSpread(125)
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true
    }
  }

  private applyImmediate(): void {
    this.scene.background = this.current.background
    if (!(this.scene.fog instanceof THREE.FogExp2)) {
      this.scene.fog = new THREE.FogExp2(
        this.current.fog,
        this.current.fogDensity,
      )
    }
    this.scene.fog.color.copy(this.current.fog)
    this.scene.fog.density = this.current.fogDensity

    this.sun.color.copy(this.current.sun)
    this.sun.intensity = this.current.sunIntensity
    this.sun.position.copy(this.current.sunPosition)
    this.sun.target.position.set(12, 17, -2)

    this.hemisphere.color.copy(this.current.hemiSky)
    this.hemisphere.groundColor.copy(this.current.hemiGround)
    this.hemisphere.intensity = this.current.hemiIntensity
    setEngravingWetness(this.current.wetness)
    syncEngravingLightModel(this.sun, this.hemisphere)
  }
}

function cloneProfile(profile: ClimateProfile): ClimateProfile {
  return {
    background: profile.background.clone(),
    fog: profile.fog.clone(),
    sun: profile.sun.clone(),
    hemiSky: profile.hemiSky.clone(),
    hemiGround: profile.hemiGround.clone(),
    sunIntensity: profile.sunIntensity,
    hemiIntensity: profile.hemiIntensity,
    fogDensity: profile.fogDensity,
    wetness: profile.wetness,
    sunPosition: profile.sunPosition.clone(),
  }
}
