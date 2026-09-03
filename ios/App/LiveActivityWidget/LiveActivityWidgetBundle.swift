import WidgetKit
import SwiftUI

@main
struct LiveActivityWidgetBundle: WidgetBundle {
    var body: some Widget {
        TimerLiveActivity()
        ThinkingLiveActivity()
        // 桌面/锁屏小组件。⚠️ 之前这个 bundle 里**只有两个 Live Activity**、
        // 一个真正的小组件都没有 —— Xcode 报的 "Failed to get descriptors for
        // extensionBundleID" 就是这么来的：它去找「这东西往桌面上怎么摆」，压根没有。
        PresenceWidget()
    }
}
