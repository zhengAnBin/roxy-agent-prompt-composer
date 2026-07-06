<script setup>
import {
  Bot,
  Box,
  Brain,
  CheckSquare,
  Crosshair,
  FileText,
  Folder,
  Globe,
  Paperclip,
  Wrench,
} from '@lucide/vue'
import { computed } from 'vue'

const iconMap = {
  agent: Bot,
  file: Paperclip,
  folder: Folder,
  memory: Brain,
  tool: Wrench,
  workspace: Box,
  prompt: FileText,
  'file-picker': Paperclip,
  browser: Globe,
  goal: Crosshair,
  plan: CheckSquare,
}

const props = defineProps({
  resource: {
    type: Object,
    required: true,
  },
  active: {
    type: Boolean,
    default: false,
  },
})

const iconComponent = computed(() => iconMap[props.resource.type])
</script>

<template>
  <button
    class="resource-item"
    :class="{ 'resource-item--active': active }"
    type="button"
  >
    <span class="resource-item__icon" aria-hidden="true">
      <component
        :is="iconComponent"
        v-if="iconComponent"
        :size="25"
        :stroke-width="2"
      />
      <span v-else>{{ resource.icon || '#' }}</span>
    </span>
    <span class="resource-item__content">
      <span class="resource-item__line">
        <span class="resource-item__title">{{ resource.title }}</span>
        <span v-if="resource.description" class="resource-item__description">
          {{ resource.description }}
        </span>
      </span>
    </span>
  </button>
</template>
