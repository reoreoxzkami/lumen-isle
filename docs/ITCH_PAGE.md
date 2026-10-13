# itch.io 公開ガイド

## 1. ビルドとアップロード
1. `npm run build` を実行 → `dist/index.html` (単一ファイル、全アセット内蔵) が生成される
2. `dist/` 内の `index.html` (と任意で `cover.png`) を **ZIP** に圧縮
   - ZIP のルート直下に `index.html` が来ること
3. itch.io → Create new project
   - **Kind of project**: HTML
   - アップロードした ZIP に **"This file will be played in the browser"** をチェック
   - **Viewport dimensions**: 1280 × 720 (または 1920 × 1080)
   - **Fullscreen button** を有効化 / **Mobile friendly** はオフ
   - **Automatically start on page load** はオフ推奨 (音声再生にクリックが必要なため)
4. 有料販売: Pricing → **Paid** → 価格設定 (推奨 $4.99 / ¥680〜¥980)。Minimum price + "pay what you want" も可
   - ブラウザ版を販売する場合、購入者のみ再生可能にするには "Restricted" か "Draft+Paid" 設定を使用
   - デモ版を無料で公開 (ビルド時に灯台2基で終了する設定を追加するなど) し、製品版を有料にする運用が効果的
5. カバー画像 (630×500 推奨) は `public/cover.png` を使用。スクリーンショットはゲーム内フォトモード (P → C) で撮影

## 2. ストアページ文面 (日本語)

**タイトル**: LUMEN ISLE — 灯火の旅人
**ひとこと**: ローポリの島で、消えた五つの灯台に光を還す。戦わない、急がない、ただ旅をする。

### 説明文
目覚めると、そこは色と音が眠った小さな島。手にあるのは古いランタンだけ。

**LUMEN ISLE** は、ローポリ美術で描かれた静かなオープンワールド探索ゲームです。
光の欠片を集めて五つの灯台を灯し、山頂の尖塔を目覚めさせましょう。

#### 特徴
- 🏝 **600m 四方の手続き生成の島** — 草原・桜の森・砂漠・雪嶺・湖・海岸
- 🪂 **滑空と上昇気流** — 灯台の光柱に乗って空高く舞い上がる
- 🌅 **昼夜と天候** — 夕焼け、満天の星、雨と雷、そして全灯台を灯した夜に現れるオーロラ
- 🦌 **生き物たち** — 鹿、うさぎ、鳥の群れ、蛍
- 📜 **10 個の記憶の石** — 島の物語を拾い集める
- 🗺 **地図とファストトラベル**、📷 **フォトモード** (PNG 保存)
- 🎧 **手続き生成 BGM** — 時間と天気で変化する音楽と環境音
- 🌐 日本語 / English 対応、オートセーブ

プレイ時間: クリアまで約 1〜2 時間 (全収集 2〜3 時間)

#### 操作
WASD 移動 / マウス視点 / Shift ダッシュ / Space ジャンプ・空中でもう一度押して滑空 / E 調べる / M 地図 / P フォトモード / Esc ポーズ

#### 動作環境
WebGL 2 対応の最新ブラウザ (Chrome / Edge / Firefox)、キーボード + マウス。GPU 搭載 PC 推奨。重い場合は設定で画質を下げてください。

## 3. Store page copy (English)

**LUMEN ISLE — Wanderer of the Last Light**
*A quiet low-poly open-world journey. No combat. No hurry. Just light.*

You wake on a hushed island where color and sound have fallen asleep, holding nothing but an old lantern.
Collect Light Shards, rekindle the five Beacons, and awaken the Spire at the summit.

**Features**
- A hand-tuned procedural island: meadows, cherry groves, forests, desert, frozen peaks, lakes and shores
- Glide on the updrafts of rekindled Beacons
- Day/night cycle, sunsets, starry skies, rain & thunder, and an aurora once the isle is awake
- Deer, rabbits, birds and fireflies
- 10 Memory Stones telling the story of the isle
- Map with fast travel, photo mode with PNG export
- Procedural soundtrack that changes with time and weather
- English & Japanese, autosave

**Playtime**: ~1–2 hours to finish, 2–3 hours for everything.
**Controls**: WASD move · Mouse look · Shift sprint · Space jump / press again in air to glide · E interact · M map · P photo mode · Esc pause

## 4. タグ案
`low-poly`, `open-world`, `exploration`, `relaxing`, `cozy`, `singleplayer`, `3d`, `atmospheric`, `walking-simulator`, `nature`, `gliding`, `japanese`

## 5. リリース前チェックリスト
- [ ] Chrome / Firefox / Edge でフルスクリーン動作確認
- [ ] 画質「低」で 30fps 以上出るか確認
- [ ] 新規 → 全灯台 → エンディング → 続きから、の通しプレイ
- [ ] セーブ削除後の新規開始
- [ ] 画面キャプチャ 5〜8 枚 (昼 / 夕焼け / 夜 / 雨 / 雪嶺 / 灯台の光柱 / オーロラ) と 30 秒 GIF
- [ ] 価格・レーティング・コメント設定

## 6. ロードマップ (販売後)
v1.1 ゲームパッド / v1.2 追加灯台と空島 / v1.3 写真図鑑 / v2.0 デスクトップ版
