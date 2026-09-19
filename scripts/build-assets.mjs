import { existsSync } from 'node:fs'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { zipSync } from 'fflate'
import { staticPath } from '@sonolus/free-pack'

const revision = '80e5c0297cd88f566dec287ef8397e7d9b96c5db'
const root = resolve(import.meta.dirname, '..')
const engineRoot = join(root, '_reference/sonolus-pjsekai-engine-extended')
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
if (!existsSync(engineRoot)) {
    run('git', ['clone', 'https://github.com/Untitled-Sekai/sonolus-pjsekai-engine-extended.git', engineRoot])
    run('git', ['checkout', '--detach', revision], engineRoot)
}
const current = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: engineRoot, encoding: 'utf8' }).trim()
if (current !== revision) throw new Error(`Engine checkout must be ${revision}; found ${current}`)
const resources = ['EngineConfiguration', 'EnginePlayData', 'EnginePreviewData', 'EngineTutorialData', 'EngineWatchData']
if (resources.some(name => !existsSync(join(engineRoot, 'dist', name)))) {
    // The upstream ranges allow incompatible later 9.x releases; match its lockfile.
    run('npm', ['install', '--ignore-scripts', '--save-exact', '@sonolus/sonolus.js@9.5.6', '@sonolus/core@7.13.3'], engineRoot)
    run('npm', ['run', 'build'], engineRoot)
}
const files = {}
async function collect(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) await collect(path, `${prefix}${entry.name}/`)
        else files[`${prefix}${entry.name}`] = await readFile(path)
    }
}
// Include only asset categories, so SCP middleware cannot shadow dynamic info/list routes.
for (const category of ['repository', 'skins', 'backgrounds', 'effects', 'particles']) {
    await collect(join(staticPath, 'sonolus', category), `sonolus/${category}/`)
}
const item = category => JSON.parse(files[`sonolus/${category}/list`].toString()).items[0]
const resource = async name => {
    const bytes = await readFile(join(engineRoot, 'dist', name))
    const hash = createHash('sha1').update(bytes).digest('hex')
    files[`sonolus/repository/${hash}`] = bytes
    return { hash, url: `/sonolus/repository/${hash}` }
}
const engine = {
    name: 'pjsekai', version: 13, title: 'ScoreSync', subtitle: 'ScoreSync', author: 'Burrito + Nanashi.', tags: [],
    skin: item('skins'), background: item('backgrounds'), effect: item('effects'), particle: item('particles'),
    thumbnail: item('skins').thumbnail,
    configuration: await resource('EngineConfiguration'), playData: await resource('EnginePlayData'),
    previewData: await resource('EnginePreviewData'), tutorialData: await resource('EngineTutorialData'), watchData: await resource('EngineWatchData'),
}
files['sonolus/engines/pjsekai'] = Buffer.from(JSON.stringify({ item: engine, description: `Extended engine ${revision}`, actions: [], hasCommunity: false, leaderboards: [], sections: [] }))
files['sonolus/engines/list'] = Buffer.from(JSON.stringify({ pageCount: 1, items: [engine] }))
files['sonolus/engines/info'] = Buffer.from(JSON.stringify({ title: 'Engines', sections: [{ title: 'Engines', itemType: 'engine', items: [engine] }] }))
await mkdir(join(root, 'assets'), { recursive: true })
await writeFile(join(root, 'assets/FreePack.scp'), zipSync(files, { level: 0 }))
console.log(`Built assets/FreePack.scp from engine ${revision}`)
