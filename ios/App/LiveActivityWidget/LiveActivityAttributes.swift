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

@available(iOS 16.1, *)
struct ThinkingLiveActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var isActive: Bool
        var label: String
    }
}
