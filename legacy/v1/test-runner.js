const { readdirSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const root = __dirname;
const baselineTestFiles = [
  'test_parsers.js',
  'test_visual_effects.js',
  'test_playback_controls.js',
  'test_color_variations.js',
  'test_shapes.js',
  'test_family_modifiers.js',
  'test_aspect_ratio.js',
  'test_family_customization.js',
  'test_config_export_import.js',
  'test_ui_integration.js',
  'test_canvas_color.js',
  'test_audio_player.js',
  'test_offscreen_render.js',
  'test_instrument_toggle.js',
  'test_tempo_map.js',
  'test_auto_fps.js',
  'test_animation_controls.js',
  'test_instrument_persistence.js',
  'test_velocity_height.js',
  'test_instrument_accents.js',
  'test_instrument_numbers.js',
  'test_developer_mode.js',
  'test_velocity_base.js',
  'test_opacity_scale.js',
  'test_glow_control.js',
  'test_bump_control.js',
  'test_family_color_range.js',
  'test_color_range_export_import.js',
  'test_color_range_validation.js',
  'test_velocity_note_render.js',
  'test_silence_detection.js',
  'test_instrument_family_autodetect.js',
  'test_track_name_assignment.js',
  'test_staff_names.js',
  'test_modal_shift_selection.js',
  'test_visible_seconds.js',
  'test_height_scale.js',
  'test_custom_families.js',
  'test_restart_button.js',
  'test_refresh_animation.js',
  'test_family_dropdown_custom.js',
  'test_fps_controls_removed.js',
  'test_diamond_extension.js',
  'test_shape_extension_control.js',
  'test_help_messages.js',
  'test_instrument_strange_chars.js',
  'test_audio_offset.js',
  'test_midi_learn.js',
  'test_note_alignment.js',
  'test_note_labels.js',
  'test_outline_settings.js',
];

const testFiles = process.argv.includes('--all')
  ? readdirSync(root).filter((file) => /^test_.*\.js$/.test(file)).sort()
  : baselineTestFiles;

const nodeFlags = [];
if (process.allowedNodeEnvironmentFlags.has('--no-experimental-webstorage')) {
  // Node 25 may expose an unusable localStorage object when no backing file is
  // configured. Browser-storage tests install their own complete mock.
  nodeFlags.push('--no-experimental-webstorage');
}

for (const testFile of testFiles) {
  const result = spawnSync(
    process.execPath,
    [...nodeFlags, join(root, testFile)],
    { stdio: 'inherit' },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`\n${testFiles.length} archivos de prueba completados.`);
