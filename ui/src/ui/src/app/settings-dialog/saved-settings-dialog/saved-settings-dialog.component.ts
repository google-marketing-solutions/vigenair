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
import { AppSettingsService, AppSettings } from '../../services/app-settings.service';
import { Component, Inject, OnInit } from '@angular/core';
import { PlatformService } from '../../core/services/platform.service';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SettingsDialogComponent } from '../settings-dialog.component';
import { MatDividerModule } from '@angular/material/divider';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { ViewChild, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { ConfirmationDialogComponent } from '../confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-saved-settings-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatCardModule,
    MatDialogModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatDividerModule
    , MatPaginatorModule
  ],
  templateUrl: './saved-settings-dialog.component.html',
  styleUrls: ['./saved-settings-dialog.component.css']
})
export class SavedSettingsDialogComponent implements OnInit {
  @ViewChild(MatPaginator, { static: true }) paginator!: MatPaginator;
  savedSettingsList: (AppSettings & { id: string })[] = [];
  dataSource = new MatTableDataSource(this.savedSettingsList);
  loading = false;
  displayedColumns: string[] = ['settings', 'actions'];
  filterValue: string = '';

  constructor(
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<SavedSettingsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { currentSettings: any },
    private appSettingsService: AppSettingsService,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef,
    public platformService: PlatformService
  ) { }

  ngOnInit() {
    this.loadSavedSettingsList();
  }

    ngAfterViewInit() {
      // No need to set paginator here, handled in refreshDataSource
    }

  private refreshDataSource() {
    this.dataSource = new MatTableDataSource(this.savedSettingsList);
    this.dataSource.filterPredicate = (data: AppSettings, filter: string) => {
      return data.brandName.toLowerCase().includes(filter);
    };
    this.dataSource.filter = this.filterValue;
    this.dataSource.paginator = this.paginator;
    this.cdr.detectChanges();
  }

  loadSavedSettingsList() {
    this.loading = true;
    this.appSettingsService.getSavedSettings().subscribe({
      next: (list) => {
        this.savedSettingsList = list;
        this.refreshDataSource();
        this.loading = false;
      },
      error: () => {
        this.snackBar.open('Failed to load saved settings', 'Close', { duration: 2000 });
        this.loading = false;
      }
    });
  }

  applyFilter(event: Event) {
    this.filterValue = (event.target as HTMLInputElement).value.trim().toLowerCase();
    this.dataSource.filter = this.filterValue;
  }

  createNewSetting() {
    const dialogRef = this.dialog.open(SettingsDialogComponent, {
      width: '500px',
      maxHeight: '90vh',
      panelClass: 'custom-dialog'
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.saved && result.setting) {
        this.savedSettingsList.push(result.setting);
        this.refreshDataSource();
        this.applySavedSetting(result.setting);
      }
    });
  }

  editSetting(setting: AppSettings & { id: string }) {
    const dialogRef = this.dialog.open(SettingsDialogComponent, {
      width: '500px',
      maxHeight: '90vh',
      panelClass: 'custom-dialog',
      data: {
        editMode: true,
        settingId: setting.id,
        prefilledData: setting,
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.saved && result.setting) {
        const index = this.savedSettingsList.findIndex(
          (s) => s.id === result.setting.id
        );
        if (index > -1) {
          this.savedSettingsList[index] = result.setting;
          this.refreshDataSource();
          this.applySavedSetting(result.setting);
        }
      }
    });
  }

  deleteSavedSetting(settingId: string) {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Setting',
        message: 'Are you sure you want to delete this setting?'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.appSettingsService.deleteSavedSetting(settingId).subscribe({
          next: () => {
            this.snackBar.open('Deleted saved setting!', 'Close', { duration: 2000 });
            this.savedSettingsList = this.savedSettingsList.filter(s => s.id !== settingId);
            this.refreshDataSource();
          },
          error: () => {
            this.snackBar.open('Failed to delete setting', 'Close', { duration: 2000 });
          }
        });
      }
    });
  }

  applySavedSetting(setting: AppSettings) {
    this.appSettingsService.updateSettings(setting).subscribe({
      next: () => {
        this.snackBar.open('Applied saved setting!', 'Close', {
          duration: 2000,
        });
        this.dialogRef.close({ applied: true, settings: setting });
        // Store theme color in localStorage for persistence
        if (setting.primaryColor && this.platformService.isBrowser) {
          localStorage.setItem('primary-color', setting.primaryColor);
        }
      },
      error: () => {
        this.snackBar.open('Failed to apply setting', 'Close', {
          duration: 2000,
        });
      },
    });
  }

  closeDialog() {
    this.dialogRef.close();
  }

  trackBySettingId(index: number, item: AppSettings & { id: string }): string {
    return item.id;
  }
    /**
     * Resets settings to default values and applies them.
     */
    resetSettings() {
      const defaultSetting: AppSettings = {
        brandName: 'ViGenAir',
        logoUrl: 'https://services.google.com/fh/files/misc/vigenair_logo.png',
        primaryColor: '#3f51b5',
        // Add other required properties with sensible defaults if needed
      };
      this.applySavedSetting(defaultSetting);
      this.snackBar.open('Reset to default settings!', 'Close', { duration: 2000 });
    }
}
