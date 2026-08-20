#import <Capacitor/Capacitor.h>

CAP_PLUGIN(FocusLockPlugin, "FocusLock",
    CAP_PLUGIN_METHOD(focusLockRequestAuth, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(focusLockPickApps, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(focusLockStart, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(focusLockStop, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(focusLockStatus, CAPPluginReturnPromise);
)
