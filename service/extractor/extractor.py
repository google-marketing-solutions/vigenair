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
import dataclasses
import json
import logging
import os
import pathlib
import re
import shutil
import tempfile
from typing import Sequence, Tuple
from urllib import parse

import audio as AudioService
import config as ConfigService
import extractor.audio_extractor as AudioExtractor
import extractor.video_extractor as VideoExtractor
import pandas as pd
import storage as StorageService
import utils as Utils
import vertexai
from vertexai.generative_models import GenerativeModel, Part
import video as VideoService


@dataclasses.dataclass(init=False)
class AvSegmentSplitMarker:
  """Represents all information required to split a segment at a specified marker.

  Attributes:
    av_segment_id: The ID of the A/V segment to split.
    marker_cut_time_s: The time in seconds at which to split the segment.
  """

  av_segment_id: str
  marker_cut_time_s: float

  def __init__(self, **kwargs):
    field_names = set([f.name for f in dataclasses.fields(self)])
    for k, v in kwargs.items():
      if k in field_names:
        setattr(self, k, v)

  def __str__(self):
    return (
        'AvSegmentSplitMarker('
        f'av_segment_id={self.av_segment_id}, '
        f'marker_cut_time_s={self.marker_cut_time_s})'
    )


class Extractor:
  """Encapsulates all the extraction logic."""

  def __init__(self, gcs_bucket_name: str, media_file: Utils.TriggerFile):
    """Initialiser.

    Args:
      gcs_bucket_name: The GCS bucket to read from and store files in.
      media_file: Path to the input media file, which is in a specific folder on
        GCS. See Utils.VideoMetadata for more information.
    """
    self.gcs_bucket_name = gcs_bucket_name
    self.media_file = media_file
    vertexai.init(
        project=ConfigService.GCP_PROJECT_ID,
        location=ConfigService.GCP_LOCATION,
    )
    self.vision_model = GenerativeModel(ConfigService.CONFIG_VISION_MODEL)

  def initial_extract(self):
    """Extracts all the available data from the input video."""
    logging.info('EXTRACTOR - Starting extraction...')
    tmp_dir = tempfile.mkdtemp()
    input_video_file_path = StorageService.download_gcs_file(
        file_path=self.media_file,
        output_dir=tmp_dir,
        bucket_name=self.gcs_bucket_name,
    )
    input_audio_file_path = AudioService.extract_audio(input_video_file_path)
    if input_audio_file_path:
      StorageService.upload_gcs_dir(
          source_directory=tmp_dir,
          bucket_name=self.gcs_bucket_name,
          target_dir=self.media_file.gcs_folder,
      )

    with concurrent.futures.ProcessPoolExecutor() as process_executor:
      concurrent.futures.wait([
          process_executor.submit(
              AudioExtractor.process_audio,
              output_dir=tmp_dir,
              input_audio_file_path=input_audio_file_path,
              gcs_bucket_name=self.gcs_bucket_name,
              media_file=self.media_file,
          ),
          process_executor.submit(
              VideoExtractor.process_video,
              output_dir=tmp_dir,
              input_video_file_path=input_video_file_path,
              media_file=self.media_file,
              gcs_bucket_name=self.gcs_bucket_name,
          )
      ])

  def extract_audio(self):
    """Extracts audio information from the input video."""
    AudioExtractor.extract_audio(self.media_file, self.gcs_bucket_name)

  def extract_audio_finalise(self, output_dir: str) -> pd.DataFrame:
    """Combines all generated audio analysis files together."""
    logging.info('EXTRACTOR - Finalising audio extraction...')
    transcription_dataframes = [
        pd.DataFrame(json.loads(json_file_contents.decode('utf-8')))
        for json_file_contents in StorageService.filter_files(
            bucket_name=self.gcs_bucket_name,
            prefix=f'{self.media_file.gcs_folder}/',
            suffix=ConfigService.OUTPUT_TRANSCRIPT_FILE,
            fetch_content=True,
        )
    ]
    size = len(transcription_dataframes)
    audio_output_dir = str(
        pathlib.Path(output_dir, ConfigService.OUTPUT_ANALYSIS_CHUNKS_DIR)
    )
    is_chunk = (
        ConfigService.OUTPUT_ANALYSIS_CHUNKS_DIR
        in self.media_file.full_gcs_path
    )
    output_subdir = audio_output_dir if is_chunk else output_dir
    os.makedirs(output_subdir, exist_ok=True)
    vocals_files = StorageService.filter_files(
        bucket_name=self.gcs_bucket_name,
        prefix=f'{self.media_file.gcs_root_folder}/',
        suffix=ConfigService.OUTPUT_SPEECH_FILE,
        download=True,
        download_dir=output_subdir,
    )
    music_files = StorageService.filter_files(
        bucket_name=self.gcs_bucket_name,
        prefix=f'{self.media_file.gcs_root_folder}/',
        suffix=ConfigService.OUTPUT_MUSIC_FILE,
        download=True,
        download_dir=output_subdir,
    )
    StorageService.filter_files(
        bucket_name=self.gcs_bucket_name,
        prefix=f'{self.media_file.gcs_root_folder}/',
        suffix=f'.{ConfigService.OUTPUT_SUBTITLES_TYPE}',
        download=True,
        download_dir=output_subdir,
    )
    if size > 1:
      subtitles_output_path = str(
          pathlib.Path(output_dir, ConfigService.OUTPUT_SUBTITLES_FILE)
      )
      AudioService.combine_subtitle_files(
          output_subdir,
          subtitles_output_path,
      )
      StorageService.upload_gcs_file(
          file_path=subtitles_output_path,
          bucket_name=self.gcs_bucket_name,
          destination_file_name=str(
              pathlib.Path(
                  self.media_file.gcs_root_folder,
                  ConfigService.OUTPUT_SUBTITLES_FILE
              )
          ),
      )
      logging.info(
          'TRANSCRIPTION - %s written successfully!',
          ConfigService.OUTPUT_SUBTITLES_FILE,
      )
    else:
      shutil.rmtree(output_subdir)

    language_probability_dict = {}
    language_infos = [
        json.loads(json_file_contents.decode('utf-8'))
        for json_file_contents in StorageService.filter_files(
            bucket_name=self.gcs_bucket_name,
            prefix=f'{self.media_file.gcs_folder}/',
            suffix=ConfigService.OUTPUT_LANGUAGE_INFO_FILE,
            fetch_content=True,
        )
    ]
    for language_info in language_infos:
      if language_info[AudioExtractor.VIDEO_LANGUAGE_KEY
                      ] in language_probability_dict:
        language_probability_dict[language_info[
            AudioExtractor.VIDEO_LANGUAGE_KEY]] = max(
                language_probability_dict[language_info[
                    AudioExtractor.VIDEO_LANGUAGE_KEY]],
                language_info[AudioExtractor.LANGUAGE_PROBABILITY_KEY],
            )
      else:
        language_probability_dict[language_info[
            AudioExtractor.VIDEO_LANGUAGE_KEY]] = (
                language_info[AudioExtractor.LANGUAGE_PROBABILITY_KEY]
            )
    video_language = None if not language_probability_dict else max(
        language_probability_dict, key=language_probability_dict.get
    )
    if video_language:
      with open(
          str(pathlib.Path(output_dir, ConfigService.OUTPUT_LANGUAGE_FILE)),
          'w',
          encoding='utf8',
      ) as f:
        f.write(video_language)
      logging.info(
          'LANGUAGE - %s written successfully with language: %s!',
          ConfigService.OUTPUT_LANGUAGE_FILE,
          video_language,
      )

    transcription_dataframe = (
        pd.DataFrame() if size == 0 else transcription_dataframes[0]
    )
    if size > 1:
      logging.info(
          'THREADING - Combining %d transcribe_audio outputs...',
          size,
      )
      transcription_dataframe = AudioService.combine_analysis_chunks(
          transcription_dataframes
      )
      logging.info(
          'TRANSCRIPTION - Full transcription dataframe: %r',
          transcription_dataframe.to_json(orient='records')
      )

    if len(vocals_files) > 1:
      logging.info(
          'THREADING - Combining %d split_audio vocals files...',
          len(vocals_files),
      )
      vocals_file_path = str(
          pathlib.Path(output_dir, ConfigService.OUTPUT_SPEECH_FILE)
      )
      AudioService.combine_audio_files(vocals_file_path, vocals_files)
      logging.info('AUDIO - vocals_file_path: %s', vocals_file_path)
    if len(music_files) > 1:
      logging.info(
          'THREADING - Combining %d split_audio music files...',
          len(music_files),
      )
      music_file_path = str(
          pathlib.Path(output_dir, ConfigService.OUTPUT_MUSIC_FILE)
      )
      AudioService.combine_audio_files(music_file_path, music_files)
      logging.info('AUDIO - music_file_path: %s', music_file_path)

    return transcription_dataframe

  def extract_video(self):
    """Extracts visual information from the input video."""
    VideoExtractor.extract_video(self.media_file, self.gcs_bucket_name)

  def extract_video_finalise(self, output_dir: str):
    """Combines all generated <id>_analysis.json into a single one."""
    logging.info('EXTRACTOR - Finalising video extraction...')
    annotation_results = [
        VideoService.video_annotation_from_json(
            json.loads(json_file_contents.decode('utf-8'))
        ) for json_file_contents in StorageService.filter_files(
            bucket_name=self.gcs_bucket_name,
            prefix=f'{self.media_file.gcs_root_folder}/',
            suffix=ConfigService.OUTPUT_ANALYSIS_FILE,
            fetch_content=True,
        )
    ]
    size = len(annotation_results)
    result = annotation_results[0]
    if len(annotation_results) > 1:
      logging.info(
          'THREADING - Combining %d analyse_video outputs...',
          size,
      )
      (
          result_json,
          result,
      ) = VideoService.combine_analysis_chunks(annotation_results)
      analysis_filepath = str(
          pathlib.Path(output_dir, ConfigService.OUTPUT_ANALYSIS_FILE)
      )
      with open(analysis_filepath, 'w', encoding='utf-8') as f:
        json.dump(result_json, f, indent=2)
      StorageService.upload_gcs_file(
          file_path=analysis_filepath,
          bucket_name=self.gcs_bucket_name,
          destination_file_name=str(
              pathlib.Path(
                  self.media_file.gcs_root_folder,
                  ConfigService.OUTPUT_ANALYSIS_FILE,
              )
          ),
      )
    return result

  def check_finalise_extraction(self):
    """Checks whether all analyses are complete."""
    finalise_count = len(
        StorageService.filter_files(
            bucket_name=self.gcs_bucket_name,
            prefix=f'{self.media_file.gcs_folder}/',
            suffix=ConfigService.INPUT_EXTRACTION_FINALISE_SUFFIX,
        )
    )
    if finalise_count == ConfigService.INPUT_EXTRACTION_FINALISE_COUNT:
      finalise_file_path = ConfigService.INPUT_EXTRACTION_FINALISE_FILE
      with open(finalise_file_path, 'w', encoding='utf8'):
        pass

      StorageService.upload_gcs_file(
          file_path=finalise_file_path,
          bucket_name=self.gcs_bucket_name,
          destination_file_name=str(
              pathlib.Path(self.media_file.gcs_folder, finalise_file_path)
          ),
      )

  def finalise_extraction(self):
    """Combines all analysis outpus and creates the optimised segments."""
    logging.info('EXTRACTOR - Finalising extraction...')
    tmp_dir = tempfile.mkdtemp()
    video_file_name = next(
        iter(
            StorageService.filter_video_files(
                prefix=(
                    f'{self.media_file.gcs_root_folder}/'
                    f'{ConfigService.INPUT_FILENAME}'
                ),
                bucket_name=self.gcs_bucket_name,
                first_only=True,
            )
        ), None
    )
    input_video_file_path = StorageService.download_gcs_file(
        file_path=Utils.TriggerFile(video_file_name),
        output_dir=tmp_dir,
        bucket_name=self.gcs_bucket_name,
    )

    annotation_results = self.extract_video_finalise(tmp_dir)
    transcription_dataframe = self.extract_audio_finalise(tmp_dir)

    optimised_av_segments = _create_optimised_segments(
        annotation_results,
        transcription_dataframe,
    )
    logging.info(
        'SEGMENTS - Optimised segments: %r',
        optimised_av_segments.to_json(orient='records')
    )
    self.finalise_av_segments(
        tmp_dir,
        input_video_file_path,
        video_file_name,
        optimised_av_segments,
    )
    logging.info('EXTRACTOR - Extraction completed successfully!')

  def finalise_av_segments(
      self,
      tmp_dir: str,
      input_video_file_path: str,
      video_file_name: str,
      optimised_av_segments: pd.DataFrame,
  ):
    """Cuts, annotates and enhances A/V segments."""
    optimised_av_segments = self.cut_and_annotate_av_segments(
        tmp_dir,
        input_video_file_path,
        optimised_av_segments,
    )
    logging.info(
        'SEGMENTS - Optimised segments with descriptions and keywords: %r',
        optimised_av_segments.to_json(orient='records'),
    )
    optimised_av_segments = self.enhance_av_segments(
        video_file_name,
        optimised_av_segments,
    )
    logging.info(
        'SEGMENTS - Final enhanced segments: %r',
        optimised_av_segments.to_json(orient='records'),
    )

    data_file_path = str(pathlib.Path(tmp_dir, ConfigService.OUTPUT_DATA_FILE))
    optimised_av_segments.to_json(data_file_path, orient='records')

    StorageService.upload_gcs_dir(
        source_directory=tmp_dir,
        bucket_name=self.gcs_bucket_name,
        target_dir=self.media_file.gcs_root_folder,
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
        f'gs://{self.gcs_bucket_name}/{self.media_file.gcs_root_folder}/'
        f'{ConfigService.OUTPUT_AV_SEGMENTS_DIR}'
    )
    _, video_ext = os.path.splitext(video_file_path)
    size = len(optimised_av_segments)
    descriptions = [None] * size
    keywords = [None] * size
    cut_paths = [None] * size
    screenshot_paths = [None] * size

    with concurrent.futures.ThreadPoolExecutor() as thread_executor:
      futures_dict = {
          thread_executor.submit(
              _cut_and_annotate_av_segment,
              row=row,
              video_file_path=video_file_path,
              cuts_path=cuts_path,
              vision_model=self.vision_model,
              gcs_cut_path=(
                  f'{gcs_cuts_folder_path}/'
                  f"{row['av_segment_id'].replace('.0', '')}{video_ext}"
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
            f'{ConfigService.GCS_BASE_URL}/'
            f'{self.gcs_bucket_name}/'
            f'{parse.quote(self.media_file.gcs_root_folder)}/'
            f'{ConfigService.OUTPUT_AV_SEGMENTS_DIR}/'
            f"{optimised_av_segments.loc[index, 'av_segment_id'].replace('.0', '')}"
        )
        cut_paths[index] = f'{resources_base_path}{video_ext}'
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

  def enhance_av_segments(
      self,
      video_file_path: str,
      optimised_av_segments: pd.DataFrame,
  ) -> pd.DataFrame:
    """Enhances A/V segment descriptions and keywords to achieve more coherence.

    Args:
      video_file_path: Path to the input video file.
      optimised_av_segments: The A/V segments data to be enhanced.

    Returns:
      The enhanced A/V segments data as a DataFrame.
    """
    descriptions = [
        f'Scene: {index+1}\n{description.strip()}' for index, description in
        enumerate(optimised_av_segments['description'].tolist())
    ]
    prompt = ''.join([
        ConfigService.ENHANCE_SEGMENT_ANNOTATIONS_PROMPT,
        '\n\n'.join(descriptions)
    ])
    rows = []
    try:
      response = self.vision_model.generate_content(
          [
              Part.from_uri(
                  f'gs://{self.gcs_bucket_name}/{video_file_path}',
                  mime_type='video/mp4'
              ),
              prompt,
          ],
          generation_config=ConfigService.ENHANCE_SEGMENT_ANNOTATIONS_CONFIG,
          safety_settings=ConfigService.CONFIG_DEFAULT_SAFETY_CONFIG,
      )
      if (
          response.candidates and response.candidates[0].content.parts
          and response.candidates[0].content.parts[0].text
      ):
        text = response.candidates[0].content.parts[0].text
        results = list(filter(None, text.strip().split('\n\n')))
        for result in results:
          result = re.findall(
              ConfigService.ENHANCE_SEGMENT_ANNOTATIONS_PATTERN, result,
              re.MULTILINE
          )
          if not result:
            logging.warning('ANNOTATION - Could not enhance segments!')
            rows = []
            break
          rows.append([entry.strip() for entry in result[0]])
      else:
        logging.warning('ANNOTATION - Could not enhance segments!')
    # Execution should continue regardless of the underlying exception
    # pylint: disable=broad-exception-caught
    except Exception:
      logging.exception(
          'Encountered error while enhancing segment annotations!'
      )

    if rows:
      enhanced_segments = pd.DataFrame(
          rows, columns=[
              'scene_number',
              'old_description',
              'new_description',
              'keywords',
          ]
      )
      optimised_av_segments['description'] = enhanced_segments['new_description'
                                                              ]
      optimised_av_segments['keywords'] = enhanced_segments['keywords']
      logging.info(
          'ANNOTATION - Successfully enhanced segment descriptions '
          'and keywords!'
      )
    return optimised_av_segments

  def split_av_segment(self):
    """Splits A/V segment at given markers."""
    logging.info(
        'SPLITTING - Starting split operation: %s',
        self.media_file.full_gcs_path
    )
    tmp_dir = tempfile.mkdtemp()
    video_file_name = next(
        iter(
            StorageService.filter_video_files(
                prefix=(
                    f'{self.media_file.gcs_root_folder}/'
                    f'{ConfigService.INPUT_FILENAME}'
                ),
                bucket_name=self.gcs_bucket_name,
                first_only=True,
            )
        ), None
    )
    input_video_file_path = StorageService.download_gcs_file(
        file_path=Utils.TriggerFile(video_file_name),
        output_dir=tmp_dir,
        bucket_name=self.gcs_bucket_name,
    )

    av_segments_file_path = StorageService.download_gcs_file(
        file_path=Utils.TriggerFile(
            str(
                pathlib.Path(
                    self.media_file.gcs_root_folder,
                    ConfigService.OUTPUT_PRESPLIT_DATA_FILE
                )
            )
        ),
        output_dir=tmp_dir,
        bucket_name=self.gcs_bucket_name,
    )
    av_segments = pd.read_json(
        av_segments_file_path,
        orient='records',
    )
    av_segments['av_segment_id'] = av_segments['av_segment_id'].astype(
        str
    ).str.replace(r'\.0', '')
    logging.info(
        'SPLITTING - Current segments: %r',
        av_segments.to_json(orient='records')
    )

    split_file_contents = StorageService.download_gcs_file(
        file_path=self.media_file,
        bucket_name=self.gcs_bucket_name,
        fetch_contents=True,
    )
    av_segment_markers = [
        AvSegmentSplitMarker(**segment_marker)
        for segment_marker in json.loads(split_file_contents.decode('utf-8'))
    ]
    av_segments = _finalise_split(av_segments, av_segment_markers)
    self.finalise_av_segments(
        tmp_dir,
        input_video_file_path,
        video_file_name,
        av_segments,
    )
    StorageService.delete_gcs_file(
        file_path=Utils.TriggerFile(
            str(
                pathlib.Path(
                    self.media_file.gcs_root_folder,
                    ConfigService.OUTPUT_PRESPLIT_DATA_FILE
                )
            )
        ),
        bucket_name=self.gcs_bucket_name,
    )
    logging.info('SPLITTING - Split operation completed successfully!')


def _finalise_split(
    av_segments: pd.DataFrame,
    av_segment_markers: Sequence[AvSegmentSplitMarker],
) -> pd.DataFrame:
  """Splits A/V segments at the specified markers and returns the resulting DF.

  Args:
    av_segments: The original A/V segments.
    av_segment_markers: The markers at which to split.

  Returns:
    The updated av_segments dataframe.
  """
  grouped_markers = {}
  for marker in av_segment_markers:
    if marker.av_segment_id not in grouped_markers:
      grouped_markers[marker.av_segment_id] = []
    grouped_markers[marker.av_segment_id].append(marker)

  av_segments['cut'] = False

  for av_segment_id, markers in grouped_markers.items():
    logging.info('SPLITTING - Segment: %r', av_segment_id)
    row_to_split = av_segments[av_segments['av_segment_id'] == av_segment_id]

    if row_to_split.empty:
      print(f'Warning: Segment {av_segment_id} not found. Skipping splits...')
      continue

    row_to_split = row_to_split.iloc[0].copy()

    current_segment_id = f'{av_segment_id}.1'
    current_start_s = row_to_split['start_s']

    av_segments.loc[av_segments['av_segment_id'] == av_segment_id,
                    'av_segment_id'] = current_segment_id

    for i, marker in enumerate(markers):
      marker_cut_time_s = marker.marker_cut_time_s + current_start_s

      new_row_end_s = row_to_split[
          'end_s'] if i == len(markers) - 1 else marker_cut_time_s
      new_row_duration_s = new_row_end_s - marker_cut_time_s

      av_segments.loc[av_segments['av_segment_id'] == current_segment_id,
                      'end_s'] = marker_cut_time_s
      av_segments.loc[av_segments['av_segment_id'] == current_segment_id,
                      'duration_s'] = marker_cut_time_s - current_start_s

      av_segments.loc[av_segments['av_segment_id'] == current_segment_id,
                      'cut'] = True

      new_row_id = f'{av_segment_id}.{i + 2}'

      new_row = pd.DataFrame({
          'av_segment_id': [new_row_id],
          'visual_segment_ids': [row_to_split['visual_segment_ids']],
          'audio_segment_ids': [row_to_split['audio_segment_ids']],
          'start_s': [marker_cut_time_s],
          'end_s': [new_row_end_s],
          'duration_s': [new_row_duration_s],
          'transcript': [row_to_split['transcript']],
          'labels': [row_to_split['labels']],
          'objects': [row_to_split['objects']],
          'logos': [row_to_split['logos']],
          'text': [row_to_split['text']],
          'cut': [True],
      })

      av_segments = pd.concat([av_segments, new_row], ignore_index=True)

      current_segment_id = new_row_id
      current_start_s = (
          marker_cut_time_s if i == len(markers) - 1 else current_start_s
      )

  av_segments['duration_s'] = av_segments['end_s'] - av_segments['start_s']
  return av_segments.sort_values(by='start_s').reset_index(drop=True)


def _cut_and_annotate_av_segment(
    row: pd.Series,
    video_file_path: str,
    cuts_path: str,
    vision_model: GenerativeModel,
    gcs_cut_path: str,
    bucket_name: str,
) -> Tuple[str, str]:
  """Cuts a single A/V segment with ffmpeg and annotates it with Gemini.

  Args:
    row: The A/V segment data as a row in a DataFrame.
    video_file_path: Path to the input video file.
    cuts_path: The local directory to store the A/V segment cuts.
    vision_model: The Gemini model to generate the A/V segment descriptions.
    gcs_cut_path: The path to store the A/V segment cut in GCS.
    bucket_name: The GCS bucket name to store the A/V segment cut.

  Returns:
    A tuple of the A/V segment description and keywords.
  """
  av_segment_id = row['av_segment_id']
  _, video_ext = os.path.splitext(video_file_path)
  full_cut_path = str(pathlib.Path(cuts_path, f'{av_segment_id}{video_ext}'))
  full_screenshot_path = str(
      pathlib.Path(
          cuts_path, f'{av_segment_id}{ConfigService.SEGMENT_SCREENSHOT_EXT}'
      )
  )
  cut = True
  try:
    cut = row['cut']
  except KeyError:
    pass

  if not cut:
    return row['description'], row['keywords']

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
      description=f'cut segment {av_segment_id} with ffmpeg',
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
      description=f'screenshot mid-segment {av_segment_id} with ffmpeg',
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
        response.candidates and response.candidates[0].content.parts
        and response.candidates[0].content.parts[0].text
    ):
      text = response.candidates[0].content.parts[0].text
      result = re.search(ConfigService.SEGMENT_ANNOTATIONS_PATTERN, text)
      logging.info(
          'ANNOTATION - Annotating segment %s: %s', av_segment_id, text
      )
      description = result.group(2)
      keywords = result.group(3)
    else:
      logging.warning(
          'ANNOTATION - Could not annotate segment %s!', av_segment_id
      )
  # Execution should continue regardless of the underlying exception
  # pylint: disable=broad-exception-caught
  except Exception:
    logging.exception(
        'Encountered error during segment %s annotation! Continuing...',
        av_segment_id,
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
    continued_shot = set(audio_segment_ids
                        ).intersection(current_audio_segment_ids)

    if (
        continued_shot or not current_visual_segments or (
            silent_short_shot and not current_audio_segment_ids
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
          str(index + 1),
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
      str(index + 1),
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
    av_segment_id_key='av_segment_id',
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
      **{
          'labels': labels,
          'objects': objects,
          'logos': logo,
          'text': text
      }
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
      temp[temp[confidence_key] >
           ConfigService.CONFIG_ANNOTATIONS_CONFIDENCE_THRESHOLD].sort_values(
               by=confidence_key,
               ascending=False,
           )[return_key].to_list()
  )

  return list(set(entities))
