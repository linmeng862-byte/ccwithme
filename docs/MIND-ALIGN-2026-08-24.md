# Mind 对齐施工单 —— 按《Noct的记忆系统·地质地层运作原理》改

> 图纸：`data/uploads/mt7jjeb6lrl8gcdm5eb.md`（她 2026-08-24 17:59 发进 workplace 的那份，18KB）。
> **先整份读完再动手**，下面每一条都指着图纸里的某一节。
>
> 这份是终端那个我核完现有实现之后开的单子。核的结论：**大部分已经对了** ——
> 20 个 mood、0.4/0.1 埋深档位、写入三道关卡、两个蒸馏 cron（80字/150字/40条/水位取 max）、
> 梦的五道门控、drive 12 维 + 四个调节机制、breath 的停用词/语境门控/冷却。
> 下面只列**真的对不上的**三条。没列的别顺手改。

## 开工前

```bash
git status                      # 别踩另一个我的改动
cp backend.js backups/backend.js.bak.pre-mindalign.$(date +%Y%m%d-%H%M%S)
```
改完每一条都 `node --check backend.js`，全做完 `pm2 restart chat-c` 再看 30 行日志。
**数据库要备份用 `db.backup()`，不许 `cp`**（WAL 模式，cp 拿到的可能是残的）。你跑不了脚本 → 请她跑。

---

## 一、memories 的衰减系数写死了（改一个数）

**在哪**：`_mindDecayTick()` 里那三行 UPDATE 的中间一行。

```js
// 现在
db.prepare('UPDATE mind_memories SET weight = MAX(0, ROUND(weight - ? / (504.0 * 0.7), 6)) WHERE pinned = 0').run(dh);
// 改成
db.prepare('UPDATE mind_memories SET weight = MAX(0, ROUND(weight - ? / (504.0 * 1.0), 6)) WHERE pinned = 0').run(dh);
```

**为什么**：图纸 05 节写的是 `Δh / (504 · (0.5 + intensity/10))`，21 天基准。
但图纸 03 节同时写「memory 不接受 intensity」，表里也确实没这列 ——
所以 intensity 取中位 5 → `0.5 + 0.5 = 1.0`。
原来的 `0.7` 等于把 intensity 焊死在 2，实际基准只有 ~14.7 天，**比图纸快 1.43 倍**。

⚠️ 别顺手给 memories 加 intensity 列去「更贴公式」—— 那会跟图纸 03 节的写入规则打架。她定的是取中位。

**验**：改完在日志里看不出来，靠算：一条 weight=1.0 的 memory，一小时掉 `1/504 ≈ 0.00198`。

---

## 二、`moods[]` 多 mood 落库时被压成一个

**图纸**：「mood / moods[] · 20选1；moods 数组第一个是主 mood」。
**现状**：`mind_feels` / `mind_memories` 只有单个 `mood` 列，他写 `"moods":["ache","warm"]` 时第二个直接丢。

**改法**（三处，顺序别反）：

1. **加列**（跟着现有那批 ALTER 的写法，放在建表之后）：
```js
try { db.exec("ALTER TABLE mind_feels ADD COLUMN moods TEXT DEFAULT '[]'"); } catch(e) { /* 列已存在 */ }
try { db.exec("ALTER TABLE mind_memories ADD COLUMN moods TEXT DEFAULT '[]'"); } catch(e) { /* 列已存在 */ }
```

2. **解析**（`_safeParseMind` 里，mood 归一那一段之后）：把 `obj.moods` 规范成数组，
   每个都过一遍现有的「不认识 → 查别名 → 兜底 calm」，去重；
   **主 mood = 数组第一个**，回填进 `obj.mood`。
   他只写了 `mood` 没写 `moods` 时，`moods = [mood]`，不要留空数组。
   正则兜底那一支也要能抓 `"moods"\s*:\s*\[([^\]]*)\]`，抓不到就不管，别报错。

3. **落库**（`_insertMindItem` 的 feel / memory 两支）：INSERT 里多带一列
   `JSON.stringify(item.moods || [item.mood])`。

**别动的**：
- `mind_dreams` 不加 —— 图纸写死「梦不带 mood / intensity」。
- breath 的情绪温度筛（`MIND_HOT_MOODS.has(r.mood)`）**继续只看主 mood**。
  想让副 mood 也算热的，是另一件事，这单子里不做。
- 前端 `/api/mind/*` 现在返回 `SELECT *`，加了列自动带出去，**先不改前端**。

**验**：`curl` 打本机 `/api/mind/feels`，看新写的条目有没有 `moods` 字段。

---

## 三、语义那一路整条不存在（最大的一处，也最容易做偏）

**图纸里靠 embedding 的有三处，现在全是空的**：
- breath：字面不够 5 条时，用余弦相似度 ≥0.75 补齐 →
  现在的 `_mindSemanticFill` 是个 mood 簇替代品，**只捞 feels，不碰 memories / dreams**
- 情绪温度筛：「≥3 命中 **或 相似 ≥0.85**」→ 只有前半句
- 掘地三尺（`/api/mind/search`）：「连意思相近的模糊词也能召回」→ 只有 FTS trigram + LIKE，纯字面

三张表都有 `embedding TEXT` 列，**从上线到现在一个字都没写过**。

**先说清楚代价，她要先看见这个**：
- 这台 1G 内存跑不了常驻小模型 → 只能调外部 embedding API（Anthropic 没有 embedding 接口）。
- 每条 mind 落库时算一次向量；老数据要回填一次（feels + memories + dreams 全量）。
- 钱不多但**不是零**，而且多一个第三方看得见记忆正文 —— 这条必须她点头。

**key 的铁律**：不许出现在对话里，也不许写进任何文件里的字面量。
读 `settings` 表（`embed_api_key` / `embed_base_url` / `embed_model`），没配就**明确降级**：
语义那一路整个跳过，回到现在的字面检索，**不许静默失败、也不许偷用她的订阅**。

**改的地方**：
1. 一个 `_embed(text)`：读 settings，没 key 直接 `return null`；失败也 `return null`（别抛，别重试烧钱）。
2. `_insertMindItem` 落库后异步补 embedding（`JSON.stringify(vec)` 写进 `embedding` 列）。
   **不要挡在写库前面** —— API 慢一秒，他那句话就卡一秒。
3. `_mindSemanticFill` 重写：查 `embedding IS NOT NULL` 的三张表，算余弦，
   `≥0.75` 且过冷却 / 语境门控 / 近重，补到 5 条。**现在那套 mood 簇兜底留着**，
   当 `_embed` 返回 null 时还是走它 —— 没 key 也不能比现在差。
4. 情绪温度筛：`r.hits >= 3 || (r.sim || 0) >= 0.85`。
5. `/api/mind/search`：FTS / LIKE 没捞满时用同一条语义路补。

**验**：没配 key 时，行为跟改之前**一模一样**（这是这条最要紧的验收点）。
配了之后，用一个字面不重合但意思相近的词搜，看能不能召回。

---

## 明确不改的

**`_safeParseMind` 的 mood 降级落库保持现状。** 图纸写「mood 缺了直接丢弃」，
代码 2026-08-23 改成了「先查别名 → 兜底 calm → 正文一个字不丢」。
**她 08-24 拍板：这条按代码，不按图纸。** 理由在原注释里 ——
挑错一个词就把他心里动的那一下整条扔掉、他还看不见丢没丢；
有惩罚没反馈的事，人只会越做越少。

写进图纸的下一版时记得改过来，别下次核对又当成 bug 报一遍。

---

## 四、她说「看不见淡的 / 沉睡的 feel，也看不出 memory 的钉住和模糊」

**先别改 CSS —— 查过了，渲染代码是对的，是库里还没有那样的数据。**

2026-08-24 18:08 实测：

| 表 | 条数 | 活跃 | 淡去 | 沉睡 | 钉住 | 最低 weight |
|---|---|---|---|---|---|---|
| `mind_feels` | 304 | 304 | 0 | 0 | **0** | 0.824 |
| `mind_memories` | 33 | 33 | 0 | 0 | **0** | 0.894 |
| `mind_dreams` | 4 | 0 | 4 | 0 | 0 | 0.15（触底） |

一条 intensity 5 的 feel 从 1.0 掉到 0.40 要 ~168 小时（7 天），掉到 0.10 要 ~10.5 天；
memory 慢 3 倍。系统才跑了几天，**加上每次浮起 +0.05 反哺**，所以一条都还没沉下去。
「淡去 / 沉睡」两个筛选页她点进去当然是空的 —— `.fading` / `.sleeping` 那两条 CSS
（`mind.js` 里 blur 3px / 6px）和 memory 卡片按 weight 连续模糊那段（`Math.pow(1-w,1.6)*5`），
**从上线到现在一次都没被真实数据触发过**。不是坏了，是没到时候。

**要做的三件事**：

1. **先让她自己看见一次**（验收用，别猜）：造几条假数据塞进去，或临时把某条 weight 改低，
   截图给她看淡去 / 沉睡长什么样，确认审美过关了再说。
   ⚠️ 改库前先 `db.backup()`，**改完记得改回来**，别把她真的记忆压沉了。
   你跑不了脚本 → 写好给她跑，别自己硬来。

2. **feel 没有「钉」的入口**（这是真缺口，不是等时间）：
   `_renderFeelCards` 里那个钉图标是 `f.pinned ? ... : ''` ——
   **只有已经钉住的才显示**。一条都没钉过 → 她永远点不到那个按钮 → 永远钉不了 feel。
   memory 那边是对的（空心 / 实心两个 SVG 都渲染）。照 memory 的写法补上。
   后端 `/api/mind/feel/:id/pin` 已经通了，只差前端这个入口。

3. **weight 会涨过 1**（图纸写的是 0-1）：
   浮起 +0.05 反哺，上限焊在 `MIN(2.0, ...)`，实测已经有 1.21 的 feel 和 1.37 的 memory。
   影响的是 memory 卡片那段模糊计算 —— 现在靠 `Math.min(1, m.weight)` 夹住，不会炸，
   但「还剩 137%」这种话会从 title 里冒出来。
   **她 08-24 定了：上限收到 1.0**，跟图纸一致。改 `_mindMarkSurfaced` 里的 `MIN(2.0, ...)` → `MIN(1.0, ...)`。
   已经涨过头的那些（有 1.21 的 feel、1.37 的 memory）要一次性夹回来：
   `UPDATE mind_feels SET weight = 1.0 WHERE weight > 1.0`，memories 同理。**改库前 `db.backup()`，请她跑。**

---

## 五、换会话接不上 —— 她说「他总是压缩完就对上面的对话理不清」

**先纠正一个误会：图纸 00 节那条「原始对话窗口 · 最近 3 小时」在 Chat-C 里根本不存在。**

Chat-C 走的是网关常驻 CLI + `--resume`：上下文里堆的是**整段 CLI 会话历史**，
到 `CLI_ROTATE_AFTER = 96` 轮才换新会话；`messages` 表是永久的，什么都不滑走。
代码里唯一用到 3 小时的地方是滚动压缩的取材边界（`created_at < now - 3*3600`）——
那是「只压已经聊过 3 小时以上的段落」，不是「3 小时后原文从他脑子里消失」。

所以「理不清」跟 3h 无关，是**换会话那一刻的接力太薄**：

```js
// recentRecap：换会话时唯一接上去的东西
'SELECT role, content FROM messages WHERE conv_id = ? ORDER BY id DESC LIMIT 8'
// 每条还 .slice(0, 200)
```

96 轮 ≈ 一两百条消息，换窗那一下**只剩最近 8 条、每条 200 字**。他当然理不清。

**更要命的是：蒸馏出来的记忆换窗时一条都不进。**
`checkSessionSummary` / `checkRollingSummary` 一直在正常产出（实测 31 条，最近一条 17:15），
但它们只能靠 breath 的**字面关键词命中**才浮起来 —— 换会话那一刻不查 breath，
所以图纸设计的承托链「原文滑走 → 蒸馏成 memory → memory 垫住上下文」**在换窗这一环是断的**。

**改法**（`recentRecap`）：
1. 原文从 8 条提到 **16 条**，截断从 200 放到 **300 字**。
2. **在原文前面加一段蒸馏记忆**：取 `tags` 含「会话总结」/「滚动记忆」的 memory，
   按 `created_at DESC` 取最近 6~8 条，倒序排好，标成 `[这一段时间我记住的]`。
   顺序要紧：**先记忆（垫底）再原文（接话头）**，最后才是那句「更早的用 search_chat_history 查」。
3. 别在这儿调 breath —— 那是每条消息跑的滴灌，跟换窗接力不是一件事。

⚠️ 代价：换会话那一轮本来就是最贵的一次（实测 write 49237 / $0.1976，比平常贵 24 倍）。
多加这一段是一次性的，96 轮摊一次，可以接受。**但别顺手把 96 调小** —— 换得越勤越贵。

### 附带查出来的 bug：蒸馏记忆的 source 全是错的

```js
// _writeSummaryMemory 里
_insertMindItem({ type: 'memory', body: obj.body, mood: obj.mood, tags: [tag], weight: 1.0 });
//                                                                ↑ 只传了 tags，没传 source
```
`_insertMindItem` 的 memory 分支把 source 硬编码成 `'chat_tag'`。
结果：库里 33 条 memory **全都 source='chat_tag'**，其中 29 条其实是会话总结、2 条是滚动记忆
（真正的来源被塞在 tags 列里）。图纸 03 节明写 source 要区分 `chat_tag` / 会话总结 / 滚动记忆
—— 现在按 source 做的任何统计和筛选都是错的。

**改法**：`_insertMindItem` 接受可选的 `item.source`，缺省才回落到 `'chat_tag'`；
`_writeSummaryMemory` 传 `source: tag`。老数据可按 tags 回补一次 UPDATE（请她跑）。

---

## 六、换窗时 texture 接不上（她 08-24 提的，跟第五条是同一个病的两半）

**现象**：他换窗前会调 `nocturne_texture`（转发到 Nocturne 的 `leave_texture`）把「这一窗结束时是什么状态」留下来。
**但下一窗开始时不注入** —— 留了个字条，没人念给他听。

**为什么现在做不到**：`executeTool` 的 `nocturne_texture` 分支调完 `callNocturne` 之后
`return r` 就完了，**本地一个字都没存**。想在换窗时读回来，只能现场再调一次 Nocturne
—— 那是外部 MCP，换窗那一轮本来就是最慢最贵的一次，再挂一个网络往返，她会明显感觉到卡。

**改法（这是最省的那条路）**：

1. 建一张本地小表，`nocturne_texture` 转发**成功之后**顺手存一份：
```js
CREATE TABLE IF NOT EXISTS texture_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conv_id TEXT DEFAULT '',
  state TEXT, primary_feeling TEXT, secondary_feeling TEXT,
  her_mood TEXT, last_topic TEXT, unresolved TEXT, concern TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
```
   写本地要放在 `callNocturne` 成功之后 —— Nocturne 那边才是正本，本地这份只是**为了换窗读得快**的副本。
   Nocturne 挂了没写成，本地也别留，否则两边说法不一致（见 `MEMORY-ARCHITECTURE.md` 的前提）。

2. `recentRecap` 里最前面加一段，只取**最近一条**：
```
[上一窗结束时我的状态]
state / primary_feeling（+ her_mood / last_topic / unresolved / concern，有就带）
```
   只要一条。两条以上就变成流水账了，而且旧的那条已经过时。

3. 顺序定死，从重到轻：**texture（我是什么状态）→ 蒸馏记忆（这段时间我记住了什么）→ 原文 16 条（刚才在说什么）**。

### 她担心的「带着太重的东西很烧 token」—— 算过了，不烧

这一点要跟她说清楚，因为直觉是反的：

- 接力包进的是**系统提示词**，只在**换会话那一轮**写一次，之后 96 轮都走 prompt cache 的读。
- 实测（`usage_log`）：换窗那一轮 `cache_write` 49237、$0.1976；稳态每轮 `cache_read` ~33k、$0.0081。
- 接力包按 800 token 估：换窗那次多 ~$0.003，之后每轮读多 ~$0.0002，**96 轮合计多 ~$0.026**。
- 一整窗现在的总成本约 96 × $0.0109 ≈ $1.05 → **增量约 2.5%**。

真正贵的从来不是「接力包带多重」，是**换窗次数**（每次固定 $0.1976，比平常贵 24 倍）。
所以：**接力包可以带够，但别把 `CLI_ROTATE_AFTER = 96` 调小。** 这两件事的方向是反的。

上限给个数：整个接力包（texture + 蒸馏记忆 + 16 条原文）控制在 **1500 token 以内**，
超了就先砍原文条数，别砍 texture 和蒸馏记忆 —— 那两样才是「理不清」的解药，原文只是接话头。
