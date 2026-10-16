<div align="center">

<img src="docs/images/banner.svg" width="100%" alt="dsh-plugin-capabilities — 在 dsh 设置页管理技能与 MCP 服务器" />

[![npm version](https://img.shields.io/npm/v/dsh-plugin-capabilities?color=38bdf8&label=npm)](https://www.npmjs.com/package/dsh-plugin-capabilities)
[![downloads](https://img.shields.io/npm/d18m/dsh-plugin-capabilities?color=38bdf8&label=downloads%20%2F%2018m)](https://www.npmjs.com/package/dsh-plugin-capabilities)
![dsh runtime](https://img.shields.io/badge/dsh%20runtime-0.1.1%20~%200.2.1%20tested-4c6ef5)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-64748b)
[![License: MIT](https://img.shields.io/badge/license-MIT-22c55e)](./LICENSE)

**在 dsh 设置页管理技能与 MCP 服务器。** 技能目录、仓库、项目技能、导入与两层 MCP 行，一个分区全搞定。

<sub>Skills &amp; MCP servers, managed in place — right from the DSH settings page.</sub>

[功能总览](#功能总览) · [技能](#技能) · [MCP](#mcp) · [市场](#市场) · [安装](#安装) · [工作原理](#工作原理)

</div>

## 这是什么

在 dsh 设置页新增一级分区「技能与 MCP」（与「通用设置」「模型」并列），内含「技能」「MCP」「市场」三个标签页：技能目录、自定义技能仓库和两层（profile / 全局）MCP 服务器行都能在页面上直接维护，不必手工编辑 YAML。Claude Code、Codex、Cursor、Gemini CLI 等其他 agent 的技能与 MCP 配置也能一键纳入。

在 `dsh web`（含桌面端内嵌的 Web 界面）中均可使用；从 0.1.1 到 0.2.1-alpha 的各代运行时均实测兼容。

## 功能总览

| 能力 | 说明 |
|:--|:--|
| 🗂 **技能目录** | 全量技能列表：搜索、来源筛选、调用开关、就地编辑、新建、删除，保存后数秒生效 |
| 🌐 **Agent 技能扫描** | Claude Code、Codex、Gemini CLI、Cursor 等 16 个 agent 的技能目录自动纳入，零拷贝、原地同步 |
| 📁 **项目技能** | 工作区下拉切到具体项目，`.dsh/skills` 与 `.agents/skills` 直接管理，与全局目录互不干扰 |
| 📥 **技能导入** | 文件夹、单个 `.md`、ZIP 三路导入，自带 zip-slip 防护，同名冲突可跳过或覆盖 |
| 🗃 **技能仓库** | 本地目录或 GitHub `owner/repo` 注册为仓库，仓库布局自动识别，增删即时生效 |
| 🔌 **MCP 管理** | stdio 与 streamable-http 全支持，profile 与全局两层合并展示，页面完成增删改与可达性检查 |
| 🌍 **MCP 导入** | 一键扫描 Claude Code、Codex、Cursor、Gemini CLI 的 MCP 配置，选层勾选即成行 |
| 🏪 **市场** | 精选技能仓库与 MCP 服务器，点开详情、一键安装 |

## 安装

```sh
dsh plugin --profile web add dsh-plugin-capabilities
```

本地源码检出也可直接安装（`prepare` 自动构建）：

```sh
dsh plugin --profile web add file:/path/to/dsh-plugin-capabilities
```

## 技能

<p align="center"><img src="docs/images/screenshot-skills.png" width="88%" alt="「技能」标签页"></p>

列出 dsh 当前发现的全部技能，带名称、描述、来源与调用策略，列表带搜索与来源筛选，卡片上可一键打开技能所在文件夹。

- **用户级技能（`$DSH_HOME/skills`）**：可在页面上新建、编辑、删除，文件保存后数秒生效、无需重启。
- **就地编辑已安装技能**：从市场或仓库安装的技能也能编辑，写回只替换编辑器掌握的几个键，frontmatter 其余内容（license、allowed-tools 等）原样保留。
- **每个落盘技能都有开关**：关掉即从模型目录与 `/` 命令摘除，打开恢复默认，文件其余内容一字不动。

### Agent 技能扫描

本机其他 agent 的技能目录会自动纳入扫描，零拷贝、原地同步：Claude Code、Codex、Gemini CLI、Cursor、GitHub Copilot、Windsurf、OpenCode、Trae（含 CN）、Roo Code、Qoder（含 CN）、CodeBuddy、WorkBuddy、OpenClaw 与 CC Switch，目录存在才扫。技能嵌在 marketplace 之类的子目录里也能找到——插件会定位嵌套的技能文件夹并把它的父目录挂进扫描。目录来源在列表里按 agent 名标注（Claude Code、Codex……），可按来源筛选；装了新的 agent 后重启 dsh 即纳入。

插件还随包自带 skill-creator 与 find-skills 两条只读技能（来自 [anthropics/skills](https://github.com/anthropics/skills) 与 [vercel-labs/skills](https://github.com/vercel-labs/skills)），随插件升级与卸载。

### 项目技能

「技能」页顶部的工作区下拉列出 dsh 已登记的工作区；选定后列表即针对该工作区——项目里的 `.dsh/skills` 与 `.agents/skills` 会进入目录（`项目` 标签），可查看、开关与就地编辑 `.dsh/skills` 里的技能，与全局目录互不干扰。切回「全局」即回到默认视图。

### 导入技能

「导入技能」支持三种来源：文件夹（单个技能目录，或装着多个技能与散装 `.md` 文件的集合）、单个 `.md` 文件、ZIP 压缩包（≤32 MiB，自动穿透 GitHub 式的仓库包装目录）。目的地可选用户目录（`DSH_HOME/skills`）或某个工作区的 `.dsh/skills`（确认后自动创建）；同名冲突可跳过或覆盖，逐条结果当场列出。导入的技能按 frontmatter 的 `name`（缺省时按文件夹/文件名归一成 kebab-case）落盘，装完即被目录发现，无需重启。

### 技能仓库

支持两类来源：本地目录（直接扫描，删除仓库不动原文件）与 GitHub 仓库（`owner/repo`，可 `#分支` 锁定版本，经 tarball 下载解包到 `DSH_HOME`，无需安装 git）。仓库布局自动识别——单技能居根、各占子目录或集中在二级目录都能找到；增删即时生效，无需重启。

## MCP

<p align="center"><img src="docs/images/screenshot-mcp.png" width="88%" alt="「MCP」标签页"></p>

管理 `@deepseek-ai/dsh-mcp-client` 服务器行，stdio 与 streamable-http 均支持。

- **就地增删改**：添加、编辑、停用、移除都在页面完成。YAML 走文档树读写，文件里的其他行与注释不受影响；补丁文件本身有语法错误时，页面直接报出路径与行列、不写入任何内容。
- **两层合并**：profile 层与全局层（`DSH_HOME/cordis.patch.yml`）合并展示，每行标记所在层，同名时注明谁生效；添加与复制可任选目标层。
- **检查不启动服务器**：stdio 在 PATH 里确认命令存在，http 发一个短超时 GET 即判断可达。
- **双向互转**：表单同时给出与保存结果一致的完整 YAML 行和等价的 `mcpServers` JSON 写法，直接抄去别的工具；反过来把 Claude Code 配置或任意 JSON 粘进输入框，点「解析并填充」即可自动填好。
- **从其他 agent 导入**：一键扫描 Claude Code、Codex、Cursor、Gemini CLI 的 MCP 配置，弹窗里选写入层、勾选条目即成行（Claude 配置里的 `${VAR}` 按字面值导入，需要时导入后改回）。
- **免离开的重启**：MCP 变更需重启 dsh 生效，页头的「重启」按钮不必离开界面——桌面端由壳层重启 sidecar，独立 `dsh web` 由插件接力重启，页面恢复后自动刷新。

## 市场

<p align="center">
  <img src="docs/images/screenshot-market-skills.png" width="49%" alt="「技能市场」">
  <img src="docs/images/screenshot-market-mcp.png" width="49%" alt="「MCP 市场」">
</p>

「技能市场」是精选的技能仓库（Anthropic 官方技能集、Superpowers 工作流集等），点「安装」即走上文仓库的下载解包流程，装完立即出现在「技能」页；「MCP 市场」是精选服务器列表（filesystem、memory、git 及 context7 等常用第三方），点「添加」等价于手工添加一条服务器行，写入哪一层跟随列表上方的范围选择。条目都可点开看详情：技能仓库列出内含技能清单，MCP 服务器列出启动命令、环境变量与工具清单。列表来自[本仓库](https://github.com/qinyre/dsh-plugin-capabilities)的在线索引，离线时回退包内快照；已安装条目可直接卸载。

## 工作原理

服务端在 web 服务器上注册 `/dsh-plugin-capabilities/*` 路由，并在宿主平面挂载自己的 filesystem provider 子插件以获得实时技能目录——其他 agent 的目录与用户注册的仓库作为额外扫描根，随插件装卸，不动 preset 层语义。GitHub 仓库由内置纯 JS tar 读取器解包，全程不 spawn 子进程；写操作带同源栅栏与输入校验（技能名、serverName 语法、路径穿越拒绝）。官方桌面壳转发而来的请求没有 Origin 头，仅当回环 Host、回环连接对端、无代理痕迹且无跨站 Sec-Fetch-Site 标记时放行。

## 开发

```sh
npm install
npm run typecheck
npm test
npm run build
```

端到端 smoke 默认关闭，要求同级目录下存在 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 源码检出且 Node ≥ 22.19：`DSH_DESKTOP_PLUGIN_SMOKE=1 npm test`。

## 许可

[MIT](./LICENSE)

---

<div align="center">
<sub>觉得好用的话，去 <a href="https://github.com/qinyre/dsh-plugin-capabilities">仓库首页</a> 点一个 ⭐ Star 是最快的鼓励。</sub>
</div>
