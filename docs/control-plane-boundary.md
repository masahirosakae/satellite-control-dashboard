# Control Plane境界設計(v0.2.0)

本プロジェクトのアーキテクチャは3つのplaneに分離されます: **Data Plane**(読み取り専用の公開データ)、**Rehearsal Plane**(ローカル完結・送信なしのコマンド訓練ログ)、**Control Plane**(実衛星・実地上局に作用しうるすべて)。v0.2.0時点でControl Planeは**インターフェース定義と唯一の永続的disabledアダプタのみ**で構成され、実装は一切ありません。本ドキュメントは、将来実際のControl Planeを検討する場合に何が必要になるかも合わせて記録します。

## 3つのplane

### Data Plane

公開データの取得と可視化。実際の外部I/Oを持つ唯一のplaneであり、常に一方向(自BFFへの読み取り専用GETのみ)です。

- CelesTrakの軌道要素(GP/TLE)とクライアント側SGP4伝播(`src/services/orbit/Sgp4OrbitEngine.ts`)、地上軌跡・パス予測(`src/services/orbit/PassPredictionService.ts`)
- SatNOGSの公開観測・デコード済みテレメトリ(自BFF経由)
- Replayプロバイダ(`src/services/providers/ReplayProvider.ts`)— ローカルのフィクスチャ `src/fixtures/sonate2-replay.json` のみを参照し、ネットワークアクセスは一切なし
- Simulatorプロバイダ(`src/services/providers/SimulatorProvider.ts`)— 実衛星とは無関係のインメモリ仮想CubeSat
- Advisory / Provider health(`src/domain/advisory.ts`, `src/domain/opsChecklist.ts`)— これらはダッシュボード自身の観測状態(リクエストがロード中/失敗/古いか)を表すものであり、実衛星のフォールトを意味することはない

### Rehearsal Plane

LIVE_READ_ONLY / REPLAYのコマンドコンソール。すべてローカル完結・ウォールクロック駆動の状態機械(`src/domain/commandRehearsal.ts`)で、I/Oはゼロです。

- `CommandRehearsal.transmitted` はTypeScript上**リテラル型 `false`**として宣言(`src/domain/types.ts`)。`true` を代入しようとすればコンパイルエラーになり、「送信済み」状態自体が表現不可能。
- `assertNotTransmitted()` は同じ不変条件をランタイムでも検証するガード(キャスト等で型チェックを迂回したオブジェクトに備える)。
- `createCommandRehearsal()` が返す `CommandRehearsal` はすべて `Object.freeze` される。
- ログメッセージと `note` フィールドは明示的にラベル付けされる: 作成時は「READ-ONLY MODE: COMMAND NOT TRANSMITTED」、ライフサイクル遷移(`CREATED → REHEARSAL_ACK → REHEARSAL_EXEC | REHEARSAL_FAIL`)ごとに「SIMULATED — NOT TRANSMITTED」を付与し、UI上のどの表示も実際のACKと誤認され得ない。
- `tests/rehearsal.test.ts` はリハーサル対応の両モード(LIVE_READ_ONLY、REPLAY)でパラメータ化され、`fetch` / `XMLHttpRequest` / `WebSocket` / `navigator.sendBeacon` / `EventSource` / `WebTransport` の6種のI/Oをスタブした上でフェイクタイマーによりリハーサルをフルライフサイクル駆動し、すべてのスタブが一度も呼ばれないことを検証する。

Rehearsal PlaneとControl Planeは意図的に無関係な別の型としてモデル化されている: `RehearsalPlaneStatus`(`src/domain/rehearsalPlane.ts`、`MissionMode` から導出)は `ControlPlaneStatus`(`src/services/control/ControlPlane.ts`)のメンバーではなく、両者が組み合わされることもない。リハーサルの状態がControl Planeのcapabilityとして扱われることは決してない。

### Control Plane

v0.2.0で存在するのは**インターフェース定義と唯一の永続的disabledアダプタのみ**です。

## v0.2.0での禁止事項(全リスト)

以下はいずれもコードベース中に存在せず、今後のv0.2.x系でも実装予定はありません。

- 衛星へのコマンドアップリンク
- RF送信
- アンテナロータ制御
- 地上局ハードウェアの遠隔操作
- OTA(Over-The-Air)ソフトウェア/ファームウェア配信
- Hamlib / rotctld連携
- シリアルポートアクセス
- MQTT
- コマンド用WebSocket(あらゆるWebSocket)
- 制御系HTTPエンドポイント(BFFが公開するのは読み取り専用GETルートのみ — `docs/architecture.md` 参照)
- 任意の送信先URL設定
- 周波数・コールサイン・デバイスの設定機能全般
- APIキー入力UI(SatNOGSトークンはサーバー環境変数のみ — 後述)
- `DisabledControlPlaneAdapter` 以外の `ControlPlanePort` 実装
- feature flag単体で実際の制御を有効化できてしまう構造(下記のランタイムガード参照。フラグが選択できるのは常に `DISABLED` のみ)

## Capability model

`src/services/control/ControlPlane.ts` はControl Planeの「形」だけを定義し、実装はしません。

```typescript
export type ControlPlaneStatus = "DISABLED"; // v0.2.0: DISABLED only — no other member

export interface ControlPlaneCapabilities {
  readonly status: ControlPlaneStatus;
  readonly canTransmitCommand: false;   // false LITERAL types, not boolean
  readonly canTransmitRf: false;
  readonly canControlAntenna: false;
  readonly canControlGroundStation: false;
  readonly canPerformOtaUpdate: false;
}

export interface ControlPlanePort {
  readonly capabilities: ControlPlaneCapabilities;
  getStatus(): ControlPlaneStatus;
  transmitCommand(): never;
  transmitRf(): never;
  controlAntenna(): never;
  controlGroundStation(): never;
  performOtaUpdate(): never;
}
```

「うっかり制御が有効化される」ことを構造的に不可能にする、独立した2層があります。

1. **型レベル** — 各capabilityフラグは `boolean` ではなくリテラル型 `false`。将来これを `true` に広げようとする変更は型宣言自体を書き換える必要があり、これは目に見える・レビュー可能な差分になる — 実行時の値を書き換えるだけでは決して起こらない。各制御メソッドの返り値は `never` 型であり、正当な実装は「常に例外を投げる」ものしかありえない。
2. **ランタイムレベル** — 唯一の実装 `DisabledControlPlaneAdapter`(`src/services/control/DisabledControlPlane.ts`)は、モジュールレベルで `Object.freeze` されたcapabilitiesオブジェクトを公開し(直接のプロパティ書き換えはサイレントな無視かstrictモードでの `TypeError` になる)、`getStatus()` は常に `"DISABLED"` を返し、5つの制御メソッドはそれぞれ厳密に以下のみを行う:

   ```typescript
   transmitCommand(): never {
     throw new Error(CONTROL_PLANE_DISABLED);
   }
   ```

   コンストラクタは**引数を一切取らない** — 送信先・デバイス・秘密情報といった概念自体がこのアダプタには存在しないため、設定する対象がない。

`tests/controlPlane.test.ts` はこれらを型・ランタイムの両レベルで検証する: 実行時の値とfreeze状態、`canTransmitCommand: true` への代入と `ControlPlaneStatus` が `"REHEARSAL_ONLY"` / `"ENABLED"` を受け付けないことへの `@ts-expect-error`、そしてリハーサルテストと同じ6種のI/Oをスタブしてコンストラクタ呼び出し・capability読み取り・`getStatus()`・全制御メソッド呼び出しを通じてゼロ回であることを検証するネットワーク非到達性テスト。

## ランタイム/設定ガード

`parseControlPlaneMode()` は任意のビルド時値、`VITE_CONTROL_PLANE_MODE`(`src/store/useMissionStore.ts` で `import.meta.env.VITE_CONTROL_PLANE_MODE` として配線、型定義は `src/vite-env.d.ts`)を読みます。

- 未設定・空文字・`"disabled"`(大文字小文字・空白は無視)→ `DISABLED`、ログなし。
- **それ以外の値はすべて** — `"rehearsal-only"`、`"flight"`、`"enabled"`、`"true"`、`"1"`、`"on"` のように何かを有効化しそうに見える値も含めて — 同じく `DISABLED` に解決される。ストア(`MissionStore` コンストラクタ、`src/store/missionStore.ts`)は `WARN` `CTRL` イベントを1件だけログに記録する: `control plane mode "<raw>" not recognized — falling back to DISABLED`。

`parseControlPlaneMode` にも `MissionStore` にも、それ以外のどこにも、`DisabledControlPlaneAdapter` 以外の `ControlPlanePort` 実装を構築するコードパスは存在しません。フラグの値が何であってもこれは変わりません。このフラグの目的は将来の**設定ミス**をイベントログ上で可視化することであり、実際のcapabilityをゲートすることではありません。

秘密情報や接続先がこの経路や他のいかなる経路からもブラウザに到達することはありません: SatNOGS APIトークンは `server/config.ts`(サーバープロセスの環境変数)にのみ存在し、クライアントバンドルには一切送られず、BFFのヘルスチェックエンドポイントは真偽値(`satnogsTokenConfigured`)のみを返します — 詳細は `docs/safety-and-scope.md` を参照。

UI側の表示は表示専用の `ControlPlaneStatusChip`(`src/components/layout/ControlPlaneStatusChip.tsx`)で、`TopBar.tsx` にレンダリングされます。`store.controlPlane.getStatus()` と `deriveRehearsalPlaneStatus(store.mode)` を読み、短いラベル(`CONTROL PLANE: DISABLED` / `NO RF / NO UPLINK / NO GROUND-STATION CONTROL`、該当時は `REHEARSAL PLANE: LOCAL ONLY — NOT TRANSMITTED`)を表示するだけです。ボタン・クリックハンドラ・設定用UIは一切持ちません。

## 依存方向

この境界は慣習ではなく構造として強制されており、TypeScript ASTベースのテストスイート `tests/architecture.test.ts` によって検証されます。このテストは `typescript` コンパイラAPIで `src/**/*.ts(x)` を全ファイルパースし、import文と識別子を検査します。

1. `src/services/control/` 配下のファイルは、`src/services/control/` と `src/domain/` の外を一切importしない — 具体的には `src/services/providers/`、`src/services/api/`、`src/store/`、`src/domain/commandRehearsal.ts` を決してimportしない。
2. `src/services/control/` 配下のどのファイルも、識別子 `fetch` / `XMLHttpRequest` / `WebSocket` / `sendBeacon` / `EventSource` / `WebTransport` / `require` を含まない。
3. `src/domain/commandRehearsal.ts` と `src/components/command/` 配下のすべてのファイルは、`src/services/control/` を決してimportしない。
4. `src/services/providers/` と `src/services/api/` は、`src/services/control/` を決してimportしない。
5. `src/` 配下のどのファイルも `process.env` にアクセスせず、`SATNOGS_API_TOKEN` という厳密なリテラルを識別子・文字列として参照しない(「set SATNOGS_API_TOKEN on the server」のように、長い文章の中で単に環境変数名に**言及するだけ**の運用者向けコピーは秘密情報の参照ではなく許可される)。

インポート検出は静的な `import` / `export ... from` 文だけでなく、動的な `import("...")` 呼び出しと `require("...")` 呼び出しも対象にしており(ルール1・3・4はこれらも自動的にカバーする)、ルール2は制御系ファイル内の `require` 識別子そのものも禁止識別子として扱う。

`src/store/` → `src/services/control/` は、アダプタを**実際に構築する唯一のランタイムimport**です: `MissionStore` がdisabledアダプタを構築し、読み取り専用の `store.controlPlane` として公開します。これとは別に、`src/components/layout/ControlPlaneStatusChip.tsx` のような表示コンポーネントは `ControlPlaneStatus` 等の**型のみ**を `import type` で参照できます — 型のみのimportはビルド時に消去されるため、実行時に到達可能なコードパスを増やすものではありません。これらのテストが禁止しているのは逆方向(controlがstore・providers・api・rehearsalコードをimportすること)です。

## 将来の実Control Planeに必要な10要件

以下はいずれもv0.2.0には存在しません。これは、この読み取り専用ダッシュボードの**外側**で実際の制御capabilityを検討する前に構築・レビュー・運用されるべきものの明示的なリストであり、本リポジトリのロードマップではありません:

- SIMULATED / LIVE_READ_ONLY / REPLAYから分離された別のミッションモード
- `DisabledControlPlaneAdapter` およびData Plane / Rehearsal Planeのすべてのコードパスから分離された別のadapter
- 別のビルド・デプロイ成果物(この読み取り専用ダッシュボードのバンドルの一部として出荷されることは決してない)
- 運用者に対する認証・認可
- 実ハードウェアに到達しうるコマンドに対するtwo-person rule(二人承認)
- 本プロジェクトのインメモリイベントログとは独立した、改ざん検知可能な監査ログ
- 実運用前のハードウェア・イン・ザ・ループ(HIL)テスト
- 電波法規制・周波数免許取得・明文化された運用手順
- フェイルセーフ / 緊急停止設計
- 制御経路に特化した独立したセキュリティレビュー

**これらはv0.2.0には一切存在しません。** `src/services/control/ControlPlane.ts` で定義されているインターフェースは、この境界を今のうちに型システム上に見える形で刻んでおくために存在するものであり、上記のいずれかを実装するための一歩ではありません。このインターフェースが存在すること自体によって、本リポジトリが上記のいずれかに近づくことはありません。

## 検証

- `tests/rehearsal.test.ts` — リハーサルライフサイクルが `fetch` / `XMLHttpRequest` / `WebSocket` / `navigator.sendBeacon` / `EventSource` / `WebTransport` のいずれにも触れないこと(リハーサル対応の両モードで検証)
- `tests/controlPlane.test.ts` — `DisabledControlPlaneAdapter` が常に `DISABLED` とfalseリテラルcapabilitiesを返すこと、capabilitiesがfreezeされていること、全制御メソッドが `CONTROL_PLANE_DISABLED` を投げること、同じ6種I/Oのネットワーク非到達性検証、`parseControlPlaneMode()` の受理/非認識/空白/大文字小文字ケースの網羅
- `tests/architecture.test.ts` — 上記5つの依存関係/識別子ルール
- `tests/server.satnogs.test.ts` — SatNOGSトークンがBFFのレスポンスボディ・エラーメッセージのいずれにも漏れないこと

関連: [safety-and-scope.md](safety-and-scope.md) ・ [architecture.md](architecture.md) ・ [scc-comparison.md](scc-comparison.md)
