import Foundation
import Capacitor
import DeviceActivity

@objc(ScreenTimePlugin)
public class ScreenTimePlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "ScreenTimePlugin"
    public let jsName = "ScreenTime"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "screenTimeStart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "screenTimeStop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "screenTimeReport", returnType: CAPPluginReturnPromise),
    ]

    @objc func screenTimeStart(_ call: CAPPluginCall) {
        guard FamilyControlsAvailability.enabled else {
            call.resolve(["supported": false])
            return
        }
        guard #available(iOS 16.0, *) else {
            call.resolve(["supported": false])
            return
        }
        ScreenTimeManager.shared.startMonitoring()
        call.resolve(["monitoring": true])
    }

    @objc func screenTimeStop(_ call: CAPPluginCall) {
        guard FamilyControlsAvailability.enabled else {
            call.resolve(["supported": false])
            return
        }
        guard #available(iOS 16.0, *) else {
            call.resolve(["supported": false])
            return
        }
        ScreenTimeManager.shared.stopMonitoring()
        call.resolve(["monitoring": false])
    }

    @objc func screenTimeReport(_ call: CAPPluginCall) {
        guard FamilyControlsAvailability.enabled else {
            call.resolve(["supported": false])
            return
        }
        guard #available(iOS 16.0, *) else {
            call.resolve(["supported": false])
            return
        }
        let report = ScreenTimeManager.readReport() ?? [:]
        let lastUpdate = ScreenTimeManager.readLastUpdate()?.timeIntervalSince1970 ?? 0
        call.resolve([
            "supported": true,
            "report": report,
            "lastUpdate": lastUpdate
        ])
    }
}
