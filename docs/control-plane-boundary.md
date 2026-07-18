# Control Plane境界設計(v0.2.0)

本プロジェクトのアーキテクチャは **Data Plane(読み取り)** と **Control Plane(制御)** を明確に分離します。v0.2.0時点でControl Planeは**インターフェース定義・disabled stub・本ドキュメントのみ**が存在し、実装は一切ありません。

## 定義

**Data Plane** — 公開データの取得と可視化。v0.2.0で実装されるのはこちらのみ。

- 公開データ取得(CelesTrak / SatNOGS、自BFF経由)
- 軌道計算(SGP4)、パス予測、NETウィンドウ計算
- テレメトリ表示、観測ブラウザ、Replay、Simulator
- Command Rehearsal(`transmitted: false`、I/Oなしの純粋関数)
- Advisory / Provider health(ダッシュボード自身の観測状態の表示)

**Control Plane** — 実世界に作用するすべての操作。以下を指す。

- command uplink(実衛星へのコマンド送信)
- RF transmission(電波送信)
- antenna rotor control(アンテナロータ制御、Hamlib/rotctld接続を含む)
- ground station scheduling(地上局の予約・遠隔操作)
- OTA update(衛星ソフトウェア更新)
- spacecraft control(姿勢・電源・モード等の実機操作)

## 不変条件(v0.2.0)

1. **LIVE_READ_ONLY / REPLAY / SIMULATEDのいずれのモードでも、Control Planeの実装は存在しない。** SIMULATEDモードの仮想アップリンクは実機から完全に隔離されたインメモリ計算であり、Control Planeではない。
2. **ブラウザからの外部送信経路は自BFFへのGETのみ。** コマンド・操作要求を外部へ送るWebSocket / HTTP POSTは存在しない。任意の送信先を設定するUIも存在しない。
3. **`CommandRehearsal.transmitted` はリテラル型 `false`。** 型システム上「送信済み」状態を作れない。テストがfetch非呼び出しを検証する。
4. **Control Plane interfaceの全実装は `DisabledControlPlane` のみ。** すべてのメソッドが即座に `{ status: "DISABLED" }` を返し、I/Oを行わない。feature flagはビルド時定数であり、実行時にControl Planeを有効化する経路はない。
5. **秘密情報(APIトークン等)はサーバー環境変数のみ。** ブラウザに露出しない。
6. **シミュレーション値を実測値として表示しない。** `DataProvenance.isSimulated` と鮮度チップによる区別を維持。

## v0.2.0で許可される範囲

| 許可項目 | 形態 |
|---|---|
| Control Plane interface定義 | TypeScript型定義のみ(`src/services/control/ControlPlane.ts` 予定) |
| disabled stub | `DisabledControlPlane` — 全メソッドが `DISABLED` を返す唯一の実装 |
| safety guard | stubへの到達自体をガードするアサーション・テスト |
| feature flag | `CONTROL_PLANE_ENABLED = false as const`(ビルド時定数。環境変数・UIから変更不可) |
| Command Rehearsal | ARM REHEARSAL → SIMULATE COMMAND、`REHEARSAL_ACK/EXEC/FAIL` の演出。すべてインメモリ |
| 運用手順風UX | Operations checklist等、表示専用のチェックリスト |
| docs | 本ドキュメントおよび将来拡張方針 |

## 将来のCubeSat実運用に向けた前提

将来、自前のCubeSat運用に挑戦する場合でも、**本リポジトリのLIVE_READ_ONLYモードにControl Planeを実装することはありません**。実運用には以下が前提となります。

1. **別モード・別ビルド** — 読み取り専用ダッシュボードとは別の運用モード(またはリポジトリ)として構築し、本プロジェクトのLIVE_READ_ONLYビルドには制御コードを含めない。
2. **別設定・別認証** — 運用者認証、送信先の静的構成(UIからの任意設定は不可)、サーバー側での権限分離。
3. **別安全審査** — 電波法・周波数免許・衛星運用ライセンス等の法規制対応と、送信経路の独立した安全レビューを経ること。
4. **境界の維持** — Control Plane実装はData Planeのコードパスから型レベルで分離し、`SatelliteDataProvider` インターフェースには制御メソッドを決して追加しない。

v0.2.0のinterface定義は、この将来の境界線を**今のうちにアーキテクチャ上に刻んでおく**ためのものであり、実装を近づけるためのものではありません。

## 検証

- `tests/rehearsal.test.ts` — リハーサル経路でfetchが呼ばれないこと
- `tests/controlPlane.test.ts`(v0.2.0 P3で追加予定)— `DisabledControlPlane` が全メソッドで `DISABLED` を返し、I/Oを行わないこと。`CONTROL_PLANE_ENABLED` が `false` であること
- `tests/server.satnogs.test.ts` — トークン非漏洩

関連: [safety-and-scope.md](safety-and-scope.md) ・ [architecture.md](architecture.md) ・ [scc-comparison.md](scc-comparison.md)
