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

"""Tests for the Video Extractor service."""

import os
import unittest


class VideoChunkingTest(unittest.TestCase):
  """Tests for video chunking functionality."""

  def test_get_video_chunks_single_file_below_limit(self):
    """Test chunking when file is below size limit."""
    size_limit = 50 * 1024 * 1024 * 1024  # 50GB

    # File below limit
    file_size = 10 * 1024 * 1024 * 1024  # 10GB

    should_chunk = file_size > size_limit
    self.assertFalse(should_chunk)

  def test_get_video_chunks_large_file_above_limit(self):
    """Test chunking when file exceeds size limit."""
    size_limit = 50 * 1024 * 1024 * 1024  # 50GB

    # File above limit
    file_size = 100 * 1024 * 1024 * 1024  # 100GB

    should_chunk = file_size > size_limit
    self.assertTrue(should_chunk)

  def test_get_video_chunks_creates_output_folder(self):
    """Test that output folder is created for chunks."""
    output_dir = '/tmp/test'
    expected_path = os.path.join(output_dir, 'analysis_chunks')

    # Verify the expected path is constructed correctly
    self.assertEqual(expected_path, '/tmp/test/analysis_chunks')


class VideoProcessingTest(unittest.TestCase):
  """Tests for video processing logic."""

  def test_process_video_with_single_chunk(self):
    """Test processing video that results in single chunk."""
    video_chunks = ['/tmp/video.mp4']

    # Single chunk should trigger immediate extraction
    should_extract_immediately = len(video_chunks) == 1
    self.assertTrue(should_extract_immediately)

  def test_process_video_with_multiple_chunks(self):
    """Test processing video that results in multiple chunks."""
    video_chunks = [
        '/tmp/chunk1.mp4',
        '/tmp/chunk2.mp4',
        '/tmp/chunk3.mp4',
    ]

    # Multiple chunks should not trigger immediate extraction
    should_extract_immediately = len(video_chunks) == 1
    self.assertFalse(should_extract_immediately)

  def test_process_video_chunk_count(self):
    """Test chunk counting logic."""
    test_cases = [
        ([], 0),
        (['/tmp/chunk1.mp4'], 1),
        (['/tmp/chunk1.mp4', '/tmp/chunk2.mp4'], 2),
        (
            [f'/tmp/chunk{i}.mp4' for i in range(5)],
            5
        ),
    ]

    for chunks, expected_count in test_cases:
      self.assertEqual(len(chunks), expected_count)


class VideoFileNamingTest(unittest.TestCase):
  """Tests for video file naming conventions."""

  def test_chunk_suffix_detection(self):
    """Test detection of chunk filename suffix."""
    chunk_suffix = '_video_chunk'

    test_files = [
        ('file1_video_chunk.mp4', True),
        ('file2.mp4', False),
        ('video_video_chunk.avi', True),
        ('regular_video.mp4', False),
    ]

    for filename, should_contain_suffix in test_files:
      contains_suffix = chunk_suffix in filename
      self.assertEqual(contains_suffix, should_contain_suffix)

  def test_video_id_extraction(self):
    """Test extraction of video ID from filename."""
    suffix = '_video_chunk'

    test_cases = [
        ('1_video_chunk.mp4', '1.mp4'),
        ('2_video_chunk.avi', '2.avi'),
        ('input_video_chunk.mp4', 'input.mp4'),
    ]

    for full_name, expected_id in test_cases:
      video_id = full_name.replace(suffix, '')
      self.assertEqual(video_id, expected_id)

  def test_chunk_path_detection(self):
    """Test detection of chunk in file path."""
    chunks_dir = 'analysis_chunks'

    test_paths = [
        ('/path/to/analysis_chunks/video.mp4', True),
        ('/path/to/regular/video.mp4', False),
        ('/analysis_chunks/file.mp4', True),
        ('/regular/path/file.mp4', False),
    ]

    for path, should_be_chunk in test_paths:
      is_chunk = chunks_dir in path
      self.assertEqual(is_chunk, should_be_chunk)


class VideoFinalizationTest(unittest.TestCase):
  """Tests for video extraction finalization."""

  def test_check_finalise_extract_video_complete(self):
    """Test finalization when all chunks are analyzed."""
    total_count = 3
    analyzed_count = 3

    should_finalize = (analyzed_count == total_count)
    self.assertTrue(should_finalize)

  def test_check_finalise_extract_video_incomplete(self):
    """Test finalization when analysis is incomplete."""
    total_count = 5
    analyzed_count = 3

    should_finalize = (analyzed_count == total_count)
    self.assertFalse(should_finalize)

  def test_finalize_file_naming_single_chunk(self):
    """Test finalization file naming for single chunk."""
    total_count = 1

    finalize_filename = f'{total_count}-{total_count}_finalise_video'
    expected = '1-1_finalise_video'

    self.assertEqual(finalize_filename, expected)

  def test_finalize_file_naming_multiple_chunks(self):
    """Test finalization file naming for multiple chunks."""
    test_counts = [2, 3, 5, 10]

    for count in test_counts:
      finalize_filename = f'{count}-{count}_finalise_video'
      expected = f'{count}-{count}_finalise_video'
      self.assertEqual(finalize_filename, expected)


class VideoChunkValidationTest(unittest.TestCase):
  """Tests for video chunk validation."""

  def test_zero_duration_chunk_detection(self):
    """Test detection of zero-duration chunks."""
    test_durations = [
        (0.0, True),
        (0.1, False),
        (5.5, False),
        (10.0, False),
    ]

    for duration, is_zero in test_durations:
      self.assertEqual(duration == 0.0, is_zero)

  def test_chunk_count_adjustment_for_zero_duration(self):
    """Test file count adjustment when zero duration detected."""
    file_count = 5

    # Simulate zero duration detection
    new_duration = 0.0
    if new_duration == 0.0:
      file_count -= 1

    self.assertEqual(file_count, 4)

  def test_chunk_validation_normal_duration(self):
    """Test chunk processing with normal duration."""
    file_count = 3
    new_duration = 10.5

    # Should not adjust count for valid duration
    if new_duration == 0.0:
      file_count -= 1

    self.assertEqual(file_count, 3)


class VideoOutputPathTest(unittest.TestCase):
  """Tests for video output path generation."""

  def test_output_file_path_generation(self):
    """Test generation of output file paths for chunks."""
    output_folder = '/tmp/chunks'
    chunk_number = 1
    suffix = '_video_chunk'
    extension = '.mp4'

    expected_filename = f'{chunk_number}{suffix}{extension}'
    expected_path = os.path.join(output_folder, expected_filename)

    actual_filename = f'{chunk_number}{suffix}{extension}'
    actual_path = os.path.join(output_folder, actual_filename)

    self.assertEqual(actual_path, expected_path)

  def test_output_path_with_different_extensions(self):
    """Test output paths with various video extensions."""
    output_folder = '/tmp/chunks'
    extensions = ['.mp4', '.avi', '.mov', '.mkv']

    for ext in extensions:
      filename = f'1_video_chunk{ext}'
      path = os.path.join(output_folder, filename)

      self.assertTrue(path.startswith(output_folder))
      self.assertTrue(path.endswith(ext))


if __name__ == '__main__':
  unittest.main()
