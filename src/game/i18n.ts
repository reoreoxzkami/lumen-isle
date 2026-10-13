import type { Lang } from "./state";

const S: Record<string, [string, string]> = {
  "title.sub": ["灯火の旅人", "Wanderer of the Last Light"],
  "title.tag": ["ローポリの島を旅する、静かなオープンワールド", "A quiet low-poly open-world journey"],
  "menu.continue": ["つづきから", "Continue"],
  "menu.new": ["はじめから", "New Journey"],
  "menu.newConfirm": ["セーブデータを消して最初から始めますか?", "Erase your save and start over?"],
  "menu.yes": ["はい", "Yes"],
  "menu.no": ["いいえ", "No"],
  "menu.settings": ["設定", "Settings"],
  "menu.howto": ["あそびかた", "How to Play"],
  "menu.credits": ["クレジット", "Credits"],
  "menu.back": ["戻る", "Back"],
  "menu.resume": ["再開", "Resume"],
  "menu.title": ["タイトルへ戻る", "Back to Title"],
  "menu.paused": ["ポーズ", "Paused"],
  "menu.fullscreen": ["フルスクリーン", "Fullscreen"],
  "menu.hintStart": ["クリックで開始", "Click to begin"],
  "menu.loading": ["島を編んでいます…", "Weaving the island…"],

  "set.lang": ["言語 / Language", "Language / 言語"],
  "set.master": ["全体音量", "Master Volume"],
  "set.music": ["音楽", "Music"],
  "set.sfx": ["効果音", "Effects"],
  "set.sens": ["視点感度", "Look Sensitivity"],
  "set.invert": ["視点上下反転", "Invert Look Y"],
  "set.quality": ["画質", "Graphics"],
  "q.high": ["高 (影・ブルーム)", "High (shadows + bloom)"],
  "q.medium": ["中 (影)", "Medium (shadows)"],
  "q.low": ["低 (軽量)", "Low (fast)"],

  "how.title": ["あそびかた", "How to Play"],
  "how.story": [
    "島を照らしていた五つの灯台が消え、色と音が眠りについた。あなたは古びたランタンを手に、静寂の草原で目を覚ます。光の欠片を集め、灯台を灯し、山頂の尖塔を目覚めさせよう。戦いも制限時間もない。好きな場所へ、好きなペースで。",
    "The five Beacons that lit this island have gone dark, and color and sound have fallen asleep. You wake in a hushed meadow with an old lantern. Gather Light Shards, rekindle the Beacons and awaken the Spire at the summit. No combat, no timers — go anywhere, at your own pace.",
  ],
  "key.move": ["移動", "Move"],
  "key.look": ["視点", "Look"],
  "key.sprint": ["ダッシュ", "Sprint"],
  "key.jump": ["ジャンプ / 空中で滑空", "Jump / Glide in air"],
  "key.interact": ["調べる・灯す", "Interact"],
  "key.map": ["地図 (灯った灯台へ移動可)", "Map (fast travel to lit beacons)"],
  "key.photo": ["フォトモード / 撮影(C)", "Photo mode / Capture (C)"],
  "key.zoom": ["カメラ距離", "Camera Distance"],
  "key.pause": ["ポーズ", "Pause"],
  "how.tip": [
    "灯台の光の柱は上昇気流を生み、滑空で空高く昇れる。",
    "Beacon light columns create updrafts — glide upward on them.",
  ],

  "credits.title": ["クレジット", "Credits"],
  "credits.body": [
    "企画・設計・プログラム・サウンド・アート\nLUMEN ISLE 制作チーム\n\n使用技術: three.js / React / Web Audio API\nすべての映像と音は手続き生成です。\n\n遊んでくれて、ありがとう。",
    "Game Design · Programming · Sound · Art\nThe LUMEN ISLE Team\n\nBuilt with three.js / React / Web Audio API\nEvery visual and sound is procedurally generated.\n\nThank you for playing.",
  ],

  "hud.shards": ["光の欠片", "Light Shards"],
  "hud.beacons": ["灯台", "Beacons"],
  "hud.stones": ["記憶の石", "Memory Stones"],
  "hud.stamina": ["スタミナ", "Stamina"],
  "mode.swim": ["泳ぎ", "Swimming"],
  "mode.glide": ["滑空", "Gliding"],

  "obj.main": ["5つの灯台を灯そう ({0}/{1})", "Rekindle the five Beacons ({0}/{1})"],
  "obj.cost": ["次の灯台に必要な欠片: {0} (所持 {1})", "Next Beacon costs {0} shards (you have {1})"],
  "obj.spire": ["山頂の尖塔へ向かおう", "Climb to the Spire at the summit"],
  "obj.free": ["自由に島を旅しよう", "Wander the island freely"],

  "p.beacon.ok": ["灯台を灯す (欠片 {0})", "Light the Beacon ({0} shards)"],
  "p.beacon.no": ["欠片が足りない ({1}/{0})", "Not enough shards ({1}/{0})"],
  "p.beacon.lit": ["灯火は静かに燃えている", "The flame burns quietly"],
  "p.stone": ["記憶の石を読む", "Read the Memory Stone"],
  "p.stone.read": ["記憶の石を読み返す", "Read again"],
  "p.camp": ["焚き火で休む", "Rest by the fire"],
  "p.spire.ok": ["尖塔に触れる", "Touch the Spire"],
  "p.spire.no": ["尖塔はまだ眠っている…灯台を全て灯そう", "The Spire still sleeps… light all Beacons"],
  "p.spire.done": ["尖塔に触れる (エンディング)", "Touch the Spire (ending)"],
  "key.e": ["E", "E"],

  "t.shard": ["光の欠片 +1", "Light Shard +1"],
  "t.beacon": ["{0} が灯った", "{0} is lit"],
  "t.stone": ["記憶の石 {0}/{1}", "Memory Stone {0}/{1}"],
  "t.spire": ["尖塔が目覚めた — 山頂へ", "The Spire awakens — go to the summit"],
  "t.sea": ["海は果てしない。島へ戻ろう", "The sea is endless. Turn back to the isle"],
  "t.saved": ["セーブしました", "Game saved"],
  "t.photo": ["スクリーンショットを保存", "Screenshot saved"],
  "t.travel": ["灯台へ移動", "Traveling to the Beacon"],
  "t.rain": ["雨が降ってきた", "Rain begins to fall"],
  "t.rainstop": ["雨が上がった", "The rain has passed"],
  "t.stam": ["最大スタミナが増えた", "Max stamina increased"],

  "hint.move": ["WASDで移動 / マウスで視点", "WASD to move / Mouse to look"],
  "hint.jump": ["SPACEでジャンプ", "SPACE to jump"],
  "hint.glide": ["空中でもう一度SPACE: 滑空", "Press SPACE again in the air to glide"],
  "hint.sprint": ["SHIFTでダッシュ", "Hold SHIFT to sprint"],
  "hint.shard": ["青く光る欠片を集めよう", "Collect the glowing blue shards"],
  "hint.map": ["Mで地図を開く", "Press M to open the map"],
  "hint.updraft": ["灯台の光柱で滑空すると上昇できる", "Glide inside a Beacon's light to rise"],

  "map.title": ["島の地図", "Island Map"],
  "map.hint": ["灯った灯台をクリックで移動 / Mで閉じる", "Click a lit Beacon to travel / M to close"],
  "map.you": ["あなた", "You"],

  "b.0": ["暁の灯台", "Dawn Beacon"],
  "b.1": ["翠の灯台", "Verdant Beacon"],
  "b.2": ["陽炎の灯台", "Mirage Beacon"],
  "b.3": ["潮の灯台", "Tide Beacon"],
  "b.4": ["雪嶺の灯台", "Frostpeak Beacon"],
  "spire": ["光の尖塔", "Spire of Light"],

  "biome.meadow": ["草原", "Meadow"],
  "biome.forest": ["森", "Forest"],
  "biome.desert": ["砂漠", "Desert"],
  "biome.snow": ["雪嶺", "Frostpeak"],
  "biome.beach": ["海岸", "Shore"],
  "biome.rock": ["岩場", "Highlands"],
  "biome.sea": ["海", "Sea"],

  "lore.close": ["閉じる", "Close"],
  "lore.0.t": ["序 — 眠る島", "Prologue — The Sleeping Isle"],
  "lore.0.b": [
    "この島は、かつて光の中で眠っていた。五つの灯台は島の脈、尖塔はその心臓。\n光が絶えた日、色は薄れ、鳥たちは歌を忘れた。",
    "This isle once slept inside the light. Five Beacons were its pulse, the Spire its heart.\nThe day the light failed, colors thinned and the birds forgot their songs.",
  ],
  "lore.1.t": ["灯守の手記 一", "Keeper's Journal I"],
  "lore.1.b": [
    "欠片は星の涙だという。夜ごと空から落ち、朝には大地に溶ける。\nだが私は知っている。欠片は、誰かに拾われるのを待っているのだと。",
    "They say the shards are tears of stars, falling each night and melting into the earth by morning.\nBut I know better: they wait to be found.",
  ],
  "lore.2.t": ["灯守の手記 二", "Keeper's Journal II"],
  "lore.2.b": [
    "森の灯台は、根を通して島中に光を送っていた。\n木々が夜に淡く光って見えたのは、そのせいだ。",
    "The forest Beacon sent light through the roots to the whole isle.\nThat is why the trees seemed to glow faintly at night.",
  ],
  "lore.3.t": ["砂の歌", "Song of the Sand"],
  "lore.3.b": [
    "砂は海の記憶。風が吹くたび、古い波の音をそっと繰り返す。\n耳をすませば、遠い潮騒が聞こえるだろう。",
    "Sand is the sea's memory. With each wind it repeats the sound of old waves.\nListen closely and you may hear the distant tide.",
  ],
  "lore.4.t": ["旅人への言伝", "A Message for Travelers"],
  "lore.4.b": [
    "急ぐ必要はない。灯台はいつでもそこにある。\n丘の上で夕焼けを眺めるのも、立派な旅の一部だ。",
    "There is no hurry. The Beacons will always be there.\nWatching the sunset from a hilltop is part of the journey too.",
  ],
  "lore.5.t": ["灯守の手記 三", "Keeper's Journal III"],
  "lore.5.b": [
    "灯台の光に包まれると、風が味方になる。\n翼を広げ、光の柱に身をゆだねよ。空は思ったより近い。",
    "Inside a Beacon's light, the wind becomes your friend.\nSpread your cloak and trust the column. The sky is closer than you think.",
  ],
  "lore.6.t": ["湖の伝承", "Legend of the Lake"],
  "lore.6.b": [
    "湖は空の鏡。夜、水面に星が映ると、\n欠片はそれを仲間と思い、そっと近づいてくる。",
    "The lake is the sky's mirror. When stars drift across its surface at night,\nthe shards mistake them for kin and drift closer.",
  ],
  "lore.7.t": ["雪嶺にて", "On the Frostpeak"],
  "lore.7.b": [
    "山は静けさの番人。ここでは音さえ雪に吸い込まれる。\nだから尖塔の鼓動は、島のどこよりもよく聞こえる。",
    "The mountain keeps the silence. Even sound sinks into the snow here,\nso the Spire's heartbeat is heard clearest of all.",
  ],
  "lore.8.t": ["灯守の手記 終", "Keeper's Journal — Last"],
  "lore.8.b": [
    "もし五つ全てが灯ったなら、尖塔は目覚める。\nその光は空に帯を描き、夜を祝うだろう。どうか、私の代わりに見届けて。",
    "If all five are lit, the Spire will wake.\nIts light will paint ribbons across the sky and celebrate the night. Please witness it for me.",
  ],
  "lore.9.t": ["名もなき石", "The Nameless Stone"],
  "lore.9.b": [
    "ここまで来てくれたあなたへ。\nあなたの足跡こそが、この島で最も新しい光だ。",
    "To you, who came this far:\nyour footprints are the newest light on this isle.",
  ],

  "end.title": ["光が、還ってきた", "The Light Returns"],
  "end.body": [
    "尖塔が脈打ち、五つの灯台が応えた。空に光の帯が広がり、鳥たちは歌を思い出す。\n島は目を覚ました。旅人よ、ありがとう。",
    "The Spire pulses and the five Beacons answer. Ribbons of light unfurl across the sky, and the birds remember their songs.\nThe isle is awake. Thank you, Wanderer.",
  ],
  "end.time": ["プレイ時間", "Play time"],
  "end.shards": ["光の欠片", "Light Shards"],
  "end.stones": ["記憶の石", "Memory Stones"],
  "end.continue": ["島を旅し続ける", "Keep Wandering"],
  "end.title2": ["タイトルへ", "To Title"],
};

export function tr(lang: Lang, key: string, ...args: (string | number)[]): string {
  const e = S[key];
  if (!e) return key;
  let s = e[lang === "ja" ? 0 : 1];
  args.forEach((a, i) => {
    s = s.split(`{${i}}`).join(String(a));
  });
  return s;
}
