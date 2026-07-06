# Resource Picker 设计

`@` 不是 Mention，而是整个 Prompt Composer 的资源入口（Resource Picker）。

用户输入：

```text
@
```

编辑器检测到 Trigger 后，弹出 Resource Picker。

整个 Picker 不关心资源类型，只负责：

* 展示列表
* 键盘导航
* 选择结果
* 返回 Resource

资源内容全部由外部提供。

---

# 设计目标

Resource Picker 必须做到完全可扩展。

以后新增资源类型，不需要修改编辑器代码。

例如可以支持：

```text
🤖 Agent
📄 File
📁 Folder

────────────

🔌 MCP Server
🛠 Tool
🧠 Memory
📚 Prompt
📦 Workspace
🌐 URL
```

这些全部只是不同的数据 Provider。

---

# 组件结构

```text
popup/

    ResourcePicker.vue

    ResourceList.vue

    ResourceItem.vue
```

Editor 不知道里面显示什么。

---

# Provider 模式

Editor 只负责：

```text
@

↓

打开 Picker

↓

等待返回 Resource

↓

插入 ResourceChip
```

至于 Picker 里面显示什么：

全部交给 Provider。

例如：

```ts
interface ResourceProvider {

    search(keyword: string): Promise<Resource[]>

}
```

可以注册很多 Provider：

```text
AgentProvider

FileProvider

FolderProvider

PromptProvider

MCPProvider

...
```

Picker 自动聚合所有结果。

---

# Resource

统一数据结构：

```ts
interface Resource {

    id: string

    type: string

    title: string

    description?: string

    icon?: string

    keywords?: string[]

    payload?: unknown

}
```

Editor 永远不知道：

这是 Agent

还是 File

还是 MCP

它只负责插入 Resource。

---

# ResourceItem

每一个 Item 完全自定义。

例如：

```text
🤖 RoxyAgent

Main Coding Agent
```

或者：

```text
📄 README.md

12 KB
```

或者：

```text
🛠 Browser

Playwright Tool
```

Resource Picker 不限制 UI。

每一种资源都可以有自己的渲染方式。

---

# Keyboard

支持：

```text
↑

↓

Enter

Esc

Tab
```

其中：

↑↓

切换当前项。

Enter

选择。

Esc

关闭。

---

# Editor 与 Picker 解耦

Editor：

```text
@

↓

Picker.open()

↓

等待 Promise

↓

insert(Resource)
```

例如：

```ts
const resource = await picker.open()

editor.insert(resource)
```

Editor 完全不知道：

Picker 怎么搜索

怎么渲染

怎么分页

怎么高亮。

---

# ResourceChip

选择以后：

编辑器插入：

```html
<span
    class="resource-chip"
    contenteditable="false">
    @README.md
</span>
```

Chip 保存完整 Resource 数据。

删除时整体删除。

---

# 扩展原则

整个 Prompt Composer 唯一允许扩展的入口就是 Resource Provider。

新增一种资源，仅需要：

```ts
registerProvider(provider)
```

无需修改：

* Editor
* Picker
* ResourceChip

Provider 自动参与搜索和展示。

---

# 设计原则

1. `@` 是统一资源入口，而不是 Mention。
2. Resource Picker 只负责选择，不负责资源管理。
3. Editor 不感知资源类型，只处理 Resource 对象。
4. 每种资源都可以拥有独立的渲染 UI。
5. Resource Provider 采用注册机制，后续扩展 Agent、文件、MCP、Prompt 等能力无需修改核心组件。
6. Prompt Composer 的扩展能力全部围绕 Resource Picker 构建，它是整个输入框最重要的扩展点。
