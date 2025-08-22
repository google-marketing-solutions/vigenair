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
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { PlatformService } from '../core/services/platform.service';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-sidenav',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSidenavModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatCardModule,
  ],
  templateUrl: './sidenav.component.html',
  styleUrl: './sidenav.component.css',
})
export class SidenavComponent implements OnInit {
  // UI Personalization properties
  brandName = '';
  logoPreview = '';
  primaryColor = '#3f51b5';
  currentBrandName = '';
  currentLogo = '';
  currentPrimaryColor = '#3f51b5';
  fillWithPreviousSettings = false;

  showSavedSettingsModal = false;
  savedSettingsList: Array<{ brandName: string; logo: string; primaryColor: string }> = [];

  @ViewChild('settingsSidenav') settingsSidenav!: MatSidenav;
  @ViewChild('logoInput') logoInput!: ElementRef;

  constructor(private snackBar: MatSnackBar, public platformService: PlatformService) {
    if (this.platformService.isBrowser) {
      this.loadPersonalizationSettings();
    }
  }

  ngOnInit() {
    if (this.platformService.isBrowser) {
      this.loadSavedSettingsList();
    }
  }

  // UI Personalization Methods
  toggleSettingsSidenav() {
    this.settingsSidenav.toggle();
  }

  onLogoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.logoPreview = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  // Save current settings to the list and update localStorage
  saveSettings() {
    if (!this.platformService.isBrowser) return;
    const settings = {
      brandName: this.brandName,
      logo: this.logoPreview,
      primaryColor: this.primaryColor,
    };

    // Save as current personalization
    localStorage.setItem('uiPersonalizationSettings', JSON.stringify(settings));

    // Save to saved settings list
    let list = this.getSavedSettingsList();
    list.push(settings);
    localStorage.setItem('uiSavedSettingsList', JSON.stringify(list));
    this.savedSettingsList = list;

    // Apply settings immediately
    this.currentBrandName = this.brandName;
    this.currentLogo = this.logoPreview;
    this.currentPrimaryColor = this.primaryColor;
    this.applyDynamicTheme();
    this.snackBar.open('Settings saved successfully!', 'Close', {
      duration: 3000,
      horizontalPosition: 'center',
    });
    this.settingsSidenav.close();
  }

  resetSettings() {
    if (!this.platformService.isBrowser) return;
    localStorage.removeItem('uiPersonalizationSettings');
    // Reset to defaults
    this.brandName = '';
    this.logoPreview = '';
    this.primaryColor = '#3f51b5';
    this.currentBrandName = '';
    this.currentLogo = '';
    this.currentPrimaryColor = '#3f51b5';
    this.fillWithPreviousSettings = false;
    // Reset theme
    this.applyDynamicTheme();
    this.snackBar.open('Settings reset to default!', 'Close', {
      duration: 3000,
      horizontalPosition: 'center',
    });
    this.settingsSidenav.close();
  }

  // Load the saved settings list from localStorage
  loadSavedSettingsList() {
    if (!this.platformService.isBrowser) return;
    this.savedSettingsList = this.getSavedSettingsList();
  }

  // Helper to get the saved settings list from localStorage
  getSavedSettingsList() {
    if (!this.platformService.isBrowser) return [];
    const list = localStorage.getItem('uiSavedSettingsList');
    return list ? JSON.parse(list) : [];
  }

  // Delete a saved setting by index
  deleteSavedSetting(index: number) {
    if (!this.platformService.isBrowser) return;
    this.savedSettingsList.splice(index, 1);
    localStorage.setItem('uiSavedSettingsList', JSON.stringify(this.savedSettingsList));
  }

  // Apply a saved setting
  applySavedSetting(index: number) {
    if (!this.platformService.isBrowser) return;
    const setting = this.savedSettingsList[index];
    this.brandName = setting.brandName;
    this.logoPreview = setting.logo;
    this.primaryColor = setting.primaryColor;
    this.currentBrandName = setting.brandName;
    this.currentLogo = setting.logo;
    this.currentPrimaryColor = setting.primaryColor;
    this.applyDynamicTheme();
    localStorage.setItem('uiPersonalizationSettings', JSON.stringify(setting));
    this.snackBar.open('Applied saved setting!', 'Close', { duration: 2000 });
    this.showSavedSettingsModal = false;
  }

  loadPersonalizationSettings() {
    if (!this.platformService.isBrowser) return;
    const savedSettings = localStorage.getItem('uiPersonalizationSettings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      this.currentBrandName = settings.brandName || '';
      this.currentLogo = settings.logo || '';
      this.currentPrimaryColor = settings.primaryColor || '#3f51b5';
      this.applyDynamicTheme();
    }
  }

  applyDynamicTheme() {
    if (!this.platformService.isBrowser) return;
    // This is the method responsible for changing the UI colors
    let styleElement = document.getElementById('dynamic-theme-styles') as HTMLStyleElement;
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'dynamic-theme-styles';
      document.head.appendChild(styleElement);
    }

    const color = this.currentPrimaryColor || '#3f51b5';
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : null;
    };
    const rgb = hexToRgb(color);

    if (rgb) {
      styleElement.innerHTML = `
        :root {
          --primary-color: ${color};
          --primary-color-rgb: ${rgb.r}, ${rgb.g}, ${rgb.b};
        }
        .mat-toolbar.mat-primary {
          background-color: ${color} !important;
        }
        .mat-button.mat-primary,
        .mat-icon-button.mat-primary,
        .mat-stroked-button.mat-primary {
          color: ${color} !important;
        }
        .mat-flat-button.mat-primary,
        .mat-raised-button.mat-primary,
        .mat-fab.mat-primary,
        .mat-mini-fab.mat-primary {
          background-color: ${color} !important;
        }
        .mat-stroked-button.mat-primary {
          border-color: ${color} !important;
        }
        .mat-form-field.mat-focused .mat-form-field-label {
          color: ${color} !important;
        }
        .mat-form-field.mat-focused .mat-form-field-ripple {
          background-color: ${color} !important;
        }
        .mat-checkbox-checked .mat-checkbox-background {
          background-color: ${color} !important;
        }
        .mat-button-toggle-checked {
          background-color: ${color} !important;
          color: #fff !important;
        }
      `;
    }
  }
}