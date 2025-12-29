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
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
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

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

@Component({
  selector: 'video-combo',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonToggleModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
    MatButtonModule,
    MatSnackBarModule,
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
  selectedFormat: FormatType = '16:9';
  textAssetsLanguage = '';
  transcriptionText = '';
  transcriptionLoading = false;
  hasTranscription = false;
  aspectRatios: FormatType[] = ['16:9', '9:16', '1:1', '3:4', '4:3'];

  constructor(
    private snackBar: MatSnackBar,
    private apiCallsService: ApiCallsService
  ) {}

  loadVideo() {
    if (this.displayMode === 'combo') {
      this.videoElem.nativeElement.src =
        this.combo.variants![this.selectedFormat]!.entity;
      this.images = this.combo.images
        ? this.combo.images[this.selectedFormat]!
        : [];
    }
  }

  onChangeVideo(e: MatButtonToggleChange) {
    this.selectedFormat = e.value;
    this.loadVideo();
  }

  ngAfterViewInit(): void {
    this.getTextAssetsLanguage();
    this.loadVideo();
  }

  getTextAssetsLanguage() {
    this.apiCallsService
      .getVideoLanguage(this.gcsFolder)
      .subscribe((videoLanguage: string) => {
        this.textAssetsLanguage = videoLanguage;
      });
  }

  loadTranscription() {
    // Check if this video was uploaded with voice-over analysis
    // Folder format: filename--[w|g|n]--timestamp--userid
    // w=whisper, g=gemini, n=no audio
    const folderParts = this.gcsFolder.split('--');
    const hasAudioAnalysis = folderParts.length >= 2 &&
                             (folderParts[1] === 'w' || folderParts[1] === 'g');

    if (!hasAudioAnalysis) {
      console.log('Video was not analyzed for voice-over, skipping transcription load');
      this.hasTranscription = false;
      return;
    }

    this.transcriptionLoading = true;
    const transcriptionUrl = `${CONFIG.cloudStorage.authenticatedEndpointBase}/${CONFIG.cloudStorage.bucket}/${this.gcsFolder}/transcription.json`;

    console.log('Loading transcription from:', transcriptionUrl);

    this.apiCallsService.getFromGcs(transcriptionUrl).subscribe({
      next: (data: string) => {
        try {
          const transcriptionData = JSON.parse(data);
          console.log('Transcription loaded successfully:', transcriptionData);
          this.transcriptionText = this.formatTranscription(transcriptionData);
          this.hasTranscription = true;
        } catch (e) {
          console.log('No transcription found or error parsing:', e);
          this.hasTranscription = false;
        }
        this.transcriptionLoading = false;
      },
      error: (err) => {
        console.log('Error loading transcription:', err);
        this.hasTranscription = false;
        this.transcriptionLoading = false;
      }
    });
  }

  formatTranscription(transcriptionData: TranscriptionSegment[]): string {
    return transcriptionData
      .map((segment: TranscriptionSegment) => {
        const start = this.formatTimestamp(segment.start);
        const end = this.formatTimestamp(segment.end);
        return `${start} --> ${end}\n${segment.text}`;
      })
      .join('\n\n');
  }

  formatTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  parseTranscriptionText(text: string): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = [];
    const blocks = text.split(/\n\n+/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length >= 2) {
        const timestampMatch = lines[0].match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
        if (timestampMatch) {
          const startTime = this.parseTimestamp(timestampMatch[1]);
          const endTime = this.parseTimestamp(timestampMatch[2]);
          const text = lines.slice(1).join('\n');
          segments.push({
            start: startTime,
            end: endTime,
            text,
          });
        }
      }
    }

    return segments;
  }

  parseTimestamp(timestamp: string): number {
    const parts = timestamp.split(':');
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    const secondsParts = parts[2].split('.');
    const seconds = Number(secondsParts[0]);
    const ms = Number(secondsParts[1]);

    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(ms)) {
      console.error('Failed to parse timestamp:', timestamp);
      return 0;
    }

    return hours * 3600 + minutes * 60 + seconds + ms / 1000;
  }

  applyTranscription() {
    if (!this.transcriptionText) {
      this.snackBar.open('Transcription is empty', 'Dismiss', {
        duration: 2500,
      });
      return;
    }

    this.transcriptionLoading = true;

    this.apiCallsService
      .updateTranscription(this.gcsFolder, this.transcriptionText)
      .subscribe({
        next: (success: boolean) => {
          this.transcriptionLoading = false;
          if (success) {
            this.snackBar.open('Transcription updated successfully!', 'Dismiss', {
              duration: 2500,
            });
          } else {
            this.snackBar.open('Failed to update transcription', 'Dismiss', {
              duration: 2500,
            });
          }
        },
        error: (err: Error) => {
          this.transcriptionLoading = false;
          this.failHandler(err);
        }
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
}
