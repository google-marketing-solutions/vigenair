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
import {
  MatButtonToggleChange,
  MatButtonToggleGroup,
  MatButtonToggleModule,
} from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { ApiCallsService } from '../api-calls/api-calls.service';

import { MatTooltipModule } from '@angular/material/tooltip';
import { marked } from 'marked';
import {
  EntityApproval,
  FormatType,
  GenerateVariantsResponse,
  RenderedVariant,
} from '../api-calls/api-calls.service.interface';

@Component({
  selector: 'video-combo',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './video-combo.component.html',
  styleUrl: './video-combo.component.css',
})
export class VideoComboComponent implements AfterViewInit {
  @Input({ required: true }) combo!: RenderedVariant | GenerateVariantsResponse;
  @Input() showApprovalStatus = false;
  @Input() displayMode = 'combo';
  @ViewChild('videoElem') videoElem!: ElementRef<HTMLVideoElement>;
  @ViewChild('variantGroup', { static: true })
  variantGroup!: MatButtonToggleGroup;

  loading = false;
  marked = marked;
  images: EntityApproval[] = [];
  selectedFormat: FormatType = 'horizontal';

  constructor(private apiCallsService: ApiCallsService) {}

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
    this.loadVideo();
  }

  toggleApprovalStatus(entity: EntityApproval) {
    entity.approved = !entity.approved;
  }
}
