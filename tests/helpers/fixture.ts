import type { DominoDocument, Piece, RollerConfig } from '@/shared/document.ts'

let seq = 0
export function domino(id: string, x: number, y: number, angle = 0): Piece {
  seq += 1
  return {
    id, kind: 'domino', x, y, angle, facing: 'east', label: id,
    height: 1.6, width: 0.42, fallThreshold: 0.8, friction: 0.55,
  }
}

export function ramp(id: string, x: number, y: number, friction = 0.55): Piece {
  return {
    id, kind: 'ramp', x, y, angle: 0, facing: 'east', label: id,
    height: 0.45, width: 1.7, fallThreshold: 0.8, friction,
  }
}

export function splitter(id: string, x: number, y: number): Piece {
  return {
    id, kind: 'splitter', x, y, angle: 0, facing: 'east', label: id,
    height: 1.6, width: 0.75, fallThreshold: 0.8, friction: 0.55,
  }
}

export function trigger(id: string, x: number, y: number): Piece {
  return {
    id, kind: 'trigger', x, y, angle: 0, facing: 'east', label: id,
    height: 0.8, width: 0.7, fallThreshold: 0.8, friction: 0.55,
  }
}

export const defaultRoller = (branches: [string[], string[]], override: Partial<RollerConfig> = {}): RollerConfig => ({
  enabled: true,
  startDelay: 0.5,
  speed: 2,
  contactRadius: 0.9,
  branches,
  ...override,
})

export function buildDocument(pieces: Piece[], roller: RollerConfig, connections: DominoDocument['connections'] = []): DominoDocument {
  return {
    id: 'test-scene',
    title: '测试场景',
    revision: 1,
    updatedAt: 0,
    pieces,
    connections,
    scene: { gravity: 9.8, friction: 0.62, width: 24, height: 10, showGrid: false },
    startPieceId: pieces[0]?.id ?? '',
    roller,
  }
}

/** 两支路 Y 形分岔：主干 a1-a2，分岔 s 后上支 b1-b2、下支 c1-c2；u1 在路线上但超出连锁触达，全程站立。 */
export function splitScene(rollerOverride: Partial<RollerConfig> = {}): DominoDocument {
  const pieces = [
    domino('a1', 1, 4),
    domino('a2', 2.6, 4),
    splitter('s1', 4.2, 4),
    domino('b1', 5.8, 2.6),
    domino('b2', 7.4, 2.6),
    domino('c1', 5.8, 5.4),
    domino('c2', 7.4, 5.4),
    // 距离 b2 约 3.63，超出引擎有效触达（height*1.18*reachScale ≈ 2.35），首轮不会倒；位于支路 A 的行驶路线上。
    domino('u1', 10.6, 2.6),
  ]
  const roller = defaultRoller([
    ['a1', 'a2', 's1', 'b1', 'b2', 'u1'],
    ['a1', 'a2', 's1', 'c1', 'c2'],
  ], rollerOverride)
  const doc = buildDocument(pieces, roller, [
    { id: 'ln1', from: 's1', to: 'b1', delay: 0.1, enabled: true },
    { id: 'ln2', from: 's1', to: 'c1', delay: 0.1, enabled: true },
  ])
  return doc
}
