import Foundation
import Capacitor
import FamilyControls
import SwiftUI

@objc(FocusLockPlugin)
public class FocusLockPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "FocusLockPlugin"
    public let jsName = "FocusLock"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "focusLockRequestAuth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "focusLockPickApps", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "focusLockStart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "focusLockStop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "focusLockStatus", returnType: CAPPluginReturnPromise),
    ]

    // MARK: - Authorization

    @objc func focusLockRequestAuth(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.resolve(["supported": false])
            return
        }
        Task {
            do {
                try await FocusLockManager.shared.requestAuthorization()
                call.resolve(["authorized": FocusLockManager.shared.isAuthorized])
            } catch {
                call.resolve(["authorized": false, "error": error.localizedDescription])
            }
        }
    }

    // MARK: - App Picker

    @objc func focusLockPickApps(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.resolve(["supported": false])
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let presenter = self?.bridge?.viewController else {
                call.reject("No view controller to present from")
                return
            }

            let wrapper = FocusLockPickerWrapper(
                onDismiss: { selection in
                    FocusLockManager.shared.applySelection(selection)
                    call.resolve([
                        "appCount": selection.applicationTokens.count,
                        "categoryCount": selection.categoryTokens.count
                    ])
                },
                onDismissRequested: { [weak presenter] in
                    presenter?.presentedViewController?.dismiss(animated: true)
                }
            )

            let controller = UIHostingController(rootView: wrapper)
            controller.modalPresentationStyle = .formSheet
            presenter.present(controller, animated: true)
        }
    }

    // MARK: - Lock / Unlock

    @objc func focusLockStart(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.resolve(["supported": false])
            return
        }
        FocusLockManager.shared.startLock()
        // startLock is a no-op when nothing was picked — report the real state.
        call.resolve(["locked": FocusLockManager.shared.isLocked])
    }

    @objc func focusLockStop(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.resolve(["supported": false])
            return
        }
        FocusLockManager.shared.stopLock()
        call.resolve(["locked": FocusLockManager.shared.isLocked])
    }

    @objc func focusLockStatus(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.resolve(["supported": false, "locked": false, "authorized": false])
            return
        }
        call.resolve([
            "supported": true,
            "locked": FocusLockManager.shared.isLocked,
            "hasSelection": FocusLockManager.shared.lockSelection != nil,
            "authorized": FocusLockManager.shared.isAuthorized
        ])
    }
}

// MARK: - FamilyActivityPicker Wrapper

/// Reference box: the View struct is re-created on every render, so the
/// "already resolved" flag has to live outside it.
fileprivate final class FocusLockFinishedFlag {
    var value = false
}

@available(iOS 16.0, *)
fileprivate struct FocusLockPickerWrapper: View {
    @State private var selection = FamilyActivitySelection()
    /// Both "Done" and .onDisappear can fire; the call may only be resolved once.
    private let finished = FocusLockFinishedFlag()
    private let onDismiss: (FamilyActivitySelection) -> Void
    private let onDismissRequested: () -> Void

    init(onDismiss: @escaping (FamilyActivitySelection) -> Void,
         onDismissRequested: @escaping () -> Void) {
        self.onDismiss = onDismiss
        self.onDismissRequested = onDismissRequested
    }

    private func finish(_ sel: FamilyActivitySelection) {
        guard !finished.value else { return }
        finished.value = true
        onDismiss(sel)
    }

    var body: some View {
        NavigationView {
            FamilyActivityPicker(selection: $selection)
                .navigationTitle("Choose Apps to Block")
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") {
                            finish(selection)
                            onDismissRequested()
                        }
                    }
                }
        }
        .onDisappear {
            // Swipe-to-dismiss: keep whatever was picked.
            finish(selection)
        }
    }
}
