#import <Capacitor/Capacitor.h>

CAP_PLUGIN(LiveActivityPlugin, "LiveActivity",
    CAP_PLUGIN_METHOD(laStartTimer, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(laUpdateTimer, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(laEndTimer, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(laStartThinking, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(laUpdateThinking, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(laStopThinking, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(laIsSupported, CAPPluginReturnPromise);
)
