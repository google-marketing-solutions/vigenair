# Copyright 2026 Google LLC.
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

"""Unit tests for audio service."""

import datetime
import os
import sys
import tempfile
import unittest
from unittest import mock

class AudioTest(unittest.TestCase):

  @classmethod
  def setUpClass(cls):
    super().setUpClass()
    cls._modules_patcher = mock.patch.dict(sys.modules, {
        'config': mock.MagicMock(OUTPUT_SUBTITLES_TYPE='vtt'),
        'faster_whisper': mock.MagicMock(),
        'iso639': mock.MagicMock(),
        'pandas': mock.MagicMock(),
        'storage': mock.MagicMock(),
        'utils': mock.MagicMock(),
        'vertexai': mock.MagicMock(),
        'vertexai.generative_models': mock.MagicMock(),
    })
    cls._modules_patcher.start()

    service_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), '..')
    )
    if service_dir not in sys.path:
      sys.path.insert(0, service_dir)
    project_root = os.path.abspath(
        os.path.join(os.path.dirname(__file__), '../../')
    )
    if project_root not in sys.path:
      sys.path.append(project_root)

    # pylint: disable=g-import-not-at-top
    from service.audio import audio as audio_service
    # pylint: enable=g-import-not-at-top
    cls.audio_service = audio_service

  @classmethod
  def tearDownClass(cls):
    cls._modules_patcher.stop()
    super().tearDownClass()

  def test_parse_vtt_timestamp_without_milliseconds(self):
    self.assertEqual(
        self.audio_service._parse_vtt_timestamp('00:01:23'),
        datetime.timedelta(minutes=1, seconds=23),
    )

  def test_parse_vtt_timestamp_with_milliseconds(self):
    self.assertEqual(
        self.audio_service._parse_vtt_timestamp('01:23.456'),
        datetime.timedelta(minutes=1, seconds=23, milliseconds=456),
    )

  def test_parse_vtt_timestamp_supports_hours(self):
    self.assertEqual(
        self.audio_service._parse_vtt_timestamp('02:01:23.456'),
        datetime.timedelta(hours=2, minutes=1, seconds=23, milliseconds=456),
    )

  def test_parse_vtt_timestamp_supports_comma_separator(self):
    self.assertEqual(
        self.audio_service._parse_vtt_timestamp('02:01:23,456'),
        datetime.timedelta(hours=2, minutes=1, seconds=23, milliseconds=456),
    )

  def test_parse_vtt_timestamp_with_cue_settings(self):
    self.assertEqual(
        self.audio_service._parse_vtt_timestamp(
            '00:01:23.456 align:start position:10%'
        ),
        datetime.timedelta(minutes=1, seconds=23, milliseconds=456),
    )

  def test_parse_vtt_timestamp_invalid_format_raises(self):
    with self.assertRaises(ValueError):
      self.audio_service._parse_vtt_timestamp('invalid')

  def test_empty_vtt_does_not_raise_when_combining_subtitles(self):
    with tempfile.TemporaryDirectory() as temp_dir:
      subtitles_path = os.path.join(temp_dir, 'chunk.vtt')
      with open(subtitles_path, 'w', encoding='utf-8') as subtitle_file:
        subtitle_file.write('WEBVTT\n\n')

      output_path = os.path.join(temp_dir, 'combined.vtt')
      self.audio_service.combine_subtitle_files(temp_dir, output_path)

      with open(output_path, 'r', encoding='utf-8') as output_file:
        self.assertEqual(output_file.read(), 'WEBVTT\n\n')

  def test_format_vtt_timestamp_supports_hours(self):
    self.assertEqual(
        self.audio_service._format_vtt_timestamp(83.456),
        '00:01:23.456',
    )

  def test_format_vtt_timestamp_clamps_negative_seconds(self):
    self.assertEqual(
        self.audio_service._format_vtt_timestamp(-0.01),
        '00:00:00.000',
    )

  def test_transcribe_whisper_writes_srt_format(self):
    mock_segment = mock.MagicMock()
    mock_segment.start = 1.234
    mock_segment.end = 5.678
    mock_segment.text = 'Hello world'
    mock_segment._asdict.return_value = {
        'start': 1.234,
        'end': 5.678,
        'text': 'Hello world',
        'words': [],
    }
    mock_info = mock.MagicMock()
    mock_info.language = 'en'
    mock_info.language_probability = 0.99

    mock_whisper_model = mock.MagicMock()
    mock_whisper_model.transcribe.return_value = ([mock_segment], mock_info)

    with tempfile.TemporaryDirectory() as temp_dir:
      audio_path = os.path.join(temp_dir, 'sample.wav')
      with open(audio_path, 'wb') as f:
        f.write(b'dummy')

      with mock.patch(
          'service.audio.audio.WhisperModel', return_value=mock_whisper_model
      ), mock.patch(
          'service.audio.audio.languages'
      ) as mock_languages, mock.patch(
          'service.audio.audio.ConfigService'
      ) as mock_config:
        mock_languages.get.return_value.name = 'English'
        mock_config.OUTPUT_SUBTITLES_TYPE = 'srt'
        mock_config.CONFIG_TRANSCRIPTION_MODEL_WHISPER = 'model'
        mock_config.DEVICE = 'cpu'

        self.audio_service._transcribe_whisper(temp_dir, audio_path)

        srt_path = os.path.join(temp_dir, 'sample.srt')
        self.assertTrue(os.path.exists(srt_path))
        with open(srt_path, 'r', encoding='utf-8') as f:
          content = f.read()
        self.assertNotIn('WEBVTT', content)
        self.assertIn('00:00:01,234 --> 00:00:05,678', content)
        self.assertIn('Hello world', content)


if __name__ == '__main__':
  unittest.main()
