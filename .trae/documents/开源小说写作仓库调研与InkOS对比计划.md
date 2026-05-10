# 开源小说写作仓库调研与 InkOS 横向对比：实施计划

## Summary
本计划用于对以下开源项目进行深度调研与多维度对比，并与当前仓库 **InkOS** 做横向分析，产出一份可用于选型/改造/对标的中文研究报告（带来源引用与结论建议）。

调研对象（按你前序提到的“这几个”）：
- novelWriter（vkbo/novelWriter）
- Manuskript（olivierkes/manuskript）
- oStorybook（ostorybook：主仓在 Framagit，官网提供开发入口）
- AI-Novel-Writing-Assistant（ExplosiveCoderflome/AI-Novel-Writing-Assistant）
- NovelForge（RhythmicWave/NovelForge）
- ai-novel（leehong0704/ai-novel）
- 对比基准：本仓库 InkOS（d:\Code\inkos）

## Current State Analysis (Grounded)
### InkOS（本地仓库可直接审阅）
- 定位：更偏“小说生产流水线/编排器”，而非“沉浸式编辑器”。
- 关键能力（代码入口可定位）：
  - 产章编排与闭环：pipeline runner（write→audit→revise→polish→persist→snapshot→drift guidance）
  - 状态与真相文件：truth files + 结构化 state + snapshots
  - 守护进程调度：daemon scheduler（定时写作/检测/退避/上限）
- 关键文件入口（将在执行阶段逐一引用行号）：
  - packages/core/src/pipeline/runner.ts
  - packages/core/src/pipeline/chapter-review-cycle.ts
  - packages/core/src/state/manager.ts
  - packages/core/src/state/runtime-state-store.ts
  - packages/core/src/llm/service-presets.ts、packages/core/src/llm/provider.ts

### 外部仓库（WebFetch 可获取 README/目录信息）
- novelWriter、Manuskript、AI-Novel-Writing-Assistant、NovelForge、ai-novel：GitHub 页面可抓取 README 与仓库信息。
- oStorybook：GitHub 上的组织仓库并非主源码；开发文档指向 Framagit 主仓与构建方式（NetBeans/Eclipse + Java）。后续将以其官网开发者页与 Framagit 作为主要来源。

## Research Method (What “深度” means)
对每个项目都按同一模板拆解，保证可比性与可复用性：
1) **产品定位与目标用户**：是编辑器/规划工具/资料库/AI 生产系统/Agent 编排器？
2) **工作流与核心对象模型**：章节/场景/卡片/人物/世界观/知识库/审核结果等对象怎么组织？流程是否可恢复？
3) **架构与技术栈**：前端/后端/桌面端/服务端、语言框架、模块边界、可部署形态。
4) **数据与持久化**：纯文本/单文件项目/SQLite/Neo4j/Qdrant 等；备份迁移与可版本控制性。
5) **一致性与“长期记忆”**：摘要/人物状态增量、伏笔账、知识图谱、RAG、压缩策略、漂移纠偏。
6) **模型接入与路由**：多供应商、分模块选模、OpenAI-compatible、工具调用、结构化输出/JSON 修复。
7) **可控性与质量门控**：审核链路、字数控制、失败重试、检查点、人工确认点（human-in-the-loop）。
8) **中文网文适配**：字数统计口径、章节节奏、标点与排版导出、敏感词、连载式持续推进。
9) **维护与风险**：许可证、活跃度、发布节奏、社区响应、依赖与供应链风险。

## Proposed Changes / Deliverables
执行完成后，在对话中交付三类结果（不额外创建文档文件，除非你明确要求）：
1) **逐项目深度画像**（6 个项目 + InkOS），每个项目一节，含：
   - 关键能力清单
   - 架构/数据/工作流图的文字版拆解
   - “适合谁/不适合谁”
   - 主要风险与验证清单
   - 引用来源（README/Docs/代码/官网）
2) **多维度横向对比矩阵**（表格形式输出在聊天中）：
   - 维度：定位、自动化程度、状态/记忆、一致性门控、编辑体验、部署成本、扩展性、中文适配、license、成熟度
3) **InkOS 对标建议**：
   - InkOS 当前强项/短板（基于本地代码）
   - 借鉴路线：分别从 NovelForge、AI-Novel-Writing-Assistant、ai-novel、novelWriter/Manuskript 可抄的模块化做法
   - 如果目标是“中文网文长篇稳定生产”，给一条优先级明确的改造路线（仅建议，不直接改代码）

## Execution Steps (Read-only during planning; actions in execution)
### Phase A — 建立对比框架（一次性）
- 固定对比维度与评分口径（上面的 1–9 项）。
- 为每个项目准备信息采集清单（README、架构目录、配置示例、运行方式、license、releases）。

### Phase B — 外部项目逐个深挖（按项目）
对每个 GitHub 项目：
- 抓取 README（必要时补抓 docs/运行指南/架构说明/变更日志）。
- 抓取仓库根目录结构（用于定位模块边界：client/server/desktop/backend/frontend 等）。
- 抽取并归纳：工作流、数据结构、模型接入、质量门控、部署方式。

对 oStorybook：
- 以官网开发者页为准定位主仓（Framagit）与构建依赖。
- 若 Framagit 页面可访问：抓取主仓结构与用户手册关键页；若不可访问：仅基于官网开发者页与下载页做“可核验结论”，并明确“信息缺口与原因”。

### Phase C — InkOS 深入剖析（本地代码）
- 追踪“写下一章”主链：write→audit→revise→polish→persist→snapshot→drift guidance（引用关键函数与文件）。
- 梳理数据面：books、truth files、runtime state、snapshots、audit drift、session transcript。
- 梳理 LLM 面：服务预设、/models 探测、apiFormat、modelOverrides、端点 auth 策略。

### Phase D — 横向对比与结论
- 用矩阵统一归类优劣势。
- 给出按不同目标的推荐：
  - “沉浸式写作与资料管理”
  - “AI 辅助但作者强把控”
  - “AI 导演式长篇生产系统”
  - “中文网文持续产出与一致性门控”
- 给出 InkOS 的对标落点与优先级建议。

## Assumptions & Decisions
- 不新增或修改任何业务代码；本任务仅为调研分析与对比输出（除非你后续明确要求“把某个能力落到 InkOS”）。
- “深度调研”以官方 README/文档/可抓取页面为主，必要时使用仓库结构与关键文件定位佐证；对无法访问的站点会明确标注信息缺口与替代来源。
- 输出语言：中文；引用使用可点击的来源链接（GitHub/官网/本仓库 file:// 链接）。

## Verification (How we know it’s done)
- 每个项目至少满足：
  - 有“定位/架构/数据/工作流/模型/质量/中文适配/风险”的完整小节
  - 至少 3 处可核验来源链接（README/Docs/Releases/关键页面）
- InkOS 小节包含：
  - 至少 8 个关键文件的可点击 file:// 引用
  - 覆盖 pipeline、state、llm、daemon 四个方面
- 横向矩阵覆盖全部项目，且结论与来源一致、不互相矛盾。

