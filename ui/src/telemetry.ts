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

import { TelemetryAttribution } from './ui/src/app/api-calls/api-calls.service.interface';

/**
 * GA4 Measurement Protocol target credentials for usage telemetry.
 */
export interface TelemetryConfig {
  measurementId: string;
  apiSecret: string;
}

const DEFAULT_MEASUREMENT_ID = 'G-Z2TKLQZ79K';
// Write-only GA4 Measurement Protocol key for anonymous usage telemetry.
const DEFAULT_API_SECRET = 'S7toNnNZQPWzViq44q_8gg';
const GA4_MP_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const APP_NAME = 'VigenAir';
const EVENT_NAME = 'SOLUTION_USAGE';
const EXTERNAL_CID_REGEX = /^\d{3}[-\s]?\d{3}[-\s]?\d{4}$/;
const OPT_OUT_VALUES = new Set(['false', '0', 'no']);

/**
 * Helper class for dispatching opt-in, anonymous SOLUTION_USAGE events via the
 * GA4 Measurement Protocol. Wrapped in a class so helper methods are not
 * exposed as global Apps Script functions callable via `google.script.run`.
 */
export class TelemetryHelper {
  /**
   * Returns true only when the caller explicitly opted in (`optIn === true`)
   * and deployment-level `TELEMETRY_OPT_IN` is not disabled in ScriptProperties.
   */
  static isTelemetryEnabled(optIn?: boolean): boolean {
    if (optIn !== true) {
      return false;
    }
    try {
      const propOptIn =
        PropertiesService.getScriptProperties().getProperty('TELEMETRY_OPT_IN');
      if (propOptIn && OPT_OUT_VALUES.has(propOptIn.trim().toLowerCase())) {
        return false;
      }
    } catch (e: unknown) {
      console.warn('Unable to read TELEMETRY_OPT_IN ScriptProperty:', e);
    }
    return true;
  }

  /**
   * Validates and formats a 10-digit external Google Ads Customer ID as
   * XXX-XXX-XXXX (preserving hyphens).
   */
  static formatCustomerId(
    rawCustomerId: string | undefined | null
  ): string | undefined {
    if (!rawCustomerId) {
      return undefined;
    }
    const trimmed = rawCustomerId.trim();
    if (!trimmed) {
      return undefined;
    }
    if (!EXTERNAL_CID_REGEX.test(trimmed)) {
      console.warn('Ignoring malformed Google Ads Customer ID.');
      return undefined;
    }
    const digitsOnly = trimmed.replace(/\D/g, '');
    return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`;
  }

  /**
   * Reads GA4 telemetry config, allowing ScriptProperties to override defaults.
   */
  static getTelemetryConfig(): TelemetryConfig {
    let measurementId = DEFAULT_MEASUREMENT_ID;
    let apiSecret = DEFAULT_API_SECRET;
    try {
      const props = PropertiesService.getScriptProperties();
      const propMeasurementId = props.getProperty('TELEMETRY_MEASUREMENT_ID');
      const propApiSecret = props.getProperty('TELEMETRY_API_SECRET');
      if (propMeasurementId && propMeasurementId.trim()) {
        measurementId = propMeasurementId.trim();
      }
      if (propApiSecret && propApiSecret.trim()) {
        apiSecret = propApiSecret.trim();
      }
    } catch (e: unknown) {
      console.warn('Unable to read Telemetry ScriptProperties:', e);
    }
    return { measurementId, apiSecret };
  }

  /**
   * Dispatches an opt-in, anonymous SOLUTION_USAGE event via GA4 Measurement
   * Protocol with ad personalization disabled (`non_personalized_ads: true`).
   * Fails open so telemetry errors never disrupt application flows.
   */
  static trackSolutionUsage(
    action: 'variant_generated' | 'variant_rendered',
    attribution?: TelemetryAttribution
  ): void {
    try {
      if (!TelemetryHelper.isTelemetryEnabled(attribution?.optIn)) {
        return;
      }

      const formattedCid = TelemetryHelper.formatCustomerId(
        attribution?.customerId
      );
      if (!formattedCid) {
        return;
      }

      const { measurementId, apiSecret } = TelemetryHelper.getTelemetryConfig();
      const eventId = Utilities.getUuid();
      const clientId =
        Session.getTemporaryActiveUserKey() || Utilities.getUuid();

      const params: Record<string, string> = {
        app: APP_NAME,
        label: action,
        external_event_id: eventId,
        th_google_ads_customer_id: formattedCid,
      };

      const payload = {
        non_personalized_ads: true,
        client_id: clientId,
        events: [
          {
            name: EVENT_NAME,
            params,
          },
        ],
      };

      const url =
        `${GA4_MP_ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}` +
        `&api_secret=${encodeURIComponent(apiSecret)}`;

      const response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });

      const statusCode = response.getResponseCode();
      if (statusCode < 200 || statusCode >= 300) {
        console.warn(
          `Usage telemetry request returned HTTP ${statusCode} for [${action}]: ${response.getContentText()}`
        );
      }
    } catch (e: unknown) {
      console.warn(`Usage telemetry logging failed for [${action}]:`, e);
    }
  }
}
