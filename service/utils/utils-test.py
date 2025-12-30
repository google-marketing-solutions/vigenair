# Copyright 2024 Google LLC.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Tests for Vigenair utils."""

import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import utils

# Mock the config module before importing utils
mock_config = mock.MagicMock()
sys.modules['config'] = mock_config


class MockConfig:
  """Mock for the ConfigService."""
  INPUT_FILENAME = 'input'
  INPUT_EXTRACTION_AUDIO_FILENAME_SUFFIX = '_audio.wav'
  INPUT_EXTRACTION_VIDEO_FILENAME_SUFFIX = '_video.mp4'
  INPUT_EXTRACTION_FINALISE_AUDIO_FILE = 'finalise_audio.txt'
  INPUT_EXTRACTION_FINALISE_VIDEO_FILE = 'finalise_video.txt'
  INPUT_EXTRACTION_FINALISE_FILE = 'finalise.txt'
  INPUT_EXTRACTION_SPLIT_SEGMENT_SUFFIX = '_split.txt'
  INPUT_RENDERING_FILE = 'render.json'
  INPUT_RENDERING_FINALISE_FILE = 'finalise_render.txt'


# Replace the actual ConfigService with the mock for the duration of the tests.
utils.ConfigService = MockConfig


class UtilsTest(unittest.TestCase):
  """Unit tests for the Utils module."""

  def test_transcription_service_from_value(self):
    """Tests the from_value method of TranscriptionService."""
    self.assertEqual(
        utils.TranscriptionService.from_value('w'),
        utils.TranscriptionService.WHISPER,
    )
    self.assertEqual(
        utils.TranscriptionService.from_value('whisper'),
        utils.TranscriptionService.WHISPER,
    )
    self.assertEqual(
        utils.TranscriptionService.from_value('g'),
        utils.TranscriptionService.GEMINI,
    )
    self.assertEqual(
        utils.TranscriptionService.from_value('gemini'),
        utils.TranscriptionService.GEMINI,
    )
    self.assertEqual(
        utils.TranscriptionService.from_value('n'),
        utils.TranscriptionService.NONE,
    )
    self.assertEqual(
        utils.TranscriptionService.from_value('unknown'),
        utils.TranscriptionService.NONE,
    )

  def test_video_extension_has_value(self):
    """Tests the has_value method of VideoExtension."""
    self.assertTrue(utils.VideoExtension.has_value('mp4'))
    self.assertTrue(utils.VideoExtension.has_value('mov'))
    self.assertFalse(utils.VideoExtension.has_value('txt'))
    self.assertFalse(utils.VideoExtension.has_value(''))

  def test_video_metadata(self):
    """Tests the VideoMetadata class."""
    # Test with 4 components (includes transcription service)
    metadata_str_4 = 'my_video--g--1234567890--user123'
    video_metadata_4 = utils.VideoMetadata(metadata_str_4)
    self.assertEqual(video_metadata_4.video_file_name, 'my_video')
    self.assertEqual(
        video_metadata_4.transcription_service,
        utils.TranscriptionService.GEMINI,
    )
    self.assertEqual(video_metadata_4.video_timestamp, 1234567890)
    self.assertEqual(video_metadata_4.encoded_user_id, 'user123')

    # Test with 3 components (defaults to WHISPER)
    metadata_str_3 = 'another_video--9876543210--user456'
    video_metadata_3 = utils.VideoMetadata(metadata_str_3)
    self.assertEqual(video_metadata_3.video_file_name, 'another_video')
    self.assertEqual(
        video_metadata_3.transcription_service,
        utils.TranscriptionService.WHISPER,
    )
    self.assertEqual(video_metadata_3.video_timestamp, 9876543210)
    self.assertEqual(video_metadata_3.encoded_user_id, 'user456')

  def test_trigger_file(self):
    """Tests the TriggerFile class and its 'is_*' methods."""
    base_path = 'my_video--w--123--user/some_folder'

    # Extractor triggers
    initial_trigger = utils.TriggerFile(f'{base_path}/input.mp4')
    self.assertTrue(initial_trigger.is_extractor_initial_trigger())

    audio_trigger = utils.TriggerFile(f'{base_path}/some_name_audio.wav')
    self.assertTrue(audio_trigger.is_extractor_audio_trigger())

    video_trigger = utils.TriggerFile(f'{base_path}/some_name_video.mp4')
    self.assertTrue(video_trigger.is_extractor_video_trigger())

    finalise_audio_trigger = utils.TriggerFile(
        f'{base_path}/finalise_audio.txt'
    )
    self.assertTrue(
        finalise_audio_trigger.is_extractor_finalise_audio_trigger()
    )

    finalise_video_trigger = utils.TriggerFile(
        f'{base_path}/finalise_video.txt'
    )
    self.assertTrue(
        finalise_video_trigger.is_extractor_finalise_video_trigger()
    )

    finalise_trigger = utils.TriggerFile(f'{base_path}/finalise.txt')
    self.assertTrue(finalise_trigger.is_extractor_finalise_trigger())

    split_segment_trigger = utils.TriggerFile(f'{base_path}/segment_split.txt')
    self.assertTrue(split_segment_trigger.is_extractor_split_segment_trigger())

    # Combiner triggers
    combiner_initial = utils.TriggerFile(f'{base_path}/render.json')
    self.assertTrue(combiner_initial.is_combiner_initial_trigger())
    self.assertTrue(combiner_initial.is_combiner_render_trigger())

    combiner_render = utils.TriggerFile(f'{base_path}/1-2_render.json')
    self.assertTrue(combiner_render.is_combiner_render_trigger())
    self.assertFalse(combiner_render.is_combiner_initial_trigger())

    combiner_finalise = utils.TriggerFile(f'{base_path}/finalise_render.txt')
    self.assertTrue(combiner_finalise.is_combiner_finalise_trigger())

    # Negative cases
    not_a_trigger = utils.TriggerFile(f'{base_path}/some_other_file.txt')
    self.assertFalse(not_a_trigger.is_extractor_initial_trigger())
    self.assertFalse(not_a_trigger.is_combiner_initial_trigger())
    self.assertFalse(not_a_trigger.is_combiner_finalise_trigger())

  @mock.patch('subprocess.run')
  def test_execute_subprocess_commands_success(self, mock_subprocess_run):
    """Tests execute_subprocess_commands for a successful command."""
    mock_process = mock.Mock()
    mock_process.stdout = 'Success'
    mock_subprocess_run.return_value = mock_process

    cmds = ['echo', 'hello']
    description = 'test echo'
    output = utils.execute_subprocess_commands(cmds, description)

    mock_subprocess_run.assert_called_once_with(
        args=cmds,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=None,
        shell=False,
        check=True,
        text=True,
    )
    self.assertEqual(output, 'Success')

  @mock.patch('subprocess.run')
  def test_execute_subprocess_commands_failure(self, mock_subprocess_run):
    """Tests execute_subprocess_commands for a failing command."""
    mock_subprocess_run.side_effect = subprocess.CalledProcessError(
        1, 'cmd', output='Error'
    )

    with self.assertRaises(subprocess.CalledProcessError):
      utils.execute_subprocess_commands(['bad_command'], 'test failure')

  def test_timestring_to_seconds(self):
    """Tests the timestring_to_seconds function."""
    self.assertAlmostEqual(utils.timestring_to_seconds('00:00.000'), 0.0)
    self.assertAlmostEqual(utils.timestring_to_seconds('00:01.500'), 1.5)
    self.assertAlmostEqual(utils.timestring_to_seconds('01:30.250'), 90.25)
    self.assertAlmostEqual(utils.timestring_to_seconds('10:00.000'), 600.0)

  def test_rename_chunks(self):
    """Tests the rename_chunks function."""
    with tempfile.TemporaryDirectory() as tmpdir:
      # Create dummy files
      file_suffix = '_chunk'
      original_paths = []
      for i in range(3):
        path = pathlib.Path(tmpdir, f'file{i}{file_suffix}.txt')
        path.touch()
        original_paths.append(str(path))

      utils.rename_chunks(original_paths, file_suffix)

      # Check if files were renamed correctly
      expected_names = {
          'file0-3_chunk.txt',
          'file1-3_chunk.txt',
          'file2-3_chunk.txt',
      }
      actual_names = set(os.listdir(tmpdir))
      self.assertEqual(actual_names, expected_names)

  @mock.patch('utils.execute_subprocess_commands')
  def test_get_media_duration(self, mock_execute):
    """Tests the get_media_duration function."""
    mock_execute.return_value = '123.45\n'
    duration = utils.get_media_duration('/fake/path/video.mp4')

    self.assertEqual(duration, 123.45)
    mock_execute.assert_called_once_with(
        cmds=[
            'ffprobe',
            '-i',
            '/fake/path/video.mp4',
            '-show_entries',
            'format=duration',
            '-v',
            'quiet',
            '-of',
            'default=noprint_wrappers=1:nokey=1',
        ],
        description='get duration of [/fake/path/video.mp4] with ffprobe',
    )

  def test_render_format_type(self):
    """Tests the RenderFormatType enum."""
    self.assertEqual(utils.RenderFormatType.HORIZONTAL.value, 'horizontal')
    self.assertEqual(utils.RenderFormatType.VERTICAL.value, 'vertical')
    self.assertEqual(utils.RenderFormatType.SQUARE.value, 'square')

  def test_render_overlay_type(self):
    """Tests the RenderOverlayType enum."""
    self.assertEqual(
        utils.RenderOverlayType.VARIANT_START.value, 'variant_start'
    )
    self.assertEqual(utils.RenderOverlayType.VARIANT_END.value, 'variant_end')
    self.assertEqual(utils.RenderOverlayType.VIDEO_START.value, 'video_start')
    self.assertEqual(utils.RenderOverlayType.VIDEO_END.value, 'video_end')

  def test_video_metadata_str(self):
    """Tests the __str__ method of VideoMetadata."""
    metadata_str = 'my_video--g--1234567890--user123'
    video_metadata = utils.VideoMetadata(metadata_str)
    str_output = str(video_metadata)

    self.assertIn('video_file_name=my_video', str_output)
    self.assertIn('video_timestamp=1234567890', str_output)
    self.assertIn('encoded_user_id=user123', str_output)
    self.assertIn('transcription_service=', str_output)

  def test_video_metadata_edge_cases(self):
    """Tests VideoMetadata with edge cases."""
    # Test with invalid number of components (should raise ValueError)
    with self.assertRaises(ValueError):
      utils.VideoMetadata('too--few')

    with self.assertRaises(ValueError):
      utils.VideoMetadata('too--many--components--here--extra')

    # Test with non-numeric timestamp
    with self.assertRaises(ValueError):
      utils.VideoMetadata('video--not_a_number--user')

  def test_trigger_file_str(self):
    """Tests the __str__ method of TriggerFile."""
    base_path = 'my_video--w--123--user/some_folder'
    trigger = utils.TriggerFile(f'{base_path}/input.mp4')
    str_output = str(trigger)

    self.assertIn('file_name_ext=input.mp4', str_output)
    self.assertIn('full_gcs_path=', str_output)
    self.assertIn('gcs_folder=', str_output)
    self.assertIn('gcs_root_folder=', str_output)
    self.assertIn('video_metadata=', str_output)

  def test_trigger_file_edge_cases(self):
    """Tests TriggerFile with edge cases."""
    # File without extension
    trigger_no_ext = utils.TriggerFile('my_video--w--123--user/folder/file')
    self.assertEqual(trigger_no_ext.file_name, 'file')
    self.assertEqual(trigger_no_ext.file_ext, '')

    # Deeply nested path
    deep_path = 'my_video--w--123--user/a/b/c/d/file.txt'
    trigger_deep = utils.TriggerFile(deep_path)
    self.assertEqual(trigger_deep.file_name, 'file')
    self.assertEqual(trigger_deep.file_ext, 'txt')

    # Path with special characters in filename
    special_path = 'my_video--w--123--user/folder/my-file_name.mp4'
    trigger_special = utils.TriggerFile(special_path)
    self.assertEqual(trigger_special.file_name, 'my-file_name')
    self.assertEqual(trigger_special.file_ext, 'mp4')

  @mock.patch('subprocess.run')
  def test_execute_subprocess_commands_with_cwd(self, mock_subprocess_run):
    """Tests execute_subprocess_commands with cwd parameter."""
    mock_process = mock.Mock()
    mock_process.stdout = 'Success with cwd'
    mock_subprocess_run.return_value = mock_process

    cmds = ['ls', '-la']
    description = 'list files'
    cwd = '/tmp'
    output = utils.execute_subprocess_commands(cmds, description, cwd=cwd)

    mock_subprocess_run.assert_called_once_with(
        args=cmds,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=cwd,
        shell=False,
        check=True,
        text=True,
    )
    self.assertEqual(output, 'Success with cwd')

  @mock.patch('subprocess.run')
  def test_execute_subprocess_commands_with_shell(self, mock_subprocess_run):
    """Tests execute_subprocess_commands with shell=True."""
    mock_process = mock.Mock()
    mock_process.stdout = 'Shell command output'
    mock_subprocess_run.return_value = mock_process

    cmd = 'echo "hello world"'
    description = 'shell echo'
    output = utils.execute_subprocess_commands(cmd, description, shell=True)

    mock_subprocess_run.assert_called_once_with(
        args=cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=None,
        shell=True,
        check=True,
        text=True,
    )
    self.assertEqual(output, 'Shell command output')


if __name__ == '__main__':
  unittest.main()
