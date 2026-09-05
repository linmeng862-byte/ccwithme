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
//
// 2026-09-05：她说「看见在想的了，但那个螃蟹不会动」。
// 上面那条限制就是答案 —— 岛上做不出网页那只的 15 帧 sprite，一帧都做不出。
// 能做的是让**换姿势那一下**有动静：给 ClawdView 挂 .id(pose) + 转场，
// 系统在两次更新之间就会自己补一段过渡，而不是硬切一张死图。
// 转场只用 Apple 在实时活动里明确支持的那几种（scale / opacity / numericText），
// 别换成 slide 之类没写在支持列表里的 —— 真机上会直接不动。

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
                        // 换姿势 = 换一个身份，系统才肯补过渡。缩着淡进比纯淡入更像"动"。
                        .id(pose)
                        .transition(.scale(scale: 0.86).combined(with: .opacity))
                        .animation(.spring(response: 0.4, dampingFraction: 0.65), value: pose)
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
                    .id(pose)
                    .transition(.scale(scale: 0.86).combined(with: .opacity))
                    .animation(.spring(response: 0.4, dampingFraction: 0.65), value: pose)
            } compactTrailing: {
                // 有心率就显示心率（照她要的那个样子：数字 + ♥），没有才退回状态字。
                // 收起态就那么点宽，「正在回复你…」四个字以上必被截断，
                // 而心率是两三位数 + 一个图标，永远放得下。
                if context.state.heart > 0 {
                    HStack(spacing: 3) {
                        Text("\(context.state.heart)")
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                            // 心率变了数字自己滚过去，别硬跳 —— 这是收起态唯一会动的东西。
                            .contentTransition(.numericText())
                            .animation(.default, value: context.state.heart)
                        Image(systemName: "heart.fill")
                            .font(.system(size: 10))
                    }
                } else {
                    Text(pose.label)
                        .font(.system(size: 13, weight: .medium))
                        .lineLimit(1)
                }
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
                .id(context.state.clawdPose)
                .transition(.scale(scale: 0.86).combined(with: .opacity))
                .animation(.spring(response: 0.4, dampingFraction: 0.65), value: context.state.clawdPose)

            VStack(alignment: .leading, spacing: 2) {
                // 常驻卡：标题是固定的那句「他还在」，状态那行才跟着 pose 变。
                // 大部分时间这张卡停在 idle —— 标题写「等待任务」像个待办应用，
                // 写 Still here 才是她要的那句话。
                Text("Still here")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Text("Cis · ONLINE")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
                    .tracking(0.8)
                    .lineLimit(1)

                Text(context.state.detail.isEmpty ? context.state.clawdPose.label : context.state.detail)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            Spacer(minLength: 0)

            PulseBadge(heart: context.state.heart)
        }
        .padding()
    }
}

// MARK: - 心率那一格

/// 卡右边那格：数字 + ♥ + PULSE。
/// ⚠️ 没有数据（heart == 0）就**整格不画** —— 画一个「--」比空着更吵，
///    而且会让人以为手表坏了。数据来自手表推上来的 her_vitals。
struct PulseBadge: View {
    let heart: Int

    var body: some View {
        if heart > 0 {
            HStack(spacing: 6) {
                Text("\(heart)")
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundStyle(.primary)
                    .contentTransition(.numericText())
                    .animation(.default, value: heart)
                VStack(spacing: 1) {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 15))
                    Text("PULSE")
                        .font(.system(size: 8, weight: .semibold))
                        .tracking(1.0)
                }
                .foregroundStyle(.primary)
            }
        }
    }
}
