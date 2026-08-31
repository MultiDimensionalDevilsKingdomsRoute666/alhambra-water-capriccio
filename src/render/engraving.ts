import * as THREE from 'three'

export const PALETTE = {
  paper: 0xd9c69d,
  paperLight: 0xeadbb8,
  stone: 0xaa7f58,
  paleStone: 0xc8a77a,
  plaster: 0xd5bd91,
  deepStone: 0x76533d,
  earth: 0x806047,
  ink: 0x241d18,
  accent: 0x56c5bf,
  accentDeep: 0x176f72,
  garden: 0x425f45,
  darkGarden: 0x243c35,
  bronze: 0x6b5135,
} as const

export interface EngravingMaterialOptions {
  color: THREE.ColorRepresentation
  roughness?: number
  metalness?: number
  hatchScale?: number
  hatchStrength?: number
  surface?: EngravingSurface
  courseHeight?: number
  jointStrength?: number
  transparent?: boolean
  opacity?: number
  side?: THREE.Side
  emissive?: THREE.ColorRepresentation
  emissiveIntensity?: number
}

export type EngravingSurface =
  | 'plain'
  | 'terrain'
  | 'masonry'
  | 'plaster'
  | 'roof'

const SURFACE_KIND: Record<EngravingSurface, number> = {
  plain: 0,
  terrain: 1,
  masonry: 2,
  plaster: 3,
  roof: 4,
}

const sharedUniforms = {
  uEngravingInk: { value: new THREE.Color(PALETTE.ink) },
  uEngravingSun: {
    value: new THREE.Vector3(-0.42, 0.82, 0.38).normalize(),
  },
  uEngravingWetness: { value: 0 },
  // Mirrors the analytic light model so the shader can distinguish real
  // direct sunlight from directional light removed by the shadow map.
  uSunLumRaw: { value: 1 },
  // 0=normal, 1=direct light, 2=sun visibility, 3=ink, 4=hatching.
  uEngravingDebug: { value: 0 },
}

/** Switch the material-wide engraving debug view. */
export function setEngravingDebug(mode: number): void {
  sharedUniforms.uEngravingDebug.value = mode
}

const luminance = (color: THREE.Color): number =>
  0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b

/** Keep the engraving shader's analytic sunlight model in sync with Three. */
export function syncEngravingLightModel(
  sun: THREE.DirectionalLight,
  hemisphere: THREE.HemisphereLight,
): void {
  sharedUniforms.uEngravingSun.value
    .copy(sun.position)
    .sub(sun.target.position)
    .normalize()
  sharedUniforms.uSunLumRaw.value = sun.intensity * luminance(sun.color)
  // Hemisphere light remains part of indirect lighting; directDiffuse below
  // deliberately contains only the directional contribution we can invert.
  void hemisphere
}

interface ShaderHandle {
  uniforms: Record<string, { value: unknown }>
}

const activeShaders = new Set<ShaderHandle>()

export function setEngravingWetness(wetness: number): void {
  sharedUniforms.uEngravingWetness.value = THREE.MathUtils.clamp(wetness, 0, 1)
}

export function setEngravingSun(direction: THREE.Vector3): void {
  sharedUniforms.uEngravingSun.value.copy(direction).normalize()
}

export function createEngravedMaterial(
  options: EngravingMaterialOptions,
): THREE.MeshStandardMaterial {
  const hatchScale = options.hatchScale ?? 2.35
  const hatchStrength = options.hatchStrength ?? 0.34
  const surface = options.surface ?? 'plain'
  const surfaceKind = SURFACE_KIND[surface]
  const courseHeight = options.courseHeight ?? 0.82
  const jointStrength = options.jointStrength ?? 0.34
  const material = new THREE.MeshStandardMaterial({
    color: options.color,
    roughness: options.roughness ?? 0.92,
    metalness: options.metalness ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uEngravingInk = sharedUniforms.uEngravingInk
    shader.uniforms.uEngravingSun = sharedUniforms.uEngravingSun
    shader.uniforms.uEngravingWetness = sharedUniforms.uEngravingWetness
    shader.uniforms.uSunLumRaw = sharedUniforms.uSunLumRaw
    shader.uniforms.uEngravingDebug = sharedUniforms.uEngravingDebug
    shader.uniforms.uHatchScale = { value: hatchScale }
    shader.uniforms.uHatchStrength = { value: hatchStrength }
    shader.uniforms.uEngravingSurface = { value: surfaceKind }
    shader.uniforms.uCourseHeight = { value: courseHeight }
    shader.uniforms.uJointStrength = { value: jointStrength }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vEngravingWorld;
varying vec3 vEngravingNormal;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
vEngravingNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vEngravingWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uEngravingInk;
uniform vec3 uEngravingSun;
uniform float uEngravingWetness;
uniform float uSunLumRaw;
uniform float uEngravingDebug;
uniform float uHatchScale;
uniform float uHatchStrength;
uniform float uEngravingSurface;
uniform float uCourseHeight;
uniform float uJointStrength;
varying vec3 vEngravingWorld;
varying vec3 vEngravingNormal;

float engravingLine(float value) {
  float wrapped = abs(fract(value) - 0.5);
  float aa = max(fwidth(value) * 1.1, 0.006);
  return 1.0 - smoothstep(0.036 - aa, 0.036 + aa, wrapped);
}

float engravingHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float engravingNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  vec2 ease = local * local * (3.0 - 2.0 * local);
  float a = engravingHash(cell);
  float b = engravingHash(cell + vec2(1.0, 0.0));
  float c = engravingHash(cell + vec2(0.0, 1.0));
  float d = engravingHash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, ease.x), mix(c, d, ease.x), ease.y);
}

float engravingGrid(float value, float spacing, float width) {
  float scaled = value / max(spacing, 0.001);
  float edgeDistance = abs(fract(scaled) - 0.5);
  float aa = max(fwidth(scaled) * 1.25, 0.002);
  return smoothstep(0.5 - width - aa, 0.5 - width + aa, edgeDistance);
}

// A band-limited hatch stroke. Once the pattern is denser than a pixel,
// collapse it to a stable tone instead of producing moire.
float engravingLineAt(float value, float frequency, float duty) {
  float sampleValue = value * frequency;
  float footprint = fwidth(sampleValue);
  if (footprint > 0.62) return duty * 0.85;
  float distanceToStroke = abs(fract(sampleValue) - 0.5);
  float halfWidth = duty * 0.5;
  return 1.0 - smoothstep(
    halfWidth - footprint,
    halfWidth + footprint,
    distanceToStroke
  );
}

// Distance-adaptive, world-anchored hatch levels cross-fade like mip levels.
float engravingAdaptive(
  float value,
  float frequency,
  float duty,
  float levelA,
  float levelB,
  float levelBlend
) {
  float a = engravingLineAt(value, frequency * levelA, duty);
  float b = engravingLineAt(value, frequency * levelB, duty);
  return mix(a, b, levelBlend);
}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
// For diffuse directional lighting:
// directDiffuse = ndl * light * visibility * albedo / PI.
// Dividing the known factors back out recovers the shadow-map visibility.
vec3 engravingN = normalize(vEngravingNormal);
float engravingNdl = dot(engravingN, normalize(uEngravingSun));
float engravingAlbedo = dot(
  material.diffuseColor,
  vec3(0.2126, 0.7152, 0.0722)
);
float engravingDirect = dot(
  reflectedLight.directDiffuse,
  vec3(0.2126, 0.7152, 0.0722)
);
float engravingSunVisibility = engravingNdl > 0.03
  ? clamp(
      engravingDirect * PI
        / max(uSunLumRaw * engravingNdl * engravingAlbedo, 1e-4),
      0.0,
      1.0
    )
  : 0.0;
float engravingLit = engravingSunVisibility
  * pow(clamp(engravingNdl, 0.0, 1.0), 0.68);
float engravingShade = 1.0 - engravingLit;

float engravingDistance = distance(cameraPosition, vEngravingWorld);
float engravingLevel = clamp(
  log2(88.0 / max(engravingDistance, 0.4)),
  -1.6,
  5.2
);
float engravingLevelA = exp2(floor(engravingLevel));
float engravingLevelB = engravingLevelA * 2.0;
float engravingLevelBlend = fract(engravingLevel);

float engravingA = engravingAdaptive(
  vEngravingWorld.x + vEngravingWorld.z * 0.82
    + vEngravingWorld.y * 0.18,
  uHatchScale,
  0.28,
  engravingLevelA,
  engravingLevelB,
  engravingLevelBlend
);
float engravingB = engravingAdaptive(
  vEngravingWorld.x - vEngravingWorld.z * 0.76
    + vEngravingWorld.y * 0.24,
  uHatchScale * 0.91,
  0.32,
  engravingLevelA,
  engravingLevelB,
  engravingLevelBlend
);
float engravingC = engravingAdaptive(
  vEngravingWorld.y,
  uHatchScale * 1.32,
  0.44,
  engravingLevelA,
  engravingLevelB,
  engravingLevelBlend
);
float engravingInkAmount =
  engravingA * smoothstep(0.18, 0.76, engravingShade) +
  engravingB * smoothstep(0.46, 0.92, engravingShade) * 0.72 +
  engravingC * smoothstep(0.72, 1.0, engravingShade) * 0.42;
engravingInkAmount = clamp(engravingInkAmount * uHatchStrength, 0.0, 0.72);

vec3 engravingNormal = normalize(vEngravingNormal);
vec3 engravingAbsNormal = abs(engravingNormal);
float verticalMask = 1.0 - smoothstep(0.48, 0.84, engravingAbsNormal.y);
float surfaceInk = 0.0;

if (uEngravingSurface > 0.5 && uEngravingSurface < 1.5) {
  float slope = 1.0 - engravingAbsNormal.y;
  float contour = engravingGrid(vEngravingWorld.y, 1.85, 0.055);
  float fleck = smoothstep(
    0.72,
    0.92,
    engravingNoise(vEngravingWorld.xz * 0.31)
  );
  surfaceInk =
    contour * smoothstep(0.08, 0.42, slope) * 0.72 +
    fleck * (0.08 + slope * 0.18);
} else if (uEngravingSurface > 1.5 && uEngravingSurface < 2.5) {
  float along =
    engravingAbsNormal.x > engravingAbsNormal.z
      ? vEngravingWorld.z
      : vEngravingWorld.x;
  float row = floor(vEngravingWorld.y / max(uCourseHeight, 0.1));
  float stagger = mod(row, 2.0) * uCourseHeight * 1.35;
  float courses = engravingGrid(
    vEngravingWorld.y,
    uCourseHeight,
    0.045
  );
  float uprights = engravingGrid(
    along + stagger,
    uCourseHeight * 2.7,
    0.038
  );
  surfaceInk = max(courses, uprights * 0.78) * verticalMask;
} else if (uEngravingSurface > 2.5 && uEngravingSurface < 3.5) {
  float plasterCloud = engravingNoise(
    vEngravingWorld.xz * 0.12 + vEngravingWorld.y * 0.08
  );
  float plasterPitting = smoothstep(0.76, 0.93, plasterCloud);
  surfaceInk = plasterPitting * verticalMask * 0.42;
} else if (uEngravingSurface > 3.5) {
  float roofDirection =
    engravingAbsNormal.x > engravingAbsNormal.z
      ? vEngravingWorld.z
      : vEngravingWorld.x;
  float tileRows = engravingGrid(vEngravingWorld.y, 0.52, 0.055);
  float tileRuns = engravingGrid(roofDirection, 0.82, 0.035);
  surfaceInk = max(tileRows, tileRuns * 0.58) * 0.74;
}

float jointLightMask = mix(0.62, 1.0, engravingShade);
engravingInkAmount = max(
  engravingInkAmount,
  surfaceInk * uJointStrength * jointLightMask
);
// Ink belongs on the lit result, otherwise it gets illuminated a second time.
outgoingLight = mix(outgoingLight, uEngravingInk, engravingInkAmount);
outgoingLight *= mix(1.0, 0.82, uEngravingWetness * 0.36);

if (uEngravingDebug > 0.5) {
  if (uEngravingDebug < 1.5) outgoingLight = vec3(engravingLit);
  else if (uEngravingDebug < 2.5) {
    outgoingLight = vec3(engravingSunVisibility);
  } else if (uEngravingDebug < 3.5) {
    outgoingLight = vec3(engravingInkAmount);
  } else {
    outgoingLight = vec3(max(engravingA, max(engravingB, engravingC)));
  }
}
}
#include <opaque_fragment>`,
      )

    activeShaders.add(shader as ShaderHandle)
  }

  material.customProgramCacheKey = () =>
    [
      'engraving',
      surface,
      hatchScale.toFixed(2),
      hatchStrength.toFixed(2),
      courseHeight.toFixed(2),
      jointStrength.toFixed(2),
    ].join('-')

  material.userData.disposeEngraving = () => {
    for (const shader of activeShaders) {
      if (shader.uniforms.uHatchScale?.value === hatchScale) {
        activeShaders.delete(shader)
      }
    }
  }

  return material
}

export function createMaterialSet() {
  return {
    terrain: createEngravedMaterial({
      color: PALETTE.earth,
      roughness: 1,
      hatchScale: 1.1,
      hatchStrength: 0.3,
      surface: 'terrain',
      jointStrength: 0.46,
    }),
    stone: createEngravedMaterial({
      color: PALETTE.stone,
      hatchScale: 2.55,
      hatchStrength: 0.36,
      surface: 'masonry',
      courseHeight: 0.86,
      jointStrength: 0.38,
    }),
    paleStone: createEngravedMaterial({
      color: PALETTE.paleStone,
      hatchScale: 2.85,
      hatchStrength: 0.29,
      surface: 'masonry',
      courseHeight: 0.68,
      jointStrength: 0.28,
    }),
    plaster: createEngravedMaterial({
      color: PALETTE.plaster,
      hatchScale: 3.15,
      hatchStrength: 0.23,
      surface: 'plaster',
      jointStrength: 0.42,
    }),
    deepStone: createEngravedMaterial({
      color: PALETTE.deepStone,
      hatchScale: 2.2,
      hatchStrength: 0.45,
      surface: 'masonry',
      courseHeight: 1.08,
      jointStrength: 0.45,
    }),
    garden: createEngravedMaterial({
      color: PALETTE.garden,
      hatchScale: 3.5,
      hatchStrength: 0.4,
    }),
    darkGarden: createEngravedMaterial({
      color: PALETTE.darkGarden,
      hatchScale: 3.85,
      hatchStrength: 0.48,
    }),
    bronze: createEngravedMaterial({
      color: PALETTE.bronze,
      roughness: 0.78,
      metalness: 0.16,
      hatchScale: 3.1,
      hatchStrength: 0.4,
    }),
  }
}

export type EngravingMaterials = ReturnType<typeof createMaterialSet>

export function addInkEdges(
  mesh: THREE.Mesh,
  opacity = 0.32,
  thresholdAngle = 34,
): THREE.LineSegments {
  const edges = new THREE.EdgesGeometry(
    mesh.geometry as THREE.BufferGeometry,
    thresholdAngle,
  )
  const lines = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({
      color: PALETTE.ink,
      transparent: true,
      opacity,
      depthWrite: false,
    }),
  )
  lines.renderOrder = 2
  mesh.add(lines)
  return lines
}
