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
// src/app/services/auth.service.ts
import { Injectable, NgZone } from '@angular/core';
import { CONFIG } from '../../../../config';
import { AppLogger } from '../../../../logging';
import { Observable, ReplaySubject, of } from 'rxjs';

declare const google: any;

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private gsiClient: any; // Type appropriately if you have types installed
  private accessToken: string | undefined;
  private tokenRequestSubject: ReplaySubject<string> | null = null;

  constructor(private ngZone: NgZone) {

    this.initializeGsiClient();
  }

  private initializeGsiClient(): void {

    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
       AppLogger.error('Google Identity Services library not loaded.');
       return;
    }

    this.gsiClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientId,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      ux_mode: 'popup',
      callback: (response: any) => {
        this.ngZone.run(() => {
          if (response.error) {
            AppLogger.error('Google Token Client Error:', response.error);
            const error = new Error(`Google Token Client Error: ${response.error}`);
            this.accessToken = undefined;
            this.tokenRequestSubject?.error(error);
            this.tokenRequestSubject = null;
          } else {
            AppLogger.debug('Access Token received:', response.access_token);
            this.accessToken = response.access_token;
            this.tokenRequestSubject?.next(response.access_token);
            this.tokenRequestSubject?.complete();
            this.tokenRequestSubject = null;
          }
        });
      },
    });

    AppLogger.debug('Google Token Client Initialized');
  }


  private requestAccessToken(): void {
    if (this.gsiClient) {
      if (!this.tokenRequestSubject) {
        this.tokenRequestSubject = new ReplaySubject<string>(1);
      }
      this.gsiClient.requestAccessToken();
    } else {
      AppLogger.error('GSI Client not initialized.');
      const error = new Error('GSI Client not initialized.');
      this.tokenRequestSubject?.error(error);
      this.tokenRequestSubject = null;
    }
  }

  // Method to get the current token
  getAccessToken(): Observable<string> {
    if (this.accessToken) {
      return of(this.accessToken);
    } else if (this.tokenRequestSubject) {
      return this.tokenRequestSubject.asObservable();
    } else {
      this.requestAccessToken();
      return this.tokenRequestSubject!.asObservable();
    }
  }

  // Method to sign out / revoke token if needed
  signOut(): void {
    if (this.accessToken && google?.accounts?.oauth2) {
       google.accounts.oauth2.revoke(this.accessToken, () => {
         this.ngZone.run(() => {
           AppLogger.info('Token revoked.');
           this.accessToken = undefined;
           this.tokenRequestSubject?.error(new Error('Token revoked.'));
           this.tokenRequestSubject = null;
           // Clear any other user session data
         });
       });
    } else {
       this.accessToken = undefined; // Clear token even if revoke fails or isn't possible
    }
  }
}
