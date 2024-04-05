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

import { CONFIG } from './config';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getRunsFromGcs() {
  const url = `https://storage.googleapis.com/storage/v1/b/${
    CONFIG.GCS_BUCKET
  }/o?delimiter=${encodeURIComponent('/')}`;
  const accessToken = ScriptApp.getOAuthToken();

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const result: GoogleCloud.Storage.ListResponse = JSON.parse(
    response.getContentText()
  );
  if (!result.prefixes) {
    return [];
  }
  return result.prefixes.map(e => e.split('/')[0]);
}

function _getFromGcs(filePath: string) {
  const url = `https://storage.googleapis.com/storage/v1/b/${CONFIG.GCS_BUCKET}/o/${encodeURIComponent(filePath)}?alt=media`;
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getFromGcs(filePath: string, mimeType: string) {
  const result = _getFromGcs(filePath);
  if (!result) {
    return;
  }
  const dataUrl = `data:${mimeType};base64,${Utilities.base64Encode(result)}`;
  return dataUrl;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function uploadVideo(dataUrl: string, uploadedFileName: string) {
  const userId =
    Session.getActiveUser().getEmail() || Session.getTemporaryActiveUserKey();
  const folder = `${uploadedFileName}--${Date.now()}--${Utilities.base64Encode(userId)}`;
  const filename = 'input.mp4';
  const videoBlob = Utilities.newBlob(
    Utilities.base64Decode(dataUrl.split(',')[1]),
    'video/mp4',
    filename
  );
  const fullName = encodeURIComponent(`${folder}/${filename}`);
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${CONFIG.GCS_BUCKET}/o?uploadType=media&name=${fullName}`;
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function doGet() {
  return HtmlService.createTemplateFromFile('ui')
    .evaluate()
    .setTitle('Vigenair');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function include(filename: string) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
