import type { DatabasePostItem, PostItem } from '@sonolus/core'
export const usageDescription = [
    'ScoreSync の使い方', '',
    '1. levels の中に曲ごとのフォルダを作成します。',
    '2. USC / SUS譜面と音源（music.mp3 など）、画像（cover.png など）を入れます。',
    '3. 「Levels」を開いて譜面を選択します。変換中は少し待って一覧を更新してください。',
    '譜面の保存やフォルダの追加・削除は、監視が有効なら再起動せず反映されます。', '',
    '曲フォルダの config.toml で title / artists / author / rating を指定できます。',
    '検索は曲名・アーティスト・譜面作者に対応しています。',
    'サーバーの config.toml を変更した場合は再起動してください。',
].join('\n')
export const usagePost = (): DatabasePostItem => ({ name: 'scoresync-usage', version: 1, title: { en: 'ScoreSync の使い方' }, author: { en: 'ScoreSync' }, time: Math.floor(Date.now() / 1000), tags: [], description: { en: usageDescription } })
export const toPost = (item: DatabasePostItem): PostItem => ({ ...item, title: item.title.en ?? '', author: item.author.en ?? '', tags: [] })
