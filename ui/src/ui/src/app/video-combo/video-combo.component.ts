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
