/**
 * Prompt Composer 公开入口。
 *
 * 复制整个 `prompt-composer/` 目录到任意 Vue 3 + Tailwind 项目即可使用：
 *
 *   import { PromptComposer } from './prompt-composer'
 *
 * 主导件是 `PromptComposer`；`TokenContent` 用于消息区/只读回显；
 * `./core` 下是 UI 无关的解析工具，可单独复用。
 */

// 组件
export { default as PromptComposer } from './PromptComposer.vue'
export { default as TokenContent } from './TokenContent.vue'
export { default as ResourcePicker } from './popup/ResourcePicker.vue'
export { default as ResourceList } from './popup/ResourceList.vue'
export { default as ResourceItem } from './popup/ResourceItem.vue'

// 核心解析层（UI 无关）
export * from './core/index.js'
