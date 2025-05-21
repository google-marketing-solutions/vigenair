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
import fs from 'fs-extra';
import path from 'path';

const cwd = process.cwd();
const uiDist = path.resolve(cwd, 'src/ui/dist/ui/browser');
const cloudRunTargetDir = path.resolve(cwd, '../ui-backend/public');

async function copyUiToBackend() {
  try {
    console.log(`Preparing UI for Cloud Run deployment...`);

    // 1. Ensure the Angular build output directory exists
    if (!(await fs.pathExists(uiDist))) {
      console.error(
        `Angular build output directory not found: ${uiDist}`
      );
      console.error(
        'Please ensure you have run "npm run build-ui" first.'
      );
      process.exit(1);
    }

    // 2. Clean up the target directory in ui-backend
    console.log(`Cleaning up target directory: ${cloudRunTargetDir}`);
    await fs.emptyDir(cloudRunTargetDir); // Ensures directory exists and is empty

    // 3. Copy files from Angular build output to ui-backend/public, excluding 'assets'
    console.log(
      `Copying files from ${uiDist} to ${cloudRunTargetDir}...`
    );
    await fs.copy(uiDist, cloudRunTargetDir, {
      filter: (src, dest) => {
        const relativePath = path.relative(uiDist, src);

        // Exclude the 'assets' folder and its contents
        // This checks if the path starts with 'assets' or is 'assets' itself
        if (
          relativePath === 'assets' ||
          relativePath.startsWith(`assets${path.sep}`)
        ) {
          console.log(`  Excluding: ${relativePath}`);
          return false;
        }
        // console.log(`  Including: ${relativePath}`);
        return true;
      },
    });

    console.log(
      'Successfully copied UI files to ui-backend/public for Cloud Run deployment.'
    );
  } catch (err) {
    console.error('Error during UI copy for Cloud Run:', err);
    process.exit(1);
  }
}

copyUiToBackend();