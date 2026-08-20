#import <Capacitor/Capacitor.h>

CAP_PLUGIN(ScreenTimePlugin, "ScreenTime",
    CAP_PLUGIN_METHOD(screenTimeStart, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(screenTimeStop, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(screenTimeReport, CAPPluginReturnPromise);
)
