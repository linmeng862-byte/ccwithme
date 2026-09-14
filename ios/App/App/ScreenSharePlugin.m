#import <Capacitor/Capacitor.h>

CAP_PLUGIN(ScreenSharePlugin, "ScreenShare",
    CAP_PLUGIN_METHOD(pair, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(status, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(unpair, CAPPluginReturnPromise);
)
