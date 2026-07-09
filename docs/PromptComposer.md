# PromptComposer 组件文档

> 说明：这份文档记录的是较早的 Resource Picker / 附件版本说明。最新的结构化 token、模板槽位、事件和方法 API 请以 [`API.zh-CN.md`](API.zh-CN.md) 和 [`API.en.md`](API.en.md) 为准。

一个类 Codex/Cursor 的输入框组件：支持富文本编辑区（`contenteditable`）、`@` 唤起资源选择菜单、文件/文件夹附件、拖拽上传、中文输入法合成、以及**可异步加载**的资源 provider。

- 组件路径：`src/components/PromptComposer.vue`
- 依赖子组件：`popup/ResourcePicker.vue`、`popup/ResourceList.vue`、`popup/ResourceItem.vue`
- 图标库：`@lucide/vue`

---

## 目录

- [快速开始](#快速开始)
- [Props](#props)
- [Events](#events)
- [Provider 契约](#provider-契约异步加载的核心)
- [Resource 对象结构](#resource-对象结构)
- [Attachment 对象结构](#attachment-对象结构)
- [异步加载与分类级 loading](#异步加载与分类级-loading)
- [键盘与输入交互](#键盘与输入交互)
- [子组件说明](#子组件说明)
- [图标映射](#图标映射)
- [完整示例](#完整示例)

---

## 快速开始

```vue
<script setup>
import PromptComposer from './components/PromptComposer.vue'

const providers = [
  {
    name: 'Files',
    async search(keyword) {
      // 返回 Resource 数组，可同步也可异步
      return [{ id: 'a', type: 'file', title: 'App.vue', group: '添加' }]
    },
  },
]

function onSubmit(payload) {
  console.log(payload.text, payload.attachments)
}
</script>

<template>
  <PromptComposer
    :providers="providers"
    placeholder="询问 Codex"
    :running="false"
    @submit="onSubmit"
    @stop="() => {}"
    @resource-select="(r) => console.log(r)"
  />
</template>
```

---

## Props

| 参数          | 类型      | 默认值                                        | 说明 |
| ------------- | --------- | --------------------------------------------- | ---- |
| `providers`   | `Array`   | `[]`                                          | 资源提供者列表。每个 provider 负责一类资源的数据来源（本地数组或远程接口），`@` 菜单的内容全部来自这里。详见 [Provider 契约](#provider-契约异步加载的核心)。 |
| `placeholder` | `String`  | `'Ask Codex to code, explain, or inspect...'` | 编辑区为空时显示的占位文案（通过 `data-placeholder` + CSS 呈现）。 |
| `running`     | `Boolean` | `false`                                       | 是否处于「运行中」状态。为 `true` 时右下角按钮显示为**停止**（方块图标，点击触发 `stop`）；为 `false` 时显示**发送**按钮（上箭头，仅在可提交时高亮可点）。 |

> 是否可提交由内部计算：编辑区有非空文本**或**存在附件时才允许提交。

---

## Events

| 事件名            | 载荷（payload）                                   | 触发时机 |
| ----------------- | ------------------------------------------------- | -------- |
| `submit`          | `{ text: string, attachments: Attachment[] }`     | 用户按 `Enter`（非 `Shift+Enter`）或点击发送按钮时。提交后编辑区与附件会被清空。`text` 为去除首尾空白后的纯文本。 |
| `stop`            | 无                                                | `running` 为 `true` 时点击停止按钮触发。 |
| `resource-select` | `Resource`                                        | 用户从 `@` 菜单选中一个资源并插入为 chip 后触发（`file-picker` 这类动作型资源不会触发，见下文）。 |

**交互补充：**
- `Enter`：提交。
- `Shift + Enter`：插入换行，不提交。
- 中文输入法合成期间（`compositionstart` ~ `compositionend`）不会误触发提交。

---

## Provider 契约（异步加载的核心）

`providers` 中的每一项是一个对象，约定如下：

```ts
interface Provider {
  name: string                 // 供调试/日志使用的名字
  group?: string               // 可选：该 provider 的分类名（用于分类级 loading 占位）
  search(keyword: string): Resource[] | Promise<Resource[]>
}
```

| 字段     | 类型                                    | 必填 | 说明 |
| -------- | --------------------------------------- | ---- | ---- |
| `name`   | `string`                                | 是   | provider 名称，出错时会打印到 `console.warn`。 |
| `group`  | `string`                                | 否   | 声明该 provider 归属的分类名。**声明后**，当它仍在加载时，会在对应分类标题下单独显示 `Searching...`，而不会阻塞其它分类。远程/异步 provider 建议声明。 |
| `search` | `(keyword) => Resource[] \| Promise<…>` | 是   | 根据关键词返回资源列表。**可以是异步的**（返回 `Promise`）。`keyword` 是用户在 `@` 之后输入的搜索词（已 `trim` + 转小写）。空字符串代表刚输入 `@`、还没输入关键词。 |

关于 `search(keyword)` 的行为约定：
- **返回值**：数组或解析为数组的 `Promise`。非数组会被当作空数组处理。
- **keyword 为空**：代表默认态（刚敲 `@`）。可在此返回默认列表（例如默认 10 条）。
- **抛错**：会被 `ResourcePicker` 捕获并降级为空数组，不会影响其它 provider。
- **竞态**：内部有 `searchRun` 守卫，旧请求的结果即使晚到也会被丢弃；配合 `AbortController` 可进一步取消旧的网络请求。

> 每次按键都会调用一次各 provider 的 `search`。本地数组无所谓；远程接口建议用 `AbortController` 取消旧请求，数据量大时可再加 debounce。

---

## Resource 对象结构

`search()` 返回的每一项，以及最终插入编辑区的资源，字段如下：

| 字段          | 类型       | 必填 | 说明 |
| ------------- | ---------- | ---- | ---- |
| `id`          | `string`   | 是   | 资源唯一标识，也用于列表 `key` 与 chip 的 `data-resource-id`。 |
| `type`        | `string`   | 是   | 资源类型。决定 `ResourceItem` 用哪个 lucide 图标（见 [图标映射](#图标映射)）；也写入 chip 的 `data-resource-type`。 |
| `title`       | `string`   | 是   | 主标题，显示在菜单项和 chip 上。 |
| `description` | `string`   | 否   | 副标题/描述，显示在标题右侧。 |
| `icon`        | `string`   | 否   | emoji 或字符图标。当 `type` 在图标映射表里没有对应 lucide 图标时，作为兜底显示；chip 前缀也用它（缺省为 `#`）。 |
| `group`       | `string`   | 否   | 分组名。菜单按此字段把资源归类展示；缺省回退为 `provider` 字段或 `'添加'`。 |
| `keywords`    | `string[]` | 否   | 供本地过滤用的额外关键词（远程接口通常在服务端过滤，可不填）。 |
| `action`      | `string`   | 否   | 动作型资源标记。目前支持 `'file-picker'`：选中后不插入 chip，而是打开系统文件选择框。 |

**动作型资源（`action: 'file-picker'`）：** 选中时会移除已输入的 `@` 触发符并弹出文件选择框，**不会**触发 `resource-select` 事件；选择的文件走附件逻辑。

---

## Attachment 对象结构

通过工具栏「+」→文件选择框、或拖拽文件/文件夹添加的附件；也是 `submit` 载荷里 `attachments` 的元素结构：

| 字段    | 类型            | 说明 |
| ------- | --------------- | ---- |
| `id`    | `string`        | `crypto.randomUUID()` 生成的唯一 id。 |
| `name`  | `string`        | 文件名（缺省 `'Untitled'`）。 |
| `kind`  | `string`        | 类型标签（大写），如 `PNG`、`JS`、`FOLDER`、`FILE`，由扩展名或 MIME 推断。 |
| `file`  | `File`          | 原始的 `File` 对象（文件夹为占位对象）。 |
| `icon`  | `Component`     | 根据 `kind` 选出的 lucide 图标组件（图片/代码/压缩包/文档/文件夹等）。 |

---

## 异步加载与分类级 loading

- 各 provider **独立发起、独立渲染**：本地分类先出现，慢的远程分类不会阻塞整个菜单。
- 声明了 `group` 的 provider 在加载时，会**只在自己的分类标题下**显示 `Searching...`。
- 只有当整个菜单一个分组都还没有、且确实还在加载时，才短暂显示全局 `Searching...`，避免「无结果」闪现。
- 打开菜单（`@`）时会立即用空 `keyword` 触发一次搜索（`immediate` watch），因此远程分类可以直接展示默认列表。

**远程 provider 推荐写法（含默认列表 + 关键词搜索 + 取消旧请求）：**

```js
function createProfileProvider() {
  let controller = null

  const toResource = (u) => ({
    id: `profile-${u.id}`,
    type: 'profile',
    title: u.login,
    description: u.html_url,
    icon: '👤',
    group: 'Profile',
  })

  return {
    name: 'Profiles',
    group: 'Profile',          // 加载时在 Profile 分类下显示 loading
    async search(keyword) {
      controller?.abort()      // 取消上一次未完成的请求
      controller = new AbortController()

      const url = keyword
        ? `https://api.github.com/search/users?q=${encodeURIComponent(keyword)}&per_page=10`
        : `https://api.github.com/users?per_page=10`   // 空关键词 = 默认 10 条

      try {
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const users = Array.isArray(data) ? data : data.items || []
        return users.map(toResource)
      } catch (error) {
        if (error.name !== 'AbortError') console.warn('Profile provider failed', error)
        return []
      }
    },
  }
}
```

---

## 键盘与输入交互

| 按键          | 菜单打开时                  | 菜单关闭时       |
| ------------- | --------------------------- | ---------------- |
| `↓` / `↑`     | 在菜单项间移动高亮（循环），并自动滚动跟随 | —                |
| `Enter`       | 选中当前高亮项              | 提交             |
| `Shift+Enter` | —                           | 换行             |
| `Tab`         | 选中当前高亮项              | （浏览器默认）   |
| `Escape`      | 关闭菜单                    | —                |

其它：
- 粘贴（`paste`）会被转为纯文本插入，避免带入外部富文本样式。
- 拖拽文件/文件夹到组件区域会高亮边框并作为附件加入。
- 编辑区通过 `MutationObserver` 同步纯文本、维护滚动到底部、并在光标处识别 `@token` 以更新菜单关键词。

---

## 子组件说明

| 组件               | 职责 |
| ------------------ | ---- |
| `PromptComposer`   | 顶层：编辑区、工具栏、附件区、`@` 触发与 chip 插入、提交逻辑。 |
| `ResourcePicker`   | 菜单容器：接收 `providers` 与 `keyword`，调度各 provider 的 `search`，管理**分类级 loading**、分组、键盘导航（对外 `expose` 了 `onKeydown`）。 |
| `ResourceList`     | 纯展示：按分组渲染，处理每个分组的 loading 行、空状态，及高亮项的 `scrollIntoView` 跟随。 |
| `ResourceItem`     | 单个菜单项：图标 + 标题 + 描述，高亮态样式。 |

`ResourcePicker` 对外暴露：

| 方法        | 说明 |
| ----------- | ---- |
| `onKeydown(event)` | 由 `PromptComposer` 在菜单打开时把方向键/回车/Esc/Tab 转交给菜单处理。 |

---

## 图标映射

`ResourceItem` 内置了 `type → lucide 图标` 的映射：

| `type`        | 图标        |
| ------------- | ----------- |
| `agent`       | Bot         |
| `file`        | Paperclip   |
| `folder`      | Folder      |
| `memory`      | Brain       |
| `tool`        | Wrench      |
| `workspace`   | Box         |
| `prompt`      | FileText    |
| `file-picker` | Paperclip   |
| `browser`     | Globe       |
| `goal`        | Crosshair   |
| `plan`        | CheckSquare |

- 若 `type` 不在表中（例如自定义的 `profile`），则回退显示 `resource.icon`（emoji/字符），缺省为 `#`。
- 想为新类型加 lucide 图标：在 `ResourceItem.vue` 的 `iconMap` 增加一行并从 `@lucide/vue` 引入对应图标，例如 `profile: User`。

---

## 完整示例

见 `src/App.vue`：其中包含

1. **本地 provider**（`createProvider`）：从内存数组过滤，带模拟延迟，演示同步/伪异步数据源。
2. **远程 profile provider**（`createProfileProvider`）：`@` 时默认拉 10 条，输入关键词后走模糊搜索，演示真实 `fetch` + 分类级 loading + 请求取消。
