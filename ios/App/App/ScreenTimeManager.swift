import DeviceActivity
import Foundation

/// Starts / stops DeviceActivity monitoring and reads aggregated data
/// from App Group UserDefaults (written by the Monitor Extension).

@available(iOS 16.0, *)
final class ScreenTimeManager {
    static let shared = ScreenTimeManager()

    private let center = DeviceActivityCenter()
    static let activityName = DeviceActivityName("com.zzclaude.eclat.screenTime")

    // MARK: - Monitoring

    func startMonitoring() {
        let schedule = DeviceActivitySchedule(
            intervalStart: DateComponents(hour: 0, minute: 0),
            intervalEnd: DateComponents(hour: 23, minute: 59),
            repeats: true
        )

        do {
            try center.startMonitoring(Self.activityName, during: schedule)
            print("[ScreenTime] Monitoring started")
        } catch {
            print("[ScreenTime] Failed to start monitoring: \(error)")
        }
    }

    func stopMonitoring() {
        center.stopMonitoring()
        print("[ScreenTime] Monitoring stopped")
    }

    // MARK: - Read reports (written by Monitor Extension)

    static func readReport() -> [String: TimeInterval]? {
        guard let data = AppGroupDataStore.defaults()?.data(forKey: "screenTimeReport") else { return nil }
        return try? JSONDecoder().decode([String: TimeInterval].self, from: data)
    }

    static func readLastUpdate() -> Date? {
        AppGroupDataStore.defaults()?.object(forKey: "screenTimeLastUpdate") as? Date
    }
}
