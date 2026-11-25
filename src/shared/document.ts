export type PieceKind = 'domino' | 'ramp' | 'splitter' | 'trigger'
export type Axis = 'north' | 'east' | 'south' | 'west'

export type EventKind = 'trigger' | 'fall' | 'mechanism' | 'interrupted' | 'reset' | 'roller'
export type RollerPhase = 'outbound' | 'returning'
export type RollerStatus = 'idle' | 'completed' | 'stuck-ramp' | 'mechanism-closed' | 'unreachable'

export interface Vec2 { x: number; y: number }

export interface Piece {
  id: string
  kind: PieceKind
  x: number
  y: number
  angle: number
  facing: Axis
  label: string
  height: number
  width: number
  fallThreshold: number
  friction: number
}

export interface MechanismConnection {
  id: string
  from: string
  to: string
  delay: number
  enabled: boolean
}

export interface SceneSettings {
  gravity: number
  friction: number
  width: number
  height: number
  showGrid: boolean
}

/** 复位滚轮配置：沿桌面支路行驶，只接触骨牌复位面时才推回站立。 */
export interface RollerConfig {
  enabled: boolean
  /** 首轮连锁结束后，滚轮延迟多久出发（秒）。 */
  startDelay: number
  /** 桌面行驶速度（世界单位/秒）。 */
  speed: number
  /** 接触判定半径；只有进入该半径并碰到复位面才会执行复位。 */
  contactRadius: number
  /** 两条支路的途经元件 id，每个循环交替使用一支。 */
  branches: [string[], string[]]
}

export interface ResetRoutePoint {
  x: number
  y: number
  pieceId: string | null
}

export interface RollerTraversalSample {
  x: number
  y: number
  time: number
  phase: RollerPhase
}

export interface SimulationEvent {
  id: string
  /** 滚轮类事件可能不属于任何元件。 */
  pieceId: string | null
  time: number
  causeId: string | null
  kind: EventKind
  detail: string
  /** 该事件归属的连锁轮次；复位行程事件归属它所准备的下一轮。 */
  round: number
  phase?: RollerPhase
}

export interface ResetRound {
  round: number
  startedAt: number
  endedAt: number
  status: 'completed' | 'interrupted' | 'skipped'
  triggerPieceId: string
  /** 本轮实际倒下的骨牌。 */
  fallPieceIds: string[]
  /** 本轮开始前被滚轮复位的骨牌。 */
  resetPieceIds: string[]
  /** 滚轮途经但仍处站立、未被接触复位面的骨牌。 */
  passedUprightPieceIds: string[]
  /** 首轮倒过、本轮再次倒下的骨牌。 */
  reFallenPieceIds: string[]
  interruptedPieceId: string | null
  interruptionReason: string | null
}

export interface RollerReport {
  attempted: boolean
  cycles: number
  status: RollerStatus
  stopReason: string | null
  stopPieceId: string | null
  stopTime: number | null
  stopPhase: RollerPhase | null
  /** 全程成功复位的骨牌。 */
  resetPieceIds: string[]
  /** 行程结束时仍未复位的骨牌（现场保留）。 */
  unresetPieceIds: string[]
  /** 滚轮路过但没有触碰复位面的未倒骨牌。 */
  passedUprightPieceIds: string[]
  route: ResetRoutePoint[]
  traversal: RollerTraversalSample[]
}

export interface DominoDocument {
  id: string
  title: string
  revision: number
  updatedAt: number
  pieces: Piece[]
  connections: MechanismConnection[]
  scene: SceneSettings
  startPieceId: string
  roller: RollerConfig
}

export interface SimulationRun {
  id: string
  documentId: string
  revision: number
  startedAt: number
  startPieceId: string
  status: 'complete' | 'interrupted' | 'empty'
  events: SimulationEvent[]
  interruptedPieceId: string | null
  interruptionReason: string | null
  duration: number
  rounds: ResetRound[]
  roller: RollerReport
}
