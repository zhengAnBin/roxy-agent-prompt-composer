# Prompt Composer API

本文档描述当前 Prompt Composer 的公开 API、数据结构和扩展点。

## 核心概念

Prompt Composer 使用结构化 `Block[]` 作为内容模型。文本、资源、模板槽位都被表达成 block，而不是只保存一段字符串。

```ts
type Block =
  | TextBlock
  | ResourceBlock
  | SlotBlock

interface TextBlock {
  type: 'text'
  text: string
}

interface ResourceBlock {
  type: 'resource'
  resource: Resource
}

interface SlotBlock {
  type: 'slot'
  slot: PromptSlot
}
```

## Resource

`Resource` 是 `@` 菜单、资源 token、资源槽位共同使用的数据结构。

```ts
interface Resource {
  id: string
  type: string
  title: string
  description?: string
  icon?: string
  group?: string
  keywords?: string[]
  action?: string
  payload?: unknown
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `id` | 资源唯一 ID。 |
| `type` | 资源类型，如 `file`、`profile`、`tool`。 |
| `title` | 显示名称。 |
| `description` | tooltip、popup 或资源菜单里的描述。 |
| `icon` | token 和菜单中显示的 emoji/字符图标。 |
| `group` | Resource Picker 中的分组名。 |
| `keywords` | 本地搜索辅助关键词。 |
| `action` | 动作型资源标记。当前内置 `file-picker`。 |
| `payload` | 业务侧自定义数据，组件不解析。 |

## PromptSlot

槽位用于 prompt 模板里需要用户补全的部分。

```ts
type PromptSlot = ResourceSlot | InputSlot

interface ResourceSlot {
  id: string
  kind: 'resource'
  label?: string
  placeholder?: string
  resourceType?: string
  target?: string
  value?: Resource | null
  options?: Resource[]
}

interface InputSlot {
  id: string
  kind: 'input'
  label?: string
  placeholder?: string
  value?: string
  description?: string
}
```

资源槽位会在 popup 里显示 `options` 供用户选择；输入槽位会显示一个输入框，用户填写后写回 `slot.value`。

## 模板语法

组件支持一种轻量文本协议，用于模板、剪贴板和跨模块回填。

```md
请选择 [@profile:target] 窗口，然后执行 [:用户输入]
```

语法：

| 写法 | 含义 |
| --- | --- |
| `[@profile:target]` | 一个资源槽位。`profile` 是资源类型，`target` 是目标名。 |
| `[:用户输入]` | 一个文本输入槽位。 |
| `[:命令=生成测试计划]` | 一个带默认值的输入槽位。 |
| `[@src/App.vue](resource://file/app-vue)` | 一个已确定的资源 token。 |

模板可以通过 `slots` 配置补充槽位元数据：

```js
const template = {
  content: '请选择 [@profile:target] 窗口，然后执行 [:用户输入]',
  slots: {
    'profile:target': {
      label: 'Profile 窗口',
      placeholder: '选择 Profile',
      options: [
        { id: 'profile-frontend', type: 'profile', title: 'Frontend Reviewer', icon: '👤' },
      ],
    },
    用户输入: {
      placeholder: '输入要执行的操作',
    },
  },
}
```

## At Provider

`atProviders` 驱动 `@` 资源菜单。组件只负责打开菜单、传入 keyword、插入返回资源。它是 `directives` 的语法糖：未显式传 `directives` 时，`atProviders` 会被合成为默认的 `@` 指令。

```ts
interface AtProvider {
  name: string
  group?: string
  search(keyword: string): Resource[] | Promise<Resource[]>
}
```

示例：

```js
const atProviders = [
  {
    name: 'Files',
    async search(keyword) {
      const files = [
        { id: 'app-vue', type: 'file', title: 'src/App.vue', icon: '📎' },
      ]

      if (!keyword) return files
      return files.filter((file) => file.title.toLowerCase().includes(keyword))
    },
  },
]
```

## Slash Provider

`slashProviders` 驱动 `/` 命令菜单。它复用 provider 契约，因此每个 command 也是一个 `Resource` 形状的对象，但选择后的行为不同：命令不会插入 resource chip，而是移除 `/keyword` 并触发 `command-select`。

```ts
interface SlashProvider {
  name: string
  group?: string
  search(keyword: string): Command[] | Promise<Command[]>
}

interface Command extends Resource {
  template?: string | { content: string; slots?: Record<string, Partial<PromptSlot>> }
  insertText?: string
}
```

命令行为：

| 字段 | 行为 |
| --- | --- |
| `template` | 选择命令后调用 `setTemplate(template)`。 |
| `insertText` | 选择命令后解析为模板文本并插入当前光标位置。 |
| 无额外字段 | 只触发 `command-select`，由外部处理。 |

示例：

```js
const slashProviders = [
  {
    name: 'Slash commands',
    async search(keyword) {
      const commands = [
        { id: 'model', type: 'command', title: '模型', description: 'GPT-5.5', icon: '⬡' },
        { id: 'goal', type: 'command', title: '目标', insertText: '设置目标：[:目标内容]', icon: '◎' },
      ]

      return commands.filter((command) => {
        const text = `${command.title} ${command.description || ''}`.toLowerCase()
        return !keyword || text.includes(keyword)
      })
    },
  },
]
```

## Directives（通用触发符）

`@` 和 `/` 不是写死的，它们只是 `directives` 数组里的两条默认指令。你可以任意增删触发符（`#`、`:` 等），核心解析层按 `directives` 动态识别，无需改动组件代码。

```ts
interface Directive {
  trigger: string                 // 单个触发字符，如 '@' '/' '#'
  name?: string                   // 供调试/事件使用的名字
  mode?: 'resource' | 'command'   // 默认选中行为：插入 chip / 执行命令
  providers: Provider[]           // 该触发符的数据源（同 Provider 契约）
  emptyLabel?: string             // 无关键词时 picker 头部提示
  noResultsLabel?: string         // 无结果提示
  onSelect?: (item, ctx) => void | boolean
  // 自定义选中行为。返回 false = 阻止默认行为（仍会清理触发符、关闭菜单）；
  // 其它返回值则在自定义逻辑后继续走 mode 对应的默认行为。
  // ctx = { directive, trigger, keyword, surface: 'editor' }
}
```

示例（三个触发符）：

```js
const directives = [
  { trigger: '@', providers: atProviders },                          // 资源，默认插入 chip
  { trigger: '/', providers: slashProviders },                       // 命令，默认执行命令
  { trigger: '#', name: 'tag', mode: 'resource', providers: tagProviders }, // 自定义标签
]
```

```vue
<PromptComposer :directives="directives" @submit="onSubmit" />
```

**兼容性**：`atProviders` / `slashProviders` 继续可用。未传 `directives` 时，组件用它们合成默认的 `@`（resource）与 `/`（command）两条指令，旧代码零改动。

## 回显自定义（Slots）

组件遵循「核心解析 + UI 高度可定制」：token 回显和 picker 列表项都通过作用域插槽完全接管，序列化只读 `data-block`，因此自定义 UI **不影响数据模型**。

| 插槽 | 作用域参数 | 说明 |
| --- | --- | --- |
| `#chip` | `{ block, surface }` | 自定义编辑区里每个 token 的回显。内部用 `contenteditable=false` 原子占位 + `Teleport` 把插槽挂进去，光标 / 选区 / 序列化不受影响。不提供时回退到内置「icon title」。 |
| `#picker-item` | `{ item, active, directive }` | 自定义 `@` / `/` / 任意触发符的菜单列表项。不提供时回退到内置 `ResourceItem`。 |
| `#toolbar-start` / `#toolbar-end` | 无 | 覆盖底部工具栏左 / 右两侧（默认是「+ 添加」「访问权限」与「模型 / 发送」按钮）。 |

`<TokenContent />` 同样提供 `#chip` 插槽（作用域参数 `{ block, surface: 'message', context }`），保证编辑区与消息区回显一致。

示例（按资源类型定制 chip + 自定义 picker item）：

```vue
<PromptComposer :directives="directives">
  <template #chip="{ block }">
    <span :class="`chip chip--${block.resource?.type || block.slot?.kind}`">
      {{ block.resource?.icon }} {{ block.resource?.title }}
    </span>
  </template>
  <template #picker-item="{ item, active, directive }">
    <div :class="{ active }">
      <img v-if="item.avatar" :src="item.avatar">
      <span>{{ item.title }}</span>
      <small>{{ directive.trigger }} · {{ item.type }}</small>
    </div>
  </template>
</PromptComposer>
```

## 样式与移植

组件用 **Tailwind CSS v4** 编写，样式全部是模板里的内联工具类，**不依赖任何 `.css` 文件**。因此把整个 `src/prompt-composer/` 目录复制到任意 Vue 3 + Tailwind v4 项目即可直接使用。

- **前置条件**：宿主项目已安装并启用 Tailwind v4（`@import "tailwindcss"` + 扫描到该目录）。
- **语义 class 钩子**：每个元素在工具类之外都保留了语义 class（如 `composer-chip`、`prompt-composer__editor`、`resource-item`、`composer-token--empty`），可用它们从外部覆盖样式：

  ```css
  /* 覆盖 chip 外观 */
  .composer-chip { border-radius: 6px; background: #eef; }
  /* 只改空槽位 */
  .composer-token--empty { background: #fff0f0; }
  ```

- **完全接管**：若想彻底替换回显，用 `#chip` / `#picker-item` 插槽，语义 class 依然在外层元素上，两种方式可叠加。

## 核心解析层

所有 UI 无关的解析逻辑抽在 `src/prompt-composer/core/`，可脱离组件单独复用（如在服务端或测试中解析模板）：

```js
import {
  parseTemplateToBlocks,   // 模板/剪贴板文本 -> Block[]
  blocksToClipboardText,   // Block[] -> 模板文本
  blocksToPlainText,       // Block[] -> 纯文本
  serializeNodesToBlocks,  // DOM 节点 -> Block[]
  normalizeDirectives,     // props -> Directive[]
  detectTriggerAtCaret,    // 光标处触发符检测
  defaultPresentation,     // 默认 icon/title/description
} from './prompt-composer'
```

## `<PromptComposer />`

主输入框组件。

### Props

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `directives` | `Directive[]` | `null` | 通用触发符数组。传入后完全接管触发符行为；不传则由 `atProviders`/`slashProviders` 合成默认 `@`/`/`。见 [Directives](#directives通用触发符)。 |
| `atProviders` | `AtProvider[]` | `[]` | `@` 菜单的数据源（`directives` 的语法糖）。Vue 模板中写作 `at-providers`。 |
| `slashProviders` | `SlashProvider[]` | `[]` | `/` 命令菜单的数据源（`directives` 的语法糖）。Vue 模板中写作 `slash-providers`。 |
| `tokenActions` | `TokenAction[] \| (block, context) => TokenAction[]` | `[]` | token popup 菜单项。 |
| `placeholder` | `string` | `'Ask Codex to code, explain, or inspect...'` | 输入框 placeholder。 |
| `running` | `boolean` | `false` | 为 `true` 时右下角显示停止按钮。 |

### Events

| Event | Payload | 说明 |
| --- | --- | --- |
| `submit` | `SubmitPayload` | 用户发送时触发。 |
| `stop` | 无 | `running=true` 时点击停止按钮触发。 |
| `resource-select` | `Resource` | 从 `@` 菜单选择资源并插入后触发。 |
| `command-select` | `Command` | 从 `/` 菜单选择命令后触发。 |
| `token-hover` | `{ block, surface: 'editor' }` | 鼠标 hover 编辑区 token。 |
| `token-click` | `{ block, surface: 'editor' }` | 点击编辑区 token。 |
| `token-action` | `{ action, block, surface: 'editor' }` | 点击编辑区 token popup 菜单项。 |
| `token-update` | `{ block, surface: 'editor' }` | 槽位值被编辑后触发。 |

`SubmitPayload`：

```ts
interface SubmitPayload {
  text: string
  blocks: Block[]
  resources: Resource[]
  slots: PromptSlot[]
  attachments: Attachment[]
}
```

`Attachment`：

```ts
interface Attachment {
  id: string
  name: string
  kind: string
  file: File | { name: string; kind: 'folder'; type: 'folder' }
  icon: unknown
}
```

### Exposed Methods

通过 `ref` 调用：

```vue
<PromptComposer ref="composerRef" />
```

| 方法 | 说明 |
| --- | --- |
| `setContent(payload)` | 用 `{ text?, blocks?, attachments? }` 回填输入框。 |
| `setTemplate(template)` | 解析并回填模板。支持 `{ content, slots, attachments }` 或直接传字符串。 |
| `parseTemplate(content, slotConfig?)` | 把模板字符串解析为 `Block[]`。 |
| `insertBlocks(blocks)` | 在当前光标位置插入 `Block[]`。 |
| `focus()` | 聚焦编辑区。 |
| `openPicker()` | 若光标正处于触发符输入中，打开对应菜单。 |

示例：

```js
composerRef.value.setTemplate({
  content: '请选择 [@profile:target] 窗口，然后执行 [:用户输入]',
  slots: {
    'profile:target': {
      label: 'Profile 窗口',
      options: profileOptions,
    },
  },
})
```

## `<TokenContent />`

消息区或只读场景使用的 token 渲染组件。它复用同一套 `Block[]` 数据结构，并提供 hover tooltip 和 click popup。

### Props

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `blocks` | `Block[]` | `[]` | 要渲染的结构化内容。 |
| `context` | `object` | `{}` | 原样透传给事件和 `tokenActions`。 |
| `tokenActions` | `TokenAction[] \| (block, context) => TokenAction[]` | `[]` | popup 菜单项。 |

### Events

| Event | Payload |
| --- | --- |
| `token-hover` | `{ block, context }` |
| `token-click` | `{ block, context }` |
| `token-action` | `{ action, block, context }` |

## TokenAction

```ts
interface TokenAction {
  id: string
  label: string
  icon?: string
  payload?: unknown
}
```

示例：

```js
function getTokenActions(block, context) {
  if (context.surface === 'message') {
    return [
      { id: 'refill-message', label: '回填整条消息', icon: '↩' },
      { id: 'refill-token', label: '只回填这个项', icon: '+' },
    ]
  }

  return [{ id: 'inspect-token', label: '查看数据', icon: 'i' }]
}
```

## 剪贴板协议

复制/剪切时，组件会写入两份剪贴板内容：

| MIME | 内容 |
| --- | --- |
| `text/plain` | 轻量模板协议，例如 `请检查 [@src/App.vue](resource://file/app-vue)`。 |
| `application/x-prompt-composer-blocks` | 完整 `Block[]` JSON，用于同应用内高保真恢复。 |

粘贴时优先读取完整 JSON；没有时解析 `text/plain`。

## 最小示例

```vue
<script setup>
import { ref } from 'vue'
import { PromptComposer } from './prompt-composer'
import { TokenContent } from './prompt-composer'

const composerRef = ref(null)
const messages = ref([])

const atProviders = [
  {
    name: 'Files',
    async search(keyword) {
      return [
        { id: 'app-vue', type: 'file', title: 'src/App.vue', icon: '📎' },
      ].filter((item) => !keyword || item.title.toLowerCase().includes(keyword))
    },
  },
]

function handleSubmit(payload) {
  messages.value.unshift(payload)
}
</script>

<template>
  <TokenContent
    v-for="message in messages"
    :key="message.text"
    :blocks="message.blocks"
  />

  <PromptComposer
    ref="composerRef"
    :at-providers="atProviders"
    @submit="handleSubmit"
  />
</template>
```
