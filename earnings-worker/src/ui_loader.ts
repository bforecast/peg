import { readFileSync } from 'fs';
import { join } from 'path';

export function getUIHTML(): string {
    return readFileSync(join(__dirname, 'ui.html'), 'utf-8');
}
