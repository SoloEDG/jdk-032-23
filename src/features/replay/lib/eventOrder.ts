import type { RollerReport, SimulationEvent, Vec2 } from '@/shared/document'

export function sortedEvents(events: readonly SimulationEvent[]) {
  return [...events].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
}

export function previousEvent(events: readonly SimulationEvent[], time: number) {
  return sortedEvents(events).filter(event => event.time <= time).at(-1) ?? null
}

export type RoundFilter = 'all' | number

/** 事件按轮次分组；复位与滚轮事件归属它们所准备的下一轮。 */
export function eventsForRound(events: readonly SimulationEvent[], filter: RoundFilter) {
  const sorted = sortedEvents(events)
  if (filter === 'all') return sorted
  return sorted.filter(event => event.round === filter)
}

export const roundLabel = (round: number) => `第 ${round} 轮`

export type DominoVisualState = 'standing' | 'fallen' | 'reset'

/**
 * 按回放时间推导骨牌的实际状态：
 * fall 事件后倒下，reset 事件后重新站立；同一枚骨牌多轮事件按时间取最近一次。
 */
export function dominoStateAt(events: readonly SimulationEvent[], pieceId: string, time: number): DominoVisualState {
  const history = sortedEvents(events)
    .filter(event => event.pieceId === pieceId && event.time <= time && (event.kind === 'fall' || event.kind === 'reset'))
  const last = history.at(-1)
  if (!last) return 'standing'
  return last.kind === 'reset' ? 'reset' : 'fallen'
}

/** 汇总一枚骨牌每一轮的事件，用于校验“再次倒下按新一轮记录”。 */
export function eventRoundsForPiece(events: readonly SimulationEvent[], pieceId: string) {
  return sortedEvents(events)
    .filter(event => event.pieceId === pieceId && (event.kind === 'fall' || event.kind === 'reset'))
    .map(event => ({ round: event.round, kind: event.kind, time: event.time }))
}

/** 取滚轮在指定回放时间的位置；行程未开始或已结束时返回 null / 终点。 */
export function rollerPositionAt(report: RollerReport, time: number): (Vec2 & { phase: 'outbound' | 'returning' }) | null {
  const samples = report.traversal
  if (samples.length === 0 || time < samples[0].time) return null
  if (time >= samples[samples.length - 1].time) {
    const end = samples[samples.length - 1]
    return { x: end.x, y: end.y, phase: end.phase }
  }
  let index = 0
  while (index < samples.length - 1 && samples[index + 1].time <= time) index += 1
  const current = samples[index]
  const next = samples[index + 1]
  if (!next) return { x: current.x, y: current.y, phase: current.phase }
  const ratio = (time - current.time) / Math.max(0.0001, next.time - current.time)
  return {
    x: current.x + (next.x - current.x) * ratio,
    y: current.y + (next.y - current.y) * ratio,
    phase: current.phase,
  }
}
