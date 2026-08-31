import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

interface CameraJourney {
  fromPosition: THREE.Vector3
  toPosition: THREE.Vector3
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  elapsed: number
  duration: number
}

const OVERVIEW_POSITION = new THREE.Vector3(-42, 70, 94)
const OVERVIEW_TARGET = new THREE.Vector3(17, 22, -3)

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls
  private journey: CameraJourney | null = null
  private introDelay = 0.35

  constructor(canvas: HTMLCanvasElement) {
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.2, 520)
    this.camera.position.set(-66, 92, 144)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.target.copy(OVERVIEW_TARGET)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.065
    this.controls.enablePan = false
    this.controls.rotateSpeed = 0.52
    this.controls.zoomSpeed = 0.72
    this.controls.minDistance = 17
    this.controls.maxDistance = 205
    this.controls.minPolarAngle = 0.24
    this.controls.maxPolarAngle = Math.PI * 0.485
    this.controls.target0.copy(OVERVIEW_TARGET)
    this.controls.position0.copy(OVERVIEW_POSITION)
    this.controls.addEventListener('start', () => {
      this.journey = null
    })
  }

  startIntro(): void {
    this.journey = {
      fromPosition: this.camera.position.clone(),
      toPosition: OVERVIEW_POSITION.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: OVERVIEW_TARGET.clone(),
      elapsed: -this.introDelay,
      duration: 2.8,
    }
  }

  focus(
    cameraPosition: THREE.Vector3,
    target: THREE.Vector3,
    duration = 1.65,
  ): void {
    this.journey = {
      fromPosition: this.camera.position.clone(),
      toPosition: cameraPosition.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
      elapsed: 0,
      duration,
    }
  }

  overview(): void {
    this.focus(OVERVIEW_POSITION, OVERVIEW_TARGET, 1.9)
  }

  update(delta: number): void {
    if (this.journey) {
      this.journey.elapsed += delta
      if (this.journey.elapsed >= 0) {
        const raw = THREE.MathUtils.clamp(
          this.journey.elapsed / this.journey.duration,
          0,
          1,
        )
        const eased =
          raw < 0.5
            ? 16 * raw * raw * raw * raw * raw
            : 1 - Math.pow(-2 * raw + 2, 5) / 2
        this.camera.position.lerpVectors(
          this.journey.fromPosition,
          this.journey.toPosition,
          eased,
        )
        this.controls.target.lerpVectors(
          this.journey.fromTarget,
          this.journey.toTarget,
          eased,
        )
        if (raw >= 1) this.journey = null
      }
    }
    this.controls.update()
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(height, 1)
    this.camera.updateProjectionMatrix()
  }
}
