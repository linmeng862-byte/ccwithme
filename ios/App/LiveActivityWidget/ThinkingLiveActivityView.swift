import ActivityKit
import WidgetKit
import SwiftUI

// MARK: - Widget Configuration

struct ThinkingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ThinkingLiveActivityAttributes.self) { context in
            ThinkingLockScreenView(context: context)
        } dynamicIsland: { _ in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {}
                DynamicIslandExpandedRegion(.trailing) {}
                DynamicIslandExpandedRegion(.center) {}
                DynamicIslandExpandedRegion(.bottom) {}
            } compactLeading: {
                EmptyView()
            } compactTrailing: {
                EmptyView()
            } minimal: {
                EmptyView()
            }
        }
    }
}

// MARK: - Lock Screen View

struct ThinkingLockScreenView: View {
    let context: ActivityViewContext<ThinkingLiveActivityAttributes>

    @State private var pulse = false

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(Color.purple)
                .frame(width: 12, height: 12)
                .scaleEffect(pulse ? 1.3 : 0.8)
                .opacity(pulse ? 0.6 : 1.0)
                .animation(
                    .easeInOut(duration: 0.8).repeatForever(autoreverses: true),
                    value: pulse
                )

            Text(context.state.label)
                .font(.headline)
                .foregroundStyle(.primary)

            Spacer()

            HStack(spacing: 3) {
                ForEach(0..<3) { i in
                    Circle()
                        .fill(Color.purple.opacity(0.5))
                        .frame(width: 5, height: 5)
                        .scaleEffect(pulse ? 1.0 : 0.3)
                        .animation(
                            .easeInOut(duration: 0.6)
                                .repeatForever(autoreverses: true)
                                .delay(Double(i) * 0.2),
                            value: pulse
                        )
                }
            }
        }
        .padding()
        .onAppear { pulse = true }
    }
}
