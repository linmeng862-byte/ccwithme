#!/usr/bin/env ruby
# Adds plugin Swift + ObjC files to the App target.
# MUST run after Ruby scripts that create extension targets (those clobber the project).
# Runs in CI before xcodebuild. Requires: gem install xcodeproj

require 'xcodeproj'

PROJECT_PATH = File.join(__dir__, 'App.xcodeproj')
APP_DIR = 'App'

# All plugin source files (relative to ios/App/)
PLUGIN_SOURCES = %w[
  AppGroupDataStore.swift
  LiveActivityManager.swift
  LiveActivityPlugin.swift
  LiveActivityPlugin.m
  FocusLockManager.swift
  FocusLockPlugin.swift
  FocusLockPlugin.m
  ScreenTimeManager.swift
  ScreenTimePlugin.swift
  ScreenTimePlugin.m
]

project = Xcodeproj::Project.open(PROJECT_PATH)
app_target = project.targets.find { |t| t.name == 'App' }
abort('App target not found') unless app_target

app_group = project.main_group.find_subpath(APP_DIR, true)
app_group.set_source_tree('SOURCE_ROOT')
app_group.set_path(APP_DIR)

added = 0
PLUGIN_SOURCES.each do |filename|
  # Check if already in the target
  already = app_target.source_build_phase.files.any? do |f|
    f.file_ref && f.file_ref.path == filename
  end
  if already
    puts "   (skip) #{filename} — already in App target"
    next
  end

  # Find or create file reference
  file_ref = app_group.files.find { |f| f.path == filename }
  unless file_ref
    file_ref = app_group.new_file(filename)
  end

  app_target.source_build_phase.add_file_reference(file_ref)
  puts "   Added #{filename}"
  added += 1
end

project.save
puts ""
puts "Done. #{added} plugin files added to App target."

# ============================================================
# 关键修复：把自定义插件类名写进 capacitor.config.json 的 packageClassList。
# Capacitor 7 的 registerPlugins() 只注册 packageClassList 里的类；
# 而 cap sync 只扫描 npm 包（node_modules），永远看不到 ios/App/App/ 下的本地插件。
# 所以必须在这里（cap sync 之后）手动注入，否则前端 registerPlugin 也调不到原生方法。
# ============================================================
require 'json'

CONFIG_PATH = File.join(__dir__, 'App', 'capacitor.config.json')
PLUGIN_CLASSES = %w[LiveActivityPlugin FocusLockPlugin ScreenTimePlugin]

if File.exist?(CONFIG_PATH)
  cfg = JSON.parse(File.read(CONFIG_PATH))
  cfg['packageClassList'] ||= []
  PLUGIN_CLASSES.each do |klass|
    cfg['packageClassList'] << klass unless cfg['packageClassList'].include?(klass)
  end
  File.write(CONFIG_PATH, JSON.pretty_generate(cfg) + "\n")
  puts "Updated packageClassList: #{cfg['packageClassList'].inspect}"
else
  abort("capacitor.config.json not found at #{CONFIG_PATH}")
end
