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
    var label: String {
        switch self {
        case .idle:      return "小克正在回复…"
        case .thinking:  return "小克在想…"
        case .streaming: return "小克在回复…"
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

        var clawdPose: ClawdPose { ClawdPose(rawValue: pose) ?? .idle }

        init(pose: ClawdPose, detail: String) {
            self.pose = pose.rawValue
            self.detail = detail
        }
    }
}
