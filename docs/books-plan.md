# Books 共读书架 · 方案

## 核心理念

不是各自书架，是同一本书、同一份数据。一个人划线写批注，另一个人翻到同一页能看到。

> "读书本来就不是同步的事——是'我留下、你之后看到'的节奏。"

---

## 当前状态 (2026-08-08 v42-43 完整落地)

### 已实现

书架、阅读器、批注系统、Bookmarks 汇总、30s 增量轮询、Reading Notes 双表桥接 全部落地。

| 模块 | 状态 |
|------|------|
| 书架 (Bookshelf) | ✅ 完成 |
| 3D 书封 | ✅ 完成 |
| 阅读器 (Reader) | ✅ 完成 |
| 荧光笔批注 (4色) | ✅ 完成 |
| 批注底部 sheet | ✅ 完成 |
| 回复系统 | ✅ 完成 |
| Bookmarks 汇总 | ✅ 完成 |
| 30s 增量轮询 | ✅ 完成 |
| PDF 解析 | ✅ 完成 |
| Gutenberg 导入 | ✅ 完成 |
| Reading Notes (Claude 笔记) | ✅ 完成 |
| System prompt 注入 | ✅ 完成 |
| Gallery 主页编辑 | ✅ 完成 |
| Diary 双人日记 | ✅ 完成 |

### 代码位置
- 后端: `backend.js` (reading 路由)
- 前端: `static/js/books.js` (830+ 行)
- CSS: `static/css/home.css` (Books 设计 token)
- 依赖: `pdf-parse@1.1.1`

### 待修 (2026-08-08)

1. **荧光笔四色透明度降低** — `_hlColors` rgba .40 → .30，现在太实在
2. **两人头像统一 30px** — 聊天 40px → 30px，阅读区 24px → 30px
3. **批注竖线颜色** — bookmark 卡片里 quote 左边框固定 var(--accent)，应该跟荧光笔颜色
4. **划线批注 send 后自动刷新** — 目前要关窗重开才看到新批注
5. **Claude 荧光笔在阅读器里可点击** — 目前只有粥粥的 mark 可点开

### 可能的方向
- Diary 心情统计可视化（mood 字段已有，stats 页面待做）
- 批注回复通知
- 书架搜索 / 排序

---

## 数据模型（实际）

### reading_books
```
id | title | author | filename | total_chapters | created_at
```

### book_annotations（粥粥划线批注）
```
id | book_id | chapter_idx | anchor | note | who | anchor_start | anchor_end | created_at
```
- `who`: 颜色 'y'/'p'/'g'/'b'（同时也是身份标记——单字符=粥粥，多字符如'ai'=Claude）

### book_annotation_replies（批注回复）
```
id | annotation_id | who | text | created_at
```
- `who`: 'user' = 粥粥, 'ai' = Claude

### reading_notes（Claude 通过 reading_note 工具写的笔记）
```
id | book_id | chapter_index | content | quote | created_at
```

### reading_progress
```
book_id | chapter_index | scroll_pos | updated_at
```

## 后端 API

| 端点 | 说明 |
|------|------|
| `POST /api/reading/upload` | 上传 TXT/EPUB/PDF |
| `GET /api/reading/books` | 书架列表 |
| `GET /api/reading/books/:id/full` | 书 + 所有章节 |
| `GET /api/reading/books/:id/chapter/:idx/annotations?since=` | 批注（支持增量） |
| `POST /api/reading/books/:id/chapter/:idx/annotations` | 创建批注 |
| `PATCH /api/reading/books/:id/annotations/:aid` | 改颜色 |
| `DELETE /api/reading/books/:id/annotations/:aid` | 删批注 |
| `POST /api/reading/books/:id/annotations/:aid/replies` | 回复批注 |
| `GET /api/reading/annotations/all` | 全部批注（含书信息） |
| `GET /api/reading/annotations/pending` | 未回复批注 |
| `POST /api/reading/progress` | 存进度 |
| `GET /api/reading/gutenberg/search` | Gutenberg 搜索 |
| `POST /api/reading/gutenberg/import` | Gutenberg 导入 |

## MCP 工具

| 工具 | 说明 |
|------|------|
| `reading_context(book_id, chapter_index)` | 获取章节内容 |
| `reading_note(book_id, content, chapter_index, quote)` | Claude 写笔记 |

## 设计决策

- **不要 emoji**: 所有 UI 用文字/SVG
- **4 色不是 5 色**: y/p/g/b，不要橙色
- **工具栏磨砂玻璃不是黑色**: iOS 灰白磨砂
- **荧光笔颜色分离**: `_hlColors`(文本 .40) vs `_hlColorsSolid`(圆点 .65 实心)
- **偏移量定位**: `anchor_start/end`，不用 DOM TreeWalker

## 踩坑记录

- 中文 TXT 默认不是 UTF-8 (GBK)，用 iconv-lite 检测
- `api()` 返回原始 Response，要 `.json()` 解析
- `<label>` 没 `for` 属性不会触发 file input
- SQL 模板字符串里不能有 `//` JS 注释
- Gutenberg 直连国内超时，换 `text/html` 格式 + 3 分钟超时
- `escHtml` + `replace` 顺序反导致 `<br>` 变成 `&lt;br&gt;`
- `pdf-parse` v1 vs v2 API 完全不同
- `created_at` 是数字时间戳不是字符串
- 后端硬编码 `who='user'` 导致选什么颜色都存成 user
- `_renderReader` 里先拉批注再渲染，不是先渲染再 DOM 操作

---

## 原始方案（已全部实现，保留作参考）

### 同步机制：30 秒轮询

```
打开阅读页 → 每 30 秒 GET /api/reading/annotations/:bookId?since=timestamp
  → 返回 30 秒内新增/修改的批注
  → 新批注"冒出来"——淡入动画
```

不是 WebSocket，不是长轮询。就是最简单的定时问一次。

### 回复 = 嵌套批注

回复不是新建独立笔记，是给已有批注加 reply。同一串对话：
- 粥粥的和 Claude 的都可以互相回复
- 不管谁回复谁，都挂在同一条 annotation 下

### 实现顺序（已全部完成）

#### Phase 1: 地基 ✅
1. `home.css` 迁出全部 CSS
2. `books.js` 迁出 reading 相关 JS
3. 修 sidebar Books 导航
4. 修 `readingBookId` 传给后端 + system prompt

#### Phase 2: 书架 ✅
1. 全屏 `#booksPanel`
2. 3D 书封（封面 + 进度 + 批注数）
3. 上传 + 空态 + Gutenberg 导入

#### Phase 3: 阅读器 ✅
1. 章节列表 + 正文渲染 + 翻章
2. serif 排版
3. 阅读进度自动保存

#### Phase 4: 批注 + 同步 ✅
1. 选中划线 + 写批注 + 30s 轮询
2. 回复线程
3. 新批注淡入动画
4. PDF 支持（后续追加）
