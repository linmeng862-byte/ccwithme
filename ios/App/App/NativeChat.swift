import SwiftUI
import UIKit
import WebKit
import Capacitor

// 原生聊天页第 2 步（2026-09-25）：接真数据 —— 读主线最近 50 条、发消息、流式出字。
// 气泡用苹果真 Liquid Glass（她选的「液态」；表面样式复用 GlassChatTest.swift 里的 bubbleSurface）。
//
// 入口：长按桌面图标 →「原生聊天」。网页聊天一个字没动，关掉这页回去就是原来那个。
//
// 身份和会话**全部从网页那边借**（WKWebView 里的 state / localStorage）：token、当前会话、
// 模型、effort、extended —— 跟网页发出去的请求体一模一样。
// ⚠️ 别在这边另存一份 model/effort，更别补默认值：两边传得不一样，网关会以为她换了模型，
//    放掉常驻进程重开 = 整窗冷写（backend.js 的 _stickyChoice 那段注释，09-11 的 $0.3 × 6）。
//
// 这一步只认文字。语音 / 图片 / 卡片这些先显示成「[语音]」「[图片]」占位，第 3 步逐个搬。
//
// 背景：**就是网页聊天页那张**（她自己传的 chat_wallpaper，或主题自带图如小狗绘本），规则抄 index.html
// 的 _applyChatWall —— 她要的就是「自定义背景下的原生气泡」，所以这边不另设壁纸，网页换了这边跟着换。

@MainActor
enum NativeChat {
    static let shortcutType = "native-chat"

    static func present(from window: UIWindow?, attempt: Int = 0) {
        guard let root = window?.rootViewController, root.view.window != nil else {
            if attempt < 20 {
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 300_000_000)
                    present(from: window, attempt: attempt + 1)
                }
            }
            return
        }
        var top = root
        while let p = top.presentedViewController { top = p }
        if top is UIHostingController<NativeChatView> { return }

        let web = (root as? CAPBridgeViewController)?.webView
        let model = NativeChatModel(webView: web)
        weak var presenter = top
        let vc = UIHostingController(rootView: NativeChatView(model: model, onClose: {
            model.close()
            presenter?.dismiss(animated: true)
        }))
        vc.modalPresentationStyle = .fullScreen
        top.present(vc, animated: true)
    }
}

// MARK: - 数据

struct NMsg: Identifiable, Equatable {
    let id: String
    let mine: Bool
    let text: String
}

/// 从网页借来的那一套。字段跟 index.html 里 chatBody 那一行一一对应。
struct NCreds {
    let base: String
    let token: String
    let convId: String
    let model: String
    let effort: String
    let extended: Bool
    let projectId: String
    let readingBookId: String
}

@MainActor
final class NativeChatModel: ObservableObject {
    @Published var msgs: [NMsg] = []
    @Published var liveText: String? = nil     // 他正在说的这一条（未分段的原文）；nil = 没在说
    @Published var status: String = ""         // 「在想…」「在用 xx…」
    @Published var errorText: String = ""
    @Published var loading = true
    @Published var wallpaper: UIImage? = nil
    @Published var wallVeil = false            // 主题图上那层奶白柔纱（网页是 rgba(255,253,249,.4)）

    private weak var webView: WKWebView?
    private var creds: NCreds? = nil
    private var streamTask: Task<Void, Never>? = nil

    init(webView: WKWebView?) {
        self.webView = webView
        Task { await self.start() }
    }

    var busy: Bool { liveText != nil }

    // MARK: 借身份

    // 网页顶层的 `const state` 是全局词法绑定，evaluateJavaScript 在全局作用域里跑，读得到。
    // 读不到（页面还没加载完）就退回 localStorage，最后的地址兜底跟 index.html 的 _API_BASE 同一个。
    private static let credsJS = """
    (function(){
      var st = (typeof state !== 'undefined') ? state : null;
      var ms = {}; try { ms = st ? st.settings : JSON.parse(localStorage.getItem('chat_model_settings') || '{}'); } catch (e) {}
      var m = (st && st.model) || localStorage.getItem('chat_model') || 'claude-sonnet-4-6';
      var cfg = (ms && ms[m]) || {};
      // 背景：跟 _applyChatWall 同一套规则（自定义优先、被「藏起来」就不算、官端 ui-plain 不铺、主题图叠柔纱）
      var raw = '', off = false; try { raw = localStorage.getItem('chat_wallpaper') || ''; off = localStorage.getItem('chat_wall_off') === '1'; } catch (e) {}
      var custom = (raw && !off) ? raw : '';
      var pal = ''; try { pal = document.documentElement.dataset.palette || ''; } catch (e) {}
      var THEME = { pup: '/img/pup-chat.jpg?v=1' };
      var plain = document.documentElement.classList.contains('ui-plain');
      var wall = plain ? '' : (custom || THEME[pal] || '');
      var veil = !plain && !custom && !!THEME[pal];
      var base = (typeof _API_BASE === 'string' && _API_BASE) || (/^https?:$/.test(location.protocol) ? location.origin : 'https://zhou-and-claude.online');
      return JSON.stringify({
        base: base,
        token: (st && st.token) || localStorage.getItem('chat_token') || '',
        conv: (st && st.convId) || localStorage.getItem('chat_conversation') || '',
        model: m, effort: cfg.effort || '', extended: cfg.extended !== false,
        project: (st && st.projectId) || '', book: (st && st.readingBookId) || '',
        wall: wall, veil: veil,
        origin: /^https?:$/.test(location.protocol) ? location.origin : base   // 打包版是 capacitor://，主题图去后端拿
      });
    })()
    """

    private func loadCreds() async -> NCreds? {
        guard let web = webView else { return nil }
        let raw: String? = await withCheckedContinuation { cont in
            web.evaluateJavaScript(Self.credsJS) { result, _ in cont.resume(returning: result as? String) }
        }
        guard let raw = raw, let data = raw.data(using: .utf8),
              let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        await loadWallpaper(o["wall"] as? String ?? "", origin: o["origin"] as? String ?? "",
                            veil: o["veil"] as? Bool ?? false)
        let token = o["token"] as? String ?? ""
        guard !token.isEmpty else { return nil }
        return NCreds(base: o["base"] as? String ?? "https://zhou-and-claude.online",
                      token: token,
                      convId: o["conv"] as? String ?? "",
                      model: o["model"] as? String ?? "",
                      effort: o["effort"] as? String ?? "",
                      extended: o["extended"] as? Bool ?? true,
                      projectId: o["project"] as? String ?? "",
                      readingBookId: o["book"] as? String ?? "")
    }

    /// 自定义图是 dataURL（moments.js 的 _moStoreImage 压成 jpeg 存的），主题图是站内路径
    private func loadWallpaper(_ wall: String, origin: String, veil: Bool) async {
        wallVeil = veil
        guard !wall.isEmpty else { wallpaper = nil; return }
        if wall.hasPrefix("data:") {
            guard let comma = wall.firstIndex(of: ","),
                  let d = Data(base64Encoded: String(wall[wall.index(after: comma)...])) else { return }
            wallpaper = UIImage(data: d)
            return
        }
        let full = wall.hasPrefix("http") ? wall : origin + wall
        guard let u = URL(string: full), u.scheme == "https" || u.scheme == "http",
              let got = try? await URLSession.shared.data(from: u) else { return }
        wallpaper = UIImage(data: got.0)
    }

    private func start() async {
        // 冷启动（从桌面快捷操作直接进来）时网页可能还没加载完，借不到 —— 等它最多 8 秒
        var got: NCreds? = nil
        for _ in 0..<16 {
            got = await loadCreds()
            if got != nil { break }
            try? await Task.sleep(nanoseconds: 500_000_000)
        }
        guard let c = got else {
            loading = false
            errorText = "没拿到登录信息 —— 先在网页那边正常打开一次聊天，再回来。"
            return
        }
        var cc = c
        if cc.convId.isEmpty, let main = await fetchMainConv(cc) {
            cc = NCreds(base: cc.base, token: cc.token, convId: main, model: cc.model, effort: cc.effort,
                        extended: cc.extended, projectId: cc.projectId, readingBookId: cc.readingBookId)
        }
        creds = cc
        await reloadHistory()
        loading = false
    }

    private func request(_ path: String, _ c: NCreds, method: String = "GET", body: [String: Any]? = nil) -> URLRequest? {
        guard let url = URL(string: c.base + path) else { return nil }
        var r = URLRequest(url: url)
        r.httpMethod = method
        r.setValue("Bearer " + c.token, forHTTPHeaderField: "Authorization")
        if let body = body {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }
        return r
    }

    private func fetchMainConv(_ c: NCreds) async -> String? {
        guard let r = request("/api/sessions/main", c),
              let got = try? await URLSession.shared.data(for: r),
              let o = try? JSONSerialization.jsonObject(with: got.0) as? [String: Any],
              let s = o["session"] as? [String: Any] else { return nil }
        return s["conv_id"] as? String
    }

    // MARK: 历史

    func reloadHistory() async {
        guard let c = creds, !c.convId.isEmpty else { return }
        let conv = c.convId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? c.convId
        guard let r = request("/api/sessions/\(conv)/messages?limit=50", c) else { return }
        do {
            let (data, resp) = try await URLSession.shared.data(for: r)
            if let h = resp as? HTTPURLResponse, h.statusCode == 401 {
                errorText = "登录过期了 —— 回网页那边刷新一下再来。"
                return
            }
            guard let o = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let rows = o["messages"] as? [[String: Any]] else { return }
            var out: [NMsg] = []
            for row in rows {
                let id = "\(row["id"] ?? UUID().uuidString)"
                let mine = (row["role"] as? String) == "user"
                let text = row["text"] as? String ?? ""
                out.append(contentsOf: Self.bubbles(id: id, mine: mine, raw: text))
            }
            msgs = out
        } catch {
            errorText = "读不到聊天记录：" + error.localizedDescription
        }
    }

    // MARK: 发送 + 流式

    func send(_ text: String) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty, !busy, let c = creds else { return }
        errorText = ""
        msgs.append(NMsg(id: "local-" + UUID().uuidString, mine: true, text: t))
        liveText = ""
        status = "在想…"

        // 跟 index.html 的 chatBody 同一套字段。空的就不放（= 网页那边的 undefined / null）。
        var body: [String: Any] = [
            "message": t,
            "conversation_id": c.convId,
            "model": c.model,
            "extended": c.extended,
            "attachments": [String](),
            "share_thinking": false,
        ]
        if !c.effort.isEmpty { body["effort"] = c.effort }
        if !c.projectId.isEmpty { body["project_id"] = c.projectId }
        if !c.readingBookId.isEmpty { body["reading_book_id"] = c.readingBookId }

        guard var r = request("/api/chat", c, method: "POST", body: body) else { return }
        r.timeoutInterval = 600   // 这是「两个包之间最多等多久」，后端会发 ping，工具跑久了也不会断

        streamTask = Task { [weak self] in
            await self?.runStream(r)
        }
    }

    private func runStream(_ r: URLRequest) async {
        do {
            let (bytes, resp) = try await URLSession.shared.bytes(for: r)
            if let h = resp as? HTTPURLResponse, h.statusCode != 200 {
                var body = ""
                for try await line in bytes.lines { body += line }
                if let d = body.data(using: .utf8),
                   let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
                   let e = o["error"] as? String {
                    errorText = e
                } else {
                    errorText = "发送失败（\(h.statusCode)）"
                }
                finish()
                return
            }
            // ⚠️ bytes.lines 会吞掉空行，所以不能靠「空行 = 一帧结束」。
            //    后端每帧只有一行 data，见到 data 就按最近那个 event 处理。
            var event = "message"
            for try await line in bytes.lines {
                if line.hasPrefix("event:") {
                    event = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
                } else if line.hasPrefix("data:") {
                    let payload = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                    if handle(event, payload) { break }
                }
            }
        } catch is CancellationError {
            // 关页面时取消的 —— 后端照常跑完入库，回网页能看到
        } catch {
            if !Task.isCancelled { errorText = "连接断了：" + error.localizedDescription + "（他那边会照常写完，一会儿刷新看）" }
        }
        finish()
    }

    /// 返回 true = 这一轮结束了
    private func handle(_ event: String, _ payload: String) -> Bool {
        let o = (payload.data(using: .utf8)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
        switch event {
        case "delta":
            if let t = o["text"] as? String {
                liveText = (liveText ?? "") + t
                status = ""
            }
        case "thinking":
            if (liveText ?? "").isEmpty { status = "在想…" }
        case "tool_start", "tool_use":
            if let n = o["name"] as? String { status = "在用 \(n)…" }
        case "error":
            errorText = o["message"] as? String ?? "出错了"
        case "done":
            return true
        default:
            break
        }
        return false
    }

    private func finish() {
        streamTask = nil
        status = ""
        // 从库里重读一遍：分条、表情、id 都以库里为准，跟网页看到的是同一份
        Task {
            await reloadHistory()
            liveText = nil
        }
    }

    func stop() {
        guard let c = creds, busy else { return }
        status = "叫停中…"
        if let r = request("/api/chat/stop", c, method: "POST", body: ["convId": c.convId]) {
            URLSession.shared.dataTask(with: r).resume()
        }
        // 不 cancel 流：停下来后端会自己发 done，照常收尾入库
    }

    /// 关页面：断开流（后端照跑），让网页那边重读一遍这段对话，回去就能看到刚才这几句
    func close() {
        streamTask?.cancel()
        webView?.evaluateJavaScript(
            "try{if(typeof openSession==='function'&&state.convId)openSession({conv_id:state.convId,title:state.currentTitle,starred:state.starred})}catch(e){}",
            completionHandler: nil)
    }

    // MARK: 文本 → 气泡

    /// 他那条按 `\n---\n` 分成几个气泡（跟网页的分条规则一样），她那条不分。
    static func bubbles(id: String, mine: Bool, raw: String) -> [NMsg] {
        let parts = mine ? [raw] : raw.components(separatedBy: "\n---\n")
        var out: [NMsg] = []
        for (i, p) in parts.enumerated() {
            let t = clean(p)
            if t.isEmpty { continue }
            out.append(NMsg(id: "\(id)-\(i)", mine: mine, text: t))
        }
        return out
    }

    private static let tagNames: [String: String] = [
        "VOICE": "[语音]", "VOICEC": "[语音]", "CALL": "[通话]", "IMAGE": "[图片]",
        "VIDEO": "[视频]", "FILE": "[文件]", "ARTIFACT": "[卡片]",
    ]

    /// 标记先换成占位，第 3 步再一个个做成原生卡片。认不得的标记（CMD / WAKE / TICK…）直接去掉。
    static func clean(_ raw: String) -> String {
        var s = raw
        s = s.replacingOccurrences(of: #"^\[QUOTE:(him|her)\][\s\S]*?\[/QUOTE\]\n?"#, with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: #"!\[[^\]]*\]\([^)]*\)"#, with: "[图片]", options: .regularExpression)
        s = s.replacingOccurrences(of: #"\[Sticker\]\s*\S+"#, with: "[表情]", options: .regularExpression)
        s = s.replacingOccurrences(of: #"\[clawd:[^\]]*\]"#, with: "", options: .regularExpression)

        if let re = try? NSRegularExpression(pattern: #"\[([A-Z]{3,12}):[^\]]*\]"#) {
            let ns = s as NSString
            var result = ""
            var last = 0
            for m in re.matches(in: s, range: NSRange(location: 0, length: ns.length)) {
                result += ns.substring(with: NSRange(location: last, length: m.range.location - last))
                let name = ns.substring(with: m.range(at: 1))
                result += tagNames[name] ?? ""
                last = m.range.location + m.range.length
            }
            result += ns.substring(from: last)
            s = result
        }
        s = s.replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

// MARK: - 页面

struct NativeChatView: View {
    @ObservedObject var model: NativeChatModel
    var onClose: () -> Void

    @AppStorage("nativeChat.style") private var style: BubbleStyle = .liquid
    @State private var draft = ""

    private var effectiveStyle: BubbleStyle { GlassChatTest.liquidAvailable ? style : .frosted }

    var body: some View {
        ZStack {
            backdrop.ignoresSafeArea()
            VStack(spacing: 0) {
                topBar
                messageList
                if !model.errorText.isEmpty {
                    Text(model.errorText)
                        .font(.system(size: 13))
                        .foregroundColor(.red)
                        .padding(.horizontal, 16).padding(.vertical, 4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                inputBar
            }
        }
    }

    private var backdrop: some View {
        GeometryReader { geo in
            // 没铺背景时就是网页同款奶油底（#FDF9F3）
            ZStack {
                Color(red: 0.992, green: 0.976, blue: 0.953)
                if let img = model.wallpaper {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                    if model.wallVeil {
                        Color(red: 1.0, green: 0.992, blue: 0.976).opacity(0.4)
                    }
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }

    private var topBar: some View {
        HStack {
            Button(action: onClose) {
                Text("完成").font(.system(size: 15, weight: .semibold))
                    .padding(.horizontal, 14).padding(.vertical, 7)
            }
            .bubbleSurface(effectiveStyle, mine: false, radius: 16)

            Spacer()
            VStack(spacing: 1) {
                Text("我们").font(.system(size: 17, weight: .semibold))
                if !model.status.isEmpty {
                    Text(model.status).font(.system(size: 11)).foregroundColor(.secondary)
                }
            }
            Spacer()

            Menu {
                if GlassChatTest.liquidAvailable {
                    Picker("气泡", selection: $style) {
                        ForEach(BubbleStyle.allCases) { Text($0.rawValue).tag($0) }
                    }
                }
                Text("背景跟着网页聊天页走，在网页里换")
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 36, height: 32)
            }
            .bubbleSurface(effectiveStyle, mine: false, radius: 16)
        }
        .foregroundColor(.primary)
        .padding(.horizontal, 14)
        .padding(.top, 6)
        .padding(.bottom, 4)
    }

    private var liveBubbles: [NMsg] {
        guard let t = model.liveText, !t.isEmpty else { return [] }
        return NativeChatModel.bubbles(id: "live", mine: false, raw: t)
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 10) {
                    if model.loading {
                        ProgressView().padding(.top, 40)
                    }
                    ForEach(model.msgs) { m in row(m).id(m.id) }
                    ForEach(liveBubbles) { m in row(m).id(m.id) }
                    if model.busy && liveBubbles.isEmpty {
                        HStack {
                            Text("…").font(.system(size: 16)).padding(.horizontal, 16).padding(.vertical, 9)
                                .bubbleSurface(effectiveStyle, mine: false)
                            Spacer()
                        }
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
            }
            .onChange(of: model.msgs) { _ in
                withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            .onChange(of: model.liveText) { _ in
                // 每个字都动画滚会抖，出字时直接贴底
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        }
    }

    private func row(_ m: NMsg) -> some View {
        HStack(spacing: 0) {
            if m.mine { Spacer(minLength: 56) }
            Text(Self.render(m.text))
                .font(.system(size: 16))
                .foregroundColor(.primary)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .bubbleSurface(effectiveStyle, mine: m.mine)
            if !m.mine { Spacer(minLength: 56) }
        }
    }

    /// 行内 markdown（粗体、斜体、链接、行内代码），保留换行。解析失败就原样显示。
    static func render(_ s: String) -> AttributedString {
        if let a = try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)) {
            return a
        }
        return AttributedString(s)
    }

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 8) {
            inputField
                .padding(.horizontal, 16)
                .padding(.vertical, 11)
                .bubbleSurface(effectiveStyle, mine: false, radius: 22)

            Button(action: { if model.busy { model.stop() } else { doSend() } }) {
                Image(systemName: model.busy ? "stop.fill" : "arrow.up")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 42, height: 42)
            }
            .foregroundColor(.primary)
            .bubbleSurface(effectiveStyle, mine: true, radius: 21)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    @ViewBuilder private var inputField: some View {
        if #available(iOS 16.0, *) {
            TextField("说点什么…", text: $draft, axis: .vertical)
                .lineLimit(1...5)
        } else {
            TextField("说点什么…", text: $draft, onCommit: doSend)
        }
    }

    private func doSend() {
        let t = draft
        guard !t.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !model.busy else { return }
        draft = ""
        model.send(t)
    }
}
