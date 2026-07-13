# Prompt Composer

Codex-style prompt composer built with Vue 3 + Tailwind CSS v4. It supports resource picking with `@`, slash commands with `/`, fully generic triggers, structured tokens, editable prompt template slots, message refill, attachments, drag and drop, IME-safe submit, and clipboard round-tripping. UI is fully customizable through scoped slots; every element keeps a semantic class hook for CSS overrides.

Vue 3 + Tailwind CSS v4 实现的 Codex 风格输入框。支持 `@` 资源选择、`/` 命令菜单、完全通用的触发符、结构化 token、可编辑 prompt 模板槽位、消息回填、附件、拖放、中文输入法安全提交，以及剪贴板结构化往返。回显 UI 通过作用域插槽高度可定制，每个元素都保留语义 class 供外部覆盖样式。

## 复制即用

组件全部收在单一目录 `src/prompt-composer/`。把这个目录整个复制到任意 **Vue 3 + Tailwind v4** 项目里即可使用，无任何 `.css` 文件依赖（样式全部是内联工具类）：

```js
import { PromptComposer, TokenContent } from './prompt-composer'
```

`src/App.vue` 是完整使用示例。

## API Documentation

- [中文 API 文档](docs/API.zh-CN.md)
- [English API Reference](docs/API.en.md)

## Development

```bash
npm install
npm run dev
npm run build
```

Main demo entry: `src/App.vue`

Component directory (copy this whole folder to reuse):

```text
src/prompt-composer/
├── index.js              # 公开入口：PromptComposer / TokenContent / core
├── PromptComposer.vue    # 主输入框组件
├── TokenContent.vue      # 消息区/只读回显组件
├── popup/                # 资源选择菜单（Picker / List / Item）
└── core/                 # UI 无关的解析层（blocks / template / directives / presentation）
```

Requirements: Vue 3, Tailwind CSS v4, `@lucide/vue`.

## Deployment

This project deploys to GitHub Pages with GitHub Actions. In the repository settings, open **Pages** and set **Build and deployment** > **Source** to **GitHub Actions**.

Every push to `main` runs `.github/workflows/deploy-pages.yml`, builds the Vite app, and publishes `dist/` with the official GitHub Pages artifact flow.

Expected project site path:

```text
https://zhenganbin.github.io/roxy-agent-prompt-composer/
```
