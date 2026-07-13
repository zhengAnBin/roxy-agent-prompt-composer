<script setup>
import { ref } from 'vue'
import { PromptComposer, TokenContent } from './prompt-composer'

const submissions = ref([])
const selectedResources = ref([])
const selectedCommands = ref([])
const composerRef = ref(null)

const profileOptions = [
  {
    id: 'profile-frontend',
    type: 'profile',
    title: 'Frontend Reviewer',
    description: '检查 UI、交互和可访问性',
    icon: '👤',
  },
  {
    id: 'profile-debugger',
    type: 'profile',
    title: 'Debugger',
    description: '定位 bug 并给出修复路径',
    icon: '👤',
  },
]

const resources = {
  agents: [
    {
      id: 'file-picker',
      type: 'file-picker',
      title: '文件和文件夹',
      description: '',
      icon: '📎',
      group: '添加',
      action: 'file-picker',
      keywords: ['file', 'folder', '文件', '文件夹'],
    },
    {
      id: 'chrome',
      type: 'browser',
      title: '附加 Google Chrome',
      description: '',
      icon: '🌐',
      group: '添加',
      keywords: ['chrome', 'browser', '浏览器'],
    },
    {
      id: 'goal',
      type: 'goal',
      title: '目标',
      description: '设置 Codex 将持续努力实现的目标',
      icon: '🎯',
      group: '添加',
      keywords: ['goal', '目标'],
    },
    {
      id: 'plan',
      type: 'plan',
      title: '计划模式',
      description: '开启计划模式',
      icon: '☑️',
      group: '添加',
      keywords: ['plan', '计划'],
    },
  ],
  files: [
    {
      id: 'prompts-md',
      type: 'file',
      title: 'prompts.md',
      description: 'Resource Picker design brief',
      icon: '📎',
      group: '添加',
      keywords: ['resource', 'picker', 'document'],
    },
    {
      id: 'app-vue',
      type: 'file',
      title: 'src/App.vue',
      description: 'Demo entry component',
      icon: '📎',
      group: '添加',
      keywords: ['vue', 'demo', 'entry'],
    },
    {
      id: 'components-folder',
      type: 'folder',
      title: 'src/components',
      description: 'Reusable composer components',
      icon: '📎',
      group: '添加',
      keywords: ['vue', 'components'],
    },
  ],
  tools: [
    {
      id: 'browser-tool',
      type: 'tool',
      title: 'Browser',
      description: 'Inspect and verify local UI',
      icon: '🛠',
      group: '插件',
      keywords: ['playwright', 'page', 'screenshot'],
    },
    {
      id: 'memory',
      type: 'memory',
      title: 'Project Notes',
      description: 'Pinned implementation context',
      icon: '🧠',
      group: '插件',
      keywords: ['notes', 'context'],
    },
    {
      id: 'workspace',
      type: 'workspace',
      title: 'Prompt Composer',
      description: 'Current Vue workspace',
      icon: '📦',
      group: '插件',
      keywords: ['repo', 'project'],
    },
  ],
}

const slashCommands = [
  {
    id: 'mcp',
    type: 'command',
    title: 'MCP',
    description: '显示 MCP 服务器状态',
    icon: '⌁',
    group: '命令',
    keywords: ['mcp', 'server', '服务器', '状态'],
  },
  {
    id: 'personality',
    type: 'command',
    title: '个性',
    description: '选择 Codex 的回应方式',
    icon: '◉',
    group: '命令',
    keywords: ['personality', 'style', '个性', '回应'],
  },
  {
    id: 'side-conversation',
    type: 'command',
    title: '侧边',
    description: '在临时分支中发起侧边对话',
    icon: '+',
    group: '命令',
    keywords: ['side', 'branch', '侧边', '分支'],
  },
  {
    id: 'feedback',
    type: 'command',
    title: '反馈',
    description: '发送有关此聊天的反馈',
    icon: '□',
    group: '命令',
    keywords: ['feedback', '反馈'],
  },
  {
    id: 'reasoning',
    type: 'command',
    title: '推理',
    description: '高',
    icon: '◌',
    group: '命令',
    keywords: ['reasoning', '推理', '高'],
  },
  {
    id: 'model',
    type: 'command',
    title: '模型',
    description: 'GPT-5.5',
    icon: '⬡',
    group: '命令',
    keywords: ['model', 'gpt', '模型'],
  },
  {
    id: 'status',
    type: 'command',
    title: '状态',
    description: '显示对话 ID、上下文使用情况及额度限制',
    icon: '◔',
    group: '命令',
    keywords: ['status', '状态', 'context', 'quota'],
  },
  {
    id: 'goal',
    type: 'command',
    title: '目标',
    description: '设置 Codex 将持续努力实现的目标',
    icon: '◎',
    group: '命令',
    keywords: ['goal', '目标'],
    insertText: '设置目标：[:目标内容]',
  },
  {
    id: 'plan-mode',
    type: 'command',
    title: '计划模式',
    description: '开启计划模式',
    icon: '☑',
    group: '命令',
    keywords: ['plan', '计划模式'],
  },
  {
    id: 'memory',
    type: 'command',
    title: '记忆',
    description: '生成开',
    icon: '◌',
    group: '命令',
    keywords: ['memory', '记忆'],
  },
]

const promptTemplates = [
  {
    id: 'profile-command',
    title: 'Profile 执行',
    content: '请选择 [@profile:target] 窗口，然后执行 [:用户输入]',
    slots: {
      'profile:target': {
        label: 'Profile 窗口',
        placeholder: '选择 Profile',
        options: profileOptions,
      },
      用户输入: {
        placeholder: '输入要执行的操作',
      },
    },
  },
  {
    id: 'review-file',
    title: '文件审查',
    content: '请审查 [@file:target]，重点关注 [:审查重点]',
    slots: {
      'file:target': {
        label: '目标文件',
        placeholder: '选择文件',
        options: resources.files,
      },
      审查重点: {
        placeholder: '例如状态同步、边界条件、交互细节',
      },
    },
  },
]

function createProvider(name, items, latency = 80) {
  return {
    name,
    async search(keyword) {
      await new Promise((resolve) => setTimeout(resolve, latency))

      if (!keyword) {
        return items
      }

      const query = keyword.toLowerCase()
      return items.filter((item) => {
        const searchable = [
          item.type,
          item.title,
          item.description,
          ...(item.keywords || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return searchable.includes(query)
      })
    },
  }
}

// 通过 fetch 获取的 Profile 分类（Profile 是一个数据量很大的列表）。
// - @ 时（没有关键词）：默认拉取前 10 条
// - 继续输入关键词：发请求做模糊搜索
// 这里用 GitHub 接口做真实可跑的示例，换成自己的后端时只改这两个 URL
// 和返回值映射即可。
const PROFILE_PAGE_SIZE = 10
const PROFILE_LIST_ENDPOINT = 'https://api.github.com/users' // 默认列表
const PROFILE_SEARCH_ENDPOINT = 'https://api.github.com/search/users' // 模糊搜索

function createProfileProvider() {
  let controller = null

  // 把接口返回的一条数据映射成 Resource 结构
  function toResource(user) {
    return {
      id: `profile-${user.id}`,
      type: 'profile',
      title: user.login,
      description: user.html_url,
      icon: '👤',
      group: 'Profile',
      keywords: [user.login],
    }
  }

  return {
    name: 'Profiles',
    // 声明分类名：加载时会在「Profile」分组下显示 loading，而不是整个菜单
    group: 'Profile',
    // keyword 就是用户在 @ 之后输入的搜索词，由 ResourcePicker 传进来
    async search(keyword) {
      // 中断上一次还没返回的请求，避免旧结果覆盖新结果
      controller?.abort()
      controller = new AbortController()

      // 没有关键词 -> 默认列表；有关键词 -> 模糊搜索（把关键词传过去）
      const url = keyword
        ? `${PROFILE_SEARCH_ENDPOINT}?q=${encodeURIComponent(keyword)}&per_page=${PROFILE_PAGE_SIZE}`
        : `${PROFILE_LIST_ENDPOINT}?per_page=${PROFILE_PAGE_SIZE}`

      try {
        const response = await fetch(url, { signal: controller.signal })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json()

        // 搜索接口返回 { items: [...] }，列表接口直接返回数组，这里统一处理
        const users = Array.isArray(data) ? data : data.items || []
        return users.map(toResource)
      } catch (error) {
        // abort 是正常的取消，忽略；其它错误降级为空数组
        if (error.name !== 'AbortError') {
          console.warn('Profile provider failed', error)
        }
        return []
      }
    },
  }
}

const atProviders = [
  createProvider('Agents', resources.agents),
  createProvider('Workspace files', resources.files, 120),
  createProvider('Tools and memory', resources.tools, 50),
  createProfileProvider(),
]

const slashProviders = [
  createProvider('Slash commands', slashCommands, 20),
]

// 第三个触发符演示：`#` 打标签，选中后直接插入 chip（走默认 resource 行为）。
const tags = [
  { id: 'tag-bug', type: 'tag', title: 'bug', description: '缺陷', icon: '🏷', group: '标签' },
  { id: 'tag-feature', type: 'tag', title: 'feature', description: '新功能', icon: '🏷', group: '标签' },
  { id: 'tag-urgent', type: 'tag', title: 'urgent', description: '紧急', icon: '🔥', group: '标签' },
]

const tagProviders = [createProvider('Tags', tags, 30)]

// 通用 directives 数组：@ / # 三个触发符全部数据驱动。
// atProviders / slashProviders 仍可单独传，这里演示直接用 directives 一次声明。
const directives = [
  { trigger: '@', providers: atProviders },
  { trigger: '/', providers: slashProviders },
  { trigger: '#', name: 'tag', mode: 'resource', emptyLabel: '标签', providers: tagProviders },
]

// 自定义回显：按资源类型给 chip 上色 / 加副标题。
// 返回 Tailwind 工具类；组件内置的 composer-chip 语义 class 仍在外层元素上，
// 这里只演示消费者如何完全接管 chip 内部呈现。
const CHIP_COLOR = {
  profile: 'text-[#1b6ac2]',
  file: 'text-[#2a7d4f]',
  folder: 'text-[#2a7d4f]',
  tag: 'text-[#a4432b]',
}

function chipClass(block) {
  const type = block.resource?.type || block.slot?.value?.type || block.slot?.kind || 'text'
  return `demo-chip inline-flex items-center gap-1.5 align-middle leading-tight ${CHIP_COLOR[type] || ''}`
}

function chipData(block) {
  if (block.type === 'resource') {
    return block.resource
  }

  if (block.type === 'slot' && block.slot?.kind === 'resource') {
    return block.slot.value || { icon: '@', title: block.slot.placeholder || block.slot.label }
  }

  if (block.type === 'slot') {
    return { icon: ':', title: block.slot.value || block.slot.label, hint: block.slot.value ? '' : '待填写' }
  }

  return { icon: '#', title: '' }
}

function handleSubmit(payload) {
  const message = typeof payload === 'string' ? payload : payload.text
  const attachments = typeof payload === 'string' ? [] : payload.attachments
  const blocks = typeof payload === 'string'
    ? [{ type: 'text', text: payload }]
    : payload.blocks || [{ type: 'text', text: message }]

  submissions.value.unshift({
    id: crypto.randomUUID(),
    message,
    blocks,
    resources: typeof payload === 'string' ? [] : payload.resources || [],
    attachments,
    createdAt: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
  })
}

function handleResourceSelect(resource) {
  selectedResources.value.unshift(resource)
  selectedResources.value = selectedResources.value.slice(0, 5)
}

function handleCommandSelect(command) {
  selectedCommands.value.unshift(command)
  selectedCommands.value = selectedCommands.value.slice(0, 5)
}

function getTokenActions(block, context) {
  if (context.surface === 'message') {
    return [
      { id: 'refill-message', label: '回填整条消息', icon: '↩' },
      { id: 'refill-token', label: '只回填这个项', icon: '+' },
    ]
  }

  return [
    { id: 'inspect-token', label: '查看数据', icon: 'i' },
  ]
}

function handleTokenAction({ action, block, context }) {
  if (action.id === 'refill-message' && context?.submission) {
    refillSubmission(context.submission)
    return
  }

  if (action.id === 'refill-token') {
    composerRef.value?.setContent({ blocks: [block] })
    return
  }

  if (action.id === 'inspect-token') {
    selectedResources.value.unshift({
      id: block.resource?.id || block.slot?.id || crypto.randomUUID(),
      type: block.resource?.type || block.slot?.kind || 'token',
      title: block.resource?.title || block.slot?.label || 'Token',
      icon: block.resource?.icon || block.slot?.icon || '#',
    })
    selectedResources.value = selectedResources.value.slice(0, 5)
  }
}

function getSubmissionBlocks(submission) {
  if (submission.blocks?.length) {
    return submission.blocks
  }

  return [{ type: 'text', text: submission.message }]
}

function getBlockKey(submission, block, index) {
  if (block.type === 'resource') {
    return `${submission.id}:resource:${block.resource?.type}:${block.resource?.id}:${index}`
  }

  if (block.type === 'slot') {
    return `${submission.id}:slot:${block.slot?.id}:${index}`
  }

  return `${submission.id}:text:${index}`
}

function refillSubmission(submission) {
  composerRef.value?.setContent({
    text: submission.message,
    blocks: getSubmissionBlocks(submission),
    attachments: submission.attachments || [],
  })
}

function applyTemplate(template) {
  composerRef.value?.setTemplate(template)
}
</script>

<template>
  <main class="app-shell min-h-screen bg-white">
    <section class="conversation min-h-screen px-[22px] pt-0 pb-[150px] max-[720px]:px-2 max-[720px]:pb-[142px]">
      <div class="conversation__content w-[min(100%,1474px)] mx-auto pt-0">
        <div class="conversation__messages grid gap-4" aria-live="polite">
          <article
            v-for="submission in submissions"
            :key="submission.id"
            class="conversation-message conversation-message--editable min-h-[112px] px-7 pt-7 pb-6 bg-white border border-[#dedede] rounded-[30px] cursor-pointer hover:border-[#d6d6d6] hover:bg-[#fbfbfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c7c9cc] focus-visible:outline-offset-[3px] max-[720px]:min-h-24 max-[720px]:p-5 max-[720px]:rounded-[22px]"
            role="button"
            tabindex="0"
            title="回填到输入框"
            @click="refillSubmission(submission)"
            @keydown.enter.prevent="refillSubmission(submission)"
          >
            <span class="conversation-message__time block mb-2.5 text-[#202124] text-base font-bold">{{ submission.createdAt }}</span>
            <div class="conversation-message__content text-[#202124] text-[1.58rem] font-[650] leading-[1.34] whitespace-pre-wrap break-words max-[720px]:text-[1.05rem]">
              <TokenContent
                :blocks="getSubmissionBlocks(submission)"
                :context="{ surface: 'message', submission }"
                :token-actions="getTokenActions"
                @token-action="handleTokenAction"
              >
                <template #chip="{ block }">
                  <span :class="chipClass(block)">
                    <span class="demo-chip__icon">{{ chipData(block).icon }}</span>
                    <span class="demo-chip__title font-bold">{{ chipData(block).title }}</span>
                    <span v-if="chipData(block).hint" class="demo-chip__hint text-[#b06a12] text-[0.82em] font-semibold">{{ chipData(block).hint }}</span>
                  </span>
                </template>
              </TokenContent>
            </div>
            <div v-if="submission.attachments?.length" class="submitted-attachments flex flex-wrap gap-2 mt-4">
              <span
                v-for="attachment in submission.attachments"
                :key="attachment.id"
                class="px-2.5 py-1 text-[#5f6368] text-[0.9rem] font-medium bg-[#f7f7f7] border border-[#e6e6e6] rounded-full"
              >
                {{ attachment.name }}
              </span>
            </div>
          </article>
          <article
            v-if="!submissions.length"
            class="conversation-message conversation-message--empty min-h-[112px] px-7 pt-7 pb-6 text-[#8c8f94] bg-white border border-[#dedede] rounded-[30px] max-[720px]:min-h-24 max-[720px]:p-5 max-[720px]:rounded-[22px]"
          >
            <span>网页预览</span>
            <p class="text-[#202124] text-[1.58rem] font-[650] leading-[1.34] max-[720px]:text-[1.05rem]">在底部输入框输入 @ 添加资源，输入 / 打开命令菜单，输入 # 添加标签。</p>
          </article>
        </div>

        <div v-if="selectedResources.length" class="selected-resources flex flex-wrap gap-2 mt-3">
          <span
            v-for="resource in selectedResources"
            :key="`${resource.type}:${resource.id}`"
            class="selected-resource inline-flex max-w-full min-h-[30px] items-center px-2.5 py-1 overflow-hidden text-[#5f6368] text-[0.9rem] whitespace-nowrap text-ellipsis bg-[#f7f7f7] border border-[#e6e6e6] rounded-full"
          >
            {{ resource.icon }} {{ resource.title }}
          </span>
        </div>

        <div v-if="selectedCommands.length" class="selected-resources flex flex-wrap gap-2 mt-3">
          <span
            v-for="command in selectedCommands"
            :key="`command:${command.id}`"
            class="selected-resource inline-flex max-w-full min-h-[30px] items-center px-2.5 py-1 overflow-hidden text-[#5f6368] text-[0.9rem] whitespace-nowrap text-ellipsis bg-[#f7f7f7] border border-[#e6e6e6] rounded-full"
          >
            / {{ command.title }}
          </span>
        </div>

        <div class="template-strip flex flex-wrap gap-2 mt-3">
          <button
            v-for="template in promptTemplates"
            :key="template.id"
            type="button"
            class="template-pill inline-flex min-h-8 items-center px-3 py-1 text-[#4f5359] text-[0.92rem] font-semibold bg-[#f7f7f7] border border-[#e5e5e5] rounded-full cursor-pointer hover:bg-[#f0f1f2]"
            @click="applyTemplate(template)"
          >
            {{ template.title }}
          </button>
        </div>
      </div>

      <div class="conversation__composer fixed right-0 bottom-0 left-0 z-20 px-[23px] pb-6 bg-gradient-to-t from-white from-74% to-transparent max-[720px]:px-2 max-[720px]:pb-3.5">
        <PromptComposer
          ref="composerRef"
          :directives="directives"
          :token-actions="getTokenActions"
          placeholder="询问 Codex（试试 @ 资源、/ 命令、# 标签）"
          @submit="handleSubmit"
          @resource-select="handleResourceSelect"
          @command-select="handleCommandSelect"
          @token-action="handleTokenAction"
        >
          <template #chip="{ block }">
            <span :class="chipClass(block)">
              <span class="demo-chip__icon">{{ chipData(block).icon }}</span>
              <span class="demo-chip__title font-bold">{{ chipData(block).title }}</span>
              <span v-if="chipData(block).hint" class="demo-chip__hint text-[#b06a12] text-[0.82em] font-semibold">{{ chipData(block).hint }}</span>
            </span>
          </template>
          <template #picker-item="{ item, active, directive }">
            <div
              class="demo-picker-item grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 rounded-2xl"
              :class="active ? 'demo-picker-item--active bg-[#eef4ff]' : ''"
            >
              <span
                class="demo-picker-item__badge inline-flex w-[34px] h-[34px] items-center justify-center text-[1.2rem] rounded-[10px]"
                :class="{
                  'bg-[#f2f3f5]': directive?.trigger === '@',
                  'bg-[#eef7f0]': directive?.trigger === '/',
                  'bg-[#fdf1ec]': directive?.trigger === '#',
                }"
              >
                {{ item.icon || '#' }}
              </span>
              <span class="demo-picker-item__body grid min-w-0 gap-0.5">
                <span class="demo-picker-item__title overflow-hidden whitespace-nowrap text-ellipsis text-[#34373d] text-[1.2rem] font-semibold">{{ item.title }}</span>
                <span v-if="item.description" class="demo-picker-item__desc overflow-hidden whitespace-nowrap text-ellipsis text-[#9a9da2] text-base">{{ item.description }}</span>
              </span>
              <span class="demo-picker-item__type text-[#b6b9be] text-[0.85rem] uppercase tracking-wide">{{ item.type }}</span>
            </div>
          </template>
        </PromptComposer>
      </div>
    </section>
  </main>
</template>
