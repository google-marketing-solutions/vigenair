#!/bin/bash
# Copyright 2024 Google LLC.
#
# Licensed under the MIT License;
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.mit.edu/~amini/LICENSE.md
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Update runtime environment variables without having to fully redeploy the cloud function.
gcloud functions deploy vigenair \
--update-env-vars CONFIG_WHISPER_MODEL=large,CONFIG_TEXT_MODEL=gemini-pro
