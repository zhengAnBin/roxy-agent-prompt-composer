<script setup>
import {
  ArrowUp,
  ChevronDown,
  Circle,
  CodeXml,
  File,
  FileArchive,
  FileImage,
  FileText,
  Folder,
  Plus,
  ShieldCheck,
  Square,
  X,
} from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, useSlots } from 'vue'
import ResourcePicker from './popup/ResourcePicker.vue'
import {
  blocksToPlainText,
  collectResources,
  collectSlots,
  getBlockFromTokenElement,
  serializeNodesToBlocks,
} from './core/blocks.js'
import {
  applyTemplateSlotConfig,
  blocksToClipboardText,
  parseTemplateToBlocks,
  resolveTemplateBlocks,
} from './core/template.js'
import { detectTriggerAtCaret, findDirective, normalizeDirectives } from './core/directives.js'
import { defaultPresentation } from './core/presentation.js'

const props = defineProps({
  // 通用指令数组：完全数据驱动的触发符（@ / # : ...）。
  // 未显式传时，自动由 atProviders / slashProviders 合成默认的 @ 与 / 两条。
  directives: {
    type: Array,
    default: null,
  },
  atProviders: {
    type: Array,
    default: () => [],
  },
  slashProviders: {
    type: Array,
    default: () => [],
  },
  tokenActions: {
    type: [Array, Function],
    default: () => [],
  },
  placeholder: {
    type: String,
    default: 'Ask Codex to code, explain, or inspect...',
  },
  running: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['submit', 'stop', 'resource-select', 'command-select', 'token-hover', 'token-click', 'token-action', 'token-update'])

const slots = useSlots()

const editorRef = ref(null)
const fileInputRef = ref(null)
const folderInputRef = ref(null)
const pickerRef = ref(null)
const pickerOpen = ref(false)
const pickerMode = ref(null)
const pickerDirective = ref(null)
const triggerRange = ref(null)
const draftText = ref('')
const pickerKeyword = ref('')
const isComposing = ref(false)
const isDraggingFile = ref(false)
const attachments = ref([])
const tokenTooltip = ref(null)
const tokenPopup = ref(null)
const slotDraftValue = ref('')
// 当消费者提供了 #chip 作用域插槽时，用它渲染每个 token。
// tokenRegistry 由 DOM 反推（见 syncTokenRegistry），Teleport 据此把插槽挂进占位。
const tokenRegistry = ref([])
let tokenSeq = 0
let editorObserver = null
const CLIPBOARD_BLOCKS_MIME = 'application/x-prompt-composer-blocks'

const hasChipSlot = computed(() => Boolean(slots.chip))
const hasPickerItemSlot = computed(() => Boolean(slots['picker-item']))

const directives = computed(() => normalizeDirectives({
  directives: props.directives,
  atProviders: props.atProviders,
  slashProviders: props.slashProviders,
}))

const canSubmit = computed(() => draftText.value.trim().length > 0 || attachments.value.length > 0)
const pickerProviders = computed(() => pickerDirective.value?.providers || [])
const pickerTrigger = computed(() => pickerDirective.value?.trigger || '@')
const pickerEmptyLabel = computed(() => pickerDirective.value?.emptyLabel || '添加')
const pickerNoResultsLabel = computed(() => pickerDirective.value?.noResultsLabel || 'No results found')

function updateDraftText() {
  draftText.value = editorRef.value?.innerText.replace(/ /g, ' ') || ''
}

function getResourceSnapshot(resource) {
  return {
    id: resource.id,
    type: resource.type,
    title: resource.title,
    description: resource.description || '',
    icon: resource.icon || '#',
    group: resource.group || '',
    action: resource.action || '',
    keywords: resource.keywords || [],
    payload: resource.payload,
  }
}

function keepEditorScrolledToBottom() {
  requestAnimationFrame(() => {
    if (!editorRef.value) {
      return
    }

    editorRef.value.scrollTop = editorRef.value.scrollHeight
  })
}

function focusEditor() {
  editorRef.value?.focus()
}

// ---- Token 占位与回显 -------------------------------------------------------

function getBlockTitle(block) {
  return defaultPresentation.getTitle(block)
}

function getBlockIcon(block) {
  return defaultPresentation.getIcon(block)
}

function getBlockDescription(block) {
  return defaultPresentation.getDescription(block)
}

/**
 * 创建一个「原子占位」：contenteditable=false 的 span，携带完整 block 数据。
 * - 无 #chip 插槽：直接把默认「icon title」写进 textContent（与旧行为一致，无闪烁）。
 * - 有 #chip 插槽：留空占位，交由 Teleport 渲染插槽（tokenRegistry 反推）。
 */
function createTokenElement(block) {
  const snapshot = block.type === 'resource'
    ? { type: 'resource', resource: getResourceSnapshot(block.resource) }
    : block
  const chip = document.createElement('span')
  chip.className = defaultPresentation.getTokenClassList(snapshot).join(' ')
  chip.contentEditable = 'false'
  chip.dataset.block = JSON.stringify(snapshot)
  chip.dataset.tokenId = `tok-${++tokenSeq}`

  if (snapshot.type === 'resource') {
    chip.dataset.resourceId = snapshot.resource.id
    chip.dataset.resourceType = snapshot.resource.type
    chip.dataset.resource = JSON.stringify(snapshot.resource)
  }

  if (!hasChipSlot.value) {
    chip.textContent = `${getBlockIcon(snapshot)} ${getBlockTitle(snapshot)}`
  }

  return chip
}

function refreshTokenElement(element, block) {
  element.dataset.block = JSON.stringify(block)
  element.className = defaultPresentation.getTokenClassList(block).join(' ')

  if (!hasChipSlot.value) {
    element.textContent = `${getBlockIcon(block)} ${getBlockTitle(block)}`
  }

  syncTokenRegistry()
}

function createChip(resource) {
  return createTokenElement({ type: 'resource', resource: getResourceSnapshot(resource) })
}

/**
 * 从 DOM 反推 token 注册表（供 #chip 插槽 Teleport 使用）。
 * 幂等：token 集合与各自的 data-block 未变化时不产生新的对象身份，
 * 避免 Teleport 挂载引发 MutationObserver -> sync 的循环。
 */
function syncTokenRegistry() {
  if (!hasChipSlot.value || !editorRef.value) {
    if (tokenRegistry.value.length) {
      tokenRegistry.value = []
    }
    return
  }

  const elements = editorRef.value.querySelectorAll('.composer-token')
  const previousById = new Map(tokenRegistry.value.map((entry) => [entry.id, entry]))
  const nextRegistry = []
  let changed = elements.length !== tokenRegistry.value.length

  elements.forEach((element) => {
    const id = element.dataset.tokenId || `tok-${++tokenSeq}`
    element.dataset.tokenId = id
    const block = getBlockFromTokenElement(element)
    const previous = previousById.get(id)

    if (previous && previous.el === element && previous.raw === element.dataset.block) {
      nextRegistry.push(previous)
      return
    }

    changed = true
    nextRegistry.push({ id, el: element, block, raw: element.dataset.block })
  })

  if (changed) {
    tokenRegistry.value = nextRegistry
  }
}

function appendTextToEditor(text) {
  const lines = String(text).split('\n')

  lines.forEach((line, index) => {
    if (index > 0) {
      editorRef.value.append(document.createElement('br'))
    }

    if (line) {
      editorRef.value.append(document.createTextNode(line))
    }
  })
}

function appendBlockToContainer(container, block) {
  if (block.type === 'resource' || block.type === 'slot') {
    container.append(createTokenElement(block))
    return
  }

  const lines = String(block.text || '').split('\n')

  lines.forEach((line, index) => {
    if (index > 0) {
      container.append(document.createElement('br'))
    }

    if (line) {
      container.append(document.createTextNode(line))
    }
  })
}

// ---- 序列化 -----------------------------------------------------------------

function serializeEditorBlocks() {
  return serializeNodesToBlocks(editorRef.value?.childNodes || [], { trim: true })
}

function serializeSelectionBlocks() {
  const editor = editorRef.value
  const selection = window.getSelection()

  if (!editor || !selection || !selection.rangeCount || selection.isCollapsed) {
    return []
  }

  const range = selection.getRangeAt(0)

  if (!editor.contains(range.commonAncestorContainer)) {
    return []
  }

  return serializeNodesToBlocks(range.cloneContents().childNodes)
}

function insertBlocksAtSelection(blocks) {
  const selection = window.getSelection()

  if (!selection || !selection.rangeCount) {
    return
  }

  const range = selection.getRangeAt(0)
  const fragment = document.createDocumentFragment()
  const typingAnchor = document.createTextNode('')

  blocks.forEach((block) => appendBlockToContainer(fragment, block))
  fragment.append(typingAnchor)
  range.deleteContents()
  range.insertNode(fragment)

  const nextRange = document.createRange()
  nextRange.setStart(typingAnchor, 0)
  nextRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(nextRange)

  updateDraftText()
  syncTokenRegistry()
  updatePickerKeyword()
  keepEditorScrolledToBottom()
}

function placeCaretAtEditorEnd() {
  if (!editorRef.value) {
    return
  }

  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(editorRef.value)
  range.collapse(false)
  selection?.removeAllRanges()
  selection?.addRange(range)
}

// ---- 附件 -------------------------------------------------------------------

function getFileExtension(name = '') {
  const lastDot = name.lastIndexOf('.')

  if (lastDot <= 0 || lastDot === name.length - 1) {
    return ''
  }

  return name.slice(lastDot + 1).toUpperCase()
}

function getAttachmentKind(file) {
  if (file.kind === 'folder') {
    return 'FOLDER'
  }

  const extension = getFileExtension(file.name)
  return extension || file.type?.split('/').pop()?.toUpperCase() || 'FILE'
}

function getAttachmentIcon(kind) {
  if (kind === 'FOLDER') {
    return Folder
  }

  if (['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG'].includes(kind)) {
    return FileImage
  }

  if (['HTML', 'CSS', 'JS', 'TS', 'TSX', 'JSX', 'JSON', 'VUE', 'MD'].includes(kind)) {
    return CodeXml
  }

  if (['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(kind)) {
    return FileArchive
  }

  if (['TXT', 'PDF', 'DOC', 'DOCX', 'CSV', 'XLS', 'XLSX', 'PPT', 'PPTX'].includes(kind)) {
    return FileText
  }

  return File
}

function addAttachments(files) {
  const nextAttachments = Array.from(files).map((file) => {
    const kind = getAttachmentKind(file)

    return {
      id: crypto.randomUUID(),
      name: file.name || 'Untitled',
      kind,
      file,
      icon: getAttachmentIcon(kind),
    }
  })

  attachments.value = [...attachments.value, ...nextAttachments]
  keepEditorScrolledToBottom()
}

function removeAttachment(id) {
  attachments.value = attachments.value.filter((attachment) => attachment.id !== id)
}

function insertNodeAtSelection(node) {
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount) {
    return
  }

  const range = selection.getRangeAt(0)
  range.deleteContents()
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

// ---- 指令 / Picker ----------------------------------------------------------

function closePicker() {
  pickerOpen.value = false
  pickerMode.value = null
  pickerDirective.value = null
  triggerRange.value = null
  pickerKeyword.value = ''
}

function openToolbarPicker() {
  focusEditor()
  pickerMode.value = 'toolbar'
  pickerDirective.value = findDirective(directives.value, '@') || directives.value[0] || null
  triggerRange.value = null
  pickerKeyword.value = ''
  pickerOpen.value = Boolean(pickerDirective.value)
}

function removeTriggerToken() {
  if (!triggerRange.value || !editorRef.value) {
    return
  }

  const selection = window.getSelection()
  const currentRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
  const replaceRange = triggerRange.value.cloneRange()

  if (currentRange) {
    try {
      replaceRange.setEnd(currentRange.endContainer, currentRange.endOffset)
    } catch {
      replaceRange.setEnd(triggerRange.value.endContainer, triggerRange.value.endOffset)
    }
  }

  replaceRange.deleteContents()
  selection?.removeAllRanges()
  selection?.addRange(replaceRange)
  updateDraftText()
}

function openPicker() {
  const detected = detectTriggerAtCaret(editorRef.value, directives.value)

  if (!detected) {
    return
  }

  pickerMode.value = 'trigger'
  pickerDirective.value = detected.directive
  triggerRange.value = detected.range
  pickerKeyword.value = detected.keyword
  pickerOpen.value = true
}

function updatePickerKeyword() {
  const detected = detectTriggerAtCaret(editorRef.value, directives.value)

  if (detected) {
    pickerMode.value = 'trigger'
    pickerDirective.value = detected.directive
    triggerRange.value = detected.range
    pickerKeyword.value = detected.keyword
    pickerOpen.value = true
    return
  }

  if (!pickerOpen.value) {
    return
  }

  if (pickerMode.value === 'trigger') {
    closePicker()
  }
}

function replaceTriggerWithResource(resource) {
  if (resource.action === 'file-picker') {
    if (triggerRange.value) {
      removeTriggerToken()
    }
    closePicker()
    fileInputRef.value?.click()
    return
  }

  if (!editorRef.value) {
    return
  }

  if (!triggerRange.value) {
    insertNodeAtSelection(createChip(resource))
    insertNodeAtSelection(document.createTextNode(' '))
    closePicker()
    updateDraftText()
    syncTokenRegistry()
    keepEditorScrolledToBottom()
    emit('resource-select', resource)
    return
  }

  const selection = window.getSelection()
  const currentRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
  const replaceRange = triggerRange.value.cloneRange()

  if (currentRange) {
    replaceRange.setEnd(currentRange.endContainer, currentRange.endOffset)
  }

  replaceRange.deleteContents()
  const chip = createChip(resource)
  const trailingSpace = document.createTextNode(' ')
  const typingAnchor = document.createTextNode('')
  replaceRange.insertNode(typingAnchor)
  replaceRange.insertNode(trailingSpace)
  replaceRange.insertNode(chip)

  const nextRange = document.createRange()
  nextRange.setStart(typingAnchor, 0)
  nextRange.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(nextRange)

  closePicker()
  updateDraftText()
  syncTokenRegistry()
  keepEditorScrolledToBottom()
  emit('resource-select', resource)
}

function runCommand(command) {
  if (triggerRange.value) {
    removeTriggerToken()
  }

  closePicker()

  if (command.template) {
    applyTemplate(command.template)
  } else if (command.insertText) {
    insertBlocksAtSelection(parseTemplateToBlocks(command.insertText))
  }

  emit('command-select', command)
  updateDraftText()
  keepEditorScrolledToBottom()
}

function handlePickerSelect(item) {
  const directive = pickerDirective.value
  const context = {
    directive,
    trigger: directive?.trigger,
    keyword: pickerKeyword.value,
    surface: 'editor',
  }

  // 自定义选中行为：返回 false 表示阻止默认行为（仍清理触发符与关闭菜单）。
  if (directive?.onSelect) {
    const result = directive.onSelect(item, context)

    if (result === false) {
      if (triggerRange.value) {
        removeTriggerToken()
      }
      closePicker()
      updateDraftText()
      return
    }
  }

  if (directive?.mode === 'command') {
    runCommand(item)
    return
  }

  replaceTriggerWithResource(item)
}

function insertLineBreak() {
  insertNodeAtSelection(document.createElement('br'))
  updateDraftText()
  keepEditorScrolledToBottom()
}

function submit() {
  updateDraftText()

  if (!canSubmit.value) {
    return
  }

  const blocks = serializeEditorBlocks()

  emit('submit', {
    text: blocksToPlainText(blocks, defaultPresentation),
    blocks,
    resources: collectResources(blocks),
    slots: collectSlots(blocks),
    attachments: attachments.value,
  })
  editorRef.value.innerHTML = ''
  attachments.value = []
  closePicker()
  updateDraftText()
  syncTokenRegistry()
}

function onEditorInput() {
  if (isComposing.value) {
    updateDraftText()
    keepEditorScrolledToBottom()
    return
  }

  updateDraftText()
  updatePickerKeyword()
  keepEditorScrolledToBottom()
}

// ---- Token 交互（tooltip / popup / action） ---------------------------------

function findTokenElement(target) {
  return target?.closest?.('.composer-token')
}

// tooltip / popup 统一锚定到 token 元素本身，并向上生长（编辑框固定在视口底部）。
// 用 CSS `bottom` 定位：元素底边贴在 token 上方 gap 处，内容向上展开，不会被视口底部裁掉。
const TOOLTIP_MIN_WIDTH = 220
const POPUP_MIN_WIDTH = 260

function anchorAboveToken(element, minWidth) {
  const rect = element.getBoundingClientRect()
  const gap = 10
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - minWidth - 12))
  const bottom = window.innerHeight - rect.top + gap
  return { left, bottom }
}

function getTokenActions(block) {
  const externalActions = typeof props.tokenActions === 'function'
    ? props.tokenActions(block, { surface: 'editor' }) || []
    : props.tokenActions || []

  return [
    ...externalActions,
    { id: 'remove-token', label: '移除', icon: '×' },
  ]
}

function openTokenPopup(event, tokenElement) {
  const block = getBlockFromTokenElement(tokenElement)

  if (!block) {
    return
  }

  // popup 与 tooltip 互斥：打开 popup 时清掉 tooltip。
  tokenTooltip.value = null
  slotDraftValue.value = block.type === 'slot' ? block.slot?.value || '' : ''
  tokenPopup.value = {
    block,
    element: tokenElement,
    actions: getTokenActions(block),
    ...anchorAboveToken(tokenElement, POPUP_MIN_WIDTH),
  }
  emit('token-click', { block, surface: 'editor' })
}

function closeTokenPopup() {
  tokenPopup.value = null
  slotDraftValue.value = ''
}

function updateTokenBlock(nextBlock) {
  if (!tokenPopup.value?.element) {
    return
  }

  refreshTokenElement(tokenPopup.value.element, nextBlock)
  tokenPopup.value = {
    ...tokenPopup.value,
    block: nextBlock,
  }
  updateDraftText()
  emit('token-update', { block: nextBlock, surface: 'editor' })
}

function applySlotDraft() {
  if (tokenPopup.value?.block?.type !== 'slot') {
    return
  }

  updateTokenBlock({
    ...tokenPopup.value.block,
    slot: {
      ...tokenPopup.value.block.slot,
      value: slotDraftValue.value,
    },
  })
  closeTokenPopup()
}

function chooseSlotOption(option) {
  if (tokenPopup.value?.block?.type !== 'slot') {
    return
  }

  updateTokenBlock({
    ...tokenPopup.value.block,
    slot: {
      ...tokenPopup.value.block.slot,
      value: option,
    },
  })
  closeTokenPopup()
}

function runTokenAction(action) {
  if (!tokenPopup.value) {
    return
  }

  const payload = {
    action,
    block: tokenPopup.value.block,
    surface: 'editor',
  }

  if (action.id === 'remove-token') {
    tokenPopup.value.element.remove()
    closeTokenPopup()
    updateDraftText()
    syncTokenRegistry()
    emit('token-action', payload)
    return
  }

  emit('token-action', payload)
  closeTokenPopup()
}

function onEditorClick(event) {
  const tokenElement = findTokenElement(event.target)

  if (!tokenElement) {
    closeTokenPopup()
    return
  }

  event.preventDefault()
  event.stopPropagation()
  openTokenPopup(event, tokenElement)
}

function onEditorMouseover(event) {
  // popup 开着时不显示 tooltip（互斥）。
  if (tokenPopup.value) {
    return
  }

  const tokenElement = findTokenElement(event.target)

  // 只在悬停到 token 上时显示；离开 token（哪怕仍在输入框内）立即清除。
  if (!tokenElement) {
    if (tokenTooltip.value) {
      tokenTooltip.value = null
    }
    return
  }

  // 已经在同一个 token 上，避免重复计算与闪烁。
  if (tokenTooltip.value?.element === tokenElement) {
    return
  }

  const block = getBlockFromTokenElement(tokenElement)

  if (!block) {
    return
  }

  tokenTooltip.value = {
    block,
    element: tokenElement,
    title: getBlockTitle(block),
    description: getBlockDescription(block),
    ...anchorAboveToken(tokenElement, TOOLTIP_MIN_WIDTH),
  }
  emit('token-hover', { block, surface: 'editor' })
}

function onEditorMouseleave() {
  tokenTooltip.value = null
}

function onEditorKeydown(event) {
  if (event.isComposing || isComposing.value || event.keyCode === 229) {
    return
  }

  if (pickerOpen.value && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key)) {
    pickerRef.value?.onKeydown(event)
    return
  }

  if (event.key === 'Enter' && event.shiftKey) {
    event.preventDefault()
    insertLineBreak()
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    submit()
  }
}

function onCompositionStart() {
  isComposing.value = true
}

function onCompositionEnd() {
  isComposing.value = false
  onEditorInput()
  keepEditorScrolledToBottom()
}

function onPaste(event) {
  event.preventDefault()
  const serializedBlocks = event.clipboardData?.getData(CLIPBOARD_BLOCKS_MIME)
  const text = event.clipboardData?.getData('text/plain') || ''

  if (serializedBlocks) {
    try {
      insertBlocksAtSelection(JSON.parse(serializedBlocks))
      return
    } catch {
      insertBlocksAtSelection(parseTemplateToBlocks(text))
      return
    }
  }

  insertBlocksAtSelection(parseTemplateToBlocks(text))
}

function writeBlocksToClipboard(event, blocks) {
  if (!blocks.length) {
    return false
  }

  event.preventDefault()
  event.clipboardData?.setData('text/plain', blocksToClipboardText(blocks))
  event.clipboardData?.setData(CLIPBOARD_BLOCKS_MIME, JSON.stringify(blocks))
  return true
}

function onCopy(event) {
  writeBlocksToClipboard(event, serializeSelectionBlocks())
}

function onCut(event) {
  if (!writeBlocksToClipboard(event, serializeSelectionBlocks())) {
    return
  }

  window.getSelection()?.deleteFromDocument()
  closePicker()
  updateDraftText()
  syncTokenRegistry()
  keepEditorScrolledToBottom()
}

function onFileInputChange(event) {
  addAttachments(event.target.files || [])
  event.target.value = ''
}

function getDroppedEntries(event) {
  return Array.from(event.dataTransfer?.items || [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean)
}

function onDragEnter(event) {
  if ([...event.dataTransfer?.types || []].includes('Files')) {
    isDraggingFile.value = true
  }
}

function onDragOver(event) {
  if ([...event.dataTransfer?.types || []].includes('Files')) {
    event.preventDefault()
    isDraggingFile.value = true
  }
}

function onDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    isDraggingFile.value = false
  }
}

function onDrop(event) {
  event.preventDefault()
  isDraggingFile.value = false

  const entries = getDroppedEntries(event)
  const folders = entries
    .filter((entry) => entry.isDirectory)
    .map((entry) => ({
      name: entry.name,
      kind: 'folder',
      type: 'folder',
    }))

  addAttachments([...folders, ...event.dataTransfer.files])
}

function onToolbarResourceClick() {
  openToolbarPicker()
}

// ---- 生命周期 & 对外 API ----------------------------------------------------

onMounted(() => {
  updateDraftText()

  if (editorRef.value) {
    editorObserver = new MutationObserver(() => {
      updateDraftText()
      syncTokenRegistry()
      if (!isComposing.value) {
        updatePickerKeyword()
        keepEditorScrolledToBottom()
      }
    })
    editorObserver.observe(editorRef.value, {
      characterData: true,
      childList: true,
      subtree: true,
    })
  }
})

onBeforeUnmount(() => {
  editorObserver?.disconnect()
})

function setContent(payload = {}) {
  if (!editorRef.value) {
    return
  }

  closePicker()
  editorRef.value.innerHTML = ''

  const blocks = payload.blocks?.length
    ? payload.blocks
    : [{ type: 'text', text: payload.text || '' }]

  blocks.forEach((block, index) => {
    if (block.type === 'resource' || block.type === 'slot') {
      editorRef.value.append(createTokenElement(block))

      if (!blocks[index + 1]) {
        editorRef.value.append(document.createTextNode(' '))
      }

      return
    }

    appendTextToEditor(block.text || '')
  })

  attachments.value = (payload.attachments || []).map((attachment) => ({
    ...attachment,
    id: crypto.randomUUID(),
  }))

  updateDraftText()
  syncTokenRegistry()
  focusEditor()
  placeCaretAtEditorEnd()
  keepEditorScrolledToBottom()
}

function applyTemplate(template) {
  setContent({
    blocks: resolveTemplateBlocks(template),
    attachments: template.attachments || [],
  })
}

defineExpose({
  insertBlocks: insertBlocksAtSelection,
  parseTemplate(content, slotConfig = {}) {
    return applyTemplateSlotConfig(parseTemplateToBlocks(content), slotConfig)
  },
  setContent,
  setTemplate: applyTemplate,
  focus: focusEditor,
  openPicker,
})
</script>

<template>
  <section
    class="prompt-composer relative grid grid-rows-[minmax(56px,auto)_64px] w-[min(100%,1474px)] min-h-[124px] mx-auto text-[#202124] bg-white border border-[#dedede] rounded-[30px] shadow-[0_1px_0_rgba(0,0,0,0.02)] focus-within:border-[#d6d6d6] max-[720px]:min-h-[120px] max-[720px]:rounded-[22px] max-[720px]:grid-rows-[minmax(54px,auto)_58px]"
    :class="isDraggingFile ? 'prompt-composer--dragging !border-[#bfc3c8] !bg-[#fbfbfb]' : ''"
    @click="focusEditor"
    @dragenter.prevent="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div
      v-if="isDraggingFile"
      class="prompt-composer__drop-hint absolute inset-2.5 grid place-items-center text-[#6b6f76] text-[1.35rem] font-[650] bg-[rgba(247,247,247,0.82)] border-2 border-dashed border-[#d6d8db] rounded-3xl pointer-events-none"
    >
      拖放文件到这里
    </div>
    <input
      ref="fileInputRef"
      class="prompt-composer__file-input absolute w-px h-px overflow-hidden opacity-0 pointer-events-none"
      type="file"
      multiple
      @change="onFileInputChange"
    >
    <input
      ref="folderInputRef"
      class="prompt-composer__file-input absolute w-px h-px overflow-hidden opacity-0 pointer-events-none"
      type="file"
      multiple
      webkitdirectory
      directory
      @change="onFileInputChange"
    >
    <div
      v-if="pickerOpen"
      class="prompt-composer__picker absolute right-0 bottom-[calc(100%+15px)] left-0 z-30"
      @click.stop
    >
      <ResourcePicker
        :key="pickerTrigger"
        ref="pickerRef"
        :providers="pickerProviders"
        :keyword="pickerKeyword"
        :trigger="pickerTrigger"
        :directive="pickerDirective"
        :empty-label="pickerEmptyLabel"
        :no-results-label="pickerNoResultsLabel"
        @select="handlePickerSelect"
        @close="closePicker"
      >
        <template v-if="hasPickerItemSlot" #item="itemProps">
          <slot name="picker-item" v-bind="itemProps" />
        </template>
      </ResourcePicker>
    </div>

    <!-- #chip 作用域插槽：把每个 token 占位渲染成消费者自定义的 Vue 组件 -->
    <template v-if="hasChipSlot">
      <Teleport
        v-for="token in tokenRegistry"
        :key="token.id"
        :to="token.el"
      >
        <slot name="chip" :block="token.block" :surface="'editor'" />
      </Teleport>
    </template>

    <div
      v-if="tokenTooltip"
      class="composer-token-tooltip fixed z-[100] max-w-[min(360px,calc(100vw-28px))] grid gap-[3px] px-[11px] py-[9px] text-[#202124] text-[0.88rem] bg-white/98 border border-[#e2e2e2] rounded-xl shadow-[0_18px_60px_rgba(0,0,0,0.08)] backdrop-blur-[18px] pointer-events-none"
      :style="{ left: `${tokenTooltip.left}px`, bottom: `${tokenTooltip.bottom}px` }"
    >
      <strong>{{ tokenTooltip.title }}</strong>
      <span class="text-[#8c8f94]">{{ tokenTooltip.description }}</span>
    </div>
    <div
      v-if="tokenPopup"
      class="composer-token-popup fixed z-[100] grid min-w-[260px] max-w-[min(360px,calc(100vw-28px))] gap-1 p-2 text-[#202124] bg-white/98 border border-[#e2e2e2] rounded-2xl shadow-[0_18px_60px_rgba(0,0,0,0.08)] backdrop-blur-[18px]"
      :style="{ left: `${tokenPopup.left}px`, bottom: `${tokenPopup.bottom}px` }"
      @click.stop
    >
      <div class="composer-token-popup__header grid gap-0.5 px-[9px] pt-2 pb-2.5">
        <strong class="text-[0.95rem]">{{ getBlockTitle(tokenPopup.block) }}</strong>
        <span class="text-[#8c8f94] text-[0.84rem]">{{ getBlockDescription(tokenPopup.block) }}</span>
      </div>
      <div
        v-if="tokenPopup.block.type === 'slot' && tokenPopup.block.slot?.kind === 'input'"
        class="composer-token-popup__editor flex gap-2 px-1 pt-1 pb-2"
      >
        <input
          v-model="slotDraftValue"
          class="composer-token-popup__input min-w-0 flex-1 h-9 px-2.5 text-[#202124] font-[inherit] border border-[#dedede] rounded-[10px] outline-none focus:border-[#bfc3c8]"
          type="text"
          :placeholder="tokenPopup.block.slot.placeholder"
          @keydown.enter.prevent="applySlotDraft"
        >
        <button
          type="button"
          class="composer-token-popup__apply h-9 px-3 text-white bg-[#17181a] border-0 rounded-[10px] cursor-pointer"
          @click="applySlotDraft"
        >
          应用
        </button>
      </div>
      <div
        v-if="tokenPopup.block.type === 'slot' && tokenPopup.block.slot?.kind === 'resource' && tokenPopup.block.slot.options?.length"
        class="composer-token-popup__options grid gap-1"
      >
        <button
          v-for="option in tokenPopup.block.slot.options"
          :key="`${option.type}:${option.id}`"
          type="button"
          class="composer-token-popup__item grid grid-cols-[24px_minmax(0,1fr)] items-center gap-1.5 h-9 px-2.5 text-left bg-transparent border-0 rounded-[10px] cursor-pointer hover:bg-[#f1f2f3]"
          @click="chooseSlotOption(option)"
        >
          <span>{{ option.icon || '@' }}</span>
          {{ option.title }}
        </button>
      </div>
      <button
        v-for="action in tokenPopup.actions"
        :key="action.id"
        type="button"
        class="composer-token-popup__item grid grid-cols-[24px_minmax(0,1fr)] items-center gap-1.5 h-9 px-2.5 text-left bg-transparent border-0 rounded-[10px] cursor-pointer hover:bg-[#f1f2f3]"
        @click="runTokenAction(action)"
      >
        <span>{{ action.icon }}</span>
        {{ action.label }}
      </button>
    </div>

    <div class="prompt-composer__body min-h-[56px] px-[26px] pt-[26px] pb-1 max-[720px]:px-4 max-[720px]:pt-5 max-[720px]:pb-0">
      <div
        v-if="attachments.length"
        class="prompt-composer__attachments flex flex-wrap gap-2.5 mt-[-8px] mb-3.5 ml-[-8px] max-[720px]:mt-[-4px] max-[720px]:mb-2.5 max-[720px]:ml-[-6px]"
        @click.stop
      >
        <article
          v-for="attachment in attachments"
          :key="attachment.id"
          class="composer-attachment relative grid w-[330px] max-w-[min(330px,100%)] min-h-[94px] grid-cols-[80px_minmax(0,1fr)] items-center pl-2.5 pr-[46px] py-2 bg-white border border-[#e5e5e5] rounded-[22px] max-[720px]:w-40 max-[720px]:min-h-[156px] max-[720px]:grid-cols-[1fr] max-[720px]:items-start max-[720px]:px-2.5 max-[720px]:pt-2.5 max-[720px]:pb-3"
        >
          <span class="composer-attachment__icon grid w-20 h-20 place-items-center text-[#6c7077] bg-[#f5f5f5] rounded-[18px] max-[720px]:w-full max-[720px]:h-[84px]">
            <component :is="attachment.icon" :size="38" :stroke-width="2.2" />
          </span>
          <span class="composer-attachment__meta grid min-w-0 gap-1 pl-3 max-[720px]:pl-0 max-[720px]:pt-2">
            <span class="composer-attachment__name overflow-hidden whitespace-nowrap text-ellipsis text-[#202124] text-[1.62rem] font-bold leading-[1.15] max-[720px]:text-base">{{ attachment.name }}</span>
            <span class="composer-attachment__type overflow-hidden whitespace-nowrap text-ellipsis text-[#74777e] text-[1.42rem] font-medium leading-[1.15] max-[720px]:text-[0.9rem]">{{ attachment.kind }}</span>
          </span>
          <button
            class="composer-attachment__remove absolute top-[-8px] right-[7px] inline-flex w-[34px] h-[34px] items-center justify-center text-white bg-[#161719] border-0 rounded-full cursor-pointer"
            type="button"
            title="移除"
            @click="removeAttachment(attachment.id)"
          >
            <X :size="20" />
          </button>
        </article>
      </div>
      <div
        ref="editorRef"
        class="prompt-composer__editor min-h-8 max-h-[calc(1.34em*8)] overflow-y-auto overscroll-contain text-[#202124] text-[1.58rem] font-[650] leading-[1.34] outline-none whitespace-pre-wrap break-words [scrollbar-width:thin] [scrollbar-color:#d0d2d4_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-[#d0d2d4] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent empty:before:content-[attr(data-placeholder)] empty:before:text-[#9a9da2] empty:before:pointer-events-none max-[720px]:text-base max-[720px]:font-medium"
        contenteditable="true"
        role="textbox"
        aria-multiline="true"
        :data-placeholder="placeholder"
        @input="onEditorInput"
        @click="onEditorClick"
        @mouseover="onEditorMouseover"
        @mouseleave="onEditorMouseleave"
        @keydown="onEditorKeydown"
        @keyup="onEditorInput"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
        @copy="onCopy"
        @cut="onCut"
        @paste="onPaste"
      />
    </div>

    <div class="prompt-composer__toolbar flex min-h-[64px] items-center justify-between gap-3 px-4 pt-2 pb-3.5 max-[720px]:min-h-[58px] max-[720px]:px-2.5 max-[720px]:pt-1.5 max-[720px]:pb-2.5" @click.stop>
      <slot name="toolbar-start">
        <div class="prompt-composer__tools flex min-w-0 items-center gap-3.5 max-[720px]:gap-[7px]">
          <button
            class="composer-add-button inline-flex items-center justify-center border-0 cursor-pointer w-14 h-14 flex-[0_0_56px] text-[#151618] bg-[#f3f3f3] rounded-full max-[720px]:w-[42px] max-[720px]:h-[42px] max-[720px]:basis-[42px]"
            type="button"
            title="添加资源"
            @click="onToolbarResourceClick"
          >
            <Plus :size="28" />
          </button>
          <button
            class="composer-access-button inline-flex items-center justify-center border-0 cursor-pointer gap-2 min-w-0 h-[42px] px-0.5 text-[#f05a1a] text-[1.35rem] font-bold bg-transparent [&>span]:overflow-hidden [&>span]:whitespace-nowrap [&>span]:text-ellipsis max-[720px]:max-w-[132px] max-[720px]:gap-[5px] max-[720px]:text-[0.96rem]"
            type="button"
            @click="focusEditor"
          >
            <ShieldCheck :size="20" />
            <span>完全访问</span>
            <ChevronDown :size="18" />
          </button>
        </div>
      </slot>

      <slot name="toolbar-end">
        <div class="prompt-composer__tools flex min-w-0 items-center gap-3.5 max-[720px]:gap-[7px]">
          <Circle class="composer-status-dot flex-none text-[#e2e2e2] [stroke-width:3]" :size="19" />
          <button
            class="composer-model-button inline-flex items-center justify-center border-0 cursor-pointer gap-[9px] h-[42px] text-[#202124] text-[1.55rem] font-[650] bg-transparent [&>span]:overflow-hidden [&>span]:whitespace-nowrap [&>span]:text-ellipsis [&>span+span]:text-[#8b8d92] max-[720px]:gap-1 max-[720px]:text-base"
            type="button"
            @click="focusEditor"
          >
            <span>5.5</span>
            <span>高</span>
            <ChevronDown :size="18" />
          </button>
          <button
            v-if="running"
            class="composer-send-button composer-send-button--stop inline-flex items-center justify-center border-0 cursor-pointer w-14 h-14 flex-[0_0_56px] text-white bg-[#e5484d] rounded-full max-[720px]:w-[42px] max-[720px]:h-[42px] max-[720px]:basis-[42px]"
            type="button"
            title="Stop"
            @click="emit('stop')"
          >
            <Square :size="16" fill="currentColor" />
          </button>
          <button
            v-else
            class="composer-send-button inline-flex items-center justify-center border-0 cursor-pointer w-14 h-14 flex-[0_0_56px] text-white bg-[#111214] rounded-full disabled:text-[#bfc1c4] disabled:bg-[#f0f0f0] disabled:cursor-default disabled:opacity-100 max-[720px]:w-[42px] max-[720px]:h-[42px] max-[720px]:basis-[42px]"
            :class="{ 'composer-send-button--active': canSubmit }"
            type="button"
            title="Send"
            :disabled="!canSubmit"
            @click="submit"
          >
            <ArrowUp :size="25" />
          </button>
        </div>
      </slot>
    </div>
  </section>
</template>
