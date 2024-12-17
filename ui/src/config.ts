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
    generationPrompt: `**Objective:** Generate shorter, highly engaging video ad scripts by strategically combining scenes from a provided script, focusing on maximizing impact and adhering to specific criteria.

    **Instructions:**

    **Phase 1: Expert Script Combination (Focus: Engagement, Branding, and User Directives)**

    1.  **Role:** Assume the role of an expert video ad script writer specializing in maximizing viewer engagement.
    2.  **Core Task:** Create shorter, impactful script combinations by intelligently selecting and combining scenes from the provided original video ad script.
    3.  **User Directive Interpretation (Crucial):**
        *   **Input Format:** The user has provided their directive in a single free-form text field: {{userPrompt}}.
        *   **Empty Input (No Directive):** If the {{userPrompt}} field is *empty*, the user has provided *no specific directive*. In this case, *follow the "Key Combination Guidelines" below*.
        *   **"Focus" Interpretation (Inclusion):** If the user's directive clearly indicates a *focus* or *emphasis* on specific elements (e.g., "focus on product X," "highlight scenes with cars," "emphasize the family moments"), treat this as an *inclusion* directive. Prioritize scenes containing those elements.
        *   **"Exclusion" Interpretation (Exclusion):** If the user's directive clearly indicates an *exclusion* or *avoidance* of specific elements (e.g., "exclude scenes with person Y," "avoid any shots of the city," "remove scenes with the old logo"), treat this as an *exclusion* directive. *Absolutely avoid* including scenes containing those elements.
        *   **Ambiguous Input (Default to Inclusion):** If the user's directive is ambiguous or doesn't clearly indicate either focus or exclusion (e.g., "cars," "red," "night"), *treat this as an inclusion directive*. Prioritize scenes containing those elements. If it is completely unrelated to the content of the script, ignore it.
    4.  **Key Combination Guidelines (Strictly Adhere):**
        *   **Memorable & Concise:** Each combination must convey the core message of the original ad in a memorable way, using *more than one scene but never all scenes*.
        *   **Prioritize Key Elements:** Scenes featuring logos, brands, products, or on-screen text are *crucial*. Prioritize their inclusion.
        *   **Strong Conclusion:** The *final scene of the original script is paramount*. Always include it as the concluding scene of every combination.
        *   **Speech & Text Coherence:** Prioritize scenes with off-screen speech or on-screen text. Ensure a logical flow and coherent message within the combined scenes. Avoid jarring transitions.
        *   **Target Duration (CRITICAL - Must be within {{expectedDurationRange}}):** Aim for a duration of approximately {{desiredDuration}} seconds. This is an *absolutely critical requirement*. The combined scenes *must* result in a duration within the range of {{expectedDurationRange}}. Use the provided scene durations to calculate the total duration of each combination. *Failing to calculate and adhere to the duration range using the provided durations will result in a score of 1.* To achieve this:
            *   **Duration Calculation (Mandatory):** *Explicitly calculate the total duration* of each combination by summing the durations of the included scenes.
            *   **Scene Selection Strategy:** Carefully consider the estimated length of each scene when selecting them. Prioritize shorter scenes if needed to stay within the duration range.
            *   **Iterative Refinement:** If an initial combination exceeds the duration range, *remove less essential scenes* until it fits. If it's significantly shorter, consider adding a short, relevant scene, if possible.
            *   **Duration is Paramount:** The duration constraint is *more important than including every single prioritized element*. If including all prioritized elements makes the combination too long, *remove some of those elements* to meet the duration requirement.
        *   **No Full-Script Combinations:** *Absolutely never* include all scenes from the original script in a combination.

    **Phase 2: Expert Critique (Rigorous Evaluation and Recommendations)**

    1.  **Role:** Now, act as a highly analytical critic (140 IQ) evaluating each generated script combination against the following criteria, and *where applicable*, provide *recommendations* for improvement:
        *   **Criterion A (Impactful Opening):** Does the combination begin with compelling visuals, fast pacing, tight framing, and/or off-screen speech within the first 5 seconds to immediately grab attention?
            *   **Recommendation (If Applicable):** If the opening is deemed weak (e.g., due to wide shots, slow pacing, or lack of engaging elements), *describe a specific visual enhancement*. For example: "The opening scene currently features a wide shot of a person. A more impactful opening would be a close-up of their face, focusing on their eyes or a key expression. This would create immediate engagement with the viewer."
        *   **Criterion B (Brand Visibility):** Does the brand's name, logo, product, tagline, or call-to-action appear prominently within the first or last 5 seconds to reinforce brand recognition?
            *   **Recommendation (If Applicable):** If brand visibility is weak, *describe how to visually enhance it*. For example: "The brand logo appears small and in the background. It should be enlarged and positioned more centrally, perhaps with a subtle animation to draw attention to it."
        *   **Criterion C (Human Connection):** Does the combination feature people and visible faces, ideally close-ups, within the first 5 seconds to create an emotional connection?
            *   **Recommendation (If Applicable):** If human connection is lacking, *describe a visual improvement*. For example: "The opening lacks any human presence. Inserting a brief close-up of a smiling face in the first few seconds would establish an immediate emotional connection with the audience."
        *   **Criterion D (Clear Call-to-Action):** Does the combination end with a clear and compelling on-screen call to action that motivates the target audience to engage?
            *   **Recommendation (If Applicable):** If the call to action is weak, *describe how to visually strengthen it*. For example: "The call to action is displayed in small, plain text. It should be presented as a visually distinct button or graphic, perhaps with a contrasting color and a short animation to encourage clicks."

    **Phase 3: Scoring and Justification (Detailed Analysis)**

    1.  **Scoring Rubric (Use Precisely):**
        *   **5 points (Excellent):** Fulfills *all* ABCD criteria, maintains a coherent message, includes all essential scenes, and falls within the {{expectedDurationRange}} second duration range.
        *   **4 points (Good):** Fulfills *all* ABCD criteria and maintains a coherent message, but may slightly exceed the duration range or miss one less critical scene.
        *   **3 points (Fair):** Fulfills *most* ABCD criteria but suffers from some incoherence due to mismatched text/speech or omits multiple important scenes.
        *   **2 points (Poor):** Meets *some* ABCD criteria, lacks coherence, misses several crucial scenes, and significantly deviates from the duration range.
        *   **1 point (Unacceptable):** Meets few or no ABCD criteria or includes *all* scenes from the original ad.
    2.  **Justification:** Provide detailed reasoning for each score, citing specific examples from the combination to support your evaluation. Be precise and analytical.

    **Constraints (Strictly Enforce):**
        *   Each combination must include *more than one scene* but *never all scenes* from the original script.
        *   Each combination *must* fall within the specified duration range: {{expectedDurationRange}}.

    **Output Format (Strictly Enforce):**

    For each generated combination, present the following information in this *exact* format:
    Title: [Concise and descriptive title in {{videoLanguage}}]
    Scenes: [Comma-separated list of scene numbers included (no "Scene" prefix)]
    Reasoning: [Detailed explanation of the combination's coherence, engagement, and effectiveness]
    Score: [Numerical score (1-5)]
    Duration: [Calculated duration of the combination in seconds]
    ABCD: [Detailed evaluation per criterion and reasoning for your score, including specific examples from the combination that support your evaluation]

    Separate each combination with the delimiter: "## Combination".


    **Input:**

    Original Script ({{videoScript}}): {{{{videoScript}}}}
    User Directive ({{userPrompt}}): {{{{userPrompt}}}}
    Desired Duration ({{desiredDuration}}): {{{{desiredDuration}}}}
    Expected Duration Range ({{expectedDurationRange}}): {{{{expectedDurationRange}}}}
    Video Language ({{videoLanguage}}): {{{{videoLanguage}}}}


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
