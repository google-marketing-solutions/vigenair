/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
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
import { ApiCallsService } from './api-calls/api-calls.service';
import { FileChooserComponent } from './file-chooser/file-chooser.component';
import { VideoComboComponent } from './video-combo/video-combo.component';

type ProcessStatus = 'hourglass_top' | 'pending' | 'check_circle';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FileChooserComponent,
    MatButtonModule,
    MatExpansionModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTabsModule,
    MatToolbarModule,
    MatChipsModule,
    MatIconModule,
    VideoComboComponent,
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
  transcriptStatus: ProcessStatus = 'hourglass_top';
  analysisStatus: ProcessStatus = 'hourglass_top';
  combinationStatus: ProcessStatus = 'hourglass_top';
  canvas?: CanvasRenderingContext2D;
  frameInterval?: number;

  get combos(): any[] {
    return this.combosJson ? Object.values(this.combosJson) : [];
  }

  @ViewChild('previewVideoElem')
  previewVideoElem!: ElementRef<HTMLVideoElement>;
  @ViewChild('previewTrackElem')
  previewTrackElem!: ElementRef<HTMLTrackElement>;
  @ViewChild('videoUploadPanel', { static: true })
  videoUploadPanel!: MatExpansionPanel;
  @ViewChild('videoMagicPanel', { static: true })
  videoMagicPanel!: MatExpansionPanel;
  @ViewChild('magicCanvas', { static: true })
  magicCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('videoCombosPanel', { static: true })
  videoCombosPanel!: MatExpansionPanel;

  constructor(
    private apiCallsService: ApiCallsService,
    private snackBar: MatSnackBar
  ) {}

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
    console.log(this.videoObjects);
  }

  getMagicCombos(folder: string) {
    this.combinationStatus = 'pending';
    this.apiCallsService
      .getFromGcs(
        `uploads/${folder}/combos.json`,
        'application/json',
        10000,
        180
      )
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
      .getFromGcs(
        `uploads/${folder}/analysis.json`,
        'application/json',
        5000,
        20
      )
      .subscribe({
        next: dataUrl => {
          this.analysisJson = JSON.parse(atob(dataUrl.split(',')[1]));
          this.analysisStatus = 'check_circle';
          console.log(this.analysisJson);
          this.parseAnalysis();
          this.getMagicCombos(folder);
        },
        error: () => this.failHandler(),
      });
  }

  getMagicVoiceOver(folder: string) {
    this.transcriptStatus = 'pending';
    this.apiCallsService
      .getFromGcs(`uploads/${folder}/vocals.vtt`, 'text/vtt', 5000, 20)
      .subscribe({
        next: dataUrl => {
          this.previewTrackElem.nativeElement.src = dataUrl;
          this.transcriptStatus = 'check_circle';
          this.getMagicAnalysis(folder);
        },
        error: () => this.failHandler(),
      });
  }

  processVideo() {
    this.loading = true;
    // this.apiCallsService.uploadVideo(this.selectedFile!).subscribe(folder => {
    // const demoFolder = localStorage.getItem('lastOperationId') || folder;
    const demoFolder =
      localStorage.getItem('lastOperationId') || '1706795595972';
    localStorage.setItem('lastOperationId', demoFolder);
    this.gcsVideoPath = `https://storage.mtls.cloud.google.com/vigenair_testing/uploads/${demoFolder}/input.mp4`;
    this.previewVideoElem.nativeElement.src = this.gcsVideoPath;
    this.previewVideoElem.nativeElement.onloadeddata = () => {
      this.magicCanvas.nativeElement.width =
        this.previewVideoElem.nativeElement.videoWidth;
      this.magicCanvas.nativeElement.height =
        this.previewVideoElem.nativeElement.videoHeight;
      this.previewVideoElem.nativeElement.muted = true;
      this.previewVideoElem.nativeElement.onloadeddata = null;
      this.canvas = this.magicCanvas.nativeElement.getContext('2d')!;
    };
    this.previewVideoElem.nativeElement.onplaying = () => {
      this.frameInterval = window.setInterval(() => {
        this.drawFrame(this.videoObjects);
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
    this.getMagicVoiceOver(demoFolder);
    // });
  }
}
