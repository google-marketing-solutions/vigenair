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

import json
import logging
import os
import pathlib
import re
from typing import Any, Dict, Sequence, Tuple

import config as ConfigService
import pandas as pd
from google.cloud import videointelligence


def video_annotation_from_json(
    annotation_json: Any
) -> videointelligence.VideoAnnotationResults:
  return videointelligence.VideoAnnotationResults(
      annotation_json['annotation_results'][0]
  )


def combine_analysis_chunks(
    analysis_chunks: Sequence[videointelligence.VideoAnnotationResults]
) -> Tuple[Dict[str, Any], videointelligence.VideoAnnotationResults]:
  """Combines video analysis chunks into a single response."""
  concatenated_shots = []
  concatenated_texts = []
  concatenated_objects = []
  concatenated_faces = []
  concatenated_logos = []
  concatenated_segment_labels = []
  concatenated_shot_labels = []
  concatenated_frame_labels = []
  output = videointelligence.AnnotateVideoResponse()
  output_result = videointelligence.VideoAnnotationResults()
  cumulative_seconds = 0

  for index, analysis_result in enumerate(analysis_chunks):
    if not index:
      segment_end = analysis_result.segment.end_time_offset
      output_result.input_uri = re.sub(
          fr'{ConfigService.OUTPUT_ANALYSIS_CHUNKS_DIR}/\d+',
          ConfigService.INPUT_FILENAME,
          analysis_result.input_uri,
      )

    shots = analysis_result.shot_annotations
    texts = analysis_result.text_annotations
    objects = analysis_result.object_annotations
    faces = analysis_result.face_detection_annotations
    logos = analysis_result.logo_recognition_annotations
    segment_labels = analysis_result.segment_label_annotations
    shot_labels = analysis_result.shot_label_annotations
    frame_labels = analysis_result.frame_label_annotations

    if index:
      for shot in shots:
        set_offset('start_time_offset', shot, segment_end, cumulative_seconds)
        set_offset('end_time_offset', shot, segment_end, cumulative_seconds)
      for segment in [s for t in texts for s in t.segments]:
        element = segment.segment
        set_offset(
            'start_time_offset',
            element,
            segment_end,
            cumulative_seconds,
        )
        set_offset('end_time_offset', element, segment_end, cumulative_seconds)
      for obj in objects:
        element = obj.segment
        set_offset(
            'start_time_offset',
            element,
            segment_end,
            cumulative_seconds,
        )
        set_offset('end_time_offset', element, segment_end, cumulative_seconds)
        for frame in obj.frames:
          set_offset(
              'time_offset',
              frame,
              segment_end,
              cumulative_seconds,
          )
      for face in [track for f in faces for track in f.tracks]:
        element = face.segment
        set_offset(
            'start_time_offset',
            element,
            segment_end,
            cumulative_seconds,
        )
        set_offset('end_time_offset', element, segment_end, cumulative_seconds)
        for timestamped_object in face.timestamped_objects:
          set_offset(
              'time_offset',
              timestamped_object,
              segment_end,
              cumulative_seconds,
          )
      for logo in [track for l in logos for track in l.tracks]:
        element = logo.segment
        set_offset(
            'start_time_offset',
            element,
            segment_end,
            cumulative_seconds,
        )
        set_offset('end_time_offset', element, segment_end, cumulative_seconds)
        for timestamped_object in logo.timestamped_objects:
          set_offset(
              'time_offset',
              timestamped_object,
              segment_end,
              cumulative_seconds,
          )
      for segment in [s for l in segment_labels for s in l.segments]:
        element = segment.segment
        set_offset(
            'start_time_offset',
            element,
            segment_end,
            cumulative_seconds,
        )
        set_offset('end_time_offset', element, segment_end, cumulative_seconds)
      for segment in [s for l in shot_labels for s in l.segments]:
        element = segment.segment
        set_offset(
            'start_time_offset',
            element,
            segment_end,
            cumulative_seconds,
        )
        set_offset('end_time_offset', element, segment_end, cumulative_seconds)
      for frame in [f for l in frame_labels for f in l.frames]:
        set_offset(
            'time_offset',
            frame,
            segment_end,
            cumulative_seconds,
        )

      segment_end = shots[-1].end_time_offset

    cumulative_seconds = segment_end.seconds or 0
    concatenated_shots.extend(shots)
    concatenated_texts.extend(texts)
    concatenated_objects.extend(objects)
    concatenated_faces.extend(faces)
    concatenated_logos.extend(logos)
    concatenated_segment_labels.extend(segment_labels)
    concatenated_shot_labels.extend(shot_labels)
    concatenated_frame_labels.extend(frame_labels)

  output_result.shot_annotations = concatenated_shots
  output_result.text_annotations = concatenated_texts
  output_result.object_annotations = concatenated_objects
  output_result.face_detection_annotations = concatenated_faces
  output_result.logo_recognition_annotations = concatenated_logos
  output_result.segment_label_annotations = concatenated_segment_labels
  output_result.shot_label_annotations = concatenated_shot_labels
  output_result.frame_label_annotations = concatenated_frame_labels
  output_result.segment.end_time_offset = concatenated_shots[-1].end_time_offset

  output.annotation_results.append(output_result)
  result = videointelligence.AnnotateVideoResponse(output)
  result_json_camelcase = type(output).to_json(output)
  result_json = convert_keys(json.loads(result_json_camelcase))
  return result_json, result.annotation_results[0]


def set_offset(
    key: str,
    element: Dict[str, Dict[str, int]],
    segment_end: Dict[str, int],
    cumulative_seconds: int,
):
  """Adjusts the time offset for a video analysis shot."""
  time_element = getattr(element, key)
  element_nanos = getattr(time_element, 'nanos', 0)
  element_seconds = getattr(time_element, 'seconds', 0)

  segment_nanos = getattr(segment_end, 'nanos', 0)
  segment_seconds = getattr(segment_end, 'seconds', cumulative_seconds)

  nanos = (element_nanos+segment_nanos) / 1e9
  additional_offset_seconds = 1 if nanos > 1 else 0
  nanos = int((nanos-additional_offset_seconds) * 1e9)
  new_time_element = {
      'seconds': element_seconds + additional_offset_seconds + segment_seconds,
      'nanos': nanos,
  }

  setattr(element, key, new_time_element)


def convert_keys(d):
  """Recursively converts dict keys from camelCase to snake_case."""
  new_d = {}
  for k, v in d.items():
    if isinstance(v, list):
      v = [convert_keys(inner_v) for inner_v in v]
    elif isinstance(v, dict):
      v = convert_keys(v)

    snake_k = camel_to_snake(k)
    if snake_k.endswith('time_offset'):
      new_d[snake_k] = {}
      seconds = int(v[:v.index('.')]) if '.' in v else int(v[:-1])
      nanos = int(round((float(v[:-1]) - seconds) * 1e9)) if '.' in v else 0
      if seconds:
        new_d[snake_k]['seconds'] = seconds
      if nanos:
        new_d[snake_k]['nanos'] = nanos
    else:
      new_d[snake_k] = v
  return new_d


def camel_to_snake(s):
  """Converts a string from camelCase to snake_case."""
  return ''.join(['_' + c.lower() if c.isupper() else c for c in s]).lstrip('_')


def analyse_video(
    video_file_path: str,
    bucket_name: str,
    gcs_folder: str,
    output_file_name: str,
) -> videointelligence.VideoAnnotationResults:
  """Runs video analysis via the Video AI API and returns the results."""
  file_path, file_ext = os.path.splitext(video_file_path)
  file_name = pathlib.Path(file_path).name
  gcs_file_path = str(pathlib.Path(gcs_folder, f'{file_name}{file_ext}'))

  return _run_video_intelligence(
      bucket_name=bucket_name,
      gcs_input_path=gcs_file_path,
      gcs_output_path=str(pathlib.Path(gcs_folder, output_file_name)),
  )


def _run_video_intelligence(
    bucket_name: str,
    gcs_input_path: str,
    gcs_output_path: str,
) -> videointelligence.VideoAnnotationResults:
  """Runs video analysis via the Video AI API and returns the results.

  Args:
    bucket_name: The GCS bucket name where the video is stored.
    gcs_input_path: The path to the input video file in GCS.
    gcs_output_path: The path to the output analysis file in GCS.

  Returns:
    The annotation results from the Video AI API.
  """
  video_client = videointelligence.VideoIntelligenceServiceClient()
  features = [
      videointelligence.Feature.LABEL_DETECTION,
      videointelligence.Feature.OBJECT_TRACKING,
      videointelligence.Feature.SHOT_CHANGE_DETECTION,
      videointelligence.Feature.FACE_DETECTION,
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

  context = videointelligence.VideoContext(
      label_detection_config=label_config,
      face_detection_config=face_config,
  )

  operation = video_client.annotate_video(
      request={
          'features': features,
          'input_uri': f'gs://{bucket_name}/{gcs_input_path}',
          'output_uri': f'gs://{bucket_name}/{gcs_output_path}',
          'video_context': context,
      }
  )

  result = operation.result(timeout=3600)
  return result.annotation_results[0]


def get_visual_shots_data(
    annotation_results: videointelligence.VideoAnnotationResults,
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
  logging.info(
      'SHOT_DETECTION: Video Intelligence API detected %d shots',
      len(annotation_results.shot_annotations)
  )
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
      audio_segment_ids = _identify_segments(
          start_time,
          end_time,
          transcription_dataframe,
          audio_segment_id_key,
      )
      shots_data.append((
          i + 1,
          audio_segment_ids,
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
    annotation_results: videointelligence.VideoAnnotationResults,
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
              start_time,
              end_time,
              optimised_av_segments,
              av_segment_id_key,
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
    annotation_results: videointelligence.VideoAnnotationResults,
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
    annotation_results: videointelligence.VideoAnnotationResults,
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
    annotation_results: videointelligence.VideoAnnotationResults,
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
  text_detection_dataframe = (
      text_detection_dataframe.sort_values(by=['start_s'])
  )

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
