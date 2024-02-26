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

"""ViGenAiR audio service.

This module contains functions to extract, split and transcribe audio files.
"""

import logging
import os
import pathlib
import shutil
from typing import Tuple

from faster_whisper import WhisperModel
from iso639 import languages
import pandas as pd
import whisper

import config as ConfigService
import utils as Utils


def extract_audio(video_file_path: str) -> str:
  """Extracts the audio track from a video file.

  Args:
    video_file_path: path to the video file from which the audio will be
      extracted.

  Returns:
    The path to the extracted audio file.
  """
  audio_file_path = f"{video_file_path.split('.')[0]}.wav"

  Utils.execute_subprocess_commands(
      cmds=[
          'ffmpeg',
          '-i',
          video_file_path,
          '-q:a',
          '0',
          '-map',
          'a',
          audio_file_path,
      ],
      description='extract audio track with ffmpeg',
  )
  return audio_file_path


def split_audio(
    output_dir: str,
    audio_file_path: str,
) -> Tuple[str, str]:
  """Splits the audio into vocals and music tracks and returns their paths.

  Args:
    output_dir: directory where the split audio tracks will be saved.
    audio_file_path: path to the audio file that will be split.

  Returns:
    A tuple with the path to the vocals and music tracks.
  """
  Utils.execute_subprocess_commands(
      cmds=[
          'spleeter',
          'separate',
          '-o',
          output_dir,
          audio_file_path,
      ],
      description='split voice-over and background music with spleeter',
  )
  base_path = audio_file_path.split('.')[0]
  shutil.move(f'{base_path}/vocals.wav', output_dir)
  shutil.move(f'{base_path}/accompaniment.wav', output_dir)
  os.rmdir(base_path)

  vocals_file_path = str(pathlib.Path(output_dir, 'vocals.wav'))
  music_file_path = str(pathlib.Path(output_dir, 'accompaniment.wav'))

  return vocals_file_path, music_file_path


def transcribe_audio(output_dir: str, audio_file_path: str) -> pd.DataFrame:
  """Transcribes an audio file and returns the transcription.

  Args:
    output_dir: directory where the transcription will be saved.
    audio_file_path: path to the audio file that will be transcribed.

  Returns:
    A pandas dataframe with the transcription data.
  """
  model = WhisperModel(
      ConfigService.CONFIG_WHISPER_MODEL,
      device=ConfigService.DEVICE,
      compute_type='int8',
  )
  segments, info = model.transcribe(
      audio_file_path,
      beam_size=5,
      word_timestamps=True,
  )

  video_language = languages.get(alpha2=info.language).name
  Utils.execute_subprocess_commands(
      cmds=[
          'echo',
          video_language,
          '>>',
          f'{output_dir}/language.txt',
      ],
      description='write language.txt',
  )

  results = list(segments)
  results_dict = []
  for result in results:
    result_dict = result._asdict()
    words_dict = [word._asdict() for word in result_dict['words']]
    result_dict['words'] = words_dict
    results_dict.append(result_dict)

  writer = whisper.utils.get_writer('vtt', f'{output_dir}/')
  writer({'segments': results_dict}, audio_file_path, {'highlight_words': True})
  logging.info('TRANSCRIPTION - WebVTT written successfully!')

  transcription_data = []
  for index, segment in enumerate(results):
    transcription_data.append((
        index + 1,
        segment.start,
        segment.end,
        segment.end - segment.start,
        segment.text,
    ))
  transcription_dataframe = pd.DataFrame(
      transcription_data,
      columns=[
          'audio_segment_id',
          'start_s',
          'end_s',
          'duration_s',
          'transcript',
      ],
  )
  return transcription_dataframe
