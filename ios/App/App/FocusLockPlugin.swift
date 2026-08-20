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

        DispatchQueue.main.async {
            let wrapper = FocusLockPickerWrapper { selection in
                FocusLockManager.shared.applySelection(selection)
                call.resolve([
                    "appCount": selection.applicationTokens.count,
                    "categoryCount": selection.categoryTokens.count
                ])
            }

            let host = UIHostingController(rootView: wrapper)
            host.modalPresentationStyle = .formSheet
            self.bridge?.viewController?.present(host, animated: true)
        }
    }

    // MARK: - Lock / Unlock

    @objc func focusLockStart(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.resolve(["supported": false])
            return
        }
        FocusLockManager.shared.startLock()
        call.resolve(["locked": true])
    }

    @objc func focusLockStop(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.resolve(["supported": false])
            return
        }
        FocusLockManager.shared.stopLock()
        call.resolve(["locked": false])
    }

    @objc func focusLockStatus(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.resolve(["supported": false, "locked": false, "authorized": false])
            return
        }
        call.resolve([
            "supported": true,
            "locked": FocusLockManager.shared.isLocked,
            "authorized": FocusLockManager.shared.isAuthorized
        ])
    }
}

// MARK: - FamilyActivityPicker Wrapper

@available(iOS 16.0, *)
fileprivate struct FocusLockPickerWrapper: View {
    @State private var selection = FamilyActivitySelection()
    let onDismiss: (FamilyActivitySelection) -> Void

    var body: some View {
        NavigationView {
            FamilyActivityPicker(selection: $selection)
                .navigationTitle("Choose Apps to Block")
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") {
                            onDismiss(selection)
                        }
                    }
                }
        }
        .onDisappear {
            onDismiss(selection)
        }
    }
}
