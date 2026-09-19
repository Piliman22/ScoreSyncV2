import type { BackgroundItem, EffectItem, EngineItem, ParticleItem, ServerInfo, ServerItemInfo, SkinItem } from '@sonolus/core'
import { Honolus, HonolusError, type SonolusContext, type SonolusDatabase } from '@untitledsekai/honolus'
import { toLevel } from '../levels/mapper'
import { toPost } from './posts'
import { version } from '../../package.json'

export function registerRoutes(sonolus: Honolus, database: SonolusDatabase, engine: EngineItem, searchEnabled: boolean, visualItems: Partial<Record<'skin' | 'background' | 'effect' | 'particle', object>>) {
    if (searchEnabled) sonolus.search.level([{ type: 'advanced', title: '譜面検索', requireConfirmation: false, options: [{ query: 'keywords', name: '曲名・アーティスト・作者', type: 'text', required: false, shortcuts: [], def: '', placeholder: '', limit: 200 }] }])
    const levels = async (context: SonolusContext) => {
        const query = searchEnabled ? (context.query('keywords') ?? context.query('query') ?? '').toLowerCase() : ''
        const all = []
        let cursor: string | undefined
        do {
            const page = await database.repository('level').list({ page: { limit: 100, cursor } })
            all.push(...page.items)
            cursor = page.nextCursor
        } while (cursor)
        return all.filter(item => [item.title.en, item.artists.en, item.author.en].some(value => (value ?? '').toLowerCase().includes(query))).sort((a, b) => a.name.localeCompare(b.name)).map(item => toLevel(item, engine))
    }
    @sonolus.route.server.info
    class InfoHandler {
        handle(): ServerInfo { return { title: `ScoreSync ${version}`, description: 'ローカルの USC / SUS 譜面をリアルタイムに配信します。', buttons: [{ type: 'level' }, { type: 'post' }], configuration: { options: [] } } }
    }
    @sonolus.route.server.level.info
    class LevelInfoHandler {
        async handle(context: SonolusContext): Promise<ServerItemInfo> { return { title: 'Levels', sections: [{ title: 'Levels', itemType: 'level', items: (await levels(context)).slice(0, 20) }] } }
    }
    @sonolus.route.server.level.list
    class LevelListHandler {
        async handle(context: SonolusContext) {
            const items = await levels(context)
            const page = Math.max(0, Number.parseInt(context.query('page') ?? '0') || 0)
            return { pageCount: Math.ceil(items.length / 20), items: items.slice(page * 20, page * 20 + 20) }
        }
    }
    @sonolus.route.server.level.detail
    class LevelDetailHandler {
        async handle(_context: SonolusContext, name: string) {
            const item = await database.repository('level').get(name)
            if (!item) throw new HonolusError('NOT_FOUND', 'Level not found')
            return { item: toLevel(item, engine), description: item.data.hash?.startsWith('pending-') ? '変換中または変換エラーです。ログを確認し、一覧を更新してください。' : '', actions: [], hasCommunity: false, leaderboards: [], sections: [] }
        }
    }
    @sonolus.route.server.post.info
    class PostInfoHandler {
        async handle(): Promise<ServerItemInfo> { return { title: 'Posts', sections: [{ title: '使い方', itemType: 'post', items: (await database.repository('post').list()).items.map(toPost) }] } }
    }
    @sonolus.route.server.post.list
    class PostListHandler {
        async handle() { return { pageCount: 1, items: (await database.repository('post').list()).items.map(toPost) } }
    }
    @sonolus.route.server.post.detail
    class PostDetailHandler {
        async handle(_context: SonolusContext, name: string) {
            const item = await database.repository('post').get(name)
            if (!item) throw new HonolusError('NOT_FOUND', 'Post not found')
            return { item: toPost(item), description: item.description?.en ?? '', actions: [], hasCommunity: false, leaderboards: [], sections: [] }
        }
    }
    @sonolus.route.server.engine.detail
    class EngineDetailHandler {
        async handle(_context: SonolusContext, name: string) {
            if (name !== engine.name) throw new HonolusError('NOT_FOUND', 'Engine not found')
            return { item: engine, actions: [], hasCommunity: false, leaderboards: [], sections: [] }
        }
    }
    @sonolus.route.server.skin.detail
    class SkinDetailHandler {
        async handle(_context: SonolusContext, name: string) {
            const value = visualItems.skin as SkinItem | undefined
            if (!value || name !== value.name) throw new HonolusError('NOT_FOUND', 'Skin not found')
            return { item: value, actions: [], hasCommunity: false, leaderboards: [], sections: [] }
        }
    }
    @sonolus.route.server.background.detail
    class BackgroundDetailHandler {
        async handle(_context: SonolusContext, name: string) {
            const value = visualItems.background as BackgroundItem | undefined
            if (!value || name !== value.name) throw new HonolusError('NOT_FOUND', 'Background not found')
            return { item: value, actions: [], hasCommunity: false, leaderboards: [], sections: [] }
        }
    }
    @sonolus.route.server.effect.detail
    class EffectDetailHandler {
        async handle(_context: SonolusContext, name: string) {
            const value = visualItems.effect as EffectItem | undefined
            if (!value || name !== value.name) throw new HonolusError('NOT_FOUND', 'Effect not found')
            return { item: value, actions: [], hasCommunity: false, leaderboards: [], sections: [] }
        }
    }
    @sonolus.route.server.particle.detail
    class ParticleDetailHandler {
        async handle(_context: SonolusContext, name: string) {
            const value = visualItems.particle as ParticleItem | undefined
            if (!value || name !== value.name) throw new HonolusError('NOT_FOUND', 'Particle not found')
            return { item: value, actions: [], hasCommunity: false, leaderboards: [], sections: [] }
        }
    }
}
