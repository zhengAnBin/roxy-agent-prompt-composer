/**
 * Block 模型（UI 无关）。
 *
 * Prompt Composer 的内容用结构化 `Block[]` 表达，而不是单一字符串：
 *
 *   type Block = TextBlock | ResourceBlock | SlotBlock
 *
 * 这个模块只关心「Block 与 DOM / 纯文本之间的相互转换」，不依赖 Vue，
 * 因此可以被 PromptComposer、TokenContent 以及任意上层复用。
 */

const NBSP = / /g

export function normalizeWhitespace(text = '') {
  return text.replace(NBSP, ' ')
}

/**
 * 把一段文本合并进 blocks，若上一个 block 也是 text 则拼接，避免碎片化。
 */
export function appendTextBlock(blocks, text) {
  if (!text) {
    return
  }

  const normalizedText = normalizeWhitespace(text)
  const previousBlock = blocks[blocks.length - 1]

  if (previousBlock?.type === 'text') {
    previousBlock.text += normalizedText
    return
  }

  blocks.push({ type: 'text', text: normalizedText })
}

/**
 * 去掉首尾纯空白的 text block（提交前清理）。
 */
export function trimEditorBlocks(blocks) {
  const nextBlocks = blocks.map((block) => ({ ...block }))

  while (nextBlocks[0]?.type === 'text') {
    nextBlocks[0].text = nextBlocks[0].text.replace(/^\s+/, '')

    if (nextBlocks[0].text) {
      break
    }

    nextBlocks.shift()
  }

  while (nextBlocks[nextBlocks.length - 1]?.type === 'text') {
    const lastBlock = nextBlocks[nextBlocks.length - 1]
    lastBlock.text = lastBlock.text.replace(/\s+$/, '')

    if (lastBlock.text) {
      break
    }

    nextBlocks.pop()
  }

  return nextBlocks
}

/**
 * 判断一个 DOM 节点是不是 token 占位（chip）。
 */
export function isTokenElement(node) {
  return Boolean(
    node?.nodeType === Node.ELEMENT_NODE
    && (node.classList?.contains('composer-token') || node.classList?.contains('composer-chip')),
  )
}

/**
 * 从 token 占位元素反序列化出它承载的 Block。
 * 数据来源是 `data-block`（完整 JSON），这保证「渲染 UI」与「数据」彻底解耦：
 * 无论 chip 用什么自定义组件渲染，序列化只读 data-block。
 */
export function getBlockFromTokenElement(element) {
  if (element?.dataset?.block) {
    try {
      return JSON.parse(element.dataset.block)
    } catch {
      // fall through
    }
  }

  if (element?.dataset?.resource) {
    try {
      return { type: 'resource', resource: JSON.parse(element.dataset.resource) }
    } catch {
      // fall through
    }
  }

  return null
}

/**
 * 深度遍历 DOM 节点，序列化成 Block[]。
 * text 节点 -> text block；<br> -> 换行；token 占位 -> 其承载的 block。
 */
export function serializeNodesToBlocks(nodes, { trim = false } = {}) {
  const blocks = []

  function visit(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      appendTextBlock(blocks, node.textContent || '')
      return
    }

    if (node.nodeName === 'BR') {
      appendTextBlock(blocks, '\n')
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return
    }

    if (isTokenElement(node)) {
      const tokenBlock = getBlockFromTokenElement(node)

      if (tokenBlock) {
        blocks.push(tokenBlock)
      }

      return
    }

    node.childNodes.forEach(visit)
  }

  nodes.forEach(visit)
  return trim ? trimEditorBlocks(blocks) : blocks
}

/**
 * 把 Block[] 拍平成纯文本（提交载荷里的 `text`）。
 * 语义与模板协议对齐：
 * - text                 -> 原文
 * - resource             -> `icon title`
 * - 已填资源槽位          -> `icon title`
 * - 未填资源槽位          -> `[label]`
 * - 已填输入槽位          -> 原始 value（无前缀）
 * - 未填输入槽位          -> `[label]`
 */
export function blocksToPlainText(blocks, presentation = {}) {
  const iconOf = presentation.getIcon || (() => '#')
  const titleOf = presentation.getTitle || (() => '')

  return blocks
    .map((block) => {
      if (block.type === 'text') {
        return block.text || ''
      }

      if (block.type === 'slot') {
        const slot = block.slot || {}

        if (slot.kind === 'resource') {
          return slot.value
            ? `${slot.value.icon || '#'} ${slot.value.title || ''}`
            : `[${slot.label || slot.id || '选择资源'}]`
        }

        return slot.value || `[${slot.label || '输入内容'}]`
      }

      return `${iconOf(block)} ${titleOf(block)}`
    })
    .join('')
    .replace(NBSP, ' ')
    .trim()
}

/**
 * 从 Block[] 中挑出全部 resource / slot，便于提交时拆分。
 */
export function collectResources(blocks) {
  return blocks
    .filter((block) => block.type === 'resource')
    .map((block) => block.resource)
}

export function collectSlots(blocks) {
  return blocks
    .filter((block) => block.type === 'slot')
    .map((block) => block.slot)
}
