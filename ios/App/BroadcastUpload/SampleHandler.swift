import ReplayKit
import CoreImage
import Security
import UIKit

// ReplayKit 广播上传扩展：他想看时，给他看一眼她手机此刻的画面。
// 她从**控制中心**长按录屏、选 éclat、点开始 → 这里才会跑（不进 app，截的才是她正在看的那页）。
// broadcastStarted → 等 2 秒（控制中心收起、画面稳住）→ 抓一帧 → 压 JPEG → POST → 自己结束。
//
// 钥匙和地址是主 app 配对时留下的（ScreenSharePlugin）：
//   钥匙在钥匙串（access group = app group），地址在 App Group 的 UserDefaults。
//   ⚠️ service / account 跟 App/ScreenSharePlugin.swift 是重复的一份，改要改两处。
// 后端只在他发起后的 5 分钟里收图（/api/screen/frame），别的时候回 409 —— 她会在结束提示里看到。
class SampleHandler: RPBroadcastSampleHandler {

    private let appGroup = "group.com.zzclaude.eclat"
    private let keyService = "eclat.screen"
    private let keyAccount = "upload-key"
    private let ciContext = CIContext(options: nil)
    private var startedAt = Date()
    private var done = false      // 一次性：只传一帧
    private let settle: TimeInterval = 2.0
    private let maxWidth: CGFloat = 1080

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        startedAt = Date()
        done = false
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video, !done else { return }
        // 按时间等，不按帧数：画面不动时 ReplayKit 几乎不出帧，数帧会等很久；
        // 刚开始那一下又是控制中心还没收起的样子，截了等于白截
        guard Date().timeIntervalSince(startedAt) >= settle else { return }
        done = true

        guard let jpeg = jpegData(from: sampleBuffer) else {
            finish("截图没压出来，再试一次")
            return
        }
        upload(jpeg)
    }

    // MARK: - 帧 → JPEG（缩到 maxWidth 以内，扩展内存很紧）
    private func jpegData(from sampleBuffer: CMSampleBuffer) -> Data? {
        guard let pb = CMSampleBufferGetImageBuffer(sampleBuffer) else { return nil }
        var ci = CIImage(cvPixelBuffer: pb)
        let w = ci.extent.width
        if w > maxWidth {
            let s = maxWidth / w
            ci = ci.transformed(by: CGAffineTransform(scaleX: s, y: s))
        }
        guard let cg = ciContext.createCGImage(ci, from: ci.extent) else { return nil }
        return UIImage(cgImage: cg).jpegData(compressionQuality: 0.6)
    }

    // MARK: - 钥匙
    private func readKey() -> String? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keyService,
            kSecAttrAccount as String: keyAccount,
            kSecAttrAccessGroup as String: appGroup,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    // MARK: - 上传
    private func upload(_ jpeg: Data) {
        guard let urlStr = UserDefaults(suiteName: appGroup)?.string(forKey: "screen_upload_url"),
              let url = URL(string: urlStr),
              let key = readKey(), !key.isEmpty else {
            finish("还没配对：在 éclat 的 ⋯ 菜单里点一次 Screen for Cis")
            return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        req.setValue(key, forHTTPHeaderField: "X-Screen-Key")
        req.timeoutInterval = 12
        req.httpBody = jpeg

        URLSession.shared.dataTask(with: req) { [weak self] _, resp, err in
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            let msg: String
            switch code {
            case 200: msg = "Cis 看到了"
            case 409: msg = "他现在没在等你给他看"
            case 401: msg = "钥匙不对了：在 éclat 的 ⋯ 菜单里重新配对一次"
            default:  msg = err != nil ? "没传上去（网络）" : "没传上去（\(code)）"
            }
            self?.finish(msg)
        }.resume()
    }

    // 一次性看一眼，不赖着录屏。系统会把这句话弹给她看，所以写成她能看懂的话。
    private func finish(_ message: String) {
        DispatchQueue.main.async { [weak self] in
            self?.finishBroadcastWithError(NSError(domain: "eclat.screen", code: 0,
                userInfo: [NSLocalizedDescriptionKey: message]))
        }
    }
}
