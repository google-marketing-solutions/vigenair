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

"""Vigenair Combiner service.

This module provides functionality to combine individual cuts of the input video
based on user-specific rendering settings.
"""

import dataclasses
import enum
import gc
import json
import logging
import os
import pathlib
import re
import subprocess
import sys
import tempfile
from typing import Any, Dict, Optional, Sequence, Tuple, Union
from urllib import parse

import config as ConfigService
import pandas as pd
import storage as StorageService
import utils as Utils
import vertexai
from vertexai.generative_models import GenerativeModel, Part


@enum.unique
class VideoFormat(enum.Enum):
    """Enum for video formats."""
    SQUARE = ('1:1', 'square')
    VERTICAL = ('9:16', 'vertical')
    HORIZONTAL = ('16:9', 'horizontal')
    THREE_FOUR = ('3:4', '3_4')
    FOUR_THREE = ('4:3', '4_3')

    def __init__(self, aspect_ratio_str, type_name):
        self.aspect_ratio_str = aspect_ratio_str
        self.type_name = type_name

    @classmethod
    def from_aspect_ratio(cls, aspect_ratio_str: str) -> 'VideoFormat':
        for member in cls:
            if member.aspect_ratio_str == aspect_ratio_str:
                return member
        raise ValueError(f'Unknown aspect ratio: {aspect_ratio_str}')

    @property
    def is_horizontal(self) -> bool:
        return self == VideoFormat.HORIZONTAL


@dataclasses.dataclass(init=False)
class VideoVariantRenderSettings:
  """Represents the settings for a video variant.

  Attributes:
    generate_image_assets: Whether to generate image assets.
    generate_text_assets: Whether to generate text assets.
    formats: Which formats to render.
    use_music_overlay: Whether to use the music overlay feature.
    use_continuous_audio: Whether to use a contiguous section of the input's
      audio.
    fade_out: Whether to fade out the end of the video variant.
    overlay_type: How to overlay music / audio for the variant.
  """

  generate_image_assets: bool = False
  generate_text_assets: bool = False
  formats: Sequence[VideoFormat] = dataclasses.field(default_factory=list)
  use_music_overlay: bool = False
  use_continuous_audio: bool = False
  fade_out: bool = False
  overlay_type: Utils.RenderOverlayType = None

  def __init__(self, **kwargs):
    field_names = set([f.name for f in dataclasses.fields(self)])
    for k, v in kwargs.items():
      if k == 'formats' and v is not None:
        parsed_formats = []
        if isinstance(v, Sequence):
          for fmt_str in v:
            try:
              parsed_formats.append(VideoFormat.from_aspect_ratio(fmt_str))
            except ValueError:
              logging.warning(
                  'Invalid format aspect ratio "%s" in render_settings and '
                  'will be skipped.',
                  fmt_str
              )
        setattr(self, k, parsed_formats)
      elif k in field_names:
        setattr(self, k, v)

    if getattr(self, 'formats', None) is None:
        self.formats = []

  def __str__(self):
    return (
        'VideoVariantRenderSettings('
        f'generate_image_assets={self.generate_image_assets}, '
        f'generate_text_assets={self.generate_text_assets}, '
        f'formats={[f.aspect_ratio_str for f in self.formats]}, '
        f'use_music_overlay={self.use_music_overlay}, '
        f'use_continuous_audio={self.use_continuous_audio}, '
        f'fade_out={self.fade_out}, '
        f'overlay_type={self.overlay_type})'
    )


@dataclasses.dataclass(init=False)
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

  def __init__(self, **kwargs):
    field_names = set([f.name for f in dataclasses.fields(self)])
    for k, v in kwargs.items():
      if k in field_names:
        setattr(self, k, v)

  def __str__(self):
    return (
        f'VideoVariantSegment(av_segment_id={self.av_segment_id}, '
        f'start_s={self.start_s}, '
        f'end_s={self.end_s})'
    )


@dataclasses.dataclass(init=False)
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

  def __init__(self, **kwargs):
    field_names = set([f.name for f in dataclasses.fields(self)])
    for k, v in kwargs.items():
      if k in field_names:
        setattr(self, k, v)

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

  CROP_FILENAME_TEMPLATE = 'crop_{format_type}{video_ext}'

  def __init__(self, gcs_bucket_name: str, render_file: Utils.TriggerFile):
    """Initialiser.

    Args:
      gcs_bucket_name: The GCS bucket to read from and store files in.
      render_file: Path to the input rendering file.
    """
    self.gcs_bucket_name = gcs_bucket_name
    self.render_file = render_file
    vertexai.init(
        project=ConfigService.GCP_PROJECT_ID,
        location=ConfigService.GCP_LOCATION,
    )
    self.text_model = GenerativeModel(ConfigService.CONFIG_TEXT_MODEL)
    self.vision_model = GenerativeModel(ConfigService.CONFIG_VISION_MODEL)

  def check_finalise_render(self, variants_count: int):
    """Checks whether all variants have been rendered to trigger `finalise`."""
    rendered_count = len(
        StorageService.filter_files(
            bucket_name=self.gcs_bucket_name,
            prefix=f'{self.render_file.gcs_folder}/',
            suffix=ConfigService.OUTPUT_COMBINATIONS_FILE,
        )
    )
    if rendered_count == variants_count:
      finalise_file_path = (
          f'{variants_count}-{variants_count}_'
          f'{ConfigService.INPUT_RENDERING_FINALISE_FILE}'
      )
      with open(finalise_file_path, 'w', encoding='utf8'):
        pass

      StorageService.upload_gcs_file(
          file_path=finalise_file_path,
          bucket_name=self.gcs_bucket_name,
          destination_file_name=str(
              pathlib.Path(self.render_file.gcs_folder, finalise_file_path)
          ),
      )

  def finalise_render(self):
    """Combines all generated <id>_combos.json into a single one."""
    logging.info('COMBINER - Finalising rendering...')
    tmp_dir = tempfile.mkdtemp()
    render_output_dicts = [
        json.loads(json_file_contents.decode('utf-8'))
        for json_file_contents in StorageService.filter_files(
            bucket_name=self.gcs_bucket_name,
            prefix=f'{self.render_file.gcs_folder}/',
            suffix=ConfigService.OUTPUT_COMBINATIONS_FILE,
            fetch_content=True,
        )
    ]
    output = {}
    for render_output_dict in render_output_dicts:
      for k, v in render_output_dict.items():
        output[k] = v

    combos_json_path = os.path.join(
        tmp_dir,
        ConfigService.OUTPUT_COMBINATIONS_FILE,
    )
    with open(combos_json_path, 'w', encoding='utf8') as f:
      json.dump(output, f, indent=2)

    StorageService.upload_gcs_file(
        file_path=combos_json_path,
        bucket_name=self.gcs_bucket_name,
        destination_file_name=str(
            pathlib.Path(
                self.render_file.gcs_folder,
                ConfigService.OUTPUT_COMBINATIONS_FILE,
            )
        ),
    )
    gc.collect()
    logging.info('COMBINER - Rendering completed successfully!')

  def render(self):
    """Renders a single video based on the input rendering settings."""
    variant_id = self.render_file.file_name.split('_')[0]
    logging.info('COMBINER - Starting rendering variant %s...', variant_id)
    tmp_dir = tempfile.mkdtemp()
    root_video_folder = self.render_file.gcs_root_folder
    video_file_name = next(
        iter(
            StorageService.filter_video_files(
                prefix=f'{root_video_folder}/{ConfigService.INPUT_FILENAME}',
                bucket_name=self.gcs_bucket_name,
                first_only=True,
            )
        ), None
    )
    logging.info('RENDERING - Video file name: %s', video_file_name)
    video_file_path = StorageService.download_gcs_file(
        file_path=Utils.TriggerFile(video_file_name),
        output_dir=tmp_dir,
        bucket_name=self.gcs_bucket_name,
    )
    logging.info('RENDERING - Video file path: %s', video_file_path)
    _update_or_create_video_metadata(
        video_file_path=video_file_path,
        root_video_folder=root_video_folder,
        gcs_bucket_name=self.gcs_bucket_name,
        tmp_dir=tmp_dir,
    )
    _, video_ext = os.path.splitext(video_file_path)
    has_audio = StorageService.download_gcs_file(
        file_path=Utils.TriggerFile(
            str(
                pathlib.Path(
                    root_video_folder, f'{ConfigService.INPUT_FILENAME}.wav'
                )
            )
        ),
        output_dir=tmp_dir,
        bucket_name=self.gcs_bucket_name,
    ) is not None
    logging.info('RENDERING - Video has audio track? %s', has_audio)
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
                pathlib.Path(
                    root_video_folder, ConfigService.OUTPUT_MUSIC_FILE
                )
            )
        ),
        output_dir=tmp_dir,
        bucket_name=self.gcs_bucket_name,
    )
    logging.info('RENDERING - Music track path: %s', music_track_path)
    video_language = StorageService.download_gcs_file(
        file_path=Utils.TriggerFile(
            str(
                pathlib.
                Path(root_video_folder, ConfigService.OUTPUT_LANGUAGE_FILE)
            )
        ),
        output_dir=tmp_dir,
        bucket_name=self.gcs_bucket_name,
        fetch_contents=True,
    ) or ConfigService.DEFAULT_VIDEO_LANGUAGE
    logging.info('RENDERING - Video language: %s', video_language)

    # Download the pre-cropped *video* files
    local_crop_video_file_paths = {}
    for vf_member in VideoFormat:
      if vf_member.is_horizontal:
        continue

      crop_video_file_name = Combiner.CROP_FILENAME_TEMPLATE.format(
          format_type=vf_member.type_name, video_ext=video_ext
      )
      gcs_path = str(
          pathlib.Path(self.render_file.gcs_folder, crop_video_file_name))
      local_path = StorageService.download_gcs_file(
          file_path=Utils.TriggerFile(gcs_path),
          output_dir=tmp_dir,
          bucket_name=self.gcs_bucket_name,
      )
      if local_path:
          local_crop_video_file_paths[vf_member] = local_path

    render_file_contents = StorageService.download_gcs_file(
        file_path=self.render_file,
        bucket_name=self.gcs_bucket_name,
        fetch_contents=True,
    )
    video_variant = list(
        map(
            _video_variant_mapper,
            enumerate(json.loads(render_file_contents.decode('utf-8'))),
        )
    )[0]
    combos_dir = tempfile.mkdtemp()
    rendered_combos = {}
    rendered_variant_paths = _render_video_variant(
        output_dir=combos_dir,
        gcs_folder_path=self.render_file.gcs_folder,
        gcs_bucket_name=self.gcs_bucket_name,
        video_file_path=video_file_path,
        crop_video_file_paths=local_crop_video_file_paths,
        has_audio=has_audio,
        speech_track_path=speech_track_path,
        music_track_path=music_track_path,
        video_variant=video_variant,
        vision_model=self.vision_model,
        video_language=video_language,
    )
    combo = dataclasses.asdict(video_variant)
    if 'render_settings' in combo and 'formats' in combo['render_settings']:
        combo['render_settings']['formats'] = [
            f.aspect_ratio_str for f in combo['render_settings']['formats']
        ]

    combo.update(rendered_variant_paths)
    combo['av_segments'] = {
        f'_{segment_id}': segment
        for segment_id, segment in combo['av_segments'].items()
    }
    rendered_combos[f'_{video_variant.variant_id}'] = combo
    logging.info(
        'RENDERING - Rendered variant as: %r',
        rendered_combos,
    )
    combos_json_path = os.path.join(
        combos_dir,
        f'{variant_id}_{ConfigService.OUTPUT_COMBINATIONS_FILE}',
    )
    with open(combos_json_path, 'w', encoding='utf8') as f:
      json.dump(rendered_combos, f, indent=2)

    StorageService.upload_gcs_dir(
        source_directory=combos_dir,
        bucket_name=self.gcs_bucket_name,
        target_dir=self.render_file.gcs_folder,
    )

    self.check_finalise_render(variants_count=int(variant_id.split('-')[1]))
    gc.collect()
    logging.info(
        'COMBINER - Rendering variant %s completed successfully!',
        variant_id,
    )

  def initial_render(self):
    """Creates cropped video files for all required formats."""
    logging.info('COMBINER - Starting initial render (cropping)...')
    tmp_dir = tempfile.mkdtemp()
    root_video_folder = self.render_file.gcs_root_folder
    video_file_name = next(
        iter(
            StorageService.filter_video_files(
                prefix=f'{root_video_folder}/{ConfigService.INPUT_FILENAME}',
                bucket_name=self.gcs_bucket_name,
                first_only=True,
            )
        ), None
    )
    logging.info('RENDERING - Video file name: %s', video_file_name)
    video_file_path = StorageService.download_gcs_file(
        file_path=Utils.TriggerFile(video_file_name),
        output_dir=tmp_dir,
        bucket_name=self.gcs_bucket_name,
    )
    logging.info('RENDERING - Video file path: %s', video_file_path)
    _update_or_create_video_metadata(
        video_file_path=video_file_path,
        root_video_folder=root_video_folder,
        gcs_bucket_name=self.gcs_bucket_name,
        tmp_dir=tmp_dir,
    )

    crop_cmd_file_paths = {}
    for vf_member in VideoFormat:
      if vf_member.is_horizontal:
        continue
      crop_file_name = f'crop_{vf_member.type_name}.txt'
      crop_path = StorageService.download_gcs_file(
          file_path=Utils.TriggerFile(
              str(pathlib.Path(self.render_file.gcs_folder, crop_file_name))
          ),
          output_dir=tmp_dir,
          bucket_name=self.gcs_bucket_name,
      )
      if crop_path:
        crop_cmd_file_paths[vf_member] = crop_path

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
    logging.info(
        'RENDERING - Cropping for %d video variants: %r',
        len(video_variants),
        video_variants,
    )
    combos_dir = tempfile.mkdtemp()
    _create_cropped_videos(
        video_variants=video_variants,
        video_file_path=video_file_path,
        crop_cmd_file_paths=crop_cmd_file_paths,
        output_dir=combos_dir,
    )
    StorageService.upload_gcs_dir(
        source_directory=combos_dir,
        bucket_name=self.gcs_bucket_name,
        target_dir=self.render_file.gcs_folder,
    )
    for video_variant in video_variants:
      variant_destination_file_path = (
          f'{video_variant.variant_id}-{len(video_variants)}'
          f'_{ConfigService.INPUT_RENDERING_FILE}'
      )
      variant_dict = dataclasses.asdict(video_variant)
      if ('render_settings' in variant_dict and
          'formats' in variant_dict['render_settings']):
          variant_dict['render_settings']['formats'] = [
              f.aspect_ratio_str
              for f in variant_dict['render_settings']['formats']
          ]
      variant_dict['av_segments'] = list(variant_dict['av_segments'].values())

      variant_json_path = os.path.join(
          combos_dir,
          variant_destination_file_path,
      )
      with open(variant_json_path, 'w', encoding='utf8') as f:
        json.dump([variant_dict], f, indent=2)

      StorageService.upload_gcs_file(
          file_path=variant_json_path,
          bucket_name=self.gcs_bucket_name,
          destination_file_name=str(
              pathlib.Path(
                  self.render_file.gcs_folder,
                  variant_destination_file_path,
              )
          ),
      )
    gc.collect()
    logging.info('COMBINER - Initial render (cropping) completed successfully!')


def _video_variant_mapper(index_variant_dict_tuple: Tuple[int, Dict[str, Any]]):
  index, variant_dict = index_variant_dict_tuple
  segment_dicts = variant_dict.pop('av_segments', None)
  render_settings_dict = variant_dict.pop('render_settings', None)
  segments = {
      str(segment_dict['av_segment_id']): VideoVariantSegment(**segment_dict)
      for segment_dict in segment_dicts
  }
  video_variant_settings = VideoVariantRenderSettings(**render_settings_dict)
  variant_id = variant_dict.pop('variant_id', index)

  return VideoVariant(
      variant_id=variant_id,
      av_segments=segments,
      render_settings=video_variant_settings,
      **variant_dict,
  )


def _create_cropped_videos(
    video_variants: Sequence[VideoVariant],
    video_file_path: str,
    crop_cmd_file_paths: Dict[VideoFormat, str],
    output_dir: str,
) -> Dict[VideoFormat, str]:
  """Creates cropped videos for the given video variants."""
  cropped_video_paths = {}
  _, video_ext = os.path.splitext(video_file_path)

  for vf_member, crop_cmd_file_path in crop_cmd_file_paths.items():
    needs_format = any(
        vf_member in variant.render_settings.formats
        for variant in video_variants
    )
    if needs_format:
      cropped_video_path = _create_cropped_video(
          video_file_path=video_file_path,
          crop_cmd_file_path=crop_cmd_file_path,
          output_dir=output_dir,
          format_type=vf_member.type_name,
          video_ext=video_ext,
      )
      if cropped_video_path:
        cropped_video_paths[vf_member] = cropped_video_path
  return cropped_video_paths


def _create_cropped_video(
    video_file_path: str,
    crop_cmd_file_path: Optional[str],
    output_dir: str,
    format_type: str,
    video_ext: str,
) -> Optional[str]:
  """Creates a single cropped video file."""
  if not crop_cmd_file_path:
    return None

  with open(crop_cmd_file_path, mode='r', encoding='utf8') as f:
    first_line = f.readline().strip()
  matches = re.search(r'crop w (.*), crop h (.*);', first_line)

  w = matches.group(1) if matches else None
  h = matches.group(2) if matches else None

  if w and h:
    file_name = Combiner.CROP_FILENAME_TEMPLATE.format(
        format_type=format_type, video_ext=video_ext
    )
    cropped_video_path = str(pathlib.Path(output_dir, file_name))
    Utils.execute_subprocess_commands(
        cmds=[
            'ffmpeg',
            '-i',
            video_file_path,
            '-filter_complex',
            f'[0:v]sendcmd=f={crop_cmd_file_path},crop[cropped];'
            f'[cropped]crop={w}:{h}',
            cropped_video_path,
        ],
        description=(f'render full {format_type} format using ffmpeg'),
    )
    return cropped_video_path
  else:
    logging.warning('Could not parse crop dimensions from %s',
                    crop_cmd_file_path)
    return None


def _render_video_variant(
    output_dir: str,
    gcs_folder_path: str,
    gcs_bucket_name: str,
    video_file_path: str,
    crop_video_file_paths: Dict[VideoFormat, str],
    has_audio: bool,
    speech_track_path: Optional[str],
    music_track_path: Optional[str],
    video_variant: VideoVariant,
    vision_model: GenerativeModel,
    video_language: str,
) -> Dict[str, Any]:
  """Renders a video variant in all formats."""
  logging.info('RENDERING - Rendering video variant: %s', video_variant)
  _, video_ext = os.path.splitext(video_file_path)
  # ... (rest of the function is the same as before)
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
  video_duration = Utils.get_media_duration(video_file_path)
  (
      full_av_select_filter,
      music_overlay_select_filter,
      continuous_audio_select_filter,
  ) = _build_ffmpeg_filters(
      shot_timestamps,
      has_audio,
      video_variant.render_settings,
      video_duration,
  )

  ffmpeg_cmds = _get_variant_ffmpeg_commands(
      video_file_path=video_file_path,
      speech_track_path=speech_track_path,
      music_track_path=music_track_path,
      has_audio=has_audio,
      music_overlay=video_variant.render_settings.use_music_overlay,
      continuous_audio=video_variant.render_settings.use_continuous_audio,
      full_av_select_filter=full_av_select_filter,
      music_overlay_select_filter=music_overlay_select_filter,
      continuous_audio_select_filter=continuous_audio_select_filter,
  )

  horizontal_combo_name = f'combo_{video_variant.variant_id}_h{video_ext}'
  horizontal_combo_path = str(pathlib.Path(output_dir, horizontal_combo_name))
  ffmpeg_cmds.append(horizontal_combo_path)

  Utils.execute_subprocess_commands(
      cmds=ffmpeg_cmds,
      description=(
          'render horizontal variant with id '
          f'{video_variant.variant_id} using ffmpeg'
      ),
  )

  rendered_paths = {
      VideoFormat.HORIZONTAL: {'path': horizontal_combo_name}
  }
  if video_variant.render_settings.generate_image_assets:
    StorageService.upload_gcs_dir(
        source_directory=output_dir,
        bucket_name=gcs_bucket_name,
        target_dir=gcs_folder_path,
    )
    assets = _generate_image_assets(
        vision_model=vision_model,
        video_file_path=horizontal_combo_path,
        gcs_bucket_name=gcs_bucket_name,
        gcs_folder_path=gcs_folder_path,
        output_path=output_dir,
        variant_id=video_variant.variant_id,
        format_type=VideoFormat.HORIZONTAL.type_name,
    )
    if assets:
      rendered_paths[VideoFormat.HORIZONTAL]['images'] = assets

  formats_to_render = {}
  for vf_member in video_variant.render_settings.formats:
    if vf_member.is_horizontal:
      continue

    blur_filter = ConfigService.FFMPEG_SQUARE_BLUR_FILTER
    if vf_member == VideoFormat.VERTICAL:
      blur_filter = ConfigService.FFMPEG_VERTICAL_BLUR_FILTER

    formats_to_render[vf_member] = {
        'blur_filter': blur_filter,
        'crop_file_path': crop_video_file_paths.get(vf_member)
    }

  for vf_member, format_instructions in formats_to_render.items():
    format_ffmpeg_cmds = None
    if format_instructions['crop_file_path']:
      format_ffmpeg_cmds = _get_variant_ffmpeg_commands(
          video_file_path=format_instructions['crop_file_path'],
          speech_track_path=speech_track_path,
          music_track_path=music_track_path,
          has_audio=has_audio,
          music_overlay=video_variant.render_settings.use_music_overlay,
          continuous_audio=video_variant.render_settings.use_continuous_audio,
          full_av_select_filter=full_av_select_filter,
          music_overlay_select_filter=music_overlay_select_filter,
          continuous_audio_select_filter=continuous_audio_select_filter,
      )
    rendered_paths[vf_member] = _render_format(
        vision_model=vision_model,
        input_video_path=horizontal_combo_path,
        output_path=output_dir,
        gcs_bucket_name=gcs_bucket_name,
        gcs_folder_path=gcs_folder_path,
        variant_id=video_variant.variant_id,
        video_format=vf_member,
        generate_image_assets=(
            video_variant.render_settings.generate_image_assets
        ),
        video_filter=format_instructions['blur_filter'],
        ffmpeg_cmds=format_ffmpeg_cmds,
    )

  StorageService.upload_gcs_dir(
      source_directory=output_dir,
      bucket_name=gcs_bucket_name,
      target_dir=gcs_folder_path,
  )
  result = {'variants': {}}
  if video_variant.render_settings.generate_text_assets:
    text_assets = _generate_text_assets(
        vision_model=vision_model,
        gcs_video_path=(
            f'gs://{gcs_bucket_name}/{gcs_folder_path}/'
            f'{horizontal_combo_name}'
        ),
        video_language=video_language,
        video_variant=video_variant,
    )
    if text_assets:
      result['texts'] = text_assets

  for vf_member, rendered_path in rendered_paths.items():
    format_str = vf_member.aspect_ratio_str
    result['variants'][format_str] = (
        f'{ConfigService.GCS_BASE_URL}/{gcs_bucket_name}/'
        f'{parse.quote(gcs_folder_path)}/{rendered_path["path"]}'
    )
    if 'images' in rendered_path:
      if 'images' not in result:
        result['images'] = {}
      result['images'][format_str] = rendered_path['images']

  return result


def _get_variant_ffmpeg_commands(
    video_file_path: str,
    speech_track_path: Optional[str],
    music_track_path: Optional[str],
    has_audio: bool,
    music_overlay: bool,
    continuous_audio: bool,
    full_av_select_filter: str,
    music_overlay_select_filter: str,
    continuous_audio_select_filter: str,
):
  ffmpeg_cmds = [
      'ffmpeg',
      '-i',
      video_file_path,
  ]
  if (music_overlay and speech_track_path and music_track_path):
    ffmpeg_cmds.extend([
        '-i',
        speech_track_path,
        '-i',
        music_track_path,
    ])
  ffmpeg_filter = [full_av_select_filter]
  if has_audio:
    if continuous_audio:
      ffmpeg_filter = [continuous_audio_select_filter]
    elif music_overlay:
      ffmpeg_filter = [music_overlay_select_filter, '-ac', '2']
  ffmpeg_cmds.extend([
      '-filter_complex',
  ] + ffmpeg_filter + [
      '-map',
      '[outv]',
  ])
  if has_audio:
    ffmpeg_cmds.extend([
        '-map',
        '[outa]',
    ])

  return ffmpeg_cmds


def _render_format(
    vision_model: GenerativeModel,
    input_video_path: str,
    output_path: str,
    gcs_bucket_name: str,
    gcs_folder_path: str,
    variant_id: int,
    video_format: VideoFormat,
    generate_image_assets: bool,
    video_filter: str,
    ffmpeg_cmds: Optional[Sequence[str]],
) -> Dict[str, Union[str, Sequence[str]]]:
  """Renders a video variant in a specific format."""
  format_type_str = video_format.type_name
  logging.info(
      'RENDERING - Rendering variant %s format: %s (%s)',
      variant_id, video_format.aspect_ratio_str, format_type_str
  )
  _, video_ext = os.path.splitext(input_video_path)
  format_name = f'combo_{variant_id}_{format_type_str[0]}{video_ext}'
  output_video_path = str(pathlib.Path(output_path, format_name))

  if ffmpeg_cmds:
    ffmpeg_cmds.append(output_video_path)
    Utils.execute_subprocess_commands(
        cmds=ffmpeg_cmds,
        description=(
            f'render {format_type_str} variant with id {variant_id} '
            'using ffmpeg'
        ),
    )
  else:
    Utils.execute_subprocess_commands(
        cmds=[
            'ffmpeg',
            '-y',
            '-i',
            input_video_path,
            '-vf',
            video_filter,
            output_video_path,
        ],
        description=(
            f'render {format_type_str} variant with id {variant_id} and '
            'blur filter using ffmpeg'
        ),
    )
  output = {
      'path': format_name,
  }
  if generate_image_assets:
    StorageService.upload_gcs_dir(
        source_directory=output_path,
        bucket_name=gcs_bucket_name,
        target_dir=gcs_folder_path,
    )
    assets = _generate_image_assets(
        vision_model=vision_model,
        video_file_path=output_video_path,
        gcs_bucket_name=gcs_bucket_name,
        gcs_folder_path=gcs_folder_path,
        output_path=output_path,
        variant_id=variant_id,
        format_type=format_type_str,
    )
    if assets:
      output['images'] = assets

  return output


def _generate_text_assets(
    vision_model: GenerativeModel,
    gcs_video_path: str,
    video_language: str,
    video_variant: VideoVariant,
) -> Optional[Sequence[Dict[str, str]]]:
  """Generates text ad assets for a video variant."""
  prompt = ConfigService.GENERATE_ASSETS_PROMPT.format(
      video_language=video_language
  )
  assets = None
  try:
    response = vision_model.generate_content(
        [
            Part.from_uri(gcs_video_path, mime_type='video/mp4'),
            prompt,
        ],
        generation_config=ConfigService.GENERATE_ASSETS_CONFIG,
        safety_settings=ConfigService.CONFIG_DEFAULT_SAFETY_CONFIG,
    )
    if (
        response.candidates and response.candidates[0].content.parts
        and response.candidates[0].content.parts[0].text
    ):
      logging.info(
          'ASSETS - Received response: %s',
          response.candidates[0].content.parts[0].text
      )
      rows = []
      results = list(
          filter(
              None, response.candidates[0].content.parts[0].text.strip().split(
                  ConfigService.GENERATE_ASSETS_SEPARATOR
              )
          )
      )
      for result in results:
        result = re.findall(
            ConfigService.GENERATE_ASSETS_PATTERN, result, re.MULTILINE
        )
        if result and len(result[0]) == 2:
          rows.append([entry.strip() for entry in result[0]])
        else:
          logging.warning('Skipping malformed text asset line: %s', result)

      if rows:
        assets = pd.DataFrame(rows, columns=[
            'headline',
            'description',
        ]).to_dict(orient='records')
        logging.info(
            'ASSETS - Generated text assets for variant %d: %r',
            video_variant.variant_id,
            assets,
        )
      else:
          logging.warning(
              'ASSETS - No valid text assets could be parsed for variant %d!',
              video_variant.variant_id
          )
    else:
      logging.warning(
          'ASSETS - Could not generate text assets for variant %d!',
          video_variant.variant_id
      )
  except Exception:  # pylint: disable=broad-exception-caught
    logging.exception(
        'Encountered error during generation of text assets for variant %d! '
        'Continuing...', video_variant.variant_id
    )
  return assets


def _generate_video_script(
    optimised_av_segments: pd.DataFrame,
    video_variant: VideoVariant,
) -> str:
  """Generates a video script for the given A/V segments."""
  video_script = []
  index = 1
  for av_segment in optimised_av_segments:
    if str(av_segment['av_segment_id']) not in video_variant.av_segments.keys():
      continue

    video_script.append(f'Scene {index}')
    video_script.append(f"{av_segment['start_s']} --> {av_segment['end_s']}")
    video_script.append(
        f"Duration: {(av_segment['end_s'] - av_segment['start_s']):.2f}s"
    )

    description = av_segment['description'].strip()
    if description:
      video_script.append(description)

    video_script.append(
        f"Number of visual shots: {len(av_segment['visual_segment_ids'])}"
    )
    transcript = av_segment['transcript']
    details = av_segment['labels'] + av_segment['objects']
    text = [f'"{t}"' for t in av_segment['text']]
    logos = av_segment['logos']
    keywords = av_segment['keywords'].strip()

    if transcript:
      video_script.append(f"Off-screen speech: \"{' '.join(transcript)}\"")
    if details:
      video_script.append(f"On-screen details: {', '.join(details)}")
    if text:
      video_script.append(f"On-screen text: {', '.join(text)}")
    if logos:
      video_script.append(f"Logos: {', '.join(logos)}")
    if keywords:
      video_script.append(f'Keywords: {keywords}')

    video_script.append('')
    index += 1

  return '\n'.join(video_script)


def _generate_image_assets(
    vision_model: GenerativeModel,
    video_file_path: str,
    gcs_bucket_name: str,
    gcs_folder_path: str,
    output_path: str,
    variant_id: int,
    format_type: str,
) -> Sequence[str]:
  """Generates image ad assets for a video variant in a specific format."""
  variant_folder = f'combo_{variant_id}'
  image_assets_path = pathlib.Path(
      output_path,
      variant_folder,
      ConfigService.OUTPUT_COMBINATION_ASSETS_DIR,
      format_type,
  )
  assets = []
  try:
    os.makedirs(image_assets_path, exist_ok=True)
    _extract_video_thumbnails(
        video_file_path=video_file_path,
        image_assets_path=image_assets_path,
        variant_id=variant_id,
        format_type=format_type,
    )
    _identify_and_extract_key_frames(
        vision_model=vision_model,
        video_file_path=video_file_path,
        image_assets_path=image_assets_path,
        gcs_bucket_name=gcs_bucket_name,
        gcs_folder_path=gcs_folder_path,
        output_path=output_path,
        variant_id=variant_id,
        format_type=format_type,
    )
    assets = [
        f'{ConfigService.GCS_BASE_URL}/{gcs_bucket_name}/'
        f'{parse.quote(gcs_folder_path)}/'
        f'{variant_folder}/{ConfigService.OUTPUT_COMBINATION_ASSETS_DIR}/'
        f'{format_type}/{image_asset}' for image_asset in sorted(
            os.listdir(image_assets_path), key=lambda asset:
            int(asset.split('/')[-1].replace('.png', '').replace('.jpg', ''))
        ) if image_asset.endswith('.png') or image_asset.endswith('.jpg')
    ]

    logging.info(
        'ASSETS - Generated %d image assets for variant %d in %s format',
        len(assets),
        variant_id,
        format_type,
    )
  except Exception:  # pylint: disable=broad-exception-caught
    logging.exception(
        'Encountered error during generation of image assets for variant %d '
        'in format %s! Continuing...', variant_id, format_type
    )
  return assets


def _extract_video_thumbnails(
    video_file_path: str,
    image_assets_path: str,
    variant_id: int,
    format_type: str,
):
  """Extracts video thumbnails as image assets."""
  Utils.execute_subprocess_commands(
      cmds=[
          'ffmpeg',
          '-i',
          video_file_path,
          '-vf',
          'thumbnail',
          '-vsync',
          'vfr',
          str(pathlib.Path(image_assets_path, '%d.png')),
      ],
      description=(
          f'extract thumbnails for {format_type} type for '
          f'variant with id {variant_id} using ffmpeg'
      ),
  )


def _identify_and_extract_key_frames(
    vision_model: GenerativeModel,
    video_file_path: str,
    image_assets_path: str,
    gcs_bucket_name: str,
    gcs_folder_path: str,
    output_path: str,
    variant_id: int,
    format_type: str,
):
  """Identifies key frames via Gemini and extracts them."""
  results = []
  try:
    gcs_video_file_path = video_file_path.replace(f'{output_path}/', '')
    response = vision_model.generate_content(
        [
            Part.from_uri(
                f'gs://{gcs_bucket_name}/{gcs_folder_path}/'
                f'{gcs_video_file_path}',
                mime_type='video/mp4',
            ),
            ConfigService.KEY_FRAMES_PROMPT,
        ],
        generation_config=ConfigService.KEY_FRAMES_CONFIG,
        safety_settings=ConfigService.CONFIG_DEFAULT_SAFETY_CONFIG,
    )
    if (
        response.candidates and response.candidates[0].content.parts
        and response.candidates[0].content.parts[0].text
    ):
      text = response.candidates[0].content.parts[0].text
      results = re.findall(ConfigService.KEY_FRAMES_PATTERN, text, re.MULTILINE)
    else:
      logging.warning('ASSETS - Could not identify key frames!')
  except Exception:  # pylint: disable=broad-exception-caught
    logging.exception('Encountered error while identifying key frames!')

  if results:
    for index, key_frame_timestamp in enumerate(results):
      Utils.execute_subprocess_commands(
          cmds=[
              'ffmpeg',
              '-ss',
              key_frame_timestamp,
              '-i',
              video_file_path,
              '-frames:v',
              '1',
              '-q:v',
              '2',
              str(pathlib.Path(image_assets_path, f'{index+1}.jpg')),
          ],
          description=(
              f'extract key frames for {format_type} type for '
              f'variant with id {variant_id} using ffmpeg'
          ),
      )


def _group_consecutive_segments(
    av_segment_ids: Sequence[str],
) -> Sequence[Tuple[str, str]]:
  """Groups consecutive segments together."""
  result = []
  i = 0
  while i < len(av_segment_ids):
    start_segment = av_segment_ids[i]
    j = i
    while j < len(av_segment_ids) - 1:
      if _is_sequential_segments(av_segment_ids[j], av_segment_ids[j + 1]):
        j += 1
      else:
        break
    result.append((start_segment, av_segment_ids[j]))
    i = j + 1
  return result


def _is_sequential_segments(current_segment_id: str, next_segment_id: str):
  """Checks if two consecutive segments are sequential."""
  current_parts = current_segment_id.split('.')
  next_parts = next_segment_id.split('.')
  try:
    next_level_parts = list(current_parts)
    next_level_parts[-1] = str(int(next_level_parts[-1]) + 1)
    if (
        len(current_parts) == len(next_parts)
        and current_parts[:-1] == next_parts[:-1]
        and int(next_parts[-1]) == int(current_parts[-1]) + 1
    ) or next_segment_id == '.'.join(next_level_parts) + '.1':
      return True
  except ValueError:
    pass
  return False


def _build_ffmpeg_filters(
    shot_timestamps: Sequence[Tuple[float, float]],
    has_audio: bool,
    render_settings: VideoVariantRenderSettings,
    video_duration: float,
) -> Tuple[str, str, str]:
  """Builds the ffmpeg filters."""
  video_select_filter = []
  audio_select_filter = []
  select_filter_concat = []
  idx = 0
  duration = 0
  variant_first_segment_start = sys.maxsize
  variant_last_segment_end = 0
  for start, end in shot_timestamps:
    selection_filter = f'between(t,{start},{end})'
    video_select_filter.append(
        f"[0:v]select='{selection_filter}',setpts=N/FRAME_RATE/TB[v{idx}];"
    )
    select_filter_concat.append(f'[v{idx}]')
    if has_audio:
      audio_select_filter.append(
          f"[0:a]aselect='{selection_filter}',asetpts=N/SR/TB[a{idx}];"
      )
      select_filter_concat.append(f'[a{idx}]')
    duration += end - start
    variant_first_segment_start = min(variant_first_segment_start, start)
    variant_last_segment_end = max(variant_last_segment_end, end)
    idx += 1

  fade_out_duration = float(ConfigService.CONFIG_DEFAULT_FADE_OUT_DURATION)
  fade_out_buffer = float(ConfigService.CONFIG_DEFAULT_FADE_OUT_BUFFER)
  fade_out_start = duration - fade_out_duration - fade_out_buffer
  fade_out_filter = (
      f';[outa]afade=t=out:st={fade_out_start}:d={fade_out_duration}[outa]'
      if render_settings.fade_out else ''
  )

  overlay_start = variant_first_segment_start
  if render_settings.overlay_type:
    match render_settings.overlay_type:
      case Utils.RenderOverlayType.VIDEO_START.value:
        overlay_start = 0
      case Utils.RenderOverlayType.VIDEO_END.value:
        overlay_start = video_duration - duration
      case Utils.RenderOverlayType.VARIANT_END.value:
        overlay_start = variant_last_segment_end - duration
      case Utils.RenderOverlayType.VARIANT_START.value:
        overlay_start = variant_first_segment_start

  full_av_select_filter = ''.join(
      video_select_filter + audio_select_filter + select_filter_concat
      + [f'concat=n={idx}:v=1:a=1[outv][outa]', fade_out_filter]
  ) if has_audio else ''.join(
      video_select_filter + select_filter_concat
      + [f'concat=n={idx}:v=1[outv]']
  )

  music_overlay_select_filter = ''.join(
      video_select_filter
      + [entry.replace('0:a', '1:a') for entry in audio_select_filter] + [
          f"[2:a]aselect='between(t,{overlay_start},{overlay_start+duration})'"
          ',asetpts=N/SR/TB[music];'
      ] + select_filter_concat + [
          f'concat=n={idx}:v=1:a=1[outv][tempa];',
          '[tempa][music]amerge=inputs=2[outa]',
          fade_out_filter,
      ]
  ) if has_audio else ''
  continuous_audio_select_filter = ''.join(
      video_select_filter + [
          f"[0:a]aselect='between(t,{overlay_start},{overlay_start+duration})'"
          ',asetpts=N/SR/TB[outa];'
      ] + [entry for entry in select_filter_concat if entry.startswith('[v')]
      + [f'concat=n={idx}:v=1[outv]', fade_out_filter]
  ) if has_audio else ''

  return (
      full_av_select_filter,
      music_overlay_select_filter,
      continuous_audio_select_filter,
  )


def _update_or_create_video_metadata(
    video_file_path: str,
    root_video_folder: str,
    gcs_bucket_name: str,
    tmp_dir: str,
) -> None:
  """Updates or creates the video metadata, ensuring dimensions are present."""
  metadata_file_name = 'metadata.json'
  metadata_file_path = StorageService.download_gcs_file(
      file_path=Utils.TriggerFile(
          str(pathlib.Path(root_video_folder, metadata_file_name))
      ),
      output_dir=tmp_dir,
      bucket_name=gcs_bucket_name,
  )
  metadata = {}
  if metadata_file_path and os.path.exists(metadata_file_path):
    with open(metadata_file_path, 'r', encoding='utf-8') as f:
      try:
        metadata = json.load(f)
      except json.JSONDecodeError:
        logging.warning('Could not decode metadata.json')

  width = metadata.get('width')
  height = metadata.get('height')

  if not width or not height:
    logging.info('Dimensions not found in metadata, probing video...')
    width, height = _get_video_dimensions(video_file_path)
    if width and height:
      metadata['width'] = width
      metadata['height'] = height
      local_metadata_path = os.path.join(tmp_dir, metadata_file_name)
      with open(local_metadata_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f)
      StorageService.upload_gcs_file(
          file_path=local_metadata_path,
          bucket_name=gcs_bucket_name,
          destination_file_name=str(
              pathlib.Path(root_video_folder, metadata_file_name)
          ),
      )
  logging.info('Video dimensions: %sx%s', width, height)


def _get_video_dimensions(video_file_path: str) -> Tuple[int, int]:
  """Probes the video file to get its dimensions."""
  try:
    output = subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
        'stream=width,height', '-of', 'csv=s=x:p=0', video_file_path
    ])
    width, height = map(int, output.decode('utf-8').strip().split('x'))
    return width, height
  except Exception:  # pylint: disable=broad-exception-caught
    logging.exception('Error probing video dimensions!')
    return 0, 0
