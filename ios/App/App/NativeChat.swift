import SwiftUI
import UIKit
import WebKit
import PhotosUI
import AVFoundation
import ImageIO
import Capacitor

// 原生聊天页（2026-09-25 立项）。她要的是「聊天铺着自定义背景时，气泡是原生的液态玻璃」。
//
// 形态：**一层盖在网页上的原生界面**（CAPBridgeViewController 的子控制器），不是弹出来的一页。
//   - 原生自己做：消息列表、顶栏、输入框、发消息 / 流式 / 叫停、切模型和 effort、思考草稿、发图、表情。
//   - 交给网页做（handOff）：抽屉、用量、作品集、待办、⋯ 菜单里那几项、打电话。
//     点了 → 原生层淡出 → 替她点网页上对应那个按钮 → 网页的面板出来；
//     然后每 0.15 秒看一眼「屏幕正中间是不是又露出网页的聊天流了」，连着两次是 → 面板关了 → 原生层回来。
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
        bridge?.webView?.evaluateJavaScript("document.documentElement.classList.remove('nc-handoff')", completionHandler: nil)
        UIView.animate(withDuration: 0.22) { v.alpha = 1 }
        model?.visible = true
        model?.refresh()
    }

    private static func hide() {
        model?.visible = false
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
        model?.syncWebIfDirty(then: hideWebChatJS + "var el=document.getElementById('\(id)');if(el)el.click();")
        watchReturn()
    }

    // 交出去的这段时间，把网页聊天的内容（气泡 / 顶栏 / 输入框）藏起来，只留背景 ——
    // 抽屉拉开时网页会把聊天推到右边、关上时再滑回来，不藏的话她会看到网页那版气泡闪一下（09-25 她报的）。
    // 背景跟原生页是同一张，所以滑回来的那一下看着就像原生页本身。原生层露出来时把 class 摘掉。
    // visibility:hidden 的元素 elementFromPoint 点不中，会落到 #stream 本身上，下面的判断不受影响。
    private static let hideWebChatJS = "(function(){if(!document.getElementById('ncHandoffCss')){var st=document.createElement('style');st.id='ncHandoffCss';st.textContent='html.nc-handoff #streamInner,html.nc-handoff #chat .composer-wrap,html.nc-handoff #chat .topbar{visibility:hidden!important}';document.head.appendChild(st)}document.documentElement.classList.add('nc-handoff')})();"

    // 屏幕正中间那个点落在 #stream 里 = 没有面板/抽屉/遮罩盖着聊天流了。
    // ⋯ 菜单和表情面板盖不到正中间，单独看它们开没开。
    private static let backJS = """
    (function(){try{
      var s=document.getElementById('stream');
      var e=document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
      var mm=document.getElementById('moreMenu');
      var sp=document.getElementById('stickerPanel');
      var open=(mm&&mm.style.display==='block')||(sp&&sp.style.display&&sp.style.display!=='none');
      var dp=(typeof drawerProgress==='number')?drawerProgress:0;   // 抽屉还没收完不算
      return !!(s&&e&&s.contains(e))&&!open&&dp<=0.01;
    }catch(err){return false}})()
    """

    private static func watchReturn() {
        watchTask?.cancel()
        watchTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 500_000_000)   // 等面板滑出来，别一上来就误判
            var hits = 0
            while !Task.isCancelled {
                guard let web = bridge?.webView else { return }
                hits = await evalBool(web, backJS) ? hits + 1 : 0
                if hits >= 2 {
                    if !Task.isCancelled { show() }
                    return
                }
                try? await Task.sleep(nanoseconds: 150_000_000)   // 09-25 从 0.4s 提到 0.15s：关抽屉后回来得快
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

/// 一个气泡里装的是什么。一条消息会按标记拆成好几个（字 / 语音条 / 图），各占一行。
enum NKind: Equatable {
    case text
    case sticker(URL?)
    case voice(id: String, dur: String, transcript: String)   // transcript 非空 = 通话语音（原文就跟在标记后面）
    case image(URL?)                                          // 同站地址拉图时会带登录头（她传的附件要）
    case localImage(UIImage)                                  // 刚发出去、还没从库里读回来的那张
}

struct NMsg: Identifiable, Equatable {
    let id: String
    let mine: Bool
    let text: String
    var kind: NKind = .text
    var time: Date? = nil
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
    @Published var avatarMe: UIImage? = nil    // 网页首页传的头像（home_avatar / claude_avatar，都是 dataURL）
    @Published var avatarHim: UIImage? = nil
    @Published var himName = "Claude"          // 网页首页改的名字（claude_name）

    private weak var webView: WKWebView?
    private var streamTask: Task<Void, Never>? = nil
    private var wallKey = ""
    private var avatarKeys = ["", ""]
    private var dirty = false                  // 原生这边发过东西，网页还没重读
    var visible = false                        // 原生层露着没有（NativeChat.show / hide 设）
    private var pollTask: Task<Void, Never>? = nil

    init(webView: WKWebView?) {
        self.webView = webView
        startPolling()
    }

    // 他会自己找她（醒来 / 定时那些），网页是 60 秒问一次 /api/wake/unread。
    // 原生这边更简单：露着的时候每 30 秒重读一遍最近 50 条 —— 内容没变 msgs 就是相等的，界面不会动。
    // 她正在跟他说话（busy）时不读，免得把正在流的那条冲掉。
    private func startPolling() {
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                guard let self = self else { return }
                if self.visible && !self.busy && self.creds != nil { await self.reloadHistory() }
            }
        }
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
        models: models, more: more,
        me: localStorage.getItem('home_avatar') || '', him: localStorage.getItem('claude_avatar') || '',
        name: localStorage.getItem('claude_name') || 'Claude'
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
        himName = (o["name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Claude"
        let me = o["me"] as? String ?? "", him = o["him"] as? String ?? ""
        let keys = [Self.dataKey(me), Self.dataKey(him)]
        if keys != avatarKeys {          // 同一张就不重解（每次从网页面板回来都会 refresh）
            avatarKeys = keys
            avatarMe = Self.imageFromDataURL(me)
            avatarHim = Self.imageFromDataURL(him)
        }
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

    private static func dataKey(_ s: String) -> String {
        s.count > 200 ? String(s.count) + String(s.suffix(64)) : s
    }

    static func imageFromDataURL(_ s: String) -> UIImage? {
        guard s.hasPrefix("data:"), let comma = s.firstIndex(of: ","),
              let d = Data(base64Encoded: String(s[s.index(after: comma)...])) else { return nil }
        return UIImage(data: d)
    }

    /// 自定义图是 dataURL（moments.js 的 _moStoreImage 压成 jpeg 存的），主题图是站内路径。
    /// 同一张就不重解（每次从网页面板回来都会 refresh）。
    private func loadWallpaper(_ wall: String, origin: String, veil: Bool) async {
        wallVeil = veil
        let key = Self.dataKey(wall)
        if key == wallKey { return }
        wallKey = key
        guard !wall.isEmpty else { wallpaper = nil; return }
        if wall.hasPrefix("data:") {
            wallpaper = Self.imageFromDataURL(wall)
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
                let t = (row["timestamp"] as? String).flatMap { Self.parseTime($0) }
                // 她发的附件：图一张一行画出来（/api/uploads/会话/id，要登录头），别的文件先写个名字
                var names: [String] = []
                for (k, a) in ((row["attachments"] as? [[String: Any]]) ?? []).enumerated() {
                    let aid = (a["path"] as? String) ?? (a["id"] as? String) ?? ""
                    if (a["is_image"] as? Bool) == true && !aid.isEmpty {
                        out.append(NMsg(id: "\(id)-a\(k)", mine: mine, text: "",
                                        kind: .image(absURL("/api/uploads/\(c.convId)/\(aid)")), time: t))
                    } else {
                        names.append((a["name"] as? String) ?? "文件")
                    }
                }
                if !names.isEmpty { text = names.map { "[文件] " + $0 }.joined(separator: "\n") + (text.isEmpty ? "" : "\n" + text) }
                out.append(contentsOf: bubbles(id: id, mine: mine, raw: text, time: t))
            }
            msgs = out
        } catch {
            errorText = "读不到聊天记录：" + error.localizedDescription
        }
    }

    // MARK: 附件（发图）

    func addImage(_ data: Data) {
        guard let c = creds, let img = NImage.downsample(data, maxPixel: 1080) else { return }
        // 跟网页 _shrinkImage 同一档（她定的）：长边 1080、JPEG 0.7 —— 省 token 优先，
        // 1290x2796 的截图不压 ~4800 tok、压完 ~730。GIF 原样传（缩了就不动了）。
        // 跟网页不同的一处：网页「压完更大就传原图」，这边不是 GIF 就一律传压好的 JPEG ——
        // 原图可能是 PNG/HEIC，名字后缀跟内容对不上时后端会把它当成普通文件而不是图（按后缀认图）。
        // 会压大的只有本来就很小的图，差几 KB 无所谓。
        let isGif = data.starts(with: [0x47, 0x49, 0x46])
        guard let payload = isGif ? data : img.jpegData(compressionQuality: 0.7) else { return }
        let mime = isGif ? "image/gif" : "image/jpeg"
        let fname = isGif ? "photo.gif" : "photo.jpg"
        uploading = true
        Task {
            defer { uploading = false }
            guard let url = URL(string: c.base + "/api/upload") else { return }
            let boundary = "native-" + UUID().uuidString
            var body = Data()
            body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"files\"; filename=\"\(fname)\"\r\nContent-Type: \(mime)\r\n\r\n".utf8))
            body.append(payload)
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
        let lid = "local-" + UUID().uuidString
        for (k, a) in pending.enumerated() {
            msgs.append(NMsg(id: "\(lid)-a\(k)", mine: true, text: "", kind: .localImage(a.thumb), time: Date()))
        }
        if !t.isEmpty { msgs.append(contentsOf: bubbles(id: lid, mine: true, raw: t, time: Date())) }
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
    private static let isoFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static func parseTime(_ s: String) -> Date? {
        isoFrac.date(from: s) ?? ISO8601DateFormatter().date(from: s)
    }

    private static let voiceCallRe = try? NSRegularExpression(pattern: #"^\[VOICEC:([A-Za-z0-9_]+)\|([^\]]*)\]([\s\S]*)$"#)
    // 1 语音 id  2 时长  3 [IMAGE:] 地址  4 markdown 图地址
    private static let mediaRe = try? NSRegularExpression(
        pattern: #"\[VOICE:([^\]|]+)(?:\|([^\]]*))?\]|\[IMAGE:([^\]]+)\]|!\[[^\]]*\]\(([^)\s]+)[^)]*\)"#)

    /// 他那条按 `\n---\n` 分成几段（跟网页的分条规则一样），她那条不分；
    /// 每段再按语音 / 图片标记拆开，字归字、语音条归语音条、图归图，各占一行。
    func bubbles(id: String, mine: Bool, raw: String, time: Date? = nil) -> [NMsg] {
        let whole = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if whole.range(of: #"^\[Sticker\]\s*\S+$"#, options: .regularExpression) != nil {
            let u = whole.replacingOccurrences(of: #"^\[Sticker\]\s*"#, with: "", options: .regularExpression)
            return [NMsg(id: id + "-0", mine: mine, text: "", kind: .sticker(absURL(u)), time: time)]
        }
        // 通话里的语音：整条就是 [VOICEC:文件|时长]原文
        let ns = whole as NSString
        if let m = Self.voiceCallRe?.firstMatch(in: whole, range: NSRange(location: 0, length: ns.length)) {
            return [NMsg(id: id + "-0", mine: mine, text: "",
                         kind: .voice(id: ns.substring(with: m.range(at: 1)),
                                      dur: ns.substring(with: m.range(at: 2)),
                                      transcript: ns.substring(with: m.range(at: 3)).trimmingCharacters(in: .whitespacesAndNewlines)),
                         time: time)]
        }
        let segs = mine ? [raw] : raw.components(separatedBy: "\n---\n")
        var out: [NMsg] = []
        for (i, seg) in segs.enumerated() {
            var j = 0
            func addText(_ t: String) {
                let c = Self.clean(t)
                if c.isEmpty { return }
                out.append(NMsg(id: "\(id)-\(i)-\(j)", mine: mine, text: c, time: time)); j += 1
            }
            let sn = seg as NSString
            var last = 0
            for m in Self.mediaRe?.matches(in: seg, range: NSRange(location: 0, length: sn.length)) ?? [] {
                addText(sn.substring(with: NSRange(location: last, length: m.range.location - last)))
                func g(_ k: Int) -> String? { m.range(at: k).location == NSNotFound ? nil : sn.substring(with: m.range(at: k)) }
                if let vid = g(1) {
                    out.append(NMsg(id: "\(id)-\(i)-\(j)", mine: mine, text: "",
                                    kind: .voice(id: vid, dur: g(2) ?? "0:00", transcript: ""), time: time)); j += 1
                } else if let u = g(3) ?? g(4) {
                    out.append(NMsg(id: "\(id)-\(i)-\(j)", mine: mine, text: "", kind: .image(absURL(u)), time: time)); j += 1
                }
                last = m.range.location + m.range.length
            }
            addText(sn.substring(from: last))
        }
        return out
    }

    /// 语音文件的地址。<audio> 那条路带不了头，后端 /api/files/:id 专门认 ?t=（authFile）
    func voiceURL(_ fileId: String) -> URL? {
        guard let c = creds else { return nil }
        let t = c.token.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? c.token
        return URL(string: c.base + "/api/files/" + fileId + "?t=" + t)
    }

    /// 同站的地址才带登录头，别把 token 发给别人的服务器
    func authToken(for url: URL?) -> String? {
        guard let c = creds, let u = url?.absoluteString, u.hasPrefix(c.base) else { return nil }
        return c.token
    }

    /// 语音转文字，跟网页 _transcribeVoice 同一个接口
    func transcribe(_ fileId: String) async -> String? {
        guard let c = creds, let r = request("/api/stt", c, method: "POST", body: ["id": fileId]),
              let got = try? await URLSession.shared.data(for: r),
              let o = try? JSONSerialization.jsonObject(with: got.0) as? [String: Any] else { return nil }
        return o["text"] as? String
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

// MARK: - 页面（09-25 她发了参考图：「宝宝想要这样子的」）
//
// 参考图的规矩：
//   - 气泡是整颗胶囊（两头全圆、没尾巴），他奶白玻璃、她粉色玻璃（09-25 她：「我要粉色！」）；时间写在气泡里右下角
//   - 头像只挂在一组的最后一条旁边（底对齐），组里其余几条空出头像那一格，排得齐
//   - 底下没有整条输入栏，是一排浮着的玻璃：☰ 圆钮、📎 圆钮、Reply to Claude 胶囊、右边一个圆钮
//   - 顶上几乎是空的：正中一颗小胶囊写他的名字（点开切模型），右边 [待办 | ⋯]

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
    @State private var viewing: ViewingImage? = nil

    private static let avatarSize: CGFloat = 36

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
        .fullScreenCover(item: $viewing) { v in ImageViewer(img: v.img) { viewing = nil } }
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

    // MARK: 顶栏 —— 正中他的名字（点开切模型），右边 [待办 | ⋯]

    private var topBar: some View {
        ZStack {
            HStack {
                Spacer()
                HStack(spacing: 0) {
                    Button(action: { NativeChat.handOff(clickId: "todoTopBtn") }) {
                        Image(systemName: "checklist").font(.system(size: 14, weight: .semibold)).frame(width: 34, height: 34)
                    }
                    Rectangle().fill(Color.primary.opacity(0.15)).frame(width: 1, height: 14)
                    Menu {
                        Button(action: { NativeChat.handOff(clickId: "usageTopBtn") }) { Label("用量", systemImage: "chart.bar") }
                        Button(action: { NativeChat.handOff(clickId: "artifactsTopBtn") }) { Label("作品集", systemImage: "doc.text") }
                        Divider()
                        ForEach(model.moreItems) { it in
                            Button(it.label) { NativeChat.handOff(clickId: it.id) }
                        }
                    } label: {
                        Image(systemName: "ellipsis").font(.system(size: 14, weight: .semibold)).frame(width: 34, height: 34)
                    }
                }
                .bubbleSurface(effectiveStyle, mine: false, radius: 17)
            }

            Menu { modelMenu } label: {
                HStack(spacing: 4) {
                    Text(model.himName).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    if !model.effortLabel.isEmpty {
                        Text(model.effortLabel).font(.system(size: 11)).foregroundColor(.secondary)
                    }
                    Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold)).foregroundColor(.secondary)
                }
                .padding(.horizontal, 14).padding(.vertical, 8)
            }
            .bubbleSurface(effectiveStyle, mine: false, radius: 17)
        }
        .foregroundColor(.primary)
        .padding(.horizontal, 12)
        .padding(.top, 2)
        .padding(.bottom, 4)
    }

    /// 头像：网页首页传过的就用那张；没有就跟网页默认一样（她 🦀 粉橘渐变，他橘底星芒）
    @ViewBuilder private func avatar(mine: Bool) -> some View {
        let size = Self.avatarSize
        if let img = mine ? model.avatarMe : model.avatarHim {
            Image(uiImage: img).resizable().scaledToFill()
                .frame(width: size, height: size)
                .clipShape(Circle())
                .overlay(Circle().stroke(Color.white.opacity(0.6), lineWidth: 1))
        } else if mine {
            Text("🦀").font(.system(size: 16))
                .frame(width: size, height: size)
                .background(Circle().fill(LinearGradient(
                    gradient: Gradient(colors: [Color(red: 0.91, green: 0.66, blue: 0.72), Color(red: 0.85, green: 0.47, blue: 0.34)]),
                    startPoint: .topLeading, endPoint: .bottomTrailing)))
        } else {
            Image(systemName: "asterisk").font(.system(size: 14, weight: .bold)).foregroundColor(.white)
                .frame(width: size, height: size)
                .background(Circle().fill(Color(red: 0.85, green: 0.47, blue: 0.34)))
        }
    }

    /// 点顶上名字弹出来的：模型、effort、原生页自己的设置
    @ViewBuilder private var modelMenu: some View {
        Section(header: Text(model.modelLabel + (model.effortLabel.isEmpty ? "" : " · " + model.effortLabel))) {
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
                    ForEach(BubbleStyle.allCases) { s in
                        Text(s == .liquid ? "液态 · 我这边粉" : (s == .tinted ? "液态 · 我这边蓝" : s.rawValue)).tag(s)
                    }
                }
            }
            Toggle("有背景时一打开就用原生", isOn: $autoNative)
            Button(action: { NativeChat.leave() }) { Label("回网页聊天", systemImage: "arrow.uturn.backward") }
        }
    }

    // MARK: 消息

    private var liveBubbles: [NMsg] {
        guard let t = model.liveText, !t.isEmpty else { return [] }
        return model.bubbles(id: "live", mine: false, raw: t, time: Date())
    }

    /// 连着说超过 20 分钟就不算一组了（头像会各挂各的）
    private static func timeBreak(_ a: Date?, _ b: Date?) -> Bool {
        guard let a = a, let b = b else { return false }
        return b.timeIntervalSince(a) > 20 * 60
    }

    private static let hm: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f
    }()

    private static func dayLabel(_ d: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(d) { return "今天" }
        if cal.isDateInYesterday(d) { return "昨天" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "zh_CN")
        f.dateFormat = "M月d日 EEEE"
        return f.string(from: d)
    }

    /// 一条消息在列表里怎么摆：要不要先出日期、跟上一条挨不挨着、挂不挂头像
    private struct Placed: Identifiable {
        let msg: NMsg
        let dayHeader: String?
        let joinPrev: Bool
        let lastInGroup: Bool
        var id: String { msg.id }
    }

    private func placed(_ all: [NMsg]) -> [Placed] {
        var out: [Placed] = []
        let cal = Calendar.current
        for i in all.indices {
            let m = all[i]
            let prev: NMsg? = i > 0 ? all[i - 1] : nil
            let next: NMsg? = i + 1 < all.count ? all[i + 1] : nil
            var day: String? = nil
            if let t = m.time {
                if let pt = prev?.time {
                    if !cal.isDate(pt, inSameDayAs: t) { day = Self.dayLabel(t) }
                } else if prev == nil {
                    day = Self.dayLabel(t)
                }
            }
            let joinPrev = prev != nil && prev?.mine == m.mine && day == nil && !Self.timeBreak(prev?.time, m.time)
            var nextNewDay = false
            if let t = m.time, let nt = next?.time { nextNewDay = !cal.isDate(t, inSameDayAs: nt) }
            let last = next == nil || next?.mine != m.mine || nextNewDay || Self.timeBreak(m.time, next?.time)
            out.append(Placed(msg: m, dayHeader: day, joinPrev: joinPrev, lastInGroup: last))
        }
        return out
    }

    private var messageList: some View {
        let items = placed(model.msgs + liveBubbles)
        return ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0) {
                    if model.loading {
                        ProgressView().padding(.top, 40)
                    }
                    ForEach(items) { p in
                        VStack(spacing: 0) {
                            if let d = p.dayHeader {
                                Text(d)
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundColor(.secondary)
                                    .padding(.horizontal, 10).padding(.vertical, 4)
                                    .bubbleSurface(effectiveStyle, mine: false, radius: 10)
                                    .padding(.top, 12).padding(.bottom, 10)
                            }
                            row(p.msg, withAvatar: p.lastInGroup)
                        }
                        .padding(.top, p.joinPrev ? 6 : (p.dayHeader != nil ? 0 : 12))
                        .id(p.id)
                    }
                    if model.busy && liveBubbles.isEmpty {
                        typingRow.padding(.top, 12)
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 10)
            }
            // 09-25 她：「打完字空白处键盘不会下去」→ 点聊天区任意处收键盘，往下划也收（iOS 16+）。
            // 用 simultaneousGesture 不抢气泡里的长按选字。
            .simultaneousGesture(TapGesture().onEnded { Self.hideKeyboard() })
            .modifier(ScrollDismissesKeyboard())
            .onChange(of: model.msgs) { _ in
                withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            .onChange(of: model.liveText) { _ in
                // 每个字都动画滚会抖，出字时直接贴底
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        }
    }

    /// 头像那一格：一组最后一条挂头像，其余空着占位，气泡才排得齐
    @ViewBuilder private func avatarSlot(mine: Bool, show: Bool) -> some View {
        if show { avatar(mine: mine) } else { Color.clear.frame(width: Self.avatarSize, height: 1) }
    }

    @ViewBuilder private func row(_ m: NMsg, withAvatar: Bool) -> some View {
        HStack(alignment: .bottom, spacing: 8) {
            if m.mine { Spacer(minLength: 50) } else { avatarSlot(mine: false, show: withAvatar) }
            switch m.kind {
            case .sticker(let u):
                // 表情不套气泡，裸着
                RemoteImage(url: u, token: nil, placeholderSize: 120)
                    .frame(maxWidth: 120, maxHeight: 120)
            case .voice(let vid, let dur, let transcript):
                VoiceBubble(fileId: vid, dur: dur, transcript: transcript, mine: m.mine,
                            time: m.time.map { Self.hm.string(from: $0) } ?? "",
                            url: model.voiceURL(vid), style: effectiveStyle,
                            transcribe: { await model.transcribe($0) })
            case .image(let u):
                // 图也不套气泡，圆角裸图（跟网页 images-only 一样），点开看大图
                RemoteImage(url: u, token: model.authToken(for: u), placeholderSize: 160, onTap: { img in viewing = ViewingImage(img: img) })
                    .frame(maxWidth: 230, maxHeight: 300)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            case .localImage(let img):
                Image(uiImage: img).resizable().scaledToFit()
                    .frame(maxWidth: 230, maxHeight: 300)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            case .text:
                bubble(m)
            }
            if m.mine { avatarSlot(mine: true, show: withAvatar) } else { Spacer(minLength: 50) }
        }
    }

    /// 字 + 右下角的时间，一起装进一颗胶囊
    private func bubble(_ m: NMsg) -> some View {
        let blue = m.mine && effectiveStyle == .tinted
        return HStack(alignment: .lastTextBaseline, spacing: 8) {
            Text(Self.render(m.text))
                .font(.system(size: 16))
                .foregroundColor(blue ? .white : .primary)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
            if let t = m.time {
                Text(Self.hm.string(from: t))
                    .font(.system(size: 11))
                    .foregroundColor(blue ? Color.white.opacity(0.75) : .secondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .imSurface(effectiveStyle, mine: m.mine, shape: RoundedRectangle(cornerRadius: 21, style: .continuous))
    }

    private var typingRow: some View {
        HStack(alignment: .bottom, spacing: 8) {
            avatar(mine: false)
            TypingDots()
                .padding(.horizontal, 16).padding(.vertical, 14)
                .imSurface(effectiveStyle, mine: false, shape: RoundedRectangle(cornerRadius: 21, style: .continuous))
            if !model.status.isEmpty && model.status != "在想…" {
                Text(model.status).font(.system(size: 11)).foregroundColor(.secondary)
                    .padding(.bottom, 12)
            }
            Spacer()
        }
    }

    static func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    /// 行内 markdown（粗体、斜体、链接、行内代码），保留换行。解析失败就原样显示。
    static func render(_ s: String) -> AttributedString {
        if let a = try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)) {
            return a
        }
        return AttributedString(s)
    }

    // MARK: 输入 —— 一排浮着的玻璃：☰ ｜ 📎 ｜ Reply to Claude ｜ 右钮

    private func circleButton(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 17, weight: .medium))
            .frame(width: 44, height: 44)
    }

    private var composer: some View {
        VStack(spacing: 6) {
            if !model.errorText.isEmpty {
                Text(model.errorText)
                    .font(.system(size: 12))
                    .foregroundColor(.red)
                    .padding(.horizontal, 12).padding(.vertical, 5)
                    .bubbleSurface(effectiveStyle, mine: false, radius: 12)
            }

            if showThink { thinkPanel }

            HStack(alignment: .bottom, spacing: 8) {
                Button(action: { NativeChat.handOff(clickId: "openDrawer") }) { circleButton("line.3.horizontal") }
                    .bubbleSurface(effectiveStyle, mine: false, radius: 22)

                Menu {
                    Button(action: { pickingPhoto = true }) { Label("照片", systemImage: "photo") }
                    Button(action: { model.loadStickers(); showStickers = true }) { Label("表情", systemImage: "face.smiling") }
                    Button(action: { withAnimation(.easeOut(duration: 0.2)) { showThink.toggle() } }) {
                        Label(showThink ? "收起思考草稿" : "思考草稿", systemImage: "lightbulb")
                    }
                } label: { circleButton("paperclip") }
                .bubbleSurface(effectiveStyle, mine: false, radius: 22)

                VStack(alignment: .leading, spacing: 6) {
                    if !model.pending.isEmpty || model.uploading { pendingRow }
                    inputField
                        .font(.system(size: 16))
                        .padding(.vertical, 12)
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 44)
                .bubbleSurface(effectiveStyle, mine: false, radius: 22)

                rightButton
            }
            .foregroundColor(.primary)
        }
        .padding(.horizontal, 10)
        .padding(.bottom, 6)
    }

    /// 右边那颗：他在说 = ■ 叫停；有字 = ↑ 发送；空着 = 📞 打电话
    /// （参考图这里是麦克风 = 语音消息，原生还没做，先放电话）
    @ViewBuilder private var rightButton: some View {
        if model.busy {
            Button(action: { model.stop() }) { circleButton("stop.fill") }
                .bubbleSurface(effectiveStyle, mine: false, radius: 22)
        } else if canSend {
            Button(action: { doSend() }) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Color(red: 0.85, green: 0.47, blue: 0.34)))
            }
        } else {
            Button(action: { NativeChat.handOff(clickId: "callButton") }) { circleButton("phone") }
                .bubbleSurface(effectiveStyle, mine: false, radius: 22)
        }
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
            .padding(.top, 10)
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

extension View {
    /// 同 GlassChatTest 的 bubbleSurface，只是外形可以是任意 Shape。
    /// 他透明玻璃（.clear），她粉色玻璃（liquid，09-25 她从参考图的淡黄绿改成粉）；tinted = 她 iMessage 蓝。
    func imSurface<S: Shape>(_ style: BubbleStyle, mine: Bool, shape: S) -> AnyView {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *), style != .frosted {
            var glass: Glass = .regular
            if mine {
                glass = glass.tint(style == .tinted
                                   ? Color(red: 0.0, green: 0.48, blue: 1.0).opacity(0.75)
                                   : Color(red: 0.96, green: 0.62, blue: 0.74).opacity(0.5))   // 她的粉定在 0.5（09-25 试过 0.3，她说「粉色别改了」）
            } else {
                // 他那边：09-25 她嫌 .regular + 白 .35 太像牛奶（「他的可以透一点吗」）→ 换更透的 .clear，
                // 只留一点白垫着字。还嫌白就把 0.12 往下调，嫌字看不清就往上调。
                glass = Glass.clear.tint(Color.white.opacity(0.12))
            }
            return AnyView(self.glassEffect(glass.interactive(), in: shape))
        }
        #endif
        // 老系统 / 磨砂档：磨砂上叠同一层颜色，看着还是那两种色
        let wash = mine ? Color(red: 0.96, green: 0.62, blue: 0.74).opacity(0.3) : Color.white.opacity(0.1)
        return AnyView(
            self.background(shape.fill(wash))
                .background(.ultraThinMaterial, in: shape)
                .overlay(shape.stroke(Color.white.opacity(0.5), lineWidth: 0.6))
        )
    }
}

// 他在打字：三个点轮流亮
struct TypingDots: View {
    @State private var on = false

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .frame(width: 7, height: 7)
                    .opacity(on ? 0.9 : 0.25)
                    .animation(.easeInOut(duration: 0.55).repeatForever().delay(Double(i) * 0.18), value: on)
            }
        }
        .foregroundColor(.secondary)
        .onAppear { on = true }
    }
}

// MARK: - 图片（带登录头拉，缩过再缓存在内存里）

enum NImageCache {
    static let shared: NSCache<NSURL, UIImage> = {
        let c = NSCache<NSURL, UIImage>()
        c.countLimit = 80
        return c
    }()
}

enum NImage {
    /// 用 ImageIO 直接解出缩小版，不先把原图整张解进内存（一张 12MP 原图解开要 ~48MB）。
    /// 顺带把 EXIF 方向转正。
    static func downsample(_ data: Data, maxPixel: CGFloat) -> UIImage? {
        let opts = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let src = CGImageSourceCreateWithData(data as CFData, opts) else { return UIImage(data: data) }
        let thumbOpts = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ] as CFDictionary
        guard let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, thumbOpts) else { return UIImage(data: data) }
        return UIImage(cgImage: cg)
    }
}

struct RemoteImage: View {
    let url: URL?
    let token: String?
    var placeholderSize: CGFloat = 160
    var onTap: ((UIImage) -> Void)? = nil
    @State private var img: UIImage? = nil
    @State private var failed = false

    var body: some View {
        Group {
            if let img = img {
                Image(uiImage: img).resizable().scaledToFit()
                    .onTapGesture { onTap?(img) }
            } else {
                ZStack {
                    Color.primary.opacity(0.06)
                    if failed {
                        Image(systemName: "photo").foregroundColor(.secondary)
                    } else {
                        ProgressView()
                    }
                }
                .frame(width: placeholderSize, height: placeholderSize)
            }
        }
        .task(id: url) { await load() }
    }

    private func load() async {
        guard let u = url else { failed = true; return }
        if let hit = NImageCache.shared.object(forKey: u as NSURL) { img = hit; return }
        var r = URLRequest(url: u)
        if let t = token { r.setValue("Bearer " + t, forHTTPHeaderField: "Authorization") }
        // 显示用长边 1600 就够（手机屏宽 ~1200 像素），大图不缩着解，翻多了会把内存吃爆
        guard let got = try? await URLSession.shared.data(for: r), let i = NImage.downsample(got.0, maxPixel: 1600) else { failed = true; return }
        NImageCache.shared.setObject(i, forKey: u as NSURL)
        img = i
    }
}

struct ViewingImage: Identifiable {
    let id = UUID()
    let img: UIImage
}

/// 点图看大图：黑底，双指放大，点一下关
struct ImageViewer: View {
    let img: UIImage
    var onClose: () -> Void
    @State private var scale: CGFloat = 1

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            Image(uiImage: img).resizable().scaledToFit()
                .scaleEffect(scale)
                .gesture(MagnificationGesture()
                    .onChanged { scale = max(1, $0) }
                    .onEnded { _ in withAnimation(.spring()) { scale = 1 } })
        }
        .onTapGesture { onClose() }
    }
}

// MARK: - 语音条

/// 同一时间只放一条。换一条播 = 先停上一条。
@MainActor
final class VoicePlayer: ObservableObject {
    static let shared = VoicePlayer()
    @Published var playingId: String? = nil
    @Published var progress: Double = 0

    private var player: AVPlayer? = nil
    private var timeObs: Any? = nil
    private var endObs: NSObjectProtocol? = nil

    func toggle(id: String, url: URL) {
        if playingId == id { stop(); return }
        stop()
        try? AVAudioSession.sharedInstance().setCategory(.playback)
        try? AVAudioSession.sharedInstance().setActive(true)
        let item = AVPlayerItem(url: url)
        let p = AVPlayer(playerItem: item)
        player = p
        playingId = id
        progress = 0
        timeObs = p.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.1, preferredTimescale: 600), queue: .main) { [weak self] t in
            Task { @MainActor in
                guard let self = self, let d = self.player?.currentItem?.duration.seconds, d.isFinite, d > 0 else { return }
                self.progress = min(1, t.seconds / d)
            }
        }
        endObs = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.stop() }
        }
        p.play()
    }

    func stop() {
        player?.pause()
        if let o = timeObs { player?.removeTimeObserver(o) }
        timeObs = nil
        if let e = endObs { NotificationCenter.default.removeObserver(e) }
        endObs = nil
        player = nil
        playingId = nil
        progress = 0
    }
}

/// 跟网页 .voice-msg 一个样子：▶ ｜ 一排小竖条（放到哪亮到哪）｜ 时长 ｜ 转文字
/// 通话语音（transcript 非空）点「转文字」直接展开原文，不花钱；普通语音走 /api/stt 现识别。
struct VoiceBubble: View {
    let fileId: String
    let dur: String
    let transcript: String
    let mine: Bool
    let time: String
    let url: URL?
    let style: BubbleStyle
    let transcribe: (String) async -> String?

    @ObservedObject private var player = VoicePlayer.shared
    @State private var showText = false
    @State private var fetched: String? = nil
    @State private var loadingText = false

    private static let heights: [CGFloat] = [3, 6, 4, 8, 5, 7, 4, 6, 5, 3, 7, 5, 4, 6, 3]

    private var playing: Bool { player.playingId == fileId }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 9) {
                Button(action: { if let u = url { player.toggle(id: fileId, url: u) } }) {
                    Image(systemName: playing ? "pause.fill" : "play.fill")
                        .font(.system(size: 13))
                        .frame(width: 18, height: 18)
                }
                HStack(alignment: .center, spacing: 2) {
                    ForEach(0..<Self.heights.count, id: \.self) { i in
                        let lit = playing && Double(i) / Double(Self.heights.count) < player.progress
                        RoundedRectangle(cornerRadius: 1)
                            .fill(Color.primary.opacity(lit ? 0.85 : 0.35))
                            .frame(width: 2.5, height: Self.heights[i] * 1.6)
                    }
                }
                Text(dur).font(.system(size: 12)).foregroundColor(.secondary)
                Button(action: toggleText) {
                    Image(systemName: loadingText ? "ellipsis" : (showText ? "chevron.up" : "text.bubble"))
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
                if !time.isEmpty {
                    Text(time).font(.system(size: 11)).foregroundColor(.secondary)
                }
            }
            if showText, let t = shownText {
                Text(t).font(.system(size: 14))
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
            }
        }
        .foregroundColor(.primary)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .imSurface(style, mine: mine, shape: RoundedRectangle(cornerRadius: 21, style: .continuous))
    }

    private var shownText: String? { transcript.isEmpty ? fetched : transcript }

    private func toggleText() {
        if showText { showText = false; return }
        if !transcript.isEmpty || fetched != nil { showText = true; return }
        loadingText = true
        Task {
            let t = await transcribe(fileId)
            fetched = (t?.isEmpty == false) ? t : "没识别出内容"
            loadingText = false
            showText = true
        }
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

struct ScrollDismissesKeyboard: ViewModifier {
    @ViewBuilder func body(content: Content) -> some View {
        if #available(iOS 16.0, *) {
            content.scrollDismissesKeyboard(.interactively)
        } else {
            content
        }
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
