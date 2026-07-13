/**
 * 模板 & 剪贴板文本协议（UI 无关）。
 *
 * 轻量文本协议，用于 prompt 模板、剪贴板 text/plain、跨模块回填：
 *
 *   [@profile:target]                     -> 资源槽位（未填）
 *   [:用户输入]                           -> 输入槽位（未填）
 *   [:命令=生成测试计划]                  -> 带默认值的输入槽位
 *   [@src/App.vue](resource://file/app)   -> 已确定的资源 token
 */

import { appendTextBlock } from './blocks.js'
import { getDefaultResourceIcon } from './presentation.js'

export function escapeResourceLabel(label = '') {
  return label.replace(/[\\\]]/g, '\\$&')
}

export function unescapeResourceLabel(label = '') {
  return label.replace(/\\(.)/g, '$1')
}

export function resourceToClipboardUrl(resource = {}) {
  const type = encodeURIComponent(resource.type || 'resource')
  const id = encodeURIComponent(resource.id || resource.title || 'unknown')
  return `resource://${type}/${id}`
}

export function resourceFromClipboardUrl(url, title) {
  try {
    const parsedUrl = new URL(url)
    const type = decodeURIComponent(parsedUrl.hostname || 'resource')
    const id = decodeURIComponent(parsedUrl.pathname.replace(/^\//, '') || title)

    return { id, type, title, icon: getDefaultResourceIcon(type) }
  } catch {
    return { id: title, type: 'resource', title, icon: '#' }
  }
}

export function createResourceSlotFromLabel(label = '') {
  const [resourceType = 'resource', ...idParts] = label.split(':')

  return {
    id: label,
    kind: 'resource',
    resourceType,
    label,
    placeholder: `选择 ${resourceType}`,
    value: null,
    options: [],
    target: idParts.join(':') || '',
  }
}

export function createInputSlotFromLabel(label = '') {
  const [slotLabel, ...valueParts] = label.split('=')

  return {
    id: slotLabel,
    kind: 'input',
    label: slotLabel,
    placeholder: slotLabel,
    value: valueParts.join('='),
  }
}

/**
 * Block[] -> 剪贴板/模板文本。
 */
export function blocksToClipboardText(blocks) {
  return blocks
    .map((block) => {
      if (block.type === 'resource') {
        const resource = block.resource || {}
        return `[@${escapeResourceLabel(resource.title || resource.id || 'resource')}](${resourceToClipboardUrl(resource)})`
      }

      if (block.type === 'slot') {
        const slot = block.slot || {}

        if (slot.kind === 'resource') {
          if (slot.value) {
            return `[@${escapeResourceLabel(slot.value.title || slot.value.id || 'resource')}](${resourceToClipboardUrl(slot.value)})`
          }

          return `[@${escapeResourceLabel(slot.id || slot.label || 'resource')}]`
        }

        const label = slot.value ? `${slot.label || '输入内容'}=${slot.value}` : slot.label || '输入内容'
        return `[:${escapeResourceLabel(label)}]`
      }

      return block.text || ''
    })
    .join('')
}

/**
 * 模板/剪贴板文本 -> Block[]。
 */
export function parseTemplateToBlocks(text) {
  const blocks = []
  const resourcePattern = /\[([@:])((?:\\.|[^\]\\])*)\](?:\((resource:\/\/[^)\s]+)\))?/g
  let lastIndex = 0
  let match = resourcePattern.exec(text)

  while (match) {
    appendTextBlock(blocks, text.slice(lastIndex, match.index))
    const sigil = match[1]
    const label = unescapeResourceLabel(match[2])
    const url = match[3]

    if (sigil === '@' && url) {
      blocks.push({ type: 'resource', resource: resourceFromClipboardUrl(url, label) })
    } else if (sigil === '@') {
      blocks.push({ type: 'slot', slot: createResourceSlotFromLabel(label) })
    } else {
      blocks.push({ type: 'slot', slot: createInputSlotFromLabel(label) })
    }

    lastIndex = resourcePattern.lastIndex
    match = resourcePattern.exec(text)
  }

  appendTextBlock(blocks, text.slice(lastIndex))
  return blocks.length ? blocks : [{ type: 'text', text }]
}

/**
 * 用 slotConfig 补充模板里各槽位的元数据（label / placeholder / options...）。
 */
export function applyTemplateSlotConfig(blocks, slotConfig = {}) {
  return blocks.map((block) => {
    if (block.type !== 'slot') {
      return block
    }

    const config = slotConfig[block.slot.id] || slotConfig[block.slot.label]
    return config
      ? { ...block, slot: { ...block.slot, ...config } }
      : block
  })
}

/**
 * 解析模板对象或字符串，得到最终 Block[]。
 * 支持 `{ blocks }`、`{ content, slots }`，或直接传字符串。
 */
export function resolveTemplateBlocks(template, slotConfig = {}) {
  if (template?.blocks?.length) {
    return template.blocks
  }

  const content = template?.content ?? template ?? ''
  const slots = template?.slots ?? slotConfig
  return applyTemplateSlotConfig(parseTemplateToBlocks(content), slots)
}
