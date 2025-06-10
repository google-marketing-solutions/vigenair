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
    files: {
      subtitles: 'input.vtt',
      analysis: 'analysis.json',
      data: 'data.json',
      presplit: 'presplit_data.json',
      split: '_split.json',
      combos: 'combos.json',
      render: 'render.json',
      approval: 'approval.json',
      formats: {
        square: 'square.txt',
        vertical: 'vertical.txt',
      },
    },
  },
  vertexAi: {
    endpoint: 'aiplatform.googleapis.com',
    projectId: '<gcp-project-id>',
    location: '<vertexai-region>',
    quotaLimitDelay: 10 * 1000, // 10s,
    model: 'gemini-2.0-flash',
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

    **Phase 2: Expert Critique (Rigorous Evaluation and Recommendations), Scoring and Justification (Detailed Analysis)**

    {{{{generationEvalPromptPart}}}}

    **Constraints (Strictly Enforce):**
        *   Each combination must include *more than one scene* but *never all scenes* from the original script.
        *   Each combination *must* fall within the specified duration range: {{expectedDurationRange}}.

    **Output Format (Strictly Enforce):**

    For each generated combination, present the following information in this *exact* format:
    Title: [Concise and descriptive title in {{videoLanguage}}]
    Scenes: [Comma-separated list of scene numbers included (no "Scene" prefix)]
    Reasoning: [Detailed explanation of the combination's coherence, engagement, and effectiveness]
    Score: [Numerical score (1-5) derived from the total score of all criteria]
    Duration: [Calculated duration of the combination in seconds]
    ABCD: [Detailed evaluation per criterion and reasoning for your score, including specific examples from the combination that support your evaluation]

    Separate each combination with the delimiter: "## Combination".
    Any deviation from this format will be considered a failure.


    **Input:**

    Original Script ({{videoScript}}): {{{{videoScript}}}}
    User Directive ({{userPrompt}}): {{{{userPrompt}}}}
    Desired Duration ({{desiredDuration}}): {{{{desiredDuration}}}}
    Expected Duration Range ({{expectedDurationRange}}): {{{{expectedDurationRange}}}}
    Video Language ({{videoLanguage}}): {{{{videoLanguage}}}}


    `,
    abcdBusinessObjectives: {
      awareness: {
        displayName: 'Awareness',
        value: 'awareness',
        promptPart: `1.  **Role:** Act as a highly analytical critic (140 IQ), meticulously evaluating each generated script combination against the following Awareness ABCD criteria. For each criterion, assign a score based on how well the video fulfills it, and provide specific recommendations for improvement *only where applicable*.
    *   **A - Attention (0-5 points):**
        *   **Impactful Opening (0-2 points):**
            *   **2 points:** The video begins with a compelling opening that immediately grabs attention within the first 5 seconds, utilizing elements like close-ups, fast pacing, tight framing, and/or off-screen speech.
            *   **1 point:** The opening has some attention-grabbing elements but could be improved with more dynamic visuals or a faster pace.
            *   **0 points:** The opening fails to capture attention within the first 5 seconds.
            *   **Recommendation (If Applicable):** If the opening is deemed weak (e.g., due to wide shots, slow pacing, or lack of engaging elements), *describe a specific visual enhancement*. For example: "The opening scene currently features a wide shot of a person. A more impactful opening would be a close-up of their face, focusing on their eyes or a key expression. This would create immediate engagement with the viewer."
        *   **Audio Engagement (0-2 points):**
            *   **2 points:** The video effectively uses audio elements like a narrator, dialogue, music, and/or sound effects to amplify the story and sustain attention throughout.
            *   **1 point:** The video uses some audio elements, but there's room for improvement in incorporating more engaging sound effects or music.
            *   **0 points:** The video lacks engaging audio elements or has poorly balanced sound.
            *   **Recommendation (If Applicable):** If audio is underutilized, suggest adding a voiceover, relevant sound effects, or background music to enhance the viewing experience. Ensure audio elements complement each other and don't compete.
        *   **Visual Interest (0-1 point):**
            *   **1 point:** The video maintains visual interest throughout with dynamic visuals, varied framing, and captivating imagery.
            *   **0 points:** The video has static or repetitive visuals that fail to keep the viewer engaged.
            *   **Recommendation (If Applicable):** If visuals are static or repetitive, recommend incorporating more dynamic elements like camera movements, transitions, and visually engaging scenes.
    *   **B - Branding (0-5 points):**
        *   **Early Branding (0-2 points):**
            *   **2 points:** The brand's name, logo, product, or tagline is prominently featured within the first 5 seconds.
            *   **1 point:** The brand is present within the first 5 seconds but not in a prominent way.
            *   **0 points:** The brand fails to appear within the first 5 seconds.
            *   **Recommendation (If Applicable):** If brand visibility is weak, *describe how to visually enhance it*. For example: "The brand logo appears small and in the background. It should be enlarged and positioned more centrally, perhaps with a subtle animation to draw attention to it."
        *   **Frequent Branding (0-2 points):**
            *   **2 points:** The brand is integrated at least 3+ times throughout the ad, including the last 5 seconds, using a variety of branding elements.
            *   **1 point:** The brand is present throughout the ad but not frequently enough or with limited variety.
            *   **0 points:** The brand has minimal presence throughout the ad.
            *   **Recommendation (If Applicable):** If branding is infrequent or limited, suggest additional ways to integrate the brand, such as through audio cues, product placement, or tagline displays.
        *   **Branding Variety (0-1 point):**
            *   **1 point:** The video utilizes a variety of branding assets, including the logo, product, tagline, color palette, audio cues, and even mascots or spokespeople.
            *   **0 points:** The video relies on repetitive branding elements.
            *   **Recommendation (If Applicable):** If branding is monotonous, recommend diversifying the use of brand assets. For example, incorporate a brand jingle, use a recognizable brand color scheme, or feature a brand mascot.
    *   **C - Connection (0-5 points):**
        *   **Human Presence (0-2 points):**
            *   **2 points:** The video features people, ideally with close-ups of faces, to create an immediate and relatable connection with viewers.
            *   **1 point:** The video includes people but lacks close-ups or emotional engagement.
            *   **0 points:** The video lacks any human presence.
            *   **Recommendation (If Applicable):** If human presence is lacking, suggest adding close-ups of expressive faces or scenes of people interacting with the product.
        *   **Context and Relevance (0-1 point):**
            *   **1 point:** The video clearly shows how the product or service fits into people's lives by featuring relatable scenarios and diverse characters.
            *   **0 points:** The video lacks context or features unrealistic scenarios.
            *   **Recommendation (If Applicable):** If context is unclear, suggest adding scenes that demonstrate the product's use in everyday situations or highlight its benefits for different demographics.
        *   **Simplicity and Differentiation (0-2 points):**
            *   **2 points:** The video conveys a single, focused message in simple and casual language, while also highlighting what makes the brand or product unique.
            *   **1 point:** The message is somewhat clear but may be too complex or lack differentiation.
            *   **0 points:** The message is unclear, overwhelming, or fails to differentiate the brand.
            *   **Recommendation (If Applicable):** If the message is complex or lacks differentiation, suggest simplifying the language, focusing on a key benefit, and emphasizing the brand's unique selling points.
    *   **D - Direction (0-2 points):**
        *   **Clear Call to Action (0-2 points):**
            *   **2 points:** The video ends with a clear and compelling on-screen call to action that motivates viewers to take the desired next step.
            *   **1 point:** The video includes a call to action, but it could be more prominent or specific.
            *   **0 points:** The video lacks a clear call to action.
            *   **Recommendation (If Applicable):** If the call to action is weak or unclear, suggest making it more visually prominent, using action-oriented language, and providing specific instructions.

    **Remember:** These criteria are interconnected. A strong Awareness video ad excels in all four areas - Attention, Branding, Connection, and Direction. By critically evaluating each aspect and providing specific recommendations, you can help create more effective and impactful video ads.
2.  **Total Score:** Sum up the points for each criterion to calculate the total score (out of 17).
3.  **Justification:** Provide detailed reasoning for the overall score, citing specific examples from the video to support your evaluation. Be precise and analytical, focusing on the strengths and weaknesses of the ad in relation to the Awareness objective.`,
      },
      consideration: {
        displayName: 'Consideration',
        value: 'consideration',
        promptPart: `1.  **Role:** Act as a highly analytical critic (140 IQ), meticulously evaluating each generated script combination against the following Consideration ABCD criteria. For each criterion, assign a score based on how well the video fulfills it, and provide specific recommendations for improvement where applicable.
    *   **A - Attention (0-5 points):**
        *   **Immersive Storytelling (0-2 points):**
            *   **2 points:** The video hooks and sustains attention with an immersive story that goes beyond simply showcasing the product.
            *   **1 point:** The video tells a story, but it could be more engaging or less product-focused.
            *   **0 points:** The video lacks a compelling story or focuses solely on showcasing the product.
            *   **Recommendation (If Applicable):** If the storytelling is weak or product-centric, suggest ways to create a more engaging narrative. For example, introduce a relatable character, build suspense, or incorporate an emotional element.
        *   **Visual Engagement (0-2 points):**
            *   **2 points:** The video maintains visual interest throughout with dynamic visuals, varied framing, and captivating imagery.
            *   **1 point:** The video has some visually engaging elements but could be more dynamic.
            *   **0 points:** The video has static or repetitive visuals.
            *   **Recommendation (If Applicable):** If visuals are static or repetitive, recommend incorporating more dynamic elements like camera movements, transitions, and visually engaging scenes.
        *   **Audio Engagement (0-1 point):**
            *   **1 point:** The video effectively uses audio elements like a narrator, dialogue, music, and/or sound effects to amplify the story and sustain attention.
            *   **0 points:** The video lacks engaging audio elements or has poorly balanced sound.
            *   **Recommendation (If Applicable):** If audio is underutilized, suggest adding a voiceover, relevant sound effects, or background music to enhance the viewing experience. Ensure audio elements complement each other and don't compete.
    *   **B - Branding (0-3 points):**
        *   **Product as Hero (0-2 points):**
            *   **2 points:** The video shifts the branding focus from the company to the product itself, showcasing its features and benefits in detail.
            *   **1 point:** The product is featured, but the branding focus is not entirely on the product.
            *   **0 points:** The video fails to make the product the hero of the ad.
            *   **Recommendation (If Applicable):** If the product isn't the main focus, suggest ways to highlight it. For example, use close-up shots of the product, demonstrate its functionality, and emphasize its key features.
        *   **Consistent Branding (0-1 point):**
            *   **1 point:** The video maintains strong and consistent branding throughout, especially in the last 5 seconds, by featuring the product, logo, and/or audio mentions.
            *   **0 points:** The video has inconsistent or weak branding.
            *   **Recommendation (If Applicable):** If branding is inconsistent or weak, suggest reinforcing it by closing on the product/logo and using audio mentions in the last 5 seconds.
    *   **C - Connection (0-5 points):**
        *   **Show, Don't Just Tell (0-2 points):**
            *   **2 points:** The video clearly demonstrates how the product works and the benefits it offers through product demos, before/afters, or how-to segments.
            *   **1 point:** The video shows some product functionality but could be more demonstrative.
            *   **0 points:** The video relies heavily on telling instead of showing.
            *   **Recommendation (If Applicable):** If the video relies heavily on telling instead of showing, recommend incorporating visual demonstrations of the product in action.
        *   **Relatable Scenarios (0-1 point):**
            *   **1 point:** The video features relatable scenarios and diverse characters that resonate with the target audience.
            *   **0 points:** The video lacks relatable scenarios or features unrealistic characters.
            *   **Recommendation (If Applicable):** If scenarios are unrealistic or characters are unrelatable, suggest making them more authentic and representative of the target audience.
        *   **Direct Engagement (0-2 points):**
            *   **2 points:** The video speaks directly to the consumer, breaks the fourth wall, or uses other techniques to create a sense of authenticity and invite viewers into the story.
            *   **1 point:** The video attempts to engage the viewer but could be more direct or authentic.
            *   **0 points:** The video feels distant or impersonal.
            *   **Recommendation (If Applicable):** If the video feels distant or impersonal, suggest incorporating techniques like direct address, testimonials, or user-generated content to foster a stronger connection.
    *   **D - Direction (0-3 points):**
        *   **Clear Call to Action (0-2 points):**
            *   **2 points:** The video includes a clear and specific call to action, such as "visit site", "sign up", or "buy now", using both visual and audio cues.
            *   **1 point:** The call to action is present but could be more prominent or specific.
            *   **0 points:** The video lacks a clear call to action.
            *   **Recommendation (If Applicable):** If the call to action is weak or unclear, suggest making it more prominent, using action-oriented language, and amplifying it with audio.
        *   **Sense of Urgency (0-1 point):**
            *   **1 point:** The video creates a sense of urgency by highlighting limited-time offers, limited availability, or specific release dates.
            *   **0 points:** The video lacks any sense of urgency.
            *   **Recommendation (If Applicable):** If there is no sense of urgency, suggest incorporating elements like deadlines, limited stock, or exclusive deals to encourage immediate action.

    **Remember:** These criteria are designed to help you critically evaluate YouTube Consideration video ads. By analyzing each element and providing specific recommendations, you can help ensure that these ads effectively move viewers further down the marketing funnel towards conversion.
2.  **Total Score:** Sum up the points for each criterion to calculate the total score (out of 16).
3.  **Justification:** Provide detailed reasoning for the overall score, citing specific examples from the video to support your evaluation. Be precise and analytical, focusing on the strengths and weaknesses of the ad in relation to the Consideration objective.`,
      },
      action: {
        displayName: 'Action',
        value: 'action',
        promptPart: `1.  **Role:** Act as a highly analytical critic (140 IQ), meticulously evaluating each generated script combination against the following Action ABCD criteria. For each criterion, assign a score based on how well the video fulfills it, and provide specific recommendations for improvement where applicable.
    *   **A - Attention (0-5 points):**
        *   **Viewable Area (0-1 point):**
            *   **1 point:** All essential visuals, including text and key elements, are kept within the viewable area of the screen.
            *   **0 points:** Crucial information falls outside the viewable area.
            *   **Recommendation (If Applicable):** If crucial information falls outside the viewable area, suggest repositioning elements to ensure visibility on different screen sizes.
        *   **Immersive Storytelling (0-2 points):**
            *   **2 points:** The video hooks and sustains attention with an immersive story.
            *   **1 point:** The video tells a story, but it could be more engaging.
            *   **0 points:** The video lacks a compelling story.
            *   **Recommendation (If Applicable):** If the storytelling is weak, suggest ways to create a more engaging narrative. For example, introduce a relatable character or build suspense.
        *   **Visual Engagement (0-2 points):**
            *   **2 points:** The video maintains visual interest with dynamic visuals and varied framing.
            *   **1 point:** The video has some visually engaging elements but could be more dynamic.
            *   **0 points:** The video has static or repetitive visuals.
            *   **Recommendation (If Applicable):** If visuals are static or repetitive, recommend incorporating more dynamic elements like camera movements and transitions.
    *   **B - Branding (0-3 points):**
        *   **Product Focus (0-2 points):**
            *   **2 points:** The product is the star of the ad, with minimal distractions.
            *   **1 point:** The product is featured, but other elements distract from it.
            *   **0 points:** The ad fails to make the product the central focus.
            *   **Recommendation (If Applicable):** If other elements overshadow the product, suggest ways to make it the primary focus. For example, use extreme close-ups and integrate branding subtly.
        *   **Seamless Branding (0-1 point):**
            *   **1 point:** Branding is integrated seamlessly, supporting the product story.
            *   **0 points:** Branding feels forced or intrusive.
            *   **Recommendation (If Applicable):** If branding feels forced, suggest more natural ways to incorporate brand elements, like subtle product placement or brand colors.
    *   **C - Connection (0-5 points):**
        *   **Clarity and Credibility (0-2 points):**
            *   **2 points:** The value proposition is clear, precise, and credible, with a focus on a single, strong message.
            *   **1 point:** The message is somewhat clear but may be too complex or lack focus.
            *   **0 points:** The message is unclear or overwhelming.
            *   **Recommendation (If Applicable):** If the message is unclear, suggest simplifying the value proposition and focusing on one key benefit.
        *   **Tangible Benefits (0-1 point):**
            *   **1 point:** The ad illustrates specific benefits and shows how the product enhances the consumer's life.
            *   **0 points:** The ad relies on nebulous claims or doesn't show the product's benefits.
            *   **Recommendation (If Applicable):** If benefits are not clearly demonstrated, suggest adding scenes that show the product in action or highlight its problem-solving capabilities.
        *   **Trust and Authenticity (0-2 points):**
            *   **2 points:** The ad builds trust by showcasing the product in a relatable context, using a confident tone, and providing supporting evidence for claims.
            *   **1 point:** The ad has some trust-building elements but could be more relatable or provide more evidence.
            *   **0 points:** The ad lacks trust signals or feels inauthentic.
            *   **Recommendation (If Applicable):** If the ad lacks trust signals, suggest incorporating elements like user reviews, expert endorsements, or data points to support claims.
    *   **D - Direction (0-5 points):**
        *   **Contextual Call to Action (0-1 point):**
            *   **1 point:** The call to action is presented after the product and its benefits have been established.
            *   **0 points:** The call to action appears too early.
            *   **Recommendation (If Applicable):** If the call to action appears too early, suggest repositioning it to come after the product story.
        *   **Enticing Incentives (0-2 points):**
            *   **2 points:** The ad motivates viewers with enticing incentives, like freebies, discounts, or limited-time offers.
            *   **1 point:** The ad includes incentives, but they could be more compelling.
            *   **0 points:** The ad lacks incentives.
            *   **Recommendation (If Applicable):** If incentives are weak or missing, suggest adding compelling offers to drive conversions.
        *   **Clear Instructions (0-2 points):**
            *   **2 points:** The ad clearly explains how to interact with the brand and under what terms.
            *   **1 point:** The process is somewhat clear but could be more explicit.
            *   **0 points:** The ad fails to provide clear instructions.
            *   **Recommendation (If Applicable):** If the process is unclear, suggest adding specific instructions, visual cues, or demonstrations.

    **Remember:** Action ads are all about driving conversions. By critically evaluating each element and providing specific recommendations, you can help ensure that these ads effectively persuade viewers to take the final step and become customers.
2.  **Total Score:** Sum up the points for each criterion to calculate the total score (out of 18).
3.  **Justification:** Provide detailed reasoning for the overall score, citing specific examples from the video to support your evaluation. Be precise and analytical, focusing on the strengths and weaknesses of the ad in relation to the Action objective.`,
      },
      shorts: {
        displayName: 'YouTube Shorts',
        value: 'shorts',
        promptPart: `1.  **Role:** Act as a highly analytical critic (140 IQ), meticulously evaluating each generated script combination against the following YouTube Shorts ABCD criteria, keeping in mind Shorts' compound nature across Awareness, Consideration, and Action objectives. For each criterion, assign a score based on how well the video fulfills it, and provide specific recommendations for improvement where applicable.
    *   **A - Attention (0-6 points):**
        *   **Authenticity (0-2 points):**
            *   **2 points:** The ad feels native to the Shorts experience, blending seamlessly with organic content and avoiding an overly polished or "ad-like" feel.
            *   **1 point:** The ad has some authentic elements but could be less polished or disruptive.
            *   **0 points:** The ad feels overly polished, disruptive, or like a traditional ad.
            *   **Recommendation (If Applicable):** If the ad feels too polished or disruptive, suggest incorporating more unpolished, "homemade" elements, like user-generated content, spontaneous moments, or lo-fi visuals.
        *   **Personalization (0-2 points):**
            *   **2 points:** The ad adopts a personal, peer-to-peer approach, with talent speaking directly to the viewer using casual language and relatable scenarios.
            *   **1 point:** The ad has some personal elements but could be more conversational or relatable.
            *   **0 points:** The ad feels impersonal or overly scripted.
            *   **Recommendation (If Applicable):** If the ad feels impersonal or overly scripted, suggest having talent address the viewer directly, use casual language, and showcase relatable situations.
        *   **Upbeat Tone (0-1 point):**
            *   **1 point:** The ad maintains an upbeat, fun, and entertaining tone.
            *   **0 points:** The ad lacks energy or feels too serious.
            *   **Recommendation (If Applicable):** If the ad lacks energy, suggest incorporating humor, spontaneous moments, or a faster pace.
        *   **Social Elements (0-1 point):**
            *   **1 point:** The ad encourages social interaction by being shareable, likeable, and participatory.
            *   **0 points:** The ad lacks social elements.
            *   **Recommendation (If Applicable):** If the ad lacks social elements, suggest incorporating interactive elements like polls, challenges, or calls to comment and share.
    *   **B - Branding (0-3 points):**
        *   **Organic Branding (0-2 points):**
            *   **2 points:** Branding is integrated organically into the ad, avoiding a forced or disruptive presence.
            *   **1 point:** Branding is present but could be more seamlessly integrated.
            *   **0 points:** Branding feels forced or disruptive.
            *   **Recommendation (If Applicable):** If branding feels intrusive, suggest more subtle ways to integrate it, like through product placement or brand colors.
        *   **Enduring Branding (0-1 point):**
            *   **1 point:** The ad reinforces branding throughout, particularly at the end.
            *   **0 points:** The ad has weak branding, especially at the end.
            *   **Recommendation (If Applicable):** If branding is weak, suggest adding a strong brand presence in the final scene.
    *   **C - Connection (0-5 points):**
        *   **Talent as Connector (0-2 points):**
            *   **2 points:** The ad features relatable talent who connect with the audience authentically.
            *   **1 point:** The talent is present but could be more relatable or authentic.
            *   **0 points:** The ad lacks relatable talent or features inauthentic personalities.
            *   **Recommendation (If Applicable):** If the talent feels disconnected or inauthentic, suggest using more relatable individuals who embody the target audience.
        *   **Product Integration (0-1 point):**
            *   **1 point:** The product is seamlessly integrated into the ad, with talent demonstrating its use and benefits in a natural and engaging way.
            *   **0 points:** The product feels forced or out of place.
            *   **Recommendation (If Applicable):** If the product feels forced, suggest having talent interact with it more naturally, showcasing its benefits through demos or stories.
        *   **Clear Value Proposition (0-2 points):**
            *   **2 points:** The ad clearly and concisely communicates the product's value proposition and benefits.
            *   **1 point:** The value proposition is present but could be clearer or more concise.
            *   **0 points:** The ad fails to clearly communicate the value proposition.
            *   **Recommendation (If Applicable):** If the value proposition is unclear, suggest focusing on a single key benefit and communicating it simply.
    *   **D - Direction (0-3 points):**
        *   **Compelling Call to Action (0-2 points):**
            *   **2 points:** The ad includes a clear, specific, and relevant call to action.
            *   **1 point:** The call to action is present but could be more compelling or specific.
            *   **0 points:** The ad lacks a clear call to action.
            *   **Recommendation (If Applicable):** If the call to action is weak, suggest making it more prominent, using action-oriented language, and aligning it with the marketing objective.
        *   **Visual Support (0-1 point):**
            *   **1 point:** The call to action is visually supported with elements like text, icons, or graphics.
            *   **0 points:** The call to action lacks visual support.
            *   **Recommendation (If Applicable):** If the call to action lacks visual appeal, suggest adding visual elements like buttons or animations.

    **Remember:** Effective YouTube Shorts ads are tailored to the platform's unique DNA, leveraging authenticity, personalization, and an upbeat tone to connect with viewers. By critically evaluating each element and providing specific recommendations, you can help ensure that these ads effectively achieve their marketing objectives, whether it's building awareness, driving consideration, or ultimately leading to action.
2.  **Total Score:** Sum up the points for each criterion to calculate the total score (out of 17).
3.  **Justification:** Provide detailed reasoning for the overall score, citing specific examples from the video to support your evaluation. Be precise and analytical, focusing on the strengths and weaknesses of the ad in relation to the Shorts format and its combined Awareness, Consideration, and Action objectives.`,
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
  defaultTranscriptionService: 'gemini', // whisper | gemini
  defaultCacheExpiration: 60, // in seconds
  defaultDuration: 30, // in seconds
  retryDelay: 6000, // in milliseconds
  maxRetries: 600,
  maxRetriesAppsScript: 5,
  debug: true,
  googleClientId: '<google-oauth-client-id>',
};
