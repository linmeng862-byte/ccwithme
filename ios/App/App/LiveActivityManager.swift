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

    /// ⚠️ 2026-09-04：**app 重启后要把岛上那张卡认回来。**
    ///
    /// Live Activity 是活在系统里的，app 被划掉它还在（这正是常驻卡想要的效果）。
    /// 但 `thinkingActivity` 是个 static 变量，进程一没就归 nil。下次启动时：
    ///   - `updateThinking` 撞上 `guard let activity` → **直接 return，一帧都推不出去**
    ///   - `startThinking` 看见 nil → 又 request 一张新的
    /// 结果是岛上显示着上一轮那张**冻住的**旧卡，而所有更新都推给了那张看不见的新卡 ——
    /// 表现就是「常驻卡一直在，他回复的时候没有任何变化」（她 09-03/09-04 连报两次）。
    ///
    /// 修法：用之前先去 `Activity.activities` 里认领。多出来的旧卡顺手收掉，
    /// 免得锁屏上堆一摞。
    @available(iOS 16.2, *)
    private static func adoptThinkingActivity() {
        if thinkingActivity != nil { return }
        let live = Activity<ThinkingLiveActivityAttributes>.activities
        guard let keep = live.first else { return }
        thinkingActivity = keep
        for stale in live.dropFirst() {
            Task { await stale.end(nil, dismissalPolicy: .immediate) }
        }
    }

    /// heart == -1 表示「这次别动心率」，沿用卡上已有的值。
    /// 0 才是「没有数据」（那一格不画）。合成一个值的话，每次推姿势都会把心率抹掉。
    @available(iOS 16.2, *)
    static func startThinking(pose: ClawdPose = .idle, detail: String = "", heart: Int = -1) {
        adoptThinkingActivity()
        // 已经有一个在跑就只更新，别重复 request —— 同类型活动叠起来
        // 系统只显示最新那个，旧的会滞留在锁屏上不消失。
        guard thinkingActivity == nil else {
            updateThinking(pose: pose, detail: detail, heart: heart)
            return
        }
        do {
            thinkingActivity = try Activity<ThinkingLiveActivityAttributes>.request(
                attributes: ThinkingLiveActivityAttributes(),
                contentState: .init(pose: pose, detail: detail, heart: max(0, heart)),
                pushType: nil
            )
        } catch {
            print("[LiveActivity] Failed to start thinking: \(error)")
        }
    }

    /// 阶段变化时推一帧。ActivityKit 对更新频率有限流，
    /// 所以调用方要自己去抖（见 index.html 的 _laPush）。
    @available(iOS 16.2, *)
    static func updateThinking(pose: ClawdPose, detail: String, heart: Int = -1) {
        adoptThinkingActivity()
        guard let activity = thinkingActivity else { return }
        let kept = heart < 0 ? activity.contentState.heart : heart
        Task { await activity.update(using: .init(pose: pose, detail: detail, heart: kept)) }
    }

    /// 回完话先让螃蟹笑一下再收掉 —— 直接 .immediate 的话，
    /// 岛上最后一帧停在"在回复…"，看着像卡住了。
    @available(iOS 16.2, *)
    static func stopThinking() {
        adoptThinkingActivity()
        guard let activity = thinkingActivity else { return }
        // 先摘引用：这中间她要是又发一条，startThinking 该新建一个，
        // 不能让它撞上这个正在退场的活动。
        thinkingActivity = nil

        let farewell = ThinkingLiveActivityAttributes.ContentState(pose: .happy, detail: "")
        Task {
            await activity.update(using: farewell)
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            await activity.end(
                ActivityContent(state: farewell, staleDate: nil),
                dismissalPolicy: .immediate
            )
        }
    }
}
