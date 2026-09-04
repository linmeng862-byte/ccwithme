import Foundation
import Capacitor
import Photos
import UIKit

// 相册最近照片。给附件面板右边那条缩略图带子（#attachRecentPhotos）供货。
// 仿 BleBridgePlugin 的 CAPBridgedPlugin 写法。
//
// ⚠️ **加方法要三处一起加**：下面这张 pluginMethods 表、PhotoLibraryPlugin.m、@objc 实现。
//    漏了表的话 Capacitor 的插件代理照样返回一个函数，叫下去 Promise 永远不 resolve
//    也不 reject —— 不报错，就是永远转圈。
//
// 顺带解决 HEIC：这里出去的一律是 requestImage 解码后再编的 JPEG，
// 不存在「叫 .jpeg 的 HEIC」那种东西，后端不用再转一次。
@objc(PhotoLibraryPlugin)
public class PhotoLibraryPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "PhotoLibraryPlugin"
    public let jsName = "PhotoLib"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "recent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "full", returnType: CAPPluginReturnPromise),
    ]

    // MARK: - 权限

    /// 只读授权。iOS 14+ 有 .limited（她只选了几张给我们看）——那也算能用，
    /// 拿到几张就显示几张，不要当成拒绝。
    private func ensureAuth(_ done: @escaping (Bool, String) -> Void) {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        switch status {
        case .authorized:  done(true, "authorized")
        case .limited:     done(true, "limited")
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { s in
                switch s {
                case .authorized: done(true, "authorized")
                case .limited:    done(true, "limited")
                default:          done(false, "denied")
                }
            }
        default: done(false, "denied")
        }
    }

    // MARK: - 最近几张的缩略图

    /// { limit?: Int = 12, size?: Int = 240 }
    /// → { status: "authorized"|"limited"|"denied", photos: [{ id, thumb }] }
    /// thumb 是 data:image/jpeg;base64,… 可以直接塞进 <img src>。
    @objc func recent(_ call: CAPPluginCall) {
        let limit = max(1, min(call.getInt("limit") ?? 12, 60))
        let px    = max(80, min(call.getInt("size") ?? 240, 600))

        ensureAuth { [weak self] ok, status in
            guard ok else {
                call.resolve(["status": status, "photos": []])
                return
            }
            guard self != nil else { return }

            let opts = PHFetchOptions()
            opts.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
            opts.predicate = NSPredicate(format: "mediaType == %d", PHAssetMediaType.image.rawValue)
            opts.fetchLimit = limit
            let assets = PHAsset.fetchAssets(with: opts)

            let mgr = PHImageManager.default()
            let req = PHImageRequestOptions()
            req.isSynchronous = true                 // 已经在后台队列里了
            req.deliveryMode = .fastFormat           // 缩略图要快，不要高保真
            req.resizeMode = .fast
            req.isNetworkAccessAllowed = false       // iCloud 上没下载的就跳过，别卡住面板

            var out: [[String: Any]] = []
            let target = CGSize(width: CGFloat(px), height: CGFloat(px))
            assets.enumerateObjects { asset, _, _ in
                mgr.requestImage(for: asset, targetSize: target,
                                 contentMode: .aspectFill, options: req) { img, _ in
                    guard let img = img,
                          let data = img.jpegData(compressionQuality: 0.72) else { return }
                    out.append([
                        "id": asset.localIdentifier,
                        "thumb": "data:image/jpeg;base64," + data.base64EncodedString()
                    ])
                }
            }
            DispatchQueue.main.async {
                call.resolve(["status": status, "photos": out])
            }
        }
    }

    // MARK: - 取原图

    /// { id: String, maxSize?: Int = 1600 }
    /// → { dataUrl, filename }
    /// maxSize 是长边上限 —— 原图直出会有十几 MB，发之前前端还要再压一道，没必要。
    @objc func full(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("要传 id")
            return
        }
        let maxSize = max(320, min(call.getInt("maxSize") ?? 1600, 4096))

        ensureAuth { ok, status in
            guard ok else {
                call.reject("没有相册权限（\(status)）")
                return
            }
            let assets = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil)
            guard let asset = assets.firstObject else {
                call.reject("这张照片找不到了")
                return
            }

            let req = PHImageRequestOptions()
            req.isSynchronous = true
            req.deliveryMode = .highQualityFormat
            req.resizeMode = .exact
            req.isNetworkAccessAllowed = true        // 这张是她真要发的，iCloud 上的值得等

            // 按长边等比缩，不要拉伸
            let w = CGFloat(asset.pixelWidth), h = CGFloat(asset.pixelHeight)
            let scale = min(1.0, CGFloat(maxSize) / max(w, h))
            let target = CGSize(width: max(1, w * scale), height: max(1, h * scale))

            PHImageManager.default().requestImage(for: asset, targetSize: target,
                                                  contentMode: .aspectFit, options: req) { img, _ in
                guard let img = img,
                      let data = img.jpegData(compressionQuality: 0.86) else {
                    DispatchQueue.main.async { call.reject("这张照片读不出来") }
                    return
                }
                // 文件名带上时间，跟她相册里的顺序对得上，也不会几张重名
                let fmt = DateFormatter()
                fmt.dateFormat = "yyyyMMdd-HHmmss"
                let stamp = fmt.string(from: asset.creationDate ?? Date())
                DispatchQueue.main.async {
                    call.resolve([
                        "dataUrl": "data:image/jpeg;base64," + data.base64EncodedString(),
                        "filename": "photo-\(stamp).jpg"
                    ])
                }
            }
        }
    }
}
