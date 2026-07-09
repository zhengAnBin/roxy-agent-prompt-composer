# Prompt Composer API

This document describes the public API, data model, and extension points of the current Prompt Composer.

## Core Model

Prompt Composer stores content as structured `Block[]`. Plain text, resources, and editable template slots are all represented as blocks instead of a single string.

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

`Resource` is shared by the `@` picker, resource tokens, and resource slots.

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

Fields:

| Field | Description |
| --- | --- |
| `id` | Unique resource id. |
| `type` | Resource type, such as `file`, `profile`, or `tool`. |
| `title` | Display label. |
| `description` | Description shown in tooltips, popups, or picker rows. |
| `icon` | Emoji or character icon shown in tokens and picker rows. |
| `group` | Group name in the Resource Picker. |
| `keywords` | Extra local search terms. |
| `action` | Action resource marker. Built-in support: `file-picker`. |
| `payload` | App-owned data. The component does not inspect it. |

## PromptSlot

Slots represent parts of a prompt template that the user must fill in.

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

Resource slots show their `options` in a popup. Input slots show a text input and write the result back to `slot.value`.

## Template Syntax

The component supports a lightweight text protocol for templates, clipboard content, and cross-module refill.

```md
Choose [@profile:target] window, then run [:user input]
```

Syntax:

| Syntax | Meaning |
| --- | --- |
| `[@profile:target]` | A resource slot. `profile` is the resource type; `target` is the target name. |
| `[:user input]` | A text input slot. |
| `[:command=Generate a test plan]` | An input slot with a default value. |
| `[@src/App.vue](resource://file/app-vue)` | A resolved resource token. |

Templates can provide slot metadata through `slots`:

```js
const template = {
  content: 'Choose [@profile:target] window, then run [:user input]',
  slots: {
    'profile:target': {
      label: 'Profile window',
      placeholder: 'Choose profile',
      options: [
        { id: 'profile-frontend', type: 'profile', title: 'Frontend Reviewer', icon: '👤' },
      ],
    },
    'user input': {
      placeholder: 'Enter the command to run',
    },
  },
}
```

## Resource Provider

`providers` power the `@` Resource Picker. The composer only opens the picker, passes the keyword, and inserts the returned resource.

```ts
interface ResourceProvider {
  name: string
  group?: string
  search(keyword: string): Resource[] | Promise<Resource[]>
}
```

Example:

```js
const providers = [
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

## `<PromptComposer />`

The main editor component.

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `providers` | `ResourceProvider[]` | `[]` | Data sources for the `@` picker. |
| `tokenActions` | `TokenAction[] \| (block, context) => TokenAction[]` | `[]` | Popup menu items for tokens. |
| `placeholder` | `string` | `'Ask Codex to code, explain, or inspect...'` | Editor placeholder. |
| `running` | `boolean` | `false` | When `true`, the lower-right button becomes a stop button. |

### Events

| Event | Payload | Description |
| --- | --- | --- |
| `submit` | `SubmitPayload` | Emitted when the user sends the prompt. |
| `stop` | none | Emitted when the stop button is clicked while `running=true`. |
| `resource-select` | `Resource` | Emitted after a resource is selected from the `@` picker and inserted. |
| `token-hover` | `{ block, surface: 'editor' }` | Hover over a token in the editor. |
| `token-click` | `{ block, surface: 'editor' }` | Click a token in the editor. |
| `token-action` | `{ action, block, surface: 'editor' }` | Click an item in an editor token popup. |
| `token-update` | `{ block, surface: 'editor' }` | A slot value was edited. |

`SubmitPayload`:

```ts
interface SubmitPayload {
  text: string
  blocks: Block[]
  resources: Resource[]
  slots: PromptSlot[]
  attachments: Attachment[]
}
```

`Attachment`:

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

Use a Vue ref:

```vue
<PromptComposer ref="composerRef" />
```

| Method | Description |
| --- | --- |
| `setContent(payload)` | Refill the editor with `{ text?, blocks?, attachments? }`. |
| `setTemplate(template)` | Parse and refill a template. Accepts `{ content, slots, attachments }` or a string. |
| `parseTemplate(content, slotConfig?)` | Parse a template string into `Block[]`. |
| `insertBlocks(blocks)` | Insert `Block[]` at the current caret position. |

Example:

```js
composerRef.value.setTemplate({
  content: 'Choose [@profile:target] window, then run [:user input]',
  slots: {
    'profile:target': {
      label: 'Profile window',
      options: profileOptions,
    },
  },
})
```

## `<TokenContent />`

Renderer for message or read-only surfaces. It uses the same `Block[]` model and provides token hover tooltips plus click popups.

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `blocks` | `Block[]` | `[]` | Structured content to render. |
| `context` | `object` | `{}` | Passed through to events and `tokenActions`. |
| `tokenActions` | `TokenAction[] \| (block, context) => TokenAction[]` | `[]` | Popup menu items. |

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

Example:

```js
function getTokenActions(block, context) {
  if (context.surface === 'message') {
    return [
      { id: 'refill-message', label: 'Refill message', icon: '↩' },
      { id: 'refill-token', label: 'Refill this token', icon: '+' },
    ]
  }

  return [{ id: 'inspect-token', label: 'Inspect data', icon: 'i' }]
}
```

## Clipboard Protocol

On copy/cut, the component writes two clipboard formats:

| MIME | Content |
| --- | --- |
| `text/plain` | Lightweight template protocol, for example `Check [@src/App.vue](resource://file/app-vue)`. |
| `application/x-prompt-composer-blocks` | Full `Block[]` JSON for high-fidelity same-app restore. |

On paste, the component first tries the full JSON payload. If it is unavailable, it parses `text/plain`.

## Minimal Example

```vue
<script setup>
import { ref } from 'vue'
import PromptComposer from './components/PromptComposer.vue'
import TokenContent from './components/TokenContent.vue'

const composerRef = ref(null)
const messages = ref([])

const providers = [
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
    :providers="providers"
    @submit="handleSubmit"
  />
</template>
```
