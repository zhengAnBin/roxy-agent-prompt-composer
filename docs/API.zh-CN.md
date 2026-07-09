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

`atProviders` 驱动 `@` 资源菜单。组件只负责打开菜单、传入 keyword、插入返回资源。

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

## `<PromptComposer />`

主输入框组件。

### Props

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `atProviders` | `AtProvider[]` | `[]` | `@` 菜单的数据源。Vue 模板中写作 `at-providers`。 |
| `slashProviders` | `SlashProvider[]` | `[]` | `/` 命令菜单的数据源。Vue 模板中写作 `slash-providers`。 |
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
import PromptComposer from './components/PromptComposer.vue'
import TokenContent from './components/TokenContent.vue'

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
