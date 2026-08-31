import * as THREE from 'three'

import { WORLD } from '../worldSpec'

export type WaterNodeId = keyof typeof WORLD.water

export type WaterNodeKind =
  | 'source'
  | 'channel'
  | 'splitter'
  | 'garden'
  | 'lift'
  | 'gate'
  | 'distribution'
  | 'feature'
  | 'outfall'

export type WaterEdgeRole = 'trunk' | 'upper' | 'palace' | 'drain'

export interface WaterNodeSpec {
  id: WaterNodeId
  label: string
  kind: WaterNodeKind
  progress: number
  position: THREE.Vector3
}

export interface WaterEdgeSpec {
  id: string
  from: WaterNodeId
  to: WaterNodeId
  role: WaterEdgeRole
  start: number
  end: number
  via?: readonly (readonly [number, number, number])[]
}

export type WaterStageId =
  | 'intake'
  | 'contour'
  | 'partidor'
  | 'generalife'
  | 'albercones'
  | 'tower'
  | 'palaces'
  | 'drain'

export interface WaterStageSpec {
  id: WaterStageId
  title: string
  eyebrow: string
  description: string
  start: number
  end: number
  focusNode: WaterNodeId
}

function node(
  id: WaterNodeId,
  label: string,
  kind: WaterNodeKind,
  progress: number,
): WaterNodeSpec {
  return {
    id,
    label,
    kind,
    progress,
    position: WORLD.water[id].clone(),
  }
}

export const WATER_NODES: readonly WaterNodeSpec[] = [
  node('intake', 'Darro intake', 'source', 0.02),
  node('contourA', 'Contour channel I', 'channel', 0.11),
  node('contourB', 'Contour channel II', 'channel', 0.2),
  node('partidor', 'Partidor', 'splitter', 0.29),
  node('generalife', 'Generalife', 'garden', 0.41),
  node('albercones', 'Albercones lift', 'lift', 0.46),
  node('waterTower', 'Torre del Agua', 'gate', 0.6),
  node('city', 'Medina distributor', 'distribution', 0.68),
  node('lions', 'Court of the Lions', 'feature', 0.78),
  node('comares', 'Comares mirror pool', 'feature', 0.81),
  node('bath', 'Royal bath', 'feature', 0.84),
  node('drain', 'Darro outfall', 'outfall', 0.965),
] as const

export const WATER_EDGES: readonly WaterEdgeSpec[] = [
  {
    id: 'intake-contour-a',
    from: 'intake',
    to: 'contourA',
    role: 'trunk',
    start: 0.015,
    end: 0.13,
    via: [
      [-89, 29.2, 24],
      [-82, 29.1, 18.5],
    ],
  },
  {
    id: 'contour-a-b',
    from: 'contourA',
    to: 'contourB',
    role: 'trunk',
    start: 0.1,
    end: 0.22,
    via: [[-65, 28.85, 7]],
  },
  {
    id: 'contour-b-partidor',
    from: 'contourB',
    to: 'partidor',
    role: 'trunk',
    start: 0.19,
    end: 0.31,
    via: [[-41.5, 28.4, -9]],
  },
  {
    id: 'partidor-generalife',
    from: 'partidor',
    to: 'generalife',
    role: 'trunk',
    start: 0.285,
    end: 0.445,
    via: [
      [-23, 27.8, -19.1],
      [-14.5, 26.9, -18.4],
    ],
  },
  {
    id: 'partidor-albercones',
    from: 'partidor',
    to: 'albercones',
    role: 'upper',
    start: 0.315,
    end: 0.475,
    via: [
      [-31.8, 28.45, -23],
      [-31.6, 29.1, -29],
      [-31.2, 30.5, -33],
    ],
  },
  {
    id: 'generalife-tower',
    from: 'generalife',
    to: 'waterTower',
    role: 'trunk',
    start: 0.415,
    end: 0.615,
    via: [
      [3.5, 25.65, -15],
      [14.2, 24.25, -10.5],
    ],
  },
  {
    id: 'albercones-tower',
    from: 'albercones',
    to: 'waterTower',
    role: 'upper',
    start: 0.455,
    end: 0.62,
    via: [
      [-22, 31.1, -32],
      [-7, 28.9, -24],
      [12, 26.3, -14.8],
    ],
  },
  {
    id: 'tower-city',
    from: 'waterTower',
    to: 'city',
    role: 'trunk',
    start: 0.585,
    end: 0.695,
    via: [
      [33.1, 22.9, -3.6],
      [38.4, 22.6, -2.4],
    ],
  },
  {
    id: 'city-lions',
    from: 'city',
    to: 'lions',
    role: 'palace',
    start: 0.665,
    end: 0.79,
    via: [
      [47.4, 22.2, -3.1],
      [51.4, 22, -6.1],
    ],
  },
  {
    id: 'city-comares',
    from: 'city',
    to: 'comares',
    role: 'palace',
    start: 0.69,
    end: 0.825,
    via: [
      [51.8, 22.15, 1.9],
      [59, 21.85, 4.2],
    ],
  },
  {
    id: 'city-bath',
    from: 'city',
    to: 'bath',
    role: 'palace',
    start: 0.71,
    end: 0.85,
    via: [
      [49.3, 22.05, 5.2],
      [54.5, 21.55, 9.1],
    ],
  },
  {
    id: 'lions-drain',
    from: 'lions',
    to: 'drain',
    role: 'drain',
    start: 0.785,
    end: 0.985,
    via: [
      [63.5, 20.8, -3.8],
      [72.2, 18.8, 8],
      [78.2, 16.8, 18],
    ],
  },
  {
    id: 'comares-drain',
    from: 'comares',
    to: 'drain',
    role: 'drain',
    start: 0.815,
    end: 0.992,
    via: [
      [72.2, 20.05, 8.3],
      [77.5, 17.95, 16.2],
    ],
  },
  {
    id: 'bath-drain',
    from: 'bath',
    to: 'drain',
    role: 'drain',
    start: 0.84,
    end: 1,
    via: [
      [66.2, 19.9, 14.2],
      [75, 17.55, 20.2],
    ],
  },
] as const

export const WATER_STAGES: readonly WaterStageSpec[] = [
  {
    id: 'intake',
    title: '借河而生',
    eyebrow: 'Darro · Presa Real',
    description: '取水坝把河水送入一条只靠地势工作的长渠。',
    start: 0,
    end: 0.075,
    focusNode: 'intake',
  },
  {
    id: 'contour',
    title: '沿山守住坡度',
    eyebrow: 'Acequia Real',
    description: '水渠贴着 Cerro del Sol 等高线缓慢下降。',
    start: 0.075,
    end: 0.255,
    focusNode: 'contourB',
  },
  {
    id: 'partidor',
    title: '一水分为两路',
    eyebrow: 'Partidor',
    description: '低位主渠与高位 Tercio 支渠在这里分配水量。',
    start: 0.255,
    end: 0.345,
    focusNode: 'partidor',
  },
  {
    id: 'generalife',
    title: '先养活花园与农田',
    eyebrow: 'Generalife',
    description: '水穿过梯田与 Patio de la Acequia，再继续向宫城流去。',
    start: 0.345,
    end: 0.455,
    focusNode: 'generalife',
  },
  {
    id: 'albercones',
    title: '把水抬向高地',
    eyebrow: 'Los Albercones',
    description: '地下廊道、深井与畜力水车共同蓄满高位水池。',
    start: 0.455,
    end: 0.575,
    focusNode: 'albercones',
  },
  {
    id: 'tower',
    title: '跨谷入城',
    eyebrow: 'Torre del Agua',
    description: '两路水在入城前汇合，经水渠桥穿过防御边界。',
    start: 0.575,
    end: 0.685,
    focusNode: 'waterTower',
  },
  {
    id: 'palaces',
    title: '水成为建筑',
    eyebrow: 'Medina · Palaces',
    description: '分水网络把同一股水变成镜池、薄水、浴室与生活供水。',
    start: 0.685,
    end: 0.885,
    focusNode: 'city',
  },
  {
    id: 'drain',
    title: '余水回到山谷',
    eyebrow: 'Drain · Darro',
    description: '雨水、使用后的水和余水沿低处离开宫城。',
    start: 0.885,
    end: 1.000001,
    focusNode: 'drain',
  },
] as const

export function getWaterNode(id: WaterNodeId): WaterNodeSpec {
  const found = WATER_NODES.find((candidate) => candidate.id === id)
  if (!found) {
    throw new Error(`Unknown water node: ${id}`)
  }
  return found
}
