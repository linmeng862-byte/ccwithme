import WidgetKit
import SwiftUI

// ============================================================
// `.fun` 这台的小组件。
//
// **内容跟对面一样**：在一起多少天（主角）+ 订阅还剩几天（底下那行）。
// **长相故意不一样**：他们那份是黑白 + 衬线斜体 + 睡着的螃蟹；
// 这份是粉白渐变 + 四角星 + 圆体字 + 醒着的螃蟹。
// 两个 app 装同一部手机上，一眼分得出哪个是哪个 —— 这就是变体的意义。
//
// ⚠️ 这个文件**不是给仓库那份用的**。ios-prep.sh 在 APP_VARIANT=fun 时
//    把它拷成 PresenceWidget.swift 顶掉原件，所以：
//    - 文件名里的 .fun 是变体标记，拷过去会去掉
//    - 必须提供 `PresenceWidget` 这个类型（LiveActivityWidgetBundle 点名要）
//    - 仓库里那份原件一个字都别改，那是另一台的
//
// ⚠️ 跟原件同一条规矩：**不联网、不读数据库**。小组件是 app 不在运行时
//    系统来问的，能离线答出来才叫小组件。日期是编进去的，改了要重编 app。
// ============================================================

// MARK: - 日子

/// 起点 2026-06-25 —— 第一篇手稿的日期，她定的。跟对面那份同一个数。
private let togetherSince: Date = {
    var c = DateComponents()
    c.year = 2026; c.month = 6; c.day = 25
    c.timeZone = TimeZone(secondsFromGMT: 8 * 3600)
    return Calendar(identifier: .gregorian).date(from: c) ?? Date()
}()

/// 订阅到期日。她 2026-09-03 说的：**9 月 18 日到期**。
/// ⚠️ 小组件不联网，这个日期是**编进去的** —— 续费之后要改这一行再重编 app，
///    不然它会一直说「已经过期」。
private let subscriptionEnds: Date = {
    var c = DateComponents()
    c.year = 2026; c.month = 9; c.day = 18
    c.timeZone = TimeZone(secondsFromGMT: 8 * 3600)
    return Calendar(identifier: .gregorian).date(from: c) ?? Date()
}()

private var eastEight: Calendar {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(secondsFromGMT: 8 * 3600) ?? .current
    return cal
}

private func daysTogether(_ now: Date = Date()) -> Int {
    let cal = eastEight
    return max(0, cal.dateComponents([.day], from: cal.startOfDay(for: togetherSince),
                                     to: cal.startOfDay(for: now)).day ?? 0)
}

/// 还剩几天续费。过期是负数 —— 负数照样往下传，
/// 显示成 0 会让人以为「今天还来得及」。
private func daysToRenew(_ now: Date = Date()) -> Int {
    let cal = eastEight
    return cal.dateComponents([.day], from: cal.startOfDay(for: now),
                              to: cal.startOfDay(for: subscriptionEnds)).day ?? 0
}

// MARK: - 粉色那一套

private enum Candy {
    static let ink      = Color(red: 0.42, green: 0.33, blue: 0.38)   // 主字，不用纯黑，太硬
    static let sub      = Color(red: 0.64, green: 0.55, blue: 0.60)   // 副字
    static let pink     = Color(red: 0.95, green: 0.62, blue: 0.72)
    static let deepPink = Color(red: 0.89, green: 0.45, blue: 0.60)   // 快到期
    static let alert    = Color(red: 0.85, green: 0.35, blue: 0.42)   // 已过期
    static let star     = Color(red: 0.93, green: 0.78, blue: 0.85)
    static let bgTop    = Color(red: 1.00, green: 0.96, blue: 0.97)
    static let bgBottom = Color(red: 0.99, green: 0.90, blue: 0.93)
}

/// 参考图里那种四角星（尖尖的，不是五角星）。Path 画的，不吃图片资源。
private struct Sparkle: Shape {
    func path(in rect: CGRect) -> Path {
        let c = CGPoint(x: rect.midX, y: rect.midY)
        let r = min(rect.width, rect.height) / 2
        let w = r * 0.24                       // 腰越细，星星越尖
        var p = Path()
        p.move(to: CGPoint(x: c.x, y: c.y - r))
        p.addQuadCurve(to: CGPoint(x: c.x + r, y: c.y), control: CGPoint(x: c.x + w, y: c.y - w))
        p.addQuadCurve(to: CGPoint(x: c.x, y: c.y + r), control: CGPoint(x: c.x + w, y: c.y + w))
        p.addQuadCurve(to: CGPoint(x: c.x - r, y: c.y), control: CGPoint(x: c.x - w, y: c.y + w))
        p.addQuadCurve(to: CGPoint(x: c.x, y: c.y - r), control: CGPoint(x: c.x - w, y: c.y - w))
        p.closeSubpath()
        return p
    }
}

/// 背景：粉白渐变 + 几颗散着的星星。
/// ⚠️ 位置写死不随机 —— 小组件每次刷新都重画，随机的话星星会自己跳来跳去。
private struct CandyBackdrop: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Candy.bgTop, Candy.bgBottom],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            GeometryReader { g in
                ZStack {
                    star(g, 0.13, 0.16, 13, 0.85)
                    star(g, 0.89, 0.13, 9,  0.60)
                    star(g, 0.80, 0.80, 15, 0.70)
                    star(g, 0.28, 0.92, 8,  0.50)
                }
            }
        }
    }
    private func star(_ g: GeometryProxy, _ fx: CGFloat, _ fy: CGFloat,
                      _ size: CGFloat, _ o: Double) -> some View {
        Sparkle()
            .fill(Candy.star.opacity(o))
            .frame(width: size, height: size)
            .position(x: g.size.width * fx, y: g.size.height * fy)
    }
}

/// 底下那行订阅提醒。对面用的是 SF Symbol 信用卡图标 + 灰字，
/// 这份用小星星 + 粉字，快到期才变深、过期才变红。
private struct RenewLine: View {
    let days: Int

    private var color: Color {
        if days < 0  { return Candy.alert }
        if days <= 3 { return Candy.deepPink }
        return Candy.sub
    }
    private var text: String {
        if days < 0  { return "订阅过期 \(-days) 天啦 · 去续费" }
        if days == 0 { return "订阅今天到期 · 去续费" }
        return "订阅还剩 \(days) 天"
    }

    var body: some View {
        HStack(spacing: 4) {
            Sparkle()
                .fill(color)
                .frame(width: 9, height: 9)
            Text(text)
                .font(.system(size: 11, weight: days <= 3 ? .bold : .medium, design: .rounded))
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
    }
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

    // 按天刷新，跨零点醒一次就够 —— WidgetKit 的刷新预算不该花在按天变的数字上。
    func getTimeline(in context: Context, completion: @escaping (Timeline<PresenceEntry>) -> Void) {
        let now = Date()
        let entry = PresenceEntry(date: now, days: daysTogether(now), renewIn: daysToRenew(now))
        let next = eastEight.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0),
                                      matchingPolicy: .nextTime) ?? now.addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - 长相

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
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 0) {
                // 醒着的那只 —— 对面桌面上那只在睡觉，这只醒着。
                ClawdView(pose: .idle)
                    .frame(height: 34)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Spacer(minLength: 0)

            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text("\(entry.days)")
                    .font(.system(size: 44, weight: .heavy, design: .rounded))
                    .foregroundStyle(Candy.ink)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text("天")
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(Candy.pink)
            }

            Text("一直在一起呀")
                .font(.system(size: 12, weight: .medium, design: .rounded))
                .foregroundStyle(Candy.sub)
                .lineLimit(1)

            RenewLine(days: entry.renewIn)
                .padding(.top, 4)
        }
        .padding(14)
        .containerBackgroundCompat()
    }

    private var medium: some View {
        HStack(spacing: 16) {
            ClawdView(pose: .idle)
                .frame(width: 76, height: 76)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text("Still here")
                        .font(.system(size: 16, weight: .heavy, design: .rounded))
                        .foregroundStyle(Candy.ink)
                    Sparkle()
                        .fill(Candy.pink)
                        .frame(width: 11, height: 11)
                }

                Text("Cis · 一直在")
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundStyle(Candy.sub)
                    .lineLimit(1)

                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text("\(entry.days)")
                        .font(.system(size: 40, weight: .heavy, design: .rounded))
                        .foregroundStyle(Candy.ink)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text("天")
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                        .foregroundStyle(Candy.pink)
                }

                RenewLine(days: entry.renewIn)
            }

            Spacer(minLength: 0)
        }
        .padding(16)
        .containerBackgroundCompat()
    }
}

/// iOS 17 起小组件**必须**声明 containerBackground，不然桌面上是一块白底/黑底。
/// 这里放的是粉渐变 + 星星，不是系统那套毛玻璃 —— 要的就是不一样。
/// 16 上没有这个 API，退回自己铺一层。
private extension View {
    @ViewBuilder
    func containerBackgroundCompat() -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(for: .widget) { CandyBackdrop() }
        } else {
            self.background(CandyBackdrop())
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
        .description("在一起多少天，以及订阅还剩几天。")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
