/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

function _getFromGcs(filePath: string) {
  const url = `https://storage.googleapis.com/storage/v1/b/vigenair_testing/o/${encodeURIComponent(filePath)}?alt=media`;
  const accessToken = ScriptApp.getOAuthToken();
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (response.getResponseCode() === 404) {
    return;
  }
  return response.getContent();
}

function getFromGcs(filePath: string, mimeType: string) {
  const result = _getFromGcs(filePath);
  if (!result) {
    return;
  }
  const dataUrl = `data:${mimeType};base64,${Utilities.base64Encode(result)}`;
  return dataUrl;
}

function uploadVideo(dataUrl: string) {
  const folder = '' + Date.now();
  const filename = 'input.mp4';
  const videoBlob = Utilities.newBlob(
    Utilities.base64Decode(dataUrl.split(',')[1]),
    'video/mp4',
    filename
  );
  const fullName = encodeURIComponent(`uploads/${folder}/${filename}`);
  const url = `https://storage.googleapis.com/upload/storage/v1/b/vigenair_testing/o?uploadType=media&name=${fullName}`;
  const bytes = videoBlob.getBytes();
  const accessToken = ScriptApp.getOAuthToken();

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: videoBlob.getContentType()!,
    payload: bytes,
    muteHttpExceptions: true,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const result = JSON.parse(response.getContentText());
  Logger.log(
    `https://storage.cloud.google.com/${result.bucket}/${result.name}`
  );
  return folder;
}

function doGet() {
  return HtmlService.createTemplateFromFile('ui')
    .evaluate()
    .setTitle('ViGenAiR');
}

function include(filename: string) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
