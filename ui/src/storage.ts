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

import { CONFIG } from './config';
import { AppLogger } from './logging';
import { ScriptUtil } from './utils';

export class StorageManager {
  static getGcsUrlBase(): string {
    return `${CONFIG.cloudStorage.endpointBase}/b/${CONFIG.cloudStorage.bucket}/o`;
  }

  static loadFile(
    filePath: string,
    asString = false
  ): string | GoogleAppsScript.Byte[] | null {
    const url = `${this.getGcsUrlBase()}/${encodeURIComponent(filePath)}?alt=media`;

    const response = ScriptUtil.executeWithRetry(() =>
      ScriptUtil.urlFetch(url)
    );
    if (response.getResponseCode() === 404) {
      return null;
    }
    return asString ? response.getContentText() : response.getContent();
  }

  static listObjects(prefix = '/'): string[] {
    const url = `${this.getGcsUrlBase()}?delimiter=${encodeURIComponent(prefix)}`;

    const response = ScriptUtil.executeWithRetry(() =>
      ScriptUtil.urlFetch(url)
    );
    const result: GoogleCloud.Storage.ListResponse = JSON.parse(
      response.getContentText()
    );
    if (!result.prefixes) {
      return [];
    }
    return result.prefixes.map((e: string) => e.split('/')[0]);
  }

  static uploadFile(
    base64EncodedContent: string,
    folder: string,
    filename: string = 'input.mp4'
  ) {
    const videoBlob = Utilities.newBlob(
      Utilities.base64Decode(base64EncodedContent),
      'video/mp4',
      filename
    );
    const fullName = encodeURIComponent(`${folder}/${filename}`);
    const url = `${CONFIG.cloudStorage.uploadEndpointBase}/b/${CONFIG.cloudStorage.bucket}/o?uploadType=media&name=${fullName}`;
    const bytes = videoBlob.getBytes();

    const response = ScriptUtil.urlFetch(url, 'POST', {
      contentType: videoBlob.getContentType()!,
      payload: bytes,
    });
    const result = JSON.parse(response.getContentText());
    AppLogger.debug(`Uploaded video to ${result.bucket}/${result.name}`);
  }
}
