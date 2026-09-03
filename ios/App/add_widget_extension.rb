#!/usr/bin/env ruby
# Creates the LiveActivityWidget extension target inside App.xcodeproj.
# Runs in CI before xcodebuild. Requires: gem install xcodeproj
#
# App target: iOS 14.0  (unchanged)
# Widget Extension: iOS 17.0  (WidgetBundle requires iOS 17)

require 'xcodeproj'

PROJECT_PATH = File.join(__dir__, 'App.xcodeproj')
EXT_NAME = 'LiveActivityWidget'
EXT_DIR = 'LiveActivityWidget'
# ⚠️ 两台机器各编一个 app 装同一部手机时，这个前缀必须分开 ——
# 否则装第二个会顶掉第一个。ios-prep.sh 设了 APP_BUNDLE_ID 就跟着走，
# 没设就还是原来这个（另一台的行为一个字不变）。
BUNDLE_ID_BASE = ENV['APP_BUNDLE_ID'] || 'com.zzclaude.eclat'

# Source files for the Widget Extension (relative to ios/App/)
EXT_SOURCES = %w[
  LiveActivityWidgetBundle.swift
  LiveActivityAttributes.swift
  TimerLiveActivityView.swift
  ThinkingLiveActivityView.swift
  ClawdSprite.swift
  PresenceWidget.swift
]

project = Xcodeproj::Project.open(PROJECT_PATH)
app_target = project.targets.find { |t| t.name == 'App' }
abort('❌ App target not found in project') unless app_target

# ── 0. Idempotency ──
# ⚠️ 2026-09-03 改：以前这里是「target 已经在 → 整段 exit 0」。
#    后果是**往 EXT_SOURCES 里新加的文件永远进不去已存在的 target** ——
#    文件躺在磁盘上、Xcode 里看不见，编译报 "Cannot find 'X' in scope"，
#    而脚本还打了一行绿色的「skipping」让人以为一切正常。
#    （add_app_plugins.rb 一直是逐个文件补的，这个没跟上。）
#    现在改成：target 在就只补缺的源文件，然后退出；不在才走下面整套创建流程。
existing = project.targets.find { |t| t.name == EXT_NAME }
if existing
  puts "⚠️  Target '#{EXT_NAME}' already exists — 只补缺的源文件。"
  ext_group = project.main_group.find_subpath(EXT_DIR, true)
  ext_group.set_source_tree('SOURCE_ROOT')
  ext_group.set_path(EXT_DIR)
  added = 0
  EXT_SOURCES.each do |filename|
    already = existing.source_build_phase.files.any? { |f| f.file_ref && f.file_ref.path == filename }
    if already
      puts "   (skip) #{filename}"
      next
    end
    file_ref = ext_group.files.find { |f| f.path == filename } || ext_group.new_file(filename)
    existing.source_build_phase.add_file_reference(file_ref)
    puts "   ➕ 补上 #{filename}"
    added += 1
  end
  project.save if added > 0
  puts added > 0 ? "✅ 补了 #{added} 个文件" : "   没有要补的"
  exit 0
end

puts "🔨 Creating Widget Extension target '#{EXT_NAME}'..."
puts "   Bundle ID: #{BUNDLE_ID_BASE}.#{EXT_NAME}"
puts "   iOS 17.0+ (WidgetBundle requirement)"

# ── 1. Create Widget Extension target ──
ext_target = project.new_target(
  :app_extension,
  EXT_NAME,
  :ios,
  '17.0'
)

puts "   Target created (product_type: #{ext_target.product_type})"

# ── 2. Configure build settings ──
ext_target.build_configurations.each do |config|
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = "#{BUNDLE_ID_BASE}.#{EXT_NAME}"
  config.build_settings['PRODUCT_NAME'] = EXT_NAME
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  config.build_settings['INFOPLIST_FILE'] = "#{EXT_DIR}/Info.plist"
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] = "#{EXT_DIR}/#{EXT_NAME}.entitlements"
  config.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
  config.build_settings['SKIP_INSTALL'] = 'YES'
  config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'
  config.build_settings['MARKETING_VERSION'] = '1.0'
  config.build_settings['CURRENT_PROJECT_VERSION'] = '1'
  config.build_settings['ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS'] = 'YES'
  config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'
  config.build_settings['SWIFT_EMIT_LOC_STRINGS'] = 'YES'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'
end

# ── 3. Create group for source files ──
ext_group = project.main_group.find_subpath(EXT_DIR, true)
ext_group.set_source_tree('SOURCE_ROOT')
ext_group.set_path(EXT_DIR)

# Info.plist is NOT added as a resource — Xcode auto-processes it via INFOPLIST_FILE build setting.
# Entitlements are NOT added as a resource — handled via CODE_SIGN_ENTITLEMENTS.
# Both are referenced only through build settings to avoid "Multiple commands produce" errors.

# ── 4. Add Swift source files to the extension target ──
shared_attrs_file = nil
EXT_SOURCES.each do |filename|
  file_ref = ext_group.new_file(filename)
  ext_target.source_build_phase.add_file_reference(file_ref)
  puts "   Added #{filename}"
  shared_attrs_file = file_ref if filename == 'LiveActivityAttributes.swift'
end

# ── 7. Add shared Attributes file to App target (needed by LiveActivityManager) ──
if shared_attrs_file
  unless app_target.source_build_phase.files.any? { |f| f.file_ref == shared_attrs_file }
    app_target.source_build_phase.add_file_reference(shared_attrs_file)
    puts "   Added LiveActivityAttributes.swift to App target (shared)"
  end
end

# ── 8. Add dependency: App depends on extension ──
app_target.add_dependency(ext_target)
puts "   Added target dependency: App → #{EXT_NAME}"

# ── 9. Embed extension in App (Copy Files → PlugIns, subfolder 13) ──
embed_phase = app_target.copy_files_build_phases.find { |p| p.dst_subfolder_spec == '13' }
unless embed_phase
  embed_phase = app_target.new_copy_files_build_phase('Embed App Extensions')
  embed_phase.dst_subfolder_spec = '13'
  puts "   Created 'Embed App Extensions' build phase"
end
ext_product_ref = ext_target.product_reference
unless embed_phase.files.any? { |f| f.file_ref == ext_product_ref }
  embed_phase.add_file_reference(ext_product_ref, true)
  puts "   Added extension product to Embed phase"
end

# ── 10. Set the scheme to build the extension ──
# (xcodeproj auto-creates the scheme entry when saving)

# ── 11. Save ──
project.save
puts ""
puts "✅ Widget Extension target '#{EXT_NAME}' created successfully!"
puts "   Deployment target: iOS 17.0"
puts "   Sources: #{EXT_SOURCES.join(', ')}"
puts "   Next: xcodebuild -workspace App.xcworkspace -scheme App ..."
