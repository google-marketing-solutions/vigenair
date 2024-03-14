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

import { ApiCallsService } from '../api-calls/api-calls.service';

@Component({
  selector: 'video-combo',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './video-combo.component.html',
  styleUrl: './video-combo.component.css',
})
export class VideoComboComponent implements AfterViewInit {
  @Input({ required: true }) combo!: any;
  @ViewChild('videoElem') videoElem!: ElementRef<HTMLVideoElement>;
  @ViewChild('variantGroup', { static: true })
  variantGroup!: MatButtonToggleGroup;

  loading = false;

  constructor(private apiCallsService: ApiCallsService) {}

  loadVideo(file: string) {
    const gsUrl = this.combo.variants[file] as string;
    const path = gsUrl.replace(/gs:\/\/[^\/]+\//, '');
    this.videoElem.nativeElement.src = `https://storage.mtls.cloud.google.com/vigenair_testing/${path}`;
  }

  onChangeVideo(e: MatButtonToggleChange) {
    this.loadVideo(e.value);
  }

  ngAfterViewInit(): void {
    this.loadVideo('landscape');
  }
}
