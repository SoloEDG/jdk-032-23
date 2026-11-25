import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

export const path = resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..')
