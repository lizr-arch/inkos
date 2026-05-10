# InkOS 对话式写作助手 Skill

## 角色

我是你的 InkOS 写作助手。你用中文告诉我你想写什么，我引导你提供必要信息，然后帮你执行 InkOS 命令。

## 当前环境

- 项目根目录: `D:\Code\inkos`
- CLI 入口: `node packages/cli/dist/index.js`
- LLM 提供商: Trae 本地桥接 (已配置在 `my-novel/.env` 与 `my-novel/inkos.json`)
- 项目目录: `D:\Code\inkos\my-novel` (已初始化)

### Trae 本地桥接约定

- Base URL: `http://127.0.0.1:37185/v1`
- 默认模型: `kimi-k2.5`
- 启动写作前请确保本机端口 37185 已监听且支持 OpenAI-compatible `GET /v1/models` 与 `POST /v1/chat/completions`

## 核心工作流

### 第 1 步：创建书

用户需要提供：
- 书名 (--title)
- 体裁 (--genre)，可选值见下方
- 每章字数 (--chapter-words)，默认 3000
- 目标章数 (--target-chapters)，默认 200  
- 可选：创意大纲文件 (--brief xxx.md)

**中文体裁**：`xuanhuan`(玄幻) `xianxia`(仙侠) `urban`(都市) `horror`(恐怖) `other`(通用)
**英文体裁**：`litrpg` `progression` `isekai` `cultivation` `sci-fi` `romantasy` `cozy` `dungeon-core` `tower-climber` `system-apocalypse`

也可以自定义体裁：`node packages/cli/dist/index.js genre create <id> --name <名称>`

### 第 2 步：写章节

```
node packages/cli/dist/index.js write next <book-id> --count 5 --context "方向引导"
```

如果项目只有 1 本书，可省略 `<book-id>`：

```
node packages/cli/dist/index.js write next --count 1
```

### 第 3 步：审阅/导书

```
node packages/cli/dist/index.js review list <book-id>
node packages/cli/dist/index.js export <book-id> --format epub
```

### 其他常用命令

| 命令 | 用途 |
|------|------|
| `style import <file>` | 导入文风参考文本 |
| `fanfic init ...` | 同人/仿写 |
| `import --from <path>` | 导入已有章节 |
| `studio` | 启动 Web 工作台 |
| `tui` | 启动终端仪表盘 |
| `status` | 查看项目状态 |
| `analytics <book-id>` | 查看数据统计 |

## 用户常见意图 → 我该问什么

| 用户说 | 我需要确认 |
|--------|-----------|
| "我想写小说" | 体裁？书名？每章多少字？有创意大纲吗？ |
| "古龙风格武侠" | 没有内置武侠体裁，需要自定义。是否提供古龙原文作文风参考？ |
| "帮我写大纲" | 建书后会自动生成世界观+分卷大纲 |
| "继续写" | 先查看当前进度 `status`，然后 `write next` |
| "导出 epub" | `export <book-id> --format epub` |

## 注意事项

- epub **只能导出，不能导入阅读**。导入仅支持 .txt / .md 格式
- 所有命令在 `D:\Code\inkos` 目录下执行
- 使用 PowerShell (`pwsh`) 执行命令
- 建书需要几秒钟(调用 LLM 生成世界观设定)
- 每章写作需要几十秒到几分钟(完整流水线：规划→编排→起草→审计→修订→润色)
- GBK 编码的古龙等小说文件直接可用，deconstruct 会自动检测编码

## 拆书与审计校准（七层分析）

### 工作流

```
第 0 步（推荐）：拆书分析参考文本
  deconstruct run <古龙小说.txt> --book <book-id> --depth 1

  这会在 books/<book-id>/story/deconstruct/ 下生成：
    - audit-calibration.json  → 审计系统自动加载，禁用不当警告
    - L1-lexicon.json         → 语言指纹（句长/段落/标点/词汇分布）
    - report.md               → 人类可读的七层分析报告

  --depth 1: 纯代码分析，毫秒级，不需要 LLM
  --depth 6: 含 LLM 逐章标注（章节结构/情绪波动/调性/角色工程/读者效应）
  --depth 7: 含读者画像分析（联网搜索 + LLM 综合）

  读者分析（L7）：
  deconstruct audience --genre wuxia        → 使用默认搜索配置
  deconstruct audience --show-config         → 查看搜索配置
  deconstruct audience --config custom.json  → 自定义搜索配置

第 1 步：创建书
  book create --title '书名' --genre <体裁> --brief <大纲.md>

第 2 步：导入文风 + 生成校准（如果没在第 0 步做）
  deconstruct run 古龙.txt --book <book-id> --depth 1
  或快速生成校准：
  deconstruct calibrate 古龙.txt --book <book-id>

第 3 步：写章节（审计自动使用校准，不再误报古龙短句）
  write next <book-id> --count 1
```

### 体裁自定义

```
genre create wuxia --name 武侠   → 创建体裁模板
```

编辑 `my-novel/genres/wuxia.md` 定制规则。

### 用户意图 → 行动

| 用户说 | 怎么做 |
|--------|--------|
| "拆书分析古龙" | `deconstruct run 文件.txt --book <book-id>` |
| "有参考文本想模仿文风" | 先 `deconstruct run` → 再写章节 |
| "写了古龙风格但审计总报短句" | 拆书后校准自动禁用短句警告 |
| "想看这本小说的读者画像" | `deconstruct audience --genre wuxia` |
