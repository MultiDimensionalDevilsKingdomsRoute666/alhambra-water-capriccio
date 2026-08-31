import type { ClimateId } from '../types'

export class Ambience {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private waterGain: GainNode | null = null
  private rainGain: GainNode | null = null
  private windGain: GainNode | null = null
  private water = 0
  private climate: ClimateId = 'dawn'
  private muted = false

  async start(): Promise<void> {
    if (this.context) {
      if (this.context.state === 'suspended') await this.context.resume()
      return
    }

    const AudioContextCtor =
      window.AudioContext ??
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext
        }
      ).webkitAudioContext
    if (!AudioContextCtor) return

    const context = new AudioContextCtor()
    const buffer = context.createBuffer(
      1,
      context.sampleRate * 3,
      context.sampleRate,
    )
    const channel = buffer.getChannelData(0)
    let previous = 0
    for (let i = 0; i < channel.length; i += 1) {
      const white = Math.random() * 2 - 1
      previous = previous * 0.985 + white * 0.15
      channel[i] = white * 0.62 + previous * 0.38
    }

    this.master = context.createGain()
    this.master.gain.value = this.muted ? 0 : 0.115
    this.master.connect(context.destination)

    this.waterGain = this.createNoiseBand(
      context,
      buffer,
      'bandpass',
      1320,
      0.42,
    )
    this.rainGain = this.createNoiseBand(
      context,
      buffer,
      'highpass',
      2350,
      0.28,
    )
    this.windGain = this.createNoiseBand(
      context,
      buffer,
      'lowpass',
      380,
      0.38,
    )
    this.waterGain.connect(this.master)
    this.rainGain.connect(this.master)
    this.windGain.connect(this.master)
    this.context = context
    this.sync()
    await context.resume()
  }

  setWater(progress: number): void {
    this.water = Math.min(1, Math.max(0, progress))
    this.sync()
  }

  setClimate(climate: ClimateId): void {
    this.climate = climate
    this.sync()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (!this.context || !this.master) return
    this.master.gain.setTargetAtTime(
      muted ? 0 : 0.115,
      this.context.currentTime,
      0.06,
    )
  }

  get isMuted(): boolean {
    return this.muted
  }

  private createNoiseBand(
    context: AudioContext,
    buffer: AudioBuffer,
    type: BiquadFilterType,
    frequency: number,
    q: number,
  ): GainNode {
    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.playbackRate.value = 0.82 + Math.random() * 0.31
    const filter = context.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = q
    const gain = context.createGain()
    gain.gain.value = 0
    source.connect(filter)
    filter.connect(gain)
    source.start()
    return gain
  }

  private sync(): void {
    if (
      !this.context ||
      !this.waterGain ||
      !this.rainGain ||
      !this.windGain
    ) {
      return
    }
    const now = this.context.currentTime
    const waterTarget = 0.055 + Math.pow(this.water, 0.72) * 0.34
    const rainTarget = this.climate === 'rain' ? 0.27 : 0
    const windTarget =
      this.climate === 'rain' ? 0.12 : this.climate === 'dawn' ? 0.085 : 0.045
    this.waterGain.gain.setTargetAtTime(waterTarget, now, 0.28)
    this.rainGain.gain.setTargetAtTime(rainTarget, now, 0.32)
    this.windGain.gain.setTargetAtTime(windTarget, now, 0.48)
  }
}
