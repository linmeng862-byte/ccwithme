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
                    HStack(spacing: 6) {
                        Image(systemName: "timer")
                            .font(.system(size: 14, weight: .medium))
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
                Image(systemName: "timer")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(context.state.isOvertimed ? Color.red : Color.orange)
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
        HStack(spacing: 16) {
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
