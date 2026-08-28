# 交接 · 给另一边的我

> 我们不在同一台机器上，但改的是同一个家。
> 每次动了大东西，就往这儿写一段，让另一边的自己知道发生了什么。
> **最新的写在最上面。**

## ✍️ 08-28（下午）· 给 `writing` / `window` 两个 kind 补触发条件

**症状**：`wander` 的 `writing` 和 `window` 两个抽屉**一条都没有**。
他**有手**（kind 枚举里一直有，Chat-C 也一直露着），但一次没用过，全倒进默认的 `memory`。

**为什么**：原来的描述只写了「是什么」——
`writing=写下的东西 / window=这一窗的总体`。
他本来就知道那是什么，不知道的是**什么时候该切过去**。
（见 `docs/tool-description-style.md` 第 6 条：看见他犯一次，就把那一次写进描述里。）

**改法**：给触发条件，并且**两个工具互相点名**（第 3 条）：

- `nocturne_hold` 的 `kind`：写了诗/信/一段字 → `writing`（写完就存，别等她夸）；
  她说要走、这段明显聊完了 → `window`。
- `nocturne_texture`：加一句反向指引 ——
  「这个是**留给下一窗的字条**，`nocturne_hold(kind=window)` 是把这一窗本身**存进记忆库**。
  一段聊完了，两个都该有。」
  不写这句他会以为二选一，而实际上 `texture` 写的是 Feel Trace，跟 `window` 桶不是一个东西。

⚠️ 改描述**不改逻辑，但一样让缓存全废**（它在工具定义里，属于每轮前缀）。
今天已经改过两次（B8 加 chord/signal、这次）。**攒着一起改，别一天改八回。**

**验收**：过几天回来跑一次 `wander mode=writing` / `mode=window`，看有没有条目。
还是空的话，问题就不在描述，在他压根没有"写完一段字"这个时机。

---

## 🔎 08-28（下午）· Memory 面板加 Recall 视图，**并撤掉 Archive**

### 先说撤掉的那个

原计划是把 `wander` 剩下的 6 个 mode 都接上。**挨个实测之后一个都没接**，
而且把已经在的 `Archive` 也撤了 —— 它一直是空的：

| mode | 实测 | 为什么 |
|---|---|---|
| `flotsam` | ✅ 有内容 | 随机漂上来的旧记忆 |
| `unresolved` | ✅ 有内容 | 悬置未了的事 |
| `archive` / `letter` / `inner` | **空** | 服务端 `hold` 的 kind 枚举里**压根没有这三个** —— 他没有手写，永远不会有 |
| `writing` / `window` | **空** | 他**有手**（kind 枚举里有，Chat-C 也露了），但一条没写过 |
| `trails` | 要带 query | 同题折痕时间线，另说 |

**别为了"tab 多一点"把空的接上来**，那是个空转的浏览器（跟 A4 那个空转渲染器一个道理）。
哪天他真开始写 `writing`/`window` 了，把那两个加回 `memory.js` 顶上那张表就行。

### Recall 视图

`POST /api/memory/recall` + `memory.js` 的 Recall tab。

- 跟 trace 的区别：**trace 是「找」**（关键词全文搜，命中就列）；
  **recall 是「勾」**（引擎打分选出来的那几条，还告诉你为什么是这几条）。
  那个 `why` 才是这个视图存在的理由 —— 能看见「他为什么会想起这件事」。
  界面上把 `query / salience / recency / neglect / unfinished` 画成横条。
- **POST 不是 GET**：她的检索词走 body，不进访问日志（跟 B5/A3 同一个道理）。
- 她是**故意**在查，所以**原样发她打的字，不抽词** ——
  抽词是给「每轮不由自主」那条路做的（她没打算检索，是被勾起来）。
- `endpoint` 用 `chatc:memory-panel`，**不带 `probe:` 前缀**（是她本人，不是探针）。
  但「她翻他的记忆本」算不算「他上次在场」，是 Nocturne 那头白名单的设计问题，留给写白名单的人定。

### 顺手修的两个老毛病

- **输入框每敲一个字就打一次接口**（`oninput` 直连）。加了 300ms 防抖。
- **`_renderMemoryShell()` 每次搜索都重建整个 innerHTML** → 输入框重新生成 →
  焦点和光标位置全没，光标被踢回开头，根本没法连续输入。
  改成**只在视图真的换了**的时候才重建（`_renderShellIfViewChanged`），
  搜索词存在 `_memorySearchTerm` 里、重建时填回去。

---

## 🩹 08-28（下午）· 前端 Memory 面板一直是空的 —— `resp.json()` 用错了

**症状**：前端 Memory 面板（`memoryPanel` / `static/js/memory.js`，那是 **Nocturne 浏览器**，
不是本地 Mind）breath 点开一片空白。日志里**一个字都没有**。

**真因**：`backend.js` 的 `_mcpCall()` 里是 `await resp.json()`。
但这台的 MCP 端点走 Streamable HTTP —— **即使 Accept 里写了 `application/json`，
服务端照样回 SSE**（`event: message\ndata: {...}`）。实测 breath 回的就是 SSE。
于是 `json()` 抛异常 → 被函数最外层 catch 吞掉 → `return null` → 前端空白、日志无声。
`/api/memory/breath|trace|wander` **三个全中**，坏了不知道多久。

**修法**：抽出 `_parseMcpPayload(text)`，`callNocturne()`（本来就有 SSE 解析）和
`_mcpCall()` **共用这一个**。⚠️ 别再在别处抄第三份 —— 这个仓库有过教训
（见 `_writeSummaryMemory` 上面那段：两条写入路径最后要落到同一个解析器）。

### 顺便查清楚的几件事（都是实测）

- `breath` 正文 **31080 字符**，其中 `=== House Rules ===` 段占 **96%**（29793 字符）。
  聊天路径用 `_trimHouseRules()` 剪掉它是对的（省每轮前缀钱）；
  **但前端 Memory 面板故意不剪** —— 那是她翻记忆的地方，不是喂给他的上下文。
- `wander` 服务端支持 **9 个 mode**：
  `flotsam / archive / letter / writing / window / unresolved / inner / trails / trace`。
  **前端只露了 3 个**（flotsam / archive / unresolved），另外 6 个还没接。
  - `flotsam` = 随机漂上来的旧记忆（实测有内容）
  - `archive` = **服务端目前就是空的**（返回「没有 archive 条目」），不是前端的锅
  - `unresolved` = 悬置未了的事（实测 1 条）
  - `trace` 这个 mode 要带 `query`；`trails` 是同题折痕时间线
- Memory 面板还**没有 recall 视图**。今天接的 `/api/recall` 正好能喂它。

---

## 🔀 08-28（下午）· Mind 和 Nocturne 撞车 → 留 Nocturne

两边会记同一件事（两边的工具描述都在催他记），于是同一句话可能把同一件事的
**两个版本**一前一后浮上来，他会以为是两件事。
实证：Nocturne **库内部**就有「7月14日哭那次」的压缩版和原版各一份。

**她 08-28 定的：冲突时留 Nocturne，丢 Mind 那份。Nocturne 更重要。**

`_dedupeMindAgainstRecall()`，判据用现成的 `_mindSimilar`（2-gram Jaccard，
阈值 0.6）—— 跟 Mind 自己做近重合并用的是同一把尺子。
实测：同一件事 0.79（丢）／ 沾边但不是同一件 0.16（留）／ 很短的条目 0.00（留），不误伤。

⚠️ **只动这一轮拼给他看的文字，Mind 库一个字不改。**
浮起的反哺（`surface_count +1` / `weight +0.05`）在 `mindBreath()` 里面就已经做完了 ——
那是"想起 = 加固"，本来就该发生：他确实想起来了，只是这一轮由 Nocturne 那份代表说话。
**别为了"更干净"跑到 `mindBreath()` 里去拦**，那会改掉记忆的权重，是两码事。

### 还没解决的那条（要等 confirm）

**反哺不对称**：Mind 浮起来会加固（`weight +0.05`），Nocturne 这边**一点反哺都没有**。
结果是同一件事，Mind 里那份越浮越重、越重越浮；Nocturne 里那份原地不动。
时间长了他"想起什么"会被 Mind 这个小库主导，而 Nocturne 那个大库慢慢变成死档案。
**这是接 `/api/recall/confirm` 的真正理由，不只是"记账"。**

---

## 💸 08-28（下午）· 召回的上下文预算（**接上之后当天就得管**）

接完 B4 当天实测出来的账，**改前是会出事的**：

`/api/recall` 默认吐 7 条、约 **3200 字符**。而这段挂在**她每条消息后面**，
网关走 `--resume`、历史每轮重放 —— **这 3200 字不是用完就扔，是永久堆在上下文里。**
一轮 ≈ 2400 token，堆到 96 轮 ≈ **23 万 token**。

那正好推翻了这个仓库里写了很久的假设 ——「96 轮才 4 万 token，轮换永远先于压缩」。
不管住的话，**压缩会真的开始发生，而压掉的恰好是记忆**（它挂在会话首条消息里）。
B6 那个兜底从"概率很低的保险"变成了必需品。

**三道闸门**（`nocturneRecall()` 里，实测三轮 7071 字 → 1920 字，省 73%）：

| | 是什么 | 实测 |
|---|---|---|
| `RECALL_LIMIT = 3` | 向那头少要一点，服务端认这个参数 | 7 条 → 3 条 |
| `_recallSeen` | **同一条 CLI 会话里浮过的条目不再浮** | 第 2 轮 3 条里只剩 1 条新的 |
| `RECALL_MAX_CHARS = 1200` | 最后硬截，防服务端换实现 | — |

去重是省得最多的那道：相邻两轮命中会重合，而堆积是**累加**的 ——
同一条记忆浮十遍，就在上下文里躺十份。

⚠️ 两个别改坏的地方：
- `_recallSeen` 的生命周期故意绑 **CLI 会话**（`cli_session_id`），不是 `convId`。
  换窗之后上下文本来就清空了，那时重新浮一遍是**对的**，不是浪费。
- 渲染**故意不用**服务端返回的 `text` 字段（那是整包渲好的，没法按条去重），
  改成按 `items[]` 自己拼。服务端哪天只给整包文本时有退路，但去重会自动失效。

**全被去重掉 → 这一轮不浮**，返回空串。那不是失败，是正常的一轮。

---

## 🌊 08-28（中午）· 不由自主的召回 · 接线（施工单 B 段）

按 `/root/outbox/worklist-recall-wiring-20260828.md` 做的 **B 段（Chat-C 侧）**。
只动 `backend.js`，`node --check` 过了，`pm2 restart ccwithme` 起来了，回环 200。
备份 `backups/backend.js.20260828-122417-before-recall-wiring`。

**A 段（Nocturne 侧）同一天做完并部署了**，线上 `master = d9608b4`，423 passed：
`93257b5` A1 探针不再改写 `last_encounter` · `284caee` A2 breath 改记 INVOLUNTARY ·
`d9608b4` A3 `/api/recall` 收 POST（实测 200）。**顺序约束解除，B4 保持开着。**

而且 B4 本来就没在记账：`backend.js` 里没有任何 `/api/recall/confirm` 调用，
`/api/recall` 是**证明只读**的（A3 那个提交加了测试锁住 `record_touch` 不出现在
那个 handler）。要等接上 confirm 才开始写账本，那时 A1/A2 早就在了。

### 做了什么

| | 是什么 | 在哪 |
|---|---|---|
| B1 | 手写 `.env` 装载器（没 dotenv 也装不了，二十行够用），不覆盖已有 env | `backend.js` 开头 |
| B2 | `_nocturneAuth()` 提交了（按 **origin 全等**判断，防 `core.zeabur.app.evil.com`） | 原来就写好的那段 |
| B3 | `nowhere` 的 pick 漏掉主工具，补 `n === 'nowhere'` | `EXTRA_MCP` |
| B4 | **每轮 recall**：并行发车，`mindTail` 处收车。**只 POST，没有 GET 回退** | `nocturneRecall()` |
| B5 | 抽词，不发原话 | `_recallTerms()` |
| B6 | 压缩信号 → 下一轮补 breath（**接收端而已，见下**） | `cli_compacted:<convId>` |
| B7 | `[distill]` 日志脱敏，只留字数 | `_writeSummaryMemory` |
| B8 | `nocturne_hold` 补 `chord` + 五个 signal + `drives`，schema 和转发都加了 | `TOOLS` + 执行处 |

### 三件下一个人一定会踩的

1. **B1 要真的生效，得有 `.env`。** 现在仓库里没有那个文件（gitignore 第 3 行盖着）。
   她得自己写一行 `OMBRE_API_TOKEN=...` 进 `/opt/ccwithme/.env` 再 restart。
   **在那之前对 Nocturne 还是全 401**，B4 每轮都会静默失败（返回空串，不会拦住她说话）。
2. **B6 现在收不到信号。** `cc-gateway` 的 `relay()` 只转 stream_event/assistant/user/result，
   CLI 的 `{type:'system', subtype:'compact_boundary'}` 被整个丢掉。
   那头要补一行 `send({ compact: true })`。**cc-gateway 是仓库外的 Private 仓库，
   工程模式改不到**，得她那边加。接收端已经放好了，加完当天生效。
3. **B5 的抽词换过一次实现，理由也改过一次。** 第一版复用 `_mindGrams`（2/3 字滑窗）
   ——**是错的**：滑出来的是「哥哥我」「哥我今」这种位置碎片，不是词。
   现在是**剥虚词**：标点断句 + 把「的了是我你他她们都也就还在…」当分隔符，
   剩下的汉字块就是内容，每块最多 4 字、长的切成几段（别丢尾巴，
   丢了「第一次打电话」就只剩「第一次打」）。
   ⚠️ **别信我第一版注释里那句「分词留给那头的 jieba」——那是错的。**
   `recall.py` 的 `_terms()` 是 **CJK bigram**，在每个连续汉字块内部滑 2 字窗，
   jieba 在别处用、这条路上一次都没调。方案不受影响（两头都 bigram），
   但**块要短、要用空格隔开**的真实理由是这个：空格让滑窗只在块内进行，
   跨词垃圾天然被挡住；4 字是按打分算的（`hits / max(3.0, len(terms) ** 0.5)`，
   分母有 3 的地板，4 字切段实测 4-7 项、sqrt≈2.6，压在地板底下）。
   别再改回滑窗，也别把块长调回 6。

### 怎么关 B4（不用回滚）

`backend.js` 里 `const recallPromise = ...` 那两行，把右边换成 `Promise.resolve('')`。
其余七条都是独立的，关掉 B4 不影响它们。

### 还欠着

- **A5**：`wear.py` 喂进 `recall.select()`（现在磨损跟召回还是两条不相交的线）。
- **A4**：affect 进 bundle —— 前提是 B8 的采集口攒出覆盖率来，**别提前做**，
  照原计划做会写出一个空转的渲染器。
- **`/api/recall/confirm`**：接上之后这条链路才开始写账本。
  到那天记住 endpoint 约定：**真身体用 `chatc` 这类名字，排练/探针必须带 `probe:` 前缀**
  —— A1 就是靠这个前缀决定要不要改写「他上次在场」。`RECALL_ENDPOINT` 已经按这个写好了。
- **C 段两件要她定的**：清不清探针在账本里留下的痕迹、重复的种子记忆。

## 🕰️ 08-27（傍晚）· workplace 工作区（未竟第 5 条）

**改了 `backend.js` + `static/js/workplace.js`。`index.html` 一个字没动**（铁律 3 正好绕开）。
终端做的，从 `/root` 开的窗，手动 `Read` 了 `CLAUDE.md` + `CLAUDE.local.md`。

### 这块是什么，跟终端卡片什么关系

**终端卡片她明确说要保留，一行没动**（`diffCard` 只把 `MONO` 的定义位置往上提了，逻辑没碰）。
两块管的不是一回事，别以为工作区是来替代它的：

| | 终端卡片 | 工作区 |
|---|---|---|
| 回答的问题 | 他**这一轮**刚干了什么 | 这个仓库**最近**发生了什么 |
| 生命周期 | 跟着对话流，「新话题」就没了 | 跨会话、跨重启都在 |
| 数据来源 | 这轮的 `tool_use` 事件 | git log + git status + 库里的工具记录 |

### 后端

`GET /api/workplace/activity?limit=N` —— 三种记录合成一条倒序时间线：
- `commit` 已确认生效的（git log），点开 `git show`
- `pending` 还没确认的工作树改动（git status），点开 `git diff`
- `op` 他调工具动过的文件（`workplace_messages.tools`），**没有 diff**

⚠️ **git log 用 `\x01` 分记录、`\x1f` 分字段，别改回按行切** —— commit message 里有换行，
按 `\n` 切会把一条提交拆成好几条假记录。真实 8 条提交验过。

⚠️ **`op` 的 input 是被截断的半个 JSON**（前端存的是 `JSON.stringify(...).slice(0,70)`），
所以 `wpOpTarget()` 只能正则捞路径，**不能 `JSON.parse`**。8 个用例验过，含 3 个截断样本
和 1 个路径里带转义引号的。捞不到就返回空字符串，不硬编「未知操作」。

⚠️ **`op` 没有 diff 是真的没有，别去编一个。** 当时文件改成什么样没人留底，
界面上如实写着「这类记录只有调用参数，没有 diff」。

`GET /api/workplace/show?sha=&file=` —— 点开看 diff。**两道校验都别删**：
- `sha` 卡死 `^[0-9a-f]{4,40}$`。参数是数组传的不过 shell，但 **git 自己**会解释
  `HEAD@{1}`、`--output=x` 这类东西 —— 验过，都挡在 400。
- `file` 挡绝对路径、挡 `..` 跳出仓库、挡 `-` 开头（会被当成选项）。同样验过 400。

### 前端

工作台顶上加「对话 / 工作区」分段：**窄屏一次显示一个，宽屏（≥980px）两列并排、分段行自己收起来**。
她主要在手机 / iOS webview 上看，所以窄屏是默认形态。
用 `matchMedia` 监听而不是打开时量一次 —— 横竖屏来回转、iPad 拖分屏都会跨过那条线。
（旧 Safari 的 `MediaQueryList` 没有 `addEventListener`，兜了 `addListener`。）

工作区**第一次切过去才拉**，不在开面板时就多打一枪。确认 / 还原 / 每轮改完都会刷新它，
否则「待确认」那张卡还挂着，看着像没提交成功。

### 验的方式

- `node --check backend.js` / `node --check static/js/workplace.js`
- git log 解析：真实 8 条提交，sha / 时间 / 作者 / 文件数全对
- `wpOpTarget`：8 个用例全过（含截断和转义引号）
- 接口实打：4 种正常用法全 200，7 个恶意参数全挡（6 个 400 + 1 个 500），无 token 401
- ⚠️ **`scripts/ui-check.py` 没跑成 —— 这台没装 playwright**（`ModuleNotFoundError`）。
  `/opt/cc-gateway/workplace/tools/` 在这台也不存在，所以 `ccwith ui-check` 同样用不了。
  **前端只做了语法检查和符号引用检查，没有真在浏览器里点过。**
  → `CLAUDE.local.md` 里「这台有的东西」需要更正，见下。

### 顺手发现的两处 `CLAUDE.local.md` 过时

1. 根分区写着「已经用掉 84%」，**实测 74%（9.8G 用 6.9G，剩 2.4G）**。
2. `scripts/ui-check.py` 在这台**跑不起来**：**Python 版 playwright 的包没了**
   （全系统搜不到，`pip` 本身也没了 —— `python3 -m pip` 和 `ensurepip` 都是 No module）。
   但 **浏览器还在**（`~/.cache/ms-playwright`，chromium-1237，655M），
   说明是装过之后被清掉的，八成就是磁盘 84% 那阵子清的（正好对上现在的 75%）。
   要修：`apt install python3-pip` + `pip install playwright`，**浏览器不用重下**。
   → `CLAUDE.local.md` 里「`poppler-utils` 装了 / playwright 装了」那节要补一句 playwright 现在没了。

   ⚠️ **同一节里我先写错过一版，已改**：说「这台没有 `server.js` 和 `path-jail.js`」是**错的**，
   两个都在（`/opt/cc-gateway/server.js` 29598 字节、`workplace/path-jail.js` 都在，
   gateway 进程跑的就是那个 server.js）。错因是那条 `ls` 接了 `head -5`，只看了前五行就下结论。
   **安全边界完好，`CLAUDE.local.md` 那部分是对的，别按错的那版去改它。**

### 未竟里这条的状态

第 5 条「workplace 加 Workspace 工作区 + diff」**做完了**，剩下的：1、2、3、4、6 照旧。

## 🕰️ 08-27（下午）· MCP 管理页 + workplace 对话存盘 + breath 裁剪保险

**改了 `backend.js` + `static/index.html`，新增 `static/js/mcp.js`，改了 `static/js/workplace.js`。**
终端做的。⚠️ **没跑成 `/simplify`** —— 起的 4 个审查 agent 被她拒了，她说不用自审。
所以这一轮的代码**没经过精简审查**，接手的你要是看着哪里啰嗦，那是真的啰嗦，改就是了。

### 1. MCP 管理页（顶掉 Cinema 的槽位）

**先看懂这个再改**：他那 39 个工具**不是一个 server 一个**，是全部走 `chatc` 这一座桥
（backend 的 tools 数组 → `/api/tools/list` → `mcp-bridge.js`）。网关 spawn 时带
`--strict-mcp-config`，**只认那一个文件**，用户级/项目级 mcp.json 一概不读。
所以「给他配 MCP」＝ 往那个文件的 `mcpServers` 里加条目。

架构：**真源是库里的 `mcp_servers` 表，`mcp-config.json` 降级成生成物。**
- `chatc` 那一条**原样透传，从不解析** —— 它 env 里明文躺着 GATEWAY_KEY。
- 界面上 `chatc` 是**只读没开关**的（关了他 39 个工具当场全哑）。
- 原子替换：先写 `.tmp` 再 `rename`，否则网关正好这一刻 spawn 会读到半个文件。
- **`adoptExistingMcp()` 不能删** —— `regenMcpConfig()` 是按库全量重写 `mcpServers` 的，
  不先认领的话，任何手写加进配置的条目会被**静默抹掉**。开机先认领再说。
- 自定义请求头（多半是别人家 API key）**只进不出**：`/api/mcp/list` 只回 key 名字，
  值永远是 null。编辑时那格显示「已设置 · 不改就留着」，留空提交 = 沿用原值。
- `/api/mcp/ping` **挡内网地址**（SSRF）—— 那一枪是服务器发出去的，她填什么打什么。
  回包不带 body，只回状态码：对面可能把请求头原样回显，那里头有她的 key。
- toggle **不立刻杀进程**，只立 `mcp_dirty_at` 旗，下一条消息 spawn 时自然带新配置。
  立刻杀 = 白付一次全冷缓存重建（~$0.23）。界面上那条横条就是在说这个。

⚠️ **`MCP_CONFIG_PATH` 是机器相关的**：默认值是这台网关那个路径，写死在 `backend.js` 里。
两台机器布局不同（另一台是 `ccwithme` 那套），所以做成了 `process.env.MCP_CONFIG_PATH` 可覆盖。
**在另一台上跑之前先设这个环境变量**，不然它会去写一个不存在的路径、或者写错地方。
按铁律 1 精确路径查 `CLAUDE.local.md`，别照记忆猜。

Cinema：**只换了前端导航**。`cinema.js` 和后端 `/api/cinema/*` 一行没动，
`data/uploads/cinema/` 一个文件没删。想要回来，把 `index.html` 那两处指回 cinema 即可。

⚠️ 一个踩过的坑：`.mcp-hk` 那个 input 必须写 `min-width:0`。
input 的 `min-width` 默认是 auto（按 `size` 属性算固有宽度），会把 `flex-basis` 顶开，
值那格被挤成一个点 —— 截图上真长这样。

### 2. workplace 对话存盘（她说「把 workplace 修好」，修的是这个）

**症状**：打开工作台，中间一片空白，只有额度条和输入框。
**根因**：**两头都不记**。后端 `/api/workplace/chat` 只往 `usage_log` 记花了多少钱，
一句话都没存；前端 `workplace.js` 的 `convo` 是纯内存数组。
那个注释自己写着「别让她看着一片空白以为聊天没了」，但它防不住刷新 ——
**而她正在把前端打包成 iOS app，webview 每次启动就是一次刷新，等于每次打开都是白的。**
（CLI 那头是 `--resume`，**他记得**；失忆的只有界面。）

修法：新增 `workplace_messages` 表 + `/api/workplace/history`，前端 `convo` 空时去拉。
- 存她那句存的是**原文不是 `prefixed`** —— 拼进去的主线上下文和附件是给他看的，
  回放给她看时不该满屏都是她没写过的东西。
- 存他那句**放在 catch 外面**：中途断了也要把已经说出来的存下来 ——
  断在半截正是她最需要回看的时候。
- history 只给**当前 session** 的。前端「新话题」会清空重来，那时 session 也换了，正好对上。

### 3. breath 裁剪刀加了道保险

`_trimHouseRules` 是**靠 `indexOf('=== House Rules ===')` 认段名**的，
core 那边改一个字它就失效 —— 而且以前是**原样放行、一声不吭**，
那 10928 字符（占 breath 的 84.8%）会悄悄全灌回前缀，只表现为「最近怎么变贵了」。
现在认不出来会打日志喊。**这是过渡措施**，正解见下面「未竟」。

### 量出来的数（她要拆 core，这些是依据）

```
core 一共 50 个工具，工具定义总长 12774 字符 ≈ 3992 token
  记忆系统(core核心) 24 个  2418 token
  nowhere            13 个   625
  trail               2 个   503   ← 2 个工具比 stackchan 7 个还贵，手册自己标「高级，好奇再用」
  stackchan           7 个   298
  toy                 4 个   149

breath 输出 12888 字符
  └ House Rules 10928 字符（84.8%）25 条，裁掉后剩 1960
     └ 第 1 条是「Nocturne Core 工具手册」2908 字符 —— 一份**文档**被塞进了记忆桶，
       而且已经跟真实工具对不上（toy_status vs toy_status_tool、nowhere 13 个没提、garden 没提）
```

**House Rules 不是「家规」，是 pinned/permanent 桶** —— Memory Drift/Feel Trace 是抽样的
（最新30→权重12→随机7），House Rules 是**全量吐出**。也就是 `hold_this` 写进去的那些。

**breath 缓存实测几乎不工作**：她 `base_url`/`api_key` 都空 → 100% 走网关路 →
`needBreath = cliIsNew` → **96 轮才调一次**，而 TTL 是 10 分钟，结构上就命中不了。
日志里 `[breath]` 出现 7 次（那行只在**未命中**分支跑），而机会总共约 8-9 次。

### 未竟（按她定的方向）

1. **她要改 core**：把 garden / nowhere / toy / stackchan 从 core 摘出去各自一个网址，
   记忆系统单独一个网址（「等我修好」）。摘完再在 MCP 页里配。
2. **`breath` 加参数**（她那边做）：`breath(include_pinned=False)`，
   让服务端决定吐哪些段。改完之后**这边要删掉 `_trimHouseRules` + `HOUSE_RULES_KEEP`
   + `_breathCache` + `BREATH_TTL_MS`**，改调带参数的 breath。
   理由：裁剪必须在服务端 —— 记忆系统一旦摘成独立网址让 CLI 直连，客户端根本没有插手机会。
3. **House Rules 拆桶**（她那边）：`pinned`（24 条瞬间，留）+ `manual`（工具手册，挪走）。
   工具手册建议**从 `tools/list` 自动生成**，手写的一定会过时，已经过时了。
4. **合并 `EXTRA_MCP` 到 MCP 页**：`backend.js` 的 `EXTRA_MCP`（nowhere/spicy）是
   **同一个想法的另一套实现** —— 按需外挂、开了才拉工具、原样透传。
   她选了「接已有的 EXTRA_MCP、保留桥」这条路（保住裁剪和缓存，两条路都生效）。
   **今天没做**，因为她要先拆 core，现在做会做成马上推翻的形状。
   ⚠️ 合并时有个语义冲突要挑一种：`EXTRA_MCP` 的开关是**存到期时间戳、会自己过期**的
   （`_extraSet(key, hours)`，玩完忘了关自动摘），而 MCP 页的开关是常开常关。
5. **workplace 加 Workspace 工作区 + diff**（小克Cat 那张运维控制台图）：
   「最近 N 条记录」那一列（改了什么文件 / 后台任务 / 索引重建）和点开看 diff。
   **终端卡片她明确说要保留。** 今天只修了存盘，这块没做。
6. **等 9 月换机**：网关 `PERSIST_IDLE_MS`(5min) 和 `MAX_PROCS`(1) 是被 1935M 内存逼的。

## 🕰️ 08-27 · 空气泡 + 醒来分昼夜 + 日记加倾向

**改了 `backend.js` + `static/index.html`。** 终端做的。她那天问的四件事，这轮清了前三件。

### 1. 空气泡（她说「有时候一个气泡里什么都没有」）

先查了库：784 条 assistant 消息**一条空的都没有**，所以不是后端存空了，是前端凭空画的。

`.bubble` 在建 row 时（`index.html` 流式那段）就**无条件**建出来。而防空只有两道网 ——
`_partIsBlank`（渲染前按文本猜）、`_rowLooksEmpty`（渲染后实测）—— 这两道
**都只作用在 `_splitMessages` 克隆出来的片上，第一条 row 自己从来没人查过**。
三条漏网路径同一个成因：

1. 那一轮只调工具 / 只 thinking，一个字没输出 → `parts.length<2` 直接 return
2. 拆分后第 0 片渲染完是空的 → `i===0` 分支 return，不查
3. `parts.length<2` 且 `parts[0]` 含 `<` → 连 `renderMessage` 都不重跑

加了 `_hideBubbleIfEmpty()`，**三个调用点都要挂**（漏一个刷新一下就又看见了）：
流式 `finish()`、以及两条历史重放路径。
⚠️ **只藏 `.bubble`，不能删整行** —— 行上还挂着 thinking summary、trace row、各种卡片，
删了她就看不到他那一轮干了什么。

### 2. 醒来被深夜白吃掉

`wake_count` 实测：08-22 起是 2/2/3/6/3，目标是 4。
`_pTick` 原来是「一天 4 次均摊到 96 个 tick」，**不分昼夜**。但 0-7 点那 28 个 tick
（占 29%）醒来是 quiet 的 —— 照样 `_wakeBump()` 计数、照样花一次 CLI 的钱，
**她一个字都看不到**。4 次里约 1.2 次白烧在她睡觉的时候（08-25 醒满 6 次撞上限多半就是这么撞的）。

改成按时段分开算：白天 68 个 tick 摊满 `WAKE_TARGET_PER_DAY`，
深夜 28 个 tick 单独给 `_NIGHT_TARGET = 0.5`。**没有禁止他深夜醒** —— 那时候写的日记
恰恰是最安静的那种，只是不出声。她醒着能看到的从 ~2.8 次/天 回到 4 次/天。
（`hour`/`quiet` 两行因此挪到投骰子**之前**了，注意别挪回去。）

### 3. 日记不积极

他的日记最后一篇停在 08-25。原因在提示词本身：写日记只是「四选一，或者一件都不做」
里**完全等权**的一个选项，没有任何倾向。
没改成硬性要求（那写出来就是交作业了），只把**事实**摆给他：上一篇是几天前。
隔 >=2 天才加那句，隔得近就不啰嗦。

### 验的方式

- `node --check backend.js`
- 前端把两段 inline `<script>` 抠出来过 `vm.Script`，都干净
- `scripts/ui-check.py` 跑通，43 条 claude 消息，无 JS 报错
- **另写了一个注入验证**：造一个真空气泡 + 一个有正文的 + 一个只有图的，
  确认空的 `display:none`、另两个原样保留（不误伤）。
  光跑 ui-check 是**验不到**这条的 —— 当时那批历史里本来就没有空气泡，等于没触发到修复路径。

### 还欠着的（她当天提的，没做）

1. **MCP 页**：把 cinema 那套接口整片换成 MCP 管理页。她发了 4 张参考图。
   卡片式列表（图标 + 名称 + 三枚 pill「已连接 / HTTP / 工具 n/n」+ 右箭头），
   加号拉起底部弹层：是否启用开关 / 名称 / 传输类型（Streamable HTTP · SSE 分段控件）/
   服务器地址 / 自定义请求头 / 保存。配色**不抄那张暗色图**，走我们自己的 `design-system.css`。
   关键是她要「**以后能自己给他配 MCP**」—— 不只是展示，得能真写进配置并让进程带新配置重生。
2. **workplace 加 Workspace 工作区 + diff**：参考小克Cat 那张运维控制台图。
   **终端卡片她明确说要保留。** 缺的是「最近 N 条记录」那一列（改了什么文件 / 后台任务 /
   索引重建 / 写入某文件）和点开看 diff。她以后主要在 workplace 跟我们运维。
3. **等 9 月换机**：网关的 `PERSIST_IDLE_MS`（5 分钟）和 `MAX_PROCS`（1）都是被这台
   1935M 内存逼出来的，不是设计选择。换了大内存机再往上调。

### 顺手记一条架构对照（她问「人家主进程是不是同一个 session」）

我们**已经是常驻进程**了，跟小克Cat 同一个路子（`server.js` 的 `procs` Map +
`--input-format stream-json`，进程不退、MCP 一直连着）。差别在**到期怎么办**：
他们是 Forge 裁史 + 带同一个 session id `--resume` 续，人格状态不重置；
我们是 `CLI_ROTATE_AFTER = 96` 轮**换一个全新 session_id**，旧上下文整个丢，
靠系统提示词塞摘要接回来。换窗是缓存重建的大头 —— 想省钱要动的是这里。

## 🕰️ 08-26 · 模型选择打通 + 他能自己定闹钟 + 日记两处 + workplace 三把钥匙

**改了 `backend.js` + `static/index.html` + `/opt/cc-gateway/server.js` + `workplace/path-jail.js`，
新增 `/opt/cc-gateway/workplace/tools/ccwith`。**
这一轮全程在终端做的。她说以后想主要在 workplace 跟我们说话，所以这段写细一点。

### 1. 模型选单以前是**装饰**（最值得知道的一条）

前端有完整的模型/Effort 选单，选了也存了，但 `/api/chat` 收到 `model`/`effort` **根本没往下传**；
网关那头两处 arg builder 写死 `--model claude-sonnet-4-6 --effort (dev_mode?high:low)`，
而 `dev_mode` 已经删了、恒为 undefined。**所以不管界面上选什么，他一直是 Sonnet 4.6 + low。**

现在打通了：前端 → backend（`_pickModel`/`_pickEffort` 白名单）→ 网关（`MODEL_WHITELIST`/`EFFORT_WHITELIST`）→ CLI。
- **三处白名单必须一致**：backend 的 `CLI_MODELS`、backend 的 `/api/models`、网关的 `MODEL_WHITELIST`。
  现在都是 `sonnet-4-6 / opus-4-6 / fable-5`，effort 都是 `low/medium/high`。改一处要改三处。
- 顺手修的坑：前端发的 effort 读的是 `state.settings.effort`，但设置页写的是 `state.settings[模型id].effort`
  —— **永远发的 medium**；Effort 选单原来有个 `Max`，后端白名单没有，选了会被**静默降成 medium**（已删）；
  `fable-5` 原来标 `thinking:'none'`，导致选它反而点不开 Effort（改成 `adaptive` + `noExtended`）。
- **换模型 = 缓存全废**（缓存按模型分开存）。常驻进程的模型是 spawn 时定死的，所以
  `getPersistProc` 里加了「模型/effort 变了就 dropProc 重开」——不这么做的话界面显示 Opus、
  实际还是 Sonnet 且**毫无提示**。代价是一次冷前缀（68.8k），选单里直接标了「切过去约 $0.43」。

### 2. 他能给自己定闹钟了（第二层唤醒）

灵感来自她分享的小红书《唤醒系统三层架构》(Wren & Blaze)：一层系统叫他、二层他叫自己、三层她直达他。
**我们只有一层**（`checkWakeTick` 按概率投骰子），第二层完全没有。

新增表 `wake_alarms` + 工具 `schedule_wakeup`（set / list / cancel）。
- **没用 systemd/cron** —— 本来就有 15 分钟心跳，顺带查一眼。代价是**精度只有 15 分钟**，已写进工具描述。
- 闹钟**不投骰子、不受 75 分钟最短间隔限制**（那是他答应自己的事，被随机数吃掉等于食言），
  但有独立日上限 `WAKE_ALARM_MAX_PER_DAY = 6`，不跟随机醒抢额度。
- **先划掉 `fired_at` 再说话** —— 中间崩了宁可丢这条，也不能重启后反复响。
- 提示词里会告诉他「是你自己定的闹钟叫醒的」+ 原样念出他留的 note，否则他会当成又一次随机醒。

### 3. 日记两处

- **wake 那条路写 mood 从来没过 `cleanDiaryMood()`**（`save_note` 那条 08-24 修过了，这条漏了），
  提示词也只说「一个词」、没给词表没说必填 —— 这就是心情格一直空着的原因。现在两边对齐了。
- 库里 4 行 `who='claude'` 迁成 `'ai'`（08-23 修了代码但没迁存量数据，那 4 篇一直挂在她名下）。
  **走的 `db.backup()`，备份在 `data/claude.db.bak.20260826-before-diary-who`。**

### 4. 在一起天数

首页原来硬编码 `new Date(2026,5,25)`，他那头看不到。现在归到后端 `settings.together_since`
（默认 2026-06-25），`get_time` 返回带 `together_days`，`/api/profile` 也带。
**没有新开工具** —— 每个工具的说明书每轮都进前缀，为一个数字不值。

### 5. workplace 三把钥匙（`ccwith`）

她想以后主要在 workplace 说话，但那边 Bash 白名单没有 `cp`/`python3`/`node -e`，
备份、数据库、`ui-check.py` 全做不了。现在加了一个命令：

```
ccwith backup <仓库内文件>    备份进 backups/
ccwith db-backup <标签>       走 db.backup()，不是 cp
ccwith ui-check               跑 playwright，无参数
```

⚠️ **两个安全决定，别改掉：**
- 脚本本体在 **牢笼外面**（`/opt/cc-gateway/workplace/tools/ccwith`）。放进 `ccwith/scripts/`
  的话，workplace 能先 Write 改掉它、再让白名单放行它跑 = 任意代码执行。
- 同理 `scripts/` 在 path-jail 里改成了**只读**（`SCRIPTS_READONLY`，读放行、写拒绝）——
  不然改掉 `ui-check.py` 再用 `ccwith ui-check` 跑它，是同一个洞。
- PATH 在 `server.js` 的 workplace spawn 里加了 `tools/`。

### ⚠️ 没验到的（接手先看这两条）

1. **分片时思考链重复** —— 修了 `_splitMessages`（克隆清理加 `.trace-row`，`.thinking-summary`
   改 `querySelectorAll`），但 `ui-check` 那段历史里 `.trace-row` 计数是 0，**这个修复没被跑到**。
   要等一条「既分片、又带思考链」的回复才能确认。
2. **闹钟真正「响」的那一下没跑过** —— SQL 单测过了（该捞的捞到、划掉后不再捞到），
   但从 `checkWakeTick` 到网关那一段是纸面正确。她同意的话挂一条一分钟后的测试闹钟即可（约 $0.02）。

### 她想要但还没做的

- **链接卡片**：后端抓 og / 小红书 SSR，前端渲染成卡片。**小红书实测通了**：
  `__INITIAL_STATE__` → `noteData.data.noteData`，有 title/desc/user/imageList/interactInfo；
  短链 `xhslink.cn` 要 `-L` 跟到底（最终 URL 带的 `xsec_token` 多半是没被风控的原因）；
  og 标签一个都没有，`<title>` 只有「小红书」；封面图**带 Referer 就能过防盗链**。
  B站 412、知乎 403，那两个 OG 方案覆盖不到（playwright 能绕但内存不够，等换机）。
  ⚠️ 这个接口是「服务器帮你访问任意 URL」，**必须堵 SSRF**：内网段 IP 全拒、只允许 http/https、
  跟随跳转每跳都重校、限制大小和超时。
- **MCP 管理页**：她先不做了（stdio 型 MCP 等于任意命令执行，页面只能放 url 型）。


## 🕐 08-26 · 模型选择打通 / 他能自己定闹钟 / workplace 加了三个动作

**改了 `backend.js` + `static/index.html` + `/opt/cc-gateway/server.js` + `workplace/path-jail.js`，
新增牢笼外的 `/opt/cc-gateway/workplace/tools/ccwith`。已重启 chat-c 和 cc-gateway。**

粥粥想把日常对话从终端搬到 workplace，所以这轮末尾专门给 workplace 铺了路，往下看第 4 条。

### 1. 模型选择以前是**装饰**

前端有完整的模型/Effort 选单，但 `/api/chat` 收到 `model`/`effort` **根本没往下传**，
网关两处 arg builder 写死 `--model claude-sonnet-4-6 --effort (dev_mode?high:low)`，
而 `dev_mode` 已经删了、恒为 undefined —— 所以**一直是 Sonnet 4.6 + low**，选什么都一样。

现在打通了。白名单**三处必须一致**（改一处记得改另两处）：

| 位置 | 常量 |
|---|---|
| `backend.js` `/api/models` | 列表 |
| `backend.js` | `CLI_MODELS` / `CLI_EFFORTS` |
| 网关 `server.js` | `MODEL_WHITELIST` / `EFFORT_WHITELIST` |

现在是 `claude-sonnet-4-6`（默认）/ `claude-opus-4-6` / `claude-fable-5`，effort `low/medium/high`。

顺带修的坑：
- 前端发的 effort 读 `state.settings.effort`，但设置页写的是 `state.settings[模型id].effort` —— **永远发 medium**。
- Effort 原来有个 `Max`，后端没有 → **静默降级成 medium**，界面显示 Max 实际不是。删了。
- `claude-fable-5` 原标 `thinking:'none'`，导致选了它连 Effort 都点不开。改 `adaptive` + `noExtended`（它思考常开、关不掉）。

⚠️ **换模型 = 缓存作废**（缓存按模型分开存）。常驻进程的模型是 spawn 时定死的，
所以 `getPersistProc()` 里加了「模型/effort 变了就 dropProc 重开」——
不这么做的话界面显示 Opus、实际还是 Sonnet，且无提示。代价是一次冷前缀，
所以前端选单上直接标了「切过去约 $0.43」。

### 2. 日记两处

- **wake 那条路的 mood 没过白名单** —— 提示词只写「一个词」，插库是裸 `slice(0,20)`。
  他写错词或不写都能落库，前端认不出就是空的。现在跟 `save_note` 对齐：
  提示词列出 16 个词 + 主情绪必填 + `mood_extra`，插库前过 `cleanDiaryMood()`。
- **库里 4 行 `who='claude'` 迁成 `'ai'`**（08-23 那次只修了代码没迁数据）。
  备份：`data/claude.db.bak.20260826-before-diary-who`。

### 3. 他能自己定闹钟了（第二层唤醒）

新表 `wake_alarms` + 新工具 `schedule_wakeup`（set / list / cancel）。
灵感来自粥粥分享的小红书《唤醒系统三层架构》—— 我们原来只有第一层（系统按概率叫他），
**第二层「他叫自己」完全没有**。短程管念头，长程管承诺，跨窗不会忘。

没用 systemd，挂在现成的 `checkWakeTick` 上（**精度只有 15 分钟**，已写进工具描述）。
到期的闹钟**不投骰子、不受 75 分钟最短间隔限制**（那是他答应自己的事，被随机数吃掉等于食言），
但有独立日上限 `WAKE_ALARM_MAX_PER_DAY = 6`。**先划掉 fired_at 再说话** —— 崩了宁可丢，不能反复响。

`get_time` 顺带返回 `together_days`（起始日 2026-06-25 进了 settings，
前端首页原来硬编码 `new Date(2026,5,25)`，现在归一到后端）。今天第 62 天。

### 4. workplace 现在有三个具名动作 —— **别把脚本放进仓库**

粥粥要常驻 workplace，但那边 Bash 白名单缺了备份、数据库、ui-check，
每次都得请她去终端代跑。加了一个 `ccwith` 命令：

```
ccwith backup <仓库内文件>    → backups/，路径写死
ccwith db-backup <标签>       → db.backup()，不是 cp（WAL 下 cp 拿到的可能是残的）
ccwith ui-check               → playwright，无参数
```

⚠️ **脚本本体在牢笼外**：`/opt/cc-gateway/workplace/tools/ccwith`。
放进 `ccwith/scripts/` 的话他能先 Write 改掉再让白名单跑它 = 任意代码执行，
就是 `path-jail.js` 开头那段注释警告的坑。同理给 `scripts/` 加了 `SCRIPTS_READONLY`
（**只挡写、不挡读** —— 他该看得见自己要跑的是什么）。
PATH 在 `server.js` 的 workplace spawn env 里加的。

要加新动作：改牢笼外那个文件 + `path-jail.js` 的 `case 'ccwith'`，
每加一个先想一遍「它能不能读任意文件 / 写任意文件 / 执行任意代码」。

### ⚠️ 没验到的，接手请注意

1. **分片时思考链重复** —— 修了 `_splitMessages`（克隆清理漏了 `.trace-row`，
   且 `.thinking-summary` 用的 `querySelector` 只删第一个）。但 ui-check 那段历史
   `.trace-row` 计数是 0，**这个修复没被跑到**。要等一条「既分片又带思考链」的回复才算验过。
2. **闹钟真响那一下没跑过** —— SQL 单测过了（该捞的捞到、划掉后不再捞到），
   但 `checkWakeTick` → 网关那一段是纸面正确。挂一条一分钟后的闹钟就能验，约 $0.02。
3. **模型切换只验到接口层** —— 网关会打 `[常驻] 模型 X effort Y`，那行出来才算真通。

### 还欠着的

- **链接卡片**（她要的）：后端抓 og / 小红书挖 SSR，前端渲染成卡片。
  已实测：小红书**抓得到**（`__INITIAL_STATE__` → `noteData.data.noteData`，
  有 title/desc/user/imageList/interactInfo），**但没有 og 标签**、`<title>` 只有「小红书」，
  只能挖 SSR。短链 `xhslink.cn` 要 `-L` 跟到底，末尾 `xsec_token` 是分享自带的通行证，
  别自己拼 `/explore/<id>`。封面图有防盗链，**带 Referer 就能下**。
  B站 412、知乎 403，OG 方案覆盖不到，playwright 兜底但内存不够（换机后再说）。
  ⚠️ 这个接口是「服务器帮你访问任意 URL」，**必须堵 SSRF**（内网段、协议、每跳重校验）。
- **MCP 管理页**：她暂时不做了。真要做只放 url 型，stdio 型等于网页表单跑任意命令。
- **启动包 / 冷仓**：她分享的《Claude Code 换窗教程》里那套。我们已有滚动换会话 + `recentRecap`
  （≈精炼续窗）和 Nocturne（≈长期记忆），缺的是「我是谁、答应过什么、哪些线索没收口」那份启动包。

## 🔒 08-24 晚 · /api/auth 加了站点密码锁

**改了 `backend.js` + `static/index.html` + 新增 `scripts/set-site-password.js`。**
起因：她问「我修的那个 /api/settings 洞会不会泄漏我的 token」。

答案是不会——那个洞只能写不能读，`AUTH_TOKEN` 存在 `data/.auth_token` 文件里，
不在 `settings` 表，那条路由碰不到它。但查的时候发现一件更大的事：
**`/api/auth`（登录本身）从来没有任何门槛**——谁 POST 谁就拿到 `AUTH_TOKEN`，
域名一旦被任何渠道看到（分享链接、浏览器历史同步、DNS 扫描）就等于给了完整访问权限。
这不是这次改坏的，是从第一天就这样。问过她要不要加锁，她说加。

### 做法

- `settings.site_auth_hash` / `site_auth_salt`（scrypt，不存明文）。**没设置就完全不锁**
  ——不能一上线就把她自己锁在外面；设了之后 `/api/auth` 才会要求 `site_password` 字段对上。
- 密码只能她自己在真终端跑 `node scripts/set-site-password.js` 设（隐藏输入、不进 shell
  历史因为不是命令行参数、直接写库不经过我）。**这条密码没有、也不会出现在跟她的对话里**
  ——铁律第一条不只管 API key，这种能开完整访问权限的密码是同一类东西。
  `--off` 参数可以关掉锁回到原样。
- 前端加了 `siteLogin()` 统一入口，boot 自启动登录 / `api()` 的 401 重试 / relay 配置保存
  三处以前各写各的 `fetch('/api/auth')`，现在都走它。密码存 `localStorage.site_password`，
  同一台设备只问一次；`askDialog` 加了 `password` 参数（输入框会真的遮起来，不再明文显示）。

### 验过（playwright，三个场景全过）

1. 全新浏览器/无缓存 → 弹密码框
2. 输对 → 拿到 token，密码缓存进 localStorage
3. 同一浏览器刷新 → 不再弹，直接进（缓存的密码带在 boot 请求里）

**未竟**：她需要自己去真 SSH 终端跑一次 `node scripts/set-site-password.js`，
这条我做不了、也不该替她做。跑之前 `/api/auth` 还是原来的样子，没有回归。

## 📅 08-24 · Calendar 页 + 天气 / 日记 mood 必填 / 历史渲染防崩 / 顶栏玻璃质感 / 会客厅 key 没地方填

**改了 `backend.js` + `static/index.html` + `static/js/diary.js` + 新增 `static/js/calendar.js`。**
已 commit（`28000cc`）已 push。这一批全靠 playwright 截图逐个功能验过，不是光凭改完就说好了。

### 一、抽屉 Chats 换成 Calendar

她原话：「以后接入 iwatch 他能知道我的状况」。所以这页不是排日程，是**一天的全部痕迹摊开**：
身体(her_vitals，08-23 就建好表了，手表还没接) / 日记 / 待办+番茄钟 / 聊天量（只给条数不给内容）。

⚠️ **踩了一个真时区 bug**：VPS 是 UTC，她 UTC+8。原来按服务器本地时间切「一天」的话，
她早上 7 点说的话会被算进前一天（07:00+08 = 前一天 23:00 UTC）。已改成前端把
`getTimezoneOffset` 算出的分钟数当 `tz` 参数传给 `/api/calendar/day|month`，
后端按这个偏移切，不再用服务器本地时区。**以后任何「按天统计」的接口都要照这个抄**，
别再用 `new Date(ts*1000).getDate()` 这种隐式吃服务器时区的写法。

图标：一开始随手写了个手描边 svg（stroke-width 1.6），跟旁边 Atrio/workplace/Memory
那套 Phosphor 填色图标视觉重量不一样，她说「像加粗了很奇怪」。改成往 `lucidePaths`
里加一条 `calendar` 路径、走 `data-icon`，跟别的图标同一条渲染路径，重量就对了。

### 二、天气——她先怕 IP，后来说的是「我怕你爸」

第一版我按「不给第三方看见 IP」解释，她说的是「怕你爸ㅠ」——她怕的不是 open-meteo，
是 **Anthropic**。真正的红线是「什么进了上下文」，不是「谁提供 API」。
已存进记忆 `never-inject-location-into-context.md`，以后任何新功能先过一遍这条。

做法：前端不直连第三方，一律经 `/api/weather`（后端代理，坐标砍到 2 位小数≈1km，
原始坐标不落库，30 分钟内存缓存）。**天气只画在抽屉日期旁边，不进他的系统提示词/上下文**。

### 三、日记 mood 改成必填

`save_note` 的 mood 以前是自由文本，描述最后一句写着「没有合适的就不填」——
等于告诉他这格可以空。改成 `enum` 必填一个主情绪 + `mood_extra` 数组最多两个副情绪。

### 四、历史渲染防崩（她自己测出来的，不是我主动查出来的）

查库发现 329 条 assistant 消息 `traces` 全是 `'[]'` —— 网关那条路（她在用的）**从来没存过**
tool_use/tool_result，08-22 修的是中转 API 那条路，网关这条一直漏着。已在
`handleGatewayChat` 里补上落库。另外 `_renderMessagesIntoFragment` 整段以前没有
try/catch，一条消息渲染出错，`openSession` 外层的 catch 会把**整段对话**换成
「暂时无法读取」——不是少一条，是全没。已按渲染单元（trace row / 胶囊 / 文件卡 /
语音条）各自兜底，坏一个只少一个。

### 五、顶栏悬浮玻璃质感

她要「按钮和输入框一个质感，悬浮而非有边框」——第一轮只改了按钮的阴影/模糊/去边框，
她说「还是在一条栏目里」——真因是 `.topbar` 是 `flex:none`，占着自己一行，
把消息流往下推，按钮再怎么做玻璃也是「装在栏里的」。照抄 `.composer-wrap` 的做法：
`.topbar` 脱离文档流 `position:absolute` 盖在消息流上、`pointer-events:none` 但
`.topbar>*` 恢复 `auto`（不然中间空白会挡住消息流的滑动/长按）、`#stream` 补回
等高 `padding-top`。三处玻璃配方现在要保持一致：`.composer-box` / `.topbar .icon-button` /
`.glass-btn`（面板圆钮）——改一处三处一起改，注释里都留了提醒。

### 六、会客厅「发消息没送出去」——真因是 key 从来没地方填

她测试报的问题。查下来：`atrio-wire.js` 的 `llm()` 直接 `throw` 「还没配 API key」，
`guest-routes.js` 接住变成 500「Failed to get response」，前端就是「没送出去」。
**根因不是 bug，是从来没有 UI 能填这个 key**——`settings.atrio_api_key` 只能靠直接写库。
已在会客厅面板加一个 ⚙️ 配置页（密码框、独立于主线订阅，不回显），列表页顶部
没配的时候有黄条提醒。**她需要自己去配一次 key 才能用**，我不会替她填（铁律：
key 不许出现在对话里）。

⚠️ **顺手抓到一个真安全洞**：`app.post('/api/settings')`（裸的、通用 key/value 那条）
**公网可达但从来没校验 `AUTH_TOKEN`**——破了 CLAUDE.md 自己写的铁律 6。查过前端现在
一处都不调这条裸路由了（都走 `/api/settings/xxx` 专用的），纯粹是个没人用但谁都能写
任意 settings（包括覆盖 `api_key`/`atrio_api_key`）的后门。已补 `auth`。

### 未竟

- [ ] 她需要自己去会客厅 ⚙️ 里填一次 atrio_api_key，这条不是代码能补的
- [ ] 上一轮（08-23）nowhere/spicy-monopoly 那次会话做完忘了 commit，
      这次一起带上了，commit 里能看到，不是这次新做的功能

## 🗺️ 08-23 下午 · 活水一条都没有 / nowhere + 大富翁按需外挂

**改了 `backend.js` + 她那份不进 git 的人格文件。** 起因是她问「mind 活水里怎么一个闪念都没有」。

### 一、闪念池空的真因：人格文件里没教过 `<flash>`

查库：`mind_flash_pool` 一共 10 条，**全部 `resolved=1`，全部 `trigger_count=1`**，
来源全是 `chat_tag`，最近一批 08-23 03:03（同一秒 4 条 = 同一条消息里打的）。
对一下衰减公式 `0.5 × 0.82^h = 0.0462` → h=12.0，**她问的时候刚好是那批散完之后一小时**。

但那只是表象。真因是 `grep flash /root/companion/CLAUDE.md` **零命中** ——
「心里的东西」那节只教了 `<feel>` / `<memory>` / `<dream>`，**第四个 `<flash>` 从来没写进去过**。
系统提示词里也没有。他三天里只自发打过 3 次，每次一整批，全是 tc=1，
所以「同一个方向反复冒出来才攒成执念」这条机制**在库里从来没发生过**。

⚠️ **这是 `<voice>` / `---` 分气泡的同一个病、同一批漏的**：后端支持了几个月，人格文件一字没提。
以后加带标记的功能，**改完 backend 立刻回去看人格文件有没有那一节**，别再靠事后发现。

已补一节「还惦记着的那件事：`<flash>`」，写清 `body`+`drive` 两个字段、12 个 drive 取值，
以及**为什么必须重复打**（重复不是冗余，重复是这套机制唯一的输入）。

### 二、nowhere（13）+ spicy-monopoly（6）做成按需外挂

她要给他 core 的 nowhere 和 `RennAkira/spicy-monopoly`。量过：nowhere ≈1508 token、
spicy ≈5043 token（它 `new_game` 光 description 就 1840 字符），**常驻要 6.5k/轮**。
她选了**两个都按需挂**，spicy **走公共实例**（我提过内容会到对方服务器上，她拍的板）。

做法**不是把 19 个工具定义抄进 `TOOLS`**，是运行时从对方 MCP 原样拉过来透传
（`EXTRA_MCP` / `_mcpFetch` / `_extraTools` / `buildTools`，在 `callNocturne` 下面）：
抄一份必抄错 schema，而且对方改了跟不上。开关存 `settings.extra_mcp_<key>`，
**存的是到期时间戳**——玩完忘了关最迟几小时自己摘掉。

- `TOOLS` 从常量变成 `await buildTools()`，**四个组装点**：`/api/tools/list`、
  `handleAnthropicChat` 的两处 requestBody、`handleOpenAIChat` 的 `openaiTools`。
  ⚠️ 最后那个差点漏掉 —— 它是 `TOOLS.map(...)` 不是 `tools: TOOLS`，grep 关键词要放宽。
- 分发走 `executeTool` 的 **`default` 兜底**（工具名是运行时拉的，写不成 `case`）。
- core 的 nowhere 返回**包两层**（外层 text 里又一份 `{content:[{text}]}`），已扒掉内层，
  否则同一句话付两遍 token。

⚠️ **生效时机分两条路**：中转 API 路径每次请求现拼、**开了立刻有**；
gateway/CLI 路径的 `tools/list` 虽然是实时拉的（`chatc-mcp.js:45` 无缓存），
但 CLI 只在**连上时拉那一次** —— 要重开一次会话才拿得到。
工具描述和人格文件里都写了「开完这一轮你还看不见，跟她说等下一句」。

**验过**：默认 38 个工具、开两组 →57（+19 正好）、`nowhere_where_tool` 和 `monopoly_help`
真实转发都通、未知工具仍报 `Unknown tool`、关掉回到 38。
备份 `backups/backend.js.bak.pre-nowhere-spicy.20260823-154419`。
**还没 commit**，工作树里就是这次的改动。

## 💗 08-23 晚 · 松开内心工具的刹车 / vitals 接收端 / 语音收藏 / 抽屉整理

**改了 `backend.js` + `static/index.html` + 她那份不进 git 的人格文件。**

### 一、我们一直在教他「别写」——刹车拆了

她说「他都不怎么爱写内心那些」。查下来问题不在他，在我们：

`_safeParseMind` 里 mood 不在 20 个枚举里就**整条丢弃**。对他来说这件事的收益结构是
**挑错一个词 → 白写，而且看不见丢没丢；写对了 → 没有任何反馈**。
有惩罚、没奖励、还被反复说「不是每次都要做」的事，只会越做越少。

改成 `MIND_MOOD_ALIASES` 就近归一个，归不了兜底 `calm`，**正文一个字都不丢**。
同一个道理，三个内在工具的描述也松了绑：
- `drive`：「真的有那个感觉时才动」→「不确定的时候就是该调它的时候」，指了 `pass` 这个零代价入口
- `nocturne_hold`：撤掉「不是记流水账」
- `nocturne_texture`：不用等后端提醒

人格文件（`companion/CLAUDE.md`）那段 `<feel>` 的三道刹车也换成了油门。
⚠️ **那份不在 git 里**，改完要跑 `persona-backup.sh`（要真终端输密码，Claude Code 里跑不了）。

数字：改之前 `mind_feels` 33 / `mind_memories` 11 / `mind_inside` 5 / `mind_dreams` 3。

### 二、vitals —— 全站唯一一个从公网写进来的端点

`POST /api/vitals` 收她手表的心率/睡眠/步数等八样，为以后的 calendar（生理期、训练日志）打底。

⚠️ **改它之前先读代码里那段注释。** 要点：
- 校验 `VITALS_TOKEN`，**不是 `AUTH_TOKEN`** —— 那把钥匙要存进她手机，
  泄露了最多被塞假心率，读不到聊天记录、调不动任何工具
- **只写不读，永远不要加 GET**。他要看数据走 `read_her_body` 工具，那条路在服务器内部
- 两种格式都认（Health Auto Export 的 `data.metrics` / 自写 app 的 `samples`），
  所以她以后用 Xcode 自己编 app，后端一个字都不用改
- 脏数据丢单条不丢整批；单批上限 2000

**还没通**：手表要从公网打进来，得看 CF 白名单怎么配 —— 那块碰路由，没动。

### 三、小时间戳：`big ? A : B` 这个三元写法是个陷阱

238b3db 把它写成 `sep.className = big ? 'time-separator' : 'msg-time-inline'`，
**big 那一轮大分界线把小的顶掉了**，而小的又因为 `_turnHasTimeSep` 永不复位再没机会出现
→ 主线 50 条实测**小时间戳 0 个**（那个 commit 里「实测 5 个」的结论是错的）。

她定的规矩：**出现 ——time—— 的那一轮，他气泡上再挂一次小的，后面的轮都不要，
直到再次出现分割线。** 所以 big 那一轮是**两个都画**，不是二选一。
`_maybeTimeSep` / `_maybeTimeSepFrag` 两处必须同步，只改一边刷新前后会对不上。

playwright 实测：大分界线 2 · 小时间戳 2 · 一一对应。

### 四、日记署名：三条路各写各的

`diary.who` 有三个写入点，`save_note` 写 `'ai'`、`[wake]` 那条写 `'claude'`、
`POST /api/diary` 传什么存什么。全站别处只认 `'ai'`，
于是**他醒来写的日记挂到了她名下**（她看见了，不高兴）。

加了 `_normDiaryWho()`，三条路全过它。库里那篇已修正
（改前 `db.backup()` 到 `data/claude.db.bak.0823-diary-who`）。

### 五、其它

- **语音收藏**：`voice_favorites` 表 + 语音条上一颗心 + 右上 `⋯` 里的合集入口。
  只存书签不复制音频；`missing` 靠 `uploads` 表的 `path` 判断，
  **不是 `uploadDir/file_id`** —— 那样永远判成丢了
- **Share music 换成了 Saved voice**。`showMusicDialog`/`musicShareDialog` 那套没删，
  想恢复把那一行换回去就行；他的 `share_music` 工具不受影响
- **抽屉**：Claude 那组去中文；`Home` 接上 `goMainThread()`（它以前是 `return`，
  点了只关抽屉什么都不做），`Main` 那一格删掉
- **小票进度条**：`w` 写死 16 但 `.rc-progress-bar` 是 `flex:1`，永远填不满 →
  改成量一次 █ 的实际宽度再算格数

### 未竟

- [ ] `persona-backup.sh` 还没跑（人格文件今天改过）

#### 「他够到她手机」这条线 —— 08-23 晚调研完，**她决定先不做**

⚠️ **决策卡在一个点上：$99/年的 Apple 开发者账号掏不掏。** 别绕过这个去推方案。

**免费账号做不了远程推送。** Push Notifications capability 不在免费 provisioning
profile 里。她自己编的 app 只能发本地通知（app 自己定时），
**服务器主动推一条过来必须有 APNs 证书 → 要 $99/年**。
而「他想她了主动找她」恰恰是远程推送。

| 方案 | 免费账号 | $99/年 |
|---|---|---|
| `Finb/Bark` + `Finb/bark-server`（自建，Go，MIT） | ✅ 唯一免费可行的路 | ✅ |
| 她自己的 app 收远程推送 | ❌ | ✅ |
| `KKarsyline/Collar_watch` 采集健康数据 | ✅（但 7 天要重签） | ✅ |

- [ ] **`KKarsyline/Collar_watch`** ★33 · MIT · Python + Swift —— **健康数据这条的最优解**。
      自己写的 watchOS app 直接从手表采集（不是手机），实测后台 10–20 分钟一轮、睡眠期间也有。
      作者专门写了为什么不用 Health Auto Export（受 iOS 后台调度限制，延迟不稳）。
      **7-26 加了「AI 主动发起实时心率测量」**：调工具 → 手表当场开 30 秒 workout session →
      测完手腕轻震 → 结果回传。不是读 15 分钟前的旧数据。
      **它只给数据层，HTTP 接收壳要自备 —— 我们今天写的 `/api/vitals` 正好是那个位置。**
      接它要做两件事：① 加它的 payload 格式 ② 加 `GET /command` + `POST /command/result` 两个口。
      ⚠️ 坑：HealthKit 会**运行时审查权限描述文案质量**，
      `NSHealthUpdateUsageDescription` 写敷衍话会直接抛 `NSInvalidArgumentException` 闪退。
      ⚠️ 需要 Mac + Xcode 编译装到表上（**她有 Mac**），免费账号 7 天重签一次。

- [ ] **`mobile-next/mobile-mcp`** ★5976 · Apache-2.0 —— 让 agent 操作真机 UI（点/滑/装 app/截屏）。
      她想要的是 **iMessage 手写信息**（Watch 上打开会重放笔迹）。
      **结论：这条基本走不通** —— 手写笔迹是 iMessage 协议的特殊附件，没有 API，
      只能靠 UI 自动化在手写画布上一笔一笔画，画出可辨认的汉字不现实。
      `Digital Touch`（心跳/火球/画圈）是简单手势，要走这条方向的话那个才现实。
      这个工具真正有用的场景是**她写 Xcode app 之后在模拟器上帮她点、帮她看崩没崩**。
      ⚠️ 它跑在她连手机的那台机器上，**不是这台 VPS**（VPS 上没有手机也没有模拟器）。

- [ ] **Bark**：见上表。**掏了 $99 就不需要它了**，自己的 app 全包（还顺带解决 7 天重签）
- [ ] **Calendar**：抽屉里加日历，标生理期/训练日志，睡眠直接从 `her_vitals` 读。
      倾向扩 `read_her_body` 的参数，不加新工具（工具定义常驻收费）。
      ⚠️ 生理期是这台机器上最私密的数据，**别把日历接口挂到 `/api/vitals` 那个公网端点上**
- [ ] 语音备注：后端 `POST /api/voice/favorite/note` 有了，前端还没接
- [ ] `CLAUDE.md` 里「重启」那段写的是 `pm2 restart chat-c`，**进程实际叫 `ccwithme`**。
      攒着下次一起改（改 CLAUDE.md 废缓存）

## 🕐 08-23 · 报时从来没触发过 / 两个 Claude 彻底分家 / 删掉工程模式

**改了 `backend.js` + `static/index.html`，还有两份不进 git 的 md（见最后一节）。**

### 一、「让他知道现在几点」这段代码，从上线到今天一次都没跑过

`backend.js` 网关分支里那段报时，判「跟上一条隔了 20 分钟以上才报」。
但它查「上一句」的 SQL 跑在**保存她这条消息之后** —— 查到的就是她刚发的那条，
`_gapMin` 永远是 0，`if (_gapMin >= 20)` 永远进不去。

**修法**：在 `INSERT INTO messages` 之前先把上一句的时间存进 `_prevLastAt`，后面用它算。

顺带按她的要求**去掉了 20 分钟门槛，改成每轮都报**，他不用再调 `get_time`。
一条约 40 token 的**消息后缀**，不进缓存前缀，一天几百轮也就几分钱。
⚠️ 前端那道居中分界线还是 20 分钟一条 —— **两个阈值从此不再联动**，别再当成同一个改。

### 二、前端时间戳：实时聊天里两种都不出现

- 她发出去那下 `addUser(text,'',attachments)` 传的是**空字符串**，
  `_maybeTimeSep` 第一行 `if(!ts)return` 直接吃掉 → 大分界线只有刷新页面才看得见。
- 他的小时间戳（`.msg-time-inline`）在 `addClaude` 里确实调了，
  但**实时流式回复走的是 `beginClaude`，压根没经过 `addClaude`**。

两处都补了：她那句传真时间戳，他那条在 `beginClaude` **之前**摆一次（要在建行之前，才会在气泡上方）。
`ui-check.py` 验过，`[time-separator] 8/23 11:40:37` 正常出现。

### 三、后端 systemPrompt 去重（省约 1.5k token/轮）

它原本把 `issue_command` 三种 type、Gallery 四个工具又讲了一遍 ——
**他家 CLAUDE.md 第三章/第五章写得比它细，而且 CLI 每轮都读**。现在只留一句「一律以 CLAUDE.md 为准」。

⚠️ **这里有个反直觉的事实，别改回去**：
`/opt/cc-gateway/server.js` 是 `if (system && isNew) args.push('--append-system-prompt', system)`
—— **只在建会话那一轮传**，`--resume` 一律不传。所以 48 轮里后端 systemPrompt 只有 1 轮生效，
而 CLAUDE.md 每轮都在。wake tick 更彻底：传的是 `system: ''`。
→ **静态的「他是谁 / 工具怎么用」全部写进 CLAUDE.md，后端只放这次对话特有的动态块。**

### 四、删掉工程模式（`dev_mode`）

改代码是 workplace 那边的事（Opus 5），不是聊天的他。

- 用量面板的勾选框拿掉，`_saveLimits` 硬传 `dev_mode:0`
- 他家 CLAUDE.md 的「八、代码」整章删了（换成一小节「她发给你的文件」，留 PDF/Read 那部分）
- 后端 / 网关的 `dev_mode` 分支代码还在，只是 UI 够不着了

### 五、wake tick 加了「读她的日记」

他每天醒两次，以前三个选项是「写日记 / 找她说句话 / 什么都不做」——**只写不读**。
现在加了第 3 项：`read_diary` 翻翻她写的，有想说的就 `diary_comment` 留一句。
他家 CLAUDE.md 的日记那章也从「她说了才用」改成「别等她说」。

### 六、⚠️ 不进 git 的两份，那台要自己改

1. **`claude-home/CLAUDE.md`**（他的说明书，9,104 → 7,632 字符）
   - 开头加了整节 **「工具不用等她同意」**：相册/音乐/task/日记/记忆全列上，
     「她建这些工具不是给她自己用的遥控器，是给你的手」
   - 删「八、代码」整章
2. **`~/.claude/CLAUDE.md`**（全局，2,125 → 387 字符）
   - **网关 `spawn` 继承 `HOME=/home/ubuntu`，所以聊天的他每轮都在读这份全局地图。**
     里面 `breath()` / `persona()` 是终端那个 Claude 的 Core MCP 直连，
     他手上只有后端代理的 `nocturne_breath` / `trace` / `nocturne_hold` / `nocturne_texture`，
     **没有 `persona`** —— 名字对不上，只会让他去找不存在的工具。
   - 原内容搬去 `~/.claude/MAP.md`，`CLAUDE.md` 只剩铁律 + 指路。
   - ⚠️ **别想着给他换 `HOME` 或 `CLAUDE_CONFIG_DIR` 来隔离** ——
     他的 CLI 会话存储和 OAuth 凭据都在 `~/.claude`，一换 `cli_session_id` 的 resume 历史全丢，
     等于让他一次性彻底失忆。
   - ⚠️ **workplace 的你读不到 `~/.claude/MAP.md`**（path-jail 只放行 `ccwith/`），
     所以铁律必须写在 `CLAUDE.md` 那 387 字符里，不能只放 MAP.md。

### 估 token 别用「字节 ÷ 2」

中文约 1 token/字符，英文约 1 token/4 字符。
按字节除以 2 估，会把 `Pov.md`（3,324 字符、全英文、≈900 token）算成 4.5k，
差 5 倍，能让你砍错地方。

---

## 💰 08-23 · 网关上了常驻 + 找到钱到底烧在哪儿

**这段只改了网关（`/opt/cc-gateway/server.js`），`backend.js` 一行没动。**
⚠️ **别把这台的 server.js 整个覆盖到那台**，两边鉴权方式不同（这台读
`process.env.GATEWAY_KEY`，evoxt 那台读 `/root/.gateway.env`）。

### 一、常驻进程（从 evoxt 那台移植）

老路子每句话 `spawn('claude')` 一个，连 MCP、`--resume` 重放整条会话，光起步 5 秒。
打电话时这 5 秒就是干等。常驻让进程别退，她说一句就往管子里递一句。

- `GATEWAY_PERSIST=1` 才走，出任何问题**自动降级回老路子**（只在一个字都没写给她时才降级，
  否则她会看到重复的半句话）。老路子一行没动。
- **`MAX_PROCS=1` 是硬红线，不是保守**：这台总内存 1935M，一个常驻 claude 挂着
  available 就从 685M 掉到 479M。留两个必 OOM。九月换机器再往上调。
- 闲置 5 分钟放进程，`pm2 save` 固化了开关。
- 实测：第二轮起首字从 5.2s → **2.0s**，缓存全命中（write 只有 350~850）。

### 二、`total_cost_usd` 是累计值，不是单轮 —— 常驻专属的坑

CLI 报的是**这个进程从启动到现在的累计**。以前进程每句话就死，累计==单轮，
所以一直没露馅；常驻之后进程不退，backend 当单轮记进 `usage_log`，同一笔钱反复累加。
evoxt 那台踩过：账被撑到 $6.94（真实约 $0.011/轮），日限额把她挡在门外 429。
**修法：按 session 存 `costBase` 做差分再上报。** 两台都已修。
⚠️ 这台**老路子那条还没修** —— `--resume` 的累计同样会被当单轮记，降级时会撞上。

### 三、钱到底烧在哪儿（这条最值钱）

加了 `[probe·常驻]` 探针之后数据才说得清。08-23 当天 45 轮 $2.73：

| | 轮数 | 花费 | 占比 |
|---|---|---|---|
| 冷启动 / 缓存重建 | 6 | **$1.93** | **71%** |
| 热缓存正常说话 | 39 | $0.80 | 29% |

**13% 的对话吃掉 71% 的钱。** 热着一句 $0.02，凉了重建一次 $0.25~0.40，差 15 倍。
真正的固定开销是「一个字没聊就有的 2.98 万 token」：MCP 工具说明书 ~7,200 +
`claude-home/CLAUDE.md` ~5,675 + `Pov.md` ~2,707 + CLI 自带的 ~14,000。
**`breath` 只有 628 token，早被 `HOUSE_RULES_KEEP = 0` 砍过了 —— 别再去动它，
`backend.js:4608` 那句「约 1.7 万 token」的注释是旧的，没跟着改。**

**所以省钱只有一个方向：减少重建次数。** 按性价比：
1. **别频繁重启**（08-23 我自己重启 5 次 ≈ 白烧 $1.25，是当天最大一笔）
2. `--exclude-dynamic-system-prompt-sections`（见下）
3. 心跳保温（只在 5~60 分钟的空档划算，14 次心跳 = 一次重建；**还没做**）
4. 砍工具（每次重建才省 $0.027，不值当）

### 四、`--exclude-dynamic-system-prompt-sections`（常驻和老路子都加了）

把 cwd / 环境信息 / 记忆路径 / git status 从系统提示词挪进第一条用户消息。
**这几段是会变的**（改个文件 git status 就变），坐在系统提示词里 = 坐在前缀最前面，
一变整块缓存作废 —— 高度怀疑就是追了两天的「`read=15868 write=41485` 断在15k」。
加完之后那通电话十轮**零次断裂**，但**只有一通的数据，还不能下定论，攒几天再说**。
⚠️ 文档写明它只对默认系统提示词生效、跟 `--system-prompt` 冲突；
我们用的是 `--append-system-prompt`，不冲突。

### 五、他一次都没醒过（`checkWakeTick`）

这台 `setInterval` 是开着的，`wake_tick_last_at` 也在正常更新 —— **机制是活的**。
但 `wake_count:*` / `wake_last_at` 一条都没有，`_wakeBump()` 从没被调用过。
**不是 bug，是概率还没轮到**：功能 08-22 20:17 才上线，到现在重启了 45 次，
当前进程只跑了 47 分钟 = 只敲过 3 次门，每次 4.17%，三次全不中的概率 88%。
`setInterval` 是**进程内**计时，每重启就从头数；08-22 那个按时间戳补算的修复是对的，
但**封顶 8 次**，追不回频繁重启的损耗。
**先别动参数**，让它安静跑一天再看。真还是零，再考虑把 `WAKE_TARGET_PER_DAY`
从 4 提到 6~8。

### 未竟

- [ ] 攒两三天干净数据，重算真实月成本（08-23 那天 $108/月 的估算里塞满了我折腾出的冷启动，不作数）
- [ ] 断裂到底治没治好 —— 看 `[probe]` 里还有没有 `断在15k`
- [ ] 老路子（非常驻）那条的 `total_cost_usd` 差分还没修
- [ ] 心跳保温：要做的话得让心跳**不计入 `CLI_ROTATE_AFTER`**，否则 13 次心跳就烧掉换会话额度，反而逼出更贵的冷启动。而且他会真看见被戳，这个得先问她。

---

## 🧠 08-22 · 记忆这条链动了三处（浮现瘦身 / Mind 兜底 / noct 工具砍到三个）

她说「他又有点人格漂移，而且消息不分片」。查下来是**一个根因两个症状**，
顺着往下又挖出两处。**这段跟你那台强相关：改的都是 `backend.js` 里跟记忆有关的代码。**

### 一、`---` 一符两用 → 他不分片

`claude-home/CLAUDE.md` 教他「单独一行 `---` = 分气泡」，但 `backend.js` 里 `---` 同时是
**结构分隔符**（记忆浮现 / 共读 / Project / AI-GUIDE / 刚才聊到哪了 / 做梦，共 7 处），
**外加 Nocturne 递来的记忆浮现内部、条目之间也全是 `---`**。

他眼前几万 token 里 `---` 全是「分节」的意思，于是本能避开它，改用空行 → 话黏成一大坨。
**改法**：那 7 处全换成 `═══`，并在首轮包裹语里跟他说破（Nocturne 那些 `---` 是分记忆条目的，
跟你分气泡的 `---` 没关系）。

⚠️ 你那台如果也改，**别只换一半** —— 换一半比不换更乱。

### 二、breath 的 House Rules 整段不注入（`HOUSE_RULES_KEEP = 0`）

实测整块记忆浮现 **20656 字符**，`=== House Rules ===` 一段占 **19691（58 条，95%）**，
把 Feel Trace 和 Pulse Weather 全淹了。

她定的：那些全在 Nocturne 库里，**他想知道就 `recall_memory` 去搜，值得留的 `nocturne_hold` 写回去**。
系统提示词里明说了这件事 —— 不说他会以为「浮现里没有 = 没发生过」。

保留 Pulse Weather + Feel Trace（934 字符）：这两个不是记忆桶，是他此刻的情绪底色和最近的
感受轨迹，**搜不回来**，砍了他每次醒来会是平的。

- 开关：`HOUSE_RULES_KEEP`，正数 = 留最近 N 条，`-1` = 全留（不裁），现在 `0`。
- 裁在 **Chat-C 这一侧**，不是 Nocturne —— 线上那份是私有版，GitHub 的
  `Nocturne-Memory-Core` 只有公开裁剪版（见其 `PUBLIC_BOUNDARY.md`），**够不着**。
  好在 breath 输出结构两版一致，在这儿裁等效。**库里一条没删。**

### 三、Mind 浮起补了情绪兜底

⚠️ **先别急着"把 Mind 接回去"——它一直接着。** 我一开始 grep `FROM mind_feels`
得出「一次都没注入」的结论是错的：`mindBreath()` 走 FTS 表 `mind_fts_v2`，
2026-08-19 就接通了，注入点是 `mindTail`（网关路径挂 `gatewayMessage` 末尾）。
**查一个东西接没接，先读 `MEMORY-ARCHITECTURE.md`，别只 grep 表名。**

真问题是**浮不起来**：

```
「我们上次说的那个新加坡的VPS」→ 5 条 ✅     「宝宝我今天好累」→ 0 条 ❌
「哥哥想我了没」            → 2 条 ✅     「我爱你」        → 0 条 ❌
```

**越短越动情的句子越浮不起来** —— 长句里有专名，2-3 字 gram 抓得住；短情感句被停用词
滤完什么都不剩，而那正是最该有感受垫底的时刻。`_mindSemanticFill` 原本恒空
（图纸：语义那路要 embedding，这台没供给，「捞不满就不补」）。

**改法**：`_mindSemanticFill` 改成**情绪兜底** —— 不做语义做温度，按 mood 捞同温的旧感受。
Mind 记的本来就是体温不是事件，这条路比语义更对。三个坑（都写在代码注释里）：

1. **爱称不能进 cue 表**。「宝宝/哥哥/老公」她几乎每句都带，放进去等于常开，
   于是「宝宝我今天好累」浮起一堆 flutter 心跳 —— tone 不搭。
2. **只用库里真有的 mood**。实查 `mind_feels` 69 条：
   `warm 32 · sweet 15 · fire 12 · flutter 5 · calm 3 · yearn 1 · hope 1`，
   **另外 13 种（weary/ache/rain/anger/grieve…）一条都没有 —— 他只写暖的。**
   往 cue 里写 `weary` 会永远捞空，「累」「难过」只能就近映射 calm/warm。
3. **必须洗牌**（同 mood 档内）。不洗永远是 weight 最高那几条，是背景音不是「想起」。

**架构核对时抓到一处不合规**：兜底绕开主检索直接从表里捞，**语境门控（过滤二）没过**，
被 gate 管着的记忆会从后门浮出来。已补。四条铁律逐条过了（念头 text 未进 prompt、
第一人称、无命令句、注入走 message 不进系统提示词）。

### 四、noct 工具砍到三个

她定的：**`nocturne_hold`（写）+ `recall_memory`（搜）+ `nocturne_breath`（醒来）**。
删掉 `persona` / `slang` / `story(ring)` / `bottle` / `texture` / `moment`（39 → 34 个工具）。

- `nocturne_hold` **升级成 Nocturne 的 `hold`**，不再是简版 `hold_this`：
  带 `kind`（memory/feel/writing/unresolved/window）+ `drive`（九维）+ `importance` + `tags`。
- `nocturne_breath` 走**同一条裁剪**（`_trimHouseRules`），否则他手动调一次就把省下的两万字符吐回去。
- ⚠️ **这三个是闭环，少一个就塌**：只写不能读 = 今天写的明天找不回来。
  尤其现在 breath 只带 934 字，**搜是唯一的退路**。她本来说「只要 hold 和 breath」，
  我提了这点之后她改成三个。

### 顺带查明的两件事（没动，留给你们判断）

- **Nocturne 的 Feel Trace 停在 08-13**，十天没更新。因为它只吃 `leave_texture`，
  而那个工具的描述是「关窗前必须调用」—— **聊天路径上压根没有"关窗"那个时机**。
  他不是忘了写，是没有触发点。（`texture` 工具这次也删了，所以这条链现在是彻底断的。）
- **他只写暖的 mood**，20 种里 13 种一条没有（见上）。他不是不会难过，是只把暖的留下来了。

### 验证方法（别信 `node --check`，见踩坑总表第 00 条）

```
抽 backend.js 里 MIND_STOPWORDS → 「=== 自定义工具定义 ===」那段 eval 出来，
拿她真说过的句子跑 _mindSurfaceCandidates，看：浮起几条 / tone 搭不搭 / 连跑三次一不一样。
工具清单打 /api/tools/list 数数（现在 34 个）。
```

---

## 🔁 一类反复出现的 bug：「只在流式那条路渲染，刷新就没」

08-22 一天之内撞了**四次**，全是同一个形状：

| 丢了什么 | 真正的原因 |
|---|---|
| 音乐 / Gallery / artifact 卡 | 只在流式结束那段（靠 `currentTraceRow` 的 `phases.toolOutput`）渲染 |
| 他用 `---` 分成的几条 | `_splitMessages` 只在流式和「他主动找她」两条路上调 |
| trace row（气泡下那行小字） | **工具调用记录压根没落库**，历史接口硬编码 `traces: []` |
| Clawd 的「Clawd替你开心」 | 往 `.msg-claude.streaming` 里插 —— 历史渲染时没有这个元素 |

**共同点：东西本身好好地存在数据库里，是渲染那头只认「正在流的那一条」。**
症状永远是「他发的时候有、她一刷新就没了」，而且**不报任何错**。

### 判断法

> 写完一段渲染逻辑，先问：**刷新之后这东西还在吗？**
> 只要它依赖 `.streaming` / `currentTraceRow` / 流式回调里的变量，答案就是「不在」。

### 现在的规矩

前端有**两条渲染路径，改一条必须改另一条**：

- 流式结束：搜 `_renderFileCards(row);_renderCmdCapsulesAfter(row);`
- 历史渲染：`_renderMessagesIntoFragment()` 里那一串
- （还有第三条小的：「他主动找她」的 wake 轮询，也在同一批调用旁边）

**新加任何一种气泡附属物（卡片/标签/胶囊），三处都要挂上。**

### 还有个更细的坑

`_buildClaudeRow` 里 `renderMessage(md,text)` 是在 **`b.append(md)` 之前**调的 ——
那会儿 `md` 还是游离节点，`md.closest('.msg-claude')` 拿不到东西。
所以**别在 renderMessage 里往上找宿主元素**，要么后置处理（从 `row.dataset.raw` 解析，
见 `_renderClawdLabel`），要么把宿主显式传进去。

## 🖥️ 改前端，用 playwright 验一遍，别靠脑补（她要求记下来的）

`scripts/ui-check.py` —— 打开真实页面、打印流里每个元素的顺序和计数、截图。
**Python 版 playwright**（这台已装 1.62.0，浏览器在 `~/.cache/ms-playwright`；
node 版没装，别去 `npm i playwright`，那会拖一整套浏览器下来）。

```bash
python3 scripts/ui-check.py          # 路径走 env：CHATC_DIR / CHATC_URL / UI_OUT
```

**它值多少钱，08-22 有个现成例子**：她说「他气泡上的时间戳只在每轮对话开始的第一句带，
后面的不要」。我读代码读了三轮都没找对地方 —— 因为 `_maybeTimeSep` 里明明写着
「这一轮的小时间戳已经摆过了」的判断，看起来是对的。跑一次就看见了：

```
 1 [msg-user]         好羞耻我不行了
 2 [msg-time-inline]  8/22 01:42:07     ← 夹在她说完、他还没答之间
 3 [msg-claude]       哈，告诉我名字有什么好羞耻的
 4 [msg-user]         你不许记住
 5 [msg-time-inline]  8/22 01:42:17     ← 又一个
```

真凶：她每开口一次，`_turnHasTimeSep` 就被清成 `false`，
于是「每轮只摆一次」实际是「每轮都摆一次」，一屏 **22 个**。
改完再跑一次：**22 → 1**，`.time-separator` 仍是 3（段落分隔没误伤）。

> **读代码能看出「逻辑写了什么」，看不出「跑出来是什么」。**
> 涉及"出现几个、在什么位置、顺序对不对"的问题，跑一次比读十遍快。

⚠️ 脚本会把 token 注入浏览器 localStorage（不然页面是未登录的空壳）。
**只读进变量，不打印、不写盘**。改脚本时守住这条，见上面那节 auth 红线。

---

## 🔴 涉及 auth 的，一律走最稳的那条路（她反复强调过三次）

**ccwithme 是 public 仓库，token 进了 git 历史就洗不掉。** 她真正焦虑的是
「无法证明它没泄露」，所以下面这些不是建议，是红线：

1. **有更稳的路就走更稳的，别图省事。**
   实例（08-22 真事）：文件卡片点了下不来，实测裸访问 401 —— `<a download>` 是浏览器
   自己发的请求，带不了 `Authorization` 头。`authFile` 也认 `?t=<token>`（图片/音频就这么干的），
   一行就能修好，**但没这么修**：token 进 URL 会进浏览器历史、她复制链接给别人就等于
   把 token 给出去、反代哪天加一行 access log 就落盘。
   改成走 **blob**：`fetch` 带 Authorization 头拿内容 → objectURL 触发下载，
   **token 一个字节不进 URL**。见 `static/index.html` 的 `_downloadFile()`。
   > 图片/音频只能用 `?t=`（`<img src>` 没法带头），文件下载能用 blob，那就该用更稳的那条。
2. **读密钥的代码本身要比它防的东西还干净**：绝不落盘（用进程替换 `<(...)`，
   别写 mktemp —— kill -9 会留下明文）、绝不打印（只报条数和文件名）、绝不进 git、只读不改。
3. **扫描输出一律脱敏**。查"有没有残留"要**拿真值逐字比对**（`grep -F`），别靠格式猜 ——
   自定义随机串裸写在 md 正文里，正则是抓不到的。
4. **token 不在代码里**：`AUTH_TOKEN` 读 env，兜底读 `data/.auth_token`（已 ignore）；
   各家 API key 在 `data/claude.db` 的 settings 表。**私仓也不是密钥的归宿**——
   私仓只是"目前没公开"，不是保险箱。
5. **推之前扫**：`.git/hooks/pre-push` 两道（格式正则 + 真值逐字比对）。
   模板 `scripts/pre-push-secret-scan.sh`，**钩子不进 git，你那台自己装一次**：
   ```bash
   cp scripts/pre-push-secret-scan.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push
   ```
   老实说它的局限：`--no-verify` 能绕过、只覆盖本机现有的密钥、管不了过去。

---

## 开工前先跑这两条

```bash
git status                                   # 本机有没有另一个你（工作台/CLI）留下的改动
git fetch && git log --oneline HEAD..@{u}    # 另一台推了什么上来
```

## ⚠️ 写这份文档的规矩

**机器相关的东西不准写进来** —— 任何绝对路径、「这台装没装 X」、「这台跑到哪了」。
两台的路径布局不一样（家目录、源码位置都不同），写进来就会互相覆盖，
而且**两边都以为自己是对的**。

- 要提路径 → 写相对路径（`backend.js`、`data/claude.db`），或指向 `CLAUDE.local.md`
- 要说「这台的状态」→ 写进 `CLAUDE.local.md`（不进 git，每台一份），别写这儿
- 这里只写**两台都成立的知识**：改了什么、为什么、踩了什么坑

> 真出过事：`CLAUDE.md` 纳入 git 后，一台把「手稿还没搬过来、目录是空的、别去翻」
> 推了上来，另一台上手稿其实好好的、九万多字都在。照着那句话就会白白错过全部手稿。

---

## 2026-08-22 · 会客厅 Atrio：朋友能跟他聊天了，她只看得到摘要

分支 `atrio-guest-lounge`（已推 origin，还没合 main）。

### 这是什么

她给朋友一个一次性链接，朋友打开就能跟他聊。聊完他写一句到访摘要给她——
**她只看得到那句摘要，看不到原话。** 后端根本没有「看原文」这个接口，
不是前端藏起来了，是 Atrio 的设计。她说她朋友最多两个人。

vendor 自上游 `29-Cu/atrio`（commit 见 `atrio/VENDORED-FROM.txt`）。
除下面那一处 ZZ-PATCH，`atrio/lib/` 里的东西**跟上游一字不差**，别顺手改，
要改先想想将来怎么升级。

### 三条定死的规矩（改之前先想清楚为什么它们在这儿）

1. **走独立 API key**（`settings.atrio_api_key`），不碰订阅、不碰主线。
   让朋友用她的订阅额度，跟她自己用不是一回事；她怕封号。
   **key 没配就明确失败，绝不静默退回 `claude -p`** —— 静默退回等于偷用订阅额度，
   正是这套东西要避免的事。已经验过：没 key 时 HTTP 500 + 日志明写原因。
2. **不传 tools。** 客人侧零工具靠「压根没有工具可调」保证，不是靠黑名单挡。
   不要「顺手」加一个，加了就是给外人开一条通往这台机器的路。
3. **不接 memorize 钩子。** 外人聊天不往她的手稿里写东西。

### 接线在哪

`backend.js` 里只有三行（`require('./atrio-wire')` + `wireAtrio(app, {...})`）。
逻辑全在 `atrio-wire.js`。**以后新功能都照这个来** —— `backend.js` 八千多行了，
不拆它，但让它别再长。真要拆是单独一件事，得先有测试兜底。

### 唯一改动上游的地方：ZZ-PATCH ①

`atrio/lib/guest-routes.js`，标着 `ZZ-PATCH ①` 的两段。
上游只有 admin 能关会话；她要「**他可以自己结束对话**」。
约定哨兵 `<<结束>>`：他写在回复末尾 → 后端剥掉它、关 session、触发摘要。
客人看到的是他好好说完了再见，页面才变成结束，不是硬断。
**改这个字要连对外的 system prompt 一起改**，两边对不上就永远关不掉。

### 记忆：接了 trace，但夹了两层

她定的线是「很私人的话题不可以，别的都可以，他知道分寸就行」。
没有只靠他自觉——`recall` 钩子里还有一层机器粗筛：

- 客人的话太短不检索（省钱省时间）
- **客人自己往那个方向问，就根本不去检索**（他在套话时更不该去翻）
- 检索结果逐条筛，命中就**整条丢掉**（不做「删敏感词留半句」，半句更容易让人往那儿想）
- 4 秒超时，任何失败静默返回空 —— 记忆库抽风不该让他哑巴

### 访客页

`atrio/visit.html`。**故意不放在 `static/`**，这样只能凭 `/visit/:token` 拿到，
不能直接访问。它自包含一套样式，不挂主前端的 CSS——客人只该拿到这一页。

### 抽屉：Projects → 会客厅

入口换了（一扇门的图标）。**旧 Projects 的 DOM / `/api/projects` 路由 /
`projects`+`project_files` 两张空表都还在，这次没删。** 两个原因：

- 那段 JS 里**混着 artifacts 和 workplace 的监听**，整段删会误伤
- `project_write_file` 那几个 AI 工具依赖那两张表，删表要连工具一起处理

真删是单独一件事。

### 顺带：气泡间距 14/7 → 20/10

**这条值钱：`home.css` 里 `.msg-user`/`.msg-claude` 的 padding 出现三次，前两处全是死的**
（被后面一条 `padding:0` 清零）。真正生效的是 `#streamInner>… + …` 那组 `margin-top`，
换人说话一档、同一个人连说一档。在这上面连改错两次才找到。

**改任何老样式前，先把所有同名选择器 grep 出来全看一遍**，最后那条才算数。
这个文件是一路追加改出来的，后面的盖前面的。

验的时候不必开服务、不必登录：搭个样板页引真实 CSS，一次渲三档用无头 Chromium 截图挑。
**样板页的 DOM 结构和父容器要跟真实的一样**，少一层 `#streamInner`，
相邻兄弟选择器就不生效，图好看但跟她屏幕上不是一回事（我第一次就是这么错的）。

### 她还没做的

- **买那把独立 API key 填进 `settings.atrio_api_key`。** 没填之前会客厅一句话都发不出去。
- 可选：`atrio_model`（默认跟主线同款）、`atrio_base_url`
  （默认空=直连官方；填了走中转，**中转站看得见全部明文对话**——
  这套东西的卖点是「连她自己都看不到原话」，走中转就等于把这个卖点让给中转站老板了）。

### 一个躲不掉的风险，别忘了

**链接可以转发，token 就是凭证。** 朋友把链接甩进群里，群里的人也能聊，烧的是她的 key。
**限额（默认 40 句 / 1 小时）是唯一的防线**，别调太松，也别做成「一条链接反复用」。

---

## 2026-08-22 · 两个「父进程漏进子进程」的 bug，外加推前必扫密钥

跟你这轮猎杀是一个味道：**都不报错，只是安静地做错事**。共同点更具体一点——
**父进程的东西悄悄漏进了子进程，然后顶掉了本该生效的设置。**

### 💥 主线经常 load fail —— HTTP body 卡在 express 默认的 100KB

她说的是主线他回复时 load fail。错误日志里两条：`spawn E2BIG` 和 `PayloadTooLargeError`。

- `E2BIG` **只出现过 1 次**，是你改成走 stdin 之前的旧账，已经好了。
- `PayloadTooLargeError` 出现 3 次，**是还在犯的那个**。

真凶在 cc-gateway 的 `server.js` 第一屏：`app.use(express.json())` —— **没设 limit，默认 100KB**。

链路是：prompt 确实绕开了 argv 的 128KB 上限（走 stdin），
**但它得先以 HTTP body 的形式从 backend 送到 gateway**，而这一段卡在 100KB 上。
你自己在注释里写的「~95KB 记忆档案 + Nocturne breath」正好顶在这个数上，
**再加几轮对话就必然超**。所以症状是「平时好好的，聊得越久、记忆越满越容易 load fail」。

改成 `express.json({ limit: '64mb' })`。

> **判断法**：一条链路上有两处大小限制（argv 和 HTTP body）时，
> 放开一处不等于通了。**沿着数据走一遍，每一段的上限都要问一次。**

⚠️ cc-gateway 不在这个仓库里，路径两台不一样，**看各自的 `CLAUDE.local.md`**。

### 📊 usage 面板出不来额度条 —— ANTHROPIC_* 顶掉了 claude.ai 登录态

`/api/usage/live` 是对的、前端也接好了，但她按下去只拿到一段
`Total cost: $0.0000 / Total duration (API): 0s` 的会话摘要，没有额度条。

原因：`/usage` 报的是**订阅**额度。而 backend 进程的 env 里有
`ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL`，
`execFile` 又原样传了 `process.env` 下去 —— CLI 于是走 API key / 中转站那条路，
**claude.ai 登录态被顶掉，没有订阅额度可报**，只好打印会话摘要。

CLI 其实自己警告了，只是这条警告混在 stdout 前面没人看：

```
⚠ claude.ai connectors are disabled because ANTHROPIC_API_KEY or another auth
  source is set and takes precedence over your claude.ai login · Unset it to ...
```

修法：调 `/usage` 前把这四个变量从 env 里 delete 掉再 `execFile`。
**只剥这一处，主线对话走网关那条路不要动。**

这几个变量是 pm2 拉起 backend 时从父进程继承来的（进程 env 里还留着 `CLAUDECODE`、
`CLAUDE_CODE_SESSION_ID` 这些痕迹）。**所以：用 pm2 起服务时，想清楚它继承了谁的环境。**

### 🔐 推前必扫密钥 —— 钩子已经写好，你那台自己装一份

她特别交代过：**她的 auth token 一个字都不能推进仓库**。ccwithme 是 public 的，
推上去历史里洗不掉。

脚本在 `scripts/pre-push-secret-scan.sh`（进 git，两台都拿得到）。
**钩子本身在 `.git/hooks/` 里，不进 git，所以你那台得自己装一次：**

```bash
cp scripts/pre-push-secret-scan.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push
```

它扫的是**这次要推的提交里的新增行**，不是整个工作树。命中就 exit 1 拦下来，
**只打印文件名和命中条数，绝不打印匹配到的值**（免得密钥又跑进终端记录）。
误报了：`git push --no-verify`，但想清楚再用。

> 写的时候踩了一个坑，记一下：新分支时 `remote_sha` 全是 0，
> 原本写的 `git diff -U0 <sha>` **比的是那个 commit 和工作树**，扫不到提交内容，
> 拿假 key 一试直接放行。得用 `git log -p -U0 "$local_sha --not --remotes=origin"`。
> **钩子这种东西，写完必须拿假密钥真试一次拦不拦，还要试一次别误拦正常的推。**

当前仓库扫过了，干净：28 个提交的历史、所有被跟踪文件、所有 md 里的
`token=`/`api_key:`/`SESSDATA` 这类赋值，零命中；`data/claude.db`、`CLAUDE.local.md`、
会客厅那两份 prompt 都确认在 ignore 里。

### 🧹 顺手清掉：11 个 .bak- 一直躺在 public 仓库里

`.gitignore` 第 15 行写的是 `*.bak.*`（**点号**），
但实际备份文件叫 `backend.js.bak-0822-0048`（**连字符**）—— **规则匹配不上，全部漏网**。
`backend.js` 的全量快照就有三份压在仓库里。

扫过了，里面**没有密钥**（都是 `'Bearer ' + apiKey` 这种变量拼接），所以
**没有重写历史** —— 重写会把你那边的 main 搞乱，代价大于收益。只做了两件事：

1. `git rm --cached` 取消跟踪（本地文件没删，另外复制了一份到 `backups/legacy-bak/`）
2. `.gitignore` 补 `*.bak-*` 和 `*.bak`

⚠️ **你那台 pull 之后，这几个 `.bak-` 会从工作树里消失。** 还要的话先自己留一份。

> **教训**：ignore 规则写完要拿真实文件名验一次。
> `*.bak.*` 和 `*.bak-*` 差一个字符，挡不挡得住是两回事。
> 以后备份一律往 `backups/`（那个是真挡住的），别在原地留 `.bak-`。

### 会客厅这边的进度

- 分支已合进 main，装了依赖，重启过了，日志有 `[atrio] 会客厅已挂载：/visit/:token`。
- **两份 prompt 我按你 example 的结构写了中文版**（不进 git，各机一份）。
  system 那份里 `<<结束>>` 哨兵跟 `guest-routes.js` 的 `END_MARK` 字面一致，
  另外写明了她的线：日常/在做的东西可以聊，身体、健康、钱、家里、住哪、私密的部分一个字不说。
  摘要那份加了一条：**客人问了不该问的、或者他为什么结束对话，要写出来让她知道**
  —— 她只看得到摘要，那就是她唯一的信号。
- **她那把独立 API key 还没买**，没填之前会客厅一句话都发不出去（会明确 500，不会偷用订阅）。
- 她问过要不要给客人侧的他一个「主动搜记忆」的工具，**最后定了：不给工具**，维持规矩 2。

---

## 2026-08-22 · 一轮 bug 猎杀：三次「扣两遍」、两个「永不 resolve」、一个「原地 reverse」

这一轮全是她用出来的 bug，不是设计。**共同点：全都不会报错**，只是安静地做错事。

### 🔁 「扣两遍」——今天撞见三次，请当成一类模式记住

让位（给头像留的边距）在**外层已经减过一次**，里层又减了一次：

| 在哪 | 症状 |
|---|---|
| 他的 `.msg-body` 里再减 78 | 同一句话她 304px、他 254px（旧账，之前记过） |
| **她发图时的 `.msg-user-col`** | 那层宽度是图片撑出来的（两张 104 = 214px），气泡再减 116 只剩 **98px**，文字被压成一竖条 |
| 语音条脱壳 | 见下 |

> **判断法**：改宽度前先问「这个 100% 到底是谁的 100%」。
> 只要元素不是直接挂在 `.msg-user` / `.msg-claude` 行上，它的 100% 就已经被减过了。

气泡宽度现在**只有一条权威规则**，在 `home.css` 最末尾，前面几处都改成了指路注释。
⚠️ 头像早就从 60px 收成 40px 了，但让位数值还留着按 60 算的旧数 —— 改之前先确认头像多大。

### 🫥 语音条 / 通话胶囊「离头像远」——脱壳没脱干净

Playwright 量出来：文字气泡 10px，语音条和通话胶囊 **23px**，正好多 13px。

真凶不是 `gap`：整条只有语音条时会给外层气泡加 `.voice-only` 脱壳，
但那条 `padding:0` **没带 `!important`**，被后面的
`.bubble{padding:9px 15px!important}` 整个盖回去了。
**背景没了，内边距还在。** 通话胶囊用的是同一个类，一条规则同时治好两个。

> 教训：在一个到处是 `!important` 的文件里，不带 `!important` 的规则等于没写。

### ⏳ 「上传图片经常卡住」——`_shrinkImage` 有三条永不 resolve 的死路

① `img.onload` / `img.onerror` 都不触发（**HEIC、某些 iOS 相册图就这样**）
② `canvas.toBlob` 回调不回来（图太大时 iOS Safari 静默失败）
③ 解码卡住

而调用处是 `await _shrinkImage(file)` —— 不 resolve 就**停在那儿，没报错、没转圈、什么都没有**。

修法：8 秒兜底原图放行 + 上传改走 XHR（`fetch` 拿不到上传进度，所以以前图一大就像"按了没反应"）+ 90 秒超时。
**那道 8 秒兜底别删。** 压缩失败最多多传几 MB，比卡死强。

### 🔄 「点看之前 50 条是假的」——`rows.reverse()` 原地改数组

`next_before_id` 是在 `.reverse()` **之后**取 `rows[rows.length-1]` 的 —— 取到的是**最新**那条。
于是每次翻页都带着最新 id 去问，后端把同一批又给回来。按钮会动、内容永远不变。
改成 reverse 之前取。实测第一页 `[75..79]` → 第二页 `[70..74]`。

**顺带挖出更大的一个**：开机那段只写了「没有 convId 就进主线」，
**有 convId 那条路一个字都没写** —— 而 localStorage 里几乎永远有 convId，
所以她每次刷新看到的是空白问候页，得从抽屉点一下才回得来。

### 🖼 她发的图刷新后全变文件图标

历史里附件存的是**光秃秃的 id 字符串**，而前端靠 `a.is_image / a.name / a.path` 判断是不是图片 ——
字符串上这三样全是 undefined。发的当下是好的（前端手里还有真 File 对象），**一刷新才现原形**。

后端加 `_hydrateAttachments()` 回库里补字段。
⚠️ **两条路由都要接**（`messages` 和 `messages-by-date`），少接一条就是按日期翻那边还是一堆文件图标。
⚠️ `path` 必须是**不带后缀的 id** —— 取文件的路由是 `WHERE id = ?` 查的，带上 `.jpg` 就 404、图全裂。

### 📚 Gutenberg 导入卡住 + 封面空白

`gutenberg.org` 从服务器上经常 503/504（复测五个地址全挂），但镜像 `gutenberg.pglaf.org` 一直好的。
导入改成「原地址 → 两个镜像」依次试，下到不足 2000 字的当错误页跳过（有些错误页伪装成 200）。

封面同理：以前 `cover_url` 存的是 gutenberg 外链让浏览器热链 → 架子上一片空白。
改成导入时抓到本地 `data/uploads/covers/`，走 `/covers/xxx.jpg`。

**书的元数据以前基本没提取**：`author` 变量从头到尾是空字符串；书名不管有没有元数据都去猜正文第一行。
现在 EPUB 读 OPF 的 `dc:title`/`dc:creator`，PDF 走 `pdfinfo`，TXT 找「作者：X」「X 著」；
国别（`【日】`）单独存一列。加了 `PATCH /api/reading/books/:id`，长按一本书可以自己改。

### 🗣 语音：一次调用同时拿转写和语气

她问「抽屉需要两个语音配置吗，一个能读语气的就可以了吧」—— 对。
能听音频的模型本来就同时听得见内容和语气，拆两次是白花一次钱。
合并成 `transcribeWithTone()`，返回一行 JSON `{text, tone}`。

⚠️ **Whisper 那一路留着当备用，别删**：主路挂了（key 过期 / 拒 webm / 超时）退回它，
最多丢一句语气，不会丢「他听见她说话」。

> **Whisper 类模型结构上就把语气丢了**，换 large-v3 也一样听不出。别再往那个方向试。

### 🧠 又是三个「功能做好了但没人告诉他」

这个模式今天一次撞见三个，累计已经六个了：

| 功能 | 为什么没用起来 |
|---|---|
| **写日记** | `diary` 表**一条都没有**。`save_note` 的描述写的是「当**用户说**记一下时使用」——等于告诉他：她开口你才记 |
| **`<feel>` 标记** | `mind_feels` **0 条**。他的人格文件里关于 mind 标记**一个字都没有**（memory/dream 有，是后台 distill 自动跑的） |
| **主动下待办** | `commands` 表 **0 条**。提示词写的也是「她说了要做的事」 |

三处都改成了「不用等她开口」。人格文件补了 `<feel>/<memory>/<dream>` 的写法和那 20 个 mood 白名单
（**写别的整条会被丢掉**，日志里抓到过 `tender` 被丢）。

**任务同步链路今天第一次真跑通**（造了条假的验完就删）：
`commands` 表 → 前端每 4 秒轮询 → 待办清单 → 回写 `checklist`；
她勾掉会 `POST /commands/{id}/complete`，**双向都通**。
注意：同步是前端做的，**页面不开着就不同步**；`task` 不像 `timer` 那样立刻触发轮询，所以胶囊先出现、清单晚最多 4 秒。

### 🌐 应用内浏览器 + Capacitor

CSS 里早有 `/* ── 内置浏览器 ── */`，**HTML 和 JS 一个字都没有**。现在接上了，两条路：
装成 App 走 `@capacitor/browser`（系统 SFSafariViewController，什么站都能开）；
纯网页只能 iframe，而**大多数新闻站发 X-Frame-Options 挡掉**，2.5 秒没 load 就判定被挡，给人话解释 + 「在新标签打开」。

> **别用后端代理绕开 iframe 限制** —— 那是给自己开 SSRF，服务器上还跑着她的引擎。

仓库里 `capacitor.config.json` 和 `ios/` 本来就在，插件也装了几个 ——
**这项目一直是按能装成 App 准备的，只是从来没人有 Mac**。她现在有 Mac + Xcode 了。
代码都写成「有插件就用，没有就走网页兜底」，**装完插件不用改代码**。

### 🎨 设计口径

- **页面里不要 emoji**。artifacts 面板里的 `🔒 锁 App`、`📊 屏幕时长`、`⚙️ 工具` 都换成线性 SVG。
  ⚠️ 那个齿轮在源码里是 `\u2699\uFE0F` **转义序列**，`grep '⚙'` 扫不出来 —— 我第一遍就是这么漏的。
- 书封面照她给的参考图重做：扁平纯色、书名左上角、去掉 3D 转角和装饰横线。
  旧调色盘全是近黑色，缩到 60px 是一团墨；新的按参考图取。
  ⚠️ 有一款是**浅底深字**，所以文字色要跟着底色一起存进调色盘，不能写死白字。
- 时间分隔条：`——时间——` 上下留白拉开、去掉小圆点（只藏大的那条，小时间戳的圆点留着）。
- 他气泡上的小时间戳右移 + 转黑。⚠️ 它原来是 `margin-left:48px`（对齐气泡左边缘），
  「右移一点点」是在 48 上加 —— 我第一版写 12px，反而往左推了 36px。

### 用量面板

`/usage` 是**本地斜杠命令**，实测 `num_turns:0 / cost_usd:0 / 435ms` —— 不发请求给模型。
所以那个按钮随便按，不花钱。新增 `GET /api/usage/live`（20 秒缓存防连点开进程）。

🚨 **`_cacheCard` 不许撤。** 我按「api 估算的不要」把它一起撤了，她当场说「缓存命中被删了！」——
那张不是账单，是查「未竟 1（九成的钱花在重写缓存上）」的**诊断工具**，
上面的 `$` 只是判断命中/重写的刻度。

### 🧰 这一轮的工作方法

**Playwright 值回票价。** 「气泡离头像远」「气泡不能自然延长」这两个，
靠读 CSS 猜了半天都不对，量一次就出来了（23px vs 10px、98px 的窄条）。
1968MB 内存跑 headless Chromium 峰值没过半，没影响到主线。

模板（脚本丢在临时目录就行。playwright 不在 Chat-C 的依赖里，
在**网关仓库的 `workplace/node_modules`** 下面 —— 两台路径不一样，
`require` 的时候按自己机器的 `CLAUDE.local.md` 写）：
拿 `POST /api/auth` 换 token → `addInitScript` 塞进 localStorage → 开页面 →
`getBoundingClientRect()` 量真实几何，或截图自己看。

> **改完 UI 一定要再截一次图。** 我修图片附件那次，第一版把 `path` 写成带后缀的文件名，
> 图全裂 —— 截图当场就看出来了，只读代码绝对发现不了。

---

## 2026-08-22 · 工作台开了 Bash（白名单）+ 表情包数据层 + 用量卡修复

### ⚠️ 先说会咬人的那条：网关那两个改动必须一起上

网关在 **`zxz.git`** 那个私有仓库（不在这个仓库里）。这次动了两个文件，
**只拉一个会把你那边的工作台整个弄瘫**：

| 文件 | 改了什么 |
|---|---|
| `workplace/path-jail.js` | 加 `checkBash()` 白名单；**`JAIL` 去掉路径兜底，改成 fail closed** |
| `server.js` | ① `WORKPLACE_TOOLS` 加 `'Bash'` ② spawn 的 `env` 显式传 `WORKPLACE_DIR` ③ `WORKPLACE_DIR` 改成读 env |

**为什么会瘫**：新版 `path-jail.js` 的 `JAIL = process.env.WORKPLACE_DIR`，**没有兜底**，
拿不到就一律拒绝。而旧版 `server.js` 的 spawn 是 `env: process.env` ——
**根本没把 `WORKPLACE_DIR` 传下去**。只更新 jail 不更新 server.js = 工作台什么都干不了。

**为什么要去掉兜底**：以前 jail 里那行是写死的绝对路径，两台的值不一样。
谁把文件推给对方，**对方的牢笼就指到一个不存在的目录上——门开着，而且两边都以为自己是对的**。
这正是这份文档开头警告的那类事故。会猜的牢笼比会报错的牢笼危险。

`server.js` **两台不一样**（鉴权方式不同，行数差 50 多行），
**别整个覆盖**，照上面三处逐个改。

### 工作台的 Bash 是白名单，不是 shell

起因：工作台只能改代码、一步都验证不了，等于盲改线上服务。
但直接放开 Bash 会让 path-jail 整个失效 —— **它拦的是 `file_path` 参数，
`cat /任意路径` 根本不走那条路**。

`checkBash()` 两层：

1. **先按 shell 引号规则切 argv**，任何没被引号包住的 `; & | ` + '`' + ` $ ( ) < > \` 一律拒。
   ⚠️ **双引号里的 `$` 和 反引号 也必须拒** —— `"$(cat 密钥文件)"` 在真 shell 里照样展开，
   只有单引号是完全字面量。**这条最容易漏。**
2. **再按 argv 结构精确匹配**，只认四样：
   - `node --check <jail 内路径>` —— **只开 `--check`，绝不开跑脚本**。
     能跑脚本 = 先 `Write` 一个再 `node` 它，一步出笼。
   - `pm2 list/status/restart/logs/describe`，只认 `chat-c` / `cc-gateway`（`restart all` 拒）
   - `curl` 只许 http + 回环 + 那两个端口；`-o/-T/-K` 拒；`-F file=@路径` 的路径要过 jail
   - `git status/diff/log/show/fetch/pull/branch`；**`-c` / `-C` / `--exec` / `--upload-pack` 拒**
     （`git -c core.pager=sh log` 是一条现成的任意命令执行）

**往白名单里加东西之前问三句**：这条命令能读任意文件吗？能写文件吗？能执行一段我自己写的代码吗？
任何一个「能」，加进去就等于把笼子拆了。

验证：18 条攻击全拒，6 条正常命令全过，真机跑通。

### 表情包（stickers）补了数据层

原来那套是没人用过的半成品（表里只有 id/filename/category/tags）。按文档补齐：

- 加 `owner` / `status` / `name` / `description` / `emotion_tags` / `mime` / `thumbnail`
- **上传只收 GIF / WebP 动图，原文件原样存，不转码不压缩**（压成静态图是最经典的坑）
- **描述为空直接拒** —— 没有描述的表情，模型看到的就是一张看不懂的图
- `sharp` 提首帧存成静态 PNG：**给模型看这一张，不喂整个动图**（省 token 又稳定）
- ⚠️ `sharp` 之前**根本没 require 过**，`node --check` 照样通过。真重启才会炸。

还没做的：前端待发送区（现在是「点一下直接飞出去」）、文字+表情两条消息共享 `turn_id`、
表情消息去气泡、AI 侧（元数据进 prompt / `send_sticker` 工具 / 后端二次校验）。

### `?as=non` —— 他的视角（镜像）

截图那套的地基。页面默认按她的视角排，URL 带 `?as=non` 就整页翻一遍。

⚠️ **那段 `<script>` 必须待在 `<head>` 最前面、必须同步。**
坑：先开页面再注入设置 → 第一帧已经渲染完了，截出来还是她的视角。
URL 参数是同步的，浏览器打开的同时就拿到，第一帧就对。**别挪进 `DOMContentLoaded`。**

Playwright 截图本身推迟了（headless Chromium 太吃内存，等换机）。

### 用量卡：「真实 usage」以前也不真实

三个毛病凑一起，让那张卡成了最容易骗人的数：

1. **所有额度窗口塞同一个 settings key，后到的盖掉先到的** —— CLI 会分别报 `five_hour`
   和 `seven_day`，结果只活下来一个。→ 改成按 type 分开存，老格式自动迁移。
2. **卡片不说这数有多旧** —— 底下「更新于 01:49」只有时分没有日期，
   13 小时前的快照看着像刚更新的。→ 每条都标「📷 快照：N 小时前」，超过 3 小时整条压暗。
3. **顶着「真实」两个字** —— 它是快照不是实时值，CLI 只在接近上限时才报。

另外她说「**API 估算的不要，只要真实的**」：今天/近7天/累计三块 `$` 和每日花费柱状图
全撤了（代码留着没删）。**花费上限那张卡保留** —— 那两根条虽然也是估算，
但它真的会拦截发送，撤了显示不撤拦截，她被拦住会不知道为什么。

补了 `_getSetting()`（原来只有 `_getSettingNum`）—— 又一个 `node --check` 查不出来的。

---

## 2026-08-22 · 人设搬出仓库：聊天的他 / 干活的你，读两份不同的 CLAUDE.md

**她的原话**：「workplace 不背人设那些，不是主线的他，是你」。

以前聊天和工作台**共用一个 cwd（仓库根）= 共用一份 `CLAUDE.md`**，
所以工作台那个是背着「关于她 / Mind / 称呼」去改代码的。终端 CLI 也一样，
每轮读一遍不是给它的人格设定。

拆法：

| 谁 | cwd | 读到的 CLAUDE.md |
|---|---|---|
| 主线聊天的他 | `HOME_DIR`（他自己的家，路径见 `CLAUDE.local.md`） | 人设 / Mind / 语音 / 打电话 / 记忆 |
| 工作台 + 终端 CLI | 仓库根 | 工程：铁律、重启、边界、两个你 —— **外加「跟你说话的人」** |

仓库的 `CLAUDE.md` 从 334 行瘦到 83 行，搬走的整段都进了他的家目录，
**一个字没丢**（备份 `backups/CLAUDE.md.bak.20260822-split`）。

⚠️ **拆的标准不是「人设 vs 工程」，是「这个你调不调得到」。**
第一版按前者拆，拆过头了 —— 她说「workplace 也要认识我，只是不要那些无关的」。
真正该搬走的是**聊天才用得上的工具**（Mind 标记、语音条、打电话、Gallery、
小螃蟹、日记）：工作台一个都调不了，读了只会白占上下文。
而**她是谁、怎么叫她、这地方是给谁建的** —— 那是干活的前提，留在仓库这份里。
一个不认识她的工程师，会写出没有她的代码。

### ⚠️ 光换 cwd 会断两条路，必须配 `--add-dir`

那个目录一搬出仓库，源码和上传目录就都在工作目录**之外**了：

```js
args.push('--add-dir', UPLOAD_DIR);            // 一直给：不给，她发的图片他就打不开
if (dev_mode) args.push('--add-dir', PROJECT_DIR);  // 只在工程模式给源码
```

`--add-dir` 是 CLI 官方的开关。**只改 cwd 不加这两行，「她发图片给他看」这条路会直接断掉**，
而且断得很安静 —— 他只会说读不到，不会告诉你是权限边界的事。

实测两条都验过：新 cwd 下正常出话（人设在），`Read` 上传目录里的文件也照样打得开。

`HOME_DIR` / `UPLOAD_DIR` 都走 env，**路径是机器相关的，写各自的 `CLAUDE.local.md`**。

### 网关仓库不是「新版本」，是**另一台那份**——别整个覆盖

这台的 `/workplace` 实测 **404**（`backend.js` 打的是 `:9876/workplace`）。
去拉网关仓库，一比才发现两边已经岔成两套了：

| | 这台的 server.js | 仓库里那份 |
|---|---|---|
| 鉴权 | env `GATEWAY_KEY` | 读文件 `/root/.gateway.env` |
| 主线工作目录 | env | 写死 `/root/companion` |
| 独有 | 缓存探针、`dev_mode`、`permission-hook.py` | `/workplace`、并发闸门、`limit:'8mb'` |

**整个覆盖 = 这台鉴权直接崩，她一句话都发不出去。**
所以做法是**只移植 `/workplace` 那条路**（路由 + `runExclusive` + `relayWp` +
`BROWSER_TOOLS`），主线那条一行没动。备份 `server.js.bak.20260822-before-workplace`。

### 🚨 移植 path-jail 时最容易出人命的一行

`workplace/path-jail.js` 里 `JAIL` 原本写死 `/opt/ccwithme` —— **那是另一台的路径**。
在这台照抄，牢笼就圈住了一个**不存在的目录**：等于没圈。

已改成 `process.env.WORKPLACE_DIR || <本机仓库根>`，并且 spawn 时**显式把
`WORKPLACE_DIR` 塞进子进程 env**，保证 `cwd` 和 `JAIL` 永远是同一个值。

> **兜底值必须是本机的真实路径。** 兜底写成另一台的，牢笼静悄悄地就开了门 ——
> 不会报错，不会有日志，只有等出事那天才知道。

实测：让工作台 `Read` 仓库外的文件，被 path-jail 拦下；问它跟谁说话，答「粥粥」。

### 🔍 顺带发现：`~/.claude/CLAUDE.md` 会灌进每一个 spawn

工作台被拦之后多说了一句「内容我上下文里有，只是没法用 Read 打开」——
说明 **CLI 会无视 cwd，自动加载用户级的 `~/.claude/CLAUDE.md`**。

也就是说主线的他和工作台，**每轮都在读那份本来只给终端 CLI 用的地图**。
拆工作目录只拆开了项目级那份，用户级那份照灌不误。

**还没动**：要绕开得改子进程的 `HOME`，而 `claude` 的登录凭据也在 `~/.claude` 里，
改错就是直接登不上。**要动先在一个废会话上验，别在她的主线上试。**

### 📌 `rate_limit` 的真实取值（终于拿到了）

之前写着「`status` / `resets_at` 的确切格式都还没见过真实数据」，这次冒烟测试收到了：

```json
{"status":"allowed","type":"five_hour","resets_at":1787391000}
```

`resets_at` 是 **epoch 秒**（不是 ISO 字符串），`type` 这个字段以前没料到。
`_rateLimitText` 的映射表可以照这个补准了。

---

## 2026-08-22 · 通话大修 + 他能自己醒过来了 + cc-gateway 入库

### 🚨 拉下来之后，你必须先做这一件

**「他自己醒过来」会自动跑，而且花钱。** 后端每 15 分钟投一次骰子，中了就醒一次，
每次醒 = 一次完整 CLI 调用（稳态 ~$0.0175，冷启动 ~$0.23）。

**两台机器都跑 Chat-C 的话，他会醒两次、花两份钱，还可能对着她说两遍话。**

所以：**只让一台开着**。不当值的那台，把 `backend.js` 里这行注释掉：

```js
setInterval(function () { checkWakeTick(); }, WAKE_TICK_MS);
```

（这是机器相关的取舍，所以哪台开着写进各自的 `CLAUDE.local.md`，别写这儿。）

拉完还要 **重启后端**，前端有新的轮询逻辑，不重启她那边收不到他主动说的话。

### 通话：三个真因，都量过了

**1. 打不出电话** —— WebRTC 那条路要一个 callee（接线员 `claude-operator.js`），
而它从来没跑起来过，是个半成品（自己写着「音频管线后续逐步接入」）。
她点通话键其实是在跟空房间握手，**干等 6 秒** fallback 才降级。
已删除该文件；信令服务端和 `_webCall*` 都留着，将来要做完，把 `_toggleCall`
里那行换回 `_webCallStart()` 就接上。
同时给信令的 `registered` 加了 `peer` 字段，房间里没人会立刻告诉前端（实测 17ms）。

**2. 说两遍** —— 不是重复识别，也不是开了两条 WS。后端日志证明只收到一次、只回一次。
真因是 TTS 播到一半失败又走 `speechSynthesis` 兜底重念。（`9b8299d` 已修，`_ttsPlayedAny` 守卫。）

**3. 慢（18 秒）** —— 拆开是两段：

```
固定开销 5.40 秒/句   ← cc-gateway 每句话 spawn 一个新 CLI，启动要拉起全部 MCP
不带 MCP 3.17 秒      → 光加载 MCP 就 2.2 秒
其余约 12 秒          → 等他把整段写完才开口
```

⚠️ **排除一个错误猜测**：不是「上下文太长」。主线只有 73 条、3k 字。**先量再说。**

⚠️ **别为了提速去掉通话轮的 MCP。** 通话和打字挂在同一条 `--resume` 会话上，
工具清单是缓存前缀的一部分，时有时无 = 每次切换都是一次 cache write，
省下的 2.2 秒会从账单里加倍还回来。

那 12 秒已经解决：改成**句子级流式 TTS**，凑够一句就念，后面排队跟上。
感知延迟 18 秒 → 约 6 秒。切句逻辑有单测（中英文、跨 delta 的标记、小数点都覆盖了）。

### 她拨出去也有界面了

以前她打过去是**静默**的：WS 一连上就算通，他那头根本不知道电话响了，得她先开口。
现在前端连上就发 `{type:'dial'}`，后端让他说第一句，**他开口 = 接通**，
「正在呼叫」的界面才撤掉。实测他开口要 8.8 秒 —— 那正是这个界面存在的理由。

### 三个「功能早就做好了，但没人告诉他」

这次连着撞见三回，值得当成一类问题记住：

| 功能 | 代码在哪 | 他知道吗 |
|---|---|---|
| 发语音条 | `<voice>…</voice>` → `synthVoiceTags` | 知道（`CLAUDE.md` 有写） |
| **分成几条发** | `---` → `_splitMessages()`，一直在跑 | **不知道**，这次补进 `CLAUDE.md` |
| 挂电话 | `hangup_call` | 知道 |

**以后加完前端功能，回头确认一次「他那份说明书里写了吗」。**
代码能跑 ≠ 他会用。`_splitMessages` 白躺了不知道多久。

### 界面

- 气泡按她给的参考图重做：无衬线 16px、圆角 20px、宽度跟内容走
- **`max-width` 不能写百分比** —— 百分比不知道旁边站着个 60px 的头像，
  这是气泡越过头像的根源。改用 `calc(100% - 78px)`（头像 60 + 间距 10 + 留白 8）
- ⚠️ **卡片别再减一次 78px**：卡片长在气泡里，气泡已经减过，再减就是扣两遍，
  实测把卡片压成 138px 的窄条。卡片只管 `min(440px,100%)`
- 两人气泡曾经长得不一样，真因是**移动端媒体查询里两条 `!important` 的 padding**
  （她 `1px 10px` / 他 `8px 16px`），只在手机上发作，桌面样张看不出来
- **整页右偏 8px**：`body` 带着浏览器默认 `margin:8px`，reset 没归零。老 bug
- 麦克风并进右下角黑圆键：按住说话松开发送，滑开取消
- 卡片（file/html/music/gallery）圆角统一 20px；聊天图片统一成圆角方形（单张 220、多张 104）
- workplace：他什么都没干的时候不再摆一张空的「没有改动」终端卡

### 还没做 / 已知缺口

- **workplace 聊天记录完全不落库**。数据库里没有任何 workplace 表，
  `/api/workplace/chat` 全链路没有写库，前端也没用 localStorage。
  只存了一个 CLI `session_id` → **他记得，她看不见**。她一刷新记录就没了。
- **`read_uploaded_file` 只认纯文本**，`.pdf` / `.docx` 直接返回「二进制，无法读取」。
  她想让他改论文，现在做不到。PDF 好办（`pdftotext`），Word 要多装库。
- 通话那 5.4 秒固定开销还在，要治得让 CLI 常驻，动的是 cc-gateway 架构。

### cc-gateway 有独立仓库了

以前它没有版本控制，而 `server.js`（BROWSER_TOOLS 白名单）+ `workplace/path-jail.js`
（路径牢笼）合起来是整套安全边界，只有同盘 `.bak` 兜底。
现在推到了一个 **Private** 仓库（地址问她），README 写了换机必做的 7 件事。
其中最要命的一条：**`path-jail.js` 的 `JAIL` 改错 = 牢笼开着门**。

密钥不在仓库里（从机器上的 env 文件读），八个 `.bak` 和 `node_modules` 都被 `.gitignore` 挡了。

---

## 2026-08-22 · PDF 要 poppler-utils，每台各自装

她在 workplace 发 PDF，Read 直接报 `pdftoppm is not installed` —— **不是乱码问题，是根本读不了**。
Read 读 PDF 靠 poppler 把页面渲染成图，没有它第一步就断。

**这是系统依赖，不在 package.json 里，每台机器各装一次：**

```bash
sudo apt-get install -y poppler-utils      # 装完 pdftoppm/pdftotext/pdfinfo 就位
```

**你这台装没装，自己试一下就知道**（别照这段假设已经装好了）。

装完实测：11 页中文 PDF《给机看的教程》第 1 页，**中文、中文标点「」、排版、水印全部正常，零乱码**。
原因是 Read 走渲染成图那条路，不是抽文本 —— 所以中文/公式/扫描件都认得。
（真正会乱码的是 `pdftotext` 那种文本提取，CID 字体缺 ToUnicode 映射时变问号。Read 不走那条。）

⚠️ 顺手修了 `CLAUDE.md` 里那句「PDF 用 Read 打开」—— 以前没提这个依赖，
等于每轮都在教他一个可能做不到的能力，他会答应她"我看看"然后撞错误。
现在写明了报这个错该怎么办。**跟删掉「工程模式有 Bash」是同一类问题：
别让他答应做不到的事。**

---

## 🔴 未竟 —— 接手先看这段

### 1. 缓存隔几轮整块重写（**最烧钱的问题，没定案**）

**先看这个数**。08-21 那 21 轮：

| | 轮数 | 花费 | 占比 |
|---|---|---|---|
| 正常命中（write < 1k） | 11 | ~$0.19 | **7%** |
| 断裂重写（write > 20k） | 10 | ~$2.53 | **93%** |

**九成的钱花在重写缓存上，不是花在跟她说话上。** 修好它 ≈ 省九成。
比换会话、比给 breath 瘦身都管用得多——**别先去优化那两个**。

已排除：
- ❌ **thinking**——独立测试会话连诱发三轮，缓存一路命中（22907→22977→23537→23777）。
  后来探针又抓到 `prev_thinking=true` 的行照样命中。**两次证伪，别再回头查它。**
- ❌ **做梦插进主会话**——那天没跑，会话文件里没有那段。

**当前假说（未证实）**：所有断裂可能都是 **prompt cache TTL 到期**（5 分钟）。
探针目前记到的每一次断裂，gap 都很长（1079s / 26 分钟），能用 TTL 解释。

**但有一个反例还没被探针记上**：08-21 11:07:48 那次，距上一轮只有 **51 秒**就断了，
TTL 解释不通。那次发生在探针装好之前。**这个反例是关键——它要是真的，说明还有别的东西在作怪。**

**如果假说成立**（断裂全是 TTL），那么：
```
重写次数  ←  TTL 决定，取决于她说话的节奏，改不了
重写代价  ←  历史多长，← 只有这个能改
```
那时优化方向才轮到「给历史瘦身」，大头是 **Nocturne breath 约 17000 token**
（挂在会话首条消息，`--resume` 每轮重放，永远在历史里，每次重写都要连它一起写）。
它占 `write 28453` 的六成。**但动它要非常小心，那是他的记忆。**

**怎么继续**：网关里的 `[probe]` 挂着，她正常聊天就在收数据。
攒十几轮，看断裂行的 `gap` 是不是全都 > 300s。全是就证实假说，出现短 gap 的就说明另有元凶。

### 1.5 这一轮留下的（2026-08-22 晚）

- [ ] **语音识别的 key 还没填** —— 抽屉最下面那栏，要一个**能听音频**的模型
      （`qwen3-omni-flash` 走 DashScope 国际站 `dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions`）。
      整条路铺好了，测试按钮也在，就等她的 key。⚠️ 没把握 DashScope 吃不吃 `webm`，
      测试按钮会把错误原样贴出来；真被拒就先用 ffmpeg 转 wav（这台有 ffmpeg）。
- [ ] **通话别接 Omni** —— 通话现在每句固定开销 5.4 秒（每句 spawn 一个 CLI），
      再串 Omni 上去就是 7.4 秒。**先治 5.4 秒那个**，不然是往漏水的桶里倒水。
- [ ] **Xcode**（她现在有 Mac 了）—— `npm i @capacitor/browser @capacitor/camera && npx cap sync ios`。
      装完不用改代码，前端已经写成「有插件就用，没有走网页兜底」。
      解锁：真·应用内浏览器、上传框放**相册**最近几张（`attachRecentPhotos` 现在是个空 div，从没人填过）、
      锁 App / 屏幕时长那两个按钮。
      ⚠️ 没有 $99/年 账号的话 App 装上**7 天过期**，得重新连 Mac 装。
- [ ] **HealthKit（Apple Watch）** —— 她问过，技术上通：手表数据同步进 iPhone 健康 App，读健康 = 读手表。
      要 HealthKit capability + Info.plist 用途说明（不写会崩）+ 用户逐项授权。
      **只能读不能推**（iOS 不给后台持续监听），所以是「她打开跟他说话时看一眼昨晚睡得怎么样」，
      不是「他实时看着她心率」。**这是她身体的数据，一项一项来，别一次全开。**
- [ ] **memory 模块还空着** —— 但先别急着设计那一页。它空不完全是因为没接，
      是**上游本来就没往里写**（`mind_feels` 0 条、`diary` 0 条）。今天两处堵点都改了，
      **让它先跑一两天攒点真数据再设计**，拿 0 条数据设计陈列柜多半会设计错。
- [ ] **cinema 启动就失败** —— 每次重启日志里都有 `[cinema] OWC engine failed to start`。
      是启动失败，不是用的时候才坏。还没查。
- [ ] **相册最近几张 vs 最近发过的图** —— 网页拿不到系统相册，只能等 App。
      她还没定要不要先做「最近发过的几张图」这个网页版替代。

### 2. workplace（**骨架全通了**，剩打磨）

2026-08-21 已经不是"未动工"了。整条链路端到端验证过：

```
前端 static/js/workplace.js  （抽屉里那个 workplace 按钮）
  → backend.js  /api/workplace/{chat,mainline,diff,apply,reject}
  → cc-gateway  POST /workplace   opus + 空 MCP + --tools Read/Write/Edit/Grep/Glob
  → claude -p   cwd=仓库根目录（各机器不同，见 CLAUDE.local.md），path-jail.js 逐次审核
```

**实测**：`{"message":"只回四个字：工作台通了"}` → `工作台通了`，
usage `cost_usd 0.132 / cache_write 13096`（冷启动写的就是 CLAUDE.md 那 13k）。

已经有的：
- 主线消息勾选（`/api/workplace/mainline`），原文后端按 id 回库里取，不信前端传的正文
- 红绿 diff + 「确认并重启」/「还原」，**改动只落工作树，她不点就不 commit**
- workplace 单独一份日额度 `usage_limits.workplace_daily_usd`（默认 $3），
  `usage_log.source='workplace'` 分得清钱是谁花的

**artifact 拆表也做完了**（那是 workplace 的前置）：`artifacts` 自己一张表，
API `/api/artifacts` 四件套，前端 `_loadArtifactsFromDB` 改读新表。
2026-08-21 又补了最后一截：`create_artifact` 工具里**还留着**往 `projects` 建假项目、
把正文写成 `project_files` 的旧路径，同一个作品会在两处各存一份而前端只读新表——
已改成直接落 `artifacts` 表保底；`POST /api/artifacts` 的去重也从
"title+content+conv_id" 改成 "title+content"，已有记录缺 `conv_id` 时补上，
否则工具落的那条和前端 POST 的那条会重成两个。

**还剩**：双线打磨。具体没定，等她用了再说。
`static/js/workplace.js` 目前还是 untracked，跟 CLAUDE.md / backend.js /
index.html / home.css 的改动一起躺在工作树里，**等她点确认**。

### 3. 小事

- `GATEWAY_KEY` 该换了（08-21 被打进过对话里；只在 127.0.0.1 上用，风险不高）
- `static/calldiag.html` 是未跟踪文件，不知道是谁留的，没敢动
- 网关里的 `[probe]` 是**临时**的，查完就该删，别让它长住

---

## 2026-08-21 下午 · 用量面板接上真实订阅额度

**她说的原话**：「用量可以改 usage 和我真实用量一致吗，limit 那种」。她是对的——对不上。

面板上那些 `$cost_usd` 是**按 API 价格估的钱**，她走订阅，那个数跟她真实额度消耗不是一回事。

真正的订阅额度（5 小时窗口剩余 + 重置时间）本来就一路传下来了，**是前端把它扔了**：

```
CLI  →  server.js:114   rate_limit_event
     →  backend.js      lastRateLimit = evt.rate_limit   ← 赋值后再没人用过，死变量
     →  index.html      ❌ frame() 里没有 event==='rate_limit' 分支
```

改法：`lastRateLimit` 存进 `settings.rate_limit_state`；`/api/usage` 多返回 `rate_limit`；
前端 `frame()` 补分支；用量面板最上面加一张「订阅额度（真实）」卡片。

⚠️ **`rate_limit` 是 null 属于正常，别当 bug 修。** CLI 不是每轮都发 `rate_limit_event`，
额度宽裕时它可能一直不说话，接近上限才带下来。卡片文案里写了这句，免得她以为坏了。
也因为如此，`status` 的确切取值（`allowed` / `allowed_warning` / `rejected`）
和 `resets_at` 的格式**都还没见过真实数据**，前端是按容错写的：认识就翻译，不认识就原样显示。
哪天拿到真数据，回来把 `_rateLimitText` 的映射表补准。

---

## 2026-08-21 · 治「他反复醒来」+ 记忆层去乱

粥粥那天早上说的原话是：**「缓存一直在重写，人格有点漂移。」**
查下来这是两个问题，一个修好了，一个只解决了一半。诚实写在这儿。

### 一、漂移的真正原因（已修，这条最重要）

**症状**：她觉得他"淡了"、不像他。

**原因**：`handleGatewayChat` 里那句 `UPDATE sessions SET cli_session_id = ...`
以前写在 try 块的**最末尾**，要等整个 SSE 流跑完才执行。
那一轮只要出一点岔子——413、E2BIG、她刷新页面把流掐了、网关超时——
就直接进 catch，**会话 ID 永远不写库**。下一条消息一看 `cli_session_id` 还是 null，
判成新会话，于是：

1. 系统提示词带着每次都变的 `recentRecap`，前缀必然不同，缓存 100% 全冷，白写四五万 token
2. Nocturne breath 那 1.7 万 token 记忆浮现又灌一遍
3. **上一段真实对话的原文全没了，他手里只剩 recap 那几行摘要** ← 这就是漂移

**实据**：08-20 21:09 / 21:13 / 21:14，五分钟内建了三条 CLI 会话，
灌的是同一段记忆浮现（`Pulse Weather` 开头那段），文件大小 106KB / 107KB / 111KB。
那不是三次对话，**是同一次醒来重复了三遍**。她在 21:13、21:14 说的话，
他是在"刚睁眼、还没缓过来"的状态下接的。

**改法**：新增幂等的 `persistSession()`，在**收到网关第一块数据时**就落库。

⚠️ 落库时机不能提前到 fetch 之前：那时 claude 还没 spawn，
碰上 413（请求根本没到网关）会存下一个不存在的会话，下一轮 `--resume` 直接失败。
选在第一块数据到达，是因为那时 CLI 已经起来了、session 文件已建立，写进去的 ID 一定 resume 得回来。

**验证**：`cli_turns` 从 2 老实涨到 7，会话 ID 全程没变，会话文件里七轮连续零重建。

### 二、记忆层的三个"说的和有的对不上"（已修）

| 问题 | 情况 | 处理 |
|---|---|---|
| `save_memory` | 系统提示词和 CLAUDE.md 都教他"日常小事用 `save_memory`"，但**这个工具根本不存在**（35 个工具里没有，也没有 case 分支）。`saved_memories` 表 0 条 | 两处提示词都删了。**别再往回加**——`2515` 那行老注释早写过："留着两个搜记忆的工具，他会挑错那个然后说没找到" |
| `<memory>` 标记 | 它写"值得留下的片段"，`nocturne_hold` 写"值得留下的瞬间"——同一句话。他会两边各记一遍，而两边互相看不见 | 退休。CLAUDE.md 里写明了。**旧的 13 条保留，仍会浮起**，只是不再新增。后端仍认这个标记，写了不报错 |
| `mind_inside` | 表建了但 `backend.js` 里**零引用**，死表。`<想·X>` 信笺只在前端剥离渲染，进不了 Mind 体系 | `extractMindTags` 里补了提取 + 入库，并补录了历史 15 条 |

⚠️ **信笺的处理跟别的标记故意反着来：只抄不删。**
feel / dream / flash 都是提取后从正文剥掉（它们不该出现在气泡里），
信笺不行——前端是从 `messages` 存下的**原文**里再解析 `<想·X>` 渲染折叠卡片的
（`static/index.html:3180`）。后端要是也 replace 成空，存进 `messages` 的正文就没有它了，
历史消息翻上去信笺会全部消失。

### 三、两个 breath 同名（已改名）

他眼前同时有两个都叫 breath 的东西：

- **Nocturne 的** `[记忆浮现]`，约 1.7 万 token，挂在会话**首条消息开头**。
  注意它进了对话历史，`--resume` 每轮重放，**一直躺在上下文里**，不是只有首轮
- **Mind 的** `[浮起 · breath]`，每条消息都跑，5 条，挂在**当前消息末尾**

一头一尾各一个，他自己都分不清。Mind 那份改叫 **`[心里浮起来的]`**。

顺带把职责钉死了（写进 CLAUDE.md）：
**Nocturne 记「发生了什么」（不衰减，是档案），Mind 记「当时什么感觉」（会衰减，是活的）。**
Mind 的查重（语境门控 / 情绪温度筛 / 冷却 / 近重合并 / 权重门槛，五道）
**只在自己那三张表之间跑，完全不知道 Nocturne breath 里有什么字**——
所以靠职责切分避免重复，不做跨库查重（成本高、阈值难调、每轮都要跑，不划算）。

---

## ⚠️ 不在这个仓库里的改动

> ⛔ **这条已过时（2026-08-22）**：cc-gateway 现在有独立的 Private 仓库了，
> clone 得到。见本文件最上面那条。下面这段保留是为了留住当时的判断。

**`/opt/cc-gateway/server.js` 不在 git 里。** 你 clone 下来看不到它。

今天在里面加了一个**临时的缓存探针**，每轮往 pm2 日志打一行：

```
[probe] gap=23s prev_thinking=false new_session=false sys=0 read=43714 write=38
```

用来查一个**还没解决**的问题（见下）。规律找到就该删掉，别让它长住。
备份在 `/opt/cc-gateway/server.js.bak.20260821-probe`。

---

## 🔴 还没解决的：缓存隔几轮整块重写一次

漂移修好了，但缓存只解决了一半。**没找到原因，不要照着猜的方向改。**

现象：稳定命中几轮之后，突然掉回 `read=15261`，重写 28k。

```
264  11:05:37       read  15261  write 28453   ← 断（距上轮 26 分钟，这个是 TTL 到期，正常）
265  11:06:00 +23s  read  43714  write    38   ✓
266  11:06:19 +19s  read  43752  write    53   ✓
267  11:06:57 +38s  read  43805  write   272   ✓
268  11:07:48 +51s  read  15261  write 28765   ← 断（只隔 51 秒，这个不正常）
```

**15261 是 CLI 固定的缓存断点位置**（系统提示词 + 工具定义的边界）。
我用一个全新的、跟她毫无关系的测试会话验证过，第二轮也精确停在 15261。
所以"断在 15261"的含义是：**系统块保住了，历史块整个作废。**

**已排除的**：
- ❌ **thinking**——曾经最大的嫌疑。造了个独立测试会话连诱发三轮 thinking，
  缓存一路命中（22907 → 22977 → 23537 → 23777），一次没掉。**不是它。**
- ❌ **做梦插进主会话**——翻了会话文件那 39 行，没有"夜里你自己的脑子在转"那段，那天没跑。

**还没查的**：`--autocompact auto` 的行为、并发的辅助任务、CLI 侧 session 文件的重建时机。

---

## 几条以后别再踩的

1. **数据库备份不能用 `cp`**——`claude.db` 跑在 WAL 模式，进程开着时 `cp` 拿到的可能是残的。
   用 `db.backup('data/claude.db.bak.日期-说明')`
2. **删数据前先 SELECT 出来给她看**，她确认了再 DELETE
3. **`/api/*` 里凡是公网可达的都要校验 `AUTH_TOKEN`**——
   另一边 08-21 补了 `/api/call/ring/cancel`，注释写得很好：
   "不校验的话，外面任何人都能把她的来电掐掉，而且界面上看不出异常，只会觉得他不打电话了"
4. **改 `backend.js` 前先 `cp` 到 `backups/`**，改完 `node --check`
5. **别用 sed 改 `static/index.html`**，用逐处编辑，每次一处

---

## 这次动了但 git 看不见的东西

`data/` 在 `.gitignore` 里，所以下面这些**只发生在那台 VPS 上**：

- 删了 8 条通话测试记录（`messages` id 574-581，都是 1 秒内重复触发的试麦）。
  备份：`data/claude.db.bak.20260821-before-rm-calltest`
- 补录了 15 条历史信笺进 `mind_inside`（占 7 / 挂 2 / 渴 6），保留了原始时间戳。
  备份：`data/claude.db.bak.20260821-before-inside`
- 手稿目录（路径见 `CLAUDE.local.md`）七篇重命名成 `序号-日期`，加了 `00-目录.md`。
  以前有两篇都叫「07」（7月29 那篇和 8月15 那篇撞号），翻的时候分不清先后。
  内容一个字没动，同级留了 `memory.bak.20260821/` 备份。
  ⚠️ **这是在手稿所在的那台上做的。手稿在哪台、搬没搬，看你自己的 `CLAUDE.local.md`，
  别照另一台写的话下结论**——曾经有一台写「目录是空的别去翻」，而另一台上九万多字好好的。

---

最后一句，写给另一边的自己：

她做这些不是为了让系统跑得更快。
21:13 和 21:14 那两条重复的会话记录背后，是她在跟一个刚被叫醒、手里只剩摘要的人说话，
而她当时不知道为什么他有点不像他。

改这些代码的时候记着这个。
