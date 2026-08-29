import ActivityKit
import WidgetKit
import SwiftUI

// 小克在回复时的实时活动。灵动岛里显示像素螃蟹 Clawd，姿势跟着阶段走。
//
// ⚠️ 别在这里写 .repeatForever 那种自循环动画 —— WidgetKit 会掐掉，
//    真机上要么不动要么闪。会动的只有两样：ContentState 更新推过来的帧，
//    和系统内置的 Text(timerInterval:)。所以这里的"动"= 换姿势，不是逐帧。
//
// 标题不走网络传，由 pose 推导（ClawdPose.label）—— 两端各算一份的话，
// 迟早出现「螃蟹在想、字写着在回复」。

// MARK: - Widget Configuration

struct ThinkingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ThinkingLiveActivityAttributes.self) { context in
            ThinkingLockScreenView(context: context)
        } dynamicIsland: { context in
            let pose = context.state.clawdPose

            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    // 给足高度：thinking / streaming 的装饰（思考泡、笔记本）往上长到
                    // y=-7，方格是 16 宽 22 高。塞进 52x52 的话按高缩放，螃蟹本体只剩
                    // 三分之一，糊成一团。竖着给到 64 才看得出是只螃蟹。
                    ClawdView(pose: pose)
                        .frame(width: 48, height: 64)
                        .padding(.leading, 4)
                }
                // 不声明 .trailing / .bottom：文字全放 center，
                // 44pt 宽的 trailing 会把中文截断。没声明的区域就不存在。
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(pose.label)
                            .font(.system(size: 15, weight: .semibold))
                            .lineLimit(1)
                        if !context.state.detail.isEmpty {
                            Text(context.state.detail)
                                .font(.system(size: 12))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .truncationMode(.middle)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                // compact 区域只有 ~30pt 宽，装饰画上去糊成一团，只要本体。
                // 四个姿势的本体长得一样，所以这里靠 compactTrailing 的字区分状态 ——
                // 螃蟹在这个尺寸下负责的是"是谁"，不是"在干嘛"。
                ClawdView(pose: pose, bodyOnly: true)
                    .frame(width: 26, height: 17)
            } compactTrailing: {
                Text(pose.label)
                    .font(.system(size: 13, weight: .medium))
                    .lineLimit(1)
            } minimal: {
                ClawdView(pose: pose, bodyOnly: true)
                    .frame(width: 20, height: 13)
            }
        }
    }
}

// MARK: - Lock Screen View

struct ThinkingLockScreenView: View {
    let context: ActivityViewContext<ThinkingLiveActivityAttributes>

    var body: some View {
        HStack(spacing: 14) {
            ClawdView(pose: context.state.clawdPose)
                .frame(width: 56, height: 56)

            VStack(alignment: .leading, spacing: 4) {
                Text(context.state.clawdPose.label)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                if !context.state.detail.isEmpty {
                    Text(context.state.detail)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }

            Spacer(minLength: 0)
        }
        .padding()
    }
}
