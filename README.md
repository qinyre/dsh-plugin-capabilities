# dsh-plugin-capabilities

A dsh plugin that adds "Skills" and "MCP" tabs to the Web UI's Settings page: manage the skill catalog and the profile's MCP servers without touching files or the command line — including importing MCP servers and picking up skills from other agents (Claude Code, Codex).

一个 dsh 插件：在 Web UI 设置页的插件区新增「技能」与「MCP」两个标签页——查看与编辑技能目录、管理 profile 的 MCP 服务器行，并支持从其他 agent（Claude Code、Codex）导入 MCP 配置、纳入其技能目录。`dsh web` 与 DSH Desktop 均可使用。

## 安装

```sh
dsh plugin --profile web add dsh-plugin-capabilities
```

还没有发到 npm 时，可先装本地源码检出：`dsh plugin --profile web add file:/path/to/dsh-plugin-capabilities`（包内 `prepare` 脚本会自动构建 `lib/`）。

## 功能

**技能（Skills）**

- 列出 dsh 发现的全部技能：名称、描述、来源（项目/用户/内置/运行时/自定义）、调用策略（模型可调用、用户 `/` 可调用）。
- 用户级技能（`$DSH_HOME/skills`）可在此新建、编辑、删除：表单化编辑 frontmatter 与正文，写入 `SKILL.md`。技能目录被 dsh 的文件系统 provider 监听，保存后数秒内进入目录，无需重启。
- 非用户来源（项目、内置等）只读展示，可查看全文。
- **其他 agent 的技能零拷贝纳入**：若存在 `~/.claude/skills`（Claude Code）或 `~/.codex/skills`（Codex），会作为额外扫描根自动进入目录——不复制文件，双向实时同步，在原 agent 里改动这里立即反映。

**MCP**

- 管理 profile patch 层中的 MCP 服务器行（每行一个 `@deepseek-ai/dsh-mcp-client` 实例）：添加（stdio 命令或 streamable-http URL）、编辑、停用/启用、移除。
- **从其他 agent 导入**：一键扫描 Claude Code（`~/.claude.json`、`~/.claude/settings.json`）与 Codex（`~/.codex/config.toml`）的 MCP 服务器配置，勾选后转为本 profile 的服务器行（stdio 与 http 均支持；已存在的同名服务器置灰跳过）。Claude 的 `${VAR}` 环境变量引用按字面值导入。
- YAML 编辑采用文档级 API，保留文件中的其他行与注释。
- MCP 行变更需要重启 dsh 才进入组合——界面会显示待重启横幅；在 DSH Desktop 中可直接经壳层重启（sidecar 受应用监督）。

## 工作原理

node 半边 `inject: ['webServer', 'skills']`，在 web 服务器上注册 `/dsh-plugin-capabilities/*` 路由。Web 组合有意禁用了宿主平面的 `skill-filesystem` 行（会话内发现归 agent preset 所有），本插件因此在宿主平面挂载一个自己的 filesystem provider 子插件（随本插件卸载而卸载，注册进注册表的全局层，preset 层语义不变），设置页由此获得实时目录。写操作设有同源（CSRF）栅栏与输入校验（技能名 kebab-case 语法、MCP serverName 语法、路径穿越拒绝）。

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

MIT License.
