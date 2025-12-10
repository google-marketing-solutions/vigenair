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

"""Unit tests for combiner.py."""

import json
import os
import sys
import unittest
from unittest import mock

# Mock dependencies before importing combiner
sys.modules['config'] = mock.MagicMock()
sys.modules['storage'] = mock.MagicMock()
sys.modules['utils'] = mock.MagicMock()
sys.modules['vertexai'] = mock.MagicMock()
sys.modules['vertexai.generative_models'] = mock.MagicMock()
sys.modules['pandas'] = mock.MagicMock()

# Add project root to sys.path
sys.path.append(
    os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from service.combiner import combiner  # pylint: disable=g-import-not-at-top


class CombinerTest(unittest.TestCase):

  def setUp(self):
    super().setUp()
    self.mock_storage = sys.modules['storage']
    self.mock_utils = sys.modules['utils']
    self.mock_config = sys.modules['config']
    self.mock_vertexai = sys.modules['vertexai']

    # Reset mocks to ensure test isolation
    self.mock_storage.reset_mock()
    self.mock_utils.reset_mock()
    self.mock_config.reset_mock()
    self.mock_vertexai.reset_mock()

    # Setup common config mocks
    self.mock_config.GCP_PROJECT_ID = 'test-project'
    self.mock_config.GCP_LOCATION = 'test-location'
    self.mock_config.CONFIG_TEXT_MODEL = 'text-model'
    self.mock_config.CONFIG_VISION_MODEL = 'vision-model'
    self.mock_config.OUTPUT_COMBINATIONS_FILE = 'combos.json'
    self.mock_config.INPUT_RENDERING_FINALISE_FILE = 'finalise'
    self.mock_config.INPUT_FILENAME = 'input.mp4'
    self.mock_config.OUTPUT_SPEECH_FILE = 'speech.wav'
    self.mock_config.OUTPUT_MUSIC_FILE = 'music.wav'
    self.mock_config.OUTPUT_LANGUAGE_FILE = 'lang.txt'
    self.mock_config.DEFAULT_VIDEO_LANGUAGE = 'en'
    self.mock_config.CONFIG_DEFAULT_FADE_OUT_DURATION = 2.0
    self.mock_config.CONFIG_DEFAULT_FADE_OUT_BUFFER = 0.5
    self.mock_config.FFMPEG_SQUARE_BLUR_FILTER = 'boxblur'
    self.mock_config.FFMPEG_VERTICAL_BLUR_FILTER = 'boxblur'
    self.mock_config.GCS_BASE_URL = 'https://storage.googleapis.com'

  def _get_mock_variant_json_bytes(self):
    """Returns a byte string representing a list containing one valid VideoVariant."""
    return json.dumps([{
        'variant_id': 1,
        'av_segments': [],
        'render_settings': {},
        'title': 't',
        'description': 'd',
        'score': 0.0,
        'score_reasoning': 'r'
    }]).encode('utf-8')

  def _mock_download_side_effect(self, file_path, **kwargs):
    """Side effect for download_gcs_file to return content or path."""
    if kwargs.get('fetch_contents'):
      return self._get_mock_variant_json_bytes()
    return str(file_path)

  def test_video_format_enum(self):
    """Tests that VideoFormat enum parses aspect ratios correctly."""
    self.assertEqual(
        combiner.VideoFormat.from_aspect_ratio('16:9'),
        combiner.VideoFormat.HORIZONTAL,
    )
    self.assertEqual(
        combiner.VideoFormat.from_aspect_ratio('9:16'),
        combiner.VideoFormat.VERTICAL,
    )
    self.assertTrue(combiner.VideoFormat.HORIZONTAL.is_horizontal)
    self.assertFalse(combiner.VideoFormat.VERTICAL.is_horizontal)

    with self.assertRaises(ValueError):
      combiner.VideoFormat.from_aspect_ratio('invalid')

  def test_render_settings_init(self):
    """Tests initialization and validation of VideoVariantRenderSettings."""
    settings = combiner.VideoVariantRenderSettings(
        formats=['16:9', '1:1'], generate_image_assets=True
    )
    self.assertIn(combiner.VideoFormat.HORIZONTAL, settings.formats)
    self.assertIn(combiner.VideoFormat.SQUARE, settings.formats)
    self.assertTrue(settings.generate_image_assets)

    # Test invalid format handling
    with self.assertLogs(level='WARNING') as cm:
      settings_invalid = combiner.VideoVariantRenderSettings(
          formats=['invalid'])
      self.assertEqual(settings_invalid.formats, [])
      self.assertTrue(
          any('Invalid format aspect ratio "invalid"' in o for o in cm.output))

  def test_video_variant_mapper(self):
    """Tests mapping a dictionary to a VideoVariant object."""
    data = {
        'variant_id': 123,
        'title': 'Test',
        'description': 'Desc',
        'score': 1.0,
        'score_reasoning': 'Good',
        'av_segments': [
            {'av_segment_id': 1, 'start_s': 0.0, 'end_s': 5.0}
        ],
        'render_settings': {'formats': ['16:9']},
    }
    variant = combiner._video_variant_mapper((0, data))
    self.assertEqual(variant.variant_id, 123)
    self.assertEqual(variant.title, 'Test')
    self.assertIsInstance(
        variant.render_settings, combiner.VideoVariantRenderSettings
    )
    self.assertEqual(
        variant.render_settings.formats, [combiner.VideoFormat.HORIZONTAL]
    )
    self.assertIn('1', variant.av_segments)

  def test_check_finalise_render_not_ready(self):
    """Tests that finalise is not triggered if not all files are present."""
    c = combiner.Combiner('bucket', mock.Mock(gcs_folder='folder'))
    self.mock_storage.filter_files.return_value = ['file1']

    c.check_finalise_render(2)

    self.mock_storage.upload_gcs_file.assert_not_called()

  def test_check_finalise_render_ready(self):
    """Tests that finalise is triggered when all files are present."""
    c = combiner.Combiner('bucket', mock.Mock(gcs_folder='folder'))
    self.mock_storage.filter_files.return_value = ['file1', 'file2']

    with mock.patch('builtins.open', mock.mock_open()):
      c.check_finalise_render(2)

    self.mock_storage.upload_gcs_file.assert_called_once()

  def test_finalise_render(self):
    """Tests aggregating multiple combo JSON files into one."""
    c = combiner.Combiner('bucket', mock.Mock(gcs_folder='folder'))
    self.mock_storage.filter_files.return_value = [
        b'{"combo1": {}}',
        b'{"combo2": {}}',
    ]

    with mock.patch('builtins.open', mock.mock_open()):
      c.finalise_render()

    self.mock_storage.upload_gcs_file.assert_called_once()

  def test_group_consecutive_segments(self):
    """Tests grouping of sequential segment IDs."""
    # 1.1 and 1.2 are sequential. 1.4 is not. 1.5 is sequential to 1.4.
    segments = ['1.1', '1.2', '1.4', '1.5', '2.1']
    groups = combiner._group_consecutive_segments(segments)
    expected = [('1.1', '1.2'), ('1.4', '1.5'), ('2.1', '2.1')]
    self.assertEqual(groups, expected)

  def test_is_sequential_segments(self):
    """Tests logic for determining if two segment IDs are sequential."""
    self.assertTrue(combiner._is_sequential_segments('1.1', '1.2'))
    self.assertTrue(combiner._is_sequential_segments('1.9', '1.10'))
    self.assertFalse(combiner._is_sequential_segments('1.1', '1.3'))
    self.assertFalse(combiner._is_sequential_segments('1.1', '2.1'))

  def test_build_ffmpeg_filters(self):
    """Tests generation of FFmpeg filter strings."""
    settings = combiner.VideoVariantRenderSettings(fade_out=True)
    timestamps = [(0, 5), (10, 15)]  # Total 10s
    has_audio = True
    video_duration = 20.0

    full, music, _ = combiner._build_ffmpeg_filters(
        timestamps, has_audio, settings, video_duration
    )

    self.assertIn('between(t,0,5)', full)
    self.assertIn('between(t,10,15)', full)
    self.assertIn('afade=t=out', full)
    self.assertIn('amerge=inputs=2', music)

  @mock.patch('service.combiner.combiner._update_or_create_video_metadata')
  @mock.patch('service.combiner.combiner._render_video_variant')
  def test_render(self, mock_render_variant, _):
    """Tests the main render orchestration flow."""
    render_file = mock.Mock(
        file_name='1-1_render.json',
        gcs_folder='folder',
        gcs_root_folder='root',
    )
    c = combiner.Combiner('bucket', render_file)

    # Mock storage downloads
    self.mock_storage.filter_video_files.return_value = ['video.mp4']
    self.mock_storage.download_gcs_file.side_effect = (
        self._mock_download_side_effect)

    mock_render_variant.return_value = {'variants': {}}

    with mock.patch('builtins.open', mock.mock_open()), mock.patch(
        'tempfile.mkdtemp', return_value='/tmp/test'
    ):
      c.render()

    mock_render_variant.assert_called_once()
    self.mock_storage.upload_gcs_dir.assert_called()

  @mock.patch('service.combiner.combiner._create_cropped_videos')
  @mock.patch('service.combiner.combiner._update_or_create_video_metadata')
  def test_initial_render(self, _, mock_create_cropped):
    """Tests the initial render (cropping) flow."""
    render_file = mock.Mock(
        file_name='render.json', gcs_folder='folder', gcs_root_folder='root'
    )
    c = combiner.Combiner('bucket', render_file)

    self.mock_storage.filter_video_files.return_value = ['video.mp4']
    self.mock_storage.download_gcs_file.side_effect = (
        self._mock_download_side_effect)

    with mock.patch('builtins.open', mock.mock_open()), mock.patch(
        'tempfile.mkdtemp', return_value='/tmp/test'
    ):
      c.initial_render()

    mock_create_cropped.assert_called_once()
    self.mock_storage.upload_gcs_dir.assert_called()

  def test_create_cropped_video(self):
    """Tests construction of FFmpeg crop commands."""
    with mock.patch(
        'builtins.open', mock.mock_open(read_data='crop w 100, crop h 100;')
    ):
      path = combiner._create_cropped_video(
          'video.mp4', 'crop.txt', '/out', 'square', '.mp4'
      )
      self.assertEqual(path, '/out/crop_square.mp4')
      self.mock_utils.execute_subprocess_commands.assert_called_once()

  def test_get_video_dimensions(self):
    """Tests parsing of video dimensions from ffprobe output."""
    with mock.patch('subprocess.check_output', return_value=b'1920x1080\n'):
      w, h = combiner._get_video_dimensions('video.mp4')
      self.assertEqual(w, 1920)
      self.assertEqual(h, 1080)

  def test_generate_video_script(self):
    """Tests generation of the video script string from segment data."""
    variant = combiner.VideoVariant(
        variant_id=1,
        av_segments={
            '1': combiner.VideoVariantSegment(
                av_segment_id=1, start_s=0, end_s=5
            )
        },
        title='t',
        description='d',
        score=1.0,
        score_reasoning='r',
        render_settings=combiner.VideoVariantRenderSettings(),
    )
    # Passing list of dicts as the code iterates and accesses by key
    segments_data = [{
        'av_segment_id': 1,
        'start_s': 0.0,
        'end_s': 5.0,
        'description': 'desc',
        'visual_segment_ids': ['v1'],
        'transcript': ['hello'],
        'labels': ['label'],
        'objects': ['obj'],
        'text': ['txt'],
        'logos': ['logo'],
        'keywords': 'key',
    }]

    script = combiner._generate_video_script(segments_data, variant)
    self.assertIn('Scene 1', script)
    self.assertIn('0.0 --> 5.0', script)
    self.assertIn('Off-screen speech: "hello"', script)

  def test_generate_text_assets(self):
    """Tests generation of text assets using the Vision model."""
    self.mock_config.GENERATE_ASSETS_PROMPT = 'prompt'
    self.mock_config.GENERATE_ASSETS_SEPARATOR = '###'
    self.mock_config.GENERATE_ASSETS_PATTERN = (
        r'Headline: (.*)\nDescription: (.*)'
    )

    mock_response = mock.Mock()
    mock_part = mock.Mock()
    mock_part.text = 'Headline: H1\nDescription: D1'
    mock_response.candidates = [mock.Mock(content=mock.Mock(parts=[mock_part]))]

    mock_vision_model = mock.Mock()
    mock_vision_model.generate_content.return_value = mock_response

    # Configure pandas mock to return expected data
    mock_pandas = sys.modules['pandas']
    mock_df = mock.Mock()
    mock_pandas.DataFrame.return_value = mock_df
    mock_df.to_dict.return_value = [{'headline': 'H1', 'description': 'D1'}]

    assets = combiner._generate_text_assets(
        mock_vision_model, 'gs://video', 'en', mock.Mock(variant_id=1)
    )

    self.assertEqual(len(assets), 1)
    self.assertEqual(assets[0]['headline'], 'H1')
    self.assertEqual(assets[0]['description'], 'D1')


if __name__ == '__main__':
  unittest.main()
