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
  Component,
  ElementRef,
  EventEmitter,
  Output,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

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
  @Output() file = new EventEmitter<File>();

  onFileChange(event: Event) {
    const files = (event.target as HTMLInputElement).files;
    if (!files || !files.length) {
      this.selectedFile = this.selectedFileUrl = undefined;
      this.file.emit(undefined);
      return;
    }
    this.selectedFile = files[0];
    this.selectedFileUrl = URL.createObjectURL(this.selectedFile);
    this.file.emit(files[0]);
    setTimeout(() => {
      this.videoElem.nativeElement.load();
    }, 50);
  }

  stopVideo() {
    this.videoElem.nativeElement.pause();
    this.videoElem.nativeElement.currentTime = 0;
  }
}
