/**
 * Copyright 2025 Google LLC
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

/// <reference types="jest" />

import { PreviewHelper } from '../src/preview';

describe('PreviewHelper.generateCropCommands', () => {
  const cropAnalysisScale = 720; // CONFIG.defaultVideoHeight (1280x720 preview canvas)
  const sourceHeight = 1080; // e.g., 1920x1080 source video (1.5x scale factor)

  const sampleCropAnalysis: [{ frames: { time: number; x: number }[] }] = [
    {
      frames: [
        { time: 0, x: 400 },
        { time: 1.5, x: 600 },
      ],
    },
  ];

  it('correctly scales crop coordinates for 1:1 (square) format', () => {
    const targetDimensions = { w: sourceHeight, h: sourceHeight }; // 1080x1080
    const result = PreviewHelper.generateCropCommands(
      sampleCropAnalysis,
      targetDimensions,
      cropAnalysisScale
    );

    expect(result).toBe(
      '0 crop x 600, crop y 0, crop w 1080, crop h 1080;\n' +
        '1.5 crop x 900;'
    );
  });

  it('correctly scales crop coordinates for 9:16 (vertical) format using target height', () => {
    const targetDimensions = {
      w: sourceHeight * (9 / 16), // 607.5
      h: sourceHeight, // 1080
    };
    const result = PreviewHelper.generateCropCommands(
      sampleCropAnalysis,
      targetDimensions,
      cropAnalysisScale
    );

    expect(result).toBe(
      '0 crop x 600, crop y 0, crop w 607.5, crop h 1080;\n' +
        '1.5 crop x 900;'
    );
  });

  it('correctly scales crop coordinates for 3:4 format using target height', () => {
    const targetDimensions = {
      w: sourceHeight * (3 / 4), // 810
      h: sourceHeight, // 1080
    };
    const result = PreviewHelper.generateCropCommands(
      sampleCropAnalysis,
      targetDimensions,
      cropAnalysisScale
    );

    expect(result).toBe(
      '0 crop x 600, crop y 0, crop w 810, crop h 1080;\n' +
        '1.5 crop x 900;'
    );
  });

  it('correctly scales crop coordinates for 4:3 format using target height', () => {
    const targetDimensions = {
      w: sourceHeight * (4 / 3), // 1440
      h: sourceHeight, // 1080
    };
    const result = PreviewHelper.generateCropCommands(
      sampleCropAnalysis,
      targetDimensions,
      cropAnalysisScale
    );

    expect(result).toBe(
      '0 crop x 600, crop y 0, crop w 1440, crop h 1080;\n' +
        '1.5 crop x 900;'
    );
  });
});
