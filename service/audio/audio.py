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

"""Vigenair audio service.

This module contains functions to extract, split and transcribe audio files.
"""

import datetime
import io
import logging
import os
import pathlib
import re
import shutil
from typing import Optional, Sequence, Tuple

import config as ConfigService
from faster_whisper import WhisperModel
from iso639 import languages
import pandas as pd
import storage as StorageService
import utils as Utils
import vertexai
from vertexai.generative_models import GenerativeModel, Part


def combine_audio_files(output_path: str, audio_files: Sequence[str]):
  """Combines audio analysis files into a single file."""
  ffmpeg_cmds = ['ffmpeg']
  for audio_file in audio_files:
    ffmpeg_cmds.extend(['-i', audio_file])

  ffmpeg_cmds += ['-filter_complex'] + [
      ''.join([f'[{index}:0]' for index, _ in enumerate(audio_files)])
      + f'concat=n={len(audio_files)}:v=0:a=1[outa]'
  ] + ['-map', '[outa]', output_path]

  Utils.execute_subprocess_commands(
      cmds=ffmpeg_cmds,
      description=(
          f'Merge {len(audio_files)} audio files and output to {output_path}.'
      ),
  )
  os.chmod(output_path, 777)


def combine_analysis_chunks(
    analysis_chunks: Sequence[pd.DataFrame]
) -> pd.DataFrame:
  """Combines audio analysis chunks into a single response."""
  combined_df = pd.DataFrame()
  max_audio_segment_id = 0
  max_end_s = 0

  for df in analysis_chunks:
    df['audio_segment_id'] += max_audio_segment_id
    df['start_s'] += max_end_s
    df['end_s'] += max_end_s

    max_audio_segment_id = df['audio_segment_id'].max()
    max_end_s = df['end_s'].max()

    combined_df = pd.concat([combined_df, df], ignore_index=True)

  return combined_df


def _parse_vtt_timestamp(timestamp: str) -> datetime.timedelta:
  """Parses both MM:SS.mmm and HH:MM:SS.mmm WebVTT timestamps.

  Args:
    timestamp: A WebVTT timestamp string, which may optionally include trailing
      cue settings (e.g. '00:01:23.456 align:start').

  Returns:
    The parsed timestamp as a datetime.timedelta.

  Raises:
    ValueError: If the timestamp format is invalid.
  """
  cleaned_timestamp = (
      timestamp.strip().split()[0] if timestamp.strip() else ''
  )
  parts = cleaned_timestamp.split(':')
  if len(parts) not in (2, 3):
    raise ValueError(f'Invalid WebVTT timestamp format: {timestamp}')

  hours_int = int(parts[0]) if len(parts) == 3 else 0
  minutes_int = int(parts[1]) if len(parts) == 3 else int(parts[0])
  seconds_str = parts[2] if len(parts) == 3 else parts[1]

  seconds_parts = seconds_str.replace(',', '.').split('.', 1)
  seconds_int = int(seconds_parts[0])
  milliseconds_str = seconds_parts[1] if len(seconds_parts) > 1 else ''
  milliseconds_int = (
      int(milliseconds_str.ljust(3, '0')[:3]) if milliseconds_str else 0
  )

  return datetime.timedelta(
      hours=hours_int,
      minutes=minutes_int,
      seconds=seconds_int,
      milliseconds=milliseconds_int,
  )


def combine_subtitle_files(
    audio_output_dir: str,
    subtitles_output_path: str,
):
  """Combines audio analysis subtitle files content into a single file."""
  subtitles_files = [
      str(file_path) for file_path in pathlib.Path(audio_output_dir).
      glob(f'*.{ConfigService.OUTPUT_SUBTITLES_TYPE}')
  ]
  logging.info(
      'THREADING - Combining %d subtitle files found in %s...',
      len(subtitles_files),
      audio_output_dir,
  )
  combined_content = ''
  last_timestamp = datetime.datetime.strptime('00:00:00.000', '%H:%M:%S.%f')

  for index, subtitles_file in enumerate(subtitles_files):
    with open(subtitles_file, 'r', encoding='utf-8') as f:
      lines = f.readlines()

      if index:
        lines = lines[2:]

      for line in lines:
        if '-->' in line:
          start, end = line.strip().split(' --> ')
          start_time = last_timestamp + _parse_vtt_timestamp(start)
          end_time = last_timestamp + _parse_vtt_timestamp(end)

          start = start_time.strftime('%H:%M:%S.%f')[:-3]
          end = end_time.strftime('%H:%M:%S.%f')[:-3]

          combined_content += f'{start} --> {end}\n'
        else:
          combined_content += line

      timestamp_lines = [line for line in lines if '-->' in line]
      if timestamp_lines:
        _, end = timestamp_lines[-1].strip().split(' --> ')
        last_timestamp += _parse_vtt_timestamp(end)

  with open(subtitles_output_path, 'w', encoding='utf-8') as f:
    f.write(combined_content)


def extract_audio(video_file_path: str) -> Optional[str]:
  """Extracts the audio track from a video file, if it exists.

  Args:
    video_file_path: path to the video file from which the audio will be
      extracted.

  Returns:
    The path to the extracted audio file if it exists, or None if the video does
    not contain an audio track.
  """
  output = Utils.execute_subprocess_commands(
      cmds=[
          'ffprobe',
          '-i',
          video_file_path,
          '-show_streams',
          '-select_streams',
          'a',
          '-loglevel',
          'error',
      ],
      description='check if video has audio with ffprobe',
  )
  if not output:
    logging.warning(
        'AUDIO_EXTRACTION - Video does not contain an audio track! '
        'Skipping audio extraction...'
    )
    return None

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
    prefix='',
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
  base_path, _ = os.path.splitext(audio_file_path)
  vocals_file_path = str(
      pathlib.Path(output_dir, f'{prefix}{ConfigService.OUTPUT_SPEECH_FILE}')
  )
  music_file_path = str(
      pathlib.Path(output_dir, f'{prefix}{ConfigService.OUTPUT_MUSIC_FILE}')
  )

  shutil.move(
      f'{base_path}/{ConfigService.OUTPUT_SPEECH_FILE}',
      vocals_file_path if prefix else output_dir
  )
  shutil.move(
      f'{base_path}/{ConfigService.OUTPUT_MUSIC_FILE}',
      music_file_path if prefix else output_dir
  )
  os.rmdir(base_path)

  return vocals_file_path, music_file_path


def transcribe_audio(
    output_dir: str,
    audio_file_path: str,
    transcription_service: Utils.TranscriptionService,
    gcs_folder: str,
    gcs_bucket_name: str,
) -> Tuple[pd.DataFrame, str, float]:
  """Transcribes an audio file and returns the transcription.

  Args:
    output_dir: Directory where the transcription will be saved.
    audio_file_path: Path to the audio file that will be transcribed.
    transcription_service: The service to use for transcription.
    gcs_folder: The GCS folder to use.
    gcs_bucket_name: The GCS bucket to use.

  Returns:
    A pandas dataframe with the transcription data.
  """
  match transcription_service:
    case Utils.TranscriptionService.GEMINI:
      return _transcribe_gemini(
          output_dir, audio_file_path, gcs_folder, gcs_bucket_name
      )
    case Utils.TranscriptionService.WHISPER | _:
      return _transcribe_whisper(output_dir, audio_file_path)


def _transcribe_gemini(
    output_dir: str,
    audio_file_path: str,
    gcs_folder: str,
    gcs_bucket_name: str,
) -> Tuple[pd.DataFrame, str, float]:
  """Transcribes audio using Gemini."""
  transcription_dataframe = pd.DataFrame()
  video_language = ConfigService.DEFAULT_VIDEO_LANGUAGE
  language_probability = 0.0
  subtitles_content = None

  vertexai.init(
      project=ConfigService.GCP_PROJECT_ID,
      location=ConfigService.GCP_LOCATION,
  )
  transcription_model = (
      GenerativeModel(ConfigService.CONFIG_TRANSCRIPTION_MODEL_GEMINI)
  )
  audio_file_gcs_uri = f'gs://{gcs_bucket_name}/{gcs_folder}' + (
      f'/{ConfigService.OUTPUT_ANALYSIS_CHUNKS_DIR}'
      if ConfigService.OUTPUT_ANALYSIS_CHUNKS_DIR in audio_file_path else ''
  ) + audio_file_path.replace(output_dir, '')
  try:
    response = transcription_model.generate_content(
        [
            Part.from_uri(audio_file_gcs_uri, mime_type='audio/wav'),
            ConfigService.TRANSCRIBE_AUDIO_PROMPT,
        ],
        generation_config=ConfigService.TRANSCRIBE_AUDIO_CONFIG,
        safety_settings=ConfigService.CONFIG_DEFAULT_SAFETY_CONFIG,
    )
    if (
        response.candidates and response.candidates[0].content.parts
        and response.candidates[0].content.parts[0].text
    ):
      text = response.candidates[0].content.parts[0].text
      result = (
          re.search(ConfigService.TRANSCRIBE_AUDIO_PATTERN, text, re.DOTALL)
      )
      logging.info('TRANSCRIPTION - %s', text)
      video_language = result.group(1)
      language_probability = result.group(2)
      transcription_dataframe = (
          pd.read_csv(io.StringIO(result.group(3)), usecols=[
              0, 1, 2
          ]).dropna(axis=1, how='all').rename(
              columns={
                  'Start': 'start_s',
                  'End': 'end_s',
                  'Transcription': 'transcript',
              }
          ).assign(
              audio_segment_id=lambda df: range(1,
                                                len(df) + 1),
              start_s=lambda df: df['start_s'].
              apply(Utils.timestring_to_seconds),
              end_s=lambda df: df['end_s'].apply(Utils.timestring_to_seconds),
              duration_s=lambda df: df['end_s'] - df['start_s'],
          )
      )
      subtitles_content = result.group(4)
    else:
      logging.warning(
          'Could not transcribe audio! Returning empty transcription...'
      )
  # Execution should continue regardless of the underlying exception
  # pylint: disable=broad-exception-caught
  except Exception:
    logging.exception(
        'Encountered error during transcription! '
        'Returning empty transcription...'
    )

  subtitles_output_path = audio_file_path.replace(
      '.wav', f'.{ConfigService.OUTPUT_SUBTITLES_TYPE}'
  )
  with open(subtitles_output_path, 'w', encoding='utf8') as f:
    if subtitles_content:
      f.write(subtitles_content)
    else:
      pass

  logging.info(
      'TRANSCRIPTION - transcript for %s written successfully!',
      audio_file_path,
  )
  return transcription_dataframe, video_language, float(language_probability)


def _transcribe_whisper(
    output_dir: str,
    audio_file_path: str,
) -> Tuple[pd.DataFrame, str, float]:
  """Transcribes audio using Whisper."""
  model_download_dir_base = (
      f'/tmp/{ConfigService.CONFIG_TRANSCRIPTION_MODEL_WHISPER_GCS_BUCKET}'
  )
  model_download_dir = str(
      pathlib.Path(
          model_download_dir_base,
          ConfigService.CONFIG_TRANSCRIPTION_MODEL_WHISPER,
      )
  )
  os.makedirs(model_download_dir, exist_ok=True)
  count_files = StorageService.download_gcs_dir(
      bucket_name=ConfigService.CONFIG_TRANSCRIPTION_MODEL_WHISPER_GCS_BUCKET,
      dir_path=ConfigService.CONFIG_TRANSCRIPTION_MODEL_WHISPER,
      output_dir=model_download_dir,
  )
  model = WhisperModel(
      model_download_dir
      if count_files else ConfigService.CONFIG_TRANSCRIPTION_MODEL_WHISPER,
      device=ConfigService.DEVICE,
      compute_type='int8',
  )
  segments, info = model.transcribe(
      audio_file_path,
      beam_size=5,
      word_timestamps=True,
  )

  video_language = languages.get(alpha2=info.language).name
  language_probability = info.language_probability

  results = list(segments)
  results_dict = []
  for result in results:
    result_dict = result._asdict()
    words_dict = [word._asdict() for word in result_dict['words']]
    result_dict['words'] = words_dict
    results_dict.append(result_dict)

  is_srt = ConfigService.OUTPUT_SUBTITLES_TYPE.lower() == 'srt'
  subtitles_name = (
      f'{pathlib.Path(audio_file_path).stem}.'
      f'{ConfigService.OUTPUT_SUBTITLES_TYPE}'
  )
  subtitles_path = pathlib.Path(output_dir, subtitles_name)
  with open(subtitles_path, 'w', encoding='utf8') as subtitles_file:
    if not is_srt:
      subtitles_file.write('WEBVTT\n\n')
    for index, segment in enumerate(results_dict, start=1):
      start_ts = _format_vtt_timestamp(segment['start'])
      end_ts = _format_vtt_timestamp(segment['end'])
      if is_srt:
        start_ts = start_ts.replace('.', ',')
        end_ts = end_ts.replace('.', ',')
      subtitles_file.write(
          f'{index}\n'
          f'{start_ts} --> {end_ts}\n'
          f'{segment["text"].strip()}\n\n'
      )
  logging.info(
      'TRANSCRIPTION - transcript for %s written successfully!',
      audio_file_path,
  )

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
  return transcription_dataframe, video_language, language_probability


def _format_vtt_timestamp(seconds: float) -> str:
  """Formats seconds as a WebVTT timestamp (HH:MM:SS.mmm).

  Args:
    seconds: Elapsed time in seconds. Clamped to non-negative values.

  Returns:
    Formatted WebVTT timestamp string.
  """
  milliseconds = round(max(0.0, seconds) * 1000)
  hours, milliseconds = divmod(milliseconds, 60 * 60 * 1000)
  minutes, milliseconds = divmod(milliseconds, 60 * 1000)
  whole_seconds, milliseconds = divmod(milliseconds, 1000)
  return f'{hours:02d}:{minutes:02d}:{whole_seconds:02d}.{milliseconds:03d}'
