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

import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MatButtonToggleChange,
  MatButtonToggleGroup,
  MatButtonToggleModule,
} from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiCallsService } from '../api-calls/api-calls.service';
import { marked } from 'marked';
import { CONFIG } from '../../../../config';
import {
  EntityApproval,
  FormatType,
  GenerateVariantsResponse,
  RenderedVariant,
  VariantTextAsset,
} from '../api-calls/api-calls.service.interface';

@Component({
  selector: 'video-combo',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
    MatButtonModule,
    MatSnackBarModule,
    MatSelectModule,
  ],
  templateUrl: './video-combo.component.html',
  styleUrl: './video-combo.component.css',
})
export class VideoComboComponent implements AfterViewInit {
  @Input({ required: true }) combo!: RenderedVariant | GenerateVariantsResponse;
  @Input({ required: true }) gcsFolder!: string;
  @Input() showApprovalStatus = false;
  @Input() displayMode = 'combo';

  @ViewChild('videoElem') videoElem!: ElementRef<HTMLVideoElement>;
  @ViewChild('variantGroup', { static: true })
  variantGroup!: MatButtonToggleGroup;

  loading = false;
  comboLoading = false;
  marked = marked;
  images: EntityApproval[] = [];
  selectedFormat: FormatType = 'horizontal';
  textAssetsLanguage = '';

  overlayInput = '';
  overlayText = '';
  showOverlayPreview = false;
  exporting = false;
  exportQuality = 'medium';
  exportProgress = 0;

  constructor(
    private snackBar: MatSnackBar,
    private apiCallsService: ApiCallsService
  ) {}

  ngAfterViewInit(): void {
    this.getTextAssetsLanguage();
    this.loadVideo();
    // Overlay custom text if present
    setTimeout(() => this.addCustomTextOverlay(), 0);
  }

  loadVideo() {
    if (this.displayMode === 'combo') {
      this.videoElem.nativeElement.src =
        this.combo.variants![this.selectedFormat]!.entity;
      this.images = this.combo.images
        ? this.combo.images[this.selectedFormat]!
        : [];
      // Overlay custom text if present
      setTimeout(() => this.addCustomTextOverlay(), 0);
    }
  }

  onChangeVideo(e: MatButtonToggleChange) {
    this.selectedFormat = e.value;
    this.loadVideo();
  }

  addCustomTextOverlay() {
    // Remove previous overlay if any
    const video = this.videoElem?.nativeElement;
    if (!video) return;
    let overlay = video.parentElement?.querySelector('.custom-text-overlay');
    if (overlay) overlay.remove();

    // Add new overlay if text exists
    if (this.overlayText) {
      overlay = document.createElement('div');
      overlay.className = 'custom-text-overlay';
      overlay.textContent = this.overlayText;
      Object.assign((overlay as HTMLElement).style, {
        position: 'absolute',
        bottom: '10%',
        left: '50%',
        transform: 'translateX(-50%)',
        color: 'white',
        background: 'rgba(0,0,0,0.6)',
        padding: '8px 16px',
        borderRadius: '8px',
        fontSize: '2em',
        pointerEvents: 'none',
        zIndex: 10,
        maxWidth: '90%',
        textAlign: 'center',
        whiteSpace: 'pre-line',
      });
      // Ensure parent is position: relative
      const parent = video.parentElement as HTMLElement;
      if (parent && getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }
      parent.appendChild(overlay);
    }
  }

  getTextAssetsLanguage() {
    this.apiCallsService
      .getVideoLanguage(this.gcsFolder)
      .subscribe((videoLanguage: string) => {
        this.textAssetsLanguage = videoLanguage;
      });
  }

  regenerateText(textAsset: VariantTextAsset) {
    if (!this.comboLoading) {
      this.comboLoading = true;
      this.apiCallsService
        .regenerateTextAsset(
          this.combo.variants![this.selectedFormat]!.entity.replace(
            CONFIG.cloudStorage.authenticatedEndpointBase,
            ''
          ),
          textAsset,
          this.textAssetsLanguage
        )
        .subscribe({
          next: (generatedTextAsset: VariantTextAsset) => {
            this.comboLoading = false;
            textAsset.headline = generatedTextAsset.headline;
            textAsset.description = generatedTextAsset.description;
            textAsset.editable = false;
            textAsset.approved = true;
          },
          error: (err: Error) => this.failHandler(err),
        });
    }
  }

  toggleApprovalStatus(entity: EntityApproval) {
    if (!this.comboLoading) {
      entity.approved = !entity.approved;
    }
  }

  failHandler(error: Error) {
    console.error('An unexpected error occurred: ', error);
    this.loading = false;
    this.comboLoading = false;
    this.snackBar
      .open('An error occurred! Please try again.', 'Dismiss', {
        horizontalPosition: 'center',
        duration: 2500,
      })
      .onAction()
      .subscribe(() => {
        this.snackBar.dismiss();
      });
  }

  generateTextAssets() {
    this.loading = true;
    this.comboLoading = true;
    this.apiCallsService
      .generateTextAssets(
        this.combo.variants![this.selectedFormat]!.entity.replace(
          CONFIG.cloudStorage.authenticatedEndpointBase,
          ''
        ),
        this.textAssetsLanguage
      )
      .subscribe({
        next: (generatedTextAssets: VariantTextAsset[]) => {
          this.loading = false;
          this.comboLoading = false;
          this.combo!.texts = generatedTextAssets;
        },
        error: (err: Error) => this.failHandler(err),
      });
  }

  applyOverlay() {
    this.overlayText = this.overlayInput;
    this.showOverlayPreview = !!this.overlayText;
    this.addCustomTextOverlay(); // Add this to update the overlay immediately
  }

  async exportVideoWithOverlay() {
    if (!this.videoElem?.nativeElement) return;
    this.exporting = true;
    this.exportProgress = 0;
    const video = this.videoElem.nativeElement;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    // Capture video stream from canvas
    const videoStream = canvas.captureStream();
    // Get the original audio track from the video element
    let audioTracks: MediaStreamTrack[] = [];
    if (video.srcObject) {
      audioTracks = (video.srcObject as MediaStream).getAudioTracks();
    }
    // If video.srcObject is not set or has no audio, try to get audio from the video element's captureStream (browser support required)
    if (audioTracks.length === 0 && (video as any).captureStream) {
      try {
        const nativeStream = (video as any).captureStream();
        nativeStream.getAudioTracks().forEach((track: MediaStreamTrack) => audioTracks.push(track));
      } catch (e) {}
    }
    // Combine video and audio tracks
    const combinedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...audioTracks
    ]);
    const recordedChunks: BlobPart[] = [];
    const recorder = new MediaRecorder(combinedStream);

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'video_with_overlay.webm';
      a.click();
      URL.revokeObjectURL(url);
      this.exporting = false;
      this.exportProgress = 0;
    };

    recorder.onerror = () => {
      this.exporting = false;
      this.exportProgress = 0;
    };

    const drawFrame = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (this.overlayText) {
        // Scale font size based on canvas size
        const fontSize = Math.max(16, Math.floor(canvas.height * 0.05));
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const textWidth = ctx.measureText(this.overlayText).width;
        ctx.fillRect(
          canvas.width / 2 - textWidth / 2 - 20,
          canvas.height - fontSize * 2,
          textWidth + 40,
          fontSize + 24
        );
        ctx.fillStyle = 'white';
        ctx.fillText(this.overlayText, canvas.width / 2, canvas.height - fontSize);
      }
    };

    // Use fixed frame rate
    const fps = 30;
    const frameInterval = 1000 / fps;
    let lastDrawTime = 0;

    const render = (timestamp: number) => {
      if (video.ended || video.currentTime >= video.duration) {
        this.exportProgress = 100;
        recorder.stop();
        return;
      }

      if (timestamp - lastDrawTime >= frameInterval) {
        drawFrame();
        lastDrawTime = timestamp;
        // Update progress bar
        if (video.duration > 0) {
          this.exportProgress = Math.min(100, Math.floor((video.currentTime / video.duration) * 100));
        }
      }
      requestAnimationFrame(render);
    };

    video.currentTime = 0;
    recorder.start(1000); // Record in 1-second chunks
    video.play();
    video.onplay = () => requestAnimationFrame(render);
  }
}
