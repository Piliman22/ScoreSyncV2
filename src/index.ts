import { dirname, resolve } from 'node:path'
import { networkInterfaces } from 'node:os'
import { serve } from '@hono/node-server'
import { loadConfig } from './config/loader'
import { createApplication } from './server/app'
import { version } from '../package.json'

async function main() {
    const args = process.argv.slice(2)
    if (args.includes('--help')) { console.log('ScoreSync [--config /path/to/config.toml] [--version] [--help]'); return }
    if (args.includes('--version')) { console.log(version); return }
    if (args.length && (args.length !== 2 || args[0] !== '--config')) throw new Error('Usage: ScoreSync [--config /path/to/config.toml]')
    const base = 'pkg' in process ? dirname(process.execPath) : resolve(__dirname, '..')
    const filename = args[1] ? resolve(args[1]) : resolve(base, 'config.toml')
    console.log(`[INFO] ScoreSync ${version}\n[INFO] Loading ${filename}`)
    const config = await loadConfig(filename)
    const application = await createApplication(config)
    // getApp is only used to connect Honolus to the Node HTTP adapter.
    const server = serve({ fetch: application.sonolus.getApp().fetch, hostname: config.server.host, port: config.server.port }, () => {
        console.log(`[INFO] Server started at ${config.server.host}:${config.server.port}`)
        const hosts = ['0.0.0.0', '::'].includes(config.server.host)
            ? Object.values(networkInterfaces()).flatMap(entries => entries ?? []).filter(x => x.family === 'IPv4' && !x.internal).map(x => x.address)
            : [config.server.host]
        for (const host of hosts.length ? hosts : ['127.0.0.1']) console.log(`https://open.sonolus.com/${host.includes(':') ? `[${host}]` : host}:${config.server.port}/`)
    })
    let closing = false
    async function close() {
        if (closing) return
        closing = true
        server.close()
        await application.close()
    }
    server.on('error', error => { console.error(error); process.exitCode = 1; void close() })
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void close().catch(error => { console.error(error); process.exitCode = 1 }) })
}
void main().catch(error => { console.error(`[ERROR] ${error}`); process.exitCode = 1 })
