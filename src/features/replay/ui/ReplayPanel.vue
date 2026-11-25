<script setup lang="ts">
import {
  AlertTriangle, CheckCircle2, CircleStop, Disc3, FastForward, Pause, Play,
  RotateCcw, SkipBack,
} from '@lucide/vue'
import type { SimulationEvent, SimulationRun } from '@/shared/document'
import { formatSeconds } from '@/shared/time'
import type { RoundFilter } from '../lib/eventOrder'
import { roundLabel } from '../lib/eventOrder'

const props = defineProps<{
  run: SimulationRun | null; events: SimulationEvent[]; time: number; playing: boolean
  currentEvent: SimulationEvent | null; stale: boolean; rounds: number[]
  roundFilter: RoundFilter
}>()
const emit = defineEmits<{
  toggle: []; seek: [number]; restart: []; event: [string]; filter: [RoundFilter]
}>()

const iconFor = (kind: SimulationEvent['kind']) => kind === 'interrupted' ? AlertTriangle
  : kind === 'reset' ? RotateCcw
    : kind === 'roller' ? Disc3
      : kind === 'mechanism' ? FastForward : CheckCircle2

const rollerStatusText: Record<string, string> = {
  idle: '未启用',
  completed: '复位完成',
  'stuck-ramp': '卡在坡道',
  'mechanism-closed': '机关关闭',
}
const pieceLabel = (pieceId: string | null) => pieceId
  ? props.run?.events.find(item => item.pieceId === pieceId)?.pieceId ?? pieceId
  : '滚轮'
</script>

<template>
  <section class="replay-panel" aria-labelledby="replay-title">
    <div class="replay-heading">
      <div class="section-kicker"><span>05 / REVIEW</span><h2 id="replay-title">结果回看</h2></div>
      <span v-if="run" class="replay-revision" :class="{ stale }">{{ stale ? '旧版布局' : `R${run.revision}` }}</span>
    </div>
    <template v-if="run">
      <div class="replay-summary" :class="run.status">
        <div class="summary-symbol"><CircleStop v-if="run.status === 'interrupted'" :size="17" /><CheckCircle2 v-else :size="17" /></div>
        <div><strong>{{ run.status === 'interrupted' ? '找到中断点' : run.status === 'complete' ? '连锁已完成' : '场景暂无元件' }}</strong>
          <small>{{ run.interruptionReason ?? '所有触发事件均已记录' }}</small></div>
      </div>

      <div v-if="run.roller.attempted" class="roller-card" :class="run.roller.status">
        <div class="roller-card-head"><Disc3 :size="15" /><strong>复位滚轮 · {{ rollerStatusText[run.roller.status] }}</strong>
          <span class="roller-chip">{{ run.roller.cycles }} 个支路循环</span></div>
        <p v-if="run.roller.stopReason" class="roller-stop">{{ run.roller.stopReason }}</p>
        <div class="roller-lists">
          <p><span class="roller-dot reset"></span>已复位 {{ run.roller.resetPieceIds.length }} 枚：
            <em>{{ run.roller.resetPieceIds.join('、') || '—' }}</em></p>
          <p><span class="roller-dot pending"></span>未复位 {{ run.roller.unresetPieceIds.length }} 枚：
            <em>{{ run.roller.unresetPieceIds.join('、') || '—' }}</em></p>
          <p><span class="roller-dot pass"></span>路过未倒 {{ run.roller.passedUprightPieceIds.length }} 枚：
            <em>{{ run.roller.passedUprightPieceIds.join('、') || '—' }}</em></p>
        </div>
      </div>

      <div class="replay-controls">
        <button class="replay-icon" aria-label="回到开头" @click="emit('restart')"><SkipBack :size="15" /></button>
        <button class="replay-play" :aria-label="playing ? '暂停回放' : '播放回放'" @click="emit('toggle')">
          <Pause v-if="playing" :size="16" fill="currentColor" /><Play v-else :size="16" fill="currentColor" />
        </button>
        <span class="replay-clock mono">{{ formatSeconds(time) }}</span>
        <input aria-label="回放进度" class="replay-range" type="range" min="0" :max="run.duration || 0.01" step="0.01" :value="time"
          @input="emit('seek', Number(($event.target as HTMLInputElement).value))" />
        <span class="replay-clock mono">{{ formatSeconds(run.duration) }}</span>
      </div>

      <div class="round-filter" role="group" aria-label="按轮次筛选事件">
        <button :class="{ chosen: roundFilter === 'all' }" @click="emit('filter', 'all')">全部</button>
        <button v-for="round in rounds" :key="round" :class="{ chosen: roundFilter === round }" @click="emit('filter', round)">
          {{ roundLabel(round) }}
        </button>
      </div>

      <div class="event-list-heading"><span>事件轨迹</span><span>{{ events.length }} EVENTS</span></div>
      <ol class="event-list">
        <li v-for="event in events" :key="event.id">
          <button class="event-row" :class="[
            { current: currentEvent?.id === event.id, interrupted: event.kind === 'interrupted',
              reset: event.kind === 'reset', roller: event.kind === 'roller' },
            `round-${event.round}`,
          ]" :aria-current="currentEvent?.id === event.id ? 'step' : undefined" @click="emit('event', event.id)">
            <span class="event-time mono">{{ formatSeconds(event.time) }}</span>
            <span class="event-icon"><component :is="iconFor(event.kind)" :size="14" /></span>
            <span class="event-copy"><strong>{{ event.detail.split(' · ')[0] }}</strong><small>{{ event.detail.split(' · ').slice(1).join(' · ') || pieceLabel(event.pieceId) }}</small></span>
            <span class="event-round" :class="`round-badge-${event.round}`">{{ roundLabel(event.round) }}</span>
            <span v-if="event.kind === 'interrupted'" class="event-flag">中断</span>
          </button>
        </li>
      </ol>
      <div v-if="run.interruptedPieceId" class="interruption-card">
        <span class="interrupt-icon"><AlertTriangle :size="16" /></span>
        <div><strong>中断位置</strong><p>{{ run.interruptionReason ?? '该元件未触及下一件元件。返回场景调整间距或方向，再次模拟。' }}</p></div>
        <button :aria-label="'定位到 ' + run.interruptedPieceId" @click="emit('event', run.events.find(event => event.kind === 'interrupted')?.id ?? '')">定位</button>
      </div>
      <div v-if="stale" class="stale-note"><RotateCcw :size="13" /> 当前布局已改变，这份结果仍对应运行时保存的场景。</div>
    </template>
    <div v-else class="replay-empty">
      <div class="empty-orbit"><i></i><i></i><i></i><span></span></div>
      <strong>等待第一次模拟</strong><p>点击「运行模拟」，倒下顺序、滚轮复位与再次触发会按轮次显示在这里。</p>
    </div>
  </section>
</template>
