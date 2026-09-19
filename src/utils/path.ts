import { lstat, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
export const hash = (data: Uint8Array | string) => createHash('sha1').update(data).digest('hex')
export const missing = (error: unknown) => ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')
export async function readRegularFile(path: string): Promise<Buffer> {
    if (!(await lstat(path)).isFile()) throw new Error(`Not a regular file: ${path}`)
    return readFile(path)
}
