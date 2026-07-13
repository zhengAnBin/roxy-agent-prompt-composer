<script setup>
import { nextTick, ref, watch } from 'vue'
import ResourceItem from './ResourceItem.vue'

const props = defineProps({
  groups: {
    type: Array,
    default: () => [],
  },
  activeIndex: {
    type: Number,
    default: 0,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  keyword: {
    type: String,
    default: '',
  },
  emptyLabel: {
    type: String,
    default: 'No resources found',
  },
})

const emit = defineEmits(['hover', 'select'])

const listRef = ref(null)

watch(
  () => props.activeIndex,
  async () => {
    await nextTick()

    const activeItem = listRef.value?.querySelector('.resource-item--active')
    activeItem?.scrollIntoView({ block: 'nearest' })
  },
)
</script>

<template>
  <div
    ref="listRef"
    class="resource-list grid max-h-[min(638px,calc(100vh-184px))] overflow-y-auto px-2.5 pt-3.5 pb-3 max-[720px]:px-2 max-[720px]:py-2.5"
    role="listbox"
    aria-label="Resources"
  >
    <template v-if="groups.length">
      <section
        v-for="group in groups"
        :key="group.name"
        class="resource-list__group [&+&]:mt-[18px]"
      >
        <div class="resource-list__heading px-4 pt-0.5 pb-2 text-[#909297] text-[1.55rem] font-bold leading-tight max-[720px]:pl-3 max-[720px]:text-base">
          {{ group.name }}
        </div>
        <div
          v-for="resource in group.resources"
          :key="`${resource.type}:${resource.id}`"
          role="option"
          :aria-selected="resource.index === activeIndex"
          @mouseenter="emit('hover', resource.index)"
          @mousedown.prevent="emit('select', resource)"
        >
          <slot
            name="item"
            :item="resource"
            :active="resource.index === activeIndex"
          >
            <ResourceItem
              :resource="resource"
              :active="resource.index === activeIndex"
            />
          </slot>
        </div>
        <div v-if="group.loading" class="resource-list__empty grid min-h-24 place-items-center p-5 text-[#8c8f94] text-base text-center">
          Searching...
        </div>
      </section>
    </template>
    <div v-else-if="loading" class="resource-list__empty grid min-h-24 place-items-center p-5 text-[#8c8f94] text-base text-center">
      Searching...
    </div>
    <div v-else class="resource-list__empty grid min-h-24 place-items-center p-5 text-[#8c8f94] text-base text-center">
      {{ emptyLabel }}<span v-if="keyword"> for "{{ keyword }}"</span>
    </div>
  </div>
</template>
