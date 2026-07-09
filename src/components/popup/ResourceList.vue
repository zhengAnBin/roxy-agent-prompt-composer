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
  <div ref="listRef" class="resource-list" role="listbox" aria-label="Resources">
    <template v-if="groups.length">
      <section
        v-for="group in groups"
        :key="group.name"
        class="resource-list__group"
      >
        <div class="resource-list__heading">{{ group.name }}</div>
        <ResourceItem
          v-for="resource in group.resources"
          :key="`${resource.type}:${resource.id}`"
          :resource="resource"
          :active="resource.index === activeIndex"
          role="option"
          :aria-selected="resource.index === activeIndex"
          @mouseenter="emit('hover', resource.index)"
          @mousedown.prevent="emit('select', resource)"
        />
        <div v-if="group.loading" class="resource-list__empty">Searching...</div>
      </section>
    </template>
    <div v-else-if="loading" class="resource-list__empty">Searching...</div>
    <div v-else class="resource-list__empty">
      {{ emptyLabel }}<span v-if="keyword"> for "{{ keyword }}"</span>
    </div>
  </div>
</template>
