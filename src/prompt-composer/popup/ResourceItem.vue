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
    class="resource-item grid w-full min-h-[56px] grid-cols-[38px_minmax(0,1fr)] items-center gap-2 px-4 py-[7px] text-left bg-transparent border-0 rounded-2xl cursor-pointer hover:bg-[#f0f1f2] max-[720px]:min-h-[46px] max-[720px]:grid-cols-[30px_minmax(0,1fr)] max-[720px]:px-2.5 max-[720px]:py-1.5 max-[720px]:rounded-xl"
    :class="active ? 'resource-item--active bg-[#f0f1f2]' : ''"
    type="button"
  >
    <span
      class="resource-item__icon inline-flex w-8 h-8 items-center justify-center text-[#51545a] text-[1.35rem] rounded-lg max-[720px]:w-7 max-[720px]:h-7 max-[720px]:text-base"
      aria-hidden="true"
    >
      <component
        :is="iconComponent"
        v-if="iconComponent"
        :size="25"
        :stroke-width="2"
      />
      <span v-else>{{ resource.icon || '#' }}</span>
    </span>
    <span class="resource-item__content min-w-0">
      <span class="resource-item__line flex min-w-0 items-baseline gap-[14px] max-[720px]:gap-2">
        <span
          class="resource-item__title flex-none max-w-[44%] overflow-hidden whitespace-nowrap text-ellipsis text-[#4b4d52] text-[1.55rem] font-medium leading-tight max-[720px]:max-w-[48%] max-[720px]:text-base"
        >{{ resource.title }}</span>
        <span
          v-if="resource.description"
          class="resource-item__description min-w-0 overflow-hidden whitespace-nowrap text-ellipsis text-[#aaadb2] text-[1.5rem] font-[450] leading-tight max-[720px]:text-[0.98rem]"
        >
          {{ resource.description }}
        </span>
      </span>
    </span>
  </button>
</template>
