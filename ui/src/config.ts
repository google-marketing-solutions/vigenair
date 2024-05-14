/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export const CONFIG = {
  cloudStorage: {
    bucket: '<gcs-bucket>',
    endpointBase: 'https://storage.googleapis.com/storage/v1',
    uploadEndpointBase: 'https://storage.googleapis.com/upload/storage/v1',
  },
  vertexAi: {
    endpoint: 'aiplatform.googleapis.com',
    projectId: '<gcp-project-id>',
    location: '<vertexai-region>',
    quotaLimitDelay: 10 * 1000, // 10s,
    model: 'gemini-1.0-pro',
    modelParams: {
      temperature: 0.4,
      topP: 1,
      topK: 32,
      maxOutputTokens: 2048,
    },
    generationPrompt: `Follow these instructions in order:

    1. You are an expert script writer for video ads that drive high viewer engagement.
    Given a script of a video ad that is too long, generate shorter scripts by combining the given scenes based on the following guidelines:
    - Combinations should be memorable and capture all or part of the message of the original ad. They must be composed of more than one scene, but NEVER all scenes. {{userPrompt}}
    - Scenes with the most logos, most brands, most products or most on-screen text are VITAL. Combinations MUST include some or all of these scenes.
    - ALWAYS end the combination with the last scene of the original ad, as it is the MOST important one.
    - Scenes with off-screen speech or on-screen text should be prioritised over others when combining, and should be meaningful and coherent when combined with other scenes.
    - The duration of the combination MUST be around {{desiredDuration}} seconds. THIS IS VERY IMPORTANT!
    - DO NOT output combinations with all scenes from the original ad.

    2. I want you to act as a critic with an IQ of 140 and evaluate the combinations you generated based on the following criteria. Here is the scoring criteria:
    Criterion A: The combination starts strong, has several visual shots indicating quick pacing and tight framing, and contains off-screen speech within the first 5 seconds.
    Criterion B: The combination shows the brand's name, logo, product, tagline or call-to-action, either on-screen or off-screen, in the first or last 5 seconds.
    Criterion C: The combination contains people and visible faces, ideally close-ups, within the first 5 seconds.
    Criterion D: The combination contains a clear notable on-screen call-to-action in the last 5 seconds that drives the target audience of this ad to engage with the associated brand or product.

    3. Assign a score of 1-5 to the generated combinations based on the above criteria:
    5 points: The generated combination fulfills ALL aspects of the ABCD criteria, creates a coherent ad with a clear message, combines important scenes with the most logos, most brands, most products and most on-screen text, and is within the expected duration range of {{expectedDurationRange}} seconds.
    4 points: The generated combination fulfills ALL aspects of the ABCD criteria, creates a coherent ad, but is slightly outside the expected duration range, or misses only one important scene.
    3 points: The generated combination fulfills most of the ABCD criteria, but is not coherent. It combines scenes that do not have similar on-screen text or similar off-screen speech, or misses more than one important scene.
    2 points: The generated description meets only some of the ABCD criteria, but is not coherent. It misses several important scenes and falls significantly outside of the expected duration range.
    1 point: The generated combination meets very few or none of the ABCD criteria, or uses ALL the scenes of the original video ad.

    4. Take a deep breath and output the following components per combination EXACTLY as shown below:
    Title: A title for this combination in {{videoLanguage}}.
    Scenes: list of scene numbers in this combination.
    Reasoning: Why this combination is coherent and will drive high viewer engagement.
    Score: The score you assigned to this combination.
    ABCD: Reasoning for the score you assigned, with examples.

    Separate each combination you output by the value "## Combination".


    Script:
    {{videoScript}}


    `,
  },
  maxRetries: 3,
  defaultVideoLanguage: 'English',
  defaultCacheExpiration: 60, // in seconds
  defaultDuration: 30,
  debug: false,
};
