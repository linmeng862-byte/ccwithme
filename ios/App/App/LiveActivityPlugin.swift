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
    private func thinkingArgs(_ call: CAPPluginCall) -> (ClawdPose, String) {
        let pose = call.getString("pose").flatMap(ClawdPose.init(rawValue:)) ?? .idle
        return (pose, call.getString("detail") ?? "")
    }

    @objc func laStartThinking(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false])
            return
        }
        let (pose, detail) = thinkingArgs(call)
        LiveActivityManager.startThinking(pose: pose, detail: detail)
        call.resolve(["success": true])
    }

    @objc func laUpdateThinking(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false])
            return
        }
        let (pose, detail) = thinkingArgs(call)
        LiveActivityManager.updateThinking(pose: pose, detail: detail)
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
