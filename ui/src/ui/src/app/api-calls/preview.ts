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

import { PreviewWeights } from './api-calls.service.interface';
import { CONFIG } from '../../../../config';
import { Timestamp, TimeUtil } from '../../../../time-util';

export interface AvSegment {
  av_segment_id: string;
  description: string;
  visual_segment_ids: number[];
  audio_segment_ids: number[];
  start_s: number;
  end_s: number;
  duration_s: number;
  transcript: string[];
  labels: string[];
  objects: string[];
  text: string[];
  logos: string[];
  details: string[];
  keywords: string;
}

interface SegmentDetection {
  segment: Segment;
  confidence: number;
}

interface Entity {
  entity_id: string;
  description: string;
  language_code: string;
}

interface SegmentAnnotation {
  entity: Entity;
  category_entities: Entity[];
  segments: SegmentDetection[];
}

interface SegmentAnnotation {
  entity: Entity;
  category_entities: Entity[];
  segments: SegmentDetection[];
}

interface ObjectDetection {
  time_offset: Timestamp;
  normalized_bounding_box?: BoundingBox;
  rotated_bounding_box?: {
    vertices: [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
    ];
  };
  attributes?: { name: string; confidence: number }[];
}

interface BoundingBox {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}


interface FrameDetection {
  time_offset: Timestamp;
  confidence: number;
}

interface ObjectAnnotation {
  entity: Entity;
  confidence: number;
  frames: ObjectDetection[];
  segment: Segment;
}

interface FrameAnnotation {
  entity: Entity;
  frames: FrameDetection[];
}

interface FaceAnnotation {
  tracks: {
    segment: Segment;
    timestamped_objects: ObjectDetection[];
    confidence: number;
  }[];
}

interface TextAnnotation {
  text: string;
  segments: (SegmentDetection & { frames: ObjectDetection[] })[];
}

export interface VideoIntelligence {
  annotation_results: [
    {
      input_uri: string;
      segment: Segment;
      segment_label_annotations?: SegmentAnnotation[];
      shot_label_annotations?: SegmentAnnotation[];
      object_annotations?: ObjectAnnotation[];
      frame_label_annotations?: FrameAnnotation[];
      face_detection_annotations?: FaceAnnotation[];
      shot_annotations?: Segment[];
      text_annotations?: TextAnnotation[];
      error?: {
        code: number;
        message: string;
        details: { type_url: string; value: string }[];
      };
    },
  ];
}

interface Segment {
  start_time_offset: Timestamp;
  end_time_offset: Timestamp;
}



export class PreviewHelper {
  static getBoundsFromVertices(vertices: { x?: number; y?: number }[]) {
    const X = vertices.map(v => v.x ?? 0);
    const Y = vertices.map(v => v.y ?? 0);
    return {
      top: Math.min(...Y),
      bottom: Math.max(...Y),
      left: Math.min(...X),
      right: Math.max(...X),
    };
  }

  static getFrameObjectInfo(
    frames: {
      timestamp: number;
      bounds: { left: number; right: number; top: number; bottom: number };
      confidence: number;
    }[],
    within?: { start: number; end: number }
  ) {
    const frameCount = frames.length;
    if (frameCount < 1) {
      return {
        windowStart: 0,
        windowEnd: 0,
        framesStart: 0,
        framesEnd: 0,
        frameCount: 0,
        framesTimeFraction: 0,
        framesAreaMax: 0,
        framesAreaAvg: 0,
        framesCenterAvg: { x: 0, y: 0 },
        framesConfidenceAvg: 0,
        framesConfidenceMax: 0,
        prominenceAvg: 0,
        prominenceMax: 0,
      };
    }
    const windowStart = within?.start ?? frames[0]?.timestamp ?? 0;
    const windowEnd = within?.end ?? frames.slice(-1)[0]?.timestamp ?? 0;
    const windowDuration = windowEnd - windowStart;

    const framesStart = frames[0]?.timestamp ?? 0;
    const framesEnd = frames.slice(-1)[0]?.timestamp ?? 0;
    const framesDuration = framesEnd - framesStart;

    const framesTimeFraction = framesDuration / windowDuration;
    const framesConfidenceMax = frames.reduce(
      (max, f) => Math.max(max, f.confidence),
      0
    );
    const framesConfidenceAvg =
      frames.reduce((sum, f) => sum + f.confidence, 0) / frameCount;
    const framesAreaFractions = frames.map(
      f => (f.bounds.bottom - f.bounds.top) * (f.bounds.right - f.bounds.left)
    );
    const framesAreaMax = framesAreaFractions.reduce(
      (maxArea, frameArea) => Math.max(maxArea, frameArea),
      0
    );
    const framesCenters = frames.map(f => ({
      y: (f.bounds.bottom + f.bounds.top) * 0.5,
      x: (f.bounds.right + f.bounds.left) * 0.5,
    }));
    const framesCenterSum = framesCenters.reduce(
      (sumCenter, center) => ({
        x: sumCenter.x + center.x,
        y: sumCenter.y + center.y,
      }),
      { x: 0, y: 0 }
    );
    const framesCenterAvg = {
      x: framesCenterSum.x / frameCount,
      y: framesCenterSum.y / frameCount,
    };

    const framesAreaAvg =
      framesAreaFractions.reduce(
        (sumArea, frameArea) => sumArea + frameArea,
        0
      ) / frameCount;
    const prominenceAvg =
      framesTimeFraction * framesAreaAvg * framesConfidenceAvg;
    const prominenceMax =
      framesTimeFraction * framesAreaMax * framesConfidenceMax;

    return {
      windowStart,
      windowEnd,
      framesStart,
      framesEnd,
      frameCount,
      framesTimeFraction,
      framesAreaMax,
      framesAreaAvg,
      framesCenterAvg,
      framesConfidenceAvg,
      framesConfidenceMax,
      prominenceAvg,
      prominenceMax,
    };
  }

  static getAllFaceFrames(
    intelligence: VideoIntelligence,
    confidence = CONFIG.videoIntelligenceConfidenceThreshold
  ) {
    return intelligence.annotation_results
      .filter(a => !!a.face_detection_annotations)
      .map(a => {
        return a.face_detection_annotations!.map((fa, annotation_index) => {
          return fa.tracks
            .filter(t => t.confidence >= confidence)
            .map((t, track_index) => {
              return t.timestamped_objects
                .filter(o => !!o.normalized_bounding_box)
                .map(o => {
                  return {
                    annotation_id: annotation_index,
                    track_id: track_index,
                    timestamp: TimeUtil.timestampToSeconds(o.time_offset),
                    bounds: {
                      left: 0,
                      top: 0,
                      right: 0,
                      bottom: 0,
                      ...o.normalized_bounding_box,
                    },
                    attributes:
                      o.attributes
                        ?.filter(a => a.confidence >= confidence)
                        .map(a => a.name) ?? [],
                    confidence: t.confidence,
                  };
                });
            });
        });
      })
      .flat(3);
  }

  static getAllShots(intelligence: VideoIntelligence) {
    return intelligence.annotation_results
      .filter(a => !!a.shot_annotations)
      .map(a => {
        return a.shot_annotations!.map((s, i) => {
          return {
            id: i + 1,
            start: TimeUtil.timestampToSeconds(s.start_time_offset),
            end: TimeUtil.timestampToSeconds(s.end_time_offset),
          };
        });
      })
      .flat(1);
  }

  static getAllObjectFrames(
    intelligence: VideoIntelligence,
    confidence = CONFIG.videoIntelligenceConfidenceThreshold
  ) {
    return intelligence.annotation_results
      .filter(a => !!a.object_annotations)
      .map(a =>
        a
          .object_annotations!.filter(oa => oa.confidence >= confidence)
          .map((oa, annotation_index) => {
            return oa.frames.map(f => ({
              annotation_id: annotation_index,
              object: oa.entity.description,
              bounds: {
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                ...f.normalized_bounding_box,
              },
              timestamp: TimeUtil.timestampToSeconds(f.time_offset),
              confidence: oa.confidence,
            }));
          })
      )
      .flat(2);
  }

  static getAllTextFrames(
    intelligence: VideoIntelligence,
    confidence = CONFIG.videoIntelligenceConfidenceThreshold
  ) {
    return intelligence.annotation_results
      .filter(a => !!a.text_annotations)
      .map(a => {
        return a.text_annotations!.map((ta, annotation_index) => {
          return ta.segments
            .filter(s => s.confidence >= confidence)
            .map(s => {
              return s.frames.map(f => {
                return {
                  annotation_id: annotation_index,
                  object: ta.text,
                  bounds: PreviewHelper.getBoundsFromVertices(
                    f.rotated_bounding_box!.vertices
                  ),
                  timestamp: TimeUtil.timestampToSeconds(f.time_offset),
                  confidence: s.confidence,
                };
              });
            });
        });
      })
      .flat(3);
  }

  static createPreview(
    segments: AvSegment[],
    intelligence: VideoIntelligence,
    source_dimensions: { w: number; h: number },
    target_dimensions: { w: number; h: number },
    weights: PreviewWeights
  ) {
    const allShots = PreviewHelper.getAllShots(intelligence);
    const allFaces = PreviewHelper.getAllFaceFrames(intelligence);
    const allObjects = PreviewHelper.getAllObjectFrames(intelligence);
    const allText = PreviewHelper.getAllTextFrames(intelligence);

    const cropAreaAnnotation: ObjectAnnotation = {
      entity: {
        entity_id: '',
        description: 'crop-area',
        language_code: 'en-US',
      },
      confidence: 1,
      frames: [],
      segment: {
        start_time_offset: {},
        end_time_offset:
          intelligence.annotation_results[0].segment.end_time_offset,
      },
    };

    segments.forEach((segment: AvSegment) => {
      const segmentShotIds = new Set(segment.visual_segment_ids);
      const segmentShots = allShots.filter(s => segmentShotIds.has(s.id));

      const cogs = segmentShots.map(shot => {
        const cogs: {
          x: number;
          y: number;
          w: number;
        }[] = [];

        const shotTexts = allText.filter(
          f => f.timestamp >= shot.start && f.timestamp <= shot.end
        );
        const shotTextIds = [...new Set(shotTexts.map(t => t.annotation_id))];
        shotTextIds.forEach(id => {
          const shotText = shotTexts.filter(t => t.annotation_id === id);
          const info = PreviewHelper.getFrameObjectInfo(shotText, shot);
          cogs.push({
            x: info.framesCenterAvg.x,
            y: info.framesCenterAvg.y,
            w: info.prominenceMax * weights.text,
          });
        });

        const shotFaces = allFaces.filter(
          f => f.timestamp >= shot.start && f.timestamp <= shot.end
        );
        const shotFaceIds = [...new Set(shotFaces.map(s => s.annotation_id))];
        shotFaceIds.forEach(id => {
          const shotFace = shotFaces.filter(f => f.annotation_id === id);
          const info = PreviewHelper.getFrameObjectInfo(shotFace, shot);
          cogs.push({
            x: info.framesCenterAvg.x,
            y: info.framesCenterAvg.y,
            w: info.prominenceMax * weights.face,
          });
        });

        const shotObjects = allObjects.filter(
          f => f.timestamp >= shot.start && f.timestamp <= shot.end
        );
        const shotObjectIds = [
          ...new Set(shotObjects.map(o => o.annotation_id)),
        ];
        shotObjectIds.forEach(id => {
          const shotObject = shotObjects.filter(o => o.annotation_id === id);
          const info = PreviewHelper.getFrameObjectInfo(shotObject, shot);
          const objectWeights = weights.objects as Record<string, number>;
          cogs.push({
            x: info.framesCenterAvg.x,
            y: info.framesCenterAvg.y,
            w: info.prominenceMax * (objectWeights[shotObject[0].object] || 1),
          });
        });

        const W = cogs.reduce((w, c) => w + c.w, 0);
        const x = W > 0 ? cogs.reduce((x, c) => x + c.x * c.w, 0) / W : 0.5;
        const y = W > 0 ? cogs.reduce((y, c) => y + c.y * c.w, 0) / W : 0.5;

        return { x, y, start: shot.start, end: shot.end, id: shot.id };
      });

      cogs.forEach(cog => {
        const halfW = target_dimensions.w * 0.5;
        const absX = cog.x * source_dimensions.w;
        const cogLeft = Math.round(
          Math.max(
            0,
            Math.min(absX - halfW, source_dimensions.w - target_dimensions.w)
          )
        );
        const cogBounds = {
          left: cogLeft,
          right: cogLeft + target_dimensions.w,
          top: 0,
          bottom: target_dimensions.h,
        };
        const normalizedCogBounds = {
          left: cogBounds.left / source_dimensions.w,
          right: cogBounds.right / source_dimensions.w,
          top: 0,
          bottom: 1,
        };
        for (let i = cog.start; i < cog.end; i += 0.04) {
          cropAreaAnnotation.frames.push({
            normalized_bounding_box: normalizedCogBounds,
            time_offset: { seconds: Math.trunc(i), nanos: (i % 1) * 1e9 },
          });
        }
      });
    });

    const intelligenceCopy = JSON.parse(
      JSON.stringify(intelligence)
    ) as VideoIntelligence;
    intelligenceCopy.annotation_results[0].object_annotations?.unshift(
      cropAreaAnnotation
    );
    intelligenceCopy.annotation_results[0].object_annotations?.forEach(o => {
      o.confidence =
        o.entity.description === 'crop-area' ? 1 : Math.min(0.98, o.confidence);
    });
    return intelligenceCopy;
  }

  static generateCropCommands(
    cropAnalysis: [{ frames: { time: number; x: number }[] }],
    targetDimensions: { w: number; h: number },
    cropAnalysisScale: number
  ) {
    const lines = cropAnalysis[0].frames.map((frame, index) => {
      const time = frame.time;
      const x = (frame.x * targetDimensions.w) / cropAnalysisScale;
      const y = 0;
      const w = targetDimensions.w;
      const h = targetDimensions.h;
      return index === 0
        ? `${time} crop x ${x}, crop y ${y}, crop w ${w}, crop h ${h};`
        : `${time} crop x ${x};`;
    });
    return lines.join('\n');
  }
}

  
