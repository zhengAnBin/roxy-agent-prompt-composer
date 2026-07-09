<script setup>
import { ref } from 'vue'
import PromptComposer from './components/PromptComposer.vue'
import TokenContent from './components/TokenContent.vue'

const submissions = ref([])
const selectedResources = ref([])
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

const providers = [
  createProvider('Agents', resources.agents),
  createProvider('Workspace files', resources.files, 120),
  createProvider('Tools and memory', resources.tools, 50),
  createProfileProvider(),
]

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
  <main class="app-shell">
    <section class="conversation">
      <div class="conversation__content">
        <div class="conversation__messages" aria-live="polite">
          <article
            v-for="submission in submissions"
            :key="submission.id"
            class="conversation-message conversation-message--editable"
            role="button"
            tabindex="0"
            title="回填到输入框"
            @click="refillSubmission(submission)"
            @keydown.enter.prevent="refillSubmission(submission)"
          >
            <span class="conversation-message__time">{{ submission.createdAt }}</span>
            <div class="conversation-message__content">
              <TokenContent
                :blocks="getSubmissionBlocks(submission)"
                :context="{ surface: 'message', submission }"
                :token-actions="getTokenActions"
                @token-action="handleTokenAction"
              />
            </div>
            <div v-if="submission.attachments?.length" class="submitted-attachments">
              <span
                v-for="attachment in submission.attachments"
                :key="attachment.id"
              >
                {{ attachment.name }}
              </span>
            </div>
          </article>
          <article v-if="!submissions.length" class="conversation-message conversation-message--empty">
            <span>网页预览</span>
            <p>在底部输入框输入 @ 添加资源。选择一个资源后，可以继续输入空格再 @ 添加第二个资源。</p>
          </article>
        </div>

        <div v-if="selectedResources.length" class="selected-resources">
          <span
            v-for="resource in selectedResources"
            :key="`${resource.type}:${resource.id}`"
            class="selected-resource"
          >
            {{ resource.icon }} {{ resource.title }}
          </span>
        </div>

        <div class="template-strip">
          <button
            v-for="template in promptTemplates"
            :key="template.id"
            type="button"
            class="template-pill"
            @click="applyTemplate(template)"
          >
            {{ template.title }}
          </button>
        </div>
      </div>

      <div class="conversation__composer">
        <PromptComposer
          ref="composerRef"
          :providers="providers"
          :token-actions="getTokenActions"
          placeholder="询问 Codex"
          @submit="handleSubmit"
          @resource-select="handleResourceSelect"
          @token-action="handleTokenAction"
        />
      </div>
    </section>
  </main>
</template>
