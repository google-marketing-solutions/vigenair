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

"""Vigenair video service.

This module contains functions to interact with the Video AI API.
"""

from typing import Sequence

import config as ConfigService
import pandas as pd
import utils as Utils
from google.cloud import videointelligence


def analyse_video(
    video_file: Utils.TriggerFile,
    bucket_name: str,
) -> videointelligence.AnnotateVideoResponse:
  """Runs video analysis via the Video AI API and returns the results.

  Args:
    video_file: The video file to be analysed.
    bucket_name: The GCS bucket name where the video is stored.

  Returns:
    The annotation results from the Video AI API.
  """
  video_client = videointelligence.VideoIntelligenceServiceClient()
  features = [
      videointelligence.Feature.LABEL_DETECTION,
      videointelligence.Feature.OBJECT_TRACKING,
      videointelligence.Feature.SHOT_CHANGE_DETECTION,
      videointelligence.Feature.FACE_DETECTION,
      videointelligence.Feature.PERSON_DETECTION,
      videointelligence.Feature.LOGO_RECOGNITION,
      videointelligence.Feature.TEXT_DETECTION,
  ]
  mode = videointelligence.LabelDetectionMode.SHOT_AND_FRAME_MODE
  label_config = videointelligence.LabelDetectionConfig(
      label_detection_mode=mode
  )
  face_config = videointelligence.FaceDetectionConfig(
      include_bounding_boxes=True, include_attributes=True
  )
  person_config = videointelligence.PersonDetectionConfig(
      include_bounding_boxes=True,
      include_attributes=True,
      include_pose_landmarks=True,
  )

  context = videointelligence.VideoContext(
      label_detection_config=label_config,
      face_detection_config=face_config,
      person_detection_config=person_config,
  )

  operation = video_client.annotate_video(
      request={
          'features': features,
          'input_uri': f'gs://{bucket_name}/{video_file.full_gcs_path}',
          'output_uri': (
              f'gs://{bucket_name}/{video_file.gcs_folder}/'
              f'{ConfigService.OUTPUT_ANALYSIS_FILE}'
          ),
          'video_context': context,
      }
  )

  result = operation.result(timeout=3600)
  return result.annotation_results[0]


def get_visual_shots_data(
    annotation_results: videointelligence.AnnotateVideoResponse,
    transcription_dataframe: pd.DataFrame,
    audio_segment_id_key: str = 'audio_segment_id',
) -> pd.DataFrame:
  """Returns a DataFrame of visual shots extracted from the Video AI API.

  Args:
    annotation_results: The annotation results from the Video AI API.
    transcription_dataframe: The transcriptions of the video.
    audio_segment_id_key: The column name of the audio segment ids in the
      dataframes.

  Returns:
    A DataFrame of visual shots extracted from the Video AI API.
  """
  shots_data = []
  for i, shot in enumerate(annotation_results.shot_annotations):
    start_time = (
        shot.start_time_offset.seconds
        + shot.start_time_offset.microseconds / 1e6
    )
    end_time = (
        shot.end_time_offset.seconds + shot.end_time_offset.microseconds / 1e6
    )
    duration = end_time - start_time

    if duration > 0:
      shots_data.append((
          i + 1,
          _identify_segments(
              start_time, end_time, transcription_dataframe, audio_segment_id_key
          ),
          start_time,
          end_time,
          duration,
      ))

  shots_dataframe = pd.DataFrame(
      shots_data,
      columns=[
          'shot_id',
          'audio_segment_ids',
          'start_s',
          'end_s',
          'duration_s',
      ],
  )
  shots_dataframe = shots_dataframe.sort_values(by='start_s')

  return shots_dataframe


def get_shot_labels_data(
    annotation_results: videointelligence.AnnotateVideoResponse,
    optimised_av_segments: pd.DataFrame,
    av_segment_id_key: str = 'av_segment_id',
) -> pd.DataFrame:
  """Returns a DataFrame of shot labels extracted from the Video AI API.

  Args:
    annotation_results: The annotation results from the Video AI API.
    optimised_av_segments: The optimised AV segments.
    av_segment_id_key: The column name of the AV segment ids in the dataframes.

  Returns:
    A DataFrame of shot labels extracted from the Video AI API.
  """
  labels_data = []
  for _, shot_label in enumerate(annotation_results.shot_label_annotations):
    for _, shot in enumerate(shot_label.segments):
      start_time = (
          shot.segment.start_time_offset.seconds
          + shot.segment.start_time_offset.microseconds / 1e6
      )
      end_time = (
          shot.segment.end_time_offset.seconds
          + shot.segment.end_time_offset.microseconds / 1e6
      )
      confidence = shot.confidence

      labels_data.append((
          shot_label.entity.description,
          _identify_segments(
              start_time, end_time, optimised_av_segments, av_segment_id_key
          ),
          start_time,
          end_time,
          end_time - start_time,
          confidence,
      ))

  labels_dataframe = pd.DataFrame(
      labels_data,
      columns=[
          'label',
          'av_segment_ids',
          'start_s',
          'end_s',
          'duration_s',
          'confidence',
      ],
  )
  labels_dataframe = labels_dataframe.sort_values(by='start_s')

  return labels_dataframe


def get_object_tracking_data(
    annotation_results: videointelligence.AnnotateVideoResponse,
    optimised_av_segments: pd.DataFrame,
    av_segment_id_key: str = 'av_segment_id',
) -> pd.DataFrame:
  """Returns a DataFrame of object tracking data extracted from Video AI API.

  Args:
    annotation_results: The annotation results from the Video AI API.
    optimised_av_segments: The optimised AV segments.
    av_segment_id_key: The column name of the AV segment ids in the dataframes.

  Returns:
    A DataFrame of object tracking data extracted from Video AI API.
  """
  object_tracking_data = []
  for object_annotation in annotation_results.object_annotations:
    bounding_boxes = []
    for frame in object_annotation.frames:
      box = frame.normalized_bounding_box
      bounding_boxes.append((box.left, box.top, box.right, box.bottom))

    description = object_annotation.entity.description
    start_time = (
        object_annotation.segment.start_time_offset.seconds
        + object_annotation.segment.start_time_offset.microseconds / 1e6
    )
    end_time = (
        object_annotation.segment.end_time_offset.seconds
        + object_annotation.segment.end_time_offset.microseconds / 1e6
    )
    confidence = object_annotation.confidence

    object_tracking_data.append((
        description,
        _identify_segments(
            start_time, end_time, optimised_av_segments, av_segment_id_key
        ),
        start_time,
        end_time,
        end_time - start_time,
        confidence,
        bounding_boxes,
    ))

  object_tracking_dataframe = pd.DataFrame(
      object_tracking_data,
      columns=[
          'label',
          'av_segment_ids',
          'start_s',
          'end_s',
          'duration_s',
          'confidence',
          'boxes_ltrb',
      ],
  )
  object_tracking_dataframe = object_tracking_dataframe.sort_values(
      by=['start_s', 'end_s']
  )

  return object_tracking_dataframe


def get_logo_detection_data(
    annotation_results: videointelligence.AnnotateVideoResponse,
    optimised_av_segments: pd.DataFrame,
    av_segment_id_key: str = 'av_segment_id',
) -> pd.DataFrame:
  """Returns a DataFrame of logo detection data extracted from the Video AI API.

  Args:
    annotation_results: The annotation results from the Video AI API.
    optimised_av_segments: The optimised AV segments.
    av_segment_id_key: The column name of the AV segment ids in the dataframes.

  Returns:
    A DataFrame of logo detection data extracted from the Video AI API.
  """
  logo_detection_data = []
  for (
      logo_recognition_annotation
  ) in annotation_results.logo_recognition_annotations:
    entity = logo_recognition_annotation.entity

    label = entity.description
    segments = [(
        (
            segment.start_time_offset.seconds
            + segment.start_time_offset.microseconds / 1e6
        ),
        (
            segment.end_time_offset.seconds
            + segment.end_time_offset.microseconds / 1e6
        ),
    ) for segment in logo_recognition_annotation.segments]

    for track in logo_recognition_annotation.tracks:
      start_time = (
          track.segment.start_time_offset.seconds
          + track.segment.start_time_offset.microseconds / 1e6
      )
      end_time = (
          track.segment.end_time_offset.seconds
          + track.segment.end_time_offset.microseconds / 1e6
      )
      confidence = track.confidence

      av_segment_ids = _identify_segments(
          start_time, end_time, optimised_av_segments, av_segment_id_key
      )
      boxes = [(
          timestamped_object.normalized_bounding_box.left,
          timestamped_object.normalized_bounding_box.top,
          timestamped_object.normalized_bounding_box.right,
          timestamped_object.normalized_bounding_box.bottom,
      ) for timestamped_object in track.timestamped_objects]
      attributes = [(attribute.name, attribute.value, attribute.confidence)
                    for timestamped_object in track.timestamped_objects
                    for attribute in timestamped_object.attributes]
      track_attributes = [
          (attribute.name, attribute.value, attribute.confidence)
          for attribute in track.attributes
      ]
      logo_detection_data.append((
          label,
          segments,
          av_segment_ids,
          start_time,
          end_time,
          end_time - start_time,
          confidence,
          boxes,
          attributes,
          track_attributes,
      ))

  logo_detection_dataframe = pd.DataFrame(
      logo_detection_data,
      columns=[
          'label',
          'segments',
          'av_segment_ids',
          'start_s',
          'end_s',
          'duration_s',
          'confidence',
          'boxes_ltrb',
          'attributes',
          'track_attributes',
      ],
  )
  logo_detection_dataframe = logo_detection_dataframe.sort_values(
      by=['start_s', 'end_s']
  )

  return logo_detection_dataframe


def get_text_detection_data(
    annotation_results: videointelligence.AnnotateVideoResponse,
    optimised_av_segments: pd.DataFrame,
    av_segment_id_key: str = 'av_segment_id',
) -> pd.DataFrame:
  """Returns a DataFrame of text detection data extracted from the Video AI API.

  Args:
    annotation_results: The annotation results from the Video AI API.
    optimised_av_segments: The optimised AV segments.
    av_segment_id_key: The column name of the AV segment ids in the dataframes.

  Returns:
    A DataFrame of text detection data extracted from the Video AI API.
  """
  text_detection_data = []
  for text_annotation in annotation_results.text_annotations:
    text = text_annotation.text

    for text_segment in text_annotation.segments:
      start_time = (
          text_segment.segment.start_time_offset.seconds
          + text_segment.segment.start_time_offset.microseconds / 1e6
      )
      end_time = (
          text_segment.segment.end_time_offset.seconds
          + text_segment.segment.end_time_offset.microseconds / 1e6
      )
      confidence = text_segment.confidence

      av_segment_ids = _identify_segments(
          start_time, end_time, optimised_av_segments, av_segment_id_key
      )
      boxes = [(vertex.x, vertex.y)
               for frame in text_segment.frames
               for vertex in frame.rotated_bounding_box.vertices]
      text_detection_data.append((
          text,
          av_segment_ids,
          start_time,
          end_time,
          end_time - start_time,
          confidence,
          boxes,
      ))

  text_detection_dataframe = pd.DataFrame(
      text_detection_data,
      columns=[
          'text',
          'av_segment_ids',
          'start_s',
          'end_s',
          'duration_s',
          'confidence',
          'box_vertices',
      ],
  )
  text_detection_dataframe = text_detection_dataframe.sort_values(by=['start_s'])

  return text_detection_dataframe


def _identify_segments(
    start_time: float,
    end_time: float,
    data: pd.DataFrame,
    key: str,
    start_key: str = 'start_s',
    end_key: str = 'end_s',
) -> Sequence[int]:
  """Identifies rows in a dataframe that overlap with a given time range.

  Args:
    start_time: The start time of the range.
    end_time: The end time of the range.
    data: The dataframe to search in.
    key: The column name of the ids to return.
    start_key: The column name of the start time.
    end_key: The column name of the end time.

  Returns:
    The identified row IDs for the given column.
  """
  if not data.empty:
    result = data[
        # Segments starting before and ending within or after the range
        (data[start_key] <= start_time) & (data[end_key] > start_time) |
        # Segments starting within the range
        (data[start_key] >= start_time) & (data[start_key] < end_time)]
    if not result.empty:
      return result[key].tolist()
  return []
