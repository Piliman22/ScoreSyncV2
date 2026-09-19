import type { DatabaseLevelItem, EngineItem, LevelItem } from '@sonolus/core'
import type { LevelSource } from './scanner'
export const srl = (hash: string) => ({ hash, url: `/sonolus/repository/${hash}` })
export function levelItem(source: LevelSource, engine: EngineItem, dataHash: string, fallbackAudio: string): DatabaseLevelItem {
    return {
        name: source.id, version: 1, title: { en: source.title }, artists: { en: source.artists }, author: { en: source.author }, rating: source.rating, tags: [],
        engine: engine.name, useSkin: { useDefault: true }, useBackground: { useDefault: true }, useEffect: { useDefault: true }, useParticle: { useDefault: true },
        cover: source.cover ? srl(source.cover.hash) : engine.thumbnail, bgm: srl(source.audio?.hash ?? fallbackAudio), data: srl(dataHash),
    }
}
export function toLevel(item: DatabaseLevelItem, engine: EngineItem): LevelItem {
    return { ...item, title: item.title.en ?? '', artists: item.artists.en ?? '', author: item.author.en ?? '', tags: [], engine,
        useSkin: { useDefault: true }, useBackground: { useDefault: true }, useEffect: { useDefault: true }, useParticle: { useDefault: true } }
}
