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

/// <reference types="jest" />

import { TelemetryHelper } from '../src/telemetry';

describe('TelemetryHelper', () => {
  const fetchMock = jest.fn();
  const getPropertyMock = jest.fn();
  const getTemporaryActiveUserKeyMock = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    getPropertyMock.mockReturnValue(null);
    getTemporaryActiveUserKeyMock.mockReturnValue('anon-user-key-123');
    fetchMock.mockReturnValue({
      getResponseCode: () => 204,
      getContentText: () => '',
    });

    (globalThis as unknown as Record<string, unknown>)['Session'] = {
      getTemporaryActiveUserKey: getTemporaryActiveUserKeyMock,
    };
    (globalThis as unknown as Record<string, unknown>)['PropertiesService'] = {
      getScriptProperties: () => ({
        getProperty: getPropertyMock,
      }),
    };
    (globalThis as unknown as Record<string, unknown>)['Utilities'] = {
      getUuid: () => 'test-uuid-1234',
    };
    (globalThis as unknown as Record<string, unknown>)['UrlFetchApp'] = {
      fetch: fetchMock,
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('isTelemetryEnabled', () => {
    it('returns false by default when caller has not explicitly opted in', () => {
      expect(TelemetryHelper.isTelemetryEnabled()).toBe(false);
      expect(TelemetryHelper.isTelemetryEnabled(false)).toBe(false);
    });

    it('returns true when caller explicitly opts in and deployment did not disable telemetry', () => {
      expect(TelemetryHelper.isTelemetryEnabled(true)).toBe(true);
    });

    it('returns false when TELEMETRY_OPT_IN ScriptProperty is false, 0, or no', () => {
      for (const value of ['false', 'FALSE', '0', 'no', ' No ']) {
        getPropertyMock.mockReturnValue(value);
        expect(TelemetryHelper.isTelemetryEnabled(true)).toBe(false);
      }
    });

    it('returns true when TELEMETRY_OPT_IN ScriptProperty is true and caller opted in', () => {
      getPropertyMock.mockReturnValue('true');
      expect(TelemetryHelper.isTelemetryEnabled(true)).toBe(true);
    });
  });

  describe('formatCustomerId', () => {
    it('preserves hyphens for already-hyphenated 10-digit CIDs', () => {
      expect(TelemetryHelper.formatCustomerId('123-456-7890')).toBe(
        '123-456-7890'
      );
    });

    it('auto-formats unhyphenated or space-separated 10-digit CIDs to XXX-XXX-XXXX', () => {
      expect(TelemetryHelper.formatCustomerId('1234567890')).toBe(
        '123-456-7890'
      );
      expect(TelemetryHelper.formatCustomerId('123 456 7890')).toBe(
        '123-456-7890'
      );
    });

    it('returns undefined for empty or whitespace inputs', () => {
      expect(TelemetryHelper.formatCustomerId('')).toBeUndefined();
      expect(TelemetryHelper.formatCustomerId('   ')).toBeUndefined();
      expect(TelemetryHelper.formatCustomerId(undefined)).toBeUndefined();
    });

    it('drops malformed Customer IDs and logs a warning', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      expect(TelemetryHelper.formatCustomerId('123456789')).toBeUndefined();
      expect(TelemetryHelper.formatCustomerId('abc')).toBeUndefined();
      expect(TelemetryHelper.formatCustomerId('12-3456-7890')).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('getTelemetryConfig', () => {
    it('returns default GA4 credentials when ScriptProperties are unset', () => {
      expect(TelemetryHelper.getTelemetryConfig()).toEqual({
        measurementId: 'G-Z2TKLQZ79K',
        apiSecret: 'S7toNnNZQPWzViq44q_8gg',
      });
    });

    it('allows ScriptProperties to override measurementId and apiSecret', () => {
      getPropertyMock.mockImplementation((key: string) => {
        if (key === 'TELEMETRY_MEASUREMENT_ID') return 'G-OVERRIDE';
        if (key === 'TELEMETRY_API_SECRET') return 'custom-secret';
        return null;
      });
      expect(TelemetryHelper.getTelemetryConfig()).toEqual({
        measurementId: 'G-OVERRIDE',
        apiSecret: 'custom-secret',
      });
    });
  });

  describe('trackSolutionUsage', () => {
    it('dispatches SOLUTION_USAGE with non_personalized_ads=true, hyphenated CID, label, and anonymous client_id when opted in', () => {
      TelemetryHelper.trackSolutionUsage('variant_generated', {
        optIn: true,
        customerId: '1234567890',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://www.google-analytics.com/mp/collect?measurement_id=G-Z2TKLQZ79K&api_secret=S7toNnNZQPWzViq44q_8gg'
      );
      expect(options.method).toBe('post');
      expect(options.contentType).toBe('application/json');
      expect(options.muteHttpExceptions).toBe(true);

      expect(JSON.parse(options.payload)).toEqual({
        non_personalized_ads: true,
        client_id: 'anon-user-key-123',
        events: [
          {
            name: 'SOLUTION_USAGE',
            params: {
              app: 'VigenAir',
              label: 'variant_generated',
              external_event_id: 'test-uuid-1234',
              th_google_ads_customer_id: '123-456-7890',
            },
          },
        ],
      });
    });

    it('falls back to a random UUID for client_id when temporary active user key is empty', () => {
      getTemporaryActiveUserKeyMock.mockReturnValue('');
      TelemetryHelper.trackSolutionUsage('variant_rendered', {
        optIn: true,
        customerId: '123-456-7890',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, options] = fetchMock.mock.calls[0];
      expect(JSON.parse(options.payload).client_id).toBe('test-uuid-1234');
    });

    it('does not send telemetry when optIn is omitted or false', () => {
      TelemetryHelper.trackSolutionUsage('variant_rendered', {
        customerId: '123-456-7890',
      });
      TelemetryHelper.trackSolutionUsage('variant_rendered', {
        optIn: false,
        customerId: '123-456-7890',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not send telemetry when deployment TELEMETRY_OPT_IN is false', () => {
      getPropertyMock.mockImplementation((key: string) =>
        key === 'TELEMETRY_OPT_IN' ? 'false' : null
      );
      TelemetryHelper.trackSolutionUsage('variant_generated', {
        optIn: true,
        customerId: '123-456-7890',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('skips sending when Customer ID is omitted or malformed', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      TelemetryHelper.trackSolutionUsage('variant_generated', { optIn: true });
      TelemetryHelper.trackSolutionUsage('variant_generated', {
        optIn: true,
        customerId: 'invalid-cid',
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('logs a warning on non-2xx HTTP responses without throwing', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      fetchMock.mockReturnValue({
        getResponseCode: () => 500,
        getContentText: () => 'Internal Server Error',
      });

      expect(() =>
        TelemetryHelper.trackSolutionUsage('variant_rendered', {
          optIn: true,
          customerId: '123-456-7890',
        })
      ).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        'Usage telemetry request returned HTTP 500 for [variant_rendered]: Internal Server Error'
      );
    });

    it('fails open and passes the error directly to console.warn when UrlFetchApp throws', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const networkError = new Error('Network timeout');
      fetchMock.mockImplementation(() => {
        throw networkError;
      });
      expect(() =>
        TelemetryHelper.trackSolutionUsage('variant_rendered', {
          optIn: true,
          customerId: '123-456-7890',
        })
      ).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        'Usage telemetry logging failed for [variant_rendered]:',
        networkError
      );
    });
  });
});
