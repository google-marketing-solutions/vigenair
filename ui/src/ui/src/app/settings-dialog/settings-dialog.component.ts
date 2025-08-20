import { Component, OnInit, Inject } from '@angular/core';
import { AppSettingsService, AppSettings } from '../services/app-settings.service';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-settings-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatIconModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    FormsModule
  ],
  templateUrl: './settings-dialog.component.html',
  styleUrls: ['./settings-dialog.component.css']
})
export class SettingsDialogComponent implements OnInit {
  settings: AppSettings = { brandName: '', logoUrl: '', primaryColor: '' };
  loading = false;
  error = '';
  logoPreview: string | null = null;
  brandName: string = '';
  primaryColor: string = '';

  editMode = false;
  settingId: string = '';

  selectedLogoFile: File | null = null;

  constructor(
    private appSettingsService: AppSettingsService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<SettingsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    if (this.data?.editMode) {
      this.editMode = true;
      this.settingId = this.data.settingId;
      if (this.data.prefilledData) {
        this.prefillData(this.data.prefilledData);
      }
    }
    // Set initial color from theme service
    const currentColor = localStorage.getItem('themeColor');
    if (currentColor) {
      this.primaryColor = currentColor;
    }
  }

  ngOnInit() {
    // No-op. Logic is handled in constructor or on user interaction.
  }

  loadSettings() {
    this.loading = true;
    this.appSettingsService.getSettings().subscribe({
      next: (settings: AppSettings) => {
        this.settings = settings;
        this.logoPreview = settings.logoUrl;
        this.brandName = settings.brandName;
        this.primaryColor = settings.primaryColor;
        this.loading = false;
      },
      error: (err: any) => {
        this.error = 'Failed to load settings';
        this.loading = false;
      }
    });
  }

  onLogoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedLogoFile = file;
      const reader = new FileReader();
      reader.onload = () => {
        this.logoPreview = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  prefillData(data: any) {
    this.brandName = data.brandName;
    this.primaryColor = data.primaryColor;
    this.logoPreview = data.logoUrl;
    this.settings = {
      brandName: data.brandName,
      logoUrl: data.logoUrl,
      primaryColor: data.primaryColor
    };
  }

  saveSettings() {
    this.loading = true;
    this.error = '';

    if (this.selectedLogoFile) {
      this.appSettingsService.uploadLogo(this.selectedLogoFile).subscribe({
        next: (response) => {
          this.settings.logoUrl = response.logoUrl;
          this.proceedToSaveSettings();
        },
        error: (error) => {
          this.error = 'Failed to upload logo';
          this.loading = false;
        }
      });
    } else {
      this.proceedToSaveSettings();
    }
  }

  proceedToSaveSettings() {
    const settingsToSave: AppSettings = {
      brandName: this.brandName,
      primaryColor: this.primaryColor,
      logoUrl: this.logoPreview || ''
    };

    const operation = this.editMode
      ? this.appSettingsService.updateSavedSetting(this.settingId, settingsToSave)
      : this.appSettingsService.saveSetting(settingsToSave);

    operation.subscribe({
      next: (savedSetting) => {
        this.loading = false;
        this.snackBar.open('Settings saved successfully!', 'Close', { duration: 2000 });
        this.dialogRef.close({ saved: true, setting: savedSetting });
        // Store theme color in localStorage for persistence
        if (settingsToSave.primaryColor) {
          localStorage.setItem('primary-color', settingsToSave.primaryColor);
        }
      },
      error: (error) => {
        this.error = 'Failed to save settings';
        this.loading = false;
      }
    });
  }

  resetSettings() {
    if (this.editMode && this.data.prefilledData) {
      this.prefillData(this.data.prefilledData);
    } else {
      this.loadSettings();
    }
  }
}