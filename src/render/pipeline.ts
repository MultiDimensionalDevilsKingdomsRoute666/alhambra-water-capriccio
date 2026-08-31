import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import type { ClimateId } from '../types'
import { PALETTE } from './engraving'

const PaperShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    edgeStrength: { value: 0.62 },
    paperWarmth: { value: 0.34 },
    rainMood: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time;
    uniform float edgeStrength;
    uniform float paperWarmth;
    uniform float rainMood;
    varying vec2 vUv;

    float paperLuma(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    float noise(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
      vec2 px = 1.0 / resolution;
      vec3 source = texture2D(tDiffuse, vUv).rgb;
      float tl = paperLuma(texture2D(tDiffuse, vUv + px * vec2(-1.0,  1.0)).rgb);
      float tc = paperLuma(texture2D(tDiffuse, vUv + px * vec2( 0.0,  1.0)).rgb);
      float tr = paperLuma(texture2D(tDiffuse, vUv + px * vec2( 1.0,  1.0)).rgb);
      float ml = paperLuma(texture2D(tDiffuse, vUv + px * vec2(-1.0,  0.0)).rgb);
      float mr = paperLuma(texture2D(tDiffuse, vUv + px * vec2( 1.0,  0.0)).rgb);
      float bl = paperLuma(texture2D(tDiffuse, vUv + px * vec2(-1.0, -1.0)).rgb);
      float bc = paperLuma(texture2D(tDiffuse, vUv + px * vec2( 0.0, -1.0)).rgb);
      float br = paperLuma(texture2D(tDiffuse, vUv + px * vec2( 1.0, -1.0)).rgb);

      float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
      float gy = -bl - 2.0 * bc - br + tl + 2.0 * tc + tr;
      float edge = smoothstep(0.08, 0.34, length(vec2(gx, gy)));

      vec3 paper = vec3(0.882, 0.817, 0.670);
      vec3 ink = vec3(0.105, 0.081, 0.064);
      vec3 rainTint = vec3(0.72, 0.78, 0.75);
      vec3 color = mix(source, source * paper, paperWarmth * 0.21);
      color = mix(color, color * rainTint, rainMood * 0.26);
      color = mix(color, ink, edge * edgeStrength);

      float grain = noise(gl_FragCoord.xy + vec2(time * 0.31, -time * 0.17)) - 0.5;
      float fibers = sin((gl_FragCoord.y + noise(vec2(gl_FragCoord.x, 2.0)) * 5.0) * 0.37) * 0.5;
      color += grain * 0.026 + fibers * 0.006;

      float vignette = smoothstep(0.88, 0.28, distance(vUv, vec2(0.5)));
      color *= mix(0.88, 1.035, vignette);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
}

export interface RenderPipeline {
  composer: EffectComposer
  resize: (width: number, height: number, pixelRatio: number) => void
  render: (delta: number, elapsed: number) => void
  setClimate: (climate: ClimateId) => void
}

export function createRenderPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): RenderPipeline {
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const paperPass = new ShaderPass(PaperShader)
  composer.addPass(paperPass)

  return {
    composer,
    resize(width, height, pixelRatio) {
      composer.setPixelRatio(pixelRatio)
      composer.setSize(width, height)
      paperPass.uniforms.resolution.value.set(
        Math.round(width * pixelRatio),
        Math.round(height * pixelRatio),
      )
    },
    render(delta, elapsed) {
      paperPass.uniforms.time.value = elapsed
      composer.render(delta)
    },
    setClimate(climate) {
      paperPass.uniforms.rainMood.value = climate === 'rain' ? 1 : 0
      paperPass.uniforms.paperWarmth.value = climate === 'dawn' ? 0.52 : 0.32
      paperPass.uniforms.edgeStrength.value =
        climate === 'rain' ? 0.72 : climate === 'dawn' ? 0.68 : 0.58
    },
  }
}

export const PAPER_COLOR = new THREE.Color(PALETTE.paper)
