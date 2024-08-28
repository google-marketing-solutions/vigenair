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

export class ScriptUtil {
  static executeWithRetry(
    fn: Function,
    retryDelayMillis = 0,
    maxRetries = 3
  ): GoogleAppsScript.URL_Fetch.HTTPResponse {
    let retryCount = 0;
    let error = null;

    while (retryCount < maxRetries) {
      try {
        return fn();
      } catch (err) {
        if (retryDelayMillis) {
          Utilities.sleep(retryDelayMillis);
        }
        retryCount++;
        error = err;
      }
    }
    throw error;
  }

  static urlFetch(
    url: string,
    method = 'GET',
    params?: unknown
  ): GoogleAppsScript.URL_Fetch.HTTPResponse {
    const baseParams = {
      method: method,
      muteHttpExceptions: true,
      headers: {
        Authorization: `Bearer ${ScriptUtil.getOAuthToken()}`,
      },
    };
    const fullParams = Object.assign({}, baseParams, params || {});
    return this.executeWithRetry(() =>
      UrlFetchApp.fetch(
        url,
        fullParams as GoogleAppsScript.URL_Fetch.URLFetchRequestOptions
      )
    );
  }

  static getOAuthToken() {
    return ScriptApp.getOAuthToken();
  }
}
