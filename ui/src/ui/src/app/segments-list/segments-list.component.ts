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

import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { CONFIG } from '../../../../config';
import {
  AvSegment,
  SegmentMarker,
} from '../api-calls/api-calls.service.interface';

@Component({
  selector: 'segments-list',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    CdkDropList,
    CdkDrag,
    ScrollingModule,
  ],
  templateUrl: './segments-list.component.html',
  styleUrl: './segments-list.component.css',
})
export class SegmentsListComponent {
  @Input({ required: true }) segmentList?: any[];
  @Input({ required: true }) segmentMode!: 'preview' | 'segments';
  @Input({ required: true }) allowSelection!: boolean;
  @Input({ required: true }) draggable!: boolean;
  @Input({ required: true }) segmentMarkers!: Record<string, SegmentMarker[]>;

  @Output() seekToSegmentEvent = new EventEmitter<string>();
  @Output() segmentSplitEvent = new EventEmitter<SegmentMarker[]>();

  @ViewChildren('segmentVideoElem')
  segmentVideoElems?: QueryList<ElementRef<HTMLVideoElement>>;
  @ViewChildren('segmentCanvas')
  segmentCanvasElems?: QueryList<ElementRef<HTMLCanvasElement>>;

  segmentMarkerPositions: Record<string, number[]> = {};
  splitting = false;

  CONFIG = CONFIG;

  private _currentSegmentId: number = 0;
  @Input({ required: true })
  set currentSegmentId(value: number) {
    this._currentSegmentId = value;
    if (this.segmentMode === 'preview') {
      document
        .getElementById(`segment-${this._currentSegmentId}`)
        ?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest',
        });
    }
  }
  get currentSegmentId() {
    return this._currentSegmentId;
  }

  ngOnChanges() {
    if (this.segmentMode === 'segments') {
      if (this.splitting) {
        this.splitting = false;
        this.segmentVideoElems?.forEach(elem => elem.nativeElement.play());
      } else {
        setTimeout(() => {
          this.restoreMarkers();
        }, 10);
      }
    }
  }

  restoreMarkers() {
    Object.entries(this.segmentMarkers).forEach(([segmentId, markers]) => {
      const video = this.getSegmentVideo(segmentId);
      if (video) video.pause();
      const context = this.getSegmentCanvas(segmentId).context;

      if (context) {
        markers.forEach((marker: SegmentMarker) => {
          this.drawMarker(segmentId, marker);
        });
      }
    });
  }

  toggleSegmentSelection(av_segment_id: string) {
    const segment = this.segmentList!.find(
      (segment: AvSegment) => segment.av_segment_id === av_segment_id
    );
    segment.selected = !segment.selected;
  }

  seekToSegment(av_segment_id: string) {
    this.seekToSegmentEvent.emit(av_segment_id);
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.segmentList!, event.previousIndex, event.currentIndex);
    this.segmentList!.forEach(segment => (segment.played = false));
  }

  getSegmentVideo(segmentId: string) {
    const video = this.segmentVideoElems?.find(
      (segmentVideo: ElementRef<HTMLVideoElement>) =>
        segmentVideo.nativeElement.id === `vid-${segmentId}`
    );
    return video?.nativeElement;
  }

  getSegmentCanvas(segmentId: string) {
    const canvasRef = this.segmentCanvasElems?.find(
      (segmentCanvas: ElementRef<HTMLCanvasElement>) =>
        segmentCanvas.nativeElement.id === `vid-${segmentId}`
    );
    let canvas, context;
    if (canvasRef) {
      canvas = canvasRef.nativeElement;
      context = canvas.getContext('2d');
    }
    return { canvas, context };
  }

  isSegmentPlaying(segmentId: string) {
    return this.getSegmentVideo(segmentId)?.paused === false;
  }

  hasSegmentMarkers(segmentId: string) {
    return (
      this.segmentMarkers[segmentId] &&
      this.segmentMarkers[segmentId].length > 0
    );
  }

  addSegmentMarker(segmentId: string) {
    if (!this.segmentMarkers[segmentId]) {
      this.segmentMarkers[segmentId] = [];
    }
    if (!this.segmentMarkerPositions[segmentId]) {
      this.segmentMarkerPositions[segmentId] = [];
    }
    const video = this.getSegmentVideo(segmentId)!;
    const canvas = this.getSegmentCanvas(segmentId).canvas!;
    const marker: SegmentMarker = {
      av_segment_id: segmentId,
      marker_cut_time_s: video.currentTime,
      canvas_position: (video.currentTime / video.duration) * canvas.width,
    };
    if (
      !this.segmentMarkerPositions[segmentId].includes(
        marker.canvas_position
      ) &&
      marker.marker_cut_time_s > 0
    ) {
      this.segmentMarkerPositions[segmentId].push(marker.canvas_position);
      this.drawMarker(segmentId, marker);
      this.segmentMarkers[segmentId].push(marker);
    }
  }

  clearSegmentMarkers(segmentId: string) {
    const { canvas, context } = this.getSegmentCanvas(segmentId)!;
    context?.clearRect(0, 0, canvas?.width ?? 0, canvas?.height ?? 0);
    this.segmentMarkerPositions[segmentId] = [];
    this.segmentMarkers[segmentId] = [];
  }

  drawMarker(segmentId: string, marker: SegmentMarker) {
    const { canvas, context } = this.getSegmentCanvas(segmentId);
    if (context) {
      context.beginPath();
      context.strokeStyle = '#81c784';
      context.lineWidth = 2;
      context.setLineDash([5, 3]);
      context.moveTo(marker.canvas_position, canvas!.height - 20);
      context.lineTo(marker.canvas_position, canvas!.height);
      context.stroke();
      context.setLineDash([]);
    }
  }

  splitSegment(segmentId: string) {
    this.segmentSplitEvent.emit(this.segmentMarkers[segmentId]);
    this.splitting = true;
    this.segmentList!.find(
      (segment: AvSegment) => segment.av_segment_id === segmentId
    ).splitting = true;
    this.clearSegmentMarkers(segmentId);
  }
}
