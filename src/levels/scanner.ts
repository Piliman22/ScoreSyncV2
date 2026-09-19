import { lstat, readdir } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'
import { parse } from 'smol-toml'
import { hash, missing, readRegularFile } from '../utils/path'

export interface SourceAsset { path: string; hash: string }
export interface LevelSource {
    id: string; directory: string; chart: string; chartHash: string; revision: string
    title: string; artists: string; author: string; rating: number
    audio?: SourceAsset; cover?: SourceAsset
}
export async function scanLevel(root: string, directory: string): Promise<LevelSource[]> {
    let files: string[]
    try {
        if (!(await lstat(directory)).isDirectory()) return []
        files = (await readdir(directory, { withFileTypes: true })).filter(x => x.isFile()).map(x => x.name).sort()
    } catch (error) { if (missing(error)) return []; throw error }
    const charts = files.filter(x => /\.(usc|sus)$/i.test(x))
    if (!charts.length) return []
    let config: Record<string, unknown> = {}
    if (files.includes('config.toml')) config = parse((await readRegularFile(join(directory, 'config.toml'))).toString())
    else if (files.includes('config.json')) config = JSON.parse((await readRegularFile(join(directory, 'config.json'))).toString())
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Level config must be an object')
    for (const key of ['title', 'artists', 'author']) if (config[key] !== undefined && typeof config[key] !== 'string') throw new Error(`${key} must be a string`)
    if (config.rating !== undefined && (typeof config.rating !== 'number' || !Number.isFinite(config.rating) || config.rating < 0)) throw new Error('rating must be a nonnegative number')
    const asset = async (chart: string, pattern: RegExp, preferred: string): Promise<SourceAsset | undefined> => {
        const candidates = files.filter(x => pattern.test(x))
        const stem = (x: string) => basename(x, extname(x)).toLowerCase()
        const file = candidates.find(x => stem(x) === stem(chart)) ?? candidates.find(x => stem(x) === preferred) ?? candidates[0]
        if (!file) return undefined
        const path = join(directory, file)
        return { path, hash: hash(await readRegularFile(path)) }
    }
    return Promise.all(charts.map(async chart => {
        const path = join(directory, chart)
        const source = {
            id: hash(relative(root, path).split('\\').join('/')), directory, chart: path,
            chartHash: hash(await readRegularFile(path)),
            title: (config.title as string | undefined) ?? (charts.length === 1 ? basename(directory) : `${basename(directory)} / ${basename(chart, extname(chart))}`),
            artists: (config.artists as string | undefined) ?? '', author: (config.author as string | undefined) ?? '', rating: (config.rating as number | undefined) ?? 0,
            audio: await asset(chart, /\.(mp3|ogg|wav|flac|m4a)$/i, 'music'),
            cover: await asset(chart, /\.(png|jpe?g|webp)$/i, 'cover'),
        }
        return { ...source, revision: hash(JSON.stringify(source)) }
    }))
}
