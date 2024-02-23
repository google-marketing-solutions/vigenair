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

"""ViGenAiR module.

This module is the main module for ViGenAiR's server-side components.

The methods within the `Extractor` class provide functionality to extract all
available information from an input video file, while those in `Combiner`
combine individual cuts of the input video based on user-specific settings.

This file is the target of a "Cloud Storage" Trigger (Finalize/Create) Cloud
Function, with `gcs_file_uploaded` as the main entry point.
"""

import concurrent.futures
import enum
import logging
import os
import pathlib
import re
import shutil
import subprocess
import tempfile
from typing import Any, Dict, Optional, Sequence, Tuple

from faster_whisper import WhisperModel
import functions_framework
from google.cloud import logging as cloudlogging
from google.cloud import storage
from google.cloud import videointelligence
from google.cloud.storage import transfer_manager
from iso639 import languages
import pandas as pd
import torch
import vertexai
from vertexai.preview import generative_models
from vertexai.preview.generative_models import GenerativeModel
from vertexai.preview.generative_models import Part
import whisper


GCP_PROJECT_ID = os.environ.get('GCP_PROJECT_ID', 'my-gcp-project')
GCP_LOCATION = os.environ.get('GCP_LOCATION', 'us-central1')
CONFIG_WHISPER_MODEL = os.environ.get('CONFIG_WHISPER_MODEL', 'small')
CONFIG_ANNOTATIONS_CONFIDENCE_THRESHOLD = float(
    os.environ.get('CONFIG_ANNOTATIONS_CONFIDENCE_THRESHOLD', '0.7')
)

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
INPUT_FILENAME = 'input'
INPUT_RENDERING_FILE = 'render.json'
OUTPUT_ANALYSIS_FILE = 'analysis.json'
OUTPUT_DATA_FILE = 'data.json'
OUTPUT_COMBINATIONS_FILE = 'combos.json'
OUTPUT_AV_SEGMENTS_DIR = 'av_segments_cuts'

SEGMENT_ANNOTATIONS_PATTERN = '(.*Description:\n)?(.*)\n*Keywords:\n?(.*)'
SEGMENT_ANNOTATIONS_PROMPT = (
    """Describe this video in one sentence. Include 5 keywords.

Take a deep breath, and output EXACTLY as follows:
Description: the description.
Keywords: the keywords, comma-separated.

"""
)


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
        and self.file_name == INPUT_FILENAME
    )

  def is_combiner_trigger(self) -> bool:
    return False


def _execute_subprocess_commands(
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


def _download_gcs_file(
    file_path: TriggerFile,
    output_dir: str,
    bucket_name: str,
) -> str:
  """Downloads a file from the given GCS bucket and returns its path.

  Args:
    file_path: The path of the file to download.
    output_dir: Directory path to store the downloaded file in.
    bucket_name: The name of the bucket to retrieve the file from.

  Returns:
    The retrieved file path, or None if the file was not found.
  """
  storage_client = storage.Client()
  bucket = storage_client.bucket(bucket_name)

  blob = bucket.blob(file_path.full_gcs_path)

  if blob.exists():
    destination_file_name = str(
        pathlib.Path(output_dir, file_path.file_name_ext)
    )
    blob.download_to_filename(destination_file_name)
    logging.info(
        'Fetched file "%s" from bucket "%s".',
        file_path.full_gcs_path,
        bucket_name,
    )
    return destination_file_name
  logging.warning(
      'Could not find file "%s" in bucket "%s".',
      file_path.full_gcs_path,
      bucket_name,
  )
  return None


def _upload_gcs_file(
    file_path: str,
    destination_file_name: str,
    bucket_name: str,
) -> None:
  """Uploads a file to the given GCS bucket.

  Args:
    file_path: The path of the file to upload.
    destination_file_name: The name of the file to upload as.
    bucket_name: The name of the bucket to retrieve the file from.
  """
  storage_client = storage.Client()
  bucket = storage_client.bucket(bucket_name)

  blob = bucket.blob(destination_file_name)
  blob.upload_from_filename(file_path, if_generation_match=0)

  logging.info('UPLOAD - Uploaded path "%s".', destination_file_name)


def _upload_gcs_dir(
    source_directory: str,
    bucket_name: storage.Bucket,
    target_dir: str,
) -> None:
  """Uploads all files in a directory to a GCS bucket.

  Args:
    source_directory: The directory to upload.
    bucket_name: The name of the bucket to upload to.
    target_dir: The directory within the bucket to upload to.
  """
  storage_client = storage.Client()
  bucket = storage_client.bucket(bucket_name)

  directory_path = pathlib.Path(source_directory)
  paths = directory_path.rglob('*')

  file_paths = [path for path in paths if path.is_file()]
  relative_paths = [path.relative_to(source_directory) for path in file_paths]
  string_paths = [str(path) for path in relative_paths]

  results = transfer_manager.upload_many_from_filenames(
      bucket,
      string_paths,
      source_directory=source_directory,
      blob_name_prefix=f'{target_dir}/',
      skip_if_exists=True,
  )
  for file_path, result in zip(string_paths, results):
    if isinstance(result, Exception) and result.code and result.code != 412:
      logging.warning(
          'UPLOAD - Failed to upload path "%s" due to exception: %r.',
          file_path,
          result,
      )
    elif result is None:
      logging.info('UPLOAD - Uploaded path "%s".', file_path)


def _setup_logging() -> None:
  """Configures GCP logging to work with the standard Python logging module."""
  lg_client = cloudlogging.Client()
  lg_client.setup_logging()


def _extract_audio(video_file_path: str):
  """Extracts the audio track from a video file."""
  audio_file_path = f"{video_file_path.split('.')[0]}.wav"

  _execute_subprocess_commands(
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


def _split_audio(
    output_dir: str,
    audio_file_path: str,
) -> Tuple[str, str]:
  """Splits the audio into vocals and music tracks and returns their paths."""
  _execute_subprocess_commands(
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


def _transcribe_audio(output_dir: str, audio_file_path: str) -> str:
  """Transcribes an audio file and returns the transcription."""
  model = WhisperModel(CONFIG_WHISPER_MODEL, device=DEVICE, compute_type='int8')
  segments, info = model.transcribe(
      audio_file_path,
      beam_size=5,
      word_timestamps=True,
  )

  video_language = languages.get(alpha2=info.language).name
  _execute_subprocess_commands(
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


def _analyse_video(video_file: TriggerFile, bucket_name: str):
  """Runs video analysis via the Video AI API and returns the results."""
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
          'output_uri': f'gs://{bucket_name}/{video_file.gcs_folder}/{OUTPUT_ANALYSIS_FILE}',
          'video_context': context,
      }
  )

  result = operation.result(timeout=600)
  return result.annotation_results[0]


def _identify_segments(
    start_time: float,
    end_time: float,
    data: pd.DataFrame,
    key: str,
) -> Sequence[int]:
  """Identifies rows in a dataframe that overlap with a given time range.

  Args:
    start_time: The start time of the range.
    end_time: The end time of the range.
    data: The dataframe to search in.
    key: The column name of the ids to return.

  Returns:
    The identified row IDs for the given column.
  """
  result = data[
      # Segments starting before and ending within or after the range
      (data['start_s'] <= start_time) & (data['end_s'] > start_time)
      |
      # Segments starting within the range
      (data['start_s'] >= start_time) & (data['start_s'] < end_time)
  ]
  if not result.empty:
    return result[key].tolist()
  return []


def _get_dataframe_by_ids(
    data: pd.DataFrame, key: str, value: str, ids: Sequence[str]
):
  """Returns a dataframe filtered by a list of IDs."""
  series = [data[data[key] == id] for id in ids]
  result = [entry[value].to_list()[0] for entry in series]
  return result


def _get_entities(
    data: pd.DataFrame,
    search_value: str,
    return_key: str = 'label',
    search_key: str = 'av_segment_ids',
):
  """Returns all entities in a DataFrame that match a given search value."""
  temp = data.loc[[(search_value in labels) for labels in data[search_key]]]
  entities = (
      temp[temp['confidence'] > CONFIG_ANNOTATIONS_CONFIDENCE_THRESHOLD]
      .sort_values(by='confidence', ascending=False)[return_key]
      .to_list()
  )

  return list(set(entities))


def _create_optimised_segments(
    annotation_results,
    transcription_dataframe: pd.DataFrame,
) -> pd.DataFrame:
  """Creates coherent Audio/Video segments by combining all annotations."""
  shots_dataframe = _get_visual_shots_data(
      annotation_results,
      transcription_dataframe,
  )
  optimised_av_segments = _create_optimised_av_segments(
      shots_dataframe,
      transcription_dataframe,
  )
  labels_dataframe = _get_shot_labels_data(
      annotation_results,
      optimised_av_segments,
  )
  objects_dataframe = _get_object_tracking_data(
      annotation_results,
      optimised_av_segments,
  )
  logos_dataframe = _get_logo_detection_data(
      annotation_results,
      optimised_av_segments,
  )
  text_dataframe = _get_text_detection_data(
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


def _get_visual_shots_data(
    annotation_results,
    transcription_dataframe: pd.DataFrame,
) -> pd.DataFrame:
  """Returns a DataFrame of visual shots extracted from the Video AI API."""
  shots_data = []
  for i, shot in enumerate(annotation_results.shot_annotations):
    start_time = (
        shot.start_time_offset.seconds
        + shot.start_time_offset.microseconds / 1e6
    )
    end_time = (
        shot.end_time_offset.seconds + shot.end_time_offset.microseconds / 1e6
    )

    shots_data.append((
        i + 1,
        _identify_segments(
            start_time, end_time, transcription_dataframe, 'audio_segment_id'
        ),
        start_time,
        end_time,
        end_time - start_time,
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


def _create_optimised_av_segments(shots_dataframe, transcription_dataframe):
  """Creates coherent segments by combining shots and transcription data."""
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


def _get_shot_labels_data(
    annotation_results,
    optimised_av_segments: pd.DataFrame,
) -> pd.DataFrame:
  """Returns a DataFrame of shot labels extracted from the Video AI API."""
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
              start_time, end_time, optimised_av_segments, 'av_segment_id'
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


def _get_object_tracking_data(
    annotation_results,
    optimised_av_segments: pd.DataFrame,
) -> pd.DataFrame:
  """Returns a DataFrame of object tracking data extracted from the Video AI API."""
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
            start_time, end_time, optimised_av_segments, 'av_segment_id'
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


def _get_logo_detection_data(
    annotation_results,
    optimised_av_segments: pd.DataFrame,
) -> pd.DataFrame:
  """Returns a DataFrame of logo detection data extracted from the Video AI API."""
  logo_detection_data = []
  for (
      logo_recognition_annotation
  ) in annotation_results.logo_recognition_annotations:
    entity = logo_recognition_annotation.entity

    label = entity.description
    segments = [
        (
            (
                segment.start_time_offset.seconds
                + segment.start_time_offset.microseconds / 1e6
            ),
            (
                segment.end_time_offset.seconds
                + segment.end_time_offset.microseconds / 1e6
            ),
        )
        for segment in logo_recognition_annotation.segments
    ]

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
          start_time, end_time, optimised_av_segments, 'av_segment_id'
      )
      boxes = [
          (
              timestamped_object.normalized_bounding_box.left,
              timestamped_object.normalized_bounding_box.top,
              timestamped_object.normalized_bounding_box.right,
              timestamped_object.normalized_bounding_box.bottom,
          )
          for timestamped_object in track.timestamped_objects
      ]
      attributes = [
          (attribute.name, attribute.value, attribute.confidence)
          for timestamped_object in track.timestamped_objects
          for attribute in timestamped_object.attributes
      ]
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


def _get_text_detection_data(
    annotation_results,
    optimised_av_segments: pd.DataFrame,
) -> pd.DataFrame:
  """Returns a DataFrame of text detection data extracted from the Video AI API."""
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
          start_time, end_time, optimised_av_segments, 'av_segment_id'
      )
      boxes = [
          (vertex.x, vertex.y)
          for frame in text_segment.frames
          for vertex in frame.rotated_bounding_box.vertices
      ]
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
  text_detection_dataframe = text_detection_dataframe.sort_values(
      by=['start_s']
  )

  return text_detection_dataframe


def _annotate_segments(
    optimised_av_segments,
    labels_dataframe,
    objects_dataframe,
    logos_dataframe,
    text_dataframe,
) -> pd.DataFrame:
  """Annotates the A/V segments with data from the Video AI API."""
  labels = []
  objects = []
  logo = []
  text = []

  for _, row in optimised_av_segments.iterrows():
    av_segment_id = row['av_segment_id']

    labels.append(_get_entities(labels_dataframe, av_segment_id))
    objects.append(_get_entities(objects_dataframe, av_segment_id))
    logo.append(_get_entities(logos_dataframe, av_segment_id))
    text.append(_get_entities(text_dataframe, av_segment_id, return_key='text'))

  optimised_av_segments = optimised_av_segments.assign(
      **{'labels': labels, 'objects': objects, 'logos': logo, 'text': text}
  )

  return optimised_av_segments


def _cut_and_annotate_av_segment(
    index: int,
    row: pd.Series,
    video_file_path: str,
    cuts_path: str,
    vision_model,
    gcs_cut_path: str,
    bucket_name: str,
    video_description_config,
    safety_config,
) -> Tuple[str, str]:
  """Cuts a single A/V segment with ffmpeg and annotates it with Gemini."""
  cut_path = f"{index}.{video_file_path.split('.')[-1]}"
  full_cut_path = str(pathlib.Path(cuts_path, cut_path))

  _execute_subprocess_commands(
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
  _upload_gcs_file(
      file_path=full_cut_path,
      bucket_name=bucket_name,
      destination_file_name=gcs_cut_path.replace(f'gs://{bucket_name}/', ''),
  )
  description = ''
  keywords = ''
  try:
    response = vision_model.generate_content(
        [
            Part.from_uri(gcs_cut_path, mime_type='video/mp4'),
            SEGMENT_ANNOTATIONS_PROMPT,
        ],
        generation_config=video_description_config,
        safety_settings=safety_config,
    )
    if (
        response.candidates
        and response.candidates[0].content.parts
        and response.candidates[0].content.parts[0].text
    ):
      text = response.candidates[0].content.parts[0].text
      result = re.search(SEGMENT_ANNOTATIONS_PATTERN, text)
      logging.info('ANNOTATION - annotating segment %s: %s', index, text)
      description = result.group(2)
      keywords = result.group(3)
    else:
      logging.warning('ANNOTATION - could not annotate segment %s!', index)
  # Execution should continue regardless of the underlying exception
  except Exception:
    logging.exception(
        'Encountered error during segment %s annotation! Continuing...',
        index,
    )
  return description, keywords


@functions_framework.cloud_event
def gcs_file_uploaded(cloud_event: Dict[str, Any]):
  """Triggered by a change in a storage bucket.

  Args:
    cloud_event: The Eventarc trigger event.
  """
  _setup_logging()
  data = cloud_event.data
  bucket = data['bucket']
  filepath = data['name']

  logging.info('BEGIN - Processing uploaded file: %s...', filepath)

  trigger_file = TriggerFile(filepath)

  if trigger_file.is_extractor_trigger():
    extractor_instance = Extractor(
        gcs_bucket_name=bucket, video_file=trigger_file
    )
    extractor_instance.extract()
  elif trigger_file.is_combiner_trigger():
    raise NotImplementedError('Combiner not implemented yet!')

  logging.info('END - Finished processing uploaded file: %s.', filepath)


class Extractor:
  """Encapsulates all the extraction logic."""

  def __init__(self, gcs_bucket_name: str, video_file: TriggerFile):
    """Initialiser.

    Args:
      gcs_bucket_name: The GCS bucket to read from and store files in.
      video_file: Path to the input video file.
    """
    self.gcs_bucket_name = gcs_bucket_name
    self.video_file = video_file
    vertexai.init(project=GCP_PROJECT_ID, location=GCP_LOCATION)
    self.vision_model = GenerativeModel('gemini-pro-vision')
    self.text_model = GenerativeModel('gemini-pro')
    self.safety_config = {
        generative_models.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: (
            generative_models.HarmBlockThreshold.BLOCK_NONE
        ),
        generative_models.HarmCategory.HARM_CATEGORY_HARASSMENT: (
            generative_models.HarmBlockThreshold.BLOCK_NONE
        ),
        generative_models.HarmCategory.HARM_CATEGORY_HATE_SPEECH: (
            generative_models.HarmBlockThreshold.BLOCK_NONE
        ),
        generative_models.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: (
            generative_models.HarmBlockThreshold.BLOCK_NONE
        ),
    }

  def extract(self):
    """Extracts all the available data from the input video."""
    tmp_dir = tempfile.mkdtemp()
    video_file_path = _download_gcs_file(
        file_path=self.video_file,
        output_dir=tmp_dir,
        bucket_name=self.gcs_bucket_name,
    )
    audio_file_path = _extract_audio(video_file_path)

    transcription_dataframe = None
    annotation_results = None
    vocals_file_path = None
    music_file_path = None
    with concurrent.futures.ProcessPoolExecutor() as process_executor:
      futures_dict = {
          process_executor.submit(
              _transcribe_audio,
              output_dir=tmp_dir,
              audio_file_path=audio_file_path,
          ): 'transcribe_audio',
          process_executor.submit(
              _analyse_video,
              video_file=self.video_file,
              bucket_name=self.gcs_bucket_name,
          ): 'analyse_video',
          process_executor.submit(
              _split_audio,
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
            _upload_gcs_dir(
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

    logging.info('AUDIO - vocals_file_path: %s', vocals_file_path)
    logging.info('AUDIO - music_file_path: %s', music_file_path)

    optimised_av_segments = _create_optimised_segments(
        annotation_results,
        transcription_dataframe,
    )
    logging.info('SEGMENTS - optimised segments: %r', optimised_av_segments)

    optimised_av_segments = self.cut_and_annotate_av_segments(
        tmp_dir,
        video_file_path,
        optimised_av_segments,
    )
    logging.info(
        'SEGMENTS - final optimised segments: %r',
        optimised_av_segments,
    )

    data_file_path = str(pathlib.Path(tmp_dir, OUTPUT_DATA_FILE))
    optimised_av_segments.to_json(data_file_path, orient='records')

    _upload_gcs_dir(
        source_directory=tmp_dir,
        bucket_name=self.gcs_bucket_name,
        target_dir=self.video_file.gcs_folder,
    )

  def cut_and_annotate_av_segments(
      self,
      tmp_dir: str,
      video_file_path: str,
      optimised_av_segments: pd.DataFrame,
  ) -> pd.DataFrame:
    """Cuts A/V segments with ffmpeg and annotates them with Gemini, concurrently."""
    cuts_path = str(pathlib.Path(tmp_dir, OUTPUT_AV_SEGMENTS_DIR))
    os.makedirs(cuts_path)
    video_description_config = {
        'max_output_tokens': 2048,
        'temperature': 0.2,
        'top_p': 1,
        'top_k': 16,
    }
    gcs_cuts_folder_path = f'gs://{self.gcs_bucket_name}/{self.video_file.gcs_folder}/{OUTPUT_AV_SEGMENTS_DIR}'
    descriptions = []
    keywords = []

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
              video_description_config=video_description_config,
              safety_config=self.safety_config,
          ): index
          for index, row in optimised_av_segments.iterrows()
      }

      for response in concurrent.futures.as_completed(futures_dict):
        index = futures_dict[response]
        description, keyword = response.result()
        descriptions.insert(index, description)
        keywords.insert(index, keyword)

    optimised_av_segments = optimised_av_segments.assign(
        **{'description': descriptions, 'keywords': keywords}
    )
    return optimised_av_segments
