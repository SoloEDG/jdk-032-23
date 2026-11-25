<script setup lang="ts">
import { Disc3, Play, RotateCcw, Sparkles } from '@lucide/vue'
import type { SimulationRun } from '@/shared/document'

defineProps<{ run: SimulationRun | null; stale: boolean; busy: boolean; issue: string }>()
const emit = defineEmits<{ run: []; reset: [] }>()

const statusText: Record<string, string> = {
  complete: '链路完成',
  interrupted: '链路中断',
  empty: '场景为空',
}
const rollerText: Record<string, string> = {
  idle: '滚轮未启用',
  completed: '滚轮已复位全部骨牌',
  'stuck-ramp': '滚轮卡在坡道，现场已保留',
  'mechanism-closed': '机关提前关闭，现场已保留',
}
</script>

<template>
  <section class="simulation-bar">
    <div class="simulation-status">
      <span class="status-orb" :class="run?.status ?? 'idle'"></span>
      <div><strong>{{ stale ? '场景已更改' : run ? statusText[run.status] : '待运行' }}</strong>
        <small>{{ stale ? '当前回放属于上一个布局版本' : run ? `${run.events.length} 个事件 · ${run.rounds.length} 个轮次已记录` : '运行一次，观察倒下顺序与滚轮复位' }}</small>
      </div>
    </div>
    <div v-if="run?.roller.attempted" class="simulation-roller" :class="run.roller.status">
      <Disc3 :size="15" />
      <div><strong>{{ rollerText[run.roller.status] }}</strong>
        <small>已复位 {{ run.roller.resetPieceIds.length }} · 未复位 {{ run.roller.unresetPieceIds.length }} · 路过未倒 {{ run.roller.passedUprightPieceIds.length }}</small>
      </div>
    </div>
    <p v-if="issue" class="simulation-error" role="alert">{{ issue }}</p>
    <div class="simulation-actions">
      <button v-if="run" class="secondary-button" @click="emit('reset')"><RotateCcw :size="15" /> 清除</button>
      <button class="run-button" :disabled="busy" @click="emit('run')"><Play v-if="!busy" :size="16" fill="currentColor" /><span v-else class="button-spinner"></span>{{ busy ? '计算中…' : stale ? '重新模拟' : '运行模拟' }}<kbd>Space</kbd></button>
    </div>
    <span class="simulation-decoration"><Sparkles :size="15" /> 可重复结果</span>
  </section>
</template>
