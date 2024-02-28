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

"""ViGenAiR Combiner service.

This module provides functionality to combine individual cuts of the input video
based on user-specific rendering settings.
"""

import concurrent.futures
import dataclasses
import json
import logging
import os
import pathlib
import sys
import tempfile
from typing import Any, Dict, Sequence, Tuple

import vertexai
from vertexai.preview.generative_models import GenerativeModel

import config as ConfigService
import storage as StorageService
import utils as Utils


@dataclasses.dataclass(frozen=True)
class VideoVariantRenderSettings:
  """Represents the settings for a video variant.

  Attributes:
    duration_s: The duration of the video variant in seconds.
    generate_image_assets: Whether to generate image assets.
    generate_text_assets: Whether to generate text assets.
    render_all_formats: Whether to render all formats (square and vertical)
      alongside the default horizontal format.
    use_music_overlay: Whether to use the music overlay feature, where a
      contiguous section of the input's background music will be used for the
      video variant instead of the individual segments' background music.
  """

  duration_s: int
  generate_image_assets: bool = False
  generate_text_assets: bool = False
  render_all_formats: bool = False
  use_music_overlay: bool = False

  def __str__(self):
    return (
        f'VideoVariantRenderSettings(duration_s={self.duration_s}, '
        f'generate_image_assets={self.generate_image_assets}, '
        f'generate_text_assets={self.generate_text_assets}, '
        f'render_all_formats={self.render_all_formats}, '
        f'use_music_overlay={self.use_music_overlay})'
    )


@dataclasses.dataclass(frozen=True)
class VideoVariantSegment:
  """Represents a segment of a video variant.

  Attributes:
    av_segment_id: The id of the A/V segment.
    start_s: The start time of the A/V segment in seconds.
    end_s: The end time of the A/V segment in seconds.
  """

  av_segment_id: int
  start_s: float
  end_s: float

  def __str__(self):
    return (
        f'VideoVariantSegment(av_segment_id={self.av_segment_id}, '
        f'start_s={self.start_s}, '
        f'end_s={self.end_s})'
    )


@dataclasses.dataclass(frozen=True)
class VideoVariant:
  """Represents a video variant.

  Attributes:
    variant_id: The id of the variant.
    av_segments: The A/V segments of the variant, mapped by segment id.
    title: The title of the variant.
    description: The description of the variant.
    score: The score of the variant.
    score_reasoning: The reasoning behind the score of the variant.
    render_settings: The render settings of the variant.
  """

  variant_id: int
  av_segments: Dict[str, VideoVariantSegment]
  title: str
  description: str
  score: float
  score_reasoning: str
  render_settings: VideoVariantRenderSettings

  def __str__(self):
    return (
        f'VideoVariant(variant_id={self.variant_id}, '
        f'av_segments={self.av_segments}, '
        f'title={self.title}, '
        f'description={self.description}, '
        f'score={self.score}, '
        f'score_reasoning={self.score_reasoning}, '
        f'render_settings={self.render_settings})'
    )


class Combiner:
  """Encapsulates all the combination logic."""

  def __init__(self, gcs_bucket_name: str, render_file: Utils.TriggerFile):
    """Initialiser.

    Args:
      gcs_bucket_name: The GCS bucket to read from and store files in.
      render_file: Path to the input rendering file, which is in a
        `<timestamp>-combos` subdirectory of the root video folder (see
        `extractor.Extractor` for more information on root folder naming).
    """
    self.gcs_bucket_name = gcs_bucket_name
    self.render_file = render_file
    vertexai.init(
        project=ConfigService.GCP_PROJECT_ID,
        location=ConfigService.GCP_LOCATION,
    )
    self.text_model = GenerativeModel(ConfigService.CONFIG_TEXT_MODEL)

  def render(self):
    """Renders videos based on the input rendering settings."""
    logging.info('COMBINER - Starting rendering...')
    tmp_dir = tempfile.mkdtemp()
    root_video_folder = str(
        pathlib.Path(self.render_file.full_gcs_path).parents[1]
    )
    video_file_name = StorageService.filter_video_files(
        prefix=f'{root_video_folder}/{ConfigService.INPUT_FILENAME}',
        bucket_name=self.gcs_bucket_name,
        first_only=True,
    )[0]
    logging.info('RENDERING - Video file name: %s', video_file_name)
    video_file_path = StorageService.download_gcs_file(
        file_path=Utils.TriggerFile(video_file_name),
        output_dir=tmp_dir,
        bucket_name=self.gcs_bucket_name,
    )
    logging.info('RENDERING - Video file path: %s', video_file_path)
    speech_track_path = StorageService.download_gcs_file(
        file_path=Utils.TriggerFile(
            str(
                pathlib.Path(
                    root_video_folder, ConfigService.OUTPUT_SPEECH_FILE
                )
            )
        ),
        output_dir=tmp_dir,
        bucket_name=self.gcs_bucket_name,
    )
    logging.info('RENDERING - Speech track path: %s', speech_track_path)
    music_track_path = StorageService.download_gcs_file(
        file_path=Utils.TriggerFile(
            str(
                pathlib.Path(root_video_folder, ConfigService.OUTPUT_MUSIC_FILE)
            )
        ),
        output_dir=tmp_dir,
        bucket_name=self.gcs_bucket_name,
    )
    logging.info('RENDERING - Music track path: %s', music_track_path)
    render_file_contents = StorageService.download_gcs_file(
        file_path=self.render_file,
        bucket_name=self.gcs_bucket_name,
        fetch_contents=True,
    )
    video_variants = list(
        map(
            _video_variant_mapper,
            enumerate(json.loads(render_file_contents.decode('utf-8'))),
        )
    )
    video_variants_dict = {
        variant.variant_id: variant for variant in video_variants
    }
    logging.info('RENDERING - Rendering video variants: %r...', video_variants)
    combos_dir = tempfile.mkdtemp()
    rendered_combos = {}
    with concurrent.futures.ThreadPoolExecutor() as thread_executor:
      futures_dict = {
          thread_executor.submit(
              _render_video_variant,
              output_dir=combos_dir,
              gcs_folder_path=self.render_file.gcs_folder,
              gcs_bucket_name=self.gcs_bucket_name,
              video_file_path=video_file_path,
              speech_track_path=speech_track_path,
              music_track_path=music_track_path,
              video_variant=video_variant,
          ): video_variant.variant_id
          for video_variant in video_variants
      }
      for response in concurrent.futures.as_completed(futures_dict):
        variant_id = futures_dict[response]
        rendered_variant_paths = response.result()

        variant = video_variants_dict[variant_id]
        combo = vars(variant)
        combo.pop('render_settings', None)
        combo['av_segments'] = {
            key: vars(value) for key, value in variant.av_segments.items()
        }
        combo['variants'] = rendered_variant_paths
        rendered_combos[str(variant_id)] = combo

    logging.info(
        'RENDERING - Rendered all variants as: %r',
        rendered_combos,
    )
    combos_json_path = os.path.join(
        combos_dir, ConfigService.OUTPUT_COMBINATIONS_FILE
    )
    with open(combos_json_path, 'w') as f:
      json.dump(rendered_combos, f, indent=2)

    StorageService.upload_gcs_dir(
        source_directory=combos_dir,
        bucket_name=self.gcs_bucket_name,
        target_dir=self.render_file.gcs_folder,
    )
    logging.info('COMBINER - Rendering completed successfully!')


def _video_variant_mapper(index_variant_dict_tuple: Tuple[int, Dict[str, Any]]):
  index, variant_dict = index_variant_dict_tuple
  segment_dicts = variant_dict.pop('av_segments', None)
  render_settings_dict = variant_dict.pop('render_settings', None)
  segments = {
      str(segment_dict['av_segment_id']): VideoVariantSegment(**segment_dict)
      for segment_dict in segment_dicts
  }
  video_variant_settings = VideoVariantRenderSettings(**render_settings_dict)

  return VideoVariant(
      variant_id=index,
      av_segments=segments,
      render_settings=video_variant_settings,
      **variant_dict,
  )


def _render_video_variant(
    output_dir: str,
    gcs_folder_path: str,
    gcs_bucket_name: str,
    video_file_path: str,
    speech_track_path: str,
    music_track_path: str,
    video_variant: VideoVariant,
) -> Dict[str, str]:
  """Renders a video variant in all formats.

  Args:
    output_dir: The output directory to use.
    gcs_folder_path: The GCS folder path to use.
    gcs_bucket_name: The GCS bucket name to upload to.
    video_file_path: The path to the input video file.
    speech_track_path: The path to the video's speech track.
    music_track_path: The path to the video's music track.
    video_variant: The video variant to be rendered.

  Returns:
    The rendered paths keyed by the format type.
  """
  logging.info('THREADING - Rendering video variant: %s', video_variant)
  _, video_ext = os.path.splitext(video_file_path)
  shot_groups = _group_consecutive_segments(
      list(video_variant.av_segments.keys())
  )
  shot_timestamps = list(
      map(
          lambda group: (
              video_variant.av_segments[group[0]].start_s,
              video_variant.av_segments[group[1]].end_s,
          ),
          shot_groups,
      )
  )
  (
      video_select_filter,
      full_audio_select_filter,
      merged_audio_select_filter,
  ) = _build_ffmpeg_filters(shot_timestamps)

  ffmpeg_cmds = [
      'ffmpeg',
      '-i',
      video_file_path,
  ]
  if video_variant.render_settings.use_music_overlay:
    ffmpeg_cmds.extend([
        '-i',
        speech_track_path,
        '-i',
        music_track_path,
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-map',
        '2:a:0',
        '-vf',
        video_select_filter,
        '-filter_complex',
        merged_audio_select_filter,
    ])
  else:
    ffmpeg_cmds.extend([
        '-vf',
        video_select_filter,
        '-af',
        full_audio_select_filter,
    ])

  horizontal_combo_name = f'combo_{video_variant.variant_id}_h{video_ext}'
  horizontal_combo_path = str(pathlib.Path(output_dir, horizontal_combo_name))
  ffmpeg_cmds.append(horizontal_combo_path)

  Utils.execute_subprocess_commands(
      cmds=' '.join(ffmpeg_cmds),
      shell=True,
      description=(
          f'render horizontal variant with id {video_variant.variant_id} using'
          ' ffmpeg'
      ),
  )
  rendered_paths = {'horizontal': horizontal_combo_name}

  if video_variant.render_settings.render_all_formats:
    formats_to_render = {
        'vertical': ConfigService.FFMPEG_VERTICAL_BLUR_FILTER,
        'square': ConfigService.FFMPEG_SQUARE_BLUR_FILTER,
    }
    with concurrent.futures.ThreadPoolExecutor() as thread_executor:
      futures_dict = {
          thread_executor.submit(
              _render_format,
              input_video_path=horizontal_combo_path,
              output_path=output_dir,
              variant_id=video_variant.variant_id,
              format_type=format_type,
              video_filter=video_filter,
          ): format_type
          for format_type, video_filter in formats_to_render.items()
      }
      for response in concurrent.futures.as_completed(futures_dict):
        format_type = futures_dict[response]
        rendered_paths[format_type] = response.result()

  return {
      format_type: (
          f'gs://{pathlib.Path(gcs_bucket_name, gcs_folder_path, rendered_path)}'
      )
      for format_type, rendered_path in rendered_paths.items()
  }


def _render_format(
    input_video_path: str,
    output_path: str,
    variant_id: int,
    format_type: str,
    video_filter: str,
) -> str:
  """Renders a video variant in a specific format.

  Args:
    input_video_path: The path to the input video to render.
    output_path: The path to output to.
    variant_id: The id of the variant to render.
    format_type: The type of the output format (horizontal, vertical, square).
    video_filter: The ffmpeg video filter to use.

  Returns:
    The rendered video's name.
  """
  logging.info(
      'THREADING - Rendering variant %s format: %s', variant_id, format_type
  )
  _, video_ext = os.path.splitext(input_video_path)
  format_name = f'combo_{variant_id}_{format_type[0]}{video_ext}'
  Utils.execute_subprocess_commands(
      cmds=' '.join([
          'ffmpeg',
          '-y',
          '-i',
          input_video_path,
          '-vf',
          video_filter,
          str(pathlib.Path(output_path, format_name)),
      ]),
      shell=True,
      description=(
          f'render {format_type} variant with id {variant_id} using ffmpeg'
      ),
  )
  return format_name


def _group_consecutive_segments(
    av_segment_ids: Sequence[str],
) -> Sequence[Tuple[str, str]]:
  """Groups consecutive segments together.

  Consecutive A/V segments, such as `1, 2, 3`, will be grouped as a tuple of the
  start and end A/V segment ids, such as `(1, 3)`.

  Args:
    av_segment_ids: The A/V segments ids to be grouped.

  Returns:
    A sequence of tuples, where each tuple contains the start and end A/V
    segment ids of a group.
  """
  result = []
  i = 0
  while i < len(av_segment_ids):
    j = i
    while (
        j < len(av_segment_ids) - 1
        and int(av_segment_ids[j + 1]) == int(av_segment_ids[j]) + 1
    ):
      j += 1
    result.append((av_segment_ids[i], av_segment_ids[j]))
    i = j + 1
  return result


def _build_ffmpeg_filters(
    shot_timestamps: Sequence[Tuple[float, float]]
) -> Tuple[str, str, str]:
  """Builds the ffmpeg filters.

  Args:
    shot_timestamps: A sequence of tuples, where each tuple contains the start
      and end timestamps of a shot.

  Returns:
    A tuple containing the video, full audio and merged audio ffmpeg filters.
  """
  ffmpeg_select_filter = []
  idx = 0
  duration = 0
  all_start = sys.maxsize
  for start, end in shot_timestamps:
    if idx > 0:
      ffmpeg_select_filter.append('+')
    ffmpeg_select_filter.append(f'between(t,{start},{end})')
    duration += end - start
    all_start = min(all_start, start)
    idx += 1

  ffmpeg_select_filter.append("'")
  video_select_filter = (
      ["\"select='"] + ffmpeg_select_filter + [', setpts=N/FRAME_RATE/TB"']
  )
  full_audio_select_filter = (
      ["\"aselect='"] + ffmpeg_select_filter + [', asetpts=N/SR/TB"']
  )
  vocals_select_filter = (
      ["[1:a:0]aselect='"]
      + ffmpeg_select_filter
      + [', asetpts=N/SR/TB[speech]']
  )
  music_select_filter = [
      f"[2:a:0]aselect='between(t,{all_start},{all_start+duration})',"
      ' asetpts=N/SR/TB[music]'
  ]
  video_select_filter = ''.join(video_select_filter)
  full_audio_select_filter = ''.join(full_audio_select_filter)
  vocals_select_filter = ''.join(vocals_select_filter)
  music_select_filter = ''.join(music_select_filter)
  merged_audio_select_filter = (
      f'"{vocals_select_filter};{music_select_filter};'
      '[speech][music]amerge=inputs=2"'
  )

  return (
      video_select_filter,
      full_audio_select_filter,
      merged_audio_select_filter,
  )
