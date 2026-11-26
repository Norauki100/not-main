// ホームに出すカテゴリ。ここを書き換えると、ホームの中身が変わります。
// mods には Modrinth のURLの最後の部分(例: modrinth.com/mod/sodium の「sodium」)を書きます。
// Modrinthに見つからなかったものは、ホームに出ないだけでエラーにはなりません。
const CATEGORIES = [
  {
    name: '軽量化・高速化',
    desc: 'FPSを上げたい、重いときの定番',
    mods: ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'modernfix']
  },
  {
    name: '見た目・シェーダー',
    desc: 'シェーダー対応や、見た目をよくするもの',
    mods: ['iris', 'continuity', 'lambdynamiclights', 'sodium-extra', 'reeses-sodium-options', 'distanthorizons']
  },
  {
    name: '便利・情報表示',
    desc: '画面に情報が増えたり、操作が楽になるもの',
    mods: ['modmenu', 'appleskin', 'jade', 'emi', 'betterf3', 'mouse-tweaks']
  },
  {
    name: 'マップ',
    desc: 'ミニマップやワールドマップ',
    mods: ['xaeros-minimap', 'xaeros-world-map', 'journeymap']
  },
  {
    name: 'マルチプレイ',
    desc: 'サーバーや友達と遊ぶとき向け',
    mods: ['simple-voice-chat', 'no-chat-reports', 'worldedit']
  },
  {
    name: 'ライブラリ',
    desc: '他のMODを動かすのに必要になることが多いもの',
    mods: ['fabric-api', 'cloth-config', 'architectury-api', 'fabric-language-kotlin']
  }
];
