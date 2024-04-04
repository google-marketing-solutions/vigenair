import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SegmentsListComponent } from './segments-list.component';

describe('SegmentsListComponent', () => {
  let component: SegmentsListComponent;
  let fixture: ComponentFixture<SegmentsListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SegmentsListComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SegmentsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
