import * as THREE from 'three'

export interface FlowMaterialOptions {
  ink: THREE.ColorRepresentation
  glow: THREE.ColorRepresentation
  opacity: number
}

export function createFlowMaterial(
  options: FlowMaterialOptions,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'WaterInkFlow',
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uFlow: { value: 1 },
      uOpacity: { value: options.opacity },
      uInk: { value: new THREE.Color(options.ink) },
      uGlow: { value: new THREE.Color(options.glow) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uReveal;
      uniform float uFlow;
      uniform float uOpacity;
      uniform vec3 uInk;
      uniform vec3 uGlow;

      varying vec2 vUv;
      varying vec3 vWorldPosition;

      float hash12(vec2 value) {
        vec3 p3 = fract(vec3(value.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      void main() {
        float reveal = 1.0 - smoothstep(
          uReveal - 0.014,
          uReveal + 0.012,
          vUv.x
        );

        if (reveal < 0.002) {
          discard;
        }

        float engraving =
          0.72 +
          0.15 * sin(vUv.x * 210.0 + vWorldPosition.x * 0.8) +
          0.08 * sin(vUv.y * 47.0 + vWorldPosition.z * 1.3) +
          0.07 * hash12(floor(vUv * vec2(420.0, 17.0)));

        float phase = fract(
          vUv.x * 2.7 - uTime * (0.19 + 0.16 * uFlow)
        );
        float runner = pow(max(0.0, 1.0 - abs(phase - 0.5) * 2.0), 8.0);
        float front = exp(-pow((vUv.x - uReveal) * 43.0, 2.0));
        float highlight = clamp(runner * 0.72 + front * 0.9, 0.0, 1.0);

        vec3 color = mix(uInk, uGlow, highlight);
        float alpha = reveal * uOpacity *
          clamp(engraving + runner * 0.26 + front * 0.18, 0.28, 1.0);

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
}
