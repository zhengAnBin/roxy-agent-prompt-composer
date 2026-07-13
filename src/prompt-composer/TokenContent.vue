<script setup>
import { ref } from 'vue'
import { defaultPresentation, getTokenClassList } from './core/presentation.js'

const props = defineProps({
  blocks: {
    type: Array,
    default: () => [],
  },
  context: {
    type: Object,
    default: () => ({}),
  },
  tokenActions: {
    type: [Array, Function],
    default: () => [],
  },
})

const emit = defineEmits(['token-hover', 'token-click', 'token-action'])

const activeTooltip = ref(null)
const activePopup = ref(null)

const { getIcon, getTitle, getDescription } = defaultPresentation

function isToken(block) {
  return block.type === 'resource' || block.type === 'slot' || block.type === 'token'
}

function getTokenActions(block) {
  if (typeof props.tokenActions === 'function') {
    return props.tokenActions(block, props.context) || []
  }

  return props.tokenActions || []
}

function openTooltip(event, block) {
  // 与 popup 互斥
  if (activePopup.value) {
    return
  }

  // 锚定到 token 元素本身（rect），tooltip 贴在其上方，不跟随光标。
  const rect = event.currentTarget.getBoundingClientRect()
  activeTooltip.value = {
    block,
    title: getTitle(block),
    description: getDescription(block),
    left: Math.max(12, rect.left),
    top: rect.bottom + 8,
  }
  emit('token-hover', { block, context: props.context })
}

function closeTooltip() {
  activeTooltip.value = null
}

function togglePopup(event, block) {
  event.stopPropagation()
  // 打开 popup 时清掉 tooltip（互斥）
  activeTooltip.value = null
  const rect = event.currentTarget.getBoundingClientRect()

  activePopup.value = {
    block,
    actions: getTokenActions(block),
    title: getTitle(block),
    description: getDescription(block),
    left: Math.max(12, rect.left),
    top: rect.bottom + 8,
  }
  emit('token-click', { block, context: props.context })
}

function runAction(action) {
  emit('token-action', {
    action,
    block: activePopup.value?.block,
    context: props.context,
  })
  activePopup.value = null
}
</script>

<template>
  <span class="token-content">
    <template
      v-for="(block, index) in blocks"
      :key="`${block.type}:${block.id || block.resource?.id || block.slot?.id || index}`"
    >
      <span
        v-if="block.type === 'text'"
        class="conversation-message__text whitespace-pre-wrap"
      >{{ block.text }}</span>
      <span
        v-else-if="isToken(block)"
        :class="getTokenClassList(block)"
        role="button"
        tabindex="0"
        @mouseenter="openTooltip($event, block)"
        @mouseleave="closeTooltip"
        @click="togglePopup($event, block)"
        @keydown.enter.prevent="togglePopup($event, block)"
      >
        <slot name="chip" :block="block" :surface="'message'" :context="context">
          {{ getIcon(block) }} {{ getTitle(block) }}
        </slot>
      </span>
    </template>

    <div
      v-if="activeTooltip"
      class="composer-token-tooltip fixed z-[100] max-w-[min(360px,calc(100vw-28px))] grid gap-[3px] px-[11px] py-[9px] text-[#202124] text-[0.88rem] bg-white/98 border border-[#e2e2e2] rounded-xl shadow-[0_18px_60px_rgba(0,0,0,0.08)] backdrop-blur-[18px] pointer-events-none"
      :style="{ left: `${activeTooltip.left}px`, top: `${activeTooltip.top}px` }"
    >
      <strong>{{ activeTooltip.title }}</strong>
      <span class="text-[#8c8f94]">{{ activeTooltip.description }}</span>
    </div>

    <div
      v-if="activePopup"
      class="composer-token-popup fixed z-[100] grid min-w-[260px] max-w-[min(360px,calc(100vw-28px))] gap-1 p-2 text-[#202124] bg-white/98 border border-[#e2e2e2] rounded-2xl shadow-[0_18px_60px_rgba(0,0,0,0.08)] backdrop-blur-[18px]"
      :style="{ left: `${activePopup.left}px`, top: `${activePopup.top}px` }"
      @click.stop
    >
      <div class="composer-token-popup__header grid gap-0.5 px-[9px] pt-2 pb-2.5">
        <strong class="text-[0.95rem]">{{ activePopup.title }}</strong>
        <span class="text-[#8c8f94] text-[0.84rem]">{{ activePopup.description }}</span>
      </div>
      <button
        v-for="action in activePopup.actions"
        :key="action.id"
        type="button"
        class="composer-token-popup__item grid grid-cols-[24px_minmax(0,1fr)] items-center gap-1.5 h-9 px-2.5 text-left bg-transparent border-0 rounded-[10px] cursor-pointer hover:bg-[#f1f2f3]"
        @click="runAction(action)"
      >
        <span>{{ action.icon }}</span>
        {{ action.label }}
      </button>
      <span v-if="!activePopup.actions.length" class="composer-token-popup__empty px-2.5 py-2 text-[#8c8f94] text-[0.9rem]">
        没有可用操作
      </span>
    </div>
  </span>
</template>
