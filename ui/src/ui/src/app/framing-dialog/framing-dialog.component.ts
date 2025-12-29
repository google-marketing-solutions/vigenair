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
import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSliderModule } from '@angular/material/slider';
import { FramingDialogData } from '../app.component';

@Component({
  selector: 'framing-dialog',
  templateUrl: './framing-dialog.component.html',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatButtonModule,
    MatIconModule,
    MatSliderModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmartFramingDialog {
  constructor(@Inject(MAT_DIALOG_DATA) public data: FramingDialogData) {}

  weightsSliderChange($event: any, source: string) {
    const stepIndex = Number($event);
    if (source === 'faces') {
      this.data.weightsPersonFaceIndex = stepIndex;
    } else if (source === 'text') {
      this.data.weightsTextIndex = stepIndex;
    }
  }

  formatWeightsLabel(value: number) {
    switch (value) {
      case 0:
        return '0';
      case 1:
        return '10';
      case 2:
        return '100';
      case 3:
        return '1k';
    }
    return `${value}`;
  }
}
