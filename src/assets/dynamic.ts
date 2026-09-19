import type { SonolusAssetStore } from '@untitledsekai/honolus'
import { hash, readRegularFile } from '../utils/path'

/** Honolus owns the repository route; this store supplies the original bytes. */
export class DynamicAssets implements SonolusAssetStore {
    private readonly entries = new Map<string, Map<string, Uint8Array | string>>()
    async has(key: string) { return this.entries.has(key) }
    async put(key: string, bytes: Uint8Array) { this.add('static', key, bytes) }
    add(owner: string, key: string, value: Uint8Array | string) {
        const entry = this.entries.get(key)
        if (entry) entry.set(owner, value)
        else this.entries.set(key, new Map([[owner, value]]))
    }
    remove(owner: string) {
        for (const [key, entry] of this.entries) {
            entry.delete(owner)
            if (!entry.size) this.entries.delete(key)
        }
    }
    async open(key: string): Promise<ReadableStream<Uint8Array>> {
        const entry = this.entries.get(key)
        if (!entry) throw new Error('Asset not found')
        for (const value of entry.values()) {
            try {
                const bytes = typeof value === 'string' ? await readRegularFile(value) : value
                if (hash(bytes) !== key) continue
                return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close() } })
            } catch { /* Another level may still own identical bytes. */ }
        }
        throw new Error('Asset changed; refresh the level list')
    }
}
