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

"""Audio Extraction Component.

This module provides functionality to extract all available audio information
from an input video file.
"""

import concurrent.futures
import json
import logging
import os
import pathlib
import tempfile
from typing import Sequence, Tuple

import audio as AudioService
import config as ConfigService
import storage as StorageService
import utils as Utils

VIDEO_LANGUAGE_KEY = 'video_language'
LANGUAGE_PROBABILITY_KEY = 'language_probability'


def process_audio(
    output_dir: str,
    input_audio_file_path: str,
    gcs_bucket_name: str,
    media_file: Utils.TriggerFile,
):
  """Performs audio analysis."""
  if (
      input_audio_file_path and media_file.video_metadata.transcription_service
      != Utils.TranscriptionService.NONE
  ):
    _process_video_with_audio(
        output_dir,
        input_audio_file_path,
        media_file,
        gcs_bucket_name,
    )
  else:
    _process_video_without_audio(
        output_dir,
        media_file.gcs_root_folder,
        gcs_bucket_name,
    )


def _process_video_with_audio(
    output_dir: str,
    input_audio_file_path: str,
    media_file: Utils.TriggerFile,
    gcs_bucket_name: str,
):
  """Creates audio chunks to be analysed."""
  audio_chunks = _get_audio_chunks(
      output_dir=output_dir,
      audio_file_path=input_audio_file_path,
  )
  size = len(audio_chunks)
  logging.info('EXTRACTOR - processing audio with %d chunks...', size)
  StorageService.upload_gcs_dir(
      source_directory=output_dir,
      bucket_name=gcs_bucket_name,
      target_dir=media_file.gcs_folder,
  )
  if size == 1:
    extract_audio(
        Utils.TriggerFile(
            f"{'.'.join(media_file.full_gcs_path.split('.')[:-1])}.wav"
        ),
        gcs_bucket_name,
    )


def _process_video_without_audio(
    output_dir: str,
    gcs_folder: str,
    gcs_bucket_name: str,
):
  """Skips audio analysis."""
  subtitles_filepath = str(
      pathlib.Path(output_dir, ConfigService.OUTPUT_SUBTITLES_FILE)
  )
  with open(subtitles_filepath, 'w', encoding='utf8'):
    pass
  StorageService.upload_gcs_file(
      file_path=subtitles_filepath,
      bucket_name=gcs_bucket_name,
      destination_file_name=str(
          pathlib.Path(gcs_folder, ConfigService.OUTPUT_SUBTITLES_FILE)
      ),
  )
  _check_finalise_extract_audio(
      total_count=1,
      gcs_bucket_name=gcs_bucket_name,
      gcs_folder=gcs_folder,
      skip_analysis=True,
  )
  logging.info(
      'TRANSCRIPTION - Empty %s written successfully!',
      ConfigService.OUTPUT_SUBTITLES_FILE,
  )


def extract_audio(media_file: Utils.TriggerFile, gcs_bucket_name: str):
  """Extracts audio information from the input video."""
  tmp_dir = tempfile.mkdtemp()
  is_chunk = (
      ConfigService.INPUT_EXTRACTION_AUDIO_FILENAME_SUFFIX
      in media_file.full_gcs_path
  )
  audio_id = media_file.file_name.replace(
      ConfigService.INPUT_EXTRACTION_AUDIO_FILENAME_SUFFIX, ''
  )
  audio_output_dir = str(
      pathlib.Path(tmp_dir, ConfigService.OUTPUT_ANALYSIS_CHUNKS_DIR)
  )
  output_dir = audio_output_dir if is_chunk else tmp_dir
  os.makedirs(output_dir, exist_ok=True)
  audio_file_path = StorageService.download_gcs_file(
      file_path=media_file,
      output_dir=output_dir,
      bucket_name=gcs_bucket_name,
  )
  (
      _,
      _,
      audio_transcription_dataframe,
      video_language,
      language_probability,
  ) = _analyse_audio(
      root_dir=tmp_dir,
      output_dir=output_dir,
      file_id=audio_id,
      audio_file_path=audio_file_path,
      transcription_service=media_file.video_metadata.transcription_service,
      gcs_folder=media_file.gcs_root_folder,
      gcs_bucket_name=gcs_bucket_name,
  )
  os.makedirs(audio_output_dir, exist_ok=True)
  language_info = {
      VIDEO_LANGUAGE_KEY: video_language,
      LANGUAGE_PROBABILITY_KEY: language_probability,
  }
  language_info_file_path = os.path.join(
      audio_output_dir,
      (f'{audio_id}_{ConfigService.OUTPUT_LANGUAGE_INFO_FILE}')
  )
  with open(language_info_file_path, 'w', encoding='utf8') as f:
    json.dump(language_info, f, indent=2)

  transcript_file_path = os.path.join(
      audio_output_dir,
      f'{audio_id}_{ConfigService.OUTPUT_TRANSCRIPT_FILE}',
  )
  audio_transcription_dataframe.to_json(
      transcript_file_path,
      orient='records',
  )
  logging.info(
      'THREADING - analyse_audio finished for chunk#%s!',
      audio_id,
  )
  StorageService.upload_gcs_dir(
      source_directory=tmp_dir,
      bucket_name=gcs_bucket_name,
      target_dir=media_file.gcs_root_folder,
  )
  _check_finalise_extract_audio(
      total_count=(
          1 if audio_id == ConfigService.INPUT_FILENAME else
          int(audio_id.split('-')[1])
      ),
      gcs_bucket_name=gcs_bucket_name,
      gcs_folder=media_file.gcs_folder,
  )


def _analyse_audio(
    root_dir: str,
    output_dir: str,
    file_id: str,
    audio_file_path: str,
    transcription_service: Utils.TranscriptionService,
    gcs_folder: str,
    gcs_bucket_name=str,
) -> Tuple[str, str, str, str, float]:
  """Runs audio analysis in parallel."""
  vocals_file_path = None
  music_file_path = None
  transcription_dataframe = None

  with concurrent.futures.ProcessPoolExecutor() as process_executor:
    futures_dict = {
        process_executor.submit(
            AudioService.transcribe_audio,
            output_dir=output_dir,
            audio_file_path=audio_file_path,
            transcription_service=transcription_service,
            gcs_folder=gcs_folder,
            gcs_bucket_name=gcs_bucket_name,
        ): 'transcribe_audio',
        process_executor.submit(
            AudioService.split_audio,
            output_dir=output_dir,
            audio_file_path=audio_file_path,
            prefix='' if root_dir == output_dir else f'{file_id}_',
        ): 'split_audio',
    }

    for future in concurrent.futures.as_completed(futures_dict):
      source = futures_dict[future]
      match source:
        case 'transcribe_audio':
          transcription_dataframe, language, probability = future.result()
          logging.info(
              'THREADING - transcribe_audio finished for chunk#%s!',
              file_id,
          )
          logging.info(
              'TRANSCRIPTION - Transcription dataframe for chunk#%s: %r',
              file_id,
              transcription_dataframe.to_json(orient='records'),
          )
        case 'split_audio':
          vocals_file_path, music_file_path = future.result()
          logging.info(
              'THREADING - split_audio finished for chunk#%s!',
              file_id,
          )

  return (
      vocals_file_path,
      music_file_path,
      transcription_dataframe,
      language,
      probability,
  )


def _get_audio_chunks(
    output_dir: str,
    audio_file_path: str,
    duration_limit: int = ConfigService.CONFIG_MAX_AUDIO_CHUNK_SIZE,
) -> Sequence[str]:
  """Cuts the input audio into smaller chunks by duration."""
  _, file_ext = os.path.splitext(audio_file_path)
  output_folder = str(
      pathlib.Path(output_dir, ConfigService.OUTPUT_ANALYSIS_CHUNKS_DIR)
  )
  os.makedirs(output_folder, exist_ok=True)

  duration = Utils.get_media_duration(audio_file_path)
  current_duration = 0
  file_count = 0
  result = []

  if duration > duration_limit:
    while current_duration < duration:
      file_count += 1
      output_file_path = str(
          pathlib.Path(
              output_folder,
              f'{file_count}'
              f'{ConfigService.INPUT_EXTRACTION_AUDIO_FILENAME_SUFFIX}'
              f'{file_ext}',
          )
      )
      Utils.execute_subprocess_commands(
          cmds=[
              'ffmpeg',
              '-ss',
              str(current_duration),
              '-i',
              audio_file_path,
              '-to',
              str(duration_limit),
              '-c',
              'copy',
              output_file_path,
          ],
          description=(
              f'Cut input audio into {duration_limit/60}min chunks. '
              f'Chunk #{file_count}.'
          ),
      )
      os.chmod(output_file_path, 777)
      new_duration = Utils.get_media_duration(output_file_path)
      current_duration += new_duration
      result.append(output_file_path)
  else:
    result.append(audio_file_path)

  if file_count:
    Utils.rename_chunks(
        result,
        ConfigService.INPUT_EXTRACTION_AUDIO_FILENAME_SUFFIX,
    )

  return result


def _check_finalise_extract_audio(
    total_count: int,
    gcs_bucket_name: str,
    gcs_folder: str,
    skip_analysis=False,
):
  """Checks whether all audio chunk analyses are complete."""
  analysed_count = 1 if skip_analysis else len(
      StorageService.filter_files(
          bucket_name=gcs_bucket_name,
          prefix=f'{gcs_folder}/',
          suffix=ConfigService.OUTPUT_TRANSCRIPT_FILE,
      )
  )
  if analysed_count == total_count:
    finalise_file_path = (
        f'{total_count}-{total_count}_'
        f'{ConfigService.INPUT_EXTRACTION_FINALISE_AUDIO_FILE}'
    )
    with open(finalise_file_path, 'w', encoding='utf8'):
      pass

    StorageService.upload_gcs_file(
        file_path=finalise_file_path,
        bucket_name=gcs_bucket_name,
        destination_file_name=(
            str(pathlib.Path(gcs_folder, finalise_file_path))
            if total_count > 1 else str(
                pathlib.Path(
                    gcs_folder,
                    ConfigService.OUTPUT_ANALYSIS_CHUNKS_DIR,
                    finalise_file_path,
                )
            )
        ),
    )
