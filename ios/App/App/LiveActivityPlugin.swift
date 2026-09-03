import Foundation
import Capacitor
import ActivityKit

@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "laStartTimer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "laUpdateTimer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "laEndTimer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "laStartThinking", returnType: CAPPluginReturnPromise),
        // ⚠️ 2026-09-03 补：这一行以前**漏了**。方法在 .m 里注册了、Swift 里也实现了，
        //    唯独不在这张表里 —— Capacitor 7 以这张表为准，不在表里的方法调下去
        //    Promise 永远不 resolve 也不 reject，连 catch 都进不去，而且不报错。
        //    表现就是「螃蟹姿势从来不变」。BleBridge 那边踩的是同一个坑。
        //    加方法记得三处一起加：这张表、.m、Manager。
        CAPPluginMethod(name: "laUpdateThinking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "laStopThinking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "laIsSupported", returnType: CAPPluginReturnPromise),
    ]

    // MARK: - Timer

    @objc func laStartTimer(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false])
            return
        }
        let title = call.getString("title") ?? ""
        let countdownSeconds = call.getInt("countdownSeconds") ?? 0
        let startedAt = call.getDouble("startedAt") ?? Date().timeIntervalSince1970

        LiveActivityManager.startTimer(
            title: title,
            countdownSeconds: countdownSeconds,
            startedAt: startedAt
        )
        call.resolve(["success": true])
    }

    @objc func laUpdateTimer(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false])
            return
        }
        let countdownSeconds = call.getInt("countdownSeconds") ?? 0
        let startedAt = call.getDouble("startedAt") ?? Date().timeIntervalSince1970

        LiveActivityManager.updateTimer(
            countdownSeconds: countdownSeconds,
            startedAt: startedAt
        )
        call.resolve(["success": true])
    }

    @objc func laEndTimer(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false])
            return
        }
        LiveActivityManager.endTimer()
        call.resolve(["success": true])
    }

    // MARK: - Thinking

    /// pose 是从 JS 过来的、唯一不受信的边界，就在这儿解一次。
    /// 往里走的 Swift 签名一律用 ClawdPose，不再传字符串。
    @available(iOS 16.2, *)
    private func thinkingArgs(_ call: CAPPluginCall) -> (ClawdPose, String, Int) {
        let pose = call.getString("pose").flatMap(ClawdPose.init(rawValue:)) ?? .idle
        // heart 不传就是 -1 = 「这次别动心率」，跟 0 =「没有数据」分开。
        // 合成一个值的话，每次推姿势都会把心率抹掉。
        return (pose, call.getString("detail") ?? "", call.getInt("heart") ?? -1)
    }

    @objc func laStartThinking(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false])
            return
        }
        let (pose, detail, heart) = thinkingArgs(call)
        LiveActivityManager.startThinking(pose: pose, detail: detail, heart: heart)
        call.resolve(["success": true])
    }

    @objc func laUpdateThinking(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false])
            return
        }
        let (pose, detail, heart) = thinkingArgs(call)
        LiveActivityManager.updateThinking(pose: pose, detail: detail, heart: heart)
        call.resolve(["success": true])
    }

    @objc func laStopThinking(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false])
            return
        }
        LiveActivityManager.stopThinking()
        call.resolve(["success": true])
    }

    // MARK: - Capability

    @objc func laIsSupported(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            call.resolve([
                "supported": true,
                "liveActivitiesEnabled": ActivityAuthorizationInfo().areActivitiesEnabled
            ])
        } else {
            call.resolve(["supported": false])
        }
    }
}
