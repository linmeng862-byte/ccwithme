import Foundation
import ActivityKit

/// Encapsulates all ActivityKit lifecycle calls.
/// Every public method is @available(iOS 16.2, *) guarded.
final class LiveActivityManager {

    @available(iOS 16.2, *)
    private static var timerActivity: Activity<TimerLiveActivityAttributes>?

    @available(iOS 16.2, *)
    private static var thinkingActivity: Activity<ThinkingLiveActivityAttributes>?

    // MARK: - Timer

    @available(iOS 16.2, *)
    static func startTimer(title: String, countdownSeconds: Int, startedAt: TimeInterval) {
        let now = Date().timeIntervalSince1970
        let elapsed = now - startedAt
        let remaining = max(0, Int(Double(countdownSeconds) - elapsed))
        let isOvertimed = elapsed > Double(countdownSeconds)

        let attrs = TimerLiveActivityAttributes()
        let state = TimerLiveActivityAttributes.ContentState(
            remainingSeconds: remaining,
            totalSeconds: countdownSeconds,
            isOvertimed: isOvertimed,
            title: title
        )

        if let existing = timerActivity {
            Task { await existing.update(using: state) }
        } else {
            do {
                let activity = try Activity<TimerLiveActivityAttributes>.request(
                    attributes: attrs,
                    contentState: state,
                    pushType: nil
                )
                timerActivity = activity
            } catch {
                print("[LiveActivity] Failed to start timer: \(error)")
            }
        }
    }

    @available(iOS 16.2, *)
    static func updateTimer(countdownSeconds: Int, startedAt: TimeInterval) {
        guard let activity = timerActivity else { return }
        let now = Date().timeIntervalSince1970
        let elapsed = now - startedAt
        let remaining = max(0, Int(Double(countdownSeconds) - elapsed))
        let isOvertimed = elapsed > Double(countdownSeconds)

        let state = TimerLiveActivityAttributes.ContentState(
            remainingSeconds: remaining,
            totalSeconds: countdownSeconds,
            isOvertimed: isOvertimed,
            title: activity.contentState.title
        )
        Task { await activity.update(using: state) }
    }

    @available(iOS 16.2, *)
    static func endTimer() {
        guard let activity = timerActivity else { return }
        let finalState = activity.contentState
        Task {
            await activity.end(
                ActivityContent(
                    state: finalState,
                    staleDate: Date().addingTimeInterval(60)
                ),
                dismissalPolicy: .immediate
            )
        }
        timerActivity = nil
    }

    // MARK: - Thinking

    @available(iOS 16.2, *)
    static func startThinking() {
        guard thinkingActivity == nil else { return }
        let attrs = ThinkingLiveActivityAttributes()
        let state = ThinkingLiveActivityAttributes.ContentState(
            isActive: true,
            label: "小克正在回复…"
        )
        do {
            let activity = try Activity<ThinkingLiveActivityAttributes>.request(
                attributes: attrs,
                contentState: state,
                pushType: nil
            )
            thinkingActivity = activity
        } catch {
            print("[LiveActivity] Failed to start thinking: \(error)")
        }
    }

    @available(iOS 16.2, *)
    static func stopThinking() {
        guard let activity = thinkingActivity else { return }
        let finalState = activity.contentState
        Task {
            await activity.end(
                ActivityContent(
                    state: finalState,
                    staleDate: Date().addingTimeInterval(60)
                ),
                dismissalPolicy: .immediate
            )
        }
        thinkingActivity = nil
    }
}
