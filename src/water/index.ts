export {
  WaterSystem,
  type WaterStageState,
  type WaterSystemOptions,
} from './WaterSystem'

export {
  WATER_EDGES,
  WATER_NODES,
  WATER_STAGES,
  getWaterNode,
  type WaterEdgeRole,
  type WaterEdgeSpec,
  type WaterNodeId,
  type WaterNodeKind,
  type WaterNodeSpec,
  type WaterStageId,
  type WaterStageSpec,
} from './graph'

export {
  INTAKE_CAPACITY,
  LIFT_CAPACITY,
  capacityOf,
  maxBalanceError,
  type NetworkState,
  type WaterControls,
} from './network'

export {
  CHANNEL_WIDTH,
  channelSection,
  depthRatio,
  normalDepth,
  velocityRatio,
  type ChannelSection,
} from './hydraulics'
