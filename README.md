# Prompt Composer

Codex-style prompt composer built with Vue 3. It supports resource picking with `@`, structured tokens, editable prompt template slots, message refill, attachments, drag and drop, IME-safe submit, and clipboard round-tripping.

Vue 3 实现的 Codex 风格输入框。支持 `@` 资源选择、结构化 token、可编辑 prompt 模板槽位、消息回填、附件、拖放、中文输入法安全提交，以及剪贴板结构化往返。

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

Primary components:

- `src/components/PromptComposer.vue`
- `src/components/TokenContent.vue`
- `src/components/popup/ResourcePicker.vue`
- `src/components/popup/ResourceList.vue`
- `src/components/popup/ResourceItem.vue`
