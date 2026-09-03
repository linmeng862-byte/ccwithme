import Foundation
import CoreBluetooth

// 通用 BLE 桥：连一个外设、往一个特征写字节。不含任何业务语义 ——
// 连哪台、写什么字节，全由 JS 侧传进来。仿 ScreenTimeManager 的单例写法。
//
// 用法（JS 侧）：
//   connect({ namePrefix?: "XXX", service: "FFE0", characteristic: "FFE1", timeoutMs?: 15000 })
//   write({ value: "55 04 00 00 01 80 AA" })   // 空格分隔的十六进制
//   disconnect()  /  isConnected()
//
// CoreBluetooth 前台即可用；后台常连需要 UIBackgroundModes: bluetooth-central + 状态恢复，
// 这一版先只保证前台（app 开着就行），后台常驻留作后续。
final class BleBridgeManager: NSObject {
    static let shared = BleBridgeManager()

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var writeChar: CBCharacteristic?

    // 连接时的目标参数
    private var wantService: CBUUID?
    private var wantChar: CBUUID?
    private var wantNamePrefix: String?

    // 回调（连接是异步多步的，用闭包把结果送回插件）
    private var onConnect: ((_ ok: Bool, _ name: String?, _ err: String?) -> Void)?
    private var connectTimer: Timer?

    // 断开事件回传给 JS
    var onDisconnected: (() -> Void)?

    private override init() {
        super.init()
        // 主队列即可；后台需求出现时再换专用队列 + 恢复标识
        central = CBCentralManager(delegate: self, queue: nil)
    }

    var isConnected: Bool {
        return peripheral?.state == .connected && writeChar != nil
    }

    // MARK: - Connect

    func connect(namePrefix: String?, service: String, characteristic: String,
                 timeoutMs: Int, completion: @escaping (_ ok: Bool, _ name: String?, _ err: String?) -> Void) {
        if isConnected {
            completion(true, peripheral?.name, nil)
            return
        }
        wantService = CBUUID(string: service)
        wantChar = CBUUID(string: characteristic)
        wantNamePrefix = (namePrefix?.isEmpty == false) ? namePrefix : nil
        onConnect = completion

        connectTimer?.invalidate()
        connectTimer = Timer.scheduledTimer(withTimeInterval: Double(timeoutMs) / 1000.0, repeats: false) { [weak self] _ in
            self?.finishConnect(ok: false, name: nil, err: "连接超时：没扫到设备（设备开机了吗？在一米内吗？）")
        }

        if central.state == .poweredOn {
            startScan()
        }
        // 若还没 poweredOn，centralManagerDidUpdateState 里会补触发
    }

    private func startScan() {
        // 有名字前缀就全扫按名字挑；否则按服务过滤（有些设备广播里不带服务 UUID，
        // 所以名字前缀那条更稳）。
        if wantNamePrefix != nil {
            central.scanForPeripherals(withServices: nil, options: nil)
        } else if let svc = wantService {
            central.scanForPeripherals(withServices: [svc], options: nil)
        } else {
            central.scanForPeripherals(withServices: nil, options: nil)
        }
    }

    private func finishConnect(ok: Bool, name: String?, err: String?) {
        connectTimer?.invalidate(); connectTimer = nil
        if central.isScanning { central.stopScan() }
        let cb = onConnect; onConnect = nil
        cb?(ok, name, err)
    }

    // MARK: - Write

    func write(hex: String, completion: @escaping (_ ok: Bool, _ err: String?) -> Void) {
        guard let p = peripheral, let c = writeChar, p.state == .connected else {
            completion(false, "还没连上"); return
        }
        guard let data = BleBridgeManager.bytesFromHex(hex) else {
            completion(false, "字节看不懂：\(hex)"); return
        }
        // 这个特征声明的是 write-without-response；优先用它，回落有响应写。
        let type: CBCharacteristicWriteType =
            c.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse
        // ⚠️ 写之前先打印完整 HEX —— 排查「模式换了没反应」时要能确认发出去的字节。
        print("[BLE TX] " + data.map { String(format: "%02X", $0) }.joined(separator: " "))
        p.writeValue(data, for: c, type: type)
        // withoutResponse 没有回执，直接当成功；withResponse 也简化为发出即成功。
        completion(true, nil)
    }

    func disconnect() {
        if let p = peripheral {
            central.cancelPeripheralConnection(p)
        }
    }

    static func bytesFromHex(_ s: String) -> Data? {
        let parts = s.split(whereSeparator: { $0 == " " || $0 == "," })
        var bytes = [UInt8]()
        for t in parts {
            let clean = t.hasPrefix("0x") || t.hasPrefix("0X") ? String(t.dropFirst(2)) : String(t)
            guard let n = UInt8(clean, radix: 16) else { return nil }
            bytes.append(n)
        }
        return bytes.isEmpty ? nil : Data(bytes)
    }
}

// MARK: - CBCentralManagerDelegate
extension BleBridgeManager: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            if onConnect != nil { startScan() }
        case .poweredOff:
            finishConnect(ok: false, name: nil, err: "系统蓝牙没开")
        case .unauthorized:
            finishConnect(ok: false, name: nil, err: "没给 app 蓝牙权限（去设置→隐私→蓝牙打开 éclat）")
        default:
            break
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        // 按名字前缀挑；没设前缀就取第一个（已按服务过滤）
        if let prefix = wantNamePrefix {
            let name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? ""
            guard name.uppercased().hasPrefix(prefix.uppercased()) else { return }
        }
        central.stopScan()
        self.peripheral = peripheral
        peripheral.delegate = self
        central.connect(peripheral, options: nil)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        if let svc = wantService {
            peripheral.discoverServices([svc])
        } else {
            peripheral.discoverServices(nil)
        }
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        finishConnect(ok: false, name: nil, err: "连接失败：\(error?.localizedDescription ?? "未知")")
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        self.writeChar = nil
        self.peripheral = nil
        onDisconnected?()
    }
}

// MARK: - CBPeripheralDelegate
extension BleBridgeManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error = error {
            finishConnect(ok: false, name: nil, err: "找服务出错：\(error.localizedDescription)"); return
        }
        guard let svc = (peripheral.services ?? []).first(where: { $0.uuid == wantService })
                ?? peripheral.services?.first else {
            finishConnect(ok: false, name: nil, err: "没找到目标服务"); return
        }
        peripheral.discoverCharacteristics(wantChar != nil ? [wantChar!] : nil, for: svc)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let error = error {
            finishConnect(ok: false, name: nil, err: "找特征出错：\(error.localizedDescription)"); return
        }
        guard let c = (service.characteristics ?? []).first(where: { $0.uuid == wantChar }) else {
            finishConnect(ok: false, name: nil, err: "服务在，但没这个特征"); return
        }
        self.writeChar = c
        finishConnect(ok: true, name: peripheral.name, err: nil)
    }
}
