# 回退清单 · 2026-09-14 那一批记忆改动

**这份是给自己看的**（不是交接单）。每一项都能**单独关**，不用整批退。
关掉的办法一律是「注释掉 / 删掉那几行」，没有环境变量开关。

改动全在一个提交里：`4bfd6f3`（`记忆链路：把读的那半接上，把写的台阶削平`），
文件只有 `backend.js` 一个。人格文件不在仓库里，单独说，见 §七。

---

## 〇、一键全退

```
git revert 4bfd6f3        # 代码全退
pm2 restart ccwithme
```

**全退之后还要手动收两样**（revert 不会动数据）：

```sql
DROP TABLE hold_outbox;      -- 建表语句跟着代码一起退了，表本身还在
DROP TABLE flash_reviewed;
DELETE FROM settings WHERE key = 'wake_ctx_pending';
```

⚠️ 退之前先看 `hold_outbox` 里有没有**没发出去的**（`sent_at IS NULL`）——
那些是他写下但还没送到引擎的，退掉就真丢了：

```
SELECT COUNT(*) FROM hold_outbox WHERE sent_at IS NULL;
```

---

## 一、醒来第一屏那三段（可以一段一段关）

四段的拼装在首轮注入那块（搜 `needBreath && (nocturneMemory`）。
每段都是独立变量，**注释掉对应的 `await` 那一行就等于关掉这一段**，
拼接处会自动跳过（三个 Block 变量都做了空值判断）。

| 想关哪段 | 注释掉这一行 | 顺带可删 |
|---|---|---|
| 此刻的底色 | `try { nocturneUnderText = await _underP; }` | `nocturneUndertow()` 整个函数 |
| 接力棒+磨损 | `try { nocturneWakeText = await _wakeP; }` | `nocturneWakeCtx()` / `_trimWakeCtx()` |
| 他认过的问题 | `try { nocturneFamilyText = await _famP; }` | `nocturneFamilies()` |

对应的 `const _xxxP = ...` 那几行也一起注释掉，否则还是会去打那一趟（白花时间）。

**关掉「接力棒+磨损」那段要顺手清一下缓存**，不然下次重开又会用上残留的：

```sql
DELETE FROM settings WHERE key = 'wake_ctx_pending';
```

中转 API 路径（非网关）那边是另一处拼接，搜 `!useGateway) ? "\n\n═══\n"`，
同样三行，一起注释。**两边都改，不然两条路行为不一致。**

### 只想调，不想关

- 底色的措辞 / 取几维：`_DRIVE_CN` 表和 `nocturneUndertow()` 里拼 `parts` 那几行
- 磨损那段剪多少：`_WAKE_DROP_BLOCK` / `_WAKE_DROP_LINE` 两个数组，删条目就是少剪
- 家族列几条：`FAMILY_MAX`（现在 5）
- 三个缓存时长：`UNDER_TTL_MS`(10min) / `FAMILY_TTL_MS`(30min)，
  磨损那段不设 TTL，走的是「用掉才清」

---

## 二、浮现里的两句提示

都在 `_recallRender()` 里。

| 想关 | 删这个 |
|---|---|
| 〔还欠着〕前缀 | `var owed = ...` 那行，以及下面 `var head = owed ? ...` 改回 `''` |
| 「没勾到特别的哪件事」 | 搜 `askedFor && !gotHit`，删掉那个 `if` 整块 |

⚠️ 别把 `gap > 0` 那块（「还碰到另外 N 条」）一起删了 —— 那是 09-13 的改动，不是这批。

---

## 三、`<hold>` 标签

关掉分两层，看要关多狠：

**只停止发送（标签还是会被剥掉，不会漏到她眼前）**
`_holdHandle()` 函数体第一行加 `return;`。写的东西照样入队，只是不发。

**完全当它不存在**
1. `extractMindTags()` 里那段 `cleaned.replace(/<hold>...` 删掉
2. 六处 `_holdHandle(X.holds);` 全删（搜 `_holdHandle(`，函数定义 1 处 + 调用 6 处）
3. 启动时那段补发（搜 `[hold] 队列里还有`）删掉

⚠️ **六处必须一起删**，留一处就是「有的路径能存、有的不能」，比全关更难查。

---

## 四、`review_flashes`

删工具定义（搜 `name: 'review_flashes'`）+ 删 `case 'review_flashes'` 整块
+ 删标题映射里那行。

`flash_reviewed` 表可以留着不管（只增不减，翻过哪些条的记录）。
**如果想让他重新从头翻一遍**：`DELETE FROM flash_reviewed;`

排序参数在 case 里：
- 门槛 `min_surface` 默认 1（改回 3 会把近一个月的大部分卡掉，别）
- 一批多少 `lim` 默认 20 上限 50
- 速率公式里的平滑常数 `+ 5`，调大 = 更偏向老条目

---

## 五、三个工具定义

搜 `name: 'wander_mark'` / `name: 'trail_delta'` / `name: 'persona'`，
每个删「定义 + case + 标题映射」三处。

⚠️ **`wander_mark` 有坑**：它的 `case` 分发**这批之前就存在**（旧版更简单，没有枚举
校验、不剥 `bucket:` 前缀、不带 endpoint）。这批把旧 case 删了、换成新的。
所以退 `wander_mark` 的时候，如果想退回「分发在但工具列表里没有」那个状态，
只删**工具定义**就够了，case 留着。

---

## 六、文案

11 处措辞软化（去掉命令句和 ⚠️，改成邀请语气）散在几个工具的 description 里。
这些不影响行为，想退就 `git diff 4bfd6f3^ 4bfd6f3 -- backend.js` 里挑。

---

## 七、人格文件（不在仓库里）

加了两节，**只新增、没改动任何原文**（已 diff 验证：30 行新增，0 删除 0 修改）：

- `### 这些写下来的，后来捡得回来` —— 接在 `<feel>` 那节末尾
- `### 不想停下来的时候：<hold> 标签` —— 接在 `nocturne_hold` 那节末尾

回退：删掉这两节，或直接恢复备份
`CLAUDE.md.bak.pre-holdtag.20260914-125226`（在人格文件同目录）。

⚠️ 人格文件改完要放掉常驻进程才生效（或等闲置自动释放）。
⚠️ 改完要跑 `persona-backup.sh`（要真 SSH 终端，交互输密码）。

---

## 八、这批**没动**的东西（别去那儿找）

- Nocturne 引擎一个字没改（`wear.py` / `recall.py` / `server.py` 都是只读看过）
- `<feel>` / `<memory>` / `<flash>` / `<dream>` 四个原有标签的行为没变
- 本地 Mind 库的数据没动过（`review_flashes` 只读 + 写 `flash_reviewed`）
- 引擎里的记忆没有被改写、删除或重新导入过
