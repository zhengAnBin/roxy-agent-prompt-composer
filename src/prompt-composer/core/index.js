/**
 * 核心解析层 barrel —— UI 无关，可脱离组件单独复用（服务端、测试、其它框架）。
 */

// Block 模型
export {
  appendTextBlock,
  blocksToPlainText,
  collectResources,
  collectSlots,
  getBlockFromTokenElement,
  isTokenElement,
  normalizeWhitespace,
  serializeNodesToBlocks,
  trimEditorBlocks,
} from './blocks.js'

// 模板 & 剪贴板协议
export {
  applyTemplateSlotConfig,
  blocksToClipboardText,
  createInputSlotFromLabel,
  createResourceSlotFromLabel,
  parseTemplateToBlocks,
  resolveTemplateBlocks,
  resourceFromClipboardUrl,
  resourceToClipboardUrl,
} from './template.js'

// 指令模型
export {
  detectTriggerAtCaret,
  findDirective,
  getTextPositionAtOffset,
  normalizeDirectives,
} from './directives.js'

// 默认呈现
export {
  defaultPresentation,
  getDefaultResourceIcon,
  getDescription,
  getIcon,
  getTitle,
  getTokenClassList,
  getTokenKind,
} from './presentation.js'
