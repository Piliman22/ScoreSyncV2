import { mkdir, copyFile, cp, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { exec } from '@yao-pkg/pkg'
const platform = process.env.SCORESYNC_TARGET_PLATFORM ?? process.platform
if (!['linux', 'win32', 'darwin'].includes(platform)) throw new Error(`Unsupported platform: ${platform}`)
const target = `node22-${{ win32: 'win', darwin: 'macos', linux: 'linux' }[platform]}-${process.arch}`
const outputPlatform = platform === 'win32' ? 'windows' : platform
const output = resolve('release', `${outputPlatform}-${process.arch}`)
await mkdir(join(output, 'assets'), { recursive: true })
await mkdir(join(output, 'levels'), { recursive: true })
await mkdir(join(output, 'licenses'), { recursive: true })
await exec(['dist/index.cjs', '--target', target, '--output', join(output, platform === 'win32' ? 'scoresync.exe' : 'scoresync')])
await copyFile('config.toml', join(output, 'config.toml'))
await copyFile('assets/FreePack.scp', join(output, 'assets/FreePack.scp'))
await copyFile('README.md', join(output, 'README.md'))
await copyFile('THIRD_PARTY_NOTICES.md', join(output, 'THIRD_PARTY_NOTICES.md'))
await cp('vendor/pjsekai', join(output, 'licenses/pjsekai'), { recursive: true })
// Preserve the license texts shipped in npm packages, including bundled dependencies.
async function licenses(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) await licenses(path, `${prefix}${entry.name}-`)
        else if (/^(license|copying|notice)(\.|$)/i.test(entry.name)) await copyFile(path, join(output, 'licenses', `${prefix}${entry.name}`))
    }
}
await licenses('node_modules')
await cp('vendor/free-pack-LICENSE.txt', join(output, 'licenses/free-pack-LICENSE.txt'))
console.log(`Created ${output}`)
