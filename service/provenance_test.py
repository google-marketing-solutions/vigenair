# Copyright 2026 Google LLC.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import json
import os
import sys
import tempfile
import unittest
from unittest import mock

# Ensure service directory is on sys.path
service_dir = os.path.abspath(os.path.dirname(__file__))
if service_dir not in sys.path:
  sys.path.insert(0, service_dir)

import provenance


class ProvenanceTest(unittest.TestCase):

  def setUp(self):
    super().setUp()
    provenance.clear_cache()

  def tearDown(self):
    provenance.clear_cache()
    super().tearDown()

  def test_unsigned_asset_has_disclosure_and_hash(self):
    with tempfile.NamedTemporaryFile(suffix='.png') as asset_file:
      asset_file.write(b'asset')
      asset_file.flush()
      with mock.patch.dict(os.environ, {}, clear=False):
        os.environ.pop('CONFIG_C2PA_ENABLED', None)
        os.environ.pop('CONFIG_C2PA_REQUIRED', None)

        result = provenance.apply_provenance(asset_file.name)

    self.assertEqual(result['type'], 'none')
    self.assertEqual(result['status'], 'unsigned')
    self.assertEqual(len(result['sha256']), 64)
    self.assertTrue(result['disclosure'])

  def test_unsupported_asset_type_is_rejected(self):
    with tempfile.NamedTemporaryFile(suffix='.txt') as asset_file:
      with self.assertRaises(ValueError):
        provenance._mime_type(asset_file.name)

  def test_optional_signing_unsupported_format_returns_failed_status(self):
    mock_c2pa = mock.MagicMock()
    mock_c2pa.C2paError = type('C2paError', (Exception,), {})
    with tempfile.NamedTemporaryFile(suffix='.txt') as asset_file:
      asset_file.write(b'asset')
      asset_file.flush()
      with mock.patch.object(provenance, 'c2pa', mock_c2pa):
        with mock.patch.dict(
            os.environ,
            {
                'CONFIG_C2PA_ENABLED': 'true',
                'CONFIG_C2PA_REQUIRED': 'false',
            },
            clear=False,
        ):
          result = provenance.apply_provenance(asset_file.name)

    self.assertEqual(result['type'], 'none')
    self.assertEqual(result['status'], 'failed')
    self.assertEqual(len(result['sha256']), 64)
    self.assertTrue(result['disclosure'])

  def test_required_signing_unsupported_format_raises_runtime_error(self):
    mock_c2pa = mock.MagicMock()
    mock_c2pa.C2paError = type('C2paError', (Exception,), {})
    with tempfile.NamedTemporaryFile(suffix='.txt') as asset_file:
      asset_file.write(b'asset')
      asset_file.flush()
      with mock.patch.object(provenance, 'c2pa', mock_c2pa):
        with mock.patch.dict(
            os.environ,
            {
                'CONFIG_C2PA_ENABLED': 'true',
                'CONFIG_C2PA_REQUIRED': 'true',
            },
            clear=False,
        ):
          with self.assertRaisesRegex(
              provenance.ProvenanceError, 'C2PA signing failed'
          ):
            provenance.apply_provenance(asset_file.name)

  def test_required_signing_rejects_unconfigured_signer(self):
    with tempfile.NamedTemporaryFile(suffix='.png') as asset_file:
      with mock.patch.dict(
          os.environ,
          {'CONFIG_C2PA_REQUIRED': 'true', 'CONFIG_C2PA_ENABLED': 'false'},
          clear=False,
      ):
        with self.assertRaisesRegex(
            provenance.ProvenanceError, 'C2PA is required'
        ):
          provenance.apply_provenance(asset_file.name)

  def test_runtime_disclosure_is_resolved_from_environment(self):
    with tempfile.NamedTemporaryFile(suffix='.png') as asset_file:
      asset_file.write(b'asset')
      asset_file.flush()
      with mock.patch.dict(
          os.environ,
          {'CONFIG_AI_DISCLOSURE': 'runtime disclosure'},
          clear=False,
      ):
        self.assertEqual(
            provenance.apply_provenance(asset_file.name)['disclosure'],
            'runtime disclosure',
        )

  def test_get_signer_missing_env_vars_raises_value_error(self):
    with mock.patch.dict(os.environ, {}, clear=False):
      os.environ.pop('CONFIG_C2PA_CERTIFICATE', None)
      os.environ.pop('CONFIG_C2PA_PRIVATE_KEY', None)
      with self.assertRaises(ValueError):
        provenance._get_signer()

  def test_create_signer_without_c2pa_raises_provenance_error(self):
    provenance.clear_cache()
    with mock.patch.object(provenance, 'c2pa', None):
      with self.assertRaisesRegex(
          provenance.ProvenanceError, 'c2pa package is not installed'
      ):
        provenance._create_signer('cert', 'key')

  def test_read_secret_failure_raises_provenance_error(self):
    mock_sm = mock.MagicMock()
    mock_client = mock.MagicMock()
    mock_sm.SecretManagerServiceClient.return_value = mock_client
    mock_client.access_secret_version.side_effect = Exception(
        'PermissionDenied'
    )

    provenance.clear_cache()
    with mock.patch.object(provenance, 'secretmanager', mock_sm):
      with self.assertRaisesRegex(
          provenance.ProvenanceError, 'Failed to read secret'
      ):
        provenance._read_secret('projects/123/secrets/cert/versions/latest')

  def test_c2pa_signing_success_returns_signed_status(self):
    mock_c2pa = mock.MagicMock()
    mock_signer = mock.MagicMock()
    mock_builder = mock.MagicMock()
    mock_c2pa.Signer.from_info.return_value = mock_signer
    mock_c2pa.Builder.from_json.return_value = mock_builder

    def fake_sign_file(src, dst, signer):
      with open(dst, 'wb') as f:
        f.write(b'signed_bytes')

    mock_builder.sign_file.side_effect = fake_sign_file

    with tempfile.NamedTemporaryFile(suffix='.mp4') as asset_file:
      asset_file.write(b'video_content')
      asset_file.flush()

      provenance.clear_cache()
      with mock.patch.object(provenance, 'c2pa', mock_c2pa):
        with mock.patch.dict(
            os.environ,
            {
                'CONFIG_C2PA_ENABLED': 'true',
                'CONFIG_C2PA_REQUIRED': 'true',
                'CONFIG_C2PA_CERTIFICATE': 'cert_data',
                'CONFIG_C2PA_PRIVATE_KEY': 'key_data',
                'CONFIG_C2PA_TSA_URL': 'https://tsa.example.com',
            },
            clear=False,
        ):
          result = provenance.apply_provenance(asset_file.name)

    self.assertEqual(result['type'], 'c2pa')
    self.assertEqual(result['status'], 'signed')
    mock_c2pa.C2paSignerInfo.assert_called_once_with(
        alg=mock_c2pa.C2paSigningAlg.ES256,
        sign_cert=b'cert_data',
        private_key=b'key_data',
        ta_url=b'https://tsa.example.com',
    )
    mock_c2pa.Builder.from_json.assert_called_once()
    manifest = json.loads(mock_c2pa.Builder.from_json.call_args[0][0])
    self.assertEqual(manifest['claim_generator'], 'ViGenAiR/v1')
    self.assertEqual(manifest['format'], 'video/mp4')
    self.assertEqual(len(manifest['assertions']), 2)

  def test_read_secret_returns_raw_bytes(self):
    mock_sm = mock.MagicMock()
    mock_client = mock.MagicMock()
    mock_sm.SecretManagerServiceClient.return_value = mock_client
    mock_response = mock.MagicMock()
    mock_response.payload.data = b'\x01\x02\x03\x04'
    mock_client.access_secret_version.return_value = mock_response

    with mock.patch.object(provenance, 'secretmanager', mock_sm):
      data = provenance._read_secret(
          'projects/123/secrets/cert/versions/latest'
      )
    self.assertEqual(data, b'\x01\x02\x03\x04')

  def test_required_signing_propagates_secret_manager_error(self):
    mock_c2pa = mock.MagicMock()
    mock_sm = mock.MagicMock()
    mock_client = mock.MagicMock()
    mock_sm.SecretManagerServiceClient.return_value = mock_client
    mock_client.access_secret_version.side_effect = RuntimeError(
        'SecretManagerUnavailable'
    )

    with tempfile.NamedTemporaryFile(suffix='.mp4') as asset_file:
      asset_file.write(b'video_content')
      asset_file.flush()

      with mock.patch.object(provenance, 'c2pa', mock_c2pa):
        with mock.patch.object(provenance, 'secretmanager', mock_sm):
          with mock.patch.dict(
              os.environ,
              {
                  'CONFIG_C2PA_ENABLED': 'true',
                  'CONFIG_C2PA_REQUIRED': 'true',
                  'CONFIG_C2PA_CERTIFICATE': (
                      'projects/123/secrets/cert/versions/latest'
                  ),
                  'CONFIG_C2PA_PRIVATE_KEY': 'key_data',
              },
              clear=False,
          ):
            with self.assertRaisesRegex(
                provenance.ProvenanceError, 'SecretManagerUnavailable'
            ):
              provenance.apply_provenance(asset_file.name)

  def test_manifest_claim_generator_uses_configured_version(self):
    mock_c2pa = mock.MagicMock()
    mock_c2pa.Builder.from_json.return_value = mock.MagicMock()
    with tempfile.NamedTemporaryFile(suffix='.mp4') as asset_file:
      asset_file.write(b'video')
      asset_file.flush()
      with mock.patch.object(provenance, 'c2pa', mock_c2pa), mock.patch.object(
          provenance, '_get_signer', return_value=mock.MagicMock()
      ), mock.patch.dict(
          os.environ,
          {
              'CONFIG_C2PA_ENABLED': 'true',
              'CONFIG_BACKEND_VERSION': 'v2.1.0',
          },
          clear=False,
      ):
        provenance.apply_provenance(asset_file.name)
    manifest = json.loads(mock_c2pa.Builder.from_json.call_args[0][0])
    self.assertEqual(manifest['claim_generator'], 'ViGenAiR/v2.1.0')


if __name__ == '__main__':
  unittest.main()
