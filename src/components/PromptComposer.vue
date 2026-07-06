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
  placeholder: {
    type: String,
    default: 'Ask Codex to code, explain, or inspect...',
  },
  running: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['submit', 'stop', 'resource-select'])

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
let editorObserver = null

const canSubmit = computed(() => draftText.value.trim().length > 0 || attachments.value.length > 0)

function updateDraftText() {
  draftText.value = editorRef.value?.innerText.replace(/\u00a0/g, ' ') || ''
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
  const chip = document.createElement('span')
  chip.className = 'composer-chip'
  chip.contentEditable = 'false'
  chip.dataset.resourceId = resource.id
  chip.dataset.resourceType = resource.type
  chip.textContent = `${resource.icon || '#'} ${resource.title}`
  return chip
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

  emit('submit', {
    text: draftText.value.trim(),
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
  const text = event.clipboardData?.getData('text/plain') || ''
  insertPlainText(text)
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
        @keydown="onEditorKeydown"
        @keyup="onEditorInput"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
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
