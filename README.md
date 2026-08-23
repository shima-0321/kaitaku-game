# 開拓GAME

遠隔地の友達数人（3〜4人）とブラウザだけで遊べる、島の開拓・交易をテーマにしたリアルタイム対戦Webアプリです。アカウント登録は不要で、ルームコードを共有するだけで参加できます。

## 構成

npm workspaces によるモノレポ構成です。

```
packages/
  shared/  ゲームルール・盤面ロジック（型定義、盤面生成、合法手判定など）
  server/  Node.js + Express + Socket.io。ゲーム状態を一元管理するサーバー
  client/  React + Vite。SVGで描画する盤面とゲーム画面
```

サーバーが唯一の正規状態を保持する**サーバー権威型**の設計です。クライアントは操作を送り、状態を受け取って描画するだけで、全ての妥当性検証はサーバー側で行われます。

## 開発

```bash
npm install
npm run dev
```

- client: http://localhost:5173 （Vite dev server、`/socket.io` を server へプロキシ）
- server: http://localhost:3001

Windows でダブルクリック起動したい場合は `scripts/start-dev.bat` を使えます。

## テスト

```bash
npm run test
```

`shared` と `server` のゲームロジックを Vitest で検証しています（盤面トポロジー、距離ルール、最長交易路・最大騎士力判定、交易比率、強盗フロー、発展カード、勝利判定など）。

## 本番ビルド・起動

```bash
npm run build   # shared → server → client の順にビルド
npm run start   # server が client/dist を配信しつつ Socket.io も待ち受ける
```

`NODE_ENV=production` の場合、server が `client/dist` を静的配信し、Socket.io も同一オリジンで待ち受けるため CORS 設定は不要です。

## デプロイ（Render.com）

リポジトリ直下の `render.yaml` を Render の Blueprint として使えます。

- Build Command: `npm install && npm run build`
- Start Command: `npm run start`
- Health Check Path: `/healthz`
- 環境変数: `NODE_ENV=production`（`PORT` は Render が自動設定）

無料プランは無通信が続くとスリープします（次回アクセス時に数十秒のコールドスタートが発生し、進行中のゲーム状態もメモリ管理のため失われます）。

Render の無料枠は「月750時間まで」で、31日ある月に常時起動し続けるとほぼ使い切ってしまうため、**外部監視サービスなどで常時起動を維持するのは避けてください**。実際に友達と遊ぶのは週に数回・数時間程度のはずなので、スリープはそのまま許容し、対策は次の一言のルールだけで十分です。

- **遊ぶ前に、誰か一人が先にURLを開いてサーバーを起こしておく**（数十秒待てば通常通り使える）

## 遊び方の導線

1. トップページで名前を入力し「ルームを作成」
2. 発行されたルームコード（またはURL）を友達に共有
3. 3〜4人揃ったらホストが「ゲーム開始」
4. スネークドラフト順で初期の開拓地・道路を配置
5. 通常ターン: サイコロを振る → 交易・建設・発展カード購入/使用 → 手番を終了

対応ルールは基本セット（3〜4人）のみです。都市＆騎士版などの拡張ルールは対象外です。
