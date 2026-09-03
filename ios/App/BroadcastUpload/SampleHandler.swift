import ReplayKit
import CoreImage
import UIKit

// ReplayKit 广播上传扩展：一次性看一眼。
// 由主 app 弹系统录屏框、她亲手点「开始直播」后，这里才会跑。
// broadcastStarted → 等屏幕稳定几帧 → 抓一帧 → 压 JPEG → POST 到后端 → 自己结束广播。
//
// ⚠️ token 和后端地址不写死：主 app（ScreenSharePlugin）在弹框前把它们写进
//    app group（group.com.zzclaude.eclat）的 UserDefaults，这里读出来用。
//    没有 token 就直接结束，不发请求。
class SampleHandler: RPBroadcastSampleHandler {

    private let appGroup = "group.com.zzclaude.eclat"
    private let ciContext = CIContext(options: nil)
    private var skip = 0          // 跳过开头几帧，等转场/画面稳定
    private var done = false      // 一次性：只传一帧
    private let maxWidth: CGFloat = 1080

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        skip = 0
        done = false
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video, !done else { return }
        skip += 1
        if skip < 6 { return }          // 前 5 帧丢掉，等画面稳
        done = true

        guard let jpeg = jpegData(from: sampleBuffer) else {
            finish("frame_encode_failed")
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

    // MARK: - 上传
    private func upload(_ jpeg: Data) {
        let defaults = UserDefaults(suiteName: appGroup)
        guard let urlStr = defaults?.string(forKey: "screen_upload_url"),
              let token = defaults?.string(forKey: "screen_token"),
              let url = URL(string: urlStr), !token.isEmpty else {
            finish("no_token")
            return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        req.setValue(token, forHTTPHeaderField: "X-Screen-Token")
        req.timeoutInterval = 12
        req.httpBody = jpeg

        let task = URLSession.shared.dataTask(with: req) { [weak self] _, _, _ in
            self?.finish(nil)   // 成功失败都收尾——一次性看一眼，不赖着录屏
        }
        task.resume()
    }

    private func finish(_ reason: String?) {
        // reason == nil 视为正常结束（不弹报错）；有 reason 也照常结束，别把录屏卡住
        DispatchQueue.main.async { [weak self] in
            self?.finishBroadcastWithError(NSError(domain: "eclat.screen", code: 0,
                userInfo: [NSLocalizedDescriptionKey: "看完了"]))
        }
    }
}
