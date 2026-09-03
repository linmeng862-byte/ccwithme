#!/usr/bin/env ruby
# Creates the ScreenTimeMonitor extension target inside App.xcodeproj.
# Runs in CI before xcodebuild. Requires: gem install xcodeproj
#
# This is a DeviceActivityMonitor extension — it receives callbacks
# from iOS when monitoring intervals start/end and writes data to App Group.

require 'xcodeproj'

PROJECT_PATH = File.join(__dir__, 'App.xcodeproj')
EXT_NAME = 'ScreenTimeMonitor'
EXT_DIR = 'ScreenTimeMonitor'
# ⚠️ 两台机器各编一个 app 装同一部手机时，这个前缀必须分开 ——
# 否则装第二个会顶掉第一个。ios-prep.sh 设了 APP_BUNDLE_ID 就跟着走，
# 没设就还是原来这个（另一台的行为一个字不变）。
BUNDLE_ID_BASE = ENV['APP_BUNDLE_ID'] || 'com.zzclaude.eclat'

EXT_SOURCES = %w[
  ScreenTimeMonitorExtension.swift
]

project = Xcodeproj::Project.open(PROJECT_PATH)
app_target = project.targets.find { |t| t.name == 'App' }
abort('App target not found') unless app_target

# Idempotency
if project.targets.any? { |t| t.name == EXT_NAME }
  puts "⚠️  Target '#{EXT_NAME}' already exists — skipping."
  exit 0
end

puts "Creating DeviceActivityMonitor extension target '#{EXT_NAME}'..."

ext_target = project.new_target(:app_extension, EXT_NAME, :ios, '16.0')

ext_target.build_configurations.each do |config|
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = "#{BUNDLE_ID_BASE}.#{EXT_NAME}"
  config.build_settings['PRODUCT_NAME'] = EXT_NAME
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'
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
  config.build_settings['ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS'] = 'YES'
end

# Create group
ext_group = project.main_group.find_subpath(EXT_DIR, true)
ext_group.set_source_tree('SOURCE_ROOT')
ext_group.set_path(EXT_DIR)

# Info.plist and entitlements are NOT added as resources — Xcode handles them
# via INFOPLIST_FILE and CODE_SIGN_ENTITLEMENTS build settings respectively.
# Adding them as resources causes "Multiple commands produce" errors.

# Add source files
EXT_SOURCES.each do |filename|
  file_ref = ext_group.new_file(filename)
  ext_target.source_build_phase.add_file_reference(file_ref)
  puts "   Added #{filename}"
end

# Add dependency + embed
app_target.add_dependency(ext_target)
puts "   Added target dependency: App → #{EXT_NAME}"

embed_phase = app_target.copy_files_build_phases.find { |p| p.dst_subfolder_spec == '13' }
unless embed_phase
  embed_phase = app_target.new_copy_files_build_phase('Embed App Extensions')
  embed_phase.dst_subfolder_spec = '13'
end
ext_product_ref = ext_target.product_reference
unless embed_phase.files.any? { |f| f.file_ref == ext_product_ref }
  embed_phase.add_file_reference(ext_product_ref, true)
end

project.save
puts "✅ DeviceActivityMonitor extension '#{EXT_NAME}' created."
puts "   iOS 16.0+ | Bundle: #{BUNDLE_ID_BASE}.#{EXT_NAME}"
