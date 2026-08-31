import {
  createNetworkState,
  edgeKey,
  maxBalanceError,
  nodeLevel,
  solveNetwork,
  waterwheelDrive,
  type WaterControls,
} from '../src/water/network'

const open: WaterControls = {
  intakeGate: 1,
  supply: 1,
  mainGate: 1,
  tercioGate: 1,
  liftDrive: 1,
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const flowing = createNetworkState(false)
solveNetwork(flowing, open, 10)
assert(maxBalanceError(flowing) < 1e-9, 'open network violates conservation')
assert(
  flowing.edges[edgeKey('intake', 'contourA')].flow > 0,
  'open intake did not produce trunk flow',
)
assert(waterwheelDrive(flowing) > 0.95, 'open lift did not drive the wheel')

const liftStopped = createNetworkState(false)
solveNetwork(liftStopped, { ...open, liftDrive: 0 }, 5)
assert(waterwheelDrive(liftStopped) === 0, 'stopped lift still drives the wheel')
assert(
  liftStopped.edges[edgeKey('partidor', 'generalife')].flow > 0,
  'stopping the lift incorrectly stopped the gravity branch',
)

const intakeClosed = createNetworkState(false)
solveNetwork(intakeClosed, { ...open, intakeGate: 0 }, 5)
assert(
  intakeClosed.edges[edgeKey('intake', 'contourA')].flow === 0,
  'closed intake still passes water',
)
assert(maxBalanceError(intakeClosed) < 1e-9, 'closed network violates conservation')

const draining = createNetworkState(true)
const initialLions = nodeLevel(draining, 'lions')
for (let index = 0; index < 12; index += 1) {
  solveNetwork(draining, { ...open, intakeGate: 0 }, 20)
}
assert(
  nodeLevel(draining, 'lions') < initialLions,
  'stored court water did not drain after supply stopped',
)
assert(maxBalanceError(draining) < 1e-9, 'draining network violates conservation')

console.log('water checks passed: conservation, gates, lift and storage')

