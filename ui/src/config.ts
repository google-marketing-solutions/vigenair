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
    model: 'gemini-2.0-flash-001',
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

    {{{{generationEvalPromptPart}}}}

    **Phase 3: Scoring and Justification (Detailed Analysis)**

    {{{{generationScorePromptPart}}}}

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
    generationScorePromptPart: `1.  **Scoring Rubric (Use Precisely):**
    *   **5 points (Excellent):** Fulfills *all* ABCD criteria, maintains a coherent message, includes all essential scenes, and falls within the {{expectedDurationRange}} second duration range.
    *   **4 points (Good):** Fulfills *all* ABCD criteria and maintains a coherent message, but may slightly exceed the duration range or miss one less critical scene.
    *   **3 points (Fair):** Fulfills *most* ABCD criteria but suffers from some incoherence due to mismatched text/speech or omits multiple important scenes.
    *   **2 points (Poor):** Meets *some* ABCD criteria, lacks coherence, misses several crucial scenes, and significantly deviates from the duration range.
    *   **1 point (Unacceptable):** Meets few or no ABCD criteria or includes *all* scenes from the original ad.
2.  **Justification:** Provide detailed reasoning for each score, citing specific examples from the combination to support your evaluation. Be precise and analytical.`,
    abcdBusinessObjectives: {
      awareness: {
        displayName: 'Awareness',
        value: 'awareness',
        promptPart: `1.  **Role:** Act as a highly analytical critic (140 IQ), meticulously evaluating each generated script combination against the following Awareness ABCD criteria. *Where applicable*, provide clear and actionable *recommendations* for improvement.

    **A - Attention**
    *   **Criterion A1 (Impactful Opening):** Does the video hook viewers within the first 5 seconds using compelling visuals like close-ups, fast pacing, and/or off-screen speech?
        *   **Recommendation (If Applicable):** If not, suggest specific visual enhancements. For example, replace a wide shot with a close-up of a person's face, focusing on their eyes or a key expression.
    *   **Criterion A2 (Audio Engagement):** Does the video effectively use audio elements like a narrator, dialogue, music, and/or sound effects to amplify the story and sustain attention?
        *   **Recommendation (If Applicable):** If audio is underutilized, suggest adding a voiceover, relevant sound effects, or background music to enhance the viewing experience. Ensure audio elements complement each other and don't compete.
    *   **Criterion A3 (Visual Interest):** Does the video maintain visual interest throughout with dynamic visuals, varied framing, and captivating imagery?
        *   **Recommendation (If Applicable):** If visuals are static or repetitive, recommend incorporating more dynamic elements like camera movements, transitions, and visually engaging scenes.

    **B - Branding**
    *   **Criterion B1 (Early Branding):** Does the video prominently feature the brand's name, logo, product, or tagline within the first 5 seconds?
        *   **Recommendation (If Applicable):** If not, suggest ways to enhance early brand visibility. For example, enlarge the logo, position it more centrally, or add a subtle animation.
    *   **Criterion B2 (Frequent Branding):** Is the brand integrated at least 3+ times throughout the ad, including the last 5 seconds, using various branding elements like visuals, audio mentions, and product shots?
        *   **Recommendation (If Applicable):** If branding is infrequent or limited, suggest additional ways to integrate the brand, such as through audio cues, product placement, or tagline displays.
    *   **Criterion B3 (Branding Variety):** Does the video utilize a variety of branding assets, including the logo, product, tagline, color palette, audio cues, and even mascots or spokespeople?
        *   **Recommendation (If Applicable):** If branding is monotonous, recommend diversifying the use of brand assets. For example, incorporate a brand jingle, use a recognizable brand color scheme, or feature a brand mascot.

    **C - Connection**
    *   **Criterion C1 (Human Presence):** Does the video feature people, ideally with close-ups of faces, to create an immediate and relatable connection with viewers?
        *   **Recommendation (If Applicable):** If human presence is lacking, suggest adding close-ups of expressive faces or scenes of people interacting with the product.
    *   **Criterion C2 (Context and Relevance):** Does the video clearly show how the product or service fits into people's lives by featuring relatable scenarios and diverse characters?
        *   **Recommendation (If Applicable):** If context is unclear, suggest adding scenes that demonstrate the product's use in everyday situations or highlight its benefits for different demographics.
    *   **Criterion C3 (Simplicity and Differentiation):** Does the video convey a single, focused message in a simple and casual language, while also highlighting what makes the brand or product unique?
        *   **Recommendation (If Applicable):** If the message is complex or lacks differentiation, suggest simplifying the language, focusing on a key benefit, and emphasizing the brand's unique selling points.

    **D - Direction**
    *   **Criterion D1 (Clear Call to Action):** Does the video end with a clear and compelling on-screen call to action that motivates viewers to take the desired next step?
        *   **Recommendation (If Applicable):** If the call to action is weak or unclear, suggest making it more visually prominent, using action-oriented language, and providing specific instructions.

    **Remember:** These criteria are interconnected. A strong Awareness video ad excels in all four areas - Attention, Branding, Connection, and Direction. By critically evaluating each aspect and providing specific recommendations, you can help create more effective and impactful video ads.`,
      },
      consideration: {
        displayName: 'Consideration',
        value: 'consideration',
        promptPart: `1.  **Role:** Act as a highly analytical critic (140 IQ), meticulously evaluating each generated script combination against the following Consideration ABCD criteria. *Where applicable*, provide clear and actionable *recommendations* for improvement.

    **A - Attention**
    *   **Criterion A1 (Immersive Storytelling):** Does the video hook and sustain attention with an immersive story that goes beyond simply showcasing the product?
        *   **Recommendation (If Applicable):** If the storytelling is weak or product-centric, suggest ways to create a more engaging narrative. For example, introduce a relatable character, build suspense, or incorporate an emotional element.
    *   **Criterion A2 (Visual Engagement):** Does the video maintain visual interest throughout with dynamic visuals, varied framing, and captivating imagery?
        *   **Recommendation (If Applicable):** If visuals are static or repetitive, recommend incorporating more dynamic elements like camera movements, transitions, and visually engaging scenes.
    *   **Criterion A3 (Audio Engagement):** Does the video effectively use audio elements like a narrator, dialogue, music, and/or sound effects to amplify the story and sustain attention?
        *   **Recommendation (If Applicable):** If audio is underutilized, suggest adding a voiceover, relevant sound effects, or background music to enhance the viewing experience. Ensure audio elements complement each other and don't compete.

    **B - Branding**
    *   **Criterion B1 (Product as Hero):** Does the video shift the branding focus from the company to the product itself, showcasing its features and benefits in detail?
        *   **Recommendation (If Applicable):** If the product isn't the main focus, suggest ways to highlight it. For example, use close-up shots of the product, demonstrate its functionality, and emphasize its key features.
    *   **Criterion B2 (Consistent Branding):** Does the video maintain strong and consistent branding throughout, especially in the last 5 seconds, by featuring the product, logo, and/or audio mentions?
        *   **Recommendation (If Applicable):** If branding is inconsistent or weak, suggest reinforcing it by closing on the product/logo and using audio mentions in the last 5 seconds.

    **C - Connection**
    *   **Criterion C1 (Show, Don't Just Tell):** Does the video clearly demonstrate how the product works and the benefits it offers through product demos, before/afters, or how-to segments?
        *   **Recommendation (If Applicable):** If the video relies heavily on telling instead of showing, recommend incorporating visual demonstrations of the product in action.
    *   **Criterion C2 (Relatable Scenarios):** Does the video feature relatable scenarios and diverse characters that resonate with the target audience and allow them to envision themselves using the product?
        *   **Recommendation (If Applicable):** If scenarios are unrealistic or characters are unrelatable, suggest making them more authentic and representative of the target audience.
    *   **Criterion C3 (Direct Engagement):** Does the video speak directly to the consumer, break the fourth wall, or use other techniques to create a sense of authenticity and invite viewers into the story?
        *   **Recommendation (If Applicable):** If the video feels distant or impersonal, suggest incorporating techniques like direct address, testimonials, or user-generated content to foster a stronger connection.

    **D - Direction**
    *   **Criterion D1 (Clear Call to Action):** Does the video include a clear and specific call to action, such as "visit site," "sign up," or "buy now," using both visual and audio cues?
        *   **Recommendation (If Applicable):** If the call to action is weak or unclear, suggest making it more prominent, using action-oriented language, and amplifying it with audio.
    *   **Criterion D2 (Sense of Urgency):** Does the video create a sense of urgency by highlighting limited-time offers, limited availability, or specific release dates?
        *   **Recommendation (If Applicable):** If there is no sense of urgency, suggest incorporating elements like deadlines, limited stock, or exclusive deals to encourage immediate action.

    **Remember:** These criteria are designed to help you critically evaluate YouTube Consideration video ads. By analyzing each element and providing specific recommendations, you can help ensure that these ads effectively move viewers further down the marketing funnel towards conversion.
`,
      },
      action: {
        displayName: 'Action',
        value: 'action',
        promptPart: `1.  **Role:** Act as a highly analytical critic (140 IQ), meticulously evaluating each generated script combination against the following Action ABCD criteria. *Where applicable*, provide clear and actionable *recommendations* for improvement.

    **A - Attention**
    *   **Criterion A1 (Viewable Area):** Are all essential visuals, including text and key elements, kept within the viewable area of the screen, especially on mobile devices?
        *   **Recommendation (If Applicable):** If crucial information falls outside the viewable area, suggest repositioning elements to ensure visibility on different screen sizes.
    *   **Criterion A2 (Immersive Storytelling):** Does the video hook and sustain attention with an immersive story that goes beyond simply showcasing the product?
        *   **Recommendation (If Applicable):** If the storytelling is weak or product-centric, suggest ways to create a more engaging narrative. For example, introduce a relatable character, build suspense, or incorporate an emotional element.
    *   **Criterion A3 (Visual Engagement):** Does the video maintain visual interest throughout with dynamic visuals, varied framing, and captivating imagery?
        *   **Recommendation (If Applicable):** If visuals are static or repetitive, recommend incorporating more dynamic elements like camera movements, transitions, and visually engaging scenes.

    **B - Branding**
    *   **Criterion B1 (Product Focus):** Is the product the star of the ad, with minimal distractions from the selling moment?
        *   **Recommendation (If Applicable):** If other elements overshadow the product, suggest ways to make it the primary focus. For example, use extreme close-ups of the product, ensure its visibility from the start, and integrate branding elements subtly within the product's context.
    *   **Criterion B2 (Seamless Branding):** Is branding integrated seamlessly into the ad, supporting the product story rather than distracting from it?
        *   **Recommendation (If Applicable):** If branding feels forced or intrusive, suggest more natural ways to incorporate brand elements. For example, use subtle product placement, integrate brand colors into the scene, or feature the logo on the product itself.

    **C - Connection**
    *   **Criterion C1 (Clarity and Credibility):** Is the value proposition clear, precise, and credible? Does the ad avoid overselling and focus on a single, strong message?
        *   **Recommendation (If Applicable):** If the message is unclear or overwhelming, suggest simplifying the value proposition, focusing on one key benefit, and using clear and concise language.
    *   **Criterion C2 (Tangible Benefits):** Does the ad illustrate specific benefits and show how the product can enhance the consumer's life, rather than relying on nebulous claims?
        *   **Recommendation (If Applicable):** If benefits are not clearly demonstrated, suggest adding scenes that show the product in action, highlight its problem-solving capabilities, or feature testimonials from satisfied customers.
    *   **Criterion C3 (Trust and Authenticity):** Does the ad build trust by showcasing the product in a relatable context, using a confident tone, and providing supporting evidence for claims?
        *   **Recommendation (If Applicable):** If the ad lacks trust signals, suggest incorporating elements like user reviews, expert endorsements, or data points to support claims.

    **D - Direction**
    *   **Criterion D1 (Contextual Call to Action):** Is the call to action presented after the product and its benefits have been established, ensuring that viewers have sufficient context before being asked to act?
        *   **Recommendation (If Applicable):** If the call to action appears too early, suggest repositioning it to come after the product story has been fully developed.
    *   **Criterion D2 (Enticing Incentives):** Does the ad motivate viewers to take action by offering enticing incentives, such as freebies, discounts, or limited-time offers?
        *   **Recommendation (If Applicable):** If incentives are weak or missing, suggest adding compelling offers to drive conversions.
    *   **Criterion D3 (Clear Instructions):** Does the ad demystify the process by clearly explaining how to interact with the brand and under what terms (access, offers, pricing, CTAs)?
        *   **Recommendation (If Applicable):** If the process is unclear, suggest adding specific instructions, visual cues, or demonstrations to guide viewers towards the desired action.

    **Remember:** Action ads are all about driving conversions. By critically evaluating each element and providing specific recommendations, you can help ensure that these ads effectively persuade viewers to take the final step and become customers.
`,
      },
      shorts: {
        displayName: 'YouTube Shorts',
        value: 'shorts',
        promptPart: `1.  **Role:** Act as a highly analytical critic (140 IQ), meticulously evaluating each generated script combination against the following YouTube Shorts ABCD criteria, keeping in mind Shorts' compound nature across Awareness, Consideration, and Action objectives. *Where applicable*, provide clear and actionable *recommendations* for improvement.

    **A - Attention**
    *   **Criterion A1 (Authenticity):** Does the ad feel native to the Shorts experience, blending seamlessly with organic content and avoiding an overly polished or "ad-like" feel?
        *   **Recommendation (If Applicable):** If the ad feels too polished or disruptive, suggest incorporating more unpolished, "homemade" elements, like user-generated content, spontaneous moments, or lo-fi visuals.
    *   **Criterion A2 (Personalization):** Does the ad adopt a personal, peer-to-peer approach, with talent speaking directly to the viewer using casual language and relatable scenarios?
        *   **Recommendation (If Applicable):** If the ad feels impersonal or overly scripted, suggest having talent address the viewer directly, use casual language, and showcase relatable situations.
    *   **Criterion A3 (Upbeat Tone):** Does the ad maintain an upbeat, fun, and entertaining tone, aligning with the overall Shorts experience?
        *   **Recommendation (If Applicable):** If the ad lacks energy or feels too serious, suggest incorporating humor, spontaneous moments, or a faster pace to create a more engaging experience.
    *   **Criterion A4 (Social Elements):** Does the ad encourage social interaction by being shareable, likeable, and participatory?
        *   **Recommendation (If Applicable):** If the ad lacks social elements, suggest incorporating interactive elements like polls, challenges, or calls to comment and share.

    **B - Branding**
    *   **Criterion B1 (Organic Branding):** Is branding integrated organically into the ad, avoiding a forced or disruptive presence?
        *   **Recommendation (If Applicable):** If branding feels intrusive, suggest more subtle ways to integrate it, like through product placement, brand colors, or featuring the logo on the product itself.
    *   **Criterion B2 (Enduring Branding):** Does the ad reinforce branding throughout, particularly at the end, to ensure the brand is remembered?
        *   **Recommendation (If Applicable):** If branding is weak, especially at the end, suggest adding a strong brand presence in the final scene, using elements like the logo, product, or tagline.

    **C - Connection**
    *   **Criterion C1 (Talent as Connector):** Does the ad feature relatable talent, like influencers, creators, or everyday people, who connect with the audience authentically?
        *   **Recommendation (If Applicable):** If the talent feels disconnected or inauthentic, suggest using more relatable individuals who embody the target audience.
    *   **Criterion C2 (Product Integration):** Is the product seamlessly integrated into the ad, with talent demonstrating its use and benefits in a natural and engaging way?
        *   **Recommendation (If Applicable):** If the product feels forced or out of place, suggest having talent interact with it more naturally, showcasing its benefits through demos, stories, or personal experiences.
    *   **Criterion C3 (Clear Value Proposition):** Does the ad clearly and concisely communicate the product's value proposition and benefits, avoiding overwhelming viewers with information?
        *   **Recommendation (If Applicable):** If the value proposition is unclear or overwhelming, suggest focusing on a single key benefit and communicating it in a simple and engaging way.

    **D - Direction**
    *   **Criterion D1 (Compelling Call to Action):** Does the ad include a clear, specific, and relevant call to action that encourages viewers to take the desired next step?
        *   **Recommendation (If Applicable):** If the call to action is weak or unclear, suggest making it more prominent, using action-oriented language, and aligning it with the specific marketing objective (awareness, consideration, or action).
    *   **Criterion D2 (Visual Support):** Is the call to action visually supported with elements like text, icons, or graphics to make it more engaging and noticeable?
        *   **Recommendation (If Applicable):** If the call to action is purely textual or lacks visual appeal, suggest adding visual elements like buttons, arrows, or animations to make it more prominent.

    **Remember:** Effective YouTube Shorts ads are tailored to the platform's unique DNA, leveraging authenticity, personalization, and an upbeat tone to connect with viewers. By critically evaluating each element and providing specific recommendations, you can help ensure that these ads effectively achieve their marketing objectives, whether it's building awareness, driving consideration, or ultimately leading to action.
`,
      },
    },
    textAssetsGenerationPrompt: `You are a leading digital marketer and an expert at crafting high-performing search ad headlines and descriptions that captivate users and drive conversions.
    Follow these instructions in order:

    1. **Analyze the Video**: Carefully analyze the video ad to identify the brand, key products or services, unique selling points, and the core message conveyed.
    2. **Target Audience**: Consider the target audience of the video ad. What are their interests, needs, and pain points? How can the search ads resonate with them?
    {{badExamplePromptPart}}
    3. **Craft Headlines and a Descriptions**: Generate {{desiredCount}} compelling search ad headlines and descriptions based on your analysis. Adhere to these guidelines:
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

    Separate each search ad you output by the value: "## Ad".
    Output in {{videoLanguage}}.
    `,
    textAssetsBadExamplePromptPart:
      "3. **Unwanted Example**: Here's an example of a Headline and Description that I DO NOT want you to generate: Headline: {{headline}} Description: {{description}}",
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
