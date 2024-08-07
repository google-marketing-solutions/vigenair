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

export interface Timestamp {
  seconds?: number;
  nanos?: number;
}

export class TimeUtil {
  static timeStringToSeconds(timeString: string): number {
    const [minutes, seconds] = timeString.split(':');
    return Number(minutes) * 60 + Number(seconds);
  }

  static secondsToTimeString(seconds: number): string {
    const date = new Date(0);
    date.setSeconds(Number(seconds.toFixed()));
    // extracts mm:ss from yyyy-MM-ddTHH:mm:ss.SSSZ
    const timeString = date.toISOString().substring(14, 19);
    if (timeString.startsWith('0')) {
      return timeString.substring(1);
    }
    return timeString;
  }

  static timestampToSeconds(timestamp: Timestamp) {
    if (!timestamp) {
      return 0;
    }
    return (timestamp.seconds || 0) + (timestamp.nanos || 0) / 1e9;
  }
}
