import type {
  DominoDocument, ResetRound, RollerReport, SimulationEvent,
} from '@/shared/document'
import { runChainRound, type ChainRoundResult } from './propagate'
import { runResetPass } from './resetRoller'

export interface EngineResult {
  events: SimulationEvent[]
  rounds: ResetRound[]
  roller: RollerReport
  interruptedPieceId: string | null
  interruptionReason: string | null
  status: 'complete' | 'interrupted' | 'empty'
  duration: number
}

const idleRoller = (): RollerReport => ({
  attempted: false, cycles: 0, status: 'idle', stopReason: null, stopPieceId: null,
  stopTime: null, stopPhase: null, resetPieceIds: [], unresetPieceIds: [],
  passedUprightPieceIds: [], route: [], traversal: [],
})

/**
 * 完整仿真：首轮连锁 → 滚轮复位行程 → 第二轮连锁。
 * 第二轮的倒下事件独立编号、独立归属，绝不覆盖首轮记录。
 */
export function runSimulation(input: DominoDocument): EngineResult {
  const document = structuredClone(input)
  const events: SimulationEvent[] = []
  let counter = 0
  // 每次运行使用独立前缀，重复启动也不会产生相同的事件 id。
  const runToken = crypto.randomUUID().slice(0, 8)
  const makeEventId = () => `${runToken}-event-${++counter}`

  const first = runChainRound(document, {
    round: 1,
    startPieceId: document.startPieceId,
    initialFallen: new Set<string>(),
    baseTime: 0,
    makeEventId,
  })
  events.push(...first.events)

  const firstFallen = new Set(first.fallenPieceIds)
  const firstRound: ResetRound = {
    round: 1,
    startedAt: 0,
    endedAt: first.endTime,
    status: first.interruptedPieceId ? 'interrupted' : 'completed',
    triggerPieceId: document.startPieceId,
    fallPieceIds: first.fallenPieceIds,
    resetPieceIds: [],
    passedUprightPieceIds: [],
    reFallenPieceIds: [],
    interruptedPieceId: first.interruptedPieceId,
    interruptionReason: first.interruptionReason,
  }

  if (first.fallenPieceIds.length === 0) {
    return {
      events, rounds: [firstRound], roller: idleRoller(),
      interruptedPieceId: null, interruptionReason: null,
      status: 'empty', duration: first.endTime,
    }
  }

  const reset = runResetPass(firstFallen, {
    document,
    roller: document.roller,
    targetRound: 2,
    baseTime: first.endTime,
    makeEventId,
  })
  events.push(...reset.events)

  const resetSet = new Set(reset.report.resetPieceIds)
  const secondRound: ResetRound = {
    round: 2,
    startedAt: reset.endTime,
    endedAt: reset.endTime,
    status: 'skipped',
    triggerPieceId: document.startPieceId,
    fallPieceIds: [],
    resetPieceIds: reset.report.resetPieceIds,
    passedUprightPieceIds: reset.report.passedUprightPieceIds,
    reFallenPieceIds: [],
    interruptedPieceId: null,
    interruptionReason: null,
  }

  let last: ChainRoundResult | null = null
  if (reset.report.status === 'completed' && reset.report.unresetPieceIds.length === 0) {
    const second = runChainRound(document, {
      round: 2,
      startPieceId: document.startPieceId,
      initialFallen: new Set<string>(),
      baseTime: reset.endTime,
      makeEventId,
    })
    last = second
    events.push(...second.events)
    secondRound.status = second.interruptedPieceId ? 'interrupted' : 'completed'
    secondRound.endedAt = second.endTime
    secondRound.fallPieceIds = second.fallenPieceIds
    secondRound.interruptedPieceId = second.interruptedPieceId
    secondRound.interruptionReason = second.interruptionReason
    secondRound.reFallenPieceIds = second.fallenPieceIds.filter(id => firstRound.fallPieceIds.includes(id))
  } else {
    secondRound.interruptionReason = reset.report.stopReason
      ? `滚轮未完成复位（${reset.report.status === 'stuck-ramp' ? '卡在坡道' : reset.report.status === 'mechanism-closed' ? '机关提前关闭' : '支路无法覆盖'}），第二轮未启动，现场已保留。`
      : '仍有骨牌未复位，第二轮未启动。'
  }

  const allFallen = new Set([...firstRound.fallPieceIds, ...secondRound.fallPieceIds])
  // 连锁末端自然停止属于既有行为；只要滚轮行程完成、第二轮也实际启动，整体即视为完成。
  const rollerHealthy = !document.roller.enabled || reset.report.status === 'completed'
  const status: EngineResult['status'] = allFallen.size === 0 ? 'empty'
    : (!rollerHealthy || secondRound.status === 'skipped') ? 'interrupted' : 'complete'
  const duration = Math.max(first.endTime, last?.endTime ?? reset.endTime, reset.endTime)

  return {
    events,
    rounds: [firstRound, secondRound],
    roller: reset.report,
    interruptedPieceId: secondRound.interruptedPieceId ?? firstRound.interruptedPieceId ?? reset.report.stopPieceId,
    interruptionReason: secondRound.interruptionReason ?? firstRound.interruptionReason ?? reset.report.stopReason,
    status,
    duration,
  }
}
