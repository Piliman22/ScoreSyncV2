# ScoreSync Next

USC / SUS譜面を、そのままSonolusサーバーとして公開するローカルアプリケーションです。Honolusを使ってSonolusのルートを登録し、譜面変換結果はファイルへ保存せずメモリから配信します。

## 基本的な使い方

1. 配布パッケージを展開します。
2. `levels` の中に曲フォルダを作成します。
3. 曲フォルダに `.usc` または `.sus`、必要なら音源・画像を置きます。
4. `scoresync`（Windowsは `scoresync.exe`）を起動します。
5. Sonolusから表示されたサーバーURLを開きます。

例：

```text
ScoreSync/
├─ scoresync.exe
├─ config.toml
├─ assets/FreePack.scp
└─ levels/
   └─ Tell Your World/
      ├─ expert.usc
      ├─ music.mp3
      ├─ cover.png
      └─ config.toml
```

`levels` の追加・変更・削除は、監視が有効なら再起動せず反映されます。SCPの差し替えなどサーバー設定を変更した場合は再起動してください。

## config.toml

```toml
[server]
sonolus_version = "1.1.4"
host = "0.0.0.0"
port = 3939

[paths]
levels = "./levels"
scp = "./assets/FreePack.scp"

[watch]
enabled = true
debounce_ms = 200

[search]
enabled = true
```

相対パスは `config.toml` のあるディレクトリを基準に解決します。別の設定ファイルを使う場合は次のように起動します。

```sh
./scoresync --config /path/to/config.toml
```

`scp` には任意のSCPを指定できます。skin / background / effect / particleを含むSCPなら、そのSCPのアイテムを優先してエンジンへ取り込みます。pjsekaiエンジンがない場合は、同じ `assets` ディレクトリの `FreePack.scp` からエンジンを補完します。

## Levelの設定

曲フォルダの `config.toml` は任意です。

```toml
title = "Tell Your World"
artists = "livetune feat. Hatsune Miku"
author = "Your name"
rating = 30
```

音源・画像は譜面名との完全一致を優先し、次に `music.*` / `cover.*`、最後に名前順で選択します。対応形式は音源がmp3 / ogg / wav / flac / m4a、画像がpng / jpg / jpeg / webpです。

## 開発者向けビルド

Node.js 22.12以上で実行します。

```sh
npm ci
npm run check
npm run assets
npm run package
```

`npm run package` は現在のOS向けの単体バイナリを `release/` に作成します。LinuxとWindowsのバイナリはGitHub Actionsでも生成できます。タグ `v*` をpushするか、Actionsの `Build ScoreSync binaries` を手動実行してください。

## 終了とログ

`Ctrl+C` またはSIGTERMで監視を停止し、実行中の変換ジョブが終了してから終了します。変換に失敗した譜面は他の譜面に影響せず、ファイルを修正すると再変換されます。
