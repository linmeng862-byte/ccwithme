#!/usr/bin/env ruby
# Creates the BroadcastUpload (ReplayKit screen-share) extension target inside App.xcodeproj.
# 仿 add_widget_extension.rb。CI 里在 xcodebuild 之前跑。Requires: gem install xcodeproj
#
# App target: iOS 14.0（不变）
# Broadcast Upload Extension: iOS 14.0

require 'xcodeproj'

PROJECT_PATH = File.join(__dir__, 'App.xcodeproj')
EXT_NAME = 'BroadcastUpload'
EXT_DIR = 'BroadcastUpload'
BUNDLE_ID_BASE = 'com.zzclaude.eclat'

EXT_SOURCES = %w[
  SampleHandler.swift
]

project = Xcodeproj::Project.open(PROJECT_PATH)
app_target = project.targets.find { |t| t.name == 'App' }
abort('❌ App target not found in project') unless app_target

# ── 0. Idempotency ──
if project.targets.any? { |t| t.name == EXT_NAME }
  puts "⚠️  Target '#{EXT_NAME}' already exists — skipping creation."
  exit 0
end

puts "🔨 Creating Broadcast Upload Extension target '#{EXT_NAME}'..."
puts "   Bundle ID: #{BUNDLE_ID_BASE}.#{EXT_NAME}"

# ── 1. Create extension target ──
ext_target = project.new_target(:app_extension, EXT_NAME, :ios, '14.0')
puts "   Target created (product_type: #{ext_target.product_type})"

# ── 2. Build settings ──
ext_target.build_configurations.each do |config|
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = "#{BUNDLE_ID_BASE}.#{EXT_NAME}"
  config.build_settings['PRODUCT_NAME'] = EXT_NAME
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '14.0'
  config.build_settings['INFOPLIST_FILE'] = "#{EXT_DIR}/Info.plist"
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] = "#{EXT_DIR}/#{EXT_NAME}.entitlements"
  config.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
  config.build_settings['SKIP_INSTALL'] = 'YES'
  config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'
  config.build_settings['MARKETING_VERSION'] = '1.0'
  config.build_settings['CURRENT_PROJECT_VERSION'] = '1'
  config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'
  config.build_settings['SWIFT_EMIT_LOC_STRINGS'] = 'YES'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'
end

# ── 3. Source group ──
ext_group = project.main_group.find_subpath(EXT_DIR, true)
ext_group.set_source_tree('SOURCE_ROOT')
ext_group.set_path(EXT_DIR)

# Info.plist / entitlements 只通过 build settings 引用，不作为 resource 加，避免 "Multiple commands produce"。

# ── 4. Add source files ──
EXT_SOURCES.each do |filename|
  file_ref = ext_group.new_file(filename)
  ext_target.source_build_phase.add_file_reference(file_ref)
  puts "   Added #{filename}"
end

# ── 5. App depends on extension ──
app_target.add_dependency(ext_target)
puts "   Added target dependency: App → #{EXT_NAME}"

# ── 6. Embed extension in App (Copy Files → PlugIns, subfolder 13) ──
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

# ── 7. Save ──
project.save
puts ""
puts "✅ Broadcast Upload Extension '#{EXT_NAME}' created!"
puts "   Next: pod install (if needed) then xcodebuild -workspace App.xcworkspace -scheme App ..."
