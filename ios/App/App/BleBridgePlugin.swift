import Foundation
import Capacitor

// 通用 BLE 桥的 Capacitor 插件外壳。仿 ScreenTimePlugin 的 CAPBridgedPlugin 写法。
// jsName = "BleBridge" —— JS 侧 registerPlugin('BleBridge') 就能拿到这些方法。
@objc(BleBridgePlugin)
public class BleBridgePlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "BleBridgePlugin"
    public let jsName = "BleBridge"

    // ⚠️ **加方法要三处一起加**：这张表、BleBridgePlugin.m、下面的 @objc 实现。
    //    漏了这张表的话，Capacitor 的插件代理照样返回一个函数，叫下去
    //    **Promise 永远不 resolve 也不 reject，catch 都进不去** —— 不报错，
    //    就是永远转圈。对面在 laUpdateThinking 上刚踩过一次。
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connectById", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isConnected", returnType: CAPPluginReturnPromise),
    ]

    public override func load() {
        // 底层断开时，转成事件发给 JS，让 UI 能把状态点变灰
        BleBridgeManager.shared.onDisconnected = { [weak self] in
            self?.notifyListeners("disconnected", data: [:])
        }
    }

    /// 扫一圈，把看到的设备列出来（不连）。返回 { devices: [{ id, name, rssi }] }
    @objc func scan(_ call: CAPPluginCall) {
        let timeoutMs = call.getInt("timeoutMs") ?? 6000
        BleBridgeManager.shared.scan(timeoutMs: timeoutMs) { devices in
            DispatchQueue.main.async { call.resolve(["devices": devices]) }
        }
    }

    /// 按 scan 返回的 id 直连 —— 不用猜名字前缀。
    @objc func connectById(_ call: CAPPluginCall) {
        guard let id = call.getString("id"),
              let service = call.getString("service"),
              let characteristic = call.getString("characteristic") else {
            call.reject("要传 id、service 和 characteristic")
            return
        }
        let timeoutMs = call.getInt("timeoutMs") ?? 15000
        BleBridgeManager.shared.connect(id: id, service: service,
                                        characteristic: characteristic, timeoutMs: timeoutMs) { ok, name, err in
            DispatchQueue.main.async {
                if ok { call.resolve(["connected": true, "name": name ?? ""]) }
                else { call.reject(err ?? "连接失败") }
            }
        }
    }

    @objc func connect(_ call: CAPPluginCall) {
        guard let service = call.getString("service"),
              let characteristic = call.getString("characteristic") else {
            call.reject("要传 service 和 characteristic")
            return
        }
        let namePrefix = call.getString("namePrefix")
        let timeoutMs = call.getInt("timeoutMs") ?? 15000
        BleBridgeManager.shared.connect(namePrefix: namePrefix, service: service,
                                        characteristic: characteristic, timeoutMs: timeoutMs) { ok, name, err in
            DispatchQueue.main.async {
                if ok { call.resolve(["connected": true, "name": name ?? ""]) }
                else { call.reject(err ?? "连接失败") }
            }
        }
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let value = call.getString("value") else {
            call.reject("要传 value（空格分隔的十六进制字节）")
            return
        }
        BleBridgeManager.shared.write(hex: value) { ok, err in
            DispatchQueue.main.async {
                if ok { call.resolve(["ok": true]) }
                else { call.reject(err ?? "写失败") }
            }
        }
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        BleBridgeManager.shared.disconnect()
        call.resolve(["ok": true])
    }

    @objc func isConnected(_ call: CAPPluginCall) {
        call.resolve(["connected": BleBridgeManager.shared.isConnected])
    }
}
