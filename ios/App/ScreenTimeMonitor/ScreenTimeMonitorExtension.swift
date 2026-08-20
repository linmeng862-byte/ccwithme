import DeviceActivity
import ManagedSettings
import Foundation

/// DeviceActivityMonitorExtension — runs in a separate process.
/// Receives interval start/end callbacks and writes aggregated data to App Group.

final class ScreenTimeMonitorExtension: DeviceActivityMonitor {

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        print("[ScreenTimeExt] interval started: \(activity.rawValue)")
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)

        print("[ScreenTimeExt] interval ended: \(activity.rawValue)")

        // Write a basic snapshot to App Group.
        // Full per-app breakdown requires DeviceActivityReport,
        // but we can at least record total time and update timestamp.
        let defaults = UserDefaults(suiteName: "group.com.zzclaude.eclat")
        defaults?.set(Date(), forKey: "screenTimeLastUpdate")

        // If the framework provides total duration, store it
        // (Future: integrate DeviceActivityReport data here)
        let snapshot: [String: TimeInterval] = [
            "_lastInterval": Date().timeIntervalSince1970
        ]
        if let data = try? JSONEncoder().encode(snapshot) {
            defaults?.set(data, forKey: "screenTimeReport")
        }

        print("[ScreenTimeExt] snapshot written to App Group")
    }

    override func eventDidReachThreshold(_ event: DeviceActivityEvent.Name, activity: DeviceActivityName) {
        super.eventDidReachThreshold(event, activity: activity)
        print("[ScreenTimeExt] threshold reached: \(event.rawValue) for \(activity.rawValue)")
    }
}
