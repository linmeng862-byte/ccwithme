import UIKit
import Capacitor

// 09-25：改成场景（UIScene）生命周期了 —— iOS 27 + Xcode 27 不走场景就启动即崩。
// 窗口、窗口底色、URL 打开、桌面快捷操作都搬去了 SceneDelegate.swift；
// 场景模式下这里的 `window` 永远是 nil，applicationDidBecomeActive / open url 这些也不会再被调。
@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // 长按桌面图标 →「原生聊天」（NativeChat.swift，真数据 + 液态玻璃）/「玻璃测试」（GlassChatTest.swift，假消息对比三档）。
        // 动态注册的，所以装完要先正常打开一次 app，长按才看得到这一项。点了之后走 SceneDelegate。
        application.shortcutItems = [
            UIApplicationShortcutItem(type: NativeChat.shortcutType,
                                      localizedTitle: "原生聊天",
                                      localizedSubtitle: "液态玻璃 · 测试中",
                                      icon: UIApplicationShortcutIcon(systemImageName: "bubble.left.fill"),
                                      userInfo: nil),
            UIApplicationShortcutItem(type: GlassChatTest.shortcutType,
                                      localizedTitle: "玻璃测试",
                                      localizedSubtitle: "原生液态玻璃气泡",
                                      icon: UIApplicationShortcutIcon(systemImageName: "bubble.left.and.bubble.right"),
                                      userInfo: nil)
        ]
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        // 配置写在 Info.plist 的 UIApplicationSceneManifest 里，按名字取那一份
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }
}
