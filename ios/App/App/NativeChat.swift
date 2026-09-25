import SwiftUI
import UIKit
import WebKit
import PhotosUI
import Capacitor

// 原生聊天页（2026-09-25 立项）。她要的是「聊天铺着自定义背景时，气泡是原生的液态玻璃」。
//
// 形态：**一层盖在网页上的原生界面**（CAPBridgeViewController 的子控制器），不是弹出来的一页。
//   - 原生自己做：消息列表、顶栏、输入框、发消息 / 流式 / 叫停、切模型和 effort、思考草稿、发图、表情。
//   - 交给网页做（handOff）：抽屉、用量、作品集、待办、⋯ 菜单里那几项、打电话。
//     点了 → 原生层淡出 → 替她点网页上对应那个按钮 → 网页的面板出来；
//     然后每 0.4 秒看一眼「屏幕正中间是不是又露出网页的聊天流了」，连着两次是 → 面板关了 → 原生层回来。
//     这样网页那几十个面板一个都不用搬，以后网页加新面板这边也不用跟。
//
// 身份、会话、模型、effort、背景**全部从网页借**（WKWebView 里的 state / localStorage），改也是调网页自己的函数改。
// ⚠️ 别在原生这边另存 model/effort，更别补默认值：两边传得不一样，网关会以为她换了模型，
//    放掉常驻进程重开 = 整窗冷写（backend.js 的 _stickyChoice 那段注释，09-11 的 $0.3 × 6）。
//
// 背景就是网页聊天页那张（chat_wallpaper 自定义图 / 主题图如小狗绘本），规则抄 index.html 的 _applyChatWall。
// 消息里的语音 / 图片 / 卡片先显示成「[语音]」「[图片]」占位，表情已经是图了；其余第 3 步逐个搬。

@MainActor
enum NativeChat {
    static let shortcutType = "native-chat"
    static let autoKey = "nativeChat.auto"      // 「有背景时一打开就用原生」

    private static var host: UIHostingController<NativeChatView>? = nil
    private static var model: NativeChatModel? = nil
    private static var watchTask: Task<Void, Never>? = nil
    private static weak var bridge: CAPBridgeViewController? = nil

    /// 进原生聊天。冷启动时根视图可能还没上窗口，就等一会儿再试。
    static func enter(from window: UIWindow?, attempt: Int = 0) {
        guard let b = window?.rootViewController as? CAPBridgeViewController, b.view.window != nil else {
            if attempt < 20 {
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 300_000_000)
                    enter(from: window, attempt: attempt + 1)
                }
            }
            return
        }
        if host == nil { build(on: b) }
        show()
    }

    /// 开了「有背景时自动用原生」：等网页加载完，确认铺着背景才进。
    static func autoEnterIfWanted(from window: UIWindow?) {
        guard UserDefaults.standard.bool(forKey: autoKey) else { return }
        Task { @MainActor in
            for _ in 0..<20 {
                try? await Task.sleep(nanoseconds: 500_000_000)
                guard let b = window?.rootViewController as? CAPBridgeViewController, let web = b.webView else { continue }
                let has = await evalBool(web, "(function(){try{return document.documentElement.classList.contains('wall-on')}catch(e){return false}})()")
                if has { enter(from: window); return }
            }
        }
    }

    private static func build(on b: CAPBridgeViewController) {
        bridge = b
        let m = NativeChatModel(webView: b.webView)
        model = m
        let h = UIHostingController(rootView: NativeChatView(model: m))
        h.view.backgroundColor = .clear
        b.addChild(h)
        h.view.frame = b.view.bounds
        h.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        b.view.addSubview(h.view)
        h.didMove(toParent: b)
        h.view.alpha = 0
        h.view.isHidden = true
        host = h
    }

    static func show() {
        watchTask?.cancel()
        watchTask = nil
        guard let v = host?.view else { return }
        v.superview?.bringSubviewToFront(v)
        v.isHidden = false
        UIView.animate(withDuration: 0.22) { v.alpha = 1 }
        model?.refresh()
    }

    private static func hide() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        guard let v = host?.view else { return }
        UIView.animate(withDuration: 0.18, animations: { v.alpha = 0 }, completion: { _ in
            if v.alpha == 0 { v.isHidden = true }
        })
    }

    /// 回网页聊天（不再自动回来）
    static func leave() {
        watchTask?.cancel()
        watchTask = nil
        hide()
        model?.syncWebIfDirty(then: "")
    }

    /// 把一个按钮交给网页：淡出、替她点、等面板关了再回来。
    /// id 只接受网页里的元素 id（字母数字 - _），不拼任意 JS。
    static func handOff(clickId id: String) {
        guard id.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil else { return }
        hide()
        model?.syncWebIfDirty(then: "var el=document.getElementById('\(id)');if(el)el.click();")
        watchReturn()
    }

    // 屏幕正中间那个点落在 #stream 里 = 没有面板/抽屉/遮罩盖着聊天流了。
    // ⋯ 菜单和表情面板盖不到正中间，单独看它们开没开。
    private static let backJS = """
    (function(){try{
      var s=document.getElementById('stream');
      var e=document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
      var mm=document.getElementById('moreMenu');
      var sp=document.getElementById('stickerPanel');
      var open=(mm&&mm.style.display==='block')||(sp&&sp.style.display&&sp.style.display!=='none');
      return !!(s&&e&&s.contains(e))&&!open;
    }catch(err){return false}})()
    """

    private static func watchReturn() {
        watchTask?.cancel()
        watchTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 800_000_000)   // 等面板滑出来，别一上来就误判
            var hits = 0
            while !Task.isCancelled {
                guard let web = bridge?.webView else { return }
                hits = await evalBool(web, backJS) ? hits + 1 : 0
                if hits >= 2 {
                    if !Task.isCancelled { show() }
                    return
                }
                try? await Task.sleep(nanoseconds: 400_000_000)
            }
        }
    }

    static func evalBool(_ web: WKWebView, _ js: String) async -> Bool {
        await withCheckedContinuation { cont in
            web.evaluateJavaScript(js) { result, _ in cont.resume(returning: (result as? Bool) ?? false) }
        }
    }
}

// MARK: - 数据

struct NMsg: Identifiable, Equatable {
    let id: String
    let mine: Bool
    let text: String
    var sticker: URL? = nil
}

struct NModelOpt: Identifiable, Equatable {
    let id: String
    let label: String
    let thinking: String
    let primary: Bool
}

struct NMoreItem: Identifiable, Equatable {
    let id: String
    let label: String
}

struct NAttach: Identifiable {
    let id: String        // 上传后后端给的 id（= 网页的 item.path）
    let thumb: UIImage
}

struct NSticker: Identifiable, Equatable {
    let id: String
    let url: String       // 站内路径，发出去就是「[Sticker] 这个」
    let full: URL?
}

/// 从网页借来的那一套。字段跟 index.html 里 chatBody 那一行一一对应。
struct NCreds {
    var base: String
    var token: String
    var convId: String
    var model: String
    var effort: String
    var extended: Bool
    var projectId: String
    var readingBookId: String
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
    @Published private(set) var creds: NCreds? = nil
    @Published var models: [NModelOpt] = []
    @Published var moreItems: [NMoreItem] = []
    @Published var pending: [NAttach] = []
    @Published var uploading = false
    @Published var stickers: [NSticker] = []

    private weak var webView: WKWebView?
    private var streamTask: Task<Void, Never>? = nil
    private var wallKey = ""
    private var dirty = false                  // 原生这边发过东西，网页还没重读

    init(webView: WKWebView?) {
        self.webView = webView
    }

    var busy: Bool { liveText != nil }

    var currentModel: NModelOpt? { models.first { $0.id == creds?.model } }

    /// 跟网页 modelSettingText 一样：不思考的模型不显示 effort，没选过显示 Medium
    var effortLabel: String {
        guard let m = currentModel, m.thinking != "none" else { return "" }
        let raw = creds?.effort ?? ""
        return (raw.isEmpty ? "medium" : raw).capitalized
    }

    var modelLabel: String { currentModel?.label ?? (creds?.model ?? "") }

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
      var models = ((st && st.models) || []).map(function(x){ return { id: x.id, label: x.label || x.id, thinking: x.thinking || '', primary: !!x.primary }; });
      var more = Array.prototype.slice.call(document.querySelectorAll('#moreMenu button'))
        .filter(function(b){ return b.id && b.style.display !== 'none'; })
        .map(function(b){ return { id: b.id, label: (b.textContent || '').trim() }; });
      return JSON.stringify({
        base: base,
        token: (st && st.token) || localStorage.getItem('chat_token') || '',
        conv: (st && st.convId) || localStorage.getItem('chat_conversation') || '',
        model: m, effort: cfg.effort || '', extended: cfg.extended !== false,
        project: (st && st.projectId) || '', book: (st && st.readingBookId) || '',
        wall: wall, veil: veil,
        origin: /^https?:$/.test(location.protocol) ? location.origin : base,
        models: models, more: more
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
        let token = o["token"] as? String ?? ""
        guard !token.isEmpty else { return nil }

        let base = o["base"] as? String ?? "https://zhou-and-claude.online"
        await loadWallpaper(o["wall"] as? String ?? "", origin: o["origin"] as? String ?? base,
                            veil: o["veil"] as? Bool ?? false)
        models = (o["models"] as? [[String: Any]] ?? []).compactMap { (d: [String: Any]) -> NModelOpt? in
            guard let id = d["id"] as? String else { return nil }
            return NModelOpt(id: id, label: d["label"] as? String ?? id,
                             thinking: d["thinking"] as? String ?? "", primary: d["primary"] as? Bool ?? false)
        }
        moreItems = (o["more"] as? [[String: Any]] ?? []).compactMap { (d: [String: Any]) -> NMoreItem? in
            guard let id = d["id"] as? String, let label = d["label"] as? String, !label.isEmpty else { return nil }
            return NMoreItem(id: id, label: label)
        }
        return NCreds(base: base, token: token,
                      convId: o["conv"] as? String ?? "",
                      model: o["model"] as? String ?? "",
                      effort: o["effort"] as? String ?? "",
                      extended: o["extended"] as? Bool ?? true,
                      projectId: o["project"] as? String ?? "",
                      readingBookId: o["book"] as? String ?? "")
    }

    /// 自定义图是 dataURL（moments.js 的 _moStoreImage 压成 jpeg 存的），主题图是站内路径。
    /// 同一张就不重解（每次从网页面板回来都会 refresh）。
    private func loadWallpaper(_ wall: String, origin: String, veil: Bool) async {
        wallVeil = veil
        let key = wall.count > 200 ? String(wall.count) + String(wall.suffix(64)) : wall
        if key == wallKey { return }
        wallKey = key
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

    /// 每次原生层露出来都跑一遍：她可能在网页面板里切了会话、换了背景、换了模型。
    func refresh() {
        Task {
            // 冷启动（从桌面快捷操作直接进来）时网页可能还没加载完，借不到 —— 等它最多 8 秒
            var got: NCreds? = nil
            for _ in 0..<16 {
                got = await loadCreds()
                if got != nil { break }
                try? await Task.sleep(nanoseconds: 500_000_000)
            }
            guard var c = got else {
                loading = false
                errorText = "没拿到登录信息 —— 先在网页那边正常打开一次聊天，再回来。"
                return
            }
            if c.convId.isEmpty, let main = await fetchMainConv(c) { c.convId = main }
            let convChanged = creds?.convId != c.convId
            creds = c
            errorText = ""
            if !busy || convChanged { await reloadHistory() }
            loading = false
        }
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

    // MARK: 模型 / effort —— 调网页自己的函数改，网页和这边永远是同一份

    private func runJS(_ js: String) async {
        guard let web = webView else { return }
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            web.evaluateJavaScript(js) { _, _ in cont.resume() }
        }
    }

    func setModel(_ id: String) {
        guard id.range(of: "^[A-Za-z0-9._-]+$", options: .regularExpression) != nil else { return }
        Task {
            await runJS("try{_selectModel('\(id)')}catch(e){}")
            refresh()
        }
    }

    func setEffort(_ k: String) {
        guard ["low", "medium", "high"].contains(k) else { return }
        Task {
            await runJS("try{var i=state.model;state.settings[i]=Object.assign({},state.settings[i]||{},{effort:'\(k)'});saveSettings();updateModelHeader();renderModelSheet()}catch(e){}")
            refresh()
        }
    }

    /// 网页重读这段对话（原生这边发过东西才需要），然后接着跑 then 那段
    func syncWebIfDirty(then js: String) {
        let reload = dirty
            ? "try{if(typeof openSession==='function'&&state.convId)openSession({conv_id:state.convId,title:state.currentTitle,starred:state.starred})}catch(e){}"
            : ""
        dirty = false
        // openSession 开头会同步 closeDrawer()，所以点按钮要排在它后面（它后半截是异步的，不影响）
        webView?.evaluateJavaScript(reload + js, completionHandler: nil)
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
                var text = row["text"] as? String ?? ""
                let nAtt = (row["attachments"] as? [Any])?.count ?? 0
                if nAtt > 0 { text = String(repeating: "[附件] ", count: nAtt) + (text.isEmpty ? "" : "\n" + text) }
                out.append(contentsOf: bubbles(id: id, mine: mine, raw: text))
            }
            msgs = out
        } catch {
            errorText = "读不到聊天记录：" + error.localizedDescription
        }
    }

    // MARK: 附件（发图）

    func addImage(_ data: Data) {
        guard let c = creds, let img = UIImage(data: data), let jpg = img.jpegData(compressionQuality: 0.85) else { return }
        uploading = true
        Task {
            defer { uploading = false }
            guard let url = URL(string: c.base + "/api/upload") else { return }
            let boundary = "native-" + UUID().uuidString
            var body = Data()
            body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"files\"; filename=\"photo.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".utf8))
            body.append(jpg)
            body.append(Data("\r\n--\(boundary)\r\nContent-Disposition: form-data; name=\"conversation_id\"\r\n\r\n\(c.convId)\r\n--\(boundary)--\r\n".utf8))
            var r = URLRequest(url: url)
            r.httpMethod = "POST"
            r.setValue("Bearer " + c.token, forHTTPHeaderField: "Authorization")
            r.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            do {
                let (d, _) = try await URLSession.shared.upload(for: r, from: body)
                let o = try JSONSerialization.jsonObject(with: d) as? [String: Any]
                if let a = (o?["attachments"] as? [[String: Any]])?.first, let id = a["path"] as? String {
                    pending.append(NAttach(id: id, thumb: img))
                } else {
                    errorText = (o?["detail"] as? String) ?? "图片没传上去"
                }
            } catch {
                errorText = "图片没传上去：" + error.localizedDescription
            }
        }
    }

    func removePending(_ id: String) { pending.removeAll { $0.id == id } }

    // MARK: 表情

    func loadStickers() {
        guard let c = creds, stickers.isEmpty else { return }
        Task {
            guard let r = request("/api/stickers?owner=user", c),
                  let got = try? await URLSession.shared.data(for: r),
                  let arr = try? JSONSerialization.jsonObject(with: got.0) as? [[String: Any]] else { return }
            stickers = arr.compactMap { (d: [String: Any]) -> NSticker? in
                guard let u = d["url"] as? String else { return nil }
                return NSticker(id: "\(d["id"] ?? u)", url: u, full: absURL(u))
            }
        }
    }

    func absURL(_ u: String) -> URL? {
        if u.hasPrefix("http") { return URL(string: u) }
        guard let c = creds else { return nil }
        return URL(string: c.base + (u.hasPrefix("/") ? u : "/" + u))
    }

    // MARK: 发送 + 流式

    /// thinking：她的思考草稿（my_thinking），share：这条给不给他看
    func send(_ text: String, thinking: String = "", share: Bool = false) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty || !pending.isEmpty, !busy, let c = creds else { return }
        errorText = ""
        let atts = pending.map { $0.id }
        let shown = (atts.isEmpty ? "" : String(repeating: "[附件] ", count: atts.count) + (t.isEmpty ? "" : "\n")) + t
        msgs.append(contentsOf: bubbles(id: "local-" + UUID().uuidString, mine: true, raw: shown))
        pending = []
        liveText = ""
        status = "在想…"
        dirty = true

        // 跟 index.html 的 chatBody 同一套字段。空的就不放（= 网页那边的 undefined / null）。
        var body: [String: Any] = [
            "message": t,
            "conversation_id": c.convId,
            "model": c.model,
            "extended": c.extended,
            "attachments": atts,
            "share_thinking": share,
        ]
        let th = thinking.trimmingCharacters(in: .whitespacesAndNewlines)
        if !th.isEmpty { body["my_thinking"] = th }
        if !c.effort.isEmpty { body["effort"] = c.effort }
        if !c.projectId.isEmpty { body["project_id"] = c.projectId }
        if !c.readingBookId.isEmpty { body["reading_book_id"] = c.readingBookId }

        guard var r = request("/api/chat", c, method: "POST", body: body) else { return }
        r.timeoutInterval = 600   // 这是「两个包之间最多等多久」，后端会发 ping，工具跑久了也不会断

        streamTask = Task { [weak self] in
            await self?.runStream(r)
        }
    }

    func sendSticker(_ s: NSticker) {
        send("[Sticker] " + s.url)   // 跟网页 sendSticker 一样
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

    // MARK: 文本 → 气泡

    /// 他那条按 `\n---\n` 分成几个气泡（跟网页的分条规则一样），她那条不分。一整条只有表情的画成图。
    func bubbles(id: String, mine: Bool, raw: String) -> [NMsg] {
        let whole = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if whole.range(of: #"^\[Sticker\]\s*\S+$"#, options: .regularExpression) != nil {
            let u = whole.replacingOccurrences(of: #"^\[Sticker\]\s*"#, with: "", options: .regularExpression)
            return [NMsg(id: id + "-0", mine: mine, text: "", sticker: absURL(u))]
        }
        let parts = mine ? [raw] : raw.components(separatedBy: "\n---\n")
        var out: [NMsg] = []
        for (i, p) in parts.enumerated() {
            let t = Self.clean(p)
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

    @AppStorage("nativeChat.style") private var style: BubbleStyle = .liquid
    @AppStorage("nativeChat.auto") private var autoNative = false   // = NativeChat.autoKey
    @State private var draft = ""
    @State private var showThink = false
    @State private var thinkText = ""
    @State private var thinkShare = false
    @State private var showStickers = false
    @State private var pickingPhoto = false

    private var effectiveStyle: BubbleStyle { GlassChatTest.liquidAvailable ? style : .frosted }
    private var canSend: Bool { !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !model.pending.isEmpty }

    var body: some View {
        ZStack {
            backdrop.ignoresSafeArea()
            VStack(spacing: 0) {
                topBar
                messageList
                composer
            }
        }
        .modifier(PhotoPickModifier(isPresented: $pickingPhoto, onPick: { data in model.addImage(data) }))
        .sheet(isPresented: $showStickers) {
            StickerSheet(model: model, onPick: { s in
                showStickers = false
                model.sendSticker(s)
            })
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

    // MARK: 顶栏 —— 跟网页一样的排布：☰ ｜ 模型 ｜ 用量 作品集 [待办 ⋯]

    private func glassIcon(_ symbol: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .frame(width: 36, height: 36)
        }
        .bubbleSurface(effectiveStyle, mine: false, radius: 18)
    }

    private var topBar: some View {
        HStack(spacing: 8) {
            glassIcon("line.3.horizontal") { NativeChat.handOff(clickId: "openDrawer") }

            Spacer(minLength: 4)

            Menu { modelMenu } label: {
                VStack(spacing: 1) {
                    HStack(spacing: 3) {
                        Text(model.modelLabel).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                        Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold))
                    }
                    if !model.effortLabel.isEmpty {
                        Text(model.effortLabel).font(.system(size: 11)).foregroundColor(.secondary)
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 5)
            }
            .bubbleSurface(effectiveStyle, mine: false, radius: 18)

            Spacer(minLength: 4)

            glassIcon("chart.bar") { NativeChat.handOff(clickId: "usageTopBtn") }
            glassIcon("doc.text") { NativeChat.handOff(clickId: "artifactsTopBtn") }

            // 待办 + ⋯ 是一颗胶囊（网页的 capsule-group）
            HStack(spacing: 0) {
                Button(action: { NativeChat.handOff(clickId: "todoTopBtn") }) {
                    Image(systemName: "checklist").font(.system(size: 15, weight: .semibold)).frame(width: 36, height: 36)
                }
                Rectangle().fill(Color.primary.opacity(0.15)).frame(width: 1, height: 16)
                Menu {
                    ForEach(model.moreItems) { it in
                        Button(it.label) { NativeChat.handOff(clickId: it.id) }
                    }
                } label: {
                    Image(systemName: "ellipsis").font(.system(size: 15, weight: .semibold)).frame(width: 36, height: 36)
                }
            }
            .bubbleSurface(effectiveStyle, mine: false, radius: 18)
        }
        .foregroundColor(.primary)
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .padding(.bottom, 4)
    }

    /// 顶上模型按钮和输入框里的模型胶囊共用这一份
    @ViewBuilder private var modelMenu: some View {
        Section {
            ForEach(model.models) { m in
                Button(action: { model.setModel(m.id) }) {
                    if m.id == model.creds?.model { Label(m.label, systemImage: "checkmark") } else { Text(m.label) }
                }
            }
        }
        if (model.currentModel?.thinking ?? "none") != "none" {
            Section(header: Text("Effort")) {
                ForEach(["low", "medium", "high"], id: \.self) { k in
                    Button(action: { model.setEffort(k) }) {
                        if model.effortLabel.lowercased() == k { Label(k.capitalized, systemImage: "checkmark") } else { Text(k.capitalized) }
                    }
                }
            }
        }
        Section(header: Text("原生聊天")) {
            if GlassChatTest.liquidAvailable {
                Picker("气泡", selection: $style) {
                    ForEach(BubbleStyle.allCases) { Text($0.rawValue).tag($0) }
                }
            }
            Toggle("有背景时一打开就用原生", isOn: $autoNative)
            Button(action: { NativeChat.leave() }) { Label("回网页聊天", systemImage: "arrow.uturn.backward") }
        }
    }

    // MARK: 消息

    private var liveBubbles: [NMsg] {
        guard let t = model.liveText, !t.isEmpty else { return [] }
        return model.bubbles(id: "live", mine: false, raw: t)
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

    @ViewBuilder private func row(_ m: NMsg) -> some View {
        HStack(spacing: 0) {
            if m.mine { Spacer(minLength: 56) }
            if let u = m.sticker {
                // 表情不套玻璃，跟网页的 sticker-only 一样裸着
                AsyncImage(url: u) { img in
                    img.resizable().scaledToFit()
                } placeholder: {
                    Color.clear
                }
                .frame(width: 120, height: 120)
            } else {
                Text(Self.render(m.text))
                    .font(.system(size: 16))
                    .foregroundColor(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .bubbleSurface(effectiveStyle, mine: m.mine)
            }
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

    // MARK: 输入框 —— 跟网页一样：上面一行字，下面一排 ＋ ｜ 模型 ｜ 思考 表情 电话 发送

    private var composer: some View {
        VStack(spacing: 6) {
            if !model.status.isEmpty || !model.errorText.isEmpty {
                Text(model.errorText.isEmpty ? model.status : model.errorText)
                    .font(.system(size: 12))
                    .foregroundColor(model.errorText.isEmpty ? .secondary : .red)
                    .padding(.horizontal, 12).padding(.vertical, 5)
                    .bubbleSurface(effectiveStyle, mine: false, radius: 12)
            }

            if showThink { thinkPanel }

            VStack(alignment: .leading, spacing: 8) {
                if !model.pending.isEmpty || model.uploading { pendingRow }

                inputField
                    .font(.system(size: 16))
                    .padding(.horizontal, 4)

                HStack(spacing: 14) {
                    Button(action: { pickingPhoto = true }) {
                        Image(systemName: "plus").font(.system(size: 16, weight: .semibold))
                            .frame(width: 32, height: 32)
                            .overlay(Circle().stroke(Color.primary.opacity(0.25), lineWidth: 1))
                    }

                    Menu { modelMenu } label: {
                        Text(model.modelLabel + (model.effortLabel.isEmpty ? "" : " " + model.effortLabel))
                            .font(.system(size: 13, weight: .medium))
                            .lineLimit(1)
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .overlay(Capsule().stroke(Color.primary.opacity(0.2), lineWidth: 1))
                    }

                    Spacer(minLength: 0)

                    Button(action: { withAnimation(.easeOut(duration: 0.2)) { showThink.toggle() } }) {
                        Image(systemName: showThink || !thinkText.isEmpty ? "lightbulb.fill" : "lightbulb")
                            .font(.system(size: 17))
                    }
                    Button(action: { model.loadStickers(); showStickers = true }) {
                        Image(systemName: "face.smiling").font(.system(size: 18))
                    }
                    Button(action: { NativeChat.handOff(clickId: "callButton") }) {
                        Image(systemName: "phone").font(.system(size: 17))
                    }
                    sendButton
                }
            }
            .foregroundColor(.primary)
            .padding(.horizontal, 12)
            .padding(.top, 12)
            .padding(.bottom, 8)
            .bubbleSurface(effectiveStyle, mine: false, radius: 24)
        }
        .padding(.horizontal, 10)
        .padding(.bottom, 6)
    }

    private var sendButton: some View {
        Button(action: { if model.busy { model.stop() } else { doSend() } }) {
            Image(systemName: model.busy ? "stop.fill" : "arrow.up")
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 34, height: 34)
                .background(Circle().fill(Color(red: 0.85, green: 0.47, blue: 0.34)
                    .opacity(model.busy || canSend ? 1 : 0.35)))
        }
        .disabled(!model.busy && !canSend)
    }

    @ViewBuilder private var inputField: some View {
        if #available(iOS 16.0, *) {
            TextField("Reply to Claude", text: $draft, axis: .vertical)
                .lineLimit(1...6)
        } else {
            TextField("Reply to Claude", text: $draft, onCommit: doSend)
        }
    }

    private var pendingRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(model.pending) { a in
                    ZStack(alignment: .topTrailing) {
                        Image(uiImage: a.thumb).resizable().scaledToFill()
                            .frame(width: 56, height: 56)
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        Button(action: { model.removePending(a.id) }) {
                            Image(systemName: "xmark.circle.fill").font(.system(size: 16))
                                .foregroundColor(.white).shadow(radius: 1)
                        }
                        .offset(x: 4, y: -4)
                    }
                }
                if model.uploading { ProgressView().frame(width: 56, height: 56) }
            }
            .padding(.top, 4)
        }
    }

    // ✎ 她的思考草稿：默认只存不发，勾了「这条给他看」才进他的上下文（docs/context-cost.md）
    private var thinkPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            thinkField
                .font(.system(size: 14))
            Toggle(isOn: $thinkShare) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("这条给他看").font(.system(size: 13))
                    Text("不勾就只有你自己看得见（他能主动去翻）").font(.system(size: 11)).foregroundColor(.secondary)
                }
            }
        }
        .padding(12)
        .bubbleSurface(effectiveStyle, mine: false, radius: 18)
    }

    @ViewBuilder private var thinkField: some View {
        if #available(iOS 16.0, *) {
            TextField("想到一半的、还没整理成话的……写给自己看", text: $thinkText, axis: .vertical)
                .lineLimit(2...6)
        } else {
            TextField("想到一半的、还没整理成话的……写给自己看", text: $thinkText)
        }
    }

    private func doSend() {
        guard canSend, !model.busy else { return }
        let t = draft
        draft = ""
        model.send(t, thinking: thinkText, share: thinkShare)
        // 草稿跟着这条一起走掉：它是「这一句话背后的想法」，留到下一句就对不上了（跟网页一样）
        thinkText = ""
        thinkShare = false
        showThink = false
    }
}

// MARK: - 表情面板

struct StickerSheet: View {
    @ObservedObject var model: NativeChatModel
    var onPick: (NSticker) -> Void

    private let cols = [GridItem(.adaptive(minimum: 76), spacing: 10)]

    var body: some View {
        ScrollView {
            if model.stickers.isEmpty {
                Text("这儿还没有表情（在网页表情面板里加）")
                    .font(.system(size: 13)).foregroundColor(.secondary).padding(.top, 30)
            }
            LazyVGrid(columns: cols, spacing: 10) {
                ForEach(model.stickers) { s in
                    Button(action: { onPick(s) }) {
                        AsyncImage(url: s.full) { img in
                            img.resizable().scaledToFit()
                        } placeholder: {
                            Color.primary.opacity(0.05)
                        }
                        .frame(width: 76, height: 76)
                    }
                }
            }
            .padding(16)
        }
        .modifier(HalfSheet())
    }
}

struct HalfSheet: ViewModifier {
    @ViewBuilder func body(content: Content) -> some View {
        if #available(iOS 16.0, *) {
            content.presentationDetents([.medium, .large])
        } else {
            content
        }
    }
}

// MARK: - 选图

struct PhotoPickModifier: ViewModifier {
    @Binding var isPresented: Bool
    var onPick: (Data) -> Void

    @ViewBuilder func body(content: Content) -> some View {
        if #available(iOS 16.0, *) {
            content.modifier(PhotoPickModifier16(isPresented: $isPresented, onPick: onPick))
        } else {
            content
        }
    }
}

@available(iOS 16.0, *)
struct PhotoPickModifier16: ViewModifier {
    @Binding var isPresented: Bool
    var onPick: (Data) -> Void
    @State private var item: PhotosPickerItem? = nil

    func body(content: Content) -> some View {
        content
            .photosPicker(isPresented: $isPresented, selection: $item, matching: .images)
            .onChange(of: item) { newItem in
                guard let newItem = newItem else { return }
                item = nil
                Task {
                    if let data = try? await newItem.loadTransferable(type: Data.self) {
                        await MainActor.run { onPick(data) }
                    }
                }
            }
    }
}
