import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface AppSettings {
  brandName: string;
  logoUrl: string;
  primaryColor: string;
  logoFile?: File;
}

@Injectable({ providedIn: 'root' })
export class AppSettingsService {
  private apiBase = '/api/settings';
  public settingsChanged$ = new Subject<AppSettings>();

  constructor(private http: HttpClient) {
    // Initialize service
  }

  private getUserId(): string {
    if (location.hostname === 'localhost') {
      return 'testuser@example.com';
    }
    try {
      // Get the raw email from the session
      if ((window as any).Session?.getActiveUser) {
        const email = (window as any).Session.getActiveUser().getEmail();
        if (email) {
          return email;
        }
      }
    } catch (e) {
      console.warn('Failed to get user email from Session', e);
    }
    return 'testuser@example.com';
  }

  private getAuthHeaders() {
    return {
      headers: new HttpHeaders({
        'X-User-Id': this.getUserId(),
      }),
    };
  }

  getSettings(): Observable<AppSettings> {
    return this.http.get<AppSettings>(
      `${this.apiBase}`,
      this.getAuthHeaders()
    );
  }

  updateSettings(settings: AppSettings): Observable<any> {
    return this.http.put(`${this.apiBase}`, settings, this.getAuthHeaders()).pipe(
      tap(() => {
        this.settingsChanged$.next(settings);
      })
    );
  }

  getSavedSettings(): Observable<(AppSettings & { id: string })[]> {
    return this.http.get<(AppSettings & { id: string })[]>(
      `${this.apiBase}/saved`,
      this.getAuthHeaders()
    );
  }

  saveSetting(settings: AppSettings): Observable<any> {
    return this.http.post(
      `${this.apiBase}/saved`,
      settings,
      this.getAuthHeaders()
    );
  }

  updateSavedSetting(settingId: string, settings: AppSettings): Observable<any> {
    return this.http.put(
      `${this.apiBase}/saved/${settingId}`,
      settings,
      this.getAuthHeaders()
    );
  }

  deleteSavedSetting(settingId: string): Observable<any> {
    return this.http.delete(
      `${this.apiBase}/saved/${settingId}`,
      this.getAuthHeaders()
    );
  }

  getSavedSetting(settingId: string): Observable<AppSettings & { id: string }> {
    return this.http.get<AppSettings & { id: string }>(
      `${this.apiBase}/saved/${settingId}`,
      this.getAuthHeaders()
    );
  }

  uploadLogo(logoFile: File): Observable<{ logoUrl: string }> {
    const formData = new FormData();
    formData.append('file', logoFile, logoFile.name);
    return this.http.post<{ logoUrl: string }>(
      `${this.apiBase}/logo`,
      formData,
      this.getAuthHeaders()
    );
  }
}
