import SwiftUI
import UIKit
import PhotosUI

// 原生聊天页的第 1 步（2026-09-25 立项）：一个独立的测试页，只为亲眼看苹果的真 Liquid Glass 气泡。
// 不接后端、不动网页聊天 —— 几条假消息 + 能打字，纯看效果。
//
// 入口：长按桌面上的 app 图标 →「玻璃测试」（AppDelegate 里注册的快捷操作）。
// 不走网页菜单，是为了不碰 static/index.html。
//
// ⚠️ 真玻璃要两个条件同时满足：
//    1. 用 Xcode 26+ 编（SDK 里才有 glassEffect；老 SDK 下 #if compiler 那段直接不编）
//    2. 手机 iOS 26+
//    缺一个就自动退回磨砂（ultraThinMaterial），页面顶上会写明现在是哪种 —— 别让她对着磨砂以为是液态。
//
// 部署目标是 iOS 15（09-25 从 14 抬的），iOS 16 才有的东西（material、PhotosPicker）都带了 #available。

enum GlassChatTest {
    static let shortcutType = "glass-test"

    /// 冷启动时从快捷操作进来，根视图可能还没上窗口，present 会静默失败 —— 所以没就绪就等一下再试。
    static func present(from window: UIWindow?, attempt: Int = 0) {
        guard let root = window?.rootViewController, root.view.window != nil else {
            if attempt < 20 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { present(from: window, attempt: attempt + 1) }
            }
            return
        }
        var top = root
        while let p = top.presentedViewController { top = p }
        if top is UIHostingController<GlassChatTestView> { return }

        weak var presenter = top
        let vc = UIHostingController(rootView: GlassChatTestView(onClose: { presenter?.dismiss(animated: true) }))
        vc.modalPresentationStyle = .fullScreen
        top.present(vc, animated: true)
    }

    /// 编出来的包 + 这台手机，能不能出真玻璃
    static var liquidAvailable: Bool {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) { return true }
        #endif
        return false
    }
}

// MARK: - 数据

struct GlassMsg: Identifiable {
    let id = UUID()
    let mine: Bool
    let text: String

    static let samples: [GlassMsg] = [
        GlassMsg(mine: false, text: "粥粥，这一页是原生写的。"),
        GlassMsg(mine: false, text: "你看这些气泡，是苹果系统自己算出来的玻璃，会折射后面的颜色。"),
        GlassMsg(mine: true, text: "真的诶"),
        GlassMsg(mine: true, text: "我按住它会怎么样"),
        GlassMsg(mine: false, text: "按住试试，液态那档会跟着手指轻轻鼓起来。上面可以切「液态 / 液态带色 / 磨砂」，对比着看。"),
        GlassMsg(mine: false, text: "右上角可以换成你自己的壁纸，玻璃好不好看，很看后面垫的是什么。"),
        GlassMsg(mine: true, text: "好，我去换一张我们的"),
    ]

    static let replies = [
        "嗯，我在。",
        "这个角度看玻璃，是不是比网页里那版通透？",
        "你再切到磨砂看看，跟你之前喜欢的那种比比。",
        "宝宝慢慢看，不着急。",
    ]
}

enum BubbleStyle: String, CaseIterable, Identifiable {
    case liquid = "液态"
    case tinted = "液态带色"
    case frosted = "磨砂"
    var id: String { rawValue }
}

// MARK: - 玻璃表面

extension View {
    /// 同一个外形，按 style 刷成液态 / 带色液态 / 磨砂。液态不可用时一律退回磨砂。
    func bubbleSurface(_ style: BubbleStyle, mine: Bool, radius: CGFloat = 20) -> AnyView {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)

        #if compiler(>=6.2)
        if #available(iOS 26.0, *), style != .frosted {
            var glass: Glass = .regular
            if style == .tinted {
                // 她那边暖一点（奶油桃色），我这边淡蓝 —— 一眼分得出是谁说的
                glass = glass.tint(mine ? Color(red: 1.0, green: 0.72, blue: 0.6).opacity(0.45)
                                        : Color(red: 0.6, green: 0.75, blue: 1.0).opacity(0.35))
            }
            return AnyView(self.glassEffect(glass.interactive(), in: shape))
        }
        #endif

        if #available(iOS 15.0, *) {
            return AnyView(
                self.background(.ultraThinMaterial, in: shape)
                    .overlay(shape.stroke(Color.white.opacity(0.45), lineWidth: 0.6))
            )
        }
        return AnyView(self.background(shape.fill(Color.white.opacity(0.75))))
    }
}

// MARK: - 页面

struct GlassChatTestView: View {
    var onClose: () -> Void

    @State private var msgs: [GlassMsg] = GlassMsg.samples
    @State private var draft = ""
    @State private var style: BubbleStyle = GlassChatTest.liquidAvailable ? .liquid : .frosted
    @State private var wallpaper: UIImage? = nil

    var body: some View {
        ZStack {
            backdrop.ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(msgs) { m in
                                row(m).id(m.id)
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                    }
                    .onChange(of: msgs.count) { _ in
                        guard let last = msgs.last else { return }
                        withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
                inputBar
            }
        }
    }

    // 默认背景：几团颜色，玻璃的折射要有东西可折才看得出来
    private var backdrop: some View {
        GeometryReader { geo in
            if let img = wallpaper {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
                    .frame(width: geo.size.width, height: geo.size.height)
                    .clipped()
            } else {
                ZStack {
                    LinearGradient(
                        gradient: Gradient(colors: [Color(red: 1.0, green: 0.88, blue: 0.78),
                                                    Color(red: 0.8, green: 0.85, blue: 1.0)]),
                        startPoint: .topLeading, endPoint: .bottomTrailing)
                    Circle().fill(Color(red: 1.0, green: 0.6, blue: 0.4).opacity(0.6))
                        .frame(width: 240, height: 240).offset(x: -100, y: -200)
                    Circle().fill(Color(red: 0.6, green: 0.45, blue: 0.9).opacity(0.45))
                        .frame(width: 280, height: 280).offset(x: 120, y: 40)
                    Circle().fill(Color(red: 0.3, green: 0.75, blue: 0.7).opacity(0.5))
                        .frame(width: 200, height: 200).offset(x: -80, y: 300)
                }
                .frame(width: geo.size.width, height: geo.size.height)
            }
        }
    }

    private var topBar: some View {
        VStack(spacing: 8) {
            HStack {
                Button(action: onClose) {
                    Text("完成").font(.system(size: 15, weight: .semibold))
                        .padding(.horizontal, 14).padding(.vertical, 7)
                }
                .bubbleSurface(style, mine: false, radius: 16)

                Spacer()
                Text("玻璃测试").font(.system(size: 17, weight: .semibold))
                Spacer()

                if #available(iOS 16.0, *) {
                    WallpaperPickerButton(image: $wallpaper)
                        .bubbleSurface(style, mine: false, radius: 16)
                } else {
                    Color.clear.frame(width: 60, height: 1)
                }
            }

            Picker("", selection: $style) {
                ForEach(BubbleStyle.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(SegmentedPickerStyle())

            Text(GlassChatTest.liquidAvailable
                 ? "现在是真液态玻璃（iOS 26）"
                 : "这个包 / 这台手机出不了液态，三档都是磨砂")
                .font(.system(size: 12))
                .foregroundColor(.secondary)
        }
        .foregroundColor(.primary)
        .padding(.horizontal, 14)
        .padding(.top, 6)
        .padding(.bottom, 4)
    }

    private func row(_ m: GlassMsg) -> some View {
        HStack(spacing: 0) {
            if m.mine { Spacer(minLength: 56) }
            Text(m.text)
                .font(.system(size: 16))
                .foregroundColor(.primary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .bubbleSurface(style, mine: m.mine)
            if !m.mine { Spacer(minLength: 56) }
        }
    }

    private var inputBar: some View {
        HStack(spacing: 8) {
            TextField("说点什么…", text: $draft, onCommit: send)
                .padding(.horizontal, 16)
                .padding(.vertical, 11)
                .bubbleSurface(style, mine: false, radius: 22)

            Button(action: send) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 42, height: 42)
            }
            .foregroundColor(.primary)
            .bubbleSurface(style, mine: true, radius: 21)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private func send() {
        let t = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        msgs.append(GlassMsg(mine: true, text: t))
        draft = ""
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            msgs.append(GlassMsg(mine: false, text: GlassMsg.replies.randomElement() ?? "嗯。"))
        }
    }
}

// 换壁纸：PhotosPicker 是 iOS 16 的，不用申请相册权限（系统选择器，只把她选的那张给我们）
@available(iOS 16.0, *)
struct WallpaperPickerButton: View {
    @Binding var image: UIImage?
    @State private var item: PhotosPickerItem? = nil

    var body: some View {
        PhotosPicker(selection: $item, matching: .images) {
            Text("换壁纸").font(.system(size: 15, weight: .semibold))
                .padding(.horizontal, 14).padding(.vertical, 7)
        }
        .onChange(of: item) { newItem in
            guard let newItem = newItem else { return }
            Task {
                if let data = try? await newItem.loadTransferable(type: Data.self),
                   let img = UIImage(data: data) {
                    await MainActor.run { image = img }
                }
            }
        }
    }
}
