/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the MIT License;
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       https://www.mit.edu/~amini/LICENSE.md
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Output,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ApiCallsService } from '../api-calls/api-calls.service';

@Component({
  selector: 'file-chooser',
  standalone: true,
  imports: [MatButtonModule, CommonModule],
  templateUrl: './file-chooser.component.html',
  styleUrl: './file-chooser.component.css',
})
export class FileChooserComponent {
  selectedFile?: File;
  selectedFileUrl?: string;

  @ViewChild('videoElem') videoElem!: ElementRef<HTMLVideoElement>;
  @ViewChild('trackElem') trackElem!: ElementRef<HTMLTrackElement>;
  @Output() file = new EventEmitter<File>();

  constructor(private apiCallsService: ApiCallsService) {}

  onFileChange(event: Event) {
    const files = (event.target as HTMLInputElement).files;
    if (!files || !files.length) {
      this.selectedFile = undefined;
      return;
    }
    this.selectedFile = files[0];
    this.selectedFileUrl = URL.createObjectURL(this.selectedFile);
    this.videoElem.nativeElement.load();
    this.file.emit(files[0]);
  }
}
