<script setup lang="ts">
import { watch } from 'vue'
import { Disc3, WandSparkles } from '@lucide/vue'
import type { RollerConfig } from '@/shared/document'

const props = defineProps<{
  roller: RollerConfig; branchIndex: 0 | 1; branchDraft: string
}>()
const emit = defineEmits<{
  toggle: [boolean]; startDelay: [number]; speed: [number]; contactRadius: [number]
  autoFill: []; selectBranch: [0 | 1]; applyBranch: []; clearBranch: []; 'update:draft': [string]
}>()

watch(() => props.branchIndex, index => emit('selectBranch', index), { immediate: true })
</script>

<template>
  <section class="reset-panel" aria-labelledby="reset-title">
    <div class="section-kicker"><span>04 / RESET</span><h2 id="reset-title">复位滚轮</h2></div>
    <label class="reset-switch">
      <input type="checkbox" :checked="roller.enabled" @change="emit('toggle', ($event.target as HTMLInputElement).checked)" />
      <span><Disc3 :size="14" /> 启用沿支路行驶的复位滚轮</span>
    </label>
    <div class="reset-fields" :class="{ disabled: !roller.enabled }">
      <label>出发延迟（秒）
        <input type="number" min="0" max="10" step="0.1" :value="roller.startDelay"
          @input="emit('startDelay', Number(($event.target as HTMLInputElement).value))" />
      </label>
      <label>行驶速度
        <input type="number" min="0.4" max="8" step="0.1" :value="roller.speed"
          @input="emit('speed', Number(($event.target as HTMLInputElement).value))" />
      </label>
      <label>接触半径
        <input type="number" min="0.2" max="3" step="0.05" :value="roller.contactRadius"
          @input="emit('contactRadius', Number(($event.target as HTMLInputElement).value))" />
      </label>
    </div>

    <div class="branch-tabs" role="tablist">
      <button role="tab" :class="{ chosen: branchIndex === 0 }" :aria-selected="branchIndex === 0" @click="emit('selectBranch', 0)">支路 A</button>
      <button role="tab" :class="{ chosen: branchIndex === 1 }" :aria-selected="branchIndex === 1" @click="emit('selectBranch', 1)">支路 B</button>
      <button class="branch-auto" @click="emit('autoFill')"><WandSparkles :size="12" /> 自动填充</button>
    </div>
    <textarea class="branch-editor" rows="3" :value="branchDraft" :disabled="!roller.enabled"
      aria-label="支路途经元件 id，按行驶顺序，用箭头或逗号分隔"
      @input="emit('update:draft', ($event.target as HTMLTextAreaElement).value)"></textarea>
    <div class="branch-actions">
      <button class="branch-apply" :disabled="!roller.enabled" @click="emit('applyBranch')">保存支路</button>
      <button class="branch-clear" :disabled="!roller.enabled" @click="emit('clearBranch')">清空</button>
    </div>
    <p class="reset-hint">规则：仅当滚轮接触倒下骨牌的复位面时才推回站立；路过未倒骨牌不会误触。两个循环在两支路间交替。</p>
  </section>
</template>
