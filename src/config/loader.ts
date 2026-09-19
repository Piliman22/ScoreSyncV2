import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parse } from 'smol-toml'

export interface Config {
    server: { host: string; port: number; sonolus_version: string }
    paths: { levels: string; scp: string }
    watch: { enabled: boolean; debounce_ms: number }
    search: { enabled: boolean }
}

export async function loadConfig(filename: string): Promise<Config> {
    const data = parse(await readFile(filename, 'utf8')) as Record<string, unknown>
    const section = (key: string): Record<string, unknown> => {
        const value = data[key] ?? {}
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${key} must be a table`)
        return value as Record<string, unknown>
    }
    const string = (table: string, key: string, fallback: string) => {
        const value = section(table)[key] ?? fallback
        if (typeof value !== 'string' || !value.trim()) throw new Error(`${table}.${key} must be a nonempty string`)
        return value
    }
    const integer = (table: string, key: string, fallback: number, min: number, max: number) => {
        const value = section(table)[key] ?? fallback
        if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`${table}.${key} must be an integer in ${min}..${max}`)
        return value
    }
    const boolean = (table: string, key: string) => {
        const value = section(table)[key] ?? true
        if (typeof value !== 'boolean') throw new Error(`${table}.${key} must be a boolean`)
        return value
    }
    const version = string('server', 'sonolus_version', '1.1.4')
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('server.sonolus_version must have the form x.y.z')
    return {
        server: { host: string('server', 'host', '0.0.0.0'), port: integer('server', 'port', 3939, 1, 65535), sonolus_version: version },
        paths: { levels: resolve(dirname(filename), string('paths', 'levels', './levels')), scp: resolve(dirname(filename), string('paths', 'scp', './assets/FreePack.scp')) },
        watch: { enabled: boolean('watch', 'enabled'), debounce_ms: integer('watch', 'debounce_ms', 200, 0, 60000) },
        search: { enabled: boolean('search', 'enabled') },
    }
}
