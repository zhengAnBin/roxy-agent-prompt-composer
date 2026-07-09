<script setup>
import { computed, ref } from 'vue'

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

const safeBlocks = computed(() => props.blocks?.length ? props.blocks : [])

function getResourceBlock(block) {
  if (block.type === 'resource') {
    return block.resource || {}
  }

  if (block.type === 'token' && block.kind === 'resource') {
    return block.resource || block.value || {}
  }

  if (block.type === 'slot' && block.slot?.kind === 'resource') {
    return block.slot.value || {}
  }

  return null
}

function getSlotBlock(block) {
  if (block.type === 'slot') {
    return block.slot || {}
  }

  if (block.type === 'token' && block.kind === 'slot') {
    return block.slot || block
  }

  return null
}

function getTokenKind(block) {
  if (getResourceBlock(block)) {
    return 'resource'
  }

  if (getSlotBlock(block)) {
    return 'slot'
  }

  return block.kind || 'token'
}

function getTokenIcon(block) {
  const resource = getResourceBlock(block)
  const slot = getSlotBlock(block)

  if (resource) {
    return resource.icon || '#'
  }

  if (slot?.kind === 'resource') {
    return slot.value?.icon || '@'
  }

  return slot?.icon || ':'
}

function getTokenTitle(block) {
  const resource = getResourceBlock(block)
  const slot = getSlotBlock(block)

  if (resource) {
    return resource.title || resource.id || 'Resource'
  }

  if (slot?.kind === 'resource') {
    return slot.value?.title || slot.placeholder || slot.label || '选择资源'
  }

  return slot?.value || slot?.placeholder || slot?.label || '输入内容'
}

function getTokenDescription(block) {
  const resource = getResourceBlock(block)
  const slot = getSlotBlock(block)

  if (resource) {
    return resource.description || resource.type || ''
  }

  if (slot?.kind === 'resource') {
    return slot.value?.description || slot.resourceType || '待选择'
  }

  return slot?.description || (slot?.value ? '可编辑输入' : '待填写')
}

function getTokenActions(block) {
  if (typeof props.tokenActions === 'function') {
    return props.tokenActions(block, props.context) || []
  }

  return props.tokenActions || []
}

function openTooltip(event, block) {
  activeTooltip.value = {
    block,
    title: getTokenTitle(block),
    description: getTokenDescription(block),
    x: event.clientX,
    y: event.clientY,
  }
  emit('token-hover', { block, context: props.context })
}

function moveTooltip(event) {
  if (!activeTooltip.value) {
    return
  }

  activeTooltip.value = {
    ...activeTooltip.value,
    x: event.clientX,
    y: event.clientY,
  }
}

function closeTooltip() {
  activeTooltip.value = null
}

function togglePopup(event, block) {
  event.stopPropagation()
  const actions = getTokenActions(block)
  const rect = event.currentTarget.getBoundingClientRect()

  activePopup.value = {
    block,
    actions,
    title: getTokenTitle(block),
    description: getTokenDescription(block),
    x: event.clientX || rect.left,
    y: event.clientY || rect.bottom,
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
      v-for="(block, index) in safeBlocks"
      :key="`${block.type}:${block.id || block.resource?.id || block.slot?.id || index}`"
    >
      <span
        v-if="block.type === 'text'"
        class="conversation-message__text"
      >{{ block.text }}</span>
      <span
        v-else
        class="composer-chip composer-token"
        :class="[
          `composer-token--${getTokenKind(block)}`,
          { 'composer-token--empty': getSlotBlock(block) && !getSlotBlock(block).value },
        ]"
        role="button"
        tabindex="0"
        @mouseenter="openTooltip($event, block)"
        @mousemove="moveTooltip"
        @mouseleave="closeTooltip"
        @click="togglePopup($event, block)"
        @keydown.enter.prevent="togglePopup($event, block)"
      >
        {{ getTokenIcon(block) }} {{ getTokenTitle(block) }}
      </span>
    </template>

    <div
      v-if="activeTooltip"
      class="composer-token-tooltip"
      :style="{ left: `${activeTooltip.x + 12}px`, top: `${activeTooltip.y + 14}px` }"
    >
      <strong>{{ activeTooltip.title }}</strong>
      <span>{{ activeTooltip.description }}</span>
    </div>

    <div
      v-if="activePopup"
      class="composer-token-popup"
      :style="{ left: `${activePopup.x}px`, top: `${activePopup.y + 12}px` }"
      @click.stop
    >
      <div class="composer-token-popup__header">
        <strong>{{ activePopup.title }}</strong>
        <span>{{ activePopup.description }}</span>
      </div>
      <button
        v-for="action in activePopup.actions"
        :key="action.id"
        type="button"
        class="composer-token-popup__item"
        @click="runAction(action)"
      >
        <span>{{ action.icon }}</span>
        {{ action.label }}
      </button>
      <span v-if="!activePopup.actions.length" class="composer-token-popup__empty">
        没有可用操作
      </span>
    </div>
  </span>
</template>
