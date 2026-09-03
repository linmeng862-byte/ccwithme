#!/usr/bin/env python3
"""把 static/clawd-*.svg 的像素网格转成 SwiftUI 能画的矩形，生成 ClawdSprite.swift。

用法:  python3 scripts/gen-clawd-sprite.py
输出:  ios/App/LiveActivityWidget/ClawdSprite.swift（直接覆盖）

为什么要有这一步：WidgetKit 既不渲染 SVG 也不播动图 GIF，所以灵动岛里的螃蟹
没法直接用 static/ 那些素材。好在那些 SVG 本来就是整数网格上的纯 <rect>，
转成 SwiftUI 原生绘制反而更好 —— 任意尺寸都锐利、零资源体积。

⚠️ 改了姿势要重跑这个脚本，别手改 ClawdSprite.swift 里的坐标。
   手改会让灵动岛那只和网页那只长得不一样，而且下次重新生成就被冲掉。

非 <rect> 的元素（path / circle / polyline / use）会被丢掉 —— 那些是装饰
（sleep 的 zzz、happy 的嘴巴线条）。实测这四个姿势丢掉后仍然认得出，
但换新姿势时记得自己看一眼输出对不对。

能在生成期干的活都在这儿干掉了，因为 SwiftUI 的 body 会被反复求值
（每次推帧、每次尺寸/主题变化、灵动岛三个区域各一份），运行期重算纯属浪费：
  - bounds 生成时算好，不在 body 里遍历数组求 min/max
  - "只要本体" 的那份单独生成，运行期不再逐像素判断该不该画
  - opacity 烘进颜色，不在每帧每像素构造新的 Color
  - 同色矩形合成一个 Path 一次 fill，draw call 从几十降到个位数
  - 完全重合的重复矩形去掉（SVG 里有画了又被盖住的）
"""
import os
import xml.etree.ElementTree as ET

NS = '{http://www.w3.org/2000/svg}'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'ios/App/LiveActivityWidget/ClawdSprite.swift')

# 灵动岛就那么大，姿势多了根本分不清。加姿势记得让 JS 那边也传得出这个名字。
POSES = ['idle', 'thinking', 'streaming', 'happy', 'doze']

# 螃蟹本体所在的行范围。装饰（思考泡、笔记本、zzz）都在 y < 6 的上方，
# compact / minimal 区域太小，画上去糊成一团，所以只留这个范围里的矩形。
# 左右和上下的实际边界由本体像素自己算，不写死 —— 写死会差半格，看着偏心。
BODY_Y0, BODY_Y1 = 6, 16


def collect(el, parent_fill='#000000', parent_op=1.0, out=None):
    """递归收集 <rect>，fill / opacity 沿 <g> 继承。"""
    out = [] if out is None else out
    fill = el.get('fill') or parent_fill
    op = float(el.get('opacity')) if el.get('opacity') else parent_op
    for ch in el:
        tag = ch.tag.replace(NS, '')
        if tag == 'rect':
            out.append((
                float(ch.get('x', 0)), float(ch.get('y', 0)),
                float(ch.get('width', 0)), float(ch.get('height', 0)),
                ch.get('fill') or fill,
                float(ch.get('opacity')) if ch.get('opacity') else op,
            ))
        elif tag == 'g':
            collect(ch, fill, op, out)
    return out


def norm(color):
    c = color.lstrip('#')
    if len(c) == 3:
        c = ''.join(x * 2 for x in c)
    return c.upper()


def batches(rects):
    """把**相邻**的同色矩形并成一批，顺带去掉一批之内完全重合的重复矩形。

    ⚠️ 只能并相邻的，不能按颜色全局分组 —— 这些素材是有绘制顺序的：
    idle/happy 的眼睛是黑色、画在身体之后压在身体上，而地面阴影也是黑色、
    画在身体之前。全局分组会把两处黑并成一批提到最前面，身体一画上去
    眼睛就没了（真踩过：happy 变成一只没有眼睛的螃蟹）。
    按相邻分组既保住了画家顺序，又拿到了绝大部分合批收益。
    """
    out = []
    for x, y, w, h, col, op in rects:
        key = (norm(col), round(op, 4))
        rect = (x, y, w, h)
        if out and out[-1][0] == key:
            if rect not in out[-1][1]:
                out[-1][1].append(rect)
        else:
            out.append((key, [rect]))
    return out


def bounds_of(rects):
    return (min(r[0] for r in rects), min(r[1] for r in rects),
            max(r[0] + r[2] for r in rects) - min(r[0] for r in rects),
            max(r[1] + r[3] for r in rects) - min(r[1] for r in rects))


def emit_variant(add, pose, variant, rects):
    bs = batches(rects)
    total = sum(len(r) for _, r in bs)
    add('    // clawd-%s.svg%s — %d 个矩形，合成 %d 批'
        % (pose, ' 的本体部分' if variant == 'Body' else '', total, len(bs)))
    add('    static let %s%s: [ClawdBatch] = [' % (pose, variant))
    for (col, op), rs in bs:
        r, g, b = (int(col[i:i + 2], 16) / 255 for i in (0, 2, 4))
        add('        ClawdBatch(')
        add('            color: Color(.sRGB, red: %.4f, green: %.4f, blue: %.4f, opacity: %g),'
            % (r, g, b, op))
        add('            rects: [')
        for x, y, w, h in rs:
            add('                CGRect(x: %g, y: %g, width: %g, height: %g),' % (x, y, w, h))
        add('            ]),')
    add('    ]')
    bx, by, bw, bh = bounds_of(rects)
    add('    static let %s%sBounds = CGRect(x: %g, y: %g, width: %g, height: %g)'
        % (pose, variant, bx, by, bw, bh))
    return total, len(bs)


def main():
    data = {}
    for pose in POSES:
        path = os.path.join(ROOT, 'static', 'clawd-%s.svg' % pose)
        rects = collect(ET.parse(path).getroot())
        if not rects:
            raise SystemExit('%s 里一个 <rect> 都没有，姿势名写错了？' % path)
        body = [r for r in rects if BODY_Y0 <= r[1] and r[1] + r[3] <= BODY_Y1]
        if not body:
            raise SystemExit('clawd-%s.svg 的本体是空的，BODY_Y0/Y1 该调了？' % pose)
        data[pose] = (rects, body)

    L = []
    add = L.append
    add('import SwiftUI')
    add('')
    add('// 像素螃蟹 Clawd —— 由 scripts/gen-clawd-sprite.py 从 static/clawd-*.svg 生成。')
    add('//')
    add('// ⚠️ 这个文件是生成的，别手改。改姿势请改 static/clawd-<姿势>.svg 后重跑那个脚本 ——')
    add('//    手改会让灵动岛那只和网页那只长得不一样，而且下次生成就被冲掉。')
    add('//')
    add('// 坐标沿用 SVG 原始网格：本体在 y[6,16]，装饰往上伸到 y 负区。绘制时按 bounds 缩放。')
    add('// 矩形已按颜色分好批、透明度烘进颜色、bounds 也算好了 —— 运行期只管画。')
    add('')
    add('struct ClawdBatch {')
    add('    let color: Color')
    add('    let rects: [CGRect]')
    add('}')
    add('')
    # ClawdPose 故意不在这儿生成 —— 它是 app 和 widget 两个 target 共用的契约，
    # 住在 LiveActivityAttributes.swift 里。加姿势要两边一起改，下面这行会帮你对账。
    add('// 姿势名必须和 LiveActivityAttributes.swift 里的 ClawdPose 对上：')
    add('// ' + ' / '.join(POSES))
    add('')
    add('enum ClawdSprite {')
    stats = {}
    for pose in POSES:
        rects, body = data[pose]
        stats[pose] = (emit_variant(add, pose, 'Full', rects),
                       emit_variant(add, pose, 'Body', body))
        add('')
    add('    /// bodyOnly = true 时只给本体那份（装饰已在生成期剔除）。')
    add('    static func sprite(for pose: ClawdPose, bodyOnly: Bool) -> ([ClawdBatch], CGRect) {')
    add('        switch (pose, bodyOnly) {')
    for pose in POSES:
        add('        case (.%s, false): return (%sFull, %sFullBounds)' % (pose, pose, pose))
        add('        case (.%s, true):  return (%sBody, %sBodyBounds)' % (pose, pose, pose))
    add('        }')
    add('    }')
    add('}')
    add('')
    add('/// 把像素网格画成 SwiftUI 图形。Canvas 一次画完，比堆 ZStack 便宜。')
    add('struct ClawdView: View {')
    add('    let pose: ClawdPose')
    add('    /// true = 只画本体（compact / minimal 那种小尺寸用）')
    add('    var bodyOnly: Bool = false')
    add('')
    add('    var body: some View {')
    add('        let (batches, bounds) = ClawdSprite.sprite(for: pose, bodyOnly: bodyOnly)')
    add('        Canvas { ctx, size in')
    add('            let scale = min(size.width / bounds.width, size.height / bounds.height)')
    add('            // 居中：缩放后可能填不满给定尺寸，剩下的空间均分到两边')
    add('            let ox = (size.width  - bounds.width  * scale) / 2 - bounds.minX * scale')
    add('            let oy = (size.height - bounds.height * scale) / 2 - bounds.minY * scale')
    add('            for batch in batches {')
    add('                var path = Path()')
    add('                for r in batch.rects {')
    add('                    path.addRect(CGRect(x: ox + r.minX * scale, y: oy + r.minY * scale,')
    add('                                        width: r.width * scale, height: r.height * scale))')
    add('                }')
    add('                ctx.fill(path, with: .color(batch.color))')
    add('            }')
    add('        }')
    add('        .aspectRatio(bounds.width / bounds.height, contentMode: .fit)')
    add('    }')
    add('}')

    with open(OUT, 'w') as f:
        f.write('\n'.join(L) + '\n')
    print('已生成 %s' % os.path.relpath(OUT, ROOT))
    for pose in POSES:
        (ft, fb), (bt, bb) = stats[pose]
        print('  %-10s 完整 %3d 矩形 / %2d 批    本体 %3d 矩形 / %d 批' % (pose, ft, fb, bt, bb))


if __name__ == '__main__':
    main()
