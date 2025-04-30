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

declare var google: any;

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private gsiClient: any; // Type appropriately if you have types installed
  private accessToken: string | undefined;

  constructor(private ngZone: NgZone) {

    this.initializeGsiClient();
  }

  private initializeGsiClient(): void {

    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
       console.error('Google Identity Services library not loaded.');
       return;
    }

    this.gsiClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientId,
      scope: 'https://www.googleapis.com/auth/cloud-platform', 
      callback: (response: any) => { // Use a more specific type if available
        // IMPORTANT: Run inside NgZone to ensure Angular detects changes
        this.ngZone.run(() => {
          if (response.error) {
            console.error('Google Token Client Error:', response.error);
            this.accessToken = undefined;
          } else {
            console.log('Access Token received:', response.access_token);
            this.accessToken = response.access_token;
          }
        });
      },
    });

    console.log('Google Token Client Initialized');
  }


  requestAccessToken(): void {
    if (this.gsiClient) {
      this.gsiClient.requestAccessToken();
    } else {
      console.error('GSI Client not initialized.');
    }
  }

  // Method to get the current token
  getAccessToken(): string | undefined {
    return this.accessToken;
  }

  // Method to sign out / revoke token if needed
  signOut(): void {
    if (this.accessToken && google?.accounts?.oauth2) {
       google.accounts.oauth2.revoke(this.accessToken, () => {
         this.ngZone.run(() => {
           console.log('Token revoked.');
           this.accessToken = undefined;
           // Clear any other user session data
         });
       });
    } else {
       this.accessToken = undefined; // Clear token even if revoke fails or isn't possible
    }
  }
}
