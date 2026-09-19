import { gzip } from 'node:zlib'
import { promisify } from 'node:util'
import { anyToUSC, migrateVUSC } from 'usctool'
import { uscToLevelData } from '../../vendor/pjsekai/convert.cjs'
const compress = promisify(gzip)
export async function compileChart(bytes: Uint8Array): Promise<Uint8Array> {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim()
    // anyToUSC silently falls back to SUS on malformed JSON. Reject broken USC
    // explicitly so a partially saved chart cannot replace a valid chart with silence.
    if (!text.startsWith('{') && !/^\s*#[A-Za-z0-9]+/m.test(text)) throw new Error('Expected a USC JSON document or SUS directives')
    const chart = text.startsWith('{') ? migrateVUSC(JSON.parse(text)) : anyToUSC(bytes).usc
    if (!chart || !Array.isArray(chart.objects) || !Number.isFinite(chart.offset)) throw new Error('Invalid USC structure')
    return compress(Buffer.from(JSON.stringify(uscToLevelData(chart))))
}
