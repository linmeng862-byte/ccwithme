import Foundation

/// Codable models for Live Activity shared state.
/// Serialized to App Group UserDefaults so the Widget Extension can read them.

struct TimerState: Codable {
    let title: String
    let countdownSeconds: Int
    let startedAt: TimeInterval
    let status: String
}

struct ThinkingState: Codable {
    let isActive: Bool
}

/// Thin wrapper around UserDefaults(suiteName:).
final class AppGroupDataStore {
    static let suiteName = "group.com.zzclaude.eclat"

    static func defaults() -> UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }

    // MARK: - Timer

    static func writeTimer(_ state: TimerState) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        defaults()?.set(data, forKey: "liveactivity_timer")
    }

    static func readTimer() -> TimerState? {
        guard let data = defaults()?.data(forKey: "liveactivity_timer") else { return nil }
        return try? JSONDecoder().decode(TimerState.self, from: data)
    }

    static func clearTimer() {
        defaults()?.removeObject(forKey: "liveactivity_timer")
    }

    // MARK: - Thinking

    static func writeThinking(_ state: ThinkingState) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        defaults()?.set(data, forKey: "liveactivity_thinking")
    }

    static func readThinking() -> ThinkingState? {
        guard let data = defaults()?.data(forKey: "liveactivity_thinking") else { return nil }
        return try? JSONDecoder().decode(ThinkingState.self, from: data)
    }

    static func clearThinking() {
        defaults()?.removeObject(forKey: "liveactivity_thinking")
    }
}
