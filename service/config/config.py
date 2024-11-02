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
CONFIG_TRANSCRIPTION_SERVICE = os.environ.get(
    'CONFIG_TRANSCRIPTION_SERVICE', 'whisper'
)
CONFIG_TRANSCRIPTION_MODEL = os.environ.get(
    'CONFIG_TRANSCRIPTION_MODEL', 'small'
)
CONFIG_ANNOTATIONS_CONFIDENCE_THRESHOLD = float(
    os.environ.get('CONFIG_ANNOTATIONS_CONFIDENCE_THRESHOLD', '0.7')
)
CONFIG_MULTIMODAL_ASSET_GENERATION = os.environ.get(
    'CONFIG_MULTIMODAL_ASSET_GENERATION', 'true'
) == 'true'
CONFIG_MAX_VIDEO_CHUNK_SIZE = float(
    os.environ.get(
        'CONFIG_MAX_VIDEO_CHUNK_SIZE',
        f'{1 * 1e9}'  # GB
    )
)
CONFIG_MAX_AUDIO_CHUNK_SIZE = float(
    os.environ.get(
        'CONFIG_MAX_AUDIO_CHUNK_SIZE',
        '480'  # seconds
    )
)
CONFIG_DEFAULT_FADE_OUT_DURATION = os.environ.get(
    'CONFIG_DEFAULT_FADE_OUT_DURATION',
    '1'  # seconds
)

# 10ms silence at the end of the fade out makes it "sound" better
# https://en.wikipedia.org/wiki/Fade_(audio_engineering)#:~:text=Appropriate%20fade%2Din%20time,10ms.%5B14%5D
CONFIG_DEFAULT_FADE_OUT_BUFFER = 0.1

CONFIG_DEFAULT_SAFETY_CONFIG = {
    generative_models.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: (
        generative_models.HarmBlockThreshold.BLOCK_ONLY_HIGH
    ),
    generative_models.HarmCategory.HARM_CATEGORY_HARASSMENT: (
        generative_models.HarmBlockThreshold.BLOCK_ONLY_HIGH
    ),
    generative_models.HarmCategory.HARM_CATEGORY_HATE_SPEECH: (
        generative_models.HarmBlockThreshold.BLOCK_ONLY_HIGH
    ),
    generative_models.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: (
        generative_models.HarmBlockThreshold.BLOCK_ONLY_HIGH
    ),
}

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
INPUT_FILENAME = 'input'
INPUT_RENDERING_FILE = 'render.json'
INPUT_RENDERING_FINALISE_FILE = 'finalise.txt'
INPUT_SQUARE_CROP_FILE = 'square.txt'
INPUT_VERTICAL_CROP_FILE = 'vertical.txt'
OUTPUT_SUBTITLES_TYPE = 'vtt'  # 'vtt' or 'srt'
OUTPUT_SUBTITLES_FILE = f'{INPUT_FILENAME}.{OUTPUT_SUBTITLES_TYPE}'
OUTPUT_LANGUAGE_FILE = 'language.txt'
OUTPUT_SPEECH_FILE = 'vocals.wav'
OUTPUT_MUSIC_FILE = 'accompaniment.wav'
OUTPUT_ANALYSIS_FILE = 'analysis.json'
OUTPUT_DATA_FILE = 'data.json'
OUTPUT_COMBINATIONS_FILE = 'combos.json'
OUTPUT_AV_SEGMENTS_DIR = 'av_segments_cuts'
OUTPUT_ANALYSIS_CHUNKS_DIR = 'analysis_chunks'
OUTPUT_COMBINATION_ASSETS_DIR = 'assets'

GCS_BASE_URL = 'https://storage.mtls.cloud.google.com'

SEGMENT_SCREENSHOT_EXT = '.jpg'
SEGMENT_ANNOTATIONS_PATTERN = '(.*Description:\n?)?(.*)\n*Keywords:\n?(.*)'
SEGMENT_ANNOTATIONS_PROMPT = (
    """Describe this video in as much detail as possible. Include 5 keywords.

Output EXACTLY as follows:
Description: the description.
Keywords: the keywords, comma-separated.

"""
)
SEGMENT_ANNOTATIONS_CONFIG = {
    'max_output_tokens': 2048,
    'temperature': 0.2,
    'top_p': 1,
}

# pylint: disable=line-too-long
FFMPEG_VERTICAL_BLUR_FILTER = 'split[original][copy];[original]scale=iw*0.316:-1[scaled];[copy]gblur=sigma=20[blurred];[blurred][scaled]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2[overlay];[overlay]crop=iw*0.316:ih'
FFMPEG_SQUARE_BLUR_FILTER = 'split[original][copy];[original]scale=ih:-1[scaled];[copy]gblur=sigma=20[blurred];[blurred][scaled]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2[overlay];[overlay]crop=ih:ih'

# pylint: disable=anomalous-backslash-in-string
GENERATE_ASSETS_PATTERN = '.*Headline:\**\n?(.*)\n*\**Description:\**\n?(.*)'
GENERATE_ASSETS_SEPARATOR = '## Ad'
GENERATE_ASSETS_PROMPT = f"""You are a leading digital marketer and an expert at crafting high-performing search ad headlines and descriptions that captivate users and drive conversions.
Follow these instructions in order:
1. **Analyze the Video**: Carefully analyze the video ad{{prompt_text_suffix}} to identify the brand, key products or services, unique selling points, and the core message conveyed.
2. **Target Audience**: Consider the target audience of the video ad. What are their interests, needs, and pain points? How can the search ads resonate with them?
3. **Craft Headlines and Descriptions**: Generate 5 compelling search ad headlines and descriptions based on your analysis. Adhere to these guidelines:
    - **Headlines (Max 40 Characters)**:
        - Include the brand name or a relevant keyword.
        - Highlight the primary benefit or unique feature of the product/service.
        - Create a sense of urgency or exclusivity.
        - Use action words and power words to grab attention.
        - Avoid overselling and nebulous claims.
        - Do not output any question marks or exclamation marks.
    - **Descriptions (Max 90 Characters)**:
        - Expand on the headline, providing additional details or benefits.
        - Include a strong call to action (e.g. "Shop now", "Learn more", "Sign up").
        - Use keywords strategically for better targeting.
        - Maintain a clear and concise message.
        - Avoid overselling and nebulous claims.
        - Do not output more than one question mark or exclamation mark.
4. **Output Format**: For each generated search ad, output the following components in this exact format:
Headline: The generated headline.
Description: The accompanying description.

Separate each search ad you output by the value "{GENERATE_ASSETS_SEPARATOR}".
Output in {{video_language}}.
"""
GENERATE_ASSETS_PROMPT_TEXT_PART = ' script'
GENERATE_ASSETS_CONFIG = {
    'max_output_tokens': 2048,
    'temperature': 0.2,
    'top_p': 1,
}

DEFAULT_VIDEO_LANGUAGE = 'English'

TRANSCRIBE_AUDIO_PROMPT = """Transcribe the provided audio file, paying close attention to speaker changes and pauses in speech.
Output the following, in this order:
1. **Language:** Specify the language of the audio (e.g., "Language: English")
2. **Confidence:**  Specify the confidence score of the transcription (e.g., "Confidence: 0.95")
3. **Transcription CSV:** Output the transcription in CSV (Comma-Separated Values) format (e.g. ```csv<output>```) with these columns:
    * **Start:** (Start timestamp for each utterance in the format "mm:ss.SSS")
    * **End:** (End timestamp for each utterance in the format "mm:ss.SSS")
    * **Transcription:** (The transcribed text of the utterance)
    Ensure each row in the CSV corresponds to a complete sentence or a meaningful phrase. Sentences by different speakers, even if related, should not be grouped together.
    **Critical Timestamping Requirements:**
        * **Pause Detection:** It is absolutely essential to accurately identify and incorporate pauses in speech. If there is a period of silence between utterances, even a brief one, this MUST be reflected in the timestamps. Do not assume continuous speech.
        * **No Overlapping:** Timestamps for consecutive sentences should NOT overlap. The end timestamp of one sentence should be the start timestamp of the next sentence ONLY if there is no pause between them.
4. **WebVTT Format:** Output the transcription information in WebVTT format, surrounded by backticks (e.g. ```vtt<output>```)

**Constraints:**
    * **No Extra Text:** Only output the language, confidence, table, and WebVTT data, without any additional text or explanations. This includes avoiding any labels or headings before or after the transcription table and WebVTT data.
    * **Valid Timestamps:** All timestamps MUST be within the actual duration of the audio. No timestamps should exceed the total length of the audio. This is absolutely critical.
    * **Sequential Timestamps:** Timestamps should progress sequentially and logically from the beginning to the end of the audio.

"""
TRANSCRIBE_AUDIO_CONFIG = {
    'max_output_tokens': 8192,
    'temperature': 0.2,
    'top_p': 1,
}
TRANSCRIBE_AUDIO_PATTERN = '.*Language: ?(.*)\n*.*Confidence: ?(.*)\n*```csv\n(.*)```\n*```vtt\n(.*)```'
