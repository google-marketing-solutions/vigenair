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
    authenticatedEndpointBase: 'https://storage.mtls.cloud.google.com',
    browsingEndpointBase: 'https://console.cloud.google.com/storage/browser',
  },
  vertexAi: {
    endpoint: 'aiplatform.googleapis.com',
    projectId: '<gcp-project-id>',
    location: '<vertexai-region>',
    quotaLimitDelay: 10 * 1000, // 10s,
    model: 'gemini-1.5-flash',
    modelParams: {
      temperature: 1,
      topP: 1,
      maxOutputTokens: 2048,
    },
    generationPromptUserInstructionsNegation:
      '        - **Exclude Scenes / Topics**: {{userPrompt}}.',
    generationPromptUserInstructions:
      '        - **Scene / Topic Focus**: {{userPrompt}}.',
    generationPrompt: `Follow these instructions in order:

    1. **Expert Script Writer**: You are an expert script writer for video ads with a focus on maximizing viewer engagement.
    2. **Analyze and Condense**: Your primary task is to generate shorter, more impactful scripts by intelligently combining scenes from a given video ad script. Adhere to these guidelines:
        - **Memorable Combinations**: Ensure each combination captures the essence of the original ad's message while remaining memorable. Combinations must include more than one scene but never all scenes.
        - **Prioritize Key Scenes**: Scenes with the most logos, brands, products, or on-screen text are VITAL. Prioritize these in your combinations.
        {{userPromptPlaceholder}}
        - **Always End Strong**: The final scene of the original script is the MOST important. Always conclude your combinations with this scene.
        - **Coherence with Speech and Text**: Prioritize scenes with off-screen speech or on-screen text. Ensure that combined scenes maintain a logical flow and message.
        - **Target Duration**: Aim for combinations with a duration of approximately {{desiredDuration}} seconds. This is a critical requirement.
        - **Avoid All-Scene Combinations**: Never output combinations that include all scenes from the original script.
    3. **Expert Critic (140 IQ)**: Evaluate each generated script combination based on these criteria:
        - **Criterion A (Strong Start)**: Does the combination start with impactful visuals, quick pacing, tight framing, and off-screen speech within the first 5 seconds?
        - **Criterion B (Branding)**: Does the combination prominently feature the brand's name, logo, product, tagline, or call-to-action within the first or last 5 seconds?
        - **Criterion C (Human Element)**: Does the combination include people and visible faces, ideally close-ups, within the first 5 seconds?
        - **Criterion D (Call-to-Action)**: Does the combination end with a clear and compelling on-screen call to action that drives the target audience to engage?
    4. **Scoring and Rationale**: Assign a score of 1-5 to each combination based on how well it fulfills the ABCD criteria. Provide detailed reasoning for the score, referencing specific examples from the combination. Use the following scoring rubric:
        - **5 points**: Fulfills ALL ABCD criteria, coherent message, includes important scenes, and meets the {{expectedDurationRange}} second duration range.
        - **4 points**: Fulfills ALL ABCD criteria, coherent message, but slightly outside the duration range or missing one important scene.
        - **3 points**: Fulfills MOST ABCD criteria, but lacks coherence due to mismatched text/speech or missing multiple important scenes.
        - **2 points**: Meets SOME ABCD criteria, lacks coherence, misses several important scenes, and significantly deviates from the duration range.
        - **1 point**: Meets few or no ABCD criteria, or uses ALL scenes from the original ad.
    5. **Output Format**: For each combination, output the following components in this exact format:
    Title: A concise and descriptive title in {{videoLanguage}}.
    Scenes: A comma-separated list of the scene numbers included in the combination (no "Scene" prefix).
    Reasoning: A detailed explanation of why this combination is coherent, engaging, and effective.
    Score: The assigned score (1-5).
    ABCD: Detailed reasoning for the score, including specific examples from the combination that support your evaluation.

    Separate each combination you output by the value "## Combination".


    Script:
    {{videoScript}}


    `,
    textAssetGenerationPrompt: `You are a leading digital marketer and an expert at crafting high-performing search ad headlines and descriptions that captivate users and drive conversions.
    Follow these instructions in order:

    1. **Analyze the Video**: Carefully analyze the video ad to identify the brand, key products or services, unique selling points, and the core message conveyed.
    2. **Target Audience**: Consider the target audience of the video ad. What are their interests, needs, and pain points? How can the search ad resonate with them?
    3. **Unwanted Example**: Here's an example of a Headline and Description that I DO NOT want you to generate: Headline: {{headline}} Description: {{description}}
    4. **Craft a Headline and a Description**: Generate a compelling search ad headline and description based on your analysis. Adhere to these guidelines:
        - **Headline (Max 40 Characters)**:
            - Include the brand name or a relevant keyword.
            - Highlight the primary benefit or unique feature of the product/service.
            - Create a sense of urgency or exclusivity.
            - Use action words and power words to grab attention.
            - Avoid overselling and nebulous claims.
            - Do not output any question marks or exclamation marks.
        - **Description (Max 90 Characters)**:
            - Expand on the headline, providing additional details or benefits.
            - Include a strong call to action (e.g. "Shop now", "Learn more", "Sign up").
            - Use keywords strategically for better targeting.
            - Maintain a clear and concise message.
            - Avoid overselling and nebulous claims.
            - Do not output more than one question mark or exclamation mark.
    4. **Output Format**: Output the following components in this exact format:
    Headline: The generated headline.
    Description: The accompanying description.

    Output in {{videoLanguage}}.
    `,
  },
  defaultVideoLanguage: 'English',
  defaultVideoWidth: 1280,
  defaultVideoHeight: 720,
  defaultVideoDurationStep: 5,
  videoFolderNameSeparator: '--',
  videoFolderNoAudioSuffix: 'n',
  videoIntelligenceConfidenceThreshold: 0.7,
  defaultTranscriptionService: 'whisper', // whisper | gemini
  defaultCacheExpiration: 60, // in seconds
  defaultDuration: 30, // in seconds
  retryDelay: 6000, // in milliseconds
  maxRetries: 600,
  maxRetriesAppsScript: 5,
  debug: true,
};
