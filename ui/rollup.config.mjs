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

import cleanup from 'rollup-plugin-cleanup';
import license from 'rollup-plugin-license';
import typescript from 'rollup-plugin-typescript2';
import { fileURLToPath } from 'url';

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'esm',
  },
  plugins: [
    cleanup({ comments: 'none', extensions: ['.ts'] }),
    license({
      banner: {
        content: {
          file: fileURLToPath(new URL('license-header.txt', import.meta.url)),
        },
      },
    }),
    typescript(),
  ],
  context: 'this',
};
