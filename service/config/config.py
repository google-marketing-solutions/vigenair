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

"""Vigenair config.

This module contains all configuration constants and runtime variables used by
Vigenair.
"""

import os

import torch
from vertexai.preview import generative_models

GCP_PROJECT_ID = os.environ.get('GCP_PROJECT_ID', 'my-gcp-project')
GCP_LOCATION = os.environ.get('GCP_LOCATION', 'us-central1')
CONFIG_TEXT_MODEL = os.environ.get('CONFIG_TEXT_MODEL', 'gemini-1.5-flash')
CONFIG_VISION_MODEL = os.environ.get('CONFIG_VISION_MODEL', 'gemini-1.5-flash')
CONFIG_WHISPER_MODEL = os.environ.get('CONFIG_WHISPER_MODEL', 'small')
CONFIG_ANNOTATIONS_CONFIDENCE_THRESHOLD = float(
    os.environ.get('CONFIG_ANNOTATIONS_CONFIDENCE_THRESHOLD', '0.7')
)
CONFIG_MULTIMODAL_ASSET_GENERATION = os.environ.get(
    'CONFIG_MULTIMODAL_ASSET_GENERATION', 'false'
) == 'true'

CONFIG_DEFAULT_SAFETY_CONFIG = {
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

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
INPUT_FILENAME = 'input'
INPUT_RENDERING_FILE = 'render.json'
OUTPUT_SUBTITLES_TYPE = 'vtt'  # 'vtt' or 'srt'
OUTPUT_SUBTITLES_FILE = f'{INPUT_FILENAME}.{OUTPUT_SUBTITLES_TYPE}'
OUTPUT_LANGUAGE_FILE = 'language.txt'
OUTPUT_SPEECH_FILE = 'vocals.wav'
OUTPUT_MUSIC_FILE = 'accompaniment.wav'
OUTPUT_ANALYSIS_FILE = 'analysis.json'
OUTPUT_DATA_FILE = 'data.json'
OUTPUT_COMBINATIONS_FILE = 'combos.json'
OUTPUT_AV_SEGMENTS_DIR = 'av_segments_cuts'
OUTPUT_COMBINATION_ASSETS_DIR = 'assets'

GCS_BASE_URL = 'https://storage.mtls.cloud.google.com'

SEGMENT_SCREENSHOT_EXT = '.jpg'
SEGMENT_ANNOTATIONS_PATTERN = '(.*Description:\n?)?(.*)\n*Keywords:\n?(.*)'
SEGMENT_ANNOTATIONS_PROMPT = (
    """Describe this video in one sentence. Include 5 keywords.

Take a deep breath, and output EXACTLY as follows:
Description: the description.
Keywords: the keywords, comma-separated.

"""
)
SEGMENT_ANNOTATIONS_CONFIG = {
    'max_output_tokens': 2048,
    'temperature': 0.2,
    'top_p': 1,
    'top_k': 16,
}

# pylint: disable=line-too-long
FFMPEG_VERTICAL_BLUR_FILTER = '"split[original][copy];[original]scale=iw*0.316:-1[scaled];[copy]gblur=sigma=20[blurred];[blurred][scaled]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2[overlay];[overlay]crop=iw*0.316:ih"'
FFMPEG_SQUARE_BLUR_FILTER = '"split[original][copy];[original]scale=ih:-1[scaled];[copy]gblur=sigma=20[blurred];[blurred][scaled]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2[overlay];[overlay]crop=ih:ih"'

# pylint: disable=anomalous-backslash-in-string
GENERATE_ASSETS_PATTERN = '.*Headline:\**\n?(.*)\n*\**Description:\**\n?(.*)'
GENERATE_ASSETS_SEPARATOR = '## Ad'
GENERATE_ASSETS_PROMPT = f"""You are a leading digital marketer and an expert at generating high-performing search ad headlines and descriptions that captivate users and influence a buying decision.
{{prompt_prefix}}, generate 5 search ad headlines and accompanying descriptions that describe the brand, any products or information within the video.

Output the following components per generated search ad EXACTLY as shown below:
Headline: The generated headline in {{video_language}}. The headline should NOT be longer than 40 characters.
Description: The accompanying description. The description should NOT be longer than 90 characters.

Separate each search ad you output by the value "{GENERATE_ASSETS_SEPARATOR}".
"""
GENERATE_ASSETS_PROMPT_MULTIMODAL_PART = 'Given this video ad'
GENERATE_ASSETS_PROMPT_TEXT_PART = 'Given the script of a video ad'
GENERATE_ASSETS_CONFIG = {
    'max_output_tokens': 2048,
    'temperature': 0.2,
    'top_p': 1,
    'top_k': 32,
}

DEFAULT_VIDEO_LANGUAGE = 'English'
