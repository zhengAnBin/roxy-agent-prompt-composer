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

## At Provider

`atProviders` power the `@` Resource Picker. The composer only opens the picker, passes the keyword, and inserts the returned resource. It is sugar over `directives`: when `directives` is omitted, `atProviders` is synthesized into the default `@` directive.

```ts
interface AtProvider {
  name: string
  group?: string
  search(keyword: string): Resource[] | Promise<Resource[]>
}
```

Example:

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

`slashProviders` power the `/` command menu. It reuses the same provider contract, so each command is also shaped like a `Resource`. Selection behaves differently from `@`: the command removes `/keyword`, does not insert a resource chip, and emits `command-select`.

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

Command behavior:

| Field | Behavior |
| --- | --- |
| `template` | Calls `setTemplate(template)` after selection. |
| `insertText` | Parses the string as template text and inserts it at the caret. |
| no extra field | Only emits `command-select`; the host app handles the action. |

Example:

```js
const slashProviders = [
  {
    name: 'Slash commands',
    async search(keyword) {
      const commands = [
        { id: 'model', type: 'command', title: 'Model', description: 'GPT-5.5', icon: '⬡' },
        { id: 'goal', type: 'command', title: 'Goal', insertText: 'Set goal: [:goal]', icon: '◎' },
      ]

      return commands.filter((command) => {
        const text = `${command.title} ${command.description || ''}`.toLowerCase()
        return !keyword || text.includes(keyword)
      })
    },
  },
]
```

## Directives (generic triggers)

`@` and `/` are not hardcoded — they are just two default entries in the `directives` array. You can add or remove triggers (`#`, `:`, ...) freely; the core parses them dynamically from `directives`, with no changes to the component.

```ts
interface Directive {
  trigger: string                 // single trigger char, e.g. '@' '/' '#'
  name?: string                   // name for debugging/events
  mode?: 'resource' | 'command'   // default select behavior: insert chip / run command
  providers: Provider[]           // data sources (same Provider contract)
  emptyLabel?: string             // picker header hint with no keyword
  noResultsLabel?: string         // empty-results hint
  onSelect?: (item, ctx) => void | boolean
  // Custom select behavior. Return false = prevent the default behavior
  // (the trigger is still cleaned up and the menu closed); any other return
  // value runs your logic and then still applies the mode default.
  // ctx = { directive, trigger, keyword, surface: 'editor' }
}
```

Example (three triggers):

```js
const directives = [
  { trigger: '@', providers: atProviders },
  { trigger: '/', providers: slashProviders },
  { trigger: '#', name: 'tag', mode: 'resource', providers: tagProviders },
]
```

```vue
<PromptComposer :directives="directives" @submit="onSubmit" />
```

**Compatibility:** `atProviders` / `slashProviders` still work. When `directives` is omitted, they are synthesized into the default `@` (resource) and `/` (command) directives, so existing code needs no changes.

## Customizing the echo (Slots)

The component follows "core parsing + fully customizable UI": both token echoes and picker rows can be fully overridden via scoped slots. Serialization only reads `data-block`, so custom UI never affects the data model.

| Slot | Scope | Description |
| --- | --- | --- |
| `#chip` | `{ block, surface }` | Custom rendering for each token in the editor. Internally uses a `contenteditable=false` atomic placeholder + `Teleport`, so caret / selection / serialization are unaffected. Falls back to the built-in "icon title". |
| `#picker-item` | `{ item, active, directive }` | Custom rows for the `@` / `/` / any-trigger menu. Falls back to the built-in `ResourceItem`. |
| `#toolbar-start` / `#toolbar-end` | none | Override the left / right sides of the bottom toolbar. |

`<TokenContent />` also exposes a `#chip` slot (`{ block, surface: 'message', context }`) so the editor and message surfaces stay consistent.

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

## Styling & portability

The component is written with **Tailwind CSS v4**; all styles are inline utility classes in the templates, with **no `.css` file dependency**. Copy the whole `src/prompt-composer/` directory into any Vue 3 + Tailwind v4 project and it just works.

- **Prerequisite:** the host project has Tailwind v4 installed and enabled (`@import "tailwindcss"`, with this directory in its content scan).
- **Semantic class hooks:** every element keeps a semantic class alongside its utilities (e.g. `composer-chip`, `prompt-composer__editor`, `resource-item`, `composer-token--empty`), so you can override from the outside:

  ```css
  /* override chip appearance */
  .composer-chip { border-radius: 6px; background: #eef; }
  /* only empty slots */
  .composer-token--empty { background: #fff0f0; }
  ```

- **Full takeover:** to replace the echo entirely, use the `#chip` / `#picker-item` slots. The semantic classes remain on the wrapper element, so both approaches compose.

## Core parsing layer

All UI-agnostic parsing lives in `src/prompt-composer/core/` and can be reused standalone (e.g. on the server or in tests):

```js
import {
  parseTemplateToBlocks,   // template/clipboard text -> Block[]
  blocksToClipboardText,   // Block[] -> template text
  blocksToPlainText,       // Block[] -> plain text
  serializeNodesToBlocks,  // DOM nodes -> Block[]
  normalizeDirectives,     // props -> Directive[]
  detectTriggerAtCaret,    // trigger detection at caret
  defaultPresentation,     // default icon/title/description
} from './prompt-composer'
```

## `<PromptComposer />`

The main editor component.

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `directives` | `Directive[]` | `null` | Generic trigger array. When provided, it fully drives trigger behavior; otherwise `atProviders`/`slashProviders` synthesize the default `@`/`/`. See [Directives](#directives-generic-triggers). |
| `atProviders` | `AtProvider[]` | `[]` | Data sources for the `@` picker (sugar over `directives`). In Vue templates, use `at-providers`. |
| `slashProviders` | `SlashProvider[]` | `[]` | Data sources for the `/` command menu (sugar over `directives`). In Vue templates, use `slash-providers`. |
| `tokenActions` | `TokenAction[] \| (block, context) => TokenAction[]` | `[]` | Popup menu items for tokens. |
| `placeholder` | `string` | `'Ask Codex to code, explain, or inspect...'` | Editor placeholder. |
| `running` | `boolean` | `false` | When `true`, the lower-right button becomes a stop button. |

### Events

| Event | Payload | Description |
| --- | --- | --- |
| `submit` | `SubmitPayload` | Emitted when the user sends the prompt. |
| `stop` | none | Emitted when the stop button is clicked while `running=true`. |
| `resource-select` | `Resource` | Emitted after a resource is selected from the `@` picker and inserted. |
| `command-select` | `Command` | Emitted after a command is selected from the `/` menu. |
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
| `focus()` | Focus the editor. |
| `openPicker()` | Open the matching menu if the caret is inside a trigger token. |

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
