#import <Capacitor/Capacitor.h>

CAP_PLUGIN(PhotoLibraryPlugin, "PhotoLib",
    CAP_PLUGIN_METHOD(recent, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(full, CAPPluginReturnPromise);
)
