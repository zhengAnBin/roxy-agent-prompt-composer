<script setup>
import { computed, ref, watch } from 'vue'
import ResourceList from './ResourceList.vue'

const props = defineProps({
  providers: {
    type: Array,
    default: () => [],
  },
  keyword: {
    type: String,
    default: '',
  },
  trigger: {
    type: String,
    default: '@',
  },
  directive: {
    type: Object,
    default: () => ({}),
  },
  emptyLabel: {
    type: String,
    default: '添加',
  },
  noResultsLabel: {
    type: String,
    default: 'No resources found',
  },
})

const emit = defineEmits(['select', 'close'])

const activeIndex = ref(0)
// 每个 provider 独立维护自己的 { loading, results }，互不阻塞
const providerStates = ref([])
let searchRun = 0

const normalizedKeyword = computed(() => props.keyword.trim().toLowerCase())

// 所有已返回结果的扁平列表，供键盘导航使用
const flatResources = computed(() => providerStates.value.flatMap((state) => state.results))

// 是否还有 provider 在加载（仅用于抑制“无结果”的闪现）
const anyLoading = computed(() => providerStates.value.some((state) => state.loading))

const groupedResources = computed(() => {
  const groups = new Map()

  flatResources.value.forEach((resource, index) => {
    const groupName = resource.group || resource.provider || '添加'

    if (!groups.has(groupName)) {
      groups.set(groupName, { name: groupName, resources: [], loading: false })
    }

    groups.get(groupName).resources.push({ ...resource, index })
  })

  // 为仍在加载、且声明了 group 的 provider 显示该分类的 loading 占位
  providerStates.value.forEach((state) => {
    if (!state.loading || !state.group) {
      return
    }

    if (!groups.has(state.group)) {
      groups.set(state.group, { name: state.group, resources: [], loading: true })
    } else {
      groups.get(state.group).loading = true
    }
  })

  return [...groups.values()]
})

function searchResources() {
  const run = ++searchRun
  const keyword = normalizedKeyword.value

  // 立即重置各 provider 状态：本地的会很快返回，异步的先标记为 loading
  providerStates.value = props.providers.map((provider) => ({
    name: provider.name,
    group: provider.group || null,
    loading: true,
    results: [],
  }))
  activeIndex.value = 0

  // 各自独立发起，谁先回来谁先渲染，不再互相等待
  props.providers.forEach((provider, index) => {
    Promise.resolve()
      .then(() => provider.search(keyword))
      .then((result) => {
        if (run !== searchRun) {
          return
        }

        const state = providerStates.value[index]
        state.results = Array.isArray(result) ? result : []
        state.loading = false
      })
      .catch((error) => {
        if (run !== searchRun) {
          return
        }

        console.warn(`Resource provider "${provider.name || 'anonymous'}" failed`, error)
        const state = providerStates.value[index]
        state.results = []
        state.loading = false
      })
  })
}

function move(delta) {
  const total = flatResources.value.length

  if (!total) {
    return
  }

  const nextIndex = activeIndex.value + delta
  activeIndex.value = (nextIndex + total) % total
}

function choose(resource = flatResources.value[activeIndex.value]) {
  if (resource) {
    emit('select', resource)
  }
}

function onKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
    return
  }

  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    choose()
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

watch([normalizedKeyword, () => props.providers], searchResources, { immediate: true })

defineExpose({
  onKeydown,
})
</script>

<template>
  <div class="resource-picker w-full max-h-[min(638px,calc(100vh-184px))] overflow-hidden text-[#202124] bg-white/95 border border-[#e4e4e4] rounded-[30px] shadow-[0_18px_60px_rgba(0,0,0,0.08)] backdrop-blur-[18px] max-[720px]:rounded-[22px]">
    <div class="resource-picker__header hidden">
      <span class="resource-picker__trigger">{{ trigger }}</span>
      <span class="resource-picker__query">{{ keyword || emptyLabel }}</span>
    </div>
    <ResourceList
      :groups="groupedResources"
      :active-index="activeIndex"
      :loading="anyLoading"
      :keyword="keyword"
      :empty-label="noResultsLabel"
      @hover="activeIndex = $event"
      @select="choose"
    >
      <template v-if="$slots.item" #item="itemProps">
        <slot name="item" v-bind="itemProps" :directive="directive" />
      </template>
    </ResourceList>
  </div>
</template>
