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

"""Vigenair module.

This module is the main module for Vigenair's server-side components.

This file is the target of a "Cloud Storage" Trigger (Finalize/Create) Cloud
Function, with `gcs_file_uploaded` as the main entry point.
"""

import logging
from typing import Any, Dict

import combiner as CombinerService
import extractor as ExtractorService
import functions_framework
from google.cloud import logging as cloudlogging
import utils as Utils


@functions_framework.cloud_event
def gcs_file_uploaded(cloud_event: Dict[str, Any]):
  """Triggered by a change in a storage bucket.

  Args:
    cloud_event: The Eventarc trigger event.
  """
  lg_client = cloudlogging.Client()
  lg_client.setup_logging()

  data = cloud_event.data
  bucket = data['bucket']
  filepath = data['name']

  logging.info('BEGIN - Processing uploaded file: %s...', filepath)

  trigger_file = Utils.TriggerFile(filepath)

  if trigger_file.is_extractor_trigger():
    extractor_instance = ExtractorService.Extractor(
        gcs_bucket_name=bucket, video_file=trigger_file
    )
    extractor_instance.extract()
  elif trigger_file.is_combiner_initial_trigger():
    combiner_instance = CombinerService.Combiner(
        gcs_bucket_name=bucket, render_file=trigger_file
    )
    combiner_instance.initial_render()
  elif trigger_file.is_combiner_render_trigger():
    combiner_instance = CombinerService.Combiner(
        gcs_bucket_name=bucket, render_file=trigger_file
    )
    combiner_instance.render()
  elif trigger_file.is_combiner_finalise_trigger():
    combiner_instance = CombinerService.Combiner(
        gcs_bucket_name=bucket, render_file=trigger_file
    )
    combiner_instance.finalise_render()

  logging.info('END - Finished processing uploaded file: %s.', filepath)
