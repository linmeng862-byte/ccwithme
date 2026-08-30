import FamilyControls
import ManagedSettings
import Foundation

/// Encapsulates Focus Lock functionality:
///   - FamilyControls authorization
///   - ManagedSettings app shielding
///   - Persists selection to App Group UserDefaults

@available(iOS 16.0, *)
final class FocusLockManager {
    static let shared = FocusLockManager()

    private let store = ManagedSettingsStore()
    private let center = AuthorizationCenter.shared

    /// True only while shields are actually applied — NOT merely because
    /// the user has picked apps. Picking and locking are separate steps.
    var isLocked: Bool {
        AppGroupDataStore.defaults()?.bool(forKey: "focusLockActive") ?? false
    }

    // MARK: - Authorization

    var isAuthorized: Bool {
        center.authorizationStatus == .approved
    }

    func requestAuthorization() async throws {
        try await center.requestAuthorization(for: .individual)
    }

    // MARK: - Selection persistence

    private func saveSelection(_ sel: FamilyActivitySelection) {
        guard let data = try? JSONEncoder().encode(sel) else { return }
        AppGroupDataStore.defaults()?.set(data, forKey: "focusLockSelection")
    }

    private func loadSelection() -> FamilyActivitySelection? {
        guard let data = AppGroupDataStore.defaults()?.data(forKey: "focusLockSelection") else { return nil }
        return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
    }

    /// Returns the saved selection (if any lock is active)
    var lockSelection: FamilyActivitySelection? {
        loadSelection()
    }

    // MARK: - Lock / Unlock

    func applySelection(_ sel: FamilyActivitySelection) {
        saveSelection(sel)
    }

    /// Shield all applications in the saved selection
    func startLock() {
        guard let sel = loadSelection() else {
            print("[FocusLock] No selection saved — cannot lock")
            return
        }
        store.shield.applications = sel.applicationTokens
        store.shield.applicationCategories = sel.categoryTokens.isEmpty
            ? nil
            : .specific(sel.categoryTokens)
        AppGroupDataStore.defaults()?.set(true, forKey: "focusLockActive")
        print("[FocusLock] Locked — apps: \(sel.applicationTokens.count), categories: \(sel.categoryTokens.count)")
    }

    /// Remove all shields
    func stopLock() {
        store.clearAllSettings()
        // Keep the selection — unlocking must not force her to re-pick the
        // apps next time. Only the active flag is cleared.
        AppGroupDataStore.defaults()?.set(false, forKey: "focusLockActive")
        print("[FocusLock] Unlocked")
    }
}
