#import <Capacitor/Capacitor.h>

CAP_PLUGIN(BleBridgePlugin, "BleBridge",
    CAP_PLUGIN_METHOD(connect, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(write, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(disconnect, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(isConnected, CAPPluginReturnPromise);
)
