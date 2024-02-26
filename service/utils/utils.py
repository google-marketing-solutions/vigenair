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

"""ViGenAiR utils.

This module contains various utility functions used by ViGenAiR.
"""

import enum
import logging
import os
import pathlib
import subprocess
from typing import Optional, Sequence

import config as ConfigService


class VideoExtension(enum.Enum):
  """Enum of supported video file extensions."""

  MP4 = 'mp4'
  MOV = 'mov'
  WEBM = 'webm'

  @classmethod
  def has_value(cls, ext: str) -> bool:
    values = set(item.value for item in VideoExtension)
    return ext in values


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
    self.full_gcs_path = filepath
    self.file_name_ext = f'{self.file_name}.{self.file_ext}'

  def is_extractor_trigger(self) -> bool:
    return (
        self.file_ext
        and VideoExtension.has_value(self.file_ext)
        and self.file_name == ConfigService.INPUT_FILENAME
    )

  def is_combiner_trigger(self) -> bool:
    return self.file_name_ext == ConfigService.INPUT_RENDERING_FILE


def execute_subprocess_commands(
    cmds: Sequence[str], description: str, cwd: Optional[str] = None
) -> str:
  """Executes the given commands and returns results.

  Args:
    cmds: Commands to execute, which are expected to be in the $PATH value of
      the executing process.
    description: Description to output in logging messages.
    cwd: Optional working directory to execute the commands in. Defaults to
      None, indicating that the commands are to be executed in the current
      working directory of the executing process.

  Returns:
    The output of executing the given commands.

  Raises:
    `subprocess.CalledProcessError` if a failure happens.
  """
  logging.info('Executing commands [%r]...', cmds)

  try:
    output = subprocess.run(
        args=cmds,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=cwd,
        check=True,
        text=True,
    ).stdout

    logging.info('Output of [%s]:\noutput=[%r]', description, output)
    return output
  except subprocess.CalledProcessError as e:
    logging.exception(
        'Error while executing [%s]!\noutput=[%r]', description, e.output
    )
    raise e
