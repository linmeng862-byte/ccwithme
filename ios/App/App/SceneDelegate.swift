import UIKit
import Capacitor

// 09-25：iOS 27 起，用 Xcode 27 SDK 编的 app **必须走 UIScene 生命周期**，
// 还用老的「AppDelegate 自己管 window」那套，一启动 0.4 秒就被系统 EXC_BREAKPOINT 掐掉（黑屏闪退）。
// 苹果 WWDC25 就预告过这一条；我们一直用 Xcode 26 编，所以直到这次换 27 才撞上。
//
// 分工：window 现在归这里管 —— Info.plist 的 UISceneStoryboardFile=Main，
// 系统按 Main.storyboard 建好窗口（CAPBridgeViewController 在里面）、塞进 self.window。
// AppDelegate.window 在场景模式下永远是 nil，别再从那儿拿窗口。
//
// 原来写在 AppDelegate 里的三件事（窗口底色、URL 打开、快捷操作）在场景模式下
// 系统改成调这里，所以都搬过来了；AppDelegate 里那几个同名方法不会再被调。
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        paintBackground()

        // 冷启动时带进来的东西：场景模式下不会再走 AppDelegate 的 open url / continue / performActionFor
        if let ctx = connectionOptions.urlContexts.first {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: ctx.url, options: [:])
        }
        if let activity = connectionOptions.userActivities.first {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
        }
        if let item = connectionOptions.shortcutItem {
            openShortcut(item)   // 根视图没上屏会自己等一会儿再试
        }
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        // 跟原来 applicationDidBecomeActive 那句保险一样：storyboard 那条路 window 不一定一开始就就绪
        paintBackground()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for ctx in URLContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: ctx.url, options: [:])
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }

    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        completionHandler(openShortcut(shortcutItem))
    }

    @discardableResult
    private func openShortcut(_ item: UIApplicationShortcutItem) -> Bool {
        switch item.type {
        case NativeChat.shortcutType: NativeChat.present(from: window)
        case GlassChatTest.shortcutType: GlassChatTest.present(from: window)
        default: return false
        }
        return true
    }

    // 键盘顶起来时 webview 被 resize，下面露的是**窗口**、默认黑色 → 刷成跟网页同一个奶油白（#FDF9F3，
    // 跟 index.html 的 --bg-primary 是同一个值，改要一起改），露出来也看不出接缝。
    private func paintBackground() {
        let cream = UIColor(red: 0.992, green: 0.976, blue: 0.953, alpha: 1.0)
        window?.backgroundColor = cream
        window?.rootViewController?.view.backgroundColor = cream
    }
}
