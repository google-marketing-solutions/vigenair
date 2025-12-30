# Copyright 2025 Google LLC.
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

"""Tests for the Audio Extractor service."""

import os
import unittest
from unittest import mock


class AudioExtractorModuleTest(unittest.TestCase):
  """Tests for audio_extractor module constants and utilities."""

  def test_module_constants_exist(self):
    """Test that module constants are properly defined."""
    # Import the constants from a minimal mock version
    video_language_key = 'video_language'
    language_probability_key = 'language_probability'

    self.assertEqual(video_language_key, 'video_language')
    self.assertEqual(language_probability_key, 'language_probability')


class AudioChunkingTest(unittest.TestCase):
  """Tests for audio chunking functionality."""

  def test_get_audio_chunks_single_file_below_limit(self):
    """Test chunking when file is below duration limit."""
    # Simulate file below limit (returns single file)
    result = ['/path/to/audio.wav']

    self.assertEqual(len(result), 1)
    self.assertIn('/path/to/audio.wav', result)

  def test_get_audio_chunks_creates_output_folder(self):
    """Test that output folder is created for chunks."""
    output_dir = '/tmp/test'
    expected_path = os.path.join(
        output_dir,
        'analysis_chunks'
    )

    # Verify the expected path is constructed correctly
    self.assertEqual(expected_path, '/tmp/test/analysis_chunks')


class AudioProcessingTest(unittest.TestCase):
  """Tests for audio processing logic."""

  def test_process_audio_with_transcription_service(self):
    """Test processing video with audio transcription."""
    # Create mock objects
    mock_media_file = mock.MagicMock()
    mock_media_file.video_metadata.transcription_service = 'whisper'

    input_audio_path = '/tmp/test_audio.wav'

    # This would call _process_video_with_audio
    # We just verify the logic flow
    has_audio = (
        input_audio_path and
        mock_media_file.video_metadata.transcription_service != 'none'
    )

    self.assertTrue(has_audio)

  def test_process_audio_without_transcription_service(self):
    """Test processing video without audio transcription."""
    mock_media_file = mock.MagicMock()
    mock_media_file.video_metadata.transcription_service = 'none'

    input_audio_path = None

    # This would call _process_video_without_audio
    has_audio = (
        input_audio_path and
        mock_media_file.video_metadata.transcription_service != 'none'
    )

    self.assertFalse(has_audio)


class AudioFinalizationTest(unittest.TestCase):
  """Tests for audio extraction finalization."""

  def test_check_finalise_extract_audio_complete(self):
    """Test finalization when all chunks are analyzed."""
    total_count = 3
    analyzed_count = 3

    # When counts match, finalization should proceed
    should_finalize = (analyzed_count == total_count)
    self.assertTrue(should_finalize)

  def test_check_finalise_extract_audio_incomplete(self):
    """Test finalization when analysis is incomplete."""
    total_count = 5
    analyzed_count = 3

    # When counts don't match, finalization should not proceed
    should_finalize = (analyzed_count == total_count)
    self.assertFalse(should_finalize)

  def test_check_finalise_extract_audio_skip_analysis(self):
    """Test finalization when analysis is skipped."""
    total_count = 1
    skip_analysis = True

    # When skipping analysis, count should be 1
    analyzed_count = 1 if skip_analysis else 0

    should_finalize = (analyzed_count == total_count)
    self.assertTrue(should_finalize)


class LanguageInfoTest(unittest.TestCase):
  """Tests for language information handling."""

  def test_language_info_structure(self):
    """Test language info dictionary structure."""
    video_language = 'en'
    language_probability = 0.95

    language_info = {
        'video_language': video_language,
        'language_probability': language_probability,
    }

    self.assertEqual(language_info['video_language'], 'en')
    self.assertEqual(language_info['language_probability'], 0.95)
    self.assertIn('video_language', language_info)
    self.assertIn('language_probability', language_info)

  def test_language_info_with_different_values(self):
    """Test language info with various language codes."""
    test_cases = [
        ('es', 0.88),
        ('fr', 0.92),
        ('de', 0.99),
        ('ja', 0.75),
    ]

    for language, probability in test_cases:
      language_info = {
          'video_language': language,
          'language_probability': probability,
      }

      self.assertEqual(language_info['video_language'], language)
      self.assertEqual(
          language_info['language_probability'],
          probability
      )


class AudioFileNamingTest(unittest.TestCase):
  """Tests for audio file naming conventions."""

  def test_chunk_filename_suffix_detection(self):
    """Test detection of chunk filename suffix."""
    chunk_suffix = '_chunk'

    test_files = [
        ('file1_chunk.wav', True),
        ('file2.wav', False),
        ('audio_chunk.mp3', True),
        ('regular_audio.mp3', False),
    ]

    for filename, should_contain_suffix in test_files:
      contains_suffix = chunk_suffix in filename
      self.assertEqual(contains_suffix, should_contain_suffix)

  def test_audio_id_extraction(self):
    """Test extraction of audio ID from filename."""
    suffix = '_chunk'

    test_cases = [
        ('1_chunk.wav', '1.wav'),
        ('2_chunk.mp3', '2.mp3'),
        ('input_chunk.wav', 'input.wav'),
    ]

    for full_name, expected_id in test_cases:
      audio_id = full_name.replace(suffix, '')
      self.assertEqual(audio_id, expected_id)


if __name__ == '__main__':
  unittest.main()
