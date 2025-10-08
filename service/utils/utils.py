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

"""Vigenair utils.

This module contains various utility functions used by Vigenair.
"""

import enum
import logging
import os
import pathlib
import subprocess
from typing import Optional, Sequence, Union

import config as ConfigService


class TranscriptionService(enum.Enum):
  """Enum of supported transcription services."""

  WHISPER = ['w', 'whisper']
  GEMINI = ['g', 'gemini']
  NONE = ['n']

  @classmethod
  def from_value(cls, service: str):
    for item in TranscriptionService:
      if service.lower() in item.value:
        return item
    return TranscriptionService.NONE


class RenderFormatType(enum.Enum):
  """Enum of possible render formats."""

  HORIZONTAL = 'horizontal'
  VERTICAL = 'vertical'
  SQUARE = 'square'


class RenderOverlayType(enum.Enum):
  """Enum of possible render overlays."""

  VARIANT_START = 'variant_start'
  VARIANT_END = 'variant_end'
  VIDEO_START = 'video_start'
  VIDEO_END = 'video_end'


class VideoExtension(enum.Enum):
  """Enum of supported video file extensions."""

  MP4 = 'mp4'
  FLV = 'flv'
  MOV = 'mov'
  MPEG = 'mpeg'
  M2P = 'm2p'
  MPEGPS = 'ps'
  MPG = 'mpg'
  WEBM = 'webm'
  WMV = 'wmv'
  TGPP = '3gp'

  @classmethod
  def has_value(cls, ext: str) -> bool:
    values = set(item.value for item in VideoExtension)
    return ext in values


class VideoMetadata:
  """Metadata about a video file.

  Represented via a single string formatted as follows:
  <video_name>--<transcription_service?>--<video_timestamp>--<encoded_user_id>
  """

  def __init__(self, metadata: str):
    """Initialiser.

    Args:
      metadata: Formatted metadata string.
    """
    components = metadata.split('--')
    if len(components) == 4:
      (
          video_file_name,
          transcription_service,
          video_timestamp,
          encoded_user_id,
      ) = components
      self.transcription_service = TranscriptionService.from_value(
          transcription_service
      )
    else:
      (
          video_file_name,
          video_timestamp,
          encoded_user_id,
      ) = components
      self.transcription_service = TranscriptionService.WHISPER

    self.video_file_name = video_file_name
    self.video_timestamp = int(video_timestamp)
    self.encoded_user_id = encoded_user_id

  def __str__(self):
    return (
        f'VideoMetadata(video_file_name={self.video_file_name}, '
        f'transcription_service={self.transcription_service}, '
        f'video_timestamp={self.video_timestamp}, '
        f'encoded_user_id={self.encoded_user_id})'
    )


class TriggerFile:
  """Represents an input file that was uploaded to GCS and triggered the CF."""

  def __init__(self, filepath: str):
    """Initialiser.

    Args:
      filepath: String path to the input file, including directories and the
        file extension.
    """
    filename, file_ext = os.path.splitext(filepath)
    file_path = pathlib.Path(filename)

    self.file_name = file_path.name
    self.file_ext = file_ext[1:]
    self.gcs_folder = str(file_path.parents[0])
    self.gcs_root_folder = str(file_path.parents[-2])

    self.video_metadata = VideoMetadata(self.gcs_root_folder)
    self.full_gcs_path = filepath
    self.file_name_ext = f'{self.file_name}.{self.file_ext}'

  def __str__(self):
    return (
        f'TriggerFile(file_name_ext={self.file_name_ext}, '
        f'full_gcs_path={self.full_gcs_path}, '
        f'gcs_folder={self.gcs_folder}, '
        f'gcs_root_folder={self.gcs_root_folder}, '
        f'video_metadata={self.video_metadata})'
    )

  def is_extractor_initial_trigger(self) -> bool:
    return (
        self.file_ext and VideoExtension.has_value(self.file_ext)
        and self.file_name == ConfigService.INPUT_FILENAME
    )

  def is_extractor_audio_trigger(self) -> bool:
    return (
        'wav' == self.file_ext and self.file_name.endswith(
            ConfigService.INPUT_EXTRACTION_AUDIO_FILENAME_SUFFIX
        )
    )

  def is_extractor_video_trigger(self) -> bool:
    return (
        self.file_ext and VideoExtension.has_value(self.file_ext)
        and self.file_name.endswith(
            ConfigService.INPUT_EXTRACTION_VIDEO_FILENAME_SUFFIX
        )
    )

  def is_extractor_finalise_audio_trigger(self) -> bool:
    return (
        self.file_name_ext.endswith(
            ConfigService.INPUT_EXTRACTION_FINALISE_AUDIO_FILE
        )
    )

  def is_extractor_finalise_video_trigger(self) -> bool:
    return (
        self.file_name_ext.endswith(
            ConfigService.INPUT_EXTRACTION_FINALISE_VIDEO_FILE
        )
    )

  def is_extractor_finalise_trigger(self) -> bool:
    return self.file_name_ext == ConfigService.INPUT_EXTRACTION_FINALISE_FILE

  def is_extractor_split_segment_trigger(self) -> bool:
    return self.file_name_ext.endswith(
        ConfigService.INPUT_EXTRACTION_SPLIT_SEGMENT_SUFFIX
    )

  def is_extractor_combine_segment_trigger(self) -> bool:
      """Check if this is a combine segment trigger (e.g., 1_combine.json)."""
      return (
              ConfigService.INPUT_EXTRACTION_COMBINE_SUFFIX in self.file_name_ext
              and self.file_ext == 'json'
      )

  def is_combiner_initial_trigger(self) -> bool:
    return self.file_name_ext == ConfigService.INPUT_RENDERING_FILE

  def is_combiner_render_trigger(self) -> bool:
    return self.file_name_ext.endswith(ConfigService.INPUT_RENDERING_FILE)

  def is_combiner_finalise_trigger(self) -> bool:
    return self.file_name_ext.endswith(
        ConfigService.INPUT_RENDERING_FINALISE_FILE
    )


def execute_subprocess_commands(
    cmds: Union[str, Sequence[str]],
    description: str,
    cwd: Optional[str] = None,
    shell: bool = False,
) -> str:
  """Executes the given commands and returns results.

  Args:
    cmds: Command(s) to execute, which are expected to be in the $PATH value of
      the executing process.
    description: Description to output in logging messages.
    cwd: Optional working directory to execute the commands in. Defaults to
      None, indicating that the commands are to be executed in the current
      working directory of the executing process.
    shell: Whether to execute the commands in a shell. Defaults to False.

  Returns:
    The output of executing the given commands.

  Raises:
    `subprocess.CalledProcessError` if a failure happens.
  """
  logging.info('SUBPROCESS - Executing commands [%r]...', cmds)

  try:
    output = subprocess.run(
        args=cmds,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=cwd,
        shell=shell,
        check=True,
        text=True,
    ).stdout

    logging.info(
        'SUBPROCESS - Output of [%s]:\noutput=[%r]', description, output
    )
    return output
  except subprocess.CalledProcessError as e:
    logging.exception(
        'Error while executing [%s]!\noutput=[%r]', description, e.output
    )
    raise e


def timestring_to_seconds(timestring: str) -> float:
  """Converts a timestring in the format mm:ss.SSS to seconds."""
  minutes, seconds = map(float, timestring.split(':'))
  return minutes*60 + seconds


def rename_chunks(result: Sequence[str], file_suffix: str):
  """Renames the output chunks."""
  for output_file_path in result:
    file_name, file_ext = os.path.splitext(output_file_path)
    file_name = file_name.replace(file_suffix, '')
    os.rename(
        output_file_path,
        f'{file_name}-{len(result)}{file_suffix}{file_ext}',
    )


def get_media_duration(input_file_path: str) -> float:
  """Retrieves the duration of the input media file."""
  output = execute_subprocess_commands(
      cmds=[
          'ffprobe',
          '-i',
          input_file_path,
          '-show_entries',
          'format=duration',
          '-v',
          'quiet',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
      ],
      description=f'get duration of [{input_file_path}] with ffprobe',
  )
  return float(output)
