import SwiftUI

// 像素螃蟹 Clawd —— 由 scripts/gen-clawd-sprite.py 从 static/clawd-*.svg 生成。
//
// ⚠️ 这个文件是生成的，别手改。改姿势请改 static/clawd-<姿势>.svg 后重跑那个脚本 ——
//    手改会让灵动岛那只和网页那只长得不一样，而且下次生成就被冲掉。
//
// 坐标沿用 SVG 原始网格：本体在 y[6,16]，装饰往上伸到 y 负区。绘制时按 bounds 缩放。
// 矩形已按颜色分好批、透明度烘进颜色、bounds 也算好了 —— 运行期只管画。

struct ClawdBatch {
    let color: Color
    let rects: [CGRect]
}

// 姿势名必须和 LiveActivityAttributes.swift 里的 ClawdPose 对上：
// idle / thinking / streaming / happy

enum ClawdSprite {
    // clawd-idle.svg — 10 个矩形，合成 3 批
    static let idleFull: [ClawdBatch] = [
        ClawdBatch(
            color: Color(.sRGB, red: 0.0000, green: 0.0000, blue: 0.0000, opacity: 0.5),
            rects: [
                CGRect(x: 3, y: 15, width: 9, height: 1),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.8706, green: 0.5333, blue: 0.4275, opacity: 1),
            rects: [
                CGRect(x: 3, y: 11, width: 1, height: 4),
                CGRect(x: 5, y: 11, width: 1, height: 4),
                CGRect(x: 9, y: 11, width: 1, height: 4),
                CGRect(x: 11, y: 11, width: 1, height: 4),
                CGRect(x: 2, y: 6, width: 11, height: 7),
                CGRect(x: 0, y: 9, width: 2, height: 2),
                CGRect(x: 13, y: 9, width: 2, height: 2),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.0000, green: 0.0000, blue: 0.0000, opacity: 1),
            rects: [
                CGRect(x: 4, y: 8, width: 1, height: 2),
                CGRect(x: 10, y: 8, width: 1, height: 2),
            ]),
    ]
    static let idleFullBounds = CGRect(x: 0, y: 6, width: 15, height: 10)
    // clawd-idle.svg 的本体部分 — 10 个矩形，合成 3 批
    static let idleBody: [ClawdBatch] = [
        ClawdBatch(
            color: Color(.sRGB, red: 0.0000, green: 0.0000, blue: 0.0000, opacity: 0.5),
            rects: [
                CGRect(x: 3, y: 15, width: 9, height: 1),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.8706, green: 0.5333, blue: 0.4275, opacity: 1),
            rects: [
                CGRect(x: 3, y: 11, width: 1, height: 4),
                CGRect(x: 5, y: 11, width: 1, height: 4),
                CGRect(x: 9, y: 11, width: 1, height: 4),
                CGRect(x: 11, y: 11, width: 1, height: 4),
                CGRect(x: 2, y: 6, width: 11, height: 7),
                CGRect(x: 0, y: 9, width: 2, height: 2),
                CGRect(x: 13, y: 9, width: 2, height: 2),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.0000, green: 0.0000, blue: 0.0000, opacity: 1),
            rects: [
                CGRect(x: 4, y: 8, width: 1, height: 2),
                CGRect(x: 10, y: 8, width: 1, height: 2),
            ]),
    ]
    static let idleBodyBounds = CGRect(x: 0, y: 6, width: 15, height: 10)

    // clawd-thinking.svg — 37 个矩形，合成 10 批
    static let thinkingFull: [ClawdBatch] = [
        ClawdBatch(
            color: Color(.sRGB, red: 0.0000, green: 0.0000, blue: 0.0000, opacity: 0.5),
            rects: [
                CGRect(x: 3, y: 15, width: 9, height: 1),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.8706, green: 0.5333, blue: 0.4275, opacity: 1),
            rects: [
                CGRect(x: 3, y: 13, width: 1, height: 2),
                CGRect(x: 5, y: 13, width: 1, height: 2),
                CGRect(x: 9, y: 13, width: 1, height: 2),
                CGRect(x: 11, y: 13, width: 1, height: 2),
                CGRect(x: 2, y: 6, width: 11, height: 7),
                CGRect(x: 0, y: 9, width: 2, height: 2),
                CGRect(x: 13, y: 9, width: 2, height: 2),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.0000, green: 0.0000, blue: 0.0000, opacity: 1),
            rects: [
                CGRect(x: 4, y: 8, width: 1, height: 2),
                CGRect(x: 10, y: 8, width: 1, height: 2),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.7490, green: 0.9176, blue: 1.0000, opacity: 1),
            rects: [
                CGRect(x: 3, y: -5, width: 1, height: 1),
                CGRect(x: 8, y: 0, width: 1, height: 1),
                CGRect(x: 4, y: 4, width: 1, height: 1),
                CGRect(x: -3, y: 0, width: 1, height: 1),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 1.0000, green: 1.0000, blue: 1.0000, opacity: 1),
            rects: [
                CGRect(x: 1, y: 4, width: 1, height: 1),
                CGRect(x: 2, y: 5.5, width: 0.5, height: 0.5),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.1451, green: 0.4078, blue: 0.5686, opacity: 1),
            rects: [
                CGRect(x: 0, y: -1, width: 1, height: 1),
                CGRect(x: 2, y: -1, width: 1, height: 1),
                CGRect(x: 4, y: -1, width: 1, height: 1),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.7490, green: 0.9176, blue: 1.0000, opacity: 1),
            rects: [
                CGRect(x: 12, y: -5, width: 1, height: 1),
                CGRect(x: 18, y: 0, width: 1, height: 1),
                CGRect(x: 15, y: 4, width: 1, height: 1),
                CGRect(x: 7, y: 0, width: 1, height: 1),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 1.0000, green: 1.0000, blue: 1.0000, opacity: 1),
            rects: [
                CGRect(x: 13, y: 4, width: 1, height: 1),
                CGRect(x: 12.5, y: 5.5, width: 0.5, height: 0.5),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.1451, green: 0.4078, blue: 0.5686, opacity: 1),
            rects: [
                CGRect(x: 10, y: -1, width: 1, height: 1),
                CGRect(x: 12, y: -1, width: 1, height: 1),
                CGRect(x: 14, y: -1, width: 1, height: 1),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 1.0000, green: 0.8784, blue: 0.4000, opacity: 1),
            rects: [
                CGRect(x: 6, y: -7, width: 1, height: 0.6),
                CGRect(x: 6, y: -6.4, width: 1, height: 1),
                CGRect(x: 6, y: -5.4, width: 1, height: 0.6),
                CGRect(x: 5, y: -6.4, width: 1, height: 1),
                CGRect(x: 7, y: -6.4, width: 1, height: 1),
                CGRect(x: 8, y: -7, width: 1, height: 0.6),
                CGRect(x: 8, y: -6.4, width: 1, height: 1),
                CGRect(x: 8, y: -5.4, width: 1, height: 0.6),
                CGRect(x: 9, y: -6.4, width: 1, height: 1),
            ]),
    ]
    static let thinkingFullBounds = CGRect(x: -3, y: -7, width: 22, height: 23)
    // clawd-thinking.svg 的本体部分 — 10 个矩形，合成 3 批
    static let thinkingBody: [ClawdBatch] = [
        ClawdBatch(
            color: Color(.sRGB, red: 0.0000, green: 0.0000, blue: 0.0000, opacity: 0.5),
            rects: [
                CGRect(x: 3, y: 15, width: 9, height: 1),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.8706, green: 0.5333, blue: 0.4275, opacity: 1),
            rects: [
                CGRect(x: 3, y: 13, width: 1, height: 2),
                CGRect(x: 5, y: 13, width: 1, height: 2),
                CGRect(x: 9, y: 13, width: 1, height: 2),
                CGRect(x: 11, y: 13, width: 1, height: 2),
                CGRect(x: 2, y: 6, width: 11, height: 7),
                CGRect(x: 0, y: 9, width: 2, height: 2),
                CGRect(x: 13, y: 9, width: 2, height: 2),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.0000, green: 0.0000, blue: 0.0000, opacity: 1),
            rects: [
                CGRect(x: 4, y: 8, width: 1, height: 2),
                CGRect(x: 10, y: 8, width: 1, height: 2),
            ]),
    ]
    static let thinkingBodyBounds = CGRect(x: 0, y: 6, width: 15, height: 10)

    // clawd-streaming.svg — 58 个矩形，合成 15 批
    static let streamingFull: [ClawdBatch] = [
        ClawdBatch(
            color: Color(.sRGB, red: 0.0000, green: 0.0000, blue: 0.0000, opacity: 0.5),
            rects: [
                CGRect(x: 3, y: 15, width: 9, height: 1),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.1176, green: 0.1176, blue: 0.1804, opacity: 1),
            rects: [
                CGRect(x: -0.5, y: -6, width: 13.5, height: 10.5),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.1765, green: 0.1765, blue: 0.2392, opacity: 1),
            rects: [
                CGRect(x: -0.5, y: -6, width: 13.5, height: 1.2),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 1.0000, green: 0.3725, blue: 0.3373, opacity: 1),
            rects: [
                CGRect(x: 0.3, y: -5.6, width: 0.5, height: 0.4),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 1.0000, green: 0.7412, blue: 0.1804, opacity: 1),
            rects: [
                CGRect(x: 1.2, y: -5.6, width: 0.5, height: 0.4),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.1529, green: 0.7882, blue: 0.2471, opacity: 1),
            rects: [
                CGRect(x: 2.1, y: -5.6, width: 0.5, height: 0.4),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.2980, green: 0.6863, blue: 0.3137, opacity: 0.8),
            rects: [
                CGRect(x: 0.5, y: -3.5, width: 5, height: 0.7),
                CGRect(x: 2, y: -1.8, width: 8, height: 0.7),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.2510, green: 0.7686, blue: 1.0000, opacity: 0.7),
            rects: [
                CGRect(x: 2, y: -0.1, width: 4.5, height: 0.7),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 1.0000, green: 0.7569, blue: 0.0275, opacity: 0.7),
            rects: [
                CGRect(x: 0.5, y: 1.6, width: 2, height: 0.7),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.8706, green: 0.5333, blue: 0.4275, opacity: 1),
            rects: [
                CGRect(x: 3, y: 13, width: 1, height: 2),
                CGRect(x: 5, y: 13, width: 1, height: 2),
                CGRect(x: 9, y: 13, width: 1, height: 2),
                CGRect(x: 11, y: 13, width: 1, height: 2),
                CGRect(x: 2, y: 6, width: 11, height: 7),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.0000, green: 0.0000, blue: 0.0000, opacity: 1),
            rects: [
                CGRect(x: 4, y: 8, width: 1, height: 2),
                CGRect(x: 10, y: 8, width: 1, height: 2),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.2706, green: 0.3529, blue: 0.3922, opacity: 1),
            rects: [
                CGRect(x: 0, y: 0, width: 16, height: 3.2),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.4706, green: 0.5647, blue: 0.6118, opacity: 1),
            rects: [
                CGRect(x: 0.5, y: 0.4, width: 1, height: 0.7),
                CGRect(x: 1.8, y: 0.4, width: 1, height: 0.7),
                CGRect(x: 3.5, y: 0.4, width: 6, height: 0.7),
                CGRect(x: 10.2, y: 0.4, width: 1, height: 0.7),
                CGRect(x: 11.5, y: 0.4, width: 1, height: 0.7),
                CGRect(x: 12.8, y: 0.4, width: 1, height: 0.7),
                CGRect(x: 14.1, y: 0.4, width: 1.3, height: 0.7),
                CGRect(x: 0.8, y: 1.3, width: 0.9, height: 0.7),
                CGRect(x: 2, y: 1.3, width: 0.9, height: 0.7),
                CGRect(x: 3.2, y: 1.3, width: 0.9, height: 0.7),
                CGRect(x: 4.4, y: 1.3, width: 0.9, height: 0.7),
                CGRect(x: 5.6, y: 1.3, width: 0.9, height: 0.7),
                CGRect(x: 6.8, y: 1.3, width: 0.9, height: 0.7),
                CGRect(x: 8, y: 1.3, width: 0.9, height: 0.7),
                CGRect(x: 9.2, y: 1.3, width: 0.9, height: 0.7),
                CGRect(x: 10.4, y: 1.3, width: 0.9, height: 0.7),
                CGRect(x: 11.6, y: 1.3, width: 0.9, height: 0.7),
                CGRect(x: 12.8, y: 1.3, width: 0.9, height: 0.7),
                CGRect(x: 14, y: 1.3, width: 0.9, height: 0.7),
                CGRect(x: 0.5, y: 2.2, width: 0.9, height: 0.7),
                CGRect(x: 1.7, y: 2.2, width: 0.9, height: 0.7),
                CGRect(x: 2.9, y: 2.2, width: 0.9, height: 0.7),
                CGRect(x: 4.1, y: 2.2, width: 0.9, height: 0.7),
                CGRect(x: 5.3, y: 2.2, width: 0.9, height: 0.7),
                CGRect(x: 6.5, y: 2.2, width: 0.9, height: 0.7),
                CGRect(x: 7.7, y: 2.2, width: 0.9, height: 0.7),
                CGRect(x: 8.9, y: 2.2, width: 0.9, height: 0.7),
                CGRect(x: 10.1, y: 2.2, width: 0.9, height: 0.7),
                CGRect(x: 11.3, y: 2.2, width: 0.9, height: 0.7),
                CGRect(x: 12.5, y: 2.2, width: 0.9, height: 0.7),
                CGRect(x: 13.7, y: 2.2, width: 0.9, height: 0.7),
                CGRect(x: 14.9, y: 2.2, width: 0.6, height: 0.7),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.6902, green: 0.7451, blue: 0.7725, opacity: 1),
            rects: [
                CGRect(x: 4.4, y: 1.3, width: 0.9, height: 0.7),
                CGRect(x: 9.2, y: 1.3, width: 0.9, height: 0.7),
                CGRect(x: 2.9, y: 2.2, width: 0.9, height: 0.7),
                CGRect(x: 7.7, y: 2.2, width: 0.9, height: 0.7),
                CGRect(x: 11.6, y: 1.3, width: 0.9, height: 0.7),
                CGRect(x: 3.5, y: 0.4, width: 6, height: 0.7),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.8706, green: 0.5333, blue: 0.4275, opacity: 1),
            rects: [
                CGRect(x: 0, y: 9, width: 2, height: 2),
                CGRect(x: 13, y: 9, width: 2, height: 2),
            ]),
    ]
    static let streamingFullBounds = CGRect(x: -0.5, y: -6, width: 16.5, height: 22)
    // clawd-streaming.svg 的本体部分 — 10 个矩形，合成 4 批
    static let streamingBody: [ClawdBatch] = [
        ClawdBatch(
            color: Color(.sRGB, red: 0.0000, green: 0.0000, blue: 0.0000, opacity: 0.5),
            rects: [
                CGRect(x: 3, y: 15, width: 9, height: 1),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.8706, green: 0.5333, blue: 0.4275, opacity: 1),
            rects: [
                CGRect(x: 3, y: 13, width: 1, height: 2),
                CGRect(x: 5, y: 13, width: 1, height: 2),
                CGRect(x: 9, y: 13, width: 1, height: 2),
                CGRect(x: 11, y: 13, width: 1, height: 2),
                CGRect(x: 2, y: 6, width: 11, height: 7),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.0000, green: 0.0000, blue: 0.0000, opacity: 1),
            rects: [
                CGRect(x: 4, y: 8, width: 1, height: 2),
                CGRect(x: 10, y: 8, width: 1, height: 2),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.8706, green: 0.5333, blue: 0.4275, opacity: 1),
            rects: [
                CGRect(x: 0, y: 9, width: 2, height: 2),
                CGRect(x: 13, y: 9, width: 2, height: 2),
            ]),
    ]
    static let streamingBodyBounds = CGRect(x: 0, y: 6, width: 15, height: 10)

    // clawd-happy.svg — 10 个矩形，合成 3 批
    static let happyFull: [ClawdBatch] = [
        ClawdBatch(
            color: Color(.sRGB, red: 0.0000, green: 0.0000, blue: 0.0000, opacity: 1),
            rects: [
                CGRect(x: 3, y: 15, width: 9, height: 1),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.8706, green: 0.5333, blue: 0.4275, opacity: 1),
            rects: [
                CGRect(x: 3, y: 13, width: 1, height: 2),
                CGRect(x: 5, y: 13, width: 1, height: 2),
                CGRect(x: 9, y: 13, width: 1, height: 2),
                CGRect(x: 11, y: 13, width: 1, height: 2),
                CGRect(x: 2, y: 6, width: 11, height: 7),
                CGRect(x: 0, y: 9, width: 2, height: 2),
                CGRect(x: 13, y: 9, width: 2, height: 2),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.0000, green: 0.0000, blue: 0.0000, opacity: 1),
            rects: [
                CGRect(x: 4, y: 8, width: 1, height: 2),
                CGRect(x: 10, y: 8, width: 1, height: 2),
            ]),
    ]
    static let happyFullBounds = CGRect(x: 0, y: 6, width: 15, height: 10)
    // clawd-happy.svg 的本体部分 — 10 个矩形，合成 3 批
    static let happyBody: [ClawdBatch] = [
        ClawdBatch(
            color: Color(.sRGB, red: 0.0000, green: 0.0000, blue: 0.0000, opacity: 1),
            rects: [
                CGRect(x: 3, y: 15, width: 9, height: 1),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.8706, green: 0.5333, blue: 0.4275, opacity: 1),
            rects: [
                CGRect(x: 3, y: 13, width: 1, height: 2),
                CGRect(x: 5, y: 13, width: 1, height: 2),
                CGRect(x: 9, y: 13, width: 1, height: 2),
                CGRect(x: 11, y: 13, width: 1, height: 2),
                CGRect(x: 2, y: 6, width: 11, height: 7),
                CGRect(x: 0, y: 9, width: 2, height: 2),
                CGRect(x: 13, y: 9, width: 2, height: 2),
            ]),
        ClawdBatch(
            color: Color(.sRGB, red: 0.0000, green: 0.0000, blue: 0.0000, opacity: 1),
            rects: [
                CGRect(x: 4, y: 8, width: 1, height: 2),
                CGRect(x: 10, y: 8, width: 1, height: 2),
            ]),
    ]
    static let happyBodyBounds = CGRect(x: 0, y: 6, width: 15, height: 10)

    /// bodyOnly = true 时只给本体那份（装饰已在生成期剔除）。
    static func sprite(for pose: ClawdPose, bodyOnly: Bool) -> ([ClawdBatch], CGRect) {
        switch (pose, bodyOnly) {
        case (.idle, false): return (idleFull, idleFullBounds)
        case (.idle, true):  return (idleBody, idleBodyBounds)
        case (.thinking, false): return (thinkingFull, thinkingFullBounds)
        case (.thinking, true):  return (thinkingBody, thinkingBodyBounds)
        case (.streaming, false): return (streamingFull, streamingFullBounds)
        case (.streaming, true):  return (streamingBody, streamingBodyBounds)
        case (.happy, false): return (happyFull, happyFullBounds)
        case (.happy, true):  return (happyBody, happyBodyBounds)
        }
    }
}

/// 把像素网格画成 SwiftUI 图形。Canvas 一次画完，比堆 ZStack 便宜。
struct ClawdView: View {
    let pose: ClawdPose
    /// true = 只画本体（compact / minimal 那种小尺寸用）
    var bodyOnly: Bool = false

    var body: some View {
        let (batches, bounds) = ClawdSprite.sprite(for: pose, bodyOnly: bodyOnly)
        Canvas { ctx, size in
            let scale = min(size.width / bounds.width, size.height / bounds.height)
            // 居中：缩放后可能填不满给定尺寸，剩下的空间均分到两边
            let ox = (size.width  - bounds.width  * scale) / 2 - bounds.minX * scale
            let oy = (size.height - bounds.height * scale) / 2 - bounds.minY * scale
            for batch in batches {
                var path = Path()
                for r in batch.rects {
                    path.addRect(CGRect(x: ox + r.minX * scale, y: oy + r.minY * scale,
                                        width: r.width * scale, height: r.height * scale))
                }
                ctx.fill(path, with: .color(batch.color))
            }
        }
        .aspectRatio(bounds.width / bounds.height, contentMode: .fit)
    }
}
