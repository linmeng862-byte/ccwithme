import Foundation
import Capacitor
import Security

// 给他看一眼屏幕（09-14）。主 app 这侧只做**配对**：
//   后端 /api/screen/pair 发一把专用钥匙 → 存进钥匙串；上传地址写进 App Group。
//   BroadcastUpload 扩展截屏时从这两处拿（她从控制中心发起时 app 根本没开，只能这样交接）。
//
// ⚠️ 钥匙进**钥匙串**，不进 UserDefaults —— UserDefaults 是明文 plist 落盘（红线：token 不落盘）。
//    钥匙串的 access group 用 App Group 的 id：iOS 允许把 app group 当钥匙串共享组，
//    扩展的 entitlements 里有同一个 group，所以它读得到。
//    group id 从 AppGroupDataStore.suiteName 拿，变体构建时 ios-prep.sh 会替换那一处，这里不用再列。
// ⚠️ 加方法要三处一起加：下面这张 pluginMethods 表、ScreenSharePlugin.m、@objc 实现
//    （漏了表 = Promise 永远不回，见 PhotoLibraryPlugin.swift 顶上）。
// ⚠️ 钥匙串的 service / account 跟 BroadcastUpload/SampleHandler.swift 里是**重复的一份**
//    （两个 target 互相看不见类型），改要改两处。
@objc(ScreenSharePlugin)
public class ScreenSharePlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "ScreenSharePlugin"
    public let jsName = "ScreenShare"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pair", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unpair", returnType: CAPPluginReturnPromise),
    ]

    static let service = "eclat.screen"
    static let account = "upload-key"
    static let urlKey = "screen_upload_url"

    /// { key, url } → { paired: true }。url 只收 https —— 钥匙要过公网。
    @objc func pair(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty,
              let url = call.getString("url"), url.hasPrefix("https://") else {
            call.reject("key 或 url 不对（url 要 https）")
            return
        }
        guard Self.saveKey(key) else {
            call.reject("钥匙串写不进去")
            return
        }
        AppGroupDataStore.defaults()?.set(url, forKey: Self.urlKey)
        call.resolve(["paired": true])
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(["paired": Self.hasKey()])
    }

    @objc func unpair(_ call: CAPPluginCall) {
        SecItemDelete(Self.baseQuery() as CFDictionary)
        AppGroupDataStore.defaults()?.removeObject(forKey: Self.urlKey)
        call.resolve(["paired": false])
    }

    // MARK: - 钥匙串

    static func baseQuery() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account,
         kSecAttrAccessGroup as String: AppGroupDataStore.suiteName]
    }

    static func saveKey(_ key: String) -> Bool {
        SecItemDelete(baseQuery() as CFDictionary)
        var q = baseQuery()
        q[kSecValueData as String] = Data(key.utf8)
        // 解锁过一次之后扩展就能读（她发起录屏时手机肯定是解锁的）；不跟 iCloud 同步到别的设备
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
    }

    static func hasKey() -> Bool {
        SecItemCopyMatching(baseQuery() as CFDictionary, nil) == errSecSuccess
    }
}
