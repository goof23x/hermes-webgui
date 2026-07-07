export type ToolInfo = { toolset: string; name: string; description: string; requires?: string }

export const toolCatalog: ToolInfo[] = [
  { toolset: 'browser', name: 'browser_navigate', description: 'Navigate a browser page' },
  { toolset: 'browser', name: 'browser_snapshot', description: 'Inspect page accessibility tree' },
  { toolset: 'browser', name: 'browser_click', description: 'Click page elements' },
  { toolset: 'browser', name: 'browser_type', description: 'Type into page fields' },
  { toolset: 'browser', name: 'browser_scroll', description: 'Scroll pages' },
  { toolset: 'browser', name: 'browser_back', description: 'Browser history back' },
  { toolset: 'browser', name: 'browser_press', description: 'Keyboard input' },
  { toolset: 'browser', name: 'browser_get_images', description: 'List page images' },
  { toolset: 'browser', name: 'browser_vision', description: 'Visual browser screenshot QA' },
  { toolset: 'browser', name: 'browser_console', description: 'Console logs and JS evaluation' },
  { toolset: 'browser', name: 'browser_cdp', description: 'CDP browser control', requires: 'CDP configured' },
  { toolset: 'browser', name: 'browser_dialog', description: 'Handle browser dialogs', requires: 'CDP configured' },
  { toolset: 'computer_use', name: 'computer_use', description: 'Background desktop control via cua-driver', requires: 'cua-driver' },
  { toolset: 'terminal', name: 'terminal', description: 'Execute shell commands' },
  { toolset: 'terminal', name: 'process', description: 'Manage background processes' },
  { toolset: 'terminal', name: 'read_terminal', description: 'Read embedded terminal pane' },
  { toolset: 'terminal', name: 'close_terminal', description: 'Close background terminal tab' },
  { toolset: 'file', name: 'read_file', description: 'Read text files' },
  { toolset: 'file', name: 'write_file', description: 'Write files' },
  { toolset: 'file', name: 'patch', description: 'Targeted file edits' },
  { toolset: 'file', name: 'search_files', description: 'Search files and contents' },
  { toolset: 'web', name: 'web_search', description: 'Search the web', requires: 'Search provider key' },
  { toolset: 'web', name: 'web_extract', description: 'Extract web page/PDF content', requires: 'Search provider key' },
  { toolset: 'vision', name: 'vision_analyze', description: 'Analyze images' },
  { toolset: 'image_gen', name: 'image_generate', description: 'Generate or edit images', requires: 'Image backend key' },
  { toolset: 'video', name: 'video_analyze', description: 'Analyze video content' },
  { toolset: 'video_gen', name: 'video_generate', description: 'Generate video', requires: 'Video plugin/key' },
  { toolset: 'tts', name: 'text_to_speech', description: 'Convert text to speech' },
  { toolset: 'code_execution', name: 'execute_code', description: 'Run Python scripts with Hermes tools' },
  { toolset: 'delegation', name: 'delegate_task', description: 'Spawn subagents' },
  { toolset: 'clarify', name: 'clarify', description: 'Ask user a question' },
  { toolset: 'cronjob', name: 'cronjob', description: 'Manage scheduled jobs' },
  { toolset: 'memory', name: 'memory', description: 'Persistent memory' },
  { toolset: 'session_search', name: 'session_search', description: 'Search past sessions' },
  { toolset: 'skills', name: 'skills_list', description: 'List skills' },
  { toolset: 'skills', name: 'skill_view', description: 'Read skills' },
  { toolset: 'skills', name: 'skill_manage', description: 'Create/update/delete skills' },
  { toolset: 'todo', name: 'todo', description: 'Manage session task list' },
  { toolset: 'project', name: 'project_list', description: 'List desktop projects' },
  { toolset: 'project', name: 'project_create', description: 'Create desktop project' },
  { toolset: 'project', name: 'project_switch', description: 'Switch desktop project' },
  { toolset: 'homeassistant', name: 'ha_list_entities', description: 'List Home Assistant entities', requires: 'HASS_TOKEN' },
  { toolset: 'homeassistant', name: 'ha_get_state', description: 'Get Home Assistant state', requires: 'HASS_TOKEN' },
  { toolset: 'homeassistant', name: 'ha_list_services', description: 'List Home Assistant services', requires: 'HASS_TOKEN' },
  { toolset: 'homeassistant', name: 'ha_call_service', description: 'Call Home Assistant service', requires: 'HASS_TOKEN' },
  { toolset: 'discord', name: 'discord', description: 'Discord read/send/react tools', requires: 'DISCORD_BOT_TOKEN' },
  { toolset: 'discord_admin', name: 'discord_admin', description: 'Discord moderation/admin tools', requires: 'DISCORD_BOT_TOKEN + permissions' },
  { toolset: 'spotify', name: 'spotify_playback', description: 'Control Spotify playback', requires: 'Spotify OAuth' },
  { toolset: 'spotify', name: 'spotify_devices', description: 'List/transfer devices', requires: 'Spotify OAuth' },
  { toolset: 'spotify', name: 'spotify_queue', description: 'Manage queue', requires: 'Spotify OAuth' },
  { toolset: 'spotify', name: 'spotify_search', description: 'Search Spotify catalog', requires: 'Spotify OAuth' },
  { toolset: 'spotify', name: 'spotify_playlists', description: 'Manage playlists', requires: 'Spotify OAuth' },
  { toolset: 'spotify', name: 'spotify_albums', description: 'Fetch albums', requires: 'Spotify OAuth' },
  { toolset: 'spotify', name: 'spotify_library', description: 'Manage saved music', requires: 'Spotify OAuth' },
  { toolset: 'x_search', name: 'x_search', description: 'Search X/Twitter via xAI', requires: 'xAI key/OAuth' },
  { toolset: 'kanban', name: 'kanban_show', description: 'Show active kanban task' },
  { toolset: 'kanban', name: 'kanban_list', description: 'List board tasks' },
  { toolset: 'kanban', name: 'kanban_complete', description: 'Complete task' },
  { toolset: 'kanban', name: 'kanban_block', description: 'Block task' },
  { toolset: 'kanban', name: 'kanban_heartbeat', description: 'Progress heartbeat' },
  { toolset: 'kanban', name: 'kanban_comment', description: 'Task comments' },
  { toolset: 'kanban', name: 'kanban_create', description: 'Create child tasks' },
  { toolset: 'kanban', name: 'kanban_link', description: 'Link tasks' },
  { toolset: 'kanban', name: 'kanban_unblock', description: 'Unblock task' }
]

export const toolsets = Array.from(new Set(toolCatalog.map(t => t.toolset))).sort()

export const toolsetLabels: Record<string, string> = {
  browser: 'Browse websites',
  clarify: 'Ask a question',
  code_execution: 'Run Python',
  computer_use: 'Use desktop apps',
  cronjob: 'Schedule reminders',
  delegation: 'Use helper agents',
  discord: 'Discord',
  discord_admin: 'Discord admin',
  file: 'Work with files',
  homeassistant: 'Smart home',
  image_gen: 'Create images',
  kanban: 'Kanban board',
  memory: 'Remember preferences',
  project: 'Projects',
  session_search: 'Past chats',
  skills: 'Skills',
  spotify: 'Spotify',
  terminal: 'Run commands',
  todo: 'Task list',
  tts: 'Voice audio',
  video: 'Understand video',
  video_gen: 'Create video',
  vision: 'Understand images',
  web: 'Search the web',
  x_search: 'Search X'
}

export const toolFriendlyNames: Record<string, string> = {
  browser_navigate: 'Open a webpage', browser_snapshot: 'Read the page', browser_click: 'Click something', browser_type: 'Fill in text', browser_scroll: 'Scroll the page', browser_back: 'Go back', browser_press: 'Press a key', browser_get_images: 'Find page images', browser_vision: 'Look at a webpage', browser_console: 'Check page errors', browser_cdp: 'Advanced browser control', browser_dialog: 'Handle popups',
  computer_use: 'Control the desktop', terminal: 'Run a terminal command', process: 'Manage running jobs', read_terminal: 'Read the terminal', close_terminal: 'Close a terminal tab',
  read_file: 'Read a file', write_file: 'Write a file', patch: 'Edit a file', search_files: 'Find files', execute_code: 'Run Python workflow',
  web_search: 'Search the web', web_extract: 'Read a webpage or PDF', vision_analyze: 'Look at an image', image_generate: 'Create or edit an image', video_analyze: 'Understand a video', video_generate: 'Create a video', text_to_speech: 'Make voice audio',
  delegate_task: 'Ask a helper agent', clarify: 'Ask you a quick question', cronjob: 'Schedule a task', memory: 'Remember something', session_search: 'Search past chats', todo: 'Manage this task list',
  skills_list: 'Show skills', skill_view: 'Open a skill', skill_manage: 'Create or update a skill', project_list: 'Show projects', project_create: 'Create a project', project_switch: 'Switch projects',
  ha_list_entities: 'List smart-home devices', ha_get_state: 'Check smart-home status', ha_list_services: 'List smart-home actions', ha_call_service: 'Run a smart-home action',
  discord: 'Use Discord', discord_admin: 'Moderate Discord', spotify_playback: 'Control Spotify', spotify_devices: 'Choose Spotify device', spotify_queue: 'Edit Spotify queue', spotify_search: 'Search Spotify', spotify_playlists: 'Manage playlists', spotify_albums: 'Open albums', spotify_library: 'Manage saved music',
  x_search: 'Search X/Twitter', kanban_show: 'Show current task', kanban_list: 'List board tasks', kanban_complete: 'Mark task done', kanban_block: 'Mark task blocked', kanban_heartbeat: 'Post progress update', kanban_comment: 'Comment on task', kanban_create: 'Create child tasks', kanban_link: 'Link tasks', kanban_unblock: 'Unblock task'
}

export const toolFriendlyDescriptions: Record<string, string> = {
  browser_navigate: 'Open any website so Hermes can inspect or interact with it.', browser_snapshot: 'Turn the visible webpage into readable text and buttons.', browser_click: 'Click a button or link on a webpage.', browser_type: 'Type into forms, search boxes, and chat inputs.', browser_vision: 'Take a visual screenshot and reason about layout or design.', browser_console: 'Check JavaScript errors and page state.',
  computer_use: 'Use desktop apps in the background without taking over your mouse.', terminal: 'Run shell commands, tests, builds, servers, and diagnostics.', process: 'Check, stop, or read logs from long-running jobs.', read_terminal: 'Read what is visible in the embedded terminal.',
  read_file: 'Open project files, docs, spreadsheets, or notebooks as text.', write_file: 'Create or replace a file safely.', patch: 'Make targeted edits without rewriting everything.', search_files: 'Find files or search through code and docs.', execute_code: 'Run a small Python workflow when a task needs multiple steps.',
  web_search: 'Find current information online.', web_extract: 'Pull readable text from articles, docs, PDFs, and pages.', vision_analyze: 'Understand screenshots, photos, UI references, and diagrams.', image_generate: 'Generate new images or edit existing ones.', text_to_speech: 'Turn text into a spoken audio file.',
  delegate_task: 'Send a focused subtask to a background helper agent.', clarify: 'Ask you for a choice when Hermes needs direction.', cronjob: 'Run recurring checks, reminders, or automations.', memory: 'Save a durable preference or stable fact for future chats.', session_search: 'Find something from earlier Hermes conversations.', todo: 'Track multi-step work in the current session.',
  skills_list: 'See available playbooks Hermes can follow.', skill_view: 'Read a playbook before doing specialized work.', skill_manage: 'Save or improve a reusable workflow.', project_list: 'See known Hermes workspaces.', project_create: 'Create a workspace tied to a folder.', project_switch: 'Move this chat into a different workspace.'
}

export function friendlyToolsetName(toolset: string) { return toolsetLabels[toolset] || toolset.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) }
export function friendlyToolName(name: string) { return toolFriendlyNames[name] || name.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) }
export function friendlyToolDescription(name: string, fallback: string) { return toolFriendlyDescriptions[name] || fallback }
export function friendlySkillName(name = '') {
  const known: Record<string, string> = {
    'implementation-quality-workflows': 'Plan, build, and verify code', 'hermes-agent': 'Set up or fix Hermes', 'remote-access-services': 'Remote access help', 'ml-model-lifecycle': 'Manage AI models', 'lan-service-discovery': 'Find local network services', 'github-workflows': 'GitHub and pull requests', 'creative-visual-media-workflows': 'Visual design and media', 'external-platform-integrations': 'Connect outside apps', 'systematic-debugging': 'Debug a problem step by step', 'electron-desktop-app-debugging': 'Fix desktop apps', 'document-processing-and-authoring': 'Work with documents', 'dogfood': 'Test an app like a user', 'messaging-attachment-delivery': 'Send files and attachments', 'research-intelligence-workflows': 'Research and summarize', 'writing-plans': 'Write an implementation plan', 'ai-coding-agent-orchestration': 'Coordinate coding agents'
  }
  return known[name] || name.replace(/[-_]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}
