/**
 * 指令（Directive）核心 —— 触发符完全数据驱动。
 *
 * 每个触发符（`@`、`/`、`#`、`:` ……）是一条 directive：
 *
 *   interface Directive {
 *     trigger: string              // 单个触发字符
 *     name?: string                // 供调试/事件用的名字
 *     mode?: 'resource' | 'command'// 默认选中行为：插入 chip / 执行命令
 *     providers: Provider[]        // 该触发符的数据源
 *     emptyLabel?: string          // 无关键词时 picker 头部提示
 *     noResultsLabel?: string      // 无结果提示
 *     onSelect?: (item, ctx) => void | boolean
 *       // 自定义选中行为。返回 false 表示「阻止默认行为」，
 *       // 其它返回值则在自定义逻辑后仍执行默认行为。
 *   }
 *
 * 编辑器核心不再出现 `=== '/'` 之类的分支：触发检测、picker 数据源、
 * 选中行为全部通过查 directive 得到。`atProviders` / `slashProviders`
 * 作为语法糖，未显式传 `directives` 时自动合成默认的 `@` / `/` 两条。
 */

const DEFAULT_LABELS = {
  '@': { name: 'resource', mode: 'resource', emptyLabel: '添加', noResultsLabel: 'No resources found' },
  '/': { name: 'command', mode: 'command', emptyLabel: '命令', noResultsLabel: 'No commands found' },
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 把 props（directives + atProviders + slashProviders）归一化成 Directive[]。
 * 若显式传了 directives，则以它为准；否则用 at/slash providers 合成默认两条。
 */
export function normalizeDirectives({ directives, atProviders, slashProviders } = {}) {
  const source = Array.isArray(directives) && directives.length
    ? directives
    : [
        { trigger: '@', providers: atProviders || [] },
        { trigger: '/', providers: slashProviders || [] },
      ]

  return source
    .filter((directive) => directive && directive.trigger)
    .map((directive) => {
      const defaults = DEFAULT_LABELS[directive.trigger] || {
        name: `directive:${directive.trigger}`,
        mode: 'resource',
        emptyLabel: '添加',
        noResultsLabel: 'No results found',
      }

      return {
        name: directive.name || defaults.name,
        mode: directive.mode || defaults.mode,
        emptyLabel: directive.emptyLabel || defaults.emptyLabel,
        noResultsLabel: directive.noResultsLabel || defaults.noResultsLabel,
        onSelect: directive.onSelect || null,
        ...directive,
        providers: directive.providers || [],
      }
    })
}

export function findDirective(directives, trigger) {
  return directives.find((directive) => directive.trigger === trigger) || null
}

/**
 * 定位「文本偏移量」对应的 DOM 位置（text 节点 + 该节点内 offset）。
 * 用于把纯文本里匹配到的触发符位置映射回 DOM Range。
 */
export function getTextPositionAtOffset(root, targetOffset) {
  let currentOffset = 0
  let fallback = null

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const textLength = node.textContent?.length || 0
      fallback = { node, offset: textLength }

      if (currentOffset + textLength >= targetOffset) {
        return { node, offset: Math.max(0, targetOffset - currentOffset) }
      }

      currentOffset += textLength
      return null
    }

    if (node.nodeName === 'BR') {
      if (currentOffset === targetOffset) {
        return fallback
      }

      currentOffset += 1
      return null
    }

    for (const child of node.childNodes) {
      const position = walk(child)

      if (position) {
        return position
      }
    }

    return null
  }

  return walk(root)
}

/**
 * 在光标处检测是否正处于某个触发符的输入中。
 * 触发字符集由 directives 决定，因此新增 `#` 等触发符无需改动核心。
 *
 * 返回 `{ directive, trigger, keyword, range }` 或 null。
 * `range` 覆盖触发符本身那一个字符，用于后续替换/删除。
 */
export function detectTriggerAtCaret(editor, directives) {
  const selection = typeof window !== 'undefined' ? window.getSelection() : null

  if (!editor || !selection || !selection.rangeCount || !directives.length) {
    return null
  }

  const currentRange = selection.getRangeAt(0)

  if (!editor.contains(currentRange.endContainer)) {
    return null
  }

  const beforeRange = document.createRange()
  beforeRange.setStart(editor, 0)
  beforeRange.setEnd(currentRange.endContainer, currentRange.endOffset)

  const beforeCaret = beforeRange.toString()
  const triggerChars = directives.map((directive) => escapeRegExp(directive.trigger)).join('')
  const tokenPattern = new RegExp(`(?:^|[\\s\\u00a0])([${triggerChars}][^\\s\\u00a0]*)$`)
  const tokenMatch = beforeCaret.match(tokenPattern)

  if (!tokenMatch) {
    return null
  }

  const trigger = tokenMatch[1][0]
  const directive = findDirective(directives, trigger)

  if (!directive) {
    return null
  }

  const tokenStart = beforeCaret.length - tokenMatch[1].length
  const tokenPosition = getTextPositionAtOffset(editor, tokenStart)

  if (!tokenPosition) {
    return null
  }

  const tokenNodeLength = tokenPosition.node.textContent?.length || 0

  if (tokenPosition.offset >= tokenNodeLength) {
    return null
  }

  const range = document.createRange()
  range.setStart(tokenPosition.node, tokenPosition.offset)
  range.setEnd(tokenPosition.node, tokenPosition.offset + 1)

  return {
    directive,
    trigger,
    keyword: tokenMatch[1].slice(1),
    range,
  }
}
