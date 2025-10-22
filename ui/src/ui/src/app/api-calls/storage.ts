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

import { Injectable } from '@angular/core';
import { CONFIG } from '../../../../config';
import { AppLogger } from '../../../../logging';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { catchError, of, switchMap, Observable, map, tap, from } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class StorageManager {
  constructor(
    private httpClient: HttpClient,
    private authService: AuthService
  ) {}

  static getGcsUrlBase(): string {
    return `${CONFIG.cloudStorage.endpointBase}/b/${CONFIG.cloudStorage.bucket}`;
  }

  static getFileUrl(filePath: string) {
    return `${StorageManager.getGcsUrlBase()}/o/${encodeURIComponent(filePath)}?alt=media`;
  }

  loadTextFile(filePath: string): Observable<string> {
    const url = StorageManager.getFileUrl(filePath);
    return this.authService.getAccessToken().pipe(
      switchMap(userAuthToken =>
        this.httpClient.get(url, {
          responseType: 'text',
          headers: new HttpHeaders({
            Authorization: `Bearer ${userAuthToken}`,
          }),
        }).pipe(
         switchMap(response => {
          return of(response);
         }),
         catchError(error => {
          console.error('Load file failed with error: ', error);
          return of('');
        })  
        )
      ));
  }

  loadBlobFile(filePath: string): Observable<Blob> {
    const url = StorageManager.getFileUrl(filePath);
    return this.authService.getAccessToken().pipe(
      switchMap(userAuthToken =>
        this.httpClient.get(url, {
          responseType: 'blob',
          headers: new HttpHeaders({
            Authorization: `Bearer ${userAuthToken}`,
          }),
        }).pipe(
         switchMap(response => {
          return of(response);
         }),
         catchError(error => {
          console.error('Load file failed with error: ', error);
          throw error;
        })  
        )
      ));
  }

  loadJsonFile(url: string): Observable<any> {
    return this.authService.getAccessToken().pipe(
      switchMap(userAuthToken =>
        this.httpClient.get(url, {
          responseType: 'json',
          headers: new HttpHeaders({
            Authorization: `Bearer ${userAuthToken}`,
          }),
        }).pipe(
         switchMap(response => {
          return of(response);
         }),
         catchError(error => {
          console.error('Load file failed with error: ', error);
          throw error;
        })  
        )
      ));
  }

  loadFile(
    filePath: string,
    asString = false
  ): Observable<string> | Observable<Blob> | null {
    if (asString) {
      return this.loadTextFile(filePath);
    } else {
      return this.loadBlobFile(filePath);
    }
  }

  listObjects(delimiter = '/', prefix?: string): Observable<string[]> {
    let url = `${StorageManager.getGcsUrlBase()}/o?`;

    if (delimiter) {
      url += `delimiter=${encodeURIComponent(delimiter)}`;
    }
    if (prefix) {
      if (!url.endsWith('?')) {
        url += '&';
      }
      url += `prefix=${encodeURIComponent(prefix)}`;
    }

    const response = this.loadJsonFile(url);
    return response.pipe(
      switchMap(response => {
        if (delimiter && !response.prefixes) {
          return of([]);
        }
        if (delimiter) {
          const prefixes = response.prefixes.map((prefix: string) =>
            prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
          );
          return of(prefixes);
        }
        return of(response.items.map((e: GoogleCloud.Storage.Objects) => e.name));
      }),
      catchError(error => {
        console.error('Load runs failed with error: ', error);
        throw error;
      })
    );
  }

  static stringToBytes(str: string) {
    const bArray = new Uint8Array(str.length);
    for (var i = 0; i < bArray.length; i++) {
      bArray[i] = str.charCodeAt(i);
    }
    return bArray.buffer;
  }

  private _performUpload(
    bytes: ArrayBuffer,
    folder: string,
    filename: string,
    contentType: string
  ): Observable<GoogleCloud.Storage.Objects> {
    const fullName = encodeURIComponent(`${folder}/${filename}`);
    const url = `${CONFIG.cloudStorage.uploadEndpointBase}/b/${CONFIG.cloudStorage.bucket}/o?uploadType=media&name=${fullName}`;

    return this.authService.getAccessToken().pipe(
      switchMap(userAuthToken =>
        this.httpClient.post<GoogleCloud.Storage.Objects>(url, bytes, {
          headers: new HttpHeaders({
            Authorization: `Bearer ${userAuthToken}`,
            'Content-Type': contentType,
          }),
        })
      ),
      tap(response => {
        AppLogger.debug(`Uploaded ${filename} to ${response.bucket}/${response.name}`, response);
      }),
      catchError(error => {
        console.error(`Upload of ${filename} to ${folder}/${filename} failed with error: `, error);
        throw error;
      })
    );
  }

  uploadFile(
    base64EncodedContent: string,
    folder: string,
    filename = 'input.mp4',
    contentType = 'video/mp4'
  ): Observable<GoogleCloud.Storage.Objects> {
    const byteStr = atob(base64EncodedContent);    
    const bytes = StorageManager.stringToBytes(byteStr);
    return this._performUpload(bytes, folder, filename, contentType);
  }

  uploadStringContent(
    content: string,
    folder: string,
    filename: string,
    contentType: string = 'text/plain'
  ): Observable<GoogleCloud.Storage.Objects> {
    const bytes = new TextEncoder().encode(content).buffer;
    return this._performUpload(bytes, folder, filename, contentType);
  }

  uploadBlob(
    blob: Blob,
    folder: string,
    filename: string,
    contentType: string
  ): Observable<GoogleCloud.Storage.Objects> {
    return from(blob.arrayBuffer()).pipe(
      switchMap(arrayBuffer => {
        return this._performUpload(arrayBuffer, folder, filename, contentType);
      })
    );
  }

  deleteFile(filePath: string) {
    const url = `${StorageManager.getGcsUrlBase()}/o/${encodeURIComponent(filePath)}`;
    this.authService.getAccessToken().pipe(
      switchMap(userAuthToken => 
        this.httpClient.delete(url, {
          headers: new HttpHeaders({
            Authorization: `Bearer ${userAuthToken}`,
          }),
        }).pipe(
          switchMap(response => {
            AppLogger.debug(`Deleted ${filePath}`);
            return of(response);
          }),
          catchError(error => {
            console.error('Delete file failed with error: ', error);
            throw error;
          })
        )
      )
    );
  }

  renameFile(filePath: string, destinationPath: string) {
    const url = `${StorageManager.getGcsUrlBase()}/o/${encodeURIComponent(filePath)}/rewriteTo/b/${CONFIG.cloudStorage.bucket}/o/${encodeURIComponent(destinationPath)}`;
    this.authService.getAccessToken().pipe(
      switchMap(userAuthToken =>
        this.httpClient.post(url, null, {
          headers: new HttpHeaders({
            Authorization: `Bearer ${userAuthToken}`,
          }),
        }).pipe(
          switchMap(response => {
            AppLogger.debug(`Renamed file ${filePath} to ${destinationPath}`);
            this.deleteFile(filePath);
            return of(response);
          }),
          catchError(error => { 
            console.error('Rename file failed with error: ', error);
            throw error;
          })
        )
      )
    );    
  }

  deleteFolder(folder: string) {
    this.listObjects('', folder).pipe(
      map(files => files.forEach(file => this.deleteFile(file)))
    );
    AppLogger.debug(`Deleted video folder ${folder}`);
  }
}
