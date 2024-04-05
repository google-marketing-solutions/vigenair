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
import { Component, Input } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'segments-list',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonToggleModule,
    MatChipsModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './segments-list.component.html',
  styleUrl: './segments-list.component.css',
})
export class SegmentsListComponent {
  @Input({ required: true }) segmentList?: any[];
  @Input({ required: true }) segmentMode!: 'preview' | 'segments';

  private _currentSegmentId: number = 0;
  @Input({ required: true })
  set currentSegmentId(value: number) {
    this._currentSegmentId = value;
    if (this.segmentMode === 'preview') {
      document
        .getElementById(`segment-${this._currentSegmentId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  get currentSegmentId() {
    return this._currentSegmentId;
  }
}
