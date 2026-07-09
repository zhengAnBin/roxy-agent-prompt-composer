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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ResourcePicker from './popup/ResourcePicker.vue'

const props = defineProps({
  providers: {
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

const emit = defineEmits(['submit', 'stop', 'resource-select', 'token-hover', 'token-click', 'token-action', 'token-update'])

const editorRef = ref(null)
const fileInputRef = ref(null)
const folderInputRef = ref(null)
const pickerRef = ref(null)
const pickerOpen = ref(false)
const pickerMode = ref(null)
const triggerRange = ref(null)
const draftText = ref('')
const pickerKeyword = ref('')
const isComposing = ref(false)
const isDraggingFile = ref(false)
const attachments = ref([])
const tokenTooltip = ref(null)
const tokenPopup = ref(null)
const slotDraftValue = ref('')
let editorObserver = null
const CLIPBOARD_BLOCKS_MIME = 'application/x-prompt-composer-blocks'

const canSubmit = computed(() => draftText.value.trim().length > 0 || attachments.value.length > 0)

function updateDraftText() {
  draftText.value = editorRef.value?.innerText.replace(/\u00a0/g, ' ') || ''
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
  }
}

function blocksToPlainText(blocks) {
  return blocks
    .map((block) => {
      if (block.type === 'resource') {
        return `${block.resource?.icon || '#'} ${block.resource?.title || ''}`
      }

      if (block.type === 'slot') {
        if (block.slot?.kind === 'resource') {
          return block.slot.value
            ? `${block.slot.value.icon || '#'} ${block.slot.value.title || ''}`
            : `[${block.slot.label || block.slot.id || '选择资源'}]`
        }

        return block.slot?.value || `[${block.slot?.label || '输入内容'}]`
      }

      return block.text || ''
    })
    .join('')
    .replace(/\u00a0/g, ' ')
    .trim()
}

function getDefaultResourceIcon(type) {
  const iconsByType = {
    browser: '🌐',
    file: '📎',
    folder: '📎',
    goal: '🎯',
    memory: '🧠',
    plan: '☑️',
    profile: '👤',
    tool: '🛠',
    workspace: '📦',
  }

  return iconsByType[type] || '#'
}

function escapeResourceLabel(label = '') {
  return label.replace(/[\\\]]/g, '\\$&')
}

function unescapeResourceLabel(label = '') {
  return label.replace(/\\(.)/g, '$1')
}

function resourceToClipboardUrl(resource = {}) {
  const type = encodeURIComponent(resource.type || 'resource')
  const id = encodeURIComponent(resource.id || resource.title || 'unknown')
  return `resource://${type}/${id}`
}

function resourceFromClipboardUrl(url, title) {
  try {
    const parsedUrl = new URL(url)
    const type = decodeURIComponent(parsedUrl.hostname || 'resource')
    const id = decodeURIComponent(parsedUrl.pathname.replace(/^\//, '') || title)

    return {
      id,
      type,
      title,
      icon: getDefaultResourceIcon(type),
    }
  } catch {
    return {
      id: title,
      type: 'resource',
      title,
      icon: '#',
    }
  }
}

function createResourceSlotFromLabel(label = '') {
  const [resourceType = 'resource', ...idParts] = label.split(':')

  return {
    id: label,
    kind: 'resource',
    resourceType,
    label,
    placeholder: `选择 ${resourceType}`,
    value: null,
    options: [],
    target: idParts.join(':') || '',
  }
}

function createInputSlotFromLabel(label = '') {
  const [slotLabel, ...valueParts] = label.split('=')

  return {
    id: slotLabel,
    kind: 'input',
    label: slotLabel,
    placeholder: slotLabel,
    value: valueParts.join('='),
  }
}

function blocksToClipboardText(blocks) {
  return blocks
    .map((block) => {
      if (block.type === 'resource') {
        const resource = block.resource || {}
        return `[@${escapeResourceLabel(resource.title || resource.id || 'resource')}](${resourceToClipboardUrl(resource)})`
      }

      if (block.type === 'slot') {
        const slot = block.slot || {}

        if (slot.kind === 'resource') {
          if (slot.value) {
            return `[@${escapeResourceLabel(slot.value.title || slot.value.id || 'resource')}](${resourceToClipboardUrl(slot.value)})`
          }

          return `[@${escapeResourceLabel(slot.id || slot.label || 'resource')}]`
        }

        const label = slot.value ? `${slot.label || '输入内容'}=${slot.value}` : slot.label || '输入内容'
        return `[:${escapeResourceLabel(label)}]`
      }

      return block.text || ''
    })
    .join('')
}

function parseClipboardTextToBlocks(text) {
  const blocks = []
  const resourcePattern = /\[([@:])((?:\\.|[^\]\\])*)\](?:\((resource:\/\/[^)\s]+)\))?/g
  let lastIndex = 0
  let match = resourcePattern.exec(text)

  while (match) {
    appendTextBlock(blocks, text.slice(lastIndex, match.index))
    const sigil = match[1]
    const label = unescapeResourceLabel(match[2])
    const url = match[3]

    if (sigil === '@' && url) {
      blocks.push({
        type: 'resource',
        resource: resourceFromClipboardUrl(url, label),
      })
    } else if (sigil === '@') {
      blocks.push({
        type: 'slot',
        slot: createResourceSlotFromLabel(label),
      })
    } else {
      blocks.push({
        type: 'slot',
        slot: createInputSlotFromLabel(label),
      })
    }

    lastIndex = resourcePattern.lastIndex
    match = resourcePattern.exec(text)
  }

  appendTextBlock(blocks, text.slice(lastIndex))
  return blocks.length ? blocks : [{ type: 'text', text }]
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

function createChip(resource) {
  return createTokenElement({
    type: 'resource',
    resource: getResourceSnapshot(resource),
  })
}

function getBlockTitle(block) {
  if (block.type === 'resource') {
    return block.resource?.title || block.resource?.id || 'Resource'
  }

  if (block.type === 'slot') {
    if (block.slot?.kind === 'resource') {
      return block.slot.value?.title || block.slot.placeholder || block.slot.label || '选择资源'
    }

    return block.slot?.value || block.slot?.placeholder || block.slot?.label || '输入内容'
  }

  return 'Token'
}

function getBlockIcon(block) {
  if (block.type === 'resource') {
    return block.resource?.icon || '#'
  }

  if (block.type === 'slot') {
    if (block.slot?.kind === 'resource') {
      return block.slot.value?.icon || '@'
    }

    return block.slot?.icon || ':'
  }

  return '#'
}

function getBlockDescription(block) {
  if (block.type === 'resource') {
    return block.resource?.description || block.resource?.type || ''
  }

  if (block.type === 'slot') {
    if (block.slot?.kind === 'resource') {
      return block.slot.value?.description || block.slot.resourceType || '待选择'
    }

    return block.slot?.description || (block.slot?.value ? '可编辑输入' : '待填写')
  }

  return ''
}

function createTokenElement(block) {
  const snapshot = block.type === 'resource'
    ? { type: 'resource', resource: getResourceSnapshot(block.resource) }
    : block
  const chip = document.createElement('span')
  chip.className = [
    'composer-chip',
    'composer-token',
    `composer-token--${snapshot.type}`,
    snapshot.type === 'slot' && !snapshot.slot?.value ? 'composer-token--empty' : '',
  ].filter(Boolean).join(' ')
  chip.contentEditable = 'false'
  chip.dataset.block = JSON.stringify(snapshot)
  if (snapshot.type === 'resource') {
    chip.dataset.resourceId = snapshot.resource.id
    chip.dataset.resourceType = snapshot.resource.type
    chip.dataset.resource = JSON.stringify(snapshot.resource)
  }
  chip.textContent = `${getBlockIcon(snapshot)} ${getBlockTitle(snapshot)}`
  return chip
}

function refreshTokenElement(element, block) {
  element.dataset.block = JSON.stringify(block)
  element.className = [
    'composer-chip',
    'composer-token',
    `composer-token--${block.type}`,
    block.type === 'slot' && !block.slot?.value ? 'composer-token--empty' : '',
  ].filter(Boolean).join(' ')
  element.textContent = `${getBlockIcon(block)} ${getBlockTitle(block)}`
}

function getBlockFromTokenElement(element) {
  try {
    if (element.dataset.block) {
      return JSON.parse(element.dataset.block)
    }
  } catch {
    return null
  }

  return {
    type: 'resource',
    resource: getResourceFromChip(element),
  }
}

function getResourceFromChip(chip) {
  try {
    return JSON.parse(chip.dataset.resource)
  } catch {
    return {
      id: chip.dataset.resourceId,
      type: chip.dataset.resourceType,
      title: chip.textContent.replace(/^#\s*/, ''),
      icon: '#',
    }
  }
}

function appendTextBlock(blocks, text) {
  if (!text) {
    return
  }

  const normalizedText = text.replace(/\u00a0/g, ' ')
  const previousBlock = blocks[blocks.length - 1]

  if (previousBlock?.type === 'text') {
    previousBlock.text += normalizedText
    return
  }

  blocks.push({
    type: 'text',
    text: normalizedText,
  })
}

function trimEditorBlocks(blocks) {
  const nextBlocks = blocks.map((block) => ({ ...block }))

  while (nextBlocks[0]?.type === 'text') {
    nextBlocks[0].text = nextBlocks[0].text.replace(/^\s+/, '')

    if (nextBlocks[0].text) {
      break
    }

    nextBlocks.shift()
  }

  while (nextBlocks[nextBlocks.length - 1]?.type === 'text') {
    const lastBlock = nextBlocks[nextBlocks.length - 1]
    lastBlock.text = lastBlock.text.replace(/\s+$/, '')

    if (lastBlock.text) {
      break
    }

    nextBlocks.pop()
  }

  return nextBlocks
}

function serializeNodesToBlocks(nodes, { trim = false } = {}) {
  const blocks = []

  function visit(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      appendTextBlock(blocks, node.textContent || '')
      return
    }

    if (node.nodeName === 'BR') {
      appendTextBlock(blocks, '\n')
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return
    }

    if (node.classList.contains('composer-token') || node.classList.contains('composer-chip')) {
      const tokenBlock = getBlockFromTokenElement(node)
      if (tokenBlock) {
        blocks.push(tokenBlock)
        return
      }

      blocks.push({
        type: 'resource',
        resource: getResourceFromChip(node),
      })
      return
    }

    node.childNodes.forEach(visit)
  }

  nodes.forEach(visit)
  return trim ? trimEditorBlocks(blocks) : blocks
}

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

  const fragment = range.cloneContents()
  return serializeNodesToBlocks(fragment.childNodes)
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

function closePicker() {
  pickerOpen.value = false
  pickerMode.value = null
  triggerRange.value = null
  pickerKeyword.value = ''
}

function openToolbarPicker() {
  focusEditor()
  pickerMode.value = 'toolbar'
  triggerRange.value = null
  pickerKeyword.value = ''
  pickerOpen.value = true
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

function getMentionTokenFromCaret() {
  const editor = editorRef.value
  const selection = window.getSelection()

  if (!editor || !selection || !selection.rangeCount) {
    return null
  }

  const currentRange = selection.getRangeAt(0)
  let textNode = currentRange.endContainer
  let textOffset = currentRange.endOffset

  if (textNode.nodeType === Node.ELEMENT_NODE && textOffset > 0) {
    const previousNode = textNode.childNodes[textOffset - 1]

    if (previousNode?.nodeType === Node.TEXT_NODE) {
      textNode = previousNode
      textOffset = previousNode.textContent?.length || 0
    }
  }

  if (textNode.nodeType !== Node.TEXT_NODE || !editor.contains(textNode)) {
    return null
  }

  const beforeCaret = textNode.textContent.slice(0, textOffset)
  const tokenMatch = beforeCaret.match(/(?:^|[\s\u00a0])(@[^\s\u00a0]*)$/)

  if (!tokenMatch) {
    return null
  }

  const tokenStart = beforeCaret.length - tokenMatch[1].length
  const nextRange = document.createRange()
  nextRange.setStart(textNode, tokenStart)
  nextRange.setEnd(textNode, tokenStart + 1)
  return {
    keyword: tokenMatch[1].slice(1),
    range: nextRange,
  }
}

function openPicker() {
  const mentionToken = getMentionTokenFromCaret()

  if (!mentionToken) {
    return
  }

  pickerMode.value = 'trigger'
  triggerRange.value = mentionToken.range
  pickerKeyword.value = mentionToken.keyword
  pickerOpen.value = true
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
    insertNodeAtSelection(document.createTextNode('\u00a0'))
    closePicker()
    updateDraftText()
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
  const trailingSpace = document.createTextNode('\u00a0')
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
  keepEditorScrolledToBottom()
  emit('resource-select', resource)
}

function insertPlainText(text) {
  insertNodeAtSelection(document.createTextNode(text))
  updateDraftText()
  keepEditorScrolledToBottom()
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
    text: blocksToPlainText(blocks),
    blocks,
    resources: blocks
      .filter((block) => block.type === 'resource')
      .map((block) => block.resource),
    slots: blocks
      .filter((block) => block.type === 'slot')
      .map((block) => block.slot),
    attachments: attachments.value,
  })
  editorRef.value.innerHTML = ''
  attachments.value = []
  closePicker()
  updateDraftText()
}

function updatePickerKeyword() {
  const mentionToken = getMentionTokenFromCaret()

  if (mentionToken) {
    pickerMode.value = 'trigger'
    triggerRange.value = mentionToken.range
    pickerKeyword.value = mentionToken.keyword
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

function findTokenElement(target) {
  return target?.closest?.('.composer-token')
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

  tokenTooltip.value = null
  slotDraftValue.value = block.type === 'slot' ? block.slot?.value || '' : ''
  tokenPopup.value = {
    block,
    element: tokenElement,
    actions: getTokenActions(block),
    x: event.clientX,
    y: event.clientY,
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
  const tokenElement = findTokenElement(event.target)

  if (!tokenElement) {
    return
  }

  const block = getBlockFromTokenElement(tokenElement)

  if (!block) {
    return
  }

  tokenTooltip.value = {
    block,
    title: getBlockTitle(block),
    description: getBlockDescription(block),
    x: event.clientX,
    y: event.clientY,
  }
  emit('token-hover', { block, surface: 'editor' })
}

function onEditorMousemove(event) {
  if (!tokenTooltip.value) {
    return
  }

  tokenTooltip.value = {
    ...tokenTooltip.value,
    x: event.clientX,
    y: event.clientY,
  }
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
      insertBlocksAtSelection(parseClipboardTextToBlocks(text))
      return
    }
  }

  insertBlocksAtSelection(parseClipboardTextToBlocks(text))
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

function applyTemplateSlotConfig(blocks, slotConfig = {}) {
  return blocks.map((block) => {
    if (block.type !== 'slot') {
      return block
    }

    const config = slotConfig[block.slot.id] || slotConfig[block.slot.label]
    return config
      ? { ...block, slot: { ...block.slot, ...config } }
      : block
  })
}

onMounted(() => {
  updateDraftText()

  if (editorRef.value) {
    editorObserver = new MutationObserver(() => {
      updateDraftText()
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
        editorRef.value.append(document.createTextNode('\u00a0'))
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
  focusEditor()
  placeCaretAtEditorEnd()
  keepEditorScrolledToBottom()
}

defineExpose({
  insertBlocks: insertBlocksAtSelection,
  parseTemplate(content, slotConfig = {}) {
    return applyTemplateSlotConfig(parseClipboardTextToBlocks(content), slotConfig)
  },
  setContent,
  setTemplate(template) {
    const templateBlocks = template.blocks
      || applyTemplateSlotConfig(parseClipboardTextToBlocks(template.content || template), template.slots)

    setContent({
      blocks: templateBlocks,
      attachments: template.attachments || [],
    })
  },
})
</script>

<template>
  <section
    class="prompt-composer"
    :class="{ 'prompt-composer--dragging': isDraggingFile }"
    @click="focusEditor"
    @dragenter.prevent="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <input
      ref="fileInputRef"
      class="prompt-composer__file-input"
      type="file"
      multiple
      @change="onFileInputChange"
    >
    <input
      ref="folderInputRef"
      class="prompt-composer__file-input"
      type="file"
      multiple
      webkitdirectory
      directory
      @change="onFileInputChange"
    >
    <div v-if="pickerOpen" class="prompt-composer__picker" @click.stop>
      <ResourcePicker
        ref="pickerRef"
        :providers="providers"
        :keyword="pickerKeyword"
        @select="replaceTriggerWithResource"
        @close="closePicker"
      />
    </div>
    <div
      v-if="tokenTooltip"
      class="composer-token-tooltip"
      :style="{ left: `${tokenTooltip.x + 12}px`, top: `${tokenTooltip.y + 14}px` }"
    >
      <strong>{{ tokenTooltip.title }}</strong>
      <span>{{ tokenTooltip.description }}</span>
    </div>
    <div
      v-if="tokenPopup"
      class="composer-token-popup"
      :style="{ left: `${tokenPopup.x}px`, top: `${tokenPopup.y + 12}px` }"
      @click.stop
    >
      <div class="composer-token-popup__header">
        <strong>{{ getBlockTitle(tokenPopup.block) }}</strong>
        <span>{{ getBlockDescription(tokenPopup.block) }}</span>
      </div>
      <div
        v-if="tokenPopup.block.type === 'slot' && tokenPopup.block.slot?.kind === 'input'"
        class="composer-token-popup__editor"
      >
        <input
          v-model="slotDraftValue"
          class="composer-token-popup__input"
          type="text"
          :placeholder="tokenPopup.block.slot.placeholder"
          @keydown.enter.prevent="applySlotDraft"
        >
        <button type="button" class="composer-token-popup__apply" @click="applySlotDraft">
          应用
        </button>
      </div>
      <div
        v-if="tokenPopup.block.type === 'slot' && tokenPopup.block.slot?.kind === 'resource' && tokenPopup.block.slot.options?.length"
        class="composer-token-popup__options"
      >
        <button
          v-for="option in tokenPopup.block.slot.options"
          :key="`${option.type}:${option.id}`"
          type="button"
          class="composer-token-popup__item"
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
        class="composer-token-popup__item"
        @click="runTokenAction(action)"
      >
        <span>{{ action.icon }}</span>
        {{ action.label }}
      </button>
    </div>

    <div class="prompt-composer__body">
      <div v-if="attachments.length" class="prompt-composer__attachments" @click.stop>
        <article
          v-for="attachment in attachments"
          :key="attachment.id"
          class="composer-attachment"
        >
          <span class="composer-attachment__icon">
            <component :is="attachment.icon" :size="38" :stroke-width="2.2" />
          </span>
          <span class="composer-attachment__meta">
            <span class="composer-attachment__name">{{ attachment.name }}</span>
            <span class="composer-attachment__type">{{ attachment.kind }}</span>
          </span>
          <button
            class="composer-attachment__remove"
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
        class="prompt-composer__editor"
        contenteditable="true"
        role="textbox"
        aria-multiline="true"
        :data-placeholder="placeholder"
        @input="onEditorInput"
        @click="onEditorClick"
        @mouseover="onEditorMouseover"
        @mousemove="onEditorMousemove"
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

    <div class="prompt-composer__toolbar" @click.stop>
      <div class="prompt-composer__tools">
        <button class="composer-add-button" type="button" title="添加资源" @click="onToolbarResourceClick">
          <Plus :size="28" />
        </button>
        <button class="composer-access-button" type="button" @click="focusEditor">
          <ShieldCheck :size="20" />
          <span>完全访问</span>
          <ChevronDown :size="18" />
        </button>
      </div>

      <div class="prompt-composer__tools">
        <Circle class="composer-status-dot" :size="19" />
        <button class="composer-model-button" type="button" @click="focusEditor">
          <span>5.5</span>
          <span>高</span>
          <ChevronDown :size="18" />
        </button>
        <button
          v-if="running"
          class="composer-send-button composer-send-button--stop"
          type="button"
          title="Stop"
          @click="emit('stop')"
        >
          <Square :size="16" fill="currentColor" />
        </button>
        <button
          v-else
          class="composer-send-button"
          :class="{ 'composer-send-button--active': canSubmit }"
          type="button"
          title="Send"
          :disabled="!canSubmit"
          @click="submit"
        >
          <ArrowUp :size="25" />
        </button>
      </div>
    </div>
  </section>
</template>
