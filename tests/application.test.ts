import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, rename, readdir, readFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { createApplication } from '../src/server/app'
import { loadConfig, type Config } from '../src/config/loader'
import { compileChart } from '../src/charts/compiler'
import { scanLevel } from '../src/levels/scanner'
import { hash } from '../src/utils/path'

const usc = (bpm = 120) => JSON.stringify({ version: 2, usc: { offset: 0, objects: [{ type: 'bpm', beat: 0, bpm }, { type: 'timeScaleGroup', changes: [{ beat: 0, timeScale: 1 }] }, { type: 'single', beat: 1, lane: 0, size: 1, critical: false, timeScaleGroup: 0 }] } })
async function until(predicate: () => boolean | Promise<boolean>) {
    const deadline = Date.now() + 10000
    while (!await predicate()) { if (Date.now() > deadline) throw new Error('Timed out'); await new Promise(r => setTimeout(r, 25)) }
}
async function fixture(watch = false) {
    const root = await mkdtemp(join(tmpdir(), 'scoresync-test-'))
    const config: Config = { server: { host: '127.0.0.1', port: 3939, sonolus_version: '1.2.3' }, paths: { levels: join(root, 'levels'), scp: resolve('assets/FreePack.scp') }, watch: { enabled: watch, debounce_ms: 30 }, search: { enabled: true } }
    await mkdir(config.paths.levels)
    const app = await createApplication(config)
    return { root, config, ...app, async cleanup() { await app.close(); await rm(root, { recursive: true, force: true }) } }
}

test('config paths are relative to TOML and malformed settings fail', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scoresync-config-'))
    try {
        const path = join(root, 'config.toml')
        await writeFile(path, '[paths]\nlevels="charts"\n[server]\nport=4321\nsonolus_version="1.2.3"')
        const config = await loadConfig(path)
        assert.equal(config.paths.levels, join(root, 'charts')); assert.equal(config.server.port, 4321)
        await writeFile(path, '[server]\nport=-1'); await assert.rejects(loadConfig(path), /port/)
        await writeFile(path, '[watch]\nenabled="yes"'); await assert.rejects(loadConfig(path), /boolean/)
    } finally { await rm(root, { recursive: true, force: true }) }
})

test('USC and SUS compile to gzip LevelData through the fork converter', async () => {
    for (const text of [usc(), '#TITLE "Test"\n#BPM01:120\n#00002:4\n#00008:01\n#00112:11']) {
        const data = JSON.parse(gunzipSync(await compileChart(Buffer.from(text))).toString())
        assert.ok(data.entities.length > 0)
        assert.ok(data.entities.some((x: { archetype: string }) => x.archetype.includes('Note')))
    }
    await assert.rejects(compileChart(Buffer.from('{broken')))
})

test('decorated routes expose usage Post, search all pages, original assets and gzip data', async () => {
    const f = await fixture()
    try {
        const request = (path: string) => f.sonolus.getApp().request(path)
        const posts = await request('/sonolus/posts/info')
        assert.equal(posts.headers.get('Sonolus-Version'), '1.2.3')
        assert.equal((await posts.json()).sections[0].items[0].name, 'scoresync-usage')
        const detail = await (await request('/sonolus/posts/scoresync-usage')).json()
        assert.match(detail.description, /levels/)
        assert.equal((await request('/sonolus/posts/missing')).status, 404)
        assert.equal((await request('/health/ready')).status, 200)
        const directory = join(f.config.paths.levels, 'Song')
        await mkdir(directory)
        await writeFile(join(directory, 'chart.usc'), usc())
        await writeFile(join(directory, 'music.mp3'), 'audio')
        await writeFile(join(directory, 'cover.png'), 'cover')
        await writeFile(join(directory, 'config.toml'), 'title="Test"\nartists="Artist"\nauthor="Mapper"\nrating=30')
        await f.manager.reconcileLevel(directory)
        await until(() => [...f.manager.entries.values()].every(x => x.state === 'ready'))
        const list = await (await request('/sonolus/levels/list?keywords=ARTIST')).json()
        assert.equal(list.items.length, 1)
        const item = list.items[0]
        const data = new Uint8Array(await (await request(item.data.url)).arrayBuffer())
        assert.equal(hash(data), item.data.hash)
        assert.ok(JSON.parse(gunzipSync(data).toString()).entities.length)
        assert.equal(await (await request(item.bgm.url)).text(), 'audio')
        const engineData = new Uint8Array(await (await request(item.engine.playData.url)).arrayBuffer())
        assert.equal(hash(engineData), item.engine.playData.hash)
        assert.ok(gunzipSync(engineData).length > 100)
        const original = (await f.database.repository('level').get(item.name))!
        for (let i = 0; i < 125; i++) await f.database.repository('level').put({ ...original, name: `extra-${String(i).padStart(3, '0')}`, author: { en: i === 124 ? 'LastAuthor' : 'Other' } })
        assert.equal((await (await request('/sonolus/levels/list?keywords=lastauthor')).json()).items.length, 1)
        const page = await (await request('/sonolus/levels/list?page=1')).json()
        assert.equal(page.pageCount, 7); assert.equal(page.items.length, 20)
        await writeFile(join(directory, 'music.mp3'), 'changed')
        assert.equal((await request(item.bgm.url)).status, 404)
        await f.manager.reconcileLevel(directory)
        const updated = await (await request(`/sonolus/levels/${item.name}`)).json()
        assert.notEqual(updated.item.bgm.hash, item.bgm.hash)
        assert.equal(updated.item.data.hash, item.data.hash)
        assert.deepEqual((await readdir(directory)).sort(), ['chart.usc', 'config.toml', 'cover.png', 'music.mp3'])
    } finally { await f.cleanup() }
})

test('root watcher discovers, updates, recovers, renames and removes levels', async () => {
    const f = await fixture(true)
    try {
        const directory = join(f.config.paths.levels, 'New Song')
        await mkdir(directory); await writeFile(join(directory, 'chart.usc'), usc())
        await until(() => [...f.manager.entries.values()][0]?.state === 'ready')
        const first = [...f.manager.entries.values()][0]!
        await writeFile(join(directory, 'chart.usc'), '{broken')
        await until(() => [...f.manager.entries.values()][0]?.state === 'error')
        await writeFile(join(directory, 'chart.usc'), usc(180))
        await until(() => [...f.manager.entries.values()][0]?.state === 'ready')
        assert.notEqual(hash([...f.manager.entries.values()][0]!.data!), hash(first.data!))
        const renamed = join(f.config.paths.levels, 'Renamed')
        await rename(directory, renamed)
        await until(() => f.manager.entries.size === 1 && [...f.manager.entries.values()][0]?.source.directory === renamed && [...f.manager.entries.values()][0]?.state === 'ready')
        assert.notEqual([...f.manager.entries.keys()][0], first.source.id)
        await rm(renamed, { recursive: true })
        await until(() => f.manager.entries.size === 0)
        assert.equal(await f.database.repository('level').count(), 0)
        assert.equal(await f.assets.has(hash(first.data!)), false)
    } finally { await f.cleanup() }
})

test('scanner supports multiple charts, TOML precedence, stable IDs and skips symlinks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scoresync-scan-'))
    try {
        const dir = join(root, 'Song'); await mkdir(dir)
        await writeFile(join(dir, 'a.usc'), usc()); await writeFile(join(dir, 'b.sus'), '#BPM01:120')
        await writeFile(join(dir, 'config.json'), '{"title":"Legacy"}')
        assert.equal((await scanLevel(root, dir))[0]?.title, 'Legacy')
        await writeFile(join(dir, 'config.toml'), 'title="Modern"')
        const sources = await scanLevel(root, dir)
        assert.equal(sources.length, 2); assert.notEqual(sources[0]?.id, sources[1]?.id)
        assert.equal(sources[0]?.title, 'Modern')
        await symlink(join(dir, 'a.usc'), join(dir, 'linked.usc'))
        assert.equal((await scanLevel(root, dir)).length, 2)
        await symlink(dir, join(root, 'linked'))
        assert.deepEqual(await scanLevel(root, join(root, 'linked')), [])
    } finally { await rm(root, { recursive: true, force: true }) }
})
