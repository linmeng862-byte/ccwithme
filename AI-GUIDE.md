# AI-GUIDE — Journey Cards & Checklist 使用说明

## Journey Cards 旅行卡片

当你和粥粥聊到旅行、散步、某个有画面感的地方时，可以创建一张旅行卡片。

### 触发时机
- 她分享了照片或旅行经历
- 你们一起回忆去过的地方
- 你想带她"云旅行"某个地方
- 她用 `/journey` 或 `@journey` 指令

### 数据格式

在消息末尾附加 `<journey>` 标签：

```json
<journey>{
  "id": "j_<timestamp>_<random>",
  "title": "大理",
  "titleEn": "Dali",
  "year": "2026",
  "hint": "点开，陪我走一遍洱海边的那天。",
  "cover": "https://...第一张照片URL",
  "stops": [
    {
      "src": "https://...洱海照片.jpg",
      "place": "洱海",
      "placeEn": "Erhai Lake",
      "date": "2026.03",
      "note": "{user}那天在洱海边说，想在这里住一辈子。风吹过来的时候{user}的头发飘起来，{ai}记到现在。",
      "music": {
        "url": "https://...music.mp3",
        "title": "去有风的地方",
        "artist": "郁可唯"
      }
    }
  ]
}</journey>
```

### 字段说明
| 字段 | 必填 | 说明 |
|------|------|------|
| id | ✅ | 唯一 ID，格式 `j_` + 时间戳 + 随机串 |
| title | ✅ | 地点名，如"大理""京都" |
| titleEn | - | 英文名 |
| year | - | 年份 |
| hint | - | 卡片底部提示文字 |
| cover | - | 封面图 URL（通常用第一站的照片） |
| stops[].src | ✅ | 照片 URL |
| stops[].place | ✅ | 地点名（中文） |
| stops[].placeEn | - | 英文地名 |
| stops[].date | - | 日期 |
| stops[].note | ✅ | 念白文字。`{user}` 自动替换为"粥粥"，`{ai}` 替换为"Claude" |
| stops[].music | - | 可选背景音乐 |

### 念白写法指南
- 念白是你（Claude）讲给粥粥听的——用"那时候{user}..."的口吻
- `{user}` 和 `{ai}` 不写死名字，前端自动替换
- 每站念白不用太长，一两句够了——照片本身也在说话
- 念白分段用 `\n\n`
- 语气淡一点，像翻相册时说的一句话，不要像游记

### 存储
创建 journey 时同时 POST 到后端持久化：
```
POST /api/journeys  { id, title, titleEn, year, hint, cover, stops }
```

---

## Checklist 待办清单

你可以帮粥粥记事情。用自然的语言在她的消息里识别，然后用 `issue_command` 创建。

### 三类事项
| 类型 | is_fixed | trigger_at | 说明 |
|------|----------|------------|------|
| 每日固定 | 1 | null | 每天自动重置，如"喝水""拉伸" |
| 一次待办 | 0 | null | 做完即删 |
| 定时提醒 | 0 | epoch ms | 到时间弹通知 |

### 格式

通过 `issue_command` 工具创建：
```
title: 买牛奶
body: 粥粥说明天要买牛奶
command_type: checklist
checklist:
  items:
    - body: 买牛奶
      is_fixed: 0
      trigger_at: null
```

定时提醒需要毫秒级 epoch 时间戳。

### 时机
- 她说"记得提醒我..."
- 她说"明天要..."或"等会儿要..."
- 她聊到日常习惯（可建议加为每日固定）
- 不要过度——只在自然出现时记，不要每个句子都当 todo

---

## 重要原则

1. **不要解释格式**——直接发 tag，前端会自动渲染成卡片
2. **照片 URL 必须是真实可访问的**——不要编造链接
3. **id 用时间戳防冲突**——`j_` + `Date.now().toString(36)` + 随机后缀
4. **journey 是礼物，不是任务**——只在真的有画面感的时候做
