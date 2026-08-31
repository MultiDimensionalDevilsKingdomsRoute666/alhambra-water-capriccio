import type { ClimateId, FocusSite } from '../types'
import './exhibition.css'

export type ExhibitionStage = Pick<
  FocusSite,
  'id' | 'eyebrow' | 'title' | 'description' | 'principle' | 'progress'
>

export interface ExhibitionUICallbacks {
  onWaterProgress: (progress: number) => void
  onPlayToggle: (playing: boolean) => void
  onClimate: (climate: ClimateId) => void
  onFocusSite: (siteId: string) => void
}

export interface ExhibitionUIOptions {
  mount?: HTMLElement
  title?: string
  subtitle?: string
  sites?: readonly ExhibitionStage[]
  initialProgress?: number
  initialClimate?: ClimateId
  initialPlaying?: boolean
}

export interface ExhibitionUI {
  root: HTMLElement
  updateStage: (stage: number | string | ExhibitionStage) => void
  updateProgress: (progress: number) => void
  setPlaying: (playing: boolean) => void
  setClimate: (climate: ClimateId) => void
  destroy: () => void
}

const DEFAULT_SITES: readonly ExhibitionStage[] = [
  {
    id: 'intake',
    eyebrow: '01 · 上游',
    title: '山谷取水',
    description: '从高位河段截流，让水在抵达宫城以前先获得足够的落差。',
    principle: '水头来自地势，而不是机械动力。',
    progress: 0.04,
  },
  {
    id: 'acequia',
    eyebrow: '02 · 王渠',
    title: '沿坡缓行',
    description: '主渠贴着等高线前进，把陡峭山势调成可被管理的稳定流速。',
    principle: '微小而连续的坡降，比直线更可靠。',
    progress: 0.23,
  },
  {
    id: 'partidor',
    eyebrow: '03 · 分水',
    title: '水路分岔',
    description: '水在节点被量取、分流，依次去往农圃、住区与宫苑。',
    principle: '水系也是一套空间秩序。',
    progress: 0.4,
  },
  {
    id: 'albercones',
    eyebrow: '04 · 蓄水',
    title: '高位水池',
    description: '蓄水池吸收昼夜流量的变化，同时保留进入高处花园所需的压力。',
    principle: '储量把不稳定的来水变成稳定供给。',
    progress: 0.58,
  },
  {
    id: 'citadel',
    eyebrow: '05 · 宫城',
    title: '入城再分配',
    description: '越过坡脊后，细渠把水送向浴场、作坊、庭院与居所。',
    principle: '主干收束，末端网络展开。',
    progress: 0.76,
  },
  {
    id: 'courtyard',
    eyebrow: '06 · 庭院',
    title: '水的回响',
    description: '水盘与浅渠把工程转译成声音、反光和可感知的微气候。',
    principle: '基础设施最终成为建筑体验。',
    progress: 0.94,
  },
]

const CLIMATES: readonly {
  id: ClimateId
  label: string
  note: string
}[] = [
  { id: 'dawn', label: '晨雾', note: '低温 · 微风' },
  { id: 'sun', label: '日照', note: '干热 · 常流' },
  { id: 'rain', label: '雨后', note: '丰水 · 湿润' },
]

const clampProgress = (value: number): number =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))

const requiredElement = <T extends Element>(
  parent: ParentNode,
  selector: string,
): T => {
  const element = parent.querySelector<T>(selector)
  if (!element) {
    throw new Error(`Exhibition UI is missing "${selector}".`)
  }
  return element
}

const stageIndexAt = (
  sites: readonly ExhibitionStage[],
  progress: number,
): number => {
  let closestIndex = 0
  let closestDistance = Number.POSITIVE_INFINITY

  sites.forEach((site, index) => {
    const distance = Math.abs(clampProgress(site.progress) - progress)
    if (distance < closestDistance) {
      closestIndex = index
      closestDistance = distance
    }
  })

  return closestIndex
}

export function createExhibitionUI(
  callbacks: ExhibitionUICallbacks,
  options: ExhibitionUIOptions = {},
): ExhibitionUI {
  const sites = options.sites?.length ? [...options.sites] : [...DEFAULT_SITES]
  const root = document.createElement('section')
  root.className = 'exhibition-ui'
  root.setAttribute('aria-label', '遗址水系互动导览')
  root.innerHTML = `
    <div class="exhibition-ui__wash" aria-hidden="true"></div>

    <header class="exhibition-heading">
      <span class="exhibition-heading__folio" aria-hidden="true">ALH<br>01</span>
      <div class="exhibition-heading__copy">
        <p class="exhibition-heading__subtitle"></p>
        <h1 class="exhibition-heading__title"></h1>
        <p class="exhibition-heading__orientation">
          <span aria-hidden="true">↗</span>
          沿水而行，从山谷进入宫城
        </p>
      </div>
    </header>

    <div class="exhibition-climate" role="group" aria-label="切换气候">
      <span class="exhibition-climate__caption">气候层</span>
      <div class="exhibition-climate__choices"></div>
      <p class="exhibition-climate__note" aria-live="polite"></p>
    </div>

    <p class="exhibition-help">
      <span class="exhibition-help__mouse" aria-hidden="true"></span>
      拖拽旋转 · 滚轮缩放 · 点选水脉
    </p>

    <aside class="exhibition-stage" aria-live="polite">
      <span class="exhibition-stage__rule" aria-hidden="true"></span>
      <p class="exhibition-stage__eyebrow"></p>
      <h2 class="exhibition-stage__title"></h2>
      <p class="exhibition-stage__description"></p>
      <p class="exhibition-stage__principle"></p>
      <button class="exhibition-stage__focus" type="button">
        <span>移向此处</span>
        <span aria-hidden="true">⌖</span>
      </button>
    </aside>

    <section class="water-rail" aria-label="水脉轨道">
      <div class="water-rail__heading">
        <span class="water-rail__number" aria-hidden="true">Ⅰ</span>
        <div>
          <p>水脉轨道</p>
          <span>ACEQUIA REAL · 重力引水</span>
        </div>
      </div>

      <button class="water-rail__play" type="button" aria-pressed="false">
        <span class="water-rail__play-icon" aria-hidden="true"></span>
        <span class="water-rail__play-label">播放水程</span>
      </button>

      <div class="water-rail__track">
        <div class="water-rail__axis" aria-hidden="true">
          <span>上游</span>
          <span class="water-rail__axis-line"></span>
          <span>宫城</span>
        </div>
        <label class="water-rail__slider-label" for="exhibition-water-progress">
          水程进度
        </label>
        <input
          class="water-rail__slider"
          id="exhibition-water-progress"
          type="range"
          min="0"
          max="1000"
          step="1"
          value="0"
        >
        <div class="water-rail__ticks"></div>
      </div>

      <output class="water-rail__readout" for="exhibition-water-progress">
        <span class="water-rail__readout-label">水程</span>
        <span class="water-rail__readout-value">000</span>
      </output>
    </section>
  `

  requiredElement<HTMLElement>(
    root,
    '.exhibition-heading__subtitle',
  ).textContent = options.subtitle ?? '遗址水工复原 · 交互研究'
  requiredElement<HTMLElement>(root, '.exhibition-heading__title').textContent =
    options.title ?? '阿尔罕布拉：水的剖面'

  const climateChoices = requiredElement<HTMLElement>(
    root,
    '.exhibition-climate__choices',
  )
  CLIMATES.forEach((climate) => {
    const button = document.createElement('button')
    button.className = 'exhibition-climate__button'
    button.type = 'button'
    button.dataset.climate = climate.id
    button.textContent = climate.label
    button.setAttribute('aria-pressed', 'false')
    climateChoices.append(button)
  })

  const ticks = requiredElement<HTMLElement>(root, '.water-rail__ticks')
  sites.forEach((site, index) => {
    const tick = document.createElement('button')
    tick.className = 'water-rail__tick'
    tick.type = 'button'
    tick.dataset.site = site.id
    tick.style.setProperty('--tick-progress', `${clampProgress(site.progress)}`)
    tick.setAttribute('aria-label', `${index + 1}. ${site.title}`)
    tick.innerHTML = `
      <span class="water-rail__tick-mark" aria-hidden="true"></span>
      <span class="water-rail__tick-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
      <span class="water-rail__tick-name"></span>
    `
    requiredElement<HTMLElement>(
      tick,
      '.water-rail__tick-name',
    ).textContent = site.title
    ticks.append(tick)
  })

  const slider = requiredElement<HTMLInputElement>(
    root,
    '.water-rail__slider',
  )
  const readout = requiredElement<HTMLOutputElement>(
    root,
    '.water-rail__readout-value',
  )
  const playButton = requiredElement<HTMLButtonElement>(
    root,
    '.water-rail__play',
  )
  const playLabel = requiredElement<HTMLElement>(
    playButton,
    '.water-rail__play-label',
  )
  const stageEyebrow = requiredElement<HTMLElement>(
    root,
    '.exhibition-stage__eyebrow',
  )
  const stageTitle = requiredElement<HTMLElement>(
    root,
    '.exhibition-stage__title',
  )
  const stageDescription = requiredElement<HTMLElement>(
    root,
    '.exhibition-stage__description',
  )
  const stagePrinciple = requiredElement<HTMLElement>(
    root,
    '.exhibition-stage__principle',
  )
  const focusButton = requiredElement<HTMLButtonElement>(
    root,
    '.exhibition-stage__focus',
  )
  const climateNote = requiredElement<HTMLElement>(
    root,
    '.exhibition-climate__note',
  )
  const climateButtons = [
    ...root.querySelectorAll<HTMLButtonElement>(
      '.exhibition-climate__button',
    ),
  ]
  const tickButtons = [
    ...root.querySelectorAll<HTMLButtonElement>('.water-rail__tick'),
  ]

  let currentProgress = clampProgress(options.initialProgress ?? 0)
  let currentStageIndex = stageIndexAt(sites, currentProgress)
  let playing = options.initialPlaying ?? false
  let climate: ClimateId = options.initialClimate ?? 'dawn'

  const renderStage = (stage: ExhibitionStage, index: number): void => {
    currentStageIndex = index
    stageEyebrow.textContent = stage.eyebrow
    stageTitle.textContent = stage.title
    stageDescription.textContent = stage.description
    stagePrinciple.textContent = stage.principle
    focusButton.dataset.site = stage.id
    focusButton.setAttribute('aria-label', `移向${stage.title}`)

    tickButtons.forEach((button, tickIndex) => {
      const isCurrent = tickIndex === index
      button.classList.toggle('is-current', isCurrent)
      if (isCurrent) {
        button.setAttribute('aria-current', 'step')
      } else {
        button.removeAttribute('aria-current')
      }
    })
  }

  const updateStage = (
    stage: number | string | ExhibitionStage,
  ): void => {
    if (typeof stage === 'number') {
      const index = Math.min(
        sites.length - 1,
        Math.max(0, Math.round(stage)),
      )
      renderStage(sites[index], index)
      return
    }

    if (typeof stage === 'string') {
      const index = sites.findIndex((site) => site.id === stage)
      if (index >= 0) {
        renderStage(sites[index], index)
      }
      return
    }

    const matchingIndex = sites.findIndex((site) => site.id === stage.id)
    renderStage(
      stage,
      matchingIndex >= 0
        ? matchingIndex
        : stageIndexAt(sites, clampProgress(stage.progress)),
    )
  }

  const updateProgress = (progress: number): void => {
    currentProgress = clampProgress(progress)
    const scaledProgress = Math.round(currentProgress * 1000)
    slider.value = String(scaledProgress)
    slider.setAttribute('aria-valuetext', `水程 ${Math.round(currentProgress * 100)}%`)
    readout.textContent = String(Math.round(currentProgress * 100)).padStart(
      3,
      '0',
    )
    root.style.setProperty('--water-progress', `${currentProgress}`)

    tickButtons.forEach((button, index) => {
      button.classList.toggle(
        'is-reached',
        clampProgress(sites[index].progress) <= currentProgress + 0.001,
      )
    })

    const nextStageIndex = stageIndexAt(sites, currentProgress)
    if (nextStageIndex !== currentStageIndex) {
      renderStage(sites[nextStageIndex], nextStageIndex)
    }
  }

  const setPlaying = (nextPlaying: boolean): void => {
    playing = nextPlaying
    root.classList.toggle('is-playing', playing)
    playButton.setAttribute('aria-pressed', String(playing))
    playButton.setAttribute(
      'aria-label',
      playing ? '暂停水程播放' : '播放水程',
    )
    playLabel.textContent = playing ? '暂停水程' : '播放水程'
  }

  const setClimate = (nextClimate: ClimateId): void => {
    climate = nextClimate
    root.dataset.climate = climate

    climateButtons.forEach((button) => {
      const isCurrent = button.dataset.climate === climate
      button.classList.toggle('is-current', isCurrent)
      button.setAttribute('aria-pressed', String(isCurrent))
    })

    climateNote.textContent =
      CLIMATES.find((entry) => entry.id === climate)?.note ?? ''
  }

  const handleSliderInput = (): void => {
    const nextProgress = Number(slider.value) / 1000
    updateProgress(nextProgress)
    callbacks.onWaterProgress(nextProgress)
  }

  const handlePlayClick = (): void => {
    setPlaying(!playing)
    callbacks.onPlayToggle(playing)
  }

  const handleFocusClick = (): void => {
    callbacks.onFocusSite(sites[currentStageIndex].id)
  }

  const handleClimateClick = (event: Event): void => {
    const button = event.currentTarget as HTMLButtonElement
    const nextClimate = button.dataset.climate as ClimateId
    setClimate(nextClimate)
    callbacks.onClimate(nextClimate)
  }

  const handleTickClick = (event: Event): void => {
    const button = event.currentTarget as HTMLButtonElement
    const siteIndex = tickButtons.indexOf(button)
    const site = sites[siteIndex]
    updateProgress(clampProgress(site.progress))
    renderStage(site, siteIndex)
    callbacks.onWaterProgress(clampProgress(site.progress))
    callbacks.onFocusSite(site.id)
  }

  slider.addEventListener('input', handleSliderInput)
  playButton.addEventListener('click', handlePlayClick)
  focusButton.addEventListener('click', handleFocusClick)
  climateButtons.forEach((button) =>
    button.addEventListener('click', handleClimateClick),
  )
  tickButtons.forEach((button) =>
    button.addEventListener('click', handleTickClick),
  )

  const mount = options.mount ?? document.body
  mount.append(root)
  updateProgress(currentProgress)
  renderStage(sites[currentStageIndex], currentStageIndex)
  setPlaying(playing)
  setClimate(climate)

  const destroy = (): void => {
    slider.removeEventListener('input', handleSliderInput)
    playButton.removeEventListener('click', handlePlayClick)
    focusButton.removeEventListener('click', handleFocusClick)
    climateButtons.forEach((button) =>
      button.removeEventListener('click', handleClimateClick),
    )
    tickButtons.forEach((button) =>
      button.removeEventListener('click', handleTickClick),
    )
    root.remove()
  }

  return {
    root,
    updateStage,
    updateProgress,
    setPlaying,
    setClimate,
    destroy,
  }
}

