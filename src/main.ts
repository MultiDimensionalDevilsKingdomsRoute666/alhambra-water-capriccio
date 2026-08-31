import * as THREE from 'three'
import './style.css'

import { Ambience } from './audio/Ambience'
import { CameraRig } from './camera/CameraRig'
import { ClimateSystem } from './environment/ClimateSystem'
import {
  PALETTE,
  createEngravedMaterial,
  createMaterialSet,
} from './render/engraving'
import { createRenderPipeline } from './render/pipeline'
import { createAlhambraScene } from './scene'
import type { ClimateId } from './types'
import { createExhibitionUI } from './ui'
import type { ExhibitionUI } from './ui'
import {
  WATER_EDGES,
  WATER_NODES,
  WaterSystem,
  type WaterNodeId,
} from './water'
import { WORLD } from './worldSpec'

/**
 * Visible pools and rills follow stored water; channels follow actual edge
 * discharge.  The timeline still decides when each feature is introduced.
 */
const SURFACE_NODE: Readonly<Record<string, WaterNodeId>> = {
  'lions-rill': 'lions',
  'lions-basin': 'lions',
  comares: 'comares',
  'albercones-reservoir': 'albercones',
}

const SURFACE_EDGE: Readonly<Record<string, string>> = {
  'acequia-real': 'intake-contour-a',
  'generalife-patio': 'partidor-generalife',
  'albercones-lift': 'partidor-albercones',
  'water-tower-threshold': 'generalife-tower',
  'palace-main': 'tower-city',
  'comares-branch': 'city-comares',
}

const mount = document.querySelector<HTMLElement>('#app')
if (!mount) throw new Error('Application mount point was not found.')

mount.innerHTML = `
  <canvas class="world-canvas" aria-label="可旋转缩放的阿尔罕布拉水系建筑群"></canvas>
  <div class="site-loader" role="status">
    <div class="site-loader__seal" aria-hidden="true"></div>
    <div class="site-loader__copy">
      <span>Alhambra · Hydraulic Capriccio</span>
      <strong>水正在寻找路径</strong>
      <small>程序化建筑随想 · 非测绘复原</small>
    </div>
  </div>
`

const canvas = mount.querySelector<HTMLCanvasElement>('.world-canvas')
const loader = mount.querySelector<HTMLElement>('.site-loader')
if (!canvas || !loader) throw new Error('Application canvas could not be created.')

try {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.02
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  const cameraRig = new CameraRig(canvas)
  const climateSystem = new ClimateSystem(scene)
  const pipeline = createRenderPipeline(renderer, scene, cameraRig.camera)
  const ambience = new Ambience()
  ambience.setMuted(true)

  const engraved = createMaterialSet()
  const roof = createEngravedMaterial({
    color: 0x774638,
    hatchScale: 3.1,
    hatchStrength: 0.42,
    surface: 'roof',
    jointStrength: 0.46,
  })
  const water = new THREE.MeshPhysicalMaterial({
    color: PALETTE.accentDeep,
    roughness: 0.16,
    metalness: 0.02,
    transmission: 0.08,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const waterBright = new THREE.MeshStandardMaterial({
    color: PALETTE.accent,
    emissive: PALETTE.accentDeep,
    emissiveIntensity: 0.36,
    roughness: 0.24,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const ink = new THREE.LineBasicMaterial({
    color: PALETTE.ink,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  })

  const alhambra = createAlhambraScene({
    terrain: engraved.terrain,
    cliff: engraved.deepStone,
    stone: engraved.stone,
    paleStone: engraved.paleStone,
    deepStone: engraved.deepStone,
    plaster: engraved.plaster,
    roof,
    garden: engraved.garden,
    trunk: engraved.bronze,
    water,
    waterBright,
    metal: engraved.bronze,
    ink,
  })
  scene.add(alhambra.root)

  const waterSystem = new WaterSystem({
    ink: '#11565d',
    glow: '#8ef1e3',
    trace: '#173f43',
    lift: 0.31,
    smoothing: 8.5,
  })
  scene.add(waterSystem.root)

  const surfaceStates = alhambra.waterSurfaces.map((surface) => {
    const material = (surface.material as THREE.Material).clone()
    surface.material = material
    material.transparent = true
    const baseOpacity =
      'opacity' in material && typeof material.opacity === 'number'
        ? material.opacity
        : 1
    const id = String(surface.userData.waterSurfaceId ?? '')
    return {
      surface,
      material,
      baseOpacity,
      id,
      threshold: activationThreshold(id),
      edge: SURFACE_EDGE[id] ?? null,
      node: SURFACE_NODE[id] ?? null,
    }
  })

  let waterProgress = 0.025
  let playing = false
  let currentClimate: ClimateId = 'sun'
  let ui: ExhibitionUI

  const setPlaying = (next: boolean): void => {
    playing = next
    ui?.setPlaying(next)
  }

  const setWaterProgress = (progress: number, immediate = false): void => {
    waterProgress = THREE.MathUtils.clamp(progress, 0, 1)
    waterSystem.setProgress(waterProgress, immediate)
    ui?.updateProgress(waterProgress)
    ambience.setWater(waterProgress)
    if (waterProgress >= 0.999 && playing) setPlaying(false)
  }

  const setClimate = (climate: ClimateId): void => {
    currentClimate = climate
    ui?.setClimate(climate)
    climateSystem.setClimate(climate)
    pipeline.setClimate(climate)
    ambience.setClimate(climate)
  }

  const focusMap: Record<
    string,
    { camera: THREE.Vector3; target: THREE.Vector3 }
  > = {
    intake: {
      target: WORLD.water.intake.clone(),
      camera: WORLD.water.intake
        .clone()
        .add(new THREE.Vector3(15, 13, 22)),
    },
    acequia: {
      target: WORLD.water.contourB.clone(),
      camera: WORLD.water.contourB
        .clone()
        .add(new THREE.Vector3(-20, 16, 26)),
    },
    partidor: {
      target: WORLD.water.partidor.clone(),
      camera: WORLD.water.partidor
        .clone()
        .add(new THREE.Vector3(-16, 12, 23)),
    },
    albercones: alhambra.focusPositions.albercones,
    citadel: alhambra.focusPositions.waterTower,
    courtyard: alhambra.focusPositions.lions,
    generalife: alhambra.focusPositions.generalife,
    waterTower: alhambra.focusPositions.waterTower,
    lions: alhambra.focusPositions.lions,
    comares: alhambra.focusPositions.comares,
    overview: alhambra.focusPositions.overview,
  }

  const focusSite = (siteId: string): void => {
    const focus = focusMap[siteId] ?? focusMap.overview
    cameraRig.focus(focus.camera, focus.target)
  }

  ui = createExhibitionUI(
    {
      onWaterProgress(progress) {
        setPlaying(false)
        setWaterProgress(progress)
        void ambience.start()
      },
      onPlayToggle(nextPlaying) {
        if (nextPlaying && waterProgress >= 0.995) {
          setWaterProgress(0.015, true)
        }
        setPlaying(nextPlaying)
        void ambience.start()
      },
      onClimate(climate) {
        setClimate(climate)
        void ambience.start()
      },
      onFocusSite(siteId) {
        focusSite(siteId)
        void ambience.start()
      },
    },
    {
      mount,
      title: '水之城 · 阿尔罕布拉随想',
      subtitle: '程序化建筑群 · 水工叙事原型',
      initialProgress: waterProgress,
      initialClimate: currentClimate,
    },
  )

  const audioToggle = document.createElement('button')
  audioToggle.className = 'audio-toggle'
  audioToggle.type = 'button'
  audioToggle.setAttribute('aria-pressed', 'false')
  audioToggle.innerHTML = `
    <span class="audio-toggle__mark" aria-hidden="true"></span>
    <span class="audio-toggle__label">水声 · 关</span>
  `
  audioToggle.addEventListener('click', () => {
    const nextMuted = !ambience.isMuted
    ambience.setMuted(nextMuted)
    audioToggle.classList.toggle('is-active', !nextMuted)
    audioToggle.setAttribute('aria-pressed', String(!nextMuted))
    const label = audioToggle.querySelector<HTMLElement>('.audio-toggle__label')
    if (label) label.textContent = nextMuted ? '水声 · 关' : '水声 · 开'
    if (!nextMuted) void ambience.start()
  })
  mount.append(audioToggle)

  setWaterProgress(waterProgress, true)
  climateSystem.setClimate(currentClimate)
  pipeline.setClimate(currentClimate)
  cameraRig.startIntro()

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const interactiveTargets: THREE.Object3D[] = [
    ...Object.values(alhambra.interactiveObjects),
    waterSystem.root,
  ]
  let pointerDown = new THREE.Vector2()
  let hoverFrame = 0

  const updatePointer = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  const pickInteractive = (): THREE.Intersection | null => {
    raycaster.setFromCamera(pointer, cameraRig.camera)
    return (
      raycaster.intersectObjects(interactiveTargets, true).find((hit) => {
        const owner = findInteractionOwner(hit.object)
        return Boolean(
          owner?.userData.interactionId ??
            owner?.userData.waterNodeId ??
            owner?.userData.waterEdgeId,
        )
      }) ?? null
    )
  }

  canvas.addEventListener('pointerdown', (event) => {
    pointerDown.set(event.clientX, event.clientY)
    void ambience.start()
  })

  canvas.addEventListener('pointermove', (event) => {
    updatePointer(event)
    if (hoverFrame) return
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0
      canvas.classList.toggle('is-interactive', Boolean(pickInteractive()))
    })
  })

  canvas.addEventListener('pointerleave', () => {
    canvas.classList.remove('is-interactive')
  })

  canvas.addEventListener('pointerup', (event) => {
    if (
      pointerDown.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) >
      5
    ) {
      return
    }
    updatePointer(event)
    const hit = pickInteractive()
    if (!hit) return
    const owner = findInteractionOwner(hit.object)
    if (!owner) return
    handleWorldInteraction(owner)
  })

  function handleWorldInteraction(owner: THREE.Object3D): void {
    const interactionId = String(owner.userData.interactionId ?? '')
    const nodeId = owner.userData.waterNodeId as WaterNodeId | undefined
    const edgeId = String(owner.userData.waterEdgeId ?? '')

    if (nodeId) {
      const node = WATER_NODES.find((candidate) => candidate.id === nodeId)
      if (node) {
        setPlaying(false)
        setWaterProgress(node.progress)
        focusWaterNode(nodeId)
      }
      return
    }

    if (edgeId) {
      const edge = WATER_EDGES.find((candidate) => candidate.id === edgeId)
      if (edge) {
        const progress = (edge.start + edge.end) * 0.5
        setPlaying(false)
        setWaterProgress(progress)
        focusWaterNode(edge.to)
      }
      return
    }

    const interactions: Record<
      string,
      { progress: number; focus: string }
    > = {
      intakeGate: { progress: 0.09, focus: 'intake' },
      partidorGate: { progress: 0.38, focus: 'partidor' },
      waterWheel: { progress: 0.54, focus: 'albercones' },
      lionsFountain: { progress: 0.84, focus: 'lions' },
      comaresPool: { progress: 0.88, focus: 'comares' },
    }
    const action = interactions[interactionId]
    if (!action) return
    setPlaying(false)
    setWaterProgress(action.progress)
    focusSite(action.focus)
  }

  function focusWaterNode(nodeId: WaterNodeId): void {
    const directMap: Partial<Record<WaterNodeId, string>> = {
      intake: 'intake',
      contourA: 'acequia',
      contourB: 'acequia',
      partidor: 'partidor',
      generalife: 'generalife',
      albercones: 'albercones',
      waterTower: 'waterTower',
      city: 'waterTower',
      lions: 'lions',
      comares: 'comares',
      bath: 'comares',
      drain: 'overview',
    }
    focusSite(directMap[nodeId] ?? 'overview')
  }

  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return
    if (event.code === 'Space') {
      event.preventDefault()
      setPlaying(!playing)
    } else if (event.code === 'Digit1') {
      setClimate('dawn')
    } else if (event.code === 'Digit2') {
      setClimate('sun')
    } else if (event.code === 'Digit3') {
      setClimate('rain')
    } else if (event.code === 'Home' || event.code === 'Escape') {
      cameraRig.overview()
    }
  })

  const clock = new THREE.Clock()
  let firstFrame = true

  const resize = (): void => {
    const width = window.innerWidth
    const height = window.innerHeight
    const mobile = width < 760
    const pixelRatio = Math.min(window.devicePixelRatio, mobile ? 1.15 : 1.35)
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(width, height, false)
    cameraRig.resize(width, height)
    pipeline.resize(width, height, pixelRatio)
  }

  const animate = (): void => {
    requestAnimationFrame(animate)
    const delta = Math.min(clock.getDelta(), 0.05)
    const elapsed = clock.elapsedTime

    if (playing) {
      setWaterProgress(waterProgress + delta * 0.052)
    }

    cameraRig.update(delta)
    climateSystem.update(delta)
    waterSystem.update(delta, elapsed)
    updateWaterArchitecture(delta, waterSystem.renderedProgress)
    pipeline.render(delta, elapsed)

    if (firstFrame) {
      firstFrame = false
      requestAnimationFrame(() => loader.classList.add('is-hidden'))
    }
  }

  function updateWaterArchitecture(delta: number, progress: number): void {
    const gate = alhambra.interactiveObjects.intakeGate.getObjectByName(
      'Intake sluice leaf',
    )
    if (gate) {
      const open = THREE.MathUtils.smoothstep(progress, 0.015, 0.1)
      gate.position.y = THREE.MathUtils.lerp(0.35, 1.35, open)
    }

    const lever = alhambra.interactiveObjects.partidorGate.getObjectByName(
      'Partidor lever',
    )
    if (lever) {
      const split = THREE.MathUtils.smoothstep(progress, 0.27, 0.43)
      lever.rotation.y = THREE.MathUtils.lerp(-0.32, 0.5, split)
    }

    alhambra.waterWheel.rotation.z -=
      delta * waterSystem.waterwheelDrive * 0.82

    surfaceStates.forEach((state) => {
      if (!('opacity' in state.material)) return
      const material = state.material as THREE.Material & { opacity: number }
      const told =
        state.threshold <= 0
          ? 1
          : THREE.MathUtils.smoothstep(
              progress,
              state.threshold,
              state.threshold + 0.07,
            )
      let activation = told
      if (state.edge) {
        activation *= THREE.MathUtils.smoothstep(
          waterSystem.fillOf(state.edge),
          0.002,
          0.12,
        )
      } else if (state.node) {
        activation *= THREE.MathUtils.smoothstep(
          waterSystem.levelAt(state.node),
          0.01,
          0.18,
        )
      }
      const rainBoost = currentClimate === 'rain' ? 0.12 : 0
      const target = THREE.MathUtils.clamp(
        state.baseOpacity * (0.12 + activation * 0.88) + rainBoost,
        0.025,
        state.baseOpacity,
      )
      material.opacity = THREE.MathUtils.lerp(
        material.opacity,
        target,
        1 - Math.exp(-delta * 4.5),
      )
    })
  }

  resize()
  window.addEventListener('resize', resize, { passive: true })
  animate()
} catch (error) {
  console.error(error)
  mount.innerHTML = `
    <section class="site-error">
      <h1>这幅水工版画暂时无法展开</h1>
      <p>浏览器没有成功建立 WebGL 场景。请尝试更新浏览器或启用硬件加速，然后重新载入。</p>
    </section>
  `
}

function findInteractionOwner(object: THREE.Object3D): THREE.Object3D | null {
  let current: THREE.Object3D | null = object
  while (current) {
    if (
      current.userData.interactionId ||
      current.userData.waterNodeId ||
      current.userData.waterEdgeId
    ) {
      return current
    }
    current = current.parent
  }
  return null
}

function activationThreshold(id: string): number {
  if (id === 'darro') return 0
  if (id.includes('acequia')) return 0.06
  if (id.includes('generalife')) return 0.34
  if (id.includes('albercones')) return 0.46
  if (id.includes('tower')) return 0.58
  if (id.includes('palace')) return 0.66
  if (id.includes('lions')) return 0.75
  if (id.includes('comares')) return 0.79
  if (id.includes('bath')) return 0.81
  return 0.38
}
