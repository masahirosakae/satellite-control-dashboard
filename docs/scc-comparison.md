# SCC比較分析(v0.2.0設計資料)

本プロジェクト v0.2.0 は [SCC (Satellite Control Center)](https://github.com/animede/SCC) の**運用UX・画面構成・運用概念**を参考にします。ただし本プロジェクトは READ-ONLY の公開データダッシュボードであり、SCCとは目的・安全境界が根本的に異なります。本ドキュメントは「何を吸収し、何を吸収しないか」の判断記録です。

> **ライセンス・資産方針**: SCCのコード・CSS・画像・地図データ(coastline配列等)は一切コピーしません。参考にするのは README / SPEC / 操作マニュアル / 通信仕様書に記述された**設計思想・運用概念・画面構成**のみです。地図はNatural Earth / world-atlas(パブリックドメイン)由来のデータを独自に組み込みます。

## SCCとは

架空衛星 "HIKARI-1" のための4Kディスプレイ常設型ミッション管制ダッシュボード。フロントはvanilla JS + CSS Grid、バックエンドはNode.js(依存ゼロ)+ WebSocket、軌道はsatellite.js(SGP4)。**Hamlib rotctld経由の実アンテナ制御アダプタを持ち、コマンド送信(ARM→SEND)を実装している**点が本プロジェクトと決定的に異なります。

## 吸収する概念(運用UX)

| SCCの概念 | 内容 | 本プロジェクトでの扱い |
|---|---|---|
| **ContactPhase** | AOS−3min: SLEWING → AOS: TRACKING → LOS: IDLE の局状態遷移 | 表示専用のフェーズ計算として吸収。`PRE_PASS / IN_PASS / POST_PASS / IDLE` を導出し、パネル強調表示に使用。アンテナ実制御はしない |
| **24hパスタイムライン** | 局ごとのガントバー、最大仰角による濃淡表示 | `PassTimeline` を24hスパン+局別レーン+仰角シェーディングに拡張 |
| **NETコンタクトウィンドウ** | 複数局のパスをマージした連続可視ウィンドウ(ハンドオーバー概念)、T−カウントダウン | 純粋関数としてマージロジックを実装。ヘッダにNET T−カウントダウン表示 |
| **イベントログのレベル体系** | INFO / WARN / SERIOUS / CRITICAL + フィルタチップ + 自動スクロール | `EventLog` にレベル・ソース・フィルタを追加 |
| **アラーム(ログと別系統)** | `{id, level, msg, t, ack}` の永続フォールトオブジェクト + ACK操作 | **Advisory** として読み替えて吸収。データ鮮度劣化・プロバイダERROR・TOKEN_MISSING等を「運用者への勧告」として表示・ACK。衛星の実フォールトではなく**ダッシュボード自身の観測状態**に限定 |
| **2段階コマンド(ARM→SEND)** | 誤送信防止の2段階UI、ACK/EXEC/FAILステータス遷移 | **Command Rehearsalとして吸収**: ARM REHEARSAL → SIMULATE COMMAND。ステータスは `REHEARSAL_ACK / REHEARSAL_EXEC / REHEARSAL_FAIL` と明示的にリハーサル接頭辞を付け、`transmitted: false` を維持 |
| **世界地図の表現** | 正距円筒図法、海岸線、昼夜ターミネータ、可視フットプリント円、過去実線/未来破線の地上軌跡、日付変更線分割描画 | 手描き大陸ポリライン(現行)をNatural Earth / world-atlasベースに置換。ターミネータ・過去/未来トラック区別を追加 |
| **地上局ネットワーク表現** | 局ごとの帯域・アンテナ径・状態バッジ・次パスカウントダウン | 表示メタデータ(帯域・説明)を局データに追加可能に。状態バッジはContactPhase由来の**表示専用**ステート |
| **運用手順的なUX** | ヘッダのAOSカウントダウン、UTC/MET時計、DATA SOURCEインジケータ | Operations checklist(パス前確認の読み取り専用チェックリスト)、TopBarのNETカウントダウンとして吸収 |
| **決定論的状態機械の思想** | 単一のシミュレーションクロックが全パネルを駆動 | 既に `MissionStore.displayNow` として同型の設計を持つ。維持 |

## 吸収しない概念(安全境界の外)

| SCCの概念 | 吸収しない理由 |
|---|---|
| **実コマンド送信(SEND→衛星)** | 本プロジェクトはLIVE_READ_ONLYで実衛星(SONATE-2)を扱う。送信経路は存在させない([safety-and-scope.md](safety-and-scope.md)) |
| **Hamlib / rotctld アンテナ制御アダプタ** | 実ハードウェア制御は禁止範囲。将来もLIVE_READ_ONLYでは実装しない |
| **WebSocketによるop送信(`{type:"op"}`)** | ブラウザから外部へ操作要求を送るチャネルは持たない。データ取得は自BFFへのGETのみ |
| **OTA / SW UPDATE状態機械** | 実衛星へのアップロードを連想させる機能。Control Plane境界の向こう側([control-plane-boundary.md](control-plane-boundary.md)) |
| **WS切断時のローカルモックへの自動フォールバック** | 本プロジェクトは「実データ⇔シミュレーションの自動すり替え禁止」が原則。モード切替は常にユーザー明示操作のみ |
| **危険コマンド(REBOOT等)の確認ダイアログ→実行** | リハーサルでは危険コマンド概念自体を演出として持ち込まない(実行対象が存在しないため) |
| **コード・CSS・画像・座標データ** | ライセンス/方針上コピーしない。概念のみ参照 |

## SCCとの構造対比

| 観点 | SCC | 本プロジェクト |
|---|---|---|
| 対象 | 架空衛星 + (オプションで)実アンテナHW | 実衛星の公開データ(読み取り専用)+ 仮想衛星 + リプレイ |
| 通信 | WebSocket双方向(op送信あり) | HTTP GET(自BFFのみ)、単方向 |
| コマンド | 実装あり(モック実行) | Rehearsalのみ、`transmitted: false` 型保証 |
| Control Plane | 独立した概念としてモデル化されていない — 制御そのものが目的 | インターフェース+唯一の永続的disabledアダプタ(`src/services/control/`)。境界はarchitecture testsで強制 |
| 運用アセスメント | アラームは衛星フォールト指向 | `OperationalAssessment`(advisory + ops checklist)を単一の `OperationalSnapshot` から導出し、provider request lifecycleでゲート。スコープはダッシュボード自身の観測状態に限定 |
| 地図データ | 独自ポリライン | Natural Earth / world-atlas(v0.2.0で導入) |
| 軌道 | satellite.js SGP4 | 同じくsatellite.js SGP4(LIVE/REPLAY) |
| 安全境界 | なし(制御が目的) | Data Plane / Rehearsal Plane / Control Plane分離が設計の核 |

関連: [architecture.md](architecture.md) ・ [safety-and-scope.md](safety-and-scope.md) ・ [control-plane-boundary.md](control-plane-boundary.md)
