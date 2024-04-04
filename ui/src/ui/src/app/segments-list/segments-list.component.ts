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
