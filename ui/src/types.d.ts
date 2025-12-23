/**
 * Copyright 2025 Google LLC
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

/**
 * Type definitions for Google Cloud Storage API responses
 */
declare namespace GoogleCloud {
  namespace Storage {
    interface Objects {
      kind: string;
      id: string;
      selfLink: string;
      name: string;
      bucket: string;
      generation: string;
      metageneration: string;
      contentType: string;
      timeCreated: string;
      updated: string;
      storageClass: string;
      timeStorageClassUpdated: string;
      size: string;
      md5Hash: string;
      mediaLink: string;
      crc32c: string;
      etag: string;
    }

    interface ListResponse {
      kind: string;
      prefixes?: string[];
      items: Objects[];
      nextPageToken?: string;
    }
  }
}
