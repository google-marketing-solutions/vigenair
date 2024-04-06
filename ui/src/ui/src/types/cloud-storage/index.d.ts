/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the MIT License;
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       https://www.mit.edu/~amini/LICENSE.md
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
declare namespace GoogleCloud {
  namespace Storage {
    interface ListResponse {
      kind: string;
      nextPageToken: string;
      prefixes: string[];
      items: Objects[];
    }

    interface Objects {
      kind: string;
      id: string;
      selfLink: string;
      mediaLink: string;
      name: string;
      bucket: string;
      generation: number;
      metageneration: number;
      contentType: string;
      storageClass: string;
      size: number;
      md5Hash: string;
      contentEncoding: string;
      contentDisposition: string;
      contentLanguage: string;
      cacheControl: string;
      crc32c: string;
      componentCount: integer;
      etag: string;
      kmsKeyName: string;
      temporaryHold: boolean;
      eventBasedHold: boolean;
      retentionExpirationTime: string;
      timeCreated: string;
      updated: string;
      timeDeleted: string;
      timeStorageClassUpdated: string;
      customTime: string;
      metadata: {
        (key: string): string;
      };
      owner: {
        entity: string;
        entityId: string;
      };
    }
  }
}
