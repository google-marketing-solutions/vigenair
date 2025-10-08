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
import config as ConfigService
import extractor as ExtractorService
import functions_framework
from google.api_core.client_info import ClientInfo
from google.cloud import logging as cloudlogging
import utils as Utils
import os


@functions_framework.cloud_event
def gcs_file_uploaded(cloud_event: Dict[str, Any]):
  """Triggered by a change in a storage bucket.

  Args:
    cloud_event: The Eventarc trigger event.
  """
  if os.environ.get('K_SERVICE'):  # This env var exists in Cloud Run
    # Production: Use Cloud Logging
    try:
      lg_client = cloudlogging.Client(
        client_info=ClientInfo(user_agent=ConfigService.USER_AGENT_ID)
      )
      lg_client.setup_logging()
    except Exception:
      pass
  else:
    # Local dev: Use standard logging
    logging.basicConfig(
      level=logging.INFO,
      format='%(asctime)s - %(levelname)s - %(message)s'
    )
    logging.info('Local development mode - Cloud Logging disabled')
  data = cloud_event.data
  bucket = data['bucket']
  filepath = data['name']

  logging.info('BEGIN - Processing uploaded file: %s...', filepath)

  trigger_file = Utils.TriggerFile(filepath)

  if trigger_file.is_extractor_initial_trigger():
    logging.info('TRIGGER - Extractor initial trigger')
    extractor_instance = ExtractorService.Extractor(
        gcs_bucket_name=bucket, media_file=trigger_file
    )
    extractor_instance.initial_extract()
  elif trigger_file.is_extractor_audio_trigger():
    logging.info('TRIGGER - Extractor audio trigger')
    extractor_instance = ExtractorService.Extractor(
        gcs_bucket_name=bucket, media_file=trigger_file
    )
    extractor_instance.extract_audio()
  elif trigger_file.is_extractor_video_trigger():
    logging.info('TRIGGER - Extractor video trigger')
    extractor_instance = ExtractorService.Extractor(
        gcs_bucket_name=bucket, media_file=trigger_file
    )
    extractor_instance.extract_video()
  elif (
      trigger_file.is_extractor_finalise_audio_trigger()
      or trigger_file.is_extractor_finalise_video_trigger()
  ):
    logging.info('TRIGGER - Extractor finalise audio/video trigger')
    extractor_instance = ExtractorService.Extractor(
        gcs_bucket_name=bucket, media_file=trigger_file
    )
    extractor_instance.check_finalise_extraction()
  elif trigger_file.is_extractor_finalise_trigger():
    logging.info('TRIGGER - Extractor finalise trigger')
    extractor_instance = ExtractorService.Extractor(
        gcs_bucket_name=bucket, media_file=trigger_file
    )
    extractor_instance.finalise_extraction()
  elif trigger_file.is_extractor_split_segment_trigger():
    logging.info('TRIGGER - Extractor split segment trigger')
    extractor_instance = ExtractorService.Extractor(
        gcs_bucket_name=bucket, media_file=trigger_file
    )
    extractor_instance.split_av_segment()
  elif trigger_file.is_extractor_combine_segment_trigger():
    logging.info('TRIGGER - Extractor combine segment trigger')
    extractor_instance = ExtractorService.Extractor(
      gcs_bucket_name=bucket, media_file=trigger_file
    )
    extractor_instance.combine_av_segments()

  elif trigger_file.is_combiner_initial_trigger():
    logging.info('TRIGGER - Combiner initial trigger')
    combiner_instance = CombinerService.Combiner(
        gcs_bucket_name=bucket, render_file=trigger_file
    )
    combiner_instance.initial_render()
  elif trigger_file.is_combiner_render_trigger():
    logging.info('TRIGGER - Combiner render trigger')
    combiner_instance = CombinerService.Combiner(
        gcs_bucket_name=bucket, render_file=trigger_file
    )
    combiner_instance.render()
  elif trigger_file.is_combiner_finalise_trigger():
    logging.info('TRIGGER - Combiner finalise trigger')
    combiner_instance = CombinerService.Combiner(
        gcs_bucket_name=bucket, render_file=trigger_file
    )
    combiner_instance.finalise_render()

  logging.info('END - Finished processing uploaded file: %s.', filepath)
