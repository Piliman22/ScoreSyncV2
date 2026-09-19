import chokidar from 'chokidar'
import { join, relative, resolve, sep } from 'node:path'
import type { LevelManager } from '../levels/reconcile'

export async function startWatcher(manager: LevelManager, delay: number) {
    const timers = new Map<string, NodeJS.Timeout>()
    const watcher = chokidar.watch(manager.root, { ignoreInitial: true, followSymlinks: false, depth: 1 })
    let closed = false
    watcher.on('all', (_event, path) => {
        if (closed) return
        const rel = relative(manager.root, resolve(path))
        if (rel.startsWith(`..${sep}`)) return
        const directory = rel ? join(manager.root, rel.split(sep)[0]!) : manager.root
        clearTimeout(timers.get(directory))
        timers.set(directory, setTimeout(() => {
            timers.delete(directory)
            void (directory === manager.root ? manager.scanAll() : manager.reconcileLevel(directory)).catch(console.error)
        }, delay))
    })
    await new Promise<void>((resolve, reject) => { watcher.once('ready', resolve); watcher.once('error', reject) })
    watcher.on('error', error => console.error('[WATCH]', error))
    // Rescan after subscription to cover changes between startup scan and ready.
    await manager.scanAll()
    return { async close() {
        closed = true
        for (const timer of timers.values()) clearTimeout(timer)
        await watcher.close()
        await manager.settled()
    } }
}
