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

import { Component, ElementRef, ViewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import {
  MatExpansionModule,
  MatExpansionPanel,
} from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MatButtonToggleGroup,
  MatButtonToggleModule,
} from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ApiCallsService } from './api-calls/api-calls.service';
import { FileChooserComponent } from './file-chooser/file-chooser.component';
import { SegmentsListComponent } from './segments-list/segments-list.component';
import { VideoComboComponent } from './video-combo/video-combo.component';

import { CONFIG } from '../../../config';
import { GenerateVariantsResponse } from './api-calls/api-calls.service.interface';

type ProcessStatus = 'hourglass_top' | 'pending' | 'check_circle';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FileChooserComponent,
    MatButtonModule,
    MatDividerModule,
    MatExpansionModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTabsModule,
    MatToolbarModule,
    MatChipsModule,
    MatIconModule,
    MatButtonToggleModule,
    SegmentsListComponent,
    VideoComboComponent,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  loading = false;
  selectedFile?: File;
  gcsVideoPath?: string;
  analysisJson?: any;
  videoObjects?: any[];
  combosJson?: any;
  avSegments?: any;
  variants?: GenerateVariantsResponse[];
  selectedVariant = 0;
  transcriptStatus: ProcessStatus = 'hourglass_top';
  analysisStatus: ProcessStatus = 'hourglass_top';
  combinationStatus: ProcessStatus = 'hourglass_top';
  segmentsStatus: ProcessStatus = 'hourglass_top';
  canvas?: CanvasRenderingContext2D;
  frameInterval?: number;
  currentSegmentId?: number;
  prompt = '';
  duration = 'auto';
  demandGenAssets = true;
  previousRuns: string[] | undefined;
  folder = '';

  get combos(): any[] {
    return this.combosJson ? Object.values(this.combosJson) : [];
  }

  @ViewChild('previewVideoElem')
  previewVideoElem!: ElementRef<HTMLVideoElement>;
  @ViewChild('previewTrackElem')
  previewTrackElem!: ElementRef<HTMLTrackElement>;
  @ViewChild('videoUploadPanel') videoUploadPanel!: MatExpansionPanel;
  @ViewChild('videoMagicPanel') videoMagicPanel!: MatExpansionPanel;
  @ViewChild('magicCanvas') magicCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('videoCombosPanel') videoCombosPanel!: MatExpansionPanel;
  @ViewChild('segmentModeToggle') segmentModeToggle!: MatButtonToggleGroup;

  constructor(
    private apiCallsService: ApiCallsService,
    private snackBar: MatSnackBar
  ) {
    this.getPreviousRuns();
  }

  getPreviousRuns() {
    this.apiCallsService.getRunsFromGcs().subscribe(runs => {
      this.previousRuns = runs;
    });
  }

  onFileSelected(file: File) {
    this.selectedFile = file;
  }

  failHandler() {
    this.loading = false;
    this.snackBar
      .open('An error occured.', 'Start over', {
        horizontalPosition: 'center',
      })
      .afterDismissed()
      .subscribe(() => {
        this.videoUploadPanel.open();
        this.videoMagicPanel.close();
      });
  }

  drawFrame(entities?: any[]) {
    const context = this.canvas;
    if (!context || !entities) {
      return;
    }
    context.clearRect(
      0,
      0,
      this.previewVideoElem.nativeElement.videoWidth,
      this.previewVideoElem.nativeElement.videoHeight
    );
    const timestamp = this.previewVideoElem.nativeElement.currentTime;
    entities.forEach(e => {
      if (e.start <= timestamp && e.end >= timestamp) {
        for (let i = 0; i < e.frames.length; i++) {
          if (e.frames[i].time >= timestamp) {
            this.drawEntity(
              e.name,
              e.frames[i].x,
              e.frames[i].y,
              e.frames[i].width,
              e.frames[i].height
            );
            break;
          }
        }
      }
    });
  }

  setCurrentSegmentId() {
    if (!this.avSegments) {
      this.currentSegmentId = undefined;
      return;
    }
    const timestamp = this.previewVideoElem.nativeElement.currentTime;
    const currentSegment = this.avSegments.find(
      (e: { start_s: number; end_s: number }) => {
        return e.start_s <= timestamp && e.end_s >= timestamp;
      }
    );
    if (
      !currentSegment ||
      currentSegment.av_segment_id === this.currentSegmentId
    ) {
      return;
    }
    this.currentSegmentId = currentSegment.av_segment_id;
    console.log(this.currentSegmentId);
  }

  drawEntity(
    text: string,
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    // console.log(`${text} at ${x} ${y} ${width}x${height}`);
    const context = this.canvas;
    if (context) {
      context.font = '20px Roboto';
      context.strokeStyle = '#81c784';
      context.beginPath();
      context.lineWidth = 4;
      context.rect(x, y, width, height);
      context.stroke();
      context.fillStyle = '#81c784';
      context.fillRect(x, y, width, 32);
      context.fillStyle = '#ffffff';
      context.fillText(text, x + 5, y + 22);
    }
  }

  convertToSeconds(timestamp: any) {
    if (!timestamp) {
      return 0;
    }
    return (timestamp.seconds || 0) + (timestamp.nanos / 1e9 || 0);
  }

  parseAnalysis() {
    const vw = this.previewVideoElem.nativeElement.videoWidth;
    const vh = this.previewVideoElem.nativeElement.videoHeight;
    this.videoObjects =
      this.analysisJson.annotation_results[0].object_annotations
        .filter((e: any) => e.confidence > 0.7)
        .map((e: any) => {
          return {
            name: e.entity.description,
            start: this.convertToSeconds(e.segment.start_time_offset),
            end: this.convertToSeconds(e.segment.end_time_offset),
            frames: e.frames.map((f: any) => {
              return {
                x: vw * (f.normalized_bounding_box.left || 0),
                y: vh * (f.normalized_bounding_box.top || 0),
                width:
                  vw *
                  ((f.normalized_bounding_box.right || 0) -
                    (f.normalized_bounding_box.left || 0)),
                height:
                  vh *
                  ((f.normalized_bounding_box.bottom || 0) -
                    (f.normalized_bounding_box.top || 0)),
                time: this.convertToSeconds(f.time_offset),
              };
            }),
          };
        });
    // console.log(this.videoObjects);
  }

  getAvSegments(folder: string) {
    this.segmentsStatus = 'pending';
    this.apiCallsService
      .getFromGcs(`${folder}/data.json`, 'application/json', 10000, 180)
      .subscribe({
        next: dataUrl => {
          const dataJson = JSON.parse(atob(dataUrl.split(',')[1]));
          this.avSegments = dataJson.map((e: any) => {
            e.selected = false;
            return e;
          });
          console.log(this.avSegments);
          this.segmentsStatus = 'check_circle';
          this.loading = false;
        },
        error: () => this.failHandler(),
      });
  }

  getMagicCombos(folder: string) {
    this.combinationStatus = 'pending';
    this.apiCallsService
      .getFromGcs(`${folder}/combos.json`, 'application/json', 10000, 180)
      .subscribe({
        next: dataUrl => {
          this.combosJson = JSON.parse(atob(dataUrl.split(',')[1]));
          this.combinationStatus = 'check_circle';
          this.loading = false;
          // this.videoMagicPanel.close();
          // this.videoCombosPanel.open();
        },
        error: () => this.failHandler(),
      });
  }

  getMagicAnalysis(folder: string) {
    this.analysisStatus = 'pending';
    this.apiCallsService
      .getFromGcs(`${folder}/analysis.json`, 'application/json', 5000, 20)
      .subscribe({
        next: dataUrl => {
          this.analysisJson = JSON.parse(atob(dataUrl.split(',')[1]));
          this.analysisStatus = 'check_circle';
          // console.log(this.analysisJson);
          this.parseAnalysis();
          this.getAvSegments(folder);
          //this.getMagicCombos(folder);
        },
        error: () => this.failHandler(),
      });
  }

  getMagicVoiceOver(folder: string) {
    this.transcriptStatus = 'pending';
    this.apiCallsService
      .getFromGcs(`${folder}/input.vtt`, 'text/vtt', 5000, 20)
      .subscribe({
        next: dataUrl => {
          this.previewTrackElem.nativeElement.src = dataUrl;
          this.transcriptStatus = 'check_circle';
          this.getMagicAnalysis(folder);
        },
        error: () => this.failHandler(),
      });
  }

  loadPreviousRun(folder: string) {
    this.loading = true;
    this.processVideo(folder);
  }

  uploadVideo() {
    this.loading = true;
    this.apiCallsService.uploadVideo(this.selectedFile!).subscribe(folder => {
      this.processVideo(folder);
    });
  }

  resetState() {
    this.analysisJson = undefined;
    this.avSegments = undefined;
    this.combosJson = undefined;
    this.videoObjects = undefined;
    this.variants = undefined;
    this.transcriptStatus = 'hourglass_top';
    this.analysisStatus = 'hourglass_top';
    this.combinationStatus = 'hourglass_top';
    this.segmentsStatus = 'hourglass_top';
    // TODO: Fix old subtitles still showing when loading another video
    this.previewTrackElem.nativeElement.src = '';
  }

  processVideo(folder: string) {
    this.resetState();
    this.folder = folder;
    this.gcsVideoPath = `https://storage.mtls.cloud.google.com/${CONFIG.GCS_BUCKET}/${folder}/input.mp4`;
    this.previewVideoElem.nativeElement.src = this.gcsVideoPath;
    this.previewVideoElem.nativeElement.onloadeddata = () => {
      this.magicCanvas.nativeElement.width =
        this.previewVideoElem.nativeElement.videoWidth;
      this.magicCanvas.nativeElement.height =
        this.previewVideoElem.nativeElement.videoHeight;
      this.previewVideoElem.nativeElement.onloadeddata = null;
      this.canvas = this.magicCanvas.nativeElement.getContext('2d')!;
    };
    this.previewVideoElem.nativeElement.onplaying = () => {
      this.frameInterval = window.setInterval(() => {
        this.drawFrame(this.videoObjects);
        this.setCurrentSegmentId();
      }, 50);
    };
    this.previewVideoElem.nativeElement.onpause = () => {
      if (this.frameInterval) {
        clearInterval(this.frameInterval);
        this.frameInterval = undefined;
      }
    };
    this.videoUploadPanel.close();
    this.videoMagicPanel.open();
    this.getMagicVoiceOver(folder);
  }

  generateVariants() {
    this.loading = true;
    this.apiCallsService
      .generateVariants({
        prompt: this.prompt,
        duration: this.duration,
        demandGenAssets: this.demandGenAssets,
      })
      .subscribe(variants => {
        this.loading = false;
        this.selectedVariant = 0;
        this.variants = variants;
        this.setSelectedSegments();
      });
  }

  setSelectedSegments() {
    for (const segment of this.avSegments) {
      segment.selected = false;
    }
    for (const segment of this.variants![this.selectedVariant].scenes) {
      this.avSegments[segment - 1].selected = true;
    }
  }

  variantChanged() {
    this.setSelectedSegments();
  }
}
