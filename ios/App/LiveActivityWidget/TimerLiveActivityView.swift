import ActivityKit
import WidgetKit
import SwiftUI

// MARK: - Widget Configuration

struct TimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TimerLiveActivityAttributes.self) { context in
            TimerLockScreenView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    // 小螃蟹陪着计时 —— 这儿原来只是一个 timer 图标。
                    // 高度给够：装饰会往上长，压太扁螃蟹会缩成一团、看不出是谁。
                    HStack(spacing: 6) {
                        ClawdView(pose: .idle)
                            .frame(width: 30, height: 40)
                        Text(context.state.title)
                            .font(.system(size: 14, weight: .medium))
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(formatTime(context.state.remainingSeconds, overtimed: context.state.isOvertimed))
                        .font(.system(size: 28, weight: .bold, design: .monospaced))
                        .foregroundStyle(context.state.isOvertimed ? Color.red : Color.primary)
                }
                DynamicIslandExpandedRegion(.center) {
                    TimerProgressRing(
                        remaining: context.state.remainingSeconds,
                        total: context.state.totalSeconds,
                        isOvertimed: context.state.isOvertimed
                    )
                    .frame(width: 56, height: 56)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text("左滑完成")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text("长按取消")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            } compactLeading: {
                // 收起态只有 ~30pt 宽，装饰画上去糊成一团，只要本体。
                // 螃蟹在这个尺寸下负责的是「是谁」，超时与否由右边那个数字的颜色说。
                ClawdView(pose: .idle, bodyOnly: true)
                    .frame(width: 26, height: 17)
            } compactTrailing: {
                Text(formatShortTime(context.state.remainingSeconds, overtimed: context.state.isOvertimed))
                    .font(.system(size: 14, weight: .bold, design: .monospaced))
                    .foregroundStyle(context.state.isOvertimed ? Color.red : Color.primary)
            } minimal: {
                Image(systemName: "timer")
                    .foregroundStyle(context.state.isOvertimed ? Color.red : Color.orange)
            }
        }
    }
}

// MARK: - Lock Screen View

struct TimerLockScreenView: View {
    let context: ActivityViewContext<TimerLiveActivityAttributes>

    var body: some View {
        HStack(spacing: 14) {
            // 锁屏那张卡片也让他在：螃蟹 → 进度环 → 时间
            ClawdView(pose: .idle)
                .frame(width: 42, height: 56)

            TimerProgressRing(
                remaining: context.state.remainingSeconds,
                total: context.state.totalSeconds,
                isOvertimed: context.state.isOvertimed
            )
            .frame(width: 56, height: 56)

            VStack(alignment: .leading, spacing: 4) {
                Text(context.state.title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                Text(formatTime(context.state.remainingSeconds, overtimed: context.state.isOvertimed))
                    .font(.system(size: 32, weight: .bold, design: .monospaced))
                    .foregroundStyle(context.state.isOvertimed ? Color.red : Color.primary)
                Text(context.state.isOvertimed ? "超时" : "剩余")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }
}

// MARK: - Progress Ring

struct TimerProgressRing: View {
    let remaining: Int
    let total: Int
    let isOvertimed: Bool

    var body: some View {
        let progress = total > 0
            ? min(1.0, max(0.0, Double(total - max(0, remaining)) / Double(total)))
            : 0.0

        ZStack {
            Circle()
                .stroke(Color.primary.opacity(0.1), lineWidth: 3)

            Circle()
                .trim(from: 0, to: isOvertimed ? 1.0 : progress)
                .stroke(
                    isOvertimed ? Color.red : Color.orange,
                    style: StrokeStyle(lineWidth: 3, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .animation(.linear(duration: 1), value: progress)
        }
    }
}

// MARK: - Formatters

func formatTime(_ seconds: Int, overtimed: Bool) -> String {
    let display = abs(seconds)
    let mins = display / 60
    let secs = display % 60
    return "\(overtimed ? "+" : "")\(String(format: "%02d:%02d", mins, secs))"
}

func formatShortTime(_ seconds: Int, overtimed: Bool) -> String {
    let display = abs(seconds)
    let mins = display / 60
    let secs = display % 60
    if mins > 0 {
        return "\(overtimed ? "+" : "")\(mins)m"
    } else {
        return "\(overtimed ? "+" : "")\(secs)s"
    }
}
