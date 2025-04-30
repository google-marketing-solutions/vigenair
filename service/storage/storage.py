# Copyright 2024 Google LLC.
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

"""Vigenair storage service.

This module provides methods for interacting with Google Cloud Storage.
"""

import logging
import os
import pathlib
from typing import Optional, Sequence, Union

import utils as Utils
from google.cloud import storage
from google.cloud.storage import transfer_manager


def download_gcs_file(
    file_path: Utils.TriggerFile,
    bucket_name: str,
    output_dir: Optional[str] = None,
    fetch_contents: bool = False,
) -> Union[Optional[str], Optional[bytes]]:
  """Downloads a file from the given GCS bucket and returns its path.

  Args:
    file_path: The path of the file to download.
    bucket_name: The name of the bucket to retrieve the file from.
    output_dir: Directory path to store the downloaded file in.
    fetch_contents: Whether to fetch the file contents instead of writing to a
      file.

  Returns:
    The retrieved file path or contents based on `fetch_contents`, or None if
    the file was not found.
  """
  storage_client = storage.Client()
  bucket = storage_client.bucket(bucket_name)

  blob = bucket.blob(file_path.full_gcs_path)
  result = None

  if not blob.exists():
    logging.warning(
        'DOWNLOAD - Could not find file "%s" in bucket "%s".',
        file_path.full_gcs_path,
        bucket_name,
    )
  else:
    if fetch_contents:
      result = blob.download_as_bytes()
    else:
      destination_file_name = str(
          pathlib.Path(output_dir, file_path.file_name_ext)
      )
      blob.download_to_filename(destination_file_name)
      result = destination_file_name

    logging.info(
        'DOWNLOAD - Fetched file "%s" from bucket "%s".',
        file_path.full_gcs_path,
        bucket_name,
    )
  return result


def upload_gcs_file(
    file_path: str,
    destination_file_name: str,
    bucket_name: str,
    overwrite: bool = False,
) -> None:
  """Uploads a file to the given GCS bucket.

  Args:
    file_path: The path of the file to upload.
    destination_file_name: The name of the file to upload as.
    bucket_name: The name of the bucket to upload the file to.
  """
  storage_client = storage.Client()
  bucket = storage_client.bucket(bucket_name)

  blob = bucket.blob(destination_file_name)
  blob.upload_from_filename(
      file_path, if_generation_match=None if overwrite else 0
  )

  logging.info('UPLOAD - Uploaded path "%s".', destination_file_name)


def upload_gcs_dir(
    source_directory: str,
    bucket_name: storage.Bucket,
    target_dir: str,
) -> None:
  """Uploads all files in a directory to a GCS bucket.

  Args:
    source_directory: The directory to upload.
    bucket_name: The name of the bucket to upload to.
    target_dir: The directory within the bucket to upload to.
  """
  storage_client = storage.Client()
  bucket = storage_client.bucket(bucket_name)

  directory_path = pathlib.Path(source_directory)
  paths = directory_path.rglob('*')

  file_paths = [path for path in paths if path.is_file()]
  relative_paths = [path.relative_to(source_directory) for path in file_paths]
  string_paths = [str(path) for path in relative_paths]

  results = transfer_manager.upload_many_from_filenames(
      bucket,
      string_paths,
      source_directory=source_directory,
      blob_name_prefix=f'{target_dir}/',
      skip_if_exists=True,
  )
  for file_path, result in zip(string_paths, results):
    if isinstance(result, Exception) and result.code and result.code != 412:
      logging.warning(
          'UPLOAD - Failed to upload path "%s" due to exception: %r.',
          file_path,
          result,
      )
    elif result is None:
      logging.info('UPLOAD - Uploaded path "%s".', file_path)


def filter_video_files(
    prefix: str,
    bucket_name: str,
    first_only: bool = False,
) -> Sequence[str]:
  """Filters video files in a GCS bucket based on a prefix.

  Args:
    prefix: The prefix to filter files by.
    bucket_name: The name of the bucket to list files from.
    first_only: Whether to only return the first matching file.

  Returns:
    A list of video files matching the given prefix, or an empty list if no
    files match.
  """
  storage_client = storage.Client()
  blobs = storage_client.list_blobs(bucket_name, prefix=prefix)
  result = []

  for blob in blobs:
    logging.info('FILTER - Found blob with name "%s".', blob.name)
    _, file_ext = os.path.splitext(blob.name)
    file_ext = file_ext[1:]

    if file_ext and Utils.VideoExtension.has_value(file_ext):
      logging.info('FILTER - Found video file "%s".', blob.name)
      result.append(blob.name)
      if first_only:
        break
  return result


def filter_files(
    bucket_name: str,
    prefix: str,
    suffix: str,
    fetch_content=False,
    download=False,
    download_dir=None,
) -> Sequence[Union[bytes, str]]:
  """Filters files in a GCS bucket based on a suffix.

  Args:
    bucket_name: The name of the bucket to list files from.
    prefix: The prefix to filter files by.
    suffix: The suffix to filter files by.
    fetch_content: Optional boolean whether to return file names or their
      content. Defaults to False (names only).
    download: Optional boolean whether to store the content of the file locally.
      Defaults to False.
    download_dir: Optional download directory. Defaults to None.

  Returns:
    A list of file contents matching the given suffix, or an empty list if no
    files match.
  """
  storage_client = storage.Client()
  blobs = storage_client.list_blobs(bucket_name, prefix=prefix)
  result = []

  for blob in blobs:
    if blob.name.endswith(suffix):
      logging.info('FILTER - Found matching file "%s".', blob.name)
      if download:
        file_path, file_ext = os.path.splitext(blob.name)
        file_path = pathlib.Path(file_path)
        file_name = file_path.name
        destination_file_name = str(
            pathlib.Path(download_dir, f'{file_name}{file_ext}')
        )
        blob.download_to_filename(destination_file_name)
        result.append(destination_file_name)
      else:
        result.append(blob.download_as_bytes() if fetch_content else blob.name)
  return result


def delete_gcs_file(
    file_path: Utils.TriggerFile,
    bucket_name: str,
):
  """Deletes a file from the given GCS bucket.

  Args:
    file_path: The path of the file to download.
    bucket_name: The name of the bucket to retrieve the file from.
  """
  storage_client = storage.Client()
  bucket = storage_client.bucket(bucket_name)

  blob = bucket.blob(file_path.full_gcs_path)

  if not blob.exists():
    logging.warning(
        'DELETE - Could not find file "%s" in bucket "%s".',
        file_path.full_gcs_path,
        bucket_name,
    )
  else:
    blob.delete()
    logging.info(
        'DELETE - Deleted file "%s" from bucket "%s".',
        file_path.full_gcs_path,
        bucket_name,
    )


def download_gcs_dir(
    bucket_name: str,
    dir_path: str,
    output_dir: str,
) -> int:
  """Downloads all files in a directory from a GCS bucket.

  Args:
    bucket_name: The name of the bucket to download from.
    dir_path: The directory to download.
    output_dir: The directory to download to.

  Returns:
    The number of files downloaded.
  """
  storage_client = storage.Client()
  prefix = f'{dir_path}/'
  blobs = storage_client.list_blobs(bucket_name, prefix=prefix)
  count_files = 0

  for blob in blobs:
    if blob.name == prefix:
      continue
    filename = blob.name.replace(prefix, '')
    blob.download_to_filename(str(pathlib.Path(output_dir, filename)))
    count_files += 1

  logging.info(
      'DOWNLOAD - Fetched "%d" files from bucket "%s" and folder "%s" '
      'into path "%s".',
      count_files,
      bucket_name,
      dir_path,
      output_dir,
  )
  return count_files
