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
import { ScriptUtil } from './script-util';

export class StorageManager {
  static getGcsUrlBase(): string {
    return `${CONFIG.cloudStorage.endpointBase}/b/${CONFIG.cloudStorage.bucket}`;
  }

  static loadFile(
    filePath: string,
    asString = false
  ): string | GoogleAppsScript.Byte[] | null {
    const url = `${StorageManager.getGcsUrlBase()}/o/${encodeURIComponent(filePath)}?alt=media`;

    const response = ScriptUtil.executeWithRetry(() =>
      ScriptUtil.urlFetch(url)
    );
    if (response.getResponseCode() === 404) {
      return null;
    }
    return asString ? response.getContentText() : response.getContent();
  }

  static listObjects(delimiter = '/', prefix?: string): string[] {
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

    const response = ScriptUtil.executeWithRetry(() =>
      ScriptUtil.urlFetch(url)
    );
    const result: GoogleCloud.Storage.ListResponse = JSON.parse(
      response.getContentText()
    );
    if (delimiter && !result.prefixes) {
      return [];
    }
    if (delimiter) {
      return result.prefixes.map(
        (e: string) => e.replace(prefix ?? '', '').split('/')[0]
      );
    }
    return result.items.map((e: GoogleCloud.Storage.Objects) => e.name);
  }

  static uploadFile(
    base64EncodedContent: string,
    folder: string,
    filename = 'input.mp4',
    contentType = 'video/mp4'
  ) {
    const fileBlob = Utilities.newBlob(
      Utilities.base64Decode(base64EncodedContent),
      contentType,
      filename
    );
    const fullName = encodeURIComponent(`${folder}/${filename}`);
    const url = `${CONFIG.cloudStorage.uploadEndpointBase}/b/${CONFIG.cloudStorage.bucket}/o?uploadType=media&name=${fullName}`;
    const bytes = fileBlob.getBytes();

    const response = ScriptUtil.urlFetch(url, 'POST', {
      contentType: fileBlob.getContentType()!,
      payload: bytes,
    });
    const result = JSON.parse(response.getContentText());
    AppLogger.debug(`Uploaded ${filename} to ${result.bucket}/${result.name}`);
  }

  static deleteFile(filePath: string) {
    const url = `${StorageManager.getGcsUrlBase()}/o/${encodeURIComponent(filePath)}`;
    ScriptUtil.urlFetch(url, 'DELETE');
    AppLogger.debug(`Deleted file ${filePath}`);
  }

  static renameFile(filePath: string, destinationPath: string) {
    const url = `${StorageManager.getGcsUrlBase()}/o/${encodeURIComponent(filePath)}/rewriteTo/b/${CONFIG.cloudStorage.bucket}/o/${encodeURIComponent(destinationPath)}`;
    ScriptUtil.urlFetch(url, 'POST');
    AppLogger.debug(`Renamed file ${filePath} to ${destinationPath}`);

    StorageManager.deleteFile(filePath);
  }

  static deleteFolder(folder: string) {
    StorageManager.listObjects('', folder).forEach(file =>
      StorageManager.deleteFile(file)
    );
    AppLogger.debug(`Deleted video folder ${folder}`);
  }
}
