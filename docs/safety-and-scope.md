# 安全設計とスコープ

このドキュメントは、本プロジェクトが**読み取り専用(READ-ONLY)**であることの設計原則と、それを裏付ける具体的なコード上の根拠をまとめたものです。技術的なデータフローの詳細は [`architecture.md`](architecture.md)、機能一覧は [`README.md`](../README.md) を参照してください。

## 目的と設計原則

本プロジェクトは**教育・研究・ポートフォリオ用途**の衛星ミッション運用ダッシュボードです。設計上の大原則は「実データの読み取り」と「衛星制御」を構造的に分離することにあります。

- 実衛星(SONATE-2, NORAD 59112)に関するコードパスは、CelesTrakとSatNOGSという公開データソースから情報を取得して表示するだけです。
- コマンド操作を試したい場合は、実衛星・実地上局から完全に隔離された仮想衛星シミュレータ(SIMULATEDモード)でのみ行えます。
- LIVE_READ_ONLY / REPLAYモードのコマンドコンソールは「訓練用リハーサルログ」を記録するだけで、どこにも送信しません。

これらは「今は実装していないだけ」ではなく、**意図的に実装しておらず、今後も実装しない**という方針です。

## 禁止事項の明文化

以下の4項目はいずれも、対応するコードパスがアプリケーション内に存在しないことをもって担保されています。

### 1. Uplink(衛星への信号送信)なし

LIVE_READ_ONLY / REPLAYのコマンドコンソール(`RehearsalConsole.tsx`)は `MissionStore.createRehearsal()` → `createCommandRehearsal()`(`src/domain/commandRehearsal.ts`)のみを呼び出します。

- `createCommandRehearsal()` は入力値から `CommandRehearsal` オブジェクトを組み立てて返すだけの**純粋関数**で、`fetch` / `XMLHttpRequest` / `WebSocket` 等への参照を一切含みません。
- 返り値の型 `CommandRehearsal.transmitted` は TypeScript上 **リテラル型 `false`** として宣言されています(`src/domain/types.ts`)。

  ```typescript
  export interface CommandRehearsal {
    // ...
    transmitted: false; // このアプリは実衛星へコマンドを送信しない
    note: string;
  }
  ```

  `true` を代入しようとすればコンパイルエラーになるため、「送信済みとして扱われる」状態自体が型システム上作れません。
- この不変条件は `tests/rehearsal.test.ts` によって、フェイクの `fetch` を注入した状態でリハーサルコマンドを作成し、`fetch` が一度も呼ばれないことを検証するテストで担保されています。

### 2. RF送信なし

送信機・変調器・アンテナ制御へのソフトウェアインターフェースはコードベース中に存在しません。SIMULATEDモードのアンテナ制御(`AntennaPanel`, `SkyDial`)は、あくまで仮想衛星シミュレータ内の仮想ステーションのオブジェクトを操作するUIであり、実際のRF機材とは一切接続されていません(下記「仮想アップリンクの隔離」参照)。

### 3. 実衛星制御なし

姿勢制御・電源制御・モード切替など、実際の衛星バスやペイロードを操作するコードパスはありません。`SatelliteMode`(`NOMINAL` / `SAFE` / `UNKNOWN`)という型は存在しますが、これは仮想衛星シミュレータ内でのみ意味を持つ状態であり、実衛星に対してこの値を書き込む経路はありません。

### 4. 地上局の遠隔操作なし

`StationVisibilityPanel`(LIVE_READ_ONLY / REPLAYで使用)は、コンポーネント冒頭のコメントに明記されている通り「DISPLAY ONLY — there is no antenna control of any kind in these modes」であり、UI上にも "PASSIVE TRACKING DISPLAY — NO ANTENNA CONTROL / NO RF TRANSMISSION" というバナーが常時表示されます。実際に回転台・受信機などのハードウェアを制御するAPI呼び出しは存在しません。地上局データ(`GroundStation`)はブラウザの `localStorage` に保存されるユーザー入力の緯度・経度・最小仰角にすぎず、外部のいかなるサービスにも送信されません(`src/store/groundStations.ts`)。

### 仮想アップリンクの隔離(SIMULATEDモード)

SIMULATEDモードの `CommandPanel` は `Simulator.sendCommand()`(`src/services/simulator/Simulator.ts`)を呼びますが、これは以下の理由で実衛星とは無関係です。

- コメントに明記: 「Send a command to the VIRTUAL satellite. Only exists in SIMULATED mode — the mock ACK below is a setTimeout, not a network call.」
- 実装は `setTimeout` によって一定時間後にコマンドのステータス(`SUCCESS`/`FAILED`)をインメモリで更新するだけで、`fetch` などのネットワークAPIは一切呼ばれません。
- アンテナ自動追尾・地上局とのリンク判定(`inLink`)も、すべてシミュレータ内の仮想座標同士の幾何計算(`greatCircleKm` 等)で完結しています。

## APIトークンの扱い

SatNOGS DBのAPIトークン(`SATNOGS_API_TOKEN`)は以下の設計でサーバー側にのみ閉じ込められています。

- 環境変数はBFF(`server/`)プロセスにのみ読み込まれ(`server/config.ts`)、クライアントバンドルには一切含まれません。
- トークンが実際に使われるのはSatNOGS DBへのリクエストヘッダ(`Authorization: Token ...`, `server/clients/satnogs.ts`)のみです。
- `GET /api/health` はトークンの**有無を示す真偽値** `satnogsTokenConfigured` のみを返し、値そのものは決して返しません(`server/app.ts`)。
- 上流APIエラー時のメッセージ(`server/routes/satnogs.ts`)はステータスコードベースで組み立てられ、リクエストヘッダの内容を含みません。
- トークン未設定時、`/api/satnogs/telemetry/:noradId` は上流に問い合わせることすらせず即座に `TOKEN_MISSING` を返します。アプリ自体はトークンなしでも起動・動作します(軌道データとSatNOGS Networkの公開観測はトークン不要)。
- これらは `tests/server.satnogs.test.ts` において、トークンがレスポンスボディ・エラーメッセージのいずれにも含まれないことをアサートするテストで検証されています。

## 実データとシミュレーションデータの混同防止

実データ(CelesTrak/SatNOGS)、シミュレーションデータ(仮想衛星)、リプレイデータ(記録済み)は、UI上で常に明確に区別されます。

- **`isSimulated` フラグ** — すべての `DataProvenance` に含まれ、SIMULATEDモードのデータは常に `true`。
- **鮮度チップ(`FreshnessChip`)** — `LIVE` / `DELAYED` / `STALE` / `UNAVAILABLE` / `SIMULATED` / `REPLAY` の6状態を色分け表示し、モードやデータの実測時刻からの経過を常に可視化します。
- **モードバナー** — `TopBar.tsx` はLIVE_READ_ONLYモードで赤色の "READ-ONLY LIVE DATA · NO UPLINK / NO RF TRANSMISSION / NO SPACECRAFT CONTROL" を、REPLAYモードで "REPLAY OF RECORDED DATA — NOT LIVE" を常時表示します。フッター(`App.tsx`)にも全モード共通で "READ-ONLY MISSION DASHBOARD · ... · NO UPLINK · NO RF TRANSMISSION · NO SPACECRAFT CONTROL" が表示されます。
- **モード切替の非自動フォールバック** — `MissionStore.setMode()` はユーザーの明示的な操作(TopBarのボタン)によってのみ呼ばれます。LIVE_READ_ONLYでCelesTrak/SatNOGSへの接続が失敗しても、SIMULATEDへの自動切替は一切行われません。古いキャッシュがあれば `staleCache: true` として明示ラベル付きで使い続け(詳細は [`architecture.md`](architecture.md) の freshness モデル参照)、キャッシュも無ければ `UNAVAILABLE` を表示します。この非フォールバック方針は `tests/store.modeSwitch.test.ts` で検証されています。
- **モック値を測定値として表示しない** — テレメトリのKnown Field Mapping Layer(`src/domain/telemetryMapping.ts`)は、実測フィールドが存在しないカードに仮想値を補完することはせず、`N/A` を表示します。未知のデコーダフィールドも、既知カードの値にすり替えることなく生データ行としてそのまま表示されます。

## 責任ある利用

CelesTrak・SatNOGSはいずれも第三者が運営する公開データサービスであり、本プロジェクトはその公式提供元ではありません。利用にあたっては以下を尊重してください。

- 各サービスの利用規約・アクセスポリシーに従うこと。
- BFFのTTLキャッシュ(既定600秒、`LIVE_DATA_CACHE_TTL_SECONDS`)は上流への過剰なリクエストを避けるための仕組みでもあります。TTLを極端に短く設定しないこと。
- SatNOGS DB APIトークンを取得する場合は、SatNOGSのアカウント登録・利用条件に従うこと。
- 本ダッシュボードで得られる情報を、実際の衛星運用や意思決定の一次情報として用いないこと(教育・研究・ポートフォリオ用途を想定した表示です)。

---

関連ドキュメント: [`README.md`](../README.md) ・ [`architecture.md`](architecture.md)
