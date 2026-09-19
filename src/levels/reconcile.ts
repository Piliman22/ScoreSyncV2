import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { EngineItem } from '@sonolus/core'
import { MemoryJobQueue, type SonolusDatabase } from '@untitledsekai/honolus'
import { DynamicAssets } from '../assets/dynamic'
import { compileChart } from '../charts/compiler'
import { hash, missing, readRegularFile } from '../utils/path'
import { levelItem } from './mapper'
import { scanLevel, type LevelSource } from './scanner'

export interface ChartEntry { source: LevelSource; generation: number; state: 'pending' | 'ready' | 'error'; data?: Uint8Array; error?: string; job?: string }
export class LevelManager {
    readonly entries = new Map<string, ChartEntry>()
    private generation = 0
    private tail: Promise<void> = Promise.resolve()
    constructor(readonly root: string, readonly database: SonolusDatabase, readonly assets: DynamicAssets,
        readonly queue: MemoryJobQueue, readonly engine: EngineItem, readonly fallbackAudio: string,
        compiler = compileChart) {
        queue.register<{ id: string; generation: number }, void>('chart.compile', async ({ id, generation }) => {
            const entry = this.entries.get(id)
            if (!entry || entry.generation !== generation) return
            const start = Date.now()
            try {
                console.log(`[COMPILE] ${entry.source.chart}`)
                const bytes = await readRegularFile(entry.source.chart)
                if (hash(bytes) !== entry.source.chartHash) throw new Error('Chart changed while compiling; waiting for rescan')
                const data = await compiler(bytes)
                if (this.entries.get(id) !== entry) return
                const key = hash(data)
                this.assets.add(id, key, data)
                await this.database.repository('level').put(levelItem(entry.source, engine, key, fallbackAudio))
                entry.data = data
                entry.state = 'ready'
                console.log(`[DONE] ${entry.source.title} (${Date.now() - start}ms)`)
            } catch (error) {
                if (this.entries.get(id) !== entry) return
                entry.state = 'error'
                entry.error = String(error)
                console.error(`[ERROR] ${entry.source.chart}: ${error}`)
            }
        })
    }
    reconcileLevel(directory: string): Promise<void> {
        const operation = this.tail.then(() => this.reconcile(directory))
        this.tail = operation.catch(error => { console.error(`[ERROR] ${directory}: ${error}`) })
        return this.tail
    }
    private async reconcile(directory: string) {
        let sources: LevelSource[]
        try { sources = await scanLevel(this.root, directory) }
        catch (error) {
            // Invalid metadata must not prevent other directories from being reconciled.
            for (const [id, entry] of this.entries) if (entry.source.directory === directory) await this.remove(id)
            throw error
        }
        const ids = new Set(sources.map(x => x.id))
        for (const [id, entry] of this.entries) if (entry.source.directory === directory && !ids.has(id)) await this.remove(id)
        for (const source of sources) {
            const previous = this.entries.get(source.id)
            if (previous?.source.revision === source.revision) continue
            if (previous?.job) await this.queue.cancel(previous.job)
            this.assets.remove(source.id)
            const entry: ChartEntry = { source, generation: ++this.generation, state: 'pending' }
            this.entries.set(source.id, entry)
            for (const asset of [source.audio, source.cover]) if (asset) this.assets.add(source.id, asset.hash, asset.path)
            console.log(`[${previous ? 'UPDATE' : 'ADD'}] ${source.title}`)
            if (previous?.state === 'ready' && previous.source.chartHash === source.chartHash && previous.data) {
                entry.data = previous.data
                entry.state = 'ready'
                this.assets.add(source.id, hash(entry.data), entry.data)
            }
            await this.database.repository('level').put(levelItem(source, this.engine, entry.data ? hash(entry.data) : `pending-${source.id}-${entry.generation}`, this.fallbackAudio))
            if (!entry.data) entry.job = (await this.queue.enqueue('chart.compile', { id: source.id, generation: entry.generation }, { idempotencyKey: `${source.id}:${entry.generation}`, maxAttempts: 1 })).id
        }
    }
    private async remove(id: string) {
        const entry = this.entries.get(id)
        this.entries.delete(id)
        if (entry?.job) await this.queue.cancel(entry.job)
        this.assets.remove(id)
        await this.database.repository('level').delete(id)
        console.log(`[REMOVE] ${entry?.source.title}`)
    }
    async scanAll() {
        let directories: string[] = []
        try { directories = (await readdir(this.root, { withFileTypes: true })).filter(x => x.isDirectory()).map(x => join(this.root, x.name)) }
        catch (error) { if (!missing(error)) throw error }
        const known = [...this.entries.values()].map(x => x.source.directory)
        for (const directory of new Set([...directories, ...known])) await this.reconcileLevel(directory)
    }
    async settled() { await this.tail }
}
