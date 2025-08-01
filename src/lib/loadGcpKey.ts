import { writeFileSync } from 'fs';
import { join } from 'path';

if (process.env.GOOGLE_APPLICATION_CREDENTIALS_B64) {
  const path = join('/tmp', 'gcp-key.json');
  writeFileSync(path, Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS_B64, 'base64'));
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path;
}