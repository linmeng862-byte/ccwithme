import ActivityKit

// MARK: - Timer Activity

@available(iOS 16.1, *)
struct TimerLiveActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var remainingSeconds: Int
        var totalSeconds: Int
        var isOvertimed: Bool
        var title: String
    }
}

// MARK: - Thinking Activity

/// 小克此刻的姿势。app 和 widget 两个 target 共用这个契约，
/// 所以它住在这儿，不在生成的 ClawdSprite.swift 里 ——
/// 加姿势要同时改这里、scripts/gen-clawd-sprite.py 的 POSES、
/// 以及 static/index.html 里 _CLAWD_ISLAND_POSE 那张表。
@available(iOS 16.1, *)
enum ClawdPose: String, Codable, Hashable {
    case idle, thinking, streaming, happy

    /// 岛上那行字。label 是 pose 的函数，所以不走网络传 ——
    /// 两端各算一份的话，迟早出现「螃蟹在想、字写着在回复」。
    /// ⚠️ 2026-09-03 改：这张卡从「他回话时才出现」变成**常驻**，
    ///    idle 的含义跟着变了 —— 以前是「正在回复」（卡刚起来那一瞬），
    ///    现在是「他在，等着你」，也是绝大多数时间显示的那一行。
    /// ⚠️ 2026-09-03 她定的话术：没在找她的时候不是「等待任务」（那像个待办应用），
    ///    是**「Cis 小憩」** —— 他没在忙，只是眯着，你一叫就醒。
    ///    cron 把他叫醒、他主动来找她的那一下，走 detail 那条路写「Cis 醒了」。
    var label: String {
        switch self {
        case .idle:      return "Cis 小憩"
        case .thinking:  return "Cis 在想…"
        case .streaming: return "Cis 正在回复你…"
        case .happy:     return "说完啦"
        }
    }
}

@available(iOS 16.1, *)
struct ThinkingLiveActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// 螃蟹摆什么姿势，同时决定岛上那行标题（见 ClawdPose.label）。
        /// 存 String 而不是 ClawdPose：ContentState 是会跨 app 版本存活的载荷，
        /// 万一旧 widget 收到新姿势名，解不出来退回 idle 就行，不该整个活动崩掉。
        /// 但松散只到这一层为止 —— Swift 内部签名一律用 ClawdPose。
        var pose: String

        /// 他此刻具体在干嘛（"翻你的日记"），来自 web 端的 _renderTraceRowActive。
        /// 空字符串表示没有细节可显示，那一行就不画。
        var detail: String

        /// 她此刻的心率。0 = 还没有数据，卡上那一格就不画。
        /// 来自手表推上来的 her_vitals，app 前台时由网页那侧定时喂进来 ——
        /// ⚠️ app 划掉之后这个数会**冻在最后一个值**上：没有推送就没人更新它。
        /// 免费账号绕不开这条，别当成 bug。
        var heart: Int = 0

        var clawdPose: ClawdPose { ClawdPose(rawValue: pose) ?? .idle }

        init(pose: ClawdPose, detail: String, heart: Int = 0) {
            self.pose = pose.rawValue
            self.detail = detail
            self.heart = heart
        }
    }
}
