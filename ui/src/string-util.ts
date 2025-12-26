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

export class StringUtil {
  static encode(data: string) {
    const dataBytes = new TextEncoder().encode(data);
    const binaryString = Array.from(dataBytes, (byte: any) =>
      String.fromCodePoint(byte)
    ).join('');
    return btoa(binaryString);
  }

  // https://developer.mozilla.org/en-US/docs/Glossary/Base64#the_unicode_problem
  static decode(encodedData: string) {
    const binaryString = atob(encodedData);
    return new TextDecoder().decode(
      Uint8Array.from(binaryString, (m: any) => m.codePointAt(0))
    );
  }

  static gcsSanitise(input: string) {
    return input
      .replace(/[#\/\[\]*?:"<>|]/g, '') // See https://cloud.google.com/storage/docs/objects#naming
      .replace(/--+/g, '-'); // Replace consecutive hyphens with single hyphen to avoid metadata parsing issues
  }
}
