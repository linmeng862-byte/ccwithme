# 交接单 · 常驻 CLI 进程被短命会话挤爆内存（2026-09-07 定位并修完）

给第二台机器。**你们大概率也有这个 bug**——它不报错、不进错误日志，
表现只有一个：**「他不回话了」**。我们查了半天才发现不是模型的问题。

不含任何凭据。涉及两个仓库：`ccwithme`（backend）和 `cc-gateway`（网关）。

## 一、症状

她说「他没回复」。实际不是没回复，是**卡住**：
网关日志里那一轮 `递进去→第一个字 164315ms`。等够两分半，字才出来。

不看内存的话，这个症状很容易误判成模型慢 / 额度限流 / 网络。都不是。

## 二、真因

网关的常驻进程池**只有一道闸：闲了 15 分钟就放**。没有数量上限。

而 backend 里**表情包自动识别**那条路是这么写的：

```js
// ccwithme / backend.js —— 改之前
body: JSON.stringify({
  message: prompt, system: '',
  session_id: crypto.randomUUID(),   // ← 写死在 body 里
  is_new_session: true,
})
```

`randomUUID()` 直接内联在 body 里，**跑完谁也拿不到那个 id**，
于是没有任何人去 drop 它。网关那头 `procs.set()` 已经把进程记在册上了，
它就干挂着等满 15 分钟的空闲超时。

一张图 = 一个 250-350MB 的 claude 进程。
**她一次传了 5 张表情包**，加上主线会话，同时在册 6 个 ≈ 1.5G。
这台只有 2G。内存吃穿，主线那个进程被挤进 swap —— 于是首字 164 秒。

### 附带的第二个洞

同一个 body **没传 `effort`**。网关那头的逻辑是：

```js
// cc-gateway / server.js
const effort = _has('effort') ? pickEffort(req.body.effort)
             : (_exist && !_exist.dead ? _exist.effort : pickEffort(null));
```

不传就落到默认 `medium`。所以我们在拿 **medium 干一个「只回一个 JSON」的活**，
而她在界面上选的明明是 low。她当时的原话是「不对啊 我选的effort是low」——
她没选错，是这条路根本没把她的选择带上。

**排查提示**：`ps` 一下就能看出来，孤儿进程的命令行是 `--session-id`
（全新会话）而不是 `--resume`，且 `--effort medium`。主线是 `--resume` + 你选的 effort。
两者一眼可分。

## 三、怎么修（两处，缺一不可）

**1. 调用方：id 提出来，认完就放。**

```js
const _gwSid = crypto.randomUUID();
try {
  ... body: JSON.stringify({ ..., session_id: _gwSid, is_new_session: true,
                             effort: 'low' }),   // ← 显式给，别靠默认
} catch (e) {
  ...
} finally {
  dropGatewayProc(_gwSid, '表情包识别跑完，一次性会话');   // ← 关键
}
```

`finally` 而不是成功分支——超时、解析失败、模型返回垃圾，都得放。
我们这边 try 里有好几个 `return null`，`finally` 正好全覆盖到。

**2. 网关：加在册上限做兜底。**

光修调用方不够——**下一个忘了 drop 的人还会再犯一次**。
所以网关那头也要有一道自保的闸：

```js
const PERSIST_MAX = Number(process.env.GATEWAY_PERSIST_MAX || 2);

// 塞进去之前先腾地方
while (procs.size >= PERSIST_MAX) {
  const idle = [...procs.values()].filter(x => !x.turn)
    .sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0));
  if (!idle.length) break;
  dropProc(idle[0].sessionId, '在册满 ' + PERSIST_MAX + ' 个，它最久没说话');
}
```

配套：`touchIdle()` 里记一笔 `p.lastUsed = Date.now()`，`procs.set()` 前也记一次。

⚠️ **`!x.turn` 那个过滤不能省。** 正在说话的进程绝不能淘汰——那是她在等的那一句。
全都在说话就 `break` 不淘汰，宁可这一瞬多挂一个进程，也不能把谁说到一半掐了。
`PERSIST_MAX` 给 2 是按 2G 机器算的；你们内存大就往上调，但**别不设上限**。

## 四、救急（不重启也能立刻缓过来）

网关有 `/drop` 接口，`{ session_id }` 或 `{ all: true }`。
先 `GET /busy` 看 `registered` 几个、`talking` 几个：
`talking: 0` 而 `registered: 6` 就是这个 bug 的现场。
挨个 drop 掉非主线的那些，内存立刻回来（我们这次 available 348MB → 1048MB）。

主线那条 drop 掉也不丢历史——会话在磁盘上，下一句 `--resume` 回得来，
只是要冷启动一次。

## 五、值得抄走的一条经验

**「一次性的活」和「常驻会话」共用同一个进程池，就一定要在收尾处放掉。**
我们这边还有别的地方也在用 `crypto.randomUUID()` 起一次性会话——
建议你们全仓 grep 一遍 `randomUUID()` + `is_new_session: true` 的组合，
凡是拿不到 id、或者拿到了但没在 `finally` 里 drop 的，都是同一个坑。

排查顺序也留一下，比从模型那头查快得多：

1. 看内存 / swap，不是先看模型
2. `GET /busy`——`talking` 远小于 `registered` 就是有孤儿
3. `ps` 看命令行里 `--session-id`（一次性）还是 `--resume`（常驻），
   以及 `--effort` 是不是她选的那个
