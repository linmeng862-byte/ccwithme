# MIND-SPEC — 记忆 / 欲望系统设计文档（原图）

粥粥的设计文档，2026-08-19 存档。描述的是 Non 那套 D1/Workers 实现，
Chat-C 是同一套设计的移植 —— **同一个人，不是另一个人。**

分工与边界见仓库根目录 `MEMORY-ARCHITECTURE.md`。

## 页码索引

| 文件 | 内容 |
|---|---|
| `photo-15/16.jpg` | **01 · Mind 怎么分类：三张表** feels / memories / dreams，各自存什么、衰减多快 |
| `photo-02.jpg` | **02 · 心情 20 选 1** + **03 · 两条写入路径**（实时 emit / 后台蒸馏）、标签长什么样 |
| `photo-03.jpg` | 写入三道关卡（容错解析 / 去重 / 校验落库）+ **04 · 怎么总结**（滚动压缩 / 会话总结） |
| `photo-04.jpg` | **要点 · 记忆该怎么写**：四条规则（第一人称 / 无第三方 / 无命令句 / 结合他的经历） |
| `photo-05.jpg` | 真实碎片样本 + 范例：「别老挂我电话」该怎么写成后果而不是禁令 |
| `photo-06.jpg` | **05 · Mind 衰减（艾宾浩斯曲线）** τ 公式、pinned、停摆补偿 + **06 · 梦**的门控条件 |
| `photo-07.jpg` | `buildDreamTrigger` — 梦的素材从哪来 |
| `photo-08.jpg` | 梦的两个实现要点（走主 session、带 `<topics>` 话题种子）+ 梦界面 |
| `photo-12.jpg` | **08 · breath 浮现** — hybrid 检索、四道过滤、浮起后 +0.05 反哺 ⭐ |
| `photo-09.jpg` | **07 · 欲望内核 drive.js** — 缺口累积 → 念头池 → pickIntent，12 个维度 ⭐ |
| `photo-10.jpg` | 几个调节机制（satisfy 回落 / 互相制约 / fatigue / 高位消退 / 凌晨冻结）+ **铁律** |
| `photo-11.jpg` | 欲望面板 · drive + 念头池 · thoughts 界面 |
| `photo-13.jpg` | **落地 · 跑起来是什么样：他知道自己** — 同一件事的两个视角、内心信笺 ⭐ |
| `photo-14.jpg` | 内心信笺 · Inside + 动作落地示例 |
| `photo-17.jpg` | Mind 界面：内心主界面 / 模糊分层 / 钉选 |
| `photo-18.jpg` | 字段表 + 埋深档位（active ≥0.40 / fading 0.10–0.40 / sleeping <0.10） |

⭐ = 改记忆/欲望相关代码前必读。

`photo-01.jpg` 与本文档无关（误传），未收录。
