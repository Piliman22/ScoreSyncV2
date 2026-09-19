import { mkdir, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createSonolusDatabase, Honolus, MemoryJobQueue, ScpArchive, scpStaticMiddleware } from '@untitledsekai/honolus'
import type { EngineItem } from '@sonolus/core'
import type { Config } from '../config/loader'
import { DynamicAssets } from '../assets/dynamic'
import { LevelManager } from '../levels/reconcile'
import { startWatcher } from '../watcher/watcher'
import { hash } from '../utils/path'
import { usagePost } from './posts'
import { registerRoutes } from './routes'

export async function createApplication(config: Config) {
    console.log(`[INFO] Loading SCP: ${config.paths.scp}`)
    const archive = ScpArchive.fromFile(config.paths.scp)
    let engineArchive = archive
    let engineBytes = archive.read('sonolus/engines/pjsekai')
    // User packs are allowed to contain only skins/particles/etc. Keep serving
    // that pack, while supplying the converter's engine from the bundled pack.
    if (!engineBytes) {
        const fallbackPath = join(dirname(config.paths.scp), 'FreePack.scp')
        try {
            await access(fallbackPath)
            engineArchive = ScpArchive.fromFile(fallbackPath)
            engineBytes = engineArchive.read('sonolus/engines/pjsekai')
            if (engineBytes) console.log(`[INFO] SCP has no pjsekai engine; using bundled engine from ${fallbackPath}`)
        } catch { /* The configured pack may itself be the only available pack. */ }
    }
    if (!engineBytes) throw new Error('SCP does not contain pjsekai engine and bundled assets/FreePack.scp is unavailable')
    const engine = JSON.parse(Buffer.from(engineBytes).toString()).item as EngineItem
    if (!engine?.playData?.hash) throw new Error('SCP contains an invalid pjsekai engine')
    // A pack may omit the engine but still provide its own visual assets. Use
    // the first item from each category in that pack for the pjsekai engine.
    // SCP is a ZIP archive, and Honolus exposes its entries through ScpArchive.
    const categoryFields = {
        skins: 'skin', backgrounds: 'background', effects: 'effect', particles: 'particle',
    } as const
    const selectedVisualItems: Partial<Record<'skin' | 'background' | 'effect' | 'particle', object>> = {}
    for (const [category, field] of Object.entries(categoryFields) as Array<[keyof typeof categoryFields, (typeof categoryFields)[keyof typeof categoryFields]]>) {
        const listBytes = archive.read(`sonolus/${category}/list`)
        if (!listBytes) continue
        try {
            const list = JSON.parse(Buffer.from(listBytes).toString()) as { items?: unknown[] }
            const selected = list.items?.[0]
            if (selected && typeof selected === 'object') {
                ;(engine as unknown as Record<string, unknown>)[field] = selected
                selectedVisualItems[field] = selected
                console.log(`[INFO] Using ${category} item from selected SCP`)
            }
        } catch (error) {
            console.warn(`[WARN] Could not read ${category}/list from selected SCP: ${String(error)}`)
        }
    }
    const database = createSonolusDatabase({ driver: 'memory' })
    const queue = new MemoryJobQueue()
    const assets = new DynamicAssets()
    // Dynamic repository requests for the fallback engine must work even when
    // the user-selected SCP does not contain those repository entries.
    const importRepositoryAssets = async (source: ScpArchive, value: unknown): Promise<void> => {
        if (!value || typeof value !== 'object') return
        if ('hash' in value && typeof value.hash === 'string') {
            const bytes = source.read(`sonolus/repository/${value.hash}`)
            if (bytes) await assets.put(value.hash, bytes)
        }
        for (const child of Object.values(value)) await importRepositoryAssets(source, child)
    }
    await importRepositoryAssets(engineArchive, engine)
    if (engineArchive !== archive) await importRepositoryAssets(archive, engine)
    // A short silent WAV for metadata-only charts; no generated files at runtime.
    const silent = Buffer.alloc(46)
    silent.write('RIFF'); silent.writeUInt32LE(38, 4); silent.write('WAVEfmt ', 8)
    silent.writeUInt32LE(16, 16); silent.writeUInt16LE(1, 20); silent.writeUInt16LE(1, 22)
    silent.writeUInt32LE(8000, 24); silent.writeUInt32LE(16000, 28); silent.writeUInt16LE(2, 32); silent.writeUInt16LE(16, 34)
    silent.write('data', 36); silent.writeUInt32LE(2, 40)
    await assets.put(hash(silent), silent)
    // Register the pack middleware after ScoreSync's dynamic routes. Honolus's
    // static pack handler otherwise answers /levels/* and /posts/* first when
    // the selected SCP happens to contain those collections.
    const sonolus = new Honolus({ database, databaseRoutes: false, assets, jobQueue: queue,
        version: config.server.sonolus_version })
    const manager = new LevelManager(config.paths.levels, database, assets, queue, engine, hash(silent))
    let watcher: Awaited<ReturnType<typeof startWatcher>> | undefined
    try {
        await database.repository('post').put(usagePost())
        registerRoutes(sonolus, database, engine, config.search.enabled, selectedVisualItems)
        sonolus.getApp().use('/sonolus/*', scpStaticMiddleware(archive, '/sonolus'))
        await sonolus.ready()
        await mkdir(config.paths.levels, { recursive: true })
        console.log(`[INFO] Scanning ${config.paths.levels}`)
        await manager.scanAll()
        if (config.watch.enabled) {
            watcher = await startWatcher(manager, config.watch.debounce_ms)
            console.log(`[INFO] Watching ${config.paths.levels}`)
        }
    } catch (error) { await watcher?.close(); await sonolus.close(); throw error }
    return { sonolus, manager, database, assets, async close() { await watcher?.close(); await manager.settled(); await sonolus.close() } }
}
