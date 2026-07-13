/**
 * 默认呈现逻辑（icon / title / description）。
 *
 * 这些函数**只**用于组件没有提供自定义回显（#chip 插槽 / picker-item 插槽）时的兜底渲染，
 * 以及 blocksToPlainText 的文本化。它们被 PromptComposer 与 TokenContent 共用，
 * 从而消除两处重复的 getBlockTitle/Icon/Description。
 *
 * 任何一项都不参与序列化：序列化只读 data-block。
 */

const RESOURCE_ICON_BY_TYPE = {
  browser: '🌐',
  file: '📎',
  folder: '📎',
  goal: '🎯',
  memory: '🧠',
  plan: '☑️',
  profile: '👤',
  tool: '🛠',
  workspace: '📦',
}

export function getDefaultResourceIcon(type) {
  return RESOURCE_ICON_BY_TYPE[type] || '#'
}

function getResourcePart(block) {
  if (block.type === 'resource') {
    return block.resource || {}
  }

  if (block.type === 'slot' && block.slot?.kind === 'resource') {
    return block.slot.value || {}
  }

  return null
}

function getSlotPart(block) {
  return block.type === 'slot' ? block.slot || {} : null
}

export function getTokenKind(block) {
  if (block.type === 'resource') {
    return 'resource'
  }

  if (block.type === 'slot') {
    return 'slot'
  }

  return block.type || 'token'
}

export function getIcon(block) {
  const resource = getResourcePart(block)
  const slot = getSlotPart(block)

  if (resource && Object.keys(resource).length) {
    return resource.icon || '#'
  }

  if (slot?.kind === 'resource') {
    return slot.value?.icon || '@'
  }

  if (slot) {
    return slot.icon || ':'
  }

  return '#'
}

export function getTitle(block) {
  const resource = getResourcePart(block)
  const slot = getSlotPart(block)

  if (resource && Object.keys(resource).length) {
    return resource.title || resource.id || 'Resource'
  }

  if (slot?.kind === 'resource') {
    return slot.value?.title || slot.placeholder || slot.label || '选择资源'
  }

  if (slot) {
    return slot.value || slot.placeholder || slot.label || '输入内容'
  }

  return 'Token'
}

export function getDescription(block) {
  const resource = getResourcePart(block)
  const slot = getSlotPart(block)

  if (resource && Object.keys(resource).length) {
    return resource.description || resource.type || ''
  }

  if (slot?.kind === 'resource') {
    return slot.value?.description || slot.resourceType || '待选择'
  }

  if (slot) {
    return slot.description || (slot.value ? '可编辑输入' : '待填写')
  }

  return ''
}

/**
 * token 占位的 class 列表。
 *
 * 约定：**语义 class 在前**（composer-chip / composer-token / --kind / --empty），
 * 作为外部覆盖钩子；随后是 Tailwind 默认外观工具类。空槽位分支使用独立的
 * 颜色工具类，避免与常态 `bg-*` 产生 Tailwind 冲突顺序问题。
 */
const CHIP_LAYOUT = 'inline-flex max-w-[min(360px,100%)] min-h-9 items-center mx-0.5 px-3 py-0.5 overflow-hidden align-[0.02em] text-[1.18rem] font-[650] whitespace-nowrap text-ellipsis border rounded-[13px] cursor-pointer'
const CHIP_COLOR_DEFAULT = 'text-[#202124] bg-[#f6f6f6] border-[#e6e6e6]'
const CHIP_COLOR_EMPTY = 'text-[#6f7278] bg-[#fff8ed] border-[#efd7b7]'

export function getTokenClassList(block) {
  const slot = getSlotPart(block)
  const isEmpty = slot && !slot.value

  return [
    'composer-chip',
    'composer-token',
    `composer-token--${getTokenKind(block)}`,
    isEmpty ? 'composer-token--empty' : '',
    CHIP_LAYOUT,
    isEmpty ? CHIP_COLOR_EMPTY : CHIP_COLOR_DEFAULT,
  ].filter(Boolean)
}

export const defaultPresentation = {
  getIcon,
  getTitle,
  getDescription,
  getTokenKind,
  getTokenClassList,
}
