# dsh-plugin-capabilities

[![npm version](https://img.shields.io/npm/v/dsh-plugin-capabilities)](https://www.npmjs.com/package/dsh-plugin-capabilities)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

在 dsh 设置页管理技能与 MCP 服务器。本插件在设置里新增一级分区「技能与 MCP」（与「通用设置」「模型」并列），内含「技能」「MCP」「市场」三个标签页：技能目录、自定义技能仓库和 profile 的 MCP 服务器行都能直接在页面上查看与维护，不必手工编辑文件；来自 Claude Code、Codex 等其他 agent 的技能与 MCP 配置也能一并纳入，市场里还有一份精选列表可一键安装。`dsh web` 与 [DSH Desktop](https://github.com/qinyre/dsh-Desktop) 均可使用。

## 技能

![「技能」标签页](docs/images/screenshot-skills.png)

「技能」页列出 dsh 当前发现的全部技能，包括名称、描述、来源（项目、用户、内置、运行时、自定义）和调用策略。用户级技能存放在 `$DSH_HOME/skills`，可以在这里新建、编辑、删除：frontmatter 与正文分开填写，保存后写入对应的 `SKILL.md`。0.3.4 起从市场或本地仓库安装的技能也能就地编辑：写回只替换名称、描述、whenToUse 与调用策略这些编辑器掌握的键，文件里其余 frontmatter（license、allowed-tools 等）原样保留。技能目录处于文件系统监听之下，保存后数秒内条目就会出现在列表里，无需重启。项目目录和内置包等来源的技能以只读方式展示，可以查看全文。

只要技能落在磁盘上（无论哪个来源），卡片左侧的开关都能控制是否加载：关掉会在它的 `SKILL.md` frontmatter 里写入 `disable-model-invocation: true` 与 `user-invocable: false`，模型目录和 `/` 命令同时摘除；打开则恢复默认策略。文件其余内容一字不动，全部来源的技能用的是同一套策略键，所以开关在任何提供方上都生效。运行时注册、没有文件的技能没有开关。卡片上还有「打开目录」按钮，一键在系统文件管理器里定位技能所在文件夹；列表多了以后，顶部的搜索框和来源筛选片可以按名称、描述、来源快速过滤。

如果机器上存在 Claude Code 或 Codex 的技能目录（`~/.claude/skills`、`~/.codex/skills`），它们会作为额外的扫描根自动进入目录。文件不会被复制，改动留在原地，两边实时同步。

### 技能仓库

列表下方是「技能仓库」管理区，可以手动添加两类来源：本地目录（直接扫描，零拷贝，删除仓库不会动到你的文件）和 GitHub 仓库（支持 `https://github.com/owner/repo`、`owner/repo`，可用 `#分支` 或 `/tree/分支` 锁定版本；通过 GitHub 的 tarball 接口下载解包到 `$DSH_HOME/dsh-plugin-capabilities/`，机器上不需要装 git）。仓库布局自动识别——单个技能放在仓库根、多个技能各占一个子目录、或者集中在 `skills/` 之类的二级目录里，都能找到。添加或移除仓库会即时重挂载扫描提供方，目录随之增减，全程无需重启。仓库记录持久化在 `$DSH_HOME/dsh-plugin-capabilities/state.json`，随时可以整目录备份或手工修正。

本插件还自带两条只读技能：skill-creator（创建与迭代改进技能，来自 [anthropics/skills](https://github.com/anthropics/skills)，Apache-2.0）与 find-skills（发现并安装社区技能，来自 [vercel-labs/skills](https://github.com/vercel-labs/skills)，MIT）。它们随插件进入扫描目录，设置页里来源显示为「自定义」，会话中可直接调用；升级插件即更新、卸载插件即移除，不向 `DSH_HOME` 写入任何文件。

## MCP

![「MCP」标签页](docs/images/screenshot-mcp.png)

「MCP」页管理 profile patch 中的 MCP 服务器行，每行对应一个 `@deepseek-ai/dsh-mcp-client` 实例。stdio 服务器填写命令与参数，streamable-http 服务器填写 URL，编辑、停用、移除都在页面上完成。YAML 读写采用文档级 API，文件中的其他行与注释不受影响。新行写在一个 `- insert:` 块里——加载器只会挂载 insert 形式的行，裸的 `- id:` 条目是对已有行的覆盖，目标不存在时会被跳过；0.1.3 之前写入的裸行会在下一次保存时自动迁入 insert 块。0.3.7 起，若 `cordis.patch.yml` 本身存在语法错误（多见于手工编辑失误），页面会直接报出文件完整路径与出错行列，并且不写入任何内容；此前这种文件会在保存时抛出内部的 "Document with errors cannot be stringified"，让人无从下手。

服务器行不只存在于 profile 里。dsh 还有一层全局补丁（`DSH_HOME/cordis.patch.yml`），对这台机器上的所有 profile 生效，组合时排在 profile 层之后、同名 id 以全局为准。0.3.8 起，「MCP」页把两层合在一起展示：每行带「全局」或「当前 profile」标记，两层出现同名 id 时 profile 行会注明自己不生效。添加服务器时可以选择写入哪一层，编辑、停用、移除也都落在该行所在的层。全局文件损坏不会连累整个页面：profile 行照常列出，顶部横幅单独报出全局文件的路径与出错行列。

添加或编辑服务器时，表单下方有「完整格式与快速填充」区：一边是随表单实时更新的完整 YAML 行（和保存后落进 `cordis.patch.yml` 的一模一样），另一边是等价的 `mcpServers` JSON 写法，可以直接抄去别的工具。反过来也行——把 Claude Code 配置、官方文档或任意 JSON 粘进输入框，点「解析并填充」，服务器名、命令、参数、环境变量、URL、请求头都会自动填好，`{"mcpServers": {...}}` 包装、裸条目、dsh 行三种形状都认。

也可以从其他 agent 导入：一键扫描 Claude Code（`~/.claude.json`、`~/.claude/settings.json`）与 Codex（`~/.codex/config.toml`）的 MCP 配置，勾选所需条目后转为本 profile 的服务器行。弹窗按来源分成 Claude Code 和 Codex 两组，各自带数量与「全选」；stdio 与 http 两种传输都会处理，已存在的同名服务器置灰跳过。需要注意的是，Claude 配置里的 `${VAR}` 环境变量引用按字面值导入，如有需要请在导入后手动改回。

MCP 行的变更需要重启 dsh 才会进入组合。MCP 页头部有常驻的「重启」按钮，变更后无需离开界面：在 [DSH Desktop](https://github.com/qinyre/dsh-Desktop) 中由桌面壳层重启受监督的 sidecar，完成后窗口自动重载；直接运行 `dsh web` 时插件会拉起一个替代进程再退出自身，页面在恢复后自动刷新——若启动时端口是随机的，按横幅提示在终端查看新地址。重启会中断正在进行的回合，点击后会先弹出确认。

## 市场

![「技能市场」](docs/images/screenshot-market-skills.png)

![「MCP 市场」](docs/images/screenshot-market-mcp.png)

「市场」页分两栏：「技能市场」是精选的技能仓库（Anthropic 官方技能集、Superpowers 工作流集等），点「安装」走的就是上文 GitHub 仓库的下载解包流程，装完立即出现在「技能」页；「MCP 市场」是一份精选服务器列表（官方 filesystem/memory/git 等，加上 context7 这类常用第三方），点「添加」直接写入一条 profile 服务器行，和手工添加完全等价。0.3.0 起点开条目可以看详情：技能仓库列出里面具体有哪些技能，MCP 服务器列出启动命令、需要的环境变量和提供的工具，不必再去 GitHub 主页。列表数据来自[本插件仓库](https://github.com/qinyre/dsh-plugin-capabilities)的在线索引（`market/*.json`），离线时自动回退到包内快照；需要 API 密钥的服务器会在卡片上标出环境变量名，装好后到 MCP 列表里补填即可。已安装的条目可以直接卸载：技能仓库走仓库移除，MCP 行走服务器删除。

## 安装

```sh
dsh plugin --profile web add dsh-plugin-capabilities
```

安装后打开设置，即可在一级导航里看到「技能与 MCP」分区（位于「模型」与「插件」之间）。开发时也可以直接安装本地源码检出：`dsh plugin --profile web add file:/path/to/dsh-plugin-capabilities`，包内的 `prepare` 脚本会自动构建出 `lib/`。

## 工作原理

服务端 inject `webServer` 与 `skills`，在 web 服务器上注册 `/dsh-plugin-capabilities/*` 路由。Web 组合有意禁用了宿主平面的 `skill-filesystem` 行（会话内的技能发现归 agent preset 所有），本插件因此在宿主平面挂载自己的 filesystem provider 子插件，并把其他 agent 的技能目录与用户注册的技能仓库作为额外扫描根传入：子插件随本插件卸载而卸载，技能注册进全局层，preset 层语义不变，设置页由此获得实时目录；仓库增减时直接 dispose 并按新的根集合重挂载，不惊动宿主。GitHub 仓库的解包由插件内置的纯 JS tar 读取器完成（zlib 解压 + USTAR/GNU 长名/PAX path 解析，逐条做逃逸检查与体积上限），sidecar 全程不 spawn 任何子进程。「打开目录」经服务端解析真实路径后唤起系统文件管理器，浏览器只传目标标识不传路径。写操作设有同源（CSRF）栅栏与输入校验——技能名 kebab-case 语法、MCP serverName 语法、路径穿越拒绝。

## 开发

```sh
npm install
npm run typecheck
npm test
npm run build
```

端到端 smoke 默认关闭，要求同级目录下存在 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 源码检出，且 Node ≥ 22.19：

```sh
DSH_DESKTOP_PLUGIN_SMOKE=1 npm test
```

它会创建临时 `DSH_HOME`，把本插件装进 `web` profile，启动 `dsh web`，验证技能写入→目录监听→列表更新的完整链路，以及 MCP 行的写入与读回。

## 许可

[MIT](./LICENSE)
