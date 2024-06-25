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

"""Vigenair Extractor service.

This module provides functionality to extract all available information from an
input video file and create coherent audio/video segments.
"""

import concurrent.futures
import logging
import os
import pathlib
import re
import tempfile
from typing import Sequence, Tuple
from urllib import parse

import audio as AudioService
import config as ConfigService
import pandas as pd
import storage as StorageService
import utils as Utils
import vertexai
import video as VideoService
from vertexai.preview.generative_models import GenerativeModel, Part


class Extractor:
  """Encapsulates all the extraction logic."""

  def __init__(self, gcs_bucket_name: str, video_file: Utils.TriggerFile):
    """Initialiser.

    Args:
      gcs_bucket_name: The GCS bucket to read from and store files in.
      video_file: Path to the input video file, which is in a specific folder on
        GCS. See Utils.VideoMetadata for more information.
    """
    self.gcs_bucket_name = gcs_bucket_name
    self.video_file = video_file
    vertexai.init(
        project=ConfigService.GCP_PROJECT_ID,
        location=ConfigService.GCP_LOCATION,
    )
    self.vision_model = GenerativeModel(ConfigService.CONFIG_VISION_MODEL)

  def extract(self):
    """Extracts all the available data from the input video."""
    logging.info('EXTRACTOR - Starting extraction...')
    tmp_dir = tempfile.mkdtemp()
    video_file_path = StorageService.download_gcs_file(
        file_path=self.video_file,
        output_dir=tmp_dir,
        bucket_name=self.gcs_bucket_name,
    )
    audio_file_path = AudioService.extract_audio(video_file_path)
    transcription_dataframe = pd.DataFrame()
    annotation_results = None

    if audio_file_path and self.video_file.video_metadata.analyse_audio:
      (
          transcription_dataframe,
          annotation_results,
          vocals_file_path,
          music_file_path,
      ) = self.process_video_with_audio(
          tmp_dir,
          audio_file_path,
      )
      logging.info('AUDIO - vocals_file_path: %s', vocals_file_path)
      logging.info('AUDIO - music_file_path: %s', music_file_path)
    else:
      annotation_results = self.process_video_without_audio(tmp_dir)

    optimised_av_segments = _create_optimised_segments(
        annotation_results,
        transcription_dataframe,
    )
    logging.info('SEGMENTS - Optimised segments: %r', optimised_av_segments)

    optimised_av_segments = self.cut_and_annotate_av_segments(
        tmp_dir,
        video_file_path,
        optimised_av_segments,
    )
    logging.info(
        'SEGMENTS - Final optimised segments: %r',
        optimised_av_segments,
    )

    data_file_path = str(pathlib.Path(tmp_dir, ConfigService.OUTPUT_DATA_FILE))
    optimised_av_segments.to_json(data_file_path, orient='records')

    StorageService.upload_gcs_dir(
        source_directory=tmp_dir,
        bucket_name=self.gcs_bucket_name,
        target_dir=self.video_file.gcs_folder,
    )
    logging.info('EXTRACTOR - Extraction completed successfully!')

  def process_video_without_audio(self, tmp_dir):
    """Runs video analysis only."""
    subtitles_filepath = str(
        pathlib.Path(tmp_dir, ConfigService.OUTPUT_SUBTITLES_FILE)
    )
    with open(subtitles_filepath, 'w', encoding='utf8'):
      pass
    StorageService.upload_gcs_file(
        file_path=subtitles_filepath,
        bucket_name=self.gcs_bucket_name,
        destination_file_name=str(
            pathlib.Path(
                self.video_file.gcs_folder, ConfigService.OUTPUT_SUBTITLES_FILE
            )
        ),
    )
    logging.info(
        'TRANSCRIPTION - Empty %s written successfully!',
        ConfigService.OUTPUT_SUBTITLES_FILE,
    )
    annotation_results = VideoService.analyse_video(
        video_file=self.video_file,
        bucket_name=self.gcs_bucket_name,
    )
    logging.info('VIDEO_ANALYSIS - Completed successfully!')
    return annotation_results

  def process_video_with_audio(self, tmp_dir: str, audio_file_path: str):
    """Runs video and audio analyses in parallel."""
    transcription_dataframe = None
    annotation_results = None
    vocals_file_path = None
    music_file_path = None
    with concurrent.futures.ProcessPoolExecutor() as process_executor:
      futures_dict = {
          process_executor.submit(
              AudioService.transcribe_audio,
              output_dir=tmp_dir,
              audio_file_path=audio_file_path,
          ): 'transcribe_audio',
          process_executor.submit(
              VideoService.analyse_video,
              video_file=self.video_file,
              bucket_name=self.gcs_bucket_name,
          ): 'analyse_video',
          process_executor.submit(
              AudioService.split_audio,
              output_dir=tmp_dir,
              audio_file_path=audio_file_path,
          ): 'split_audio',
      }

      for future in concurrent.futures.as_completed(futures_dict):
        source = futures_dict[future]
        match source:
          case 'transcribe_audio':
            transcription_dataframe = future.result()
            logging.info('THREADING - transcribe_audio finished!')
            StorageService.upload_gcs_dir(
                source_directory=tmp_dir,
                bucket_name=self.gcs_bucket_name,
                target_dir=self.video_file.gcs_folder,
            )
          case 'analyse_video':
            annotation_results = future.result()
            logging.info('THREADING - analyse_video finished!')
          case 'split_audio':
            vocals_file_path, music_file_path = future.result()
            logging.info('THREADING - split_audio finished!')

    return (
        transcription_dataframe,
        annotation_results,
        vocals_file_path,
        music_file_path,
    )

  def cut_and_annotate_av_segments(
      self,
      tmp_dir: str,
      video_file_path: str,
      optimised_av_segments: pd.DataFrame,
  ) -> pd.DataFrame:
    """Cuts A/V segments with ffmpeg & annotates them with Gemini, concurrently.

    Args:
      tmp_dir: The local directory to store temporary files.
      video_file_path: Path to the input video file.
      optimised_av_segments: The A/V segments data to be enriched.

    Returns:
      The enriched A/V segments data as a DataFrame.
    """
    cuts_path = str(pathlib.Path(tmp_dir, ConfigService.OUTPUT_AV_SEGMENTS_DIR))
    os.makedirs(cuts_path)
    gcs_cuts_folder_path = (
        f'gs://{self.gcs_bucket_name}/{self.video_file.gcs_folder}/'
        f'{ConfigService.OUTPUT_AV_SEGMENTS_DIR}'
    )
    size = len(optimised_av_segments)
    descriptions = [None] * size
    keywords = [None] * size
    cut_paths = [None] * size
    screenshot_paths = [None] * size

    with concurrent.futures.ThreadPoolExecutor() as thread_executor:
      futures_dict = {
          thread_executor.submit(
              _cut_and_annotate_av_segment,
              index=index + 1,
              row=row,
              video_file_path=video_file_path,
              cuts_path=cuts_path,
              vision_model=self.vision_model,
              gcs_cut_path=(
                  f'{gcs_cuts_folder_path}/{index+1}.{self.video_file.file_ext}'
              ),
              bucket_name=self.gcs_bucket_name,
          ): index
          for index, row in optimised_av_segments.iterrows()
      }

      for response in concurrent.futures.as_completed(futures_dict):
        index = futures_dict[response]
        description, keyword = response.result()
        descriptions[index] = description
        keywords[index] = keyword
        resources_base_path = (
            f'{ConfigService.GCS_BASE_URL}/{self.gcs_bucket_name}/'
            f'{parse.quote(self.video_file.gcs_folder)}/'
            f'{ConfigService.OUTPUT_AV_SEGMENTS_DIR}/{index+1}'
        )
        cut_paths[index] = f'{resources_base_path}.{self.video_file.file_ext}'
        screenshot_paths[index] = (
            f'{resources_base_path}{ConfigService.SEGMENT_SCREENSHOT_EXT}'
        )

    optimised_av_segments = optimised_av_segments.assign(
        **{
            'description': descriptions,
            'keywords': keywords,
            'segment_uri': cut_paths,
            'segment_screenshot_uri': screenshot_paths,
        }
    )
    return optimised_av_segments


def _cut_and_annotate_av_segment(
    index: int,
    row: pd.Series,
    video_file_path: str,
    cuts_path: str,
    vision_model: GenerativeModel,
    gcs_cut_path: str,
    bucket_name: str,
) -> Tuple[str, str]:
  """Cuts a single A/V segment with ffmpeg and annotates it with Gemini.

  Args:
    index: The index of the A/V segment in the DataFrame.
    row: The A/V segment data as a row in a DataFrame.
    video_file_path: Path to the input video file.
    cuts_path: The local directory to store the A/V segment cuts.
    vision_model: The Gemini model to generate the A/V segment descriptions.
    gcs_cut_path: The path to store the A/V segment cut in GCS.
    bucket_name: The GCS bucket name to store the A/V segment cut.

  Returns:
    A tuple of the A/V segment description and keywords.
  """
  _, video_ext = os.path.splitext(video_file_path)
  full_cut_path = str(pathlib.Path(cuts_path, f'{index}{video_ext}'))
  full_screenshot_path = str(
      pathlib.Path(cuts_path, f'{index}{ConfigService.SEGMENT_SCREENSHOT_EXT}')
  )
  Utils.execute_subprocess_commands(
      cmds=[
          'ffmpeg',
          '-y',
          '-ss',
          str(row['start_s']),
          '-i',
          video_file_path,
          '-to',
          str(row['duration_s']),
          '-c',
          'copy',
          full_cut_path,
      ],
      description=f'cut segment {index} with ffmpeg',
  )
  os.chmod(full_cut_path, 777)
  gcs_cut_dest_file = gcs_cut_path.replace(f'gs://{bucket_name}/', '')
  StorageService.upload_gcs_file(
      file_path=full_cut_path,
      bucket_name=bucket_name,
      destination_file_name=gcs_cut_dest_file,
  )
  Utils.execute_subprocess_commands(
      cmds=[
          'ffmpeg',
          '-ss',
          str(row['start_s'] + row['duration_s'] / 2),
          '-i',
          video_file_path,
          '-frames:v',
          '1',
          '-q:v',
          '2',
          full_screenshot_path,
      ],
      description=f'screenshot mid-segment {index} with ffmpeg',
  )
  os.chmod(full_screenshot_path, 777)
  gcs_cut_dest_file_prefix, _ = os.path.splitext(gcs_cut_dest_file)
  StorageService.upload_gcs_file(
      file_path=full_screenshot_path,
      bucket_name=bucket_name,
      destination_file_name=(
          f'{gcs_cut_dest_file_prefix}{ConfigService.SEGMENT_SCREENSHOT_EXT}'
      ),
  )
  description = ''
  keywords = ''
  try:
    response = vision_model.generate_content(
        [
            Part.from_uri(gcs_cut_path, mime_type='video/mp4'),
            ConfigService.SEGMENT_ANNOTATIONS_PROMPT,
        ],
        generation_config=ConfigService.SEGMENT_ANNOTATIONS_CONFIG,
        safety_settings=ConfigService.CONFIG_DEFAULT_SAFETY_CONFIG,
    )
    if (
        response.candidates
        and response.candidates[0].content.parts
        and response.candidates[0].content.parts[0].text
    ):
      text = response.candidates[0].content.parts[0].text
      result = re.search(ConfigService.SEGMENT_ANNOTATIONS_PATTERN, text)
      logging.info('ANNOTATION - Annotating segment %s: %s', index, text)
      description = result.group(2)
      keywords = result.group(3)
    else:
      logging.warning('ANNOTATION - Could not annotate segment %s!', index)
  # Execution should continue regardless of the underlying exception
  # pylint: disable=broad-exception-caught
  except Exception:
    logging.exception(
        'Encountered error during segment %s annotation! Continuing...',
        index,
    )
  return description, keywords


def _create_optimised_segments(
    annotation_results,
    transcription_dataframe: pd.DataFrame,
) -> pd.DataFrame:
  """Creates coherent Audio/Video segments by combining all annotations.

  Args:
    annotation_results: The results of the video analysis with the VertexAI
      Video Intelligence API.
    transcription_dataframe: The video transcription data.

  Returns:
    A DataFrame containing all the segments with their annotations.
  """
  shots_dataframe = VideoService.get_visual_shots_data(
      annotation_results,
      transcription_dataframe,
  )
  optimised_av_segments = _create_optimised_av_segments(
      shots_dataframe,
      transcription_dataframe,
  )
  labels_dataframe = VideoService.get_shot_labels_data(
      annotation_results,
      optimised_av_segments,
  )
  objects_dataframe = VideoService.get_object_tracking_data(
      annotation_results,
      optimised_av_segments,
  )
  logos_dataframe = VideoService.get_logo_detection_data(
      annotation_results,
      optimised_av_segments,
  )
  text_dataframe = VideoService.get_text_detection_data(
      annotation_results,
      optimised_av_segments,
  )

  optimised_av_segments = _annotate_segments(
      optimised_av_segments,
      labels_dataframe,
      objects_dataframe,
      logos_dataframe,
      text_dataframe,
  )

  return optimised_av_segments


def _create_optimised_av_segments(
    shots_dataframe,
    transcription_dataframe,
) -> pd.DataFrame:
  """Creates coherent segments by combining shots and transcription data.

  Args:
    shots_dataframe: The visual shots data.
    transcription_dataframe: The video transcription data.

  Returns:
    A DataFrame containing all the segments with their annotations.
  """
  optimised_av_segments = pd.DataFrame(
      columns=[
          'av_segment_id',
          'visual_segment_ids',
          'audio_segment_ids',
          'start_s',
          'end_s',
          'duration_s',
          'transcript',
      ]
  )
  current_audio_segment_ids = set()
  current_visual_segments = []
  index = 0
  is_last_shot_short = False

  for _, visual_segment in shots_dataframe.iterrows():
    audio_segment_ids = list(visual_segment['audio_segment_ids'])
    silent_short_shot = (
        not audio_segment_ids and visual_segment['duration_s'] <= 1
    )
    continued_shot = set(audio_segment_ids).intersection(
        current_audio_segment_ids
    )

    if (
        continued_shot
        or not current_visual_segments
        or (
            silent_short_shot
            and not current_audio_segment_ids
            and is_last_shot_short
        )
    ):
      current_visual_segments.append((
          visual_segment['shot_id'],
          visual_segment['start_s'],
          visual_segment['end_s'],
      ))
      current_audio_segment_ids = current_audio_segment_ids.union(
          set(audio_segment_ids)
      )
    else:
      visual_segment_ids = [entry[0] for entry in current_visual_segments]
      start = min([entry[1] for entry in current_visual_segments])
      end = max([entry[2] for entry in current_visual_segments])
      duration = end - start
      optimised_av_segments.loc[index] = [
          index,
          visual_segment_ids,
          list(current_audio_segment_ids),
          start,
          end,
          duration,
          _get_dataframe_by_ids(
              transcription_dataframe,
              'audio_segment_id',
              'transcript',
              list(current_audio_segment_ids),
          ),
      ]
      index += 1
      current_audio_segment_ids = set(audio_segment_ids)
      current_visual_segments = [(
          visual_segment['shot_id'],
          visual_segment['start_s'],
          visual_segment['end_s'],
      )]

    is_last_shot_short = silent_short_shot

  visual_segment_ids = [entry[0] for entry in current_visual_segments]
  start = min([entry[1] for entry in current_visual_segments])
  end = max([entry[2] for entry in current_visual_segments])
  duration = end - start
  optimised_av_segments.loc[index] = [
      index,
      visual_segment_ids,
      list(current_audio_segment_ids),
      start,
      end,
      duration,
      _get_dataframe_by_ids(
          transcription_dataframe,
          'audio_segment_id',
          'transcript',
          list(current_audio_segment_ids),
      ),
  ]

  return optimised_av_segments


def _annotate_segments(
    optimised_av_segments,
    labels_dataframe,
    objects_dataframe,
    logos_dataframe,
    text_dataframe,
    av_segment_id_key: str = 'av_segment_id',
) -> pd.DataFrame:
  """Annotates the A/V segments with data from the Video AI API.

  Args:
    optimised_av_segments: The A/V segments data to be enriched.
    labels_dataframe: The labels data from the Video AI API.
    objects_dataframe: The objects data from the Video AI API.
    logos_dataframe: The logos data from the Video AI API.
    text_dataframe: The text data from the Video AI API.
    av_segment_id_key: The key to access the A/V segment IDs in a DataFrame.

  Returns:
    The enriched A/V segments data as a DataFrame.
  """
  labels = []
  objects = []
  logo = []
  text = []

  for _, row in optimised_av_segments.iterrows():
    av_segment_id = row[av_segment_id_key]

    labels.append(_get_entities(labels_dataframe, av_segment_id))
    objects.append(_get_entities(objects_dataframe, av_segment_id))
    logo.append(_get_entities(logos_dataframe, av_segment_id))
    text.append(_get_entities(text_dataframe, av_segment_id, return_key='text'))

  optimised_av_segments = optimised_av_segments.assign(
      **{'labels': labels, 'objects': objects, 'logos': logo, 'text': text}
  )

  return optimised_av_segments


def _get_dataframe_by_ids(
    data: pd.DataFrame, key: str, value: str, ids: Sequence[str]
):
  """Returns a dataframe filtered by a list of IDs.

  Args:
    data: The dataframe to be filtered.
    key: The key to filter the dataframe by.
    value: The value to filter the dataframe by.
    ids: The list of IDs to filter the dataframe by.

  Returns:
    A dataframe filtered by a list of IDs.
  """
  series = [data[data[key] == id] for id in ids]
  result = [entry[value].to_list()[0] for entry in series]
  return result


def _get_entities(
    data: pd.DataFrame,
    search_value: str,
    return_key: str = 'label',
    search_key: str = 'av_segment_ids',
    confidence_key: str = 'confidence',
) -> Sequence[str]:
  """Returns all entities in a DataFrame that match a given search value.

  Args:
    data: The DataFrame to be searched.
    search_value: The value to search for in the DataFrame.
    return_key: The key to return from the DataFrame.
    search_key: The key to search on in the DataFrame.
    confidence_key: The key to filter the DataFrame by confidence.

  Returns:
    A list of entities in the DataFrame that match the search value.
  """
  temp = data.loc[[(search_value in labels) for labels in data[search_key]]]
  entities = (
      temp[
          temp[confidence_key]
          > ConfigService.CONFIG_ANNOTATIONS_CONFIDENCE_THRESHOLD
      ]
      .sort_values(by=confidence_key, ascending=False)[return_key]
      .to_list()
  )

  return list(set(entities))
