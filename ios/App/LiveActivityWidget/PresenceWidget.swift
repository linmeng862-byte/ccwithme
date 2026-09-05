import WidgetKit
import SwiftUI

// 桌面/锁屏小组件：睡着的螃蟹 + 在一起多少天。
//
// ⚠️ 这跟 Live Activity 是**两套东西**，别想着复用：
//    Live Activity 是「现在正在发生的事」，由 app 推帧；
//    小组件是「一直在那儿的事」，由系统按时间线来问你要内容，
//    app 根本不在运行也得答得出来。所以这里**不联网、不读数据库** ——
//    天数是纯算的，离线、飞行模式、app 划掉都照样对。
//
// 刷新：一天一次（跨零点）。WidgetKit 对刷新次数有预算，
// 为一个按天变的数字每小时醒一次纯属浪费。

// MARK: - 起点

/// 2026-06-25 —— 第一篇手稿的日期，她定的。
/// 想改就改这儿一行；日期用东八区，不然跨零点会差一天。
private let togetherSince: Date = {
    var c = DateComponents()
    c.year = 2026; c.month = 6; c.day = 25
    c.timeZone = TimeZone(secondsFromGMT: 8 * 3600)
    return Calendar(identifier: .gregorian).date(from: c) ?? Date()
}()

/// 订阅到期日 —— **2026-09-20**，她 2026-09-05 给的真日期（之前是占位值 09-21）。
/// ⚠️ 每次续费都得改这里再重编一次 app —— 小组件不联网，日期是编进去的。
///    正解是从服务器读（`/api/presence` 里加 renewIn，取不到退回这个常量），还没做。
private let subscriptionEnds: Date = {
    var c = DateComponents()
    c.year = 2026; c.month = 9; c.day = 20
    c.timeZone = TimeZone(secondsFromGMT: 8 * 3600)
    return Calendar(identifier: .gregorian).date(from: c) ?? Date()
}()

/// 还剩几天续费。已经过期就是负数 —— 负数照样显示，
/// 显示成 0 会让人以为"今天还来得及"。
private func daysToRenew(_ now: Date = Date()) -> Int {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(secondsFromGMT: 8 * 3600) ?? .current
    return cal.dateComponents([.day], from: cal.startOfDay(for: now),
                              to: cal.startOfDay(for: subscriptionEnds)).day ?? 0
}

private func daysTogether(_ now: Date = Date()) -> Int {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(secondsFromGMT: 8 * 3600) ?? .current
    let a = cal.startOfDay(for: togetherSince)
    let b = cal.startOfDay(for: now)
    return max(0, cal.dateComponents([.day], from: a, to: b).day ?? 0)
}

// MARK: - Timeline

struct PresenceEntry: TimelineEntry {
    let date: Date
    let days: Int
    let renewIn: Int
}

struct PresenceProvider: TimelineProvider {
    func placeholder(in context: Context) -> PresenceEntry {
        PresenceEntry(date: Date(), days: daysTogether(), renewIn: daysToRenew())
    }

    func getSnapshot(in context: Context, completion: @escaping (PresenceEntry) -> Void) {
        completion(PresenceEntry(date: Date(), days: daysTogether(), renewIn: daysToRenew()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PresenceEntry>) -> Void) {
        let now = Date()
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(secondsFromGMT: 8 * 3600) ?? .current
        // 下一个零点再来问一次。算不出来（理论上不会）就退回一小时后，
        // 宁可多醒一次，也不要卡在一个永远不刷新的时间线上。
        let next = cal.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0),
                                matchingPolicy: .nextTime) ?? now.addingTimeInterval(3600)
        completion(Timeline(entries: [PresenceEntry(date: now, days: daysTogether(now), renewIn: daysToRenew(now))],
                            policy: .after(next)))
    }
}

// MARK: - View

struct PresenceWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PresenceEntry

    var body: some View {
        switch family {
        case .systemMedium: medium
        default:            small
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 6) {
            ClawdView(pose: .doze)
                .frame(height: 42)
                .frame(maxWidth: .infinity, alignment: .leading)

            Spacer(minLength: 0)

            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text("\(entry.days)")
                    .font(.system(size: 44, weight: .bold, design: .rounded))
                Text("DAYS")
                    .font(.system(size: 12, weight: .semibold))
                    .tracking(1.2)
                    .foregroundStyle(.secondary)
            }
            Text("Time, gently kept.")
                .font(.system(size: 12, design: .serif))
                .italic()
                .foregroundStyle(.secondary)
                .lineLimit(1)

            RenewLine(days: entry.renewIn)
                .padding(.top, 2)
        }
        .padding(14)
        .containerBackgroundCompat()
    }

    private var medium: some View {
        // ⚠️ 整体垂直居中。第一版是顶对齐，中尺寸那张卡下面空出一大块，
        //    看着像没画完。字号也是照她要的往上提了一档。
        VStack(alignment: .leading, spacing: 10) {
            // ⚠️ 螃蟹和右边那栏之间要留够 —— 她说「字离螃蟹远一点」。
            //    像素画本身没有留白，贴太近会像糊在一起。
            HStack(spacing: 28) {
                ClawdView(pose: .doze)
                    .frame(width: 104, height: 68)

                VStack(alignment: .leading, spacing: 5) {
                    Text("Still here")
                        .font(.system(size: 21, weight: .semibold))
                    Text("Cis · NEAR, ALWAYS.")
                        .font(.system(size: 12, weight: .medium))
                        .tracking(0.8)
                        .foregroundStyle(.secondary)
                    HStack(alignment: .firstTextBaseline, spacing: 5) {
                        Text("\(entry.days)")
                            .font(.system(size: 42, weight: .bold, design: .rounded))
                        Text("DAYS")
                            .font(.system(size: 13, weight: .semibold))
                            .tracking(1.2)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
            }

            RenewLine(days: entry.renewIn)
        }
        .frame(maxHeight: .infinity)
        .padding(18)
        .containerBackgroundCompat()
    }
}

/// 最下面那行：订阅还剩几天。
/// ⚠️ 3 天内或已过期就变橙色 —— 平时它只是一行灰字，别喧宾夺主；
///    真到该续费了才跳出来。这一格的意义是"提醒"，不是"记账"。
struct RenewLine: View {
    let days: Int

    private var urgent: Bool { days <= 3 }

    private var text: String {
        if days < 0  { return "订阅已过期 \(-days) 天 · 去续费" }
        if days == 0 { return "订阅今天到期 · 去续费" }
        return "订阅还剩 \(days) 天"
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: urgent ? "exclamationmark.circle.fill" : "creditcard")
                .font(.system(size: 10))
            Text(text)
                .font(.system(size: 11, weight: urgent ? .semibold : .regular))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .foregroundStyle(urgent ? Color.orange : Color.secondary)
    }
}

/// iOS 17 起小组件**必须**声明 containerBackground，不然桌面上是一块白底/黑底，
/// 跟系统那套毛玻璃格格不入。16 上没有这个 API，所以要分版本。
private extension View {
    @ViewBuilder
    func containerBackgroundCompat() -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(.fill.tertiary, for: .widget)
        } else {
            self
        }
    }
}

// MARK: - Widget

struct PresenceWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PresenceWidget", provider: PresenceProvider()) { entry in
            PresenceWidgetView(entry: entry)
        }
        .configurationDisplayName("Still here")
        .description("他在你桌面上睡着，和你们在一起的天数。")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
