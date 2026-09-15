# データフローと状態遷移

対応要求: FR-1 / FR-3 / FR-4 — [requirements.md](requirements.md)

## 1. 全体シーケンス（正常系・DoD 1）

```mermaid
sequenceDiagram
  autonumber
  participant App1 as 利用アプリ(hub)
  participant Ext1 as 本拡張(hub)
  participant W1 as turbowarp-webrtc(hub)
  participant Human as 担当者/光学搬送
  participant Ext2 as 本拡張(camera)
  participant W2 as turbowarp-webrtc(camera)
  participant App2 as 利用アプリ(camera)

  App2->>Ext2: startAnswerPairing(s, localPeer="")
  Note over Ext2: phase=awaiting-offer

  App1->>Ext1: startOfferPairing(s, "hub", "camera-1")
  Ext1->>W1: createOffer("camera-1")
  W1-->>Ext1: offer code (ICE収集完了済み)
  Ext1->>Ext1: createParts() 分割・hash・QR化
  Note over Ext1: phase=offer-ready
  App1->>Ext1: showPairingQrPart(1..n) 投影

  loop 各part
    Human-->>Ext2: カメラでQR読取り → scanFrame
    Ext2->>Ext2: parse → assembler.add()
    Note over Ext2: phase=receiving (received/required)
  end

  Ext2->>Ext2: assemble() 長さ・hash検証
  Note over Ext2: phase=offer-received
  Ext2->>W2: acceptOffer("hub", offerCode)
  W2-->>Ext2: answer code (ICE収集完了済み)
  Ext2->>Ext2: createParts(kind=answer, replyTo=offerMessageId)
  Note over Ext2: phase=answer-ready
  App2->>Ext2: showPairingQrPart(1..m) 画面表示

  Human->>Human: スマートフォンで全partを撮影し hubへ運ぶ
  loop 各part
    Human-->>Ext1: スマホ画面をhubのカメラへ → scanFrame
    Ext1->>Ext1: parse → sessionId/replyTo/peer検証 → assembler.add()
  end

  Ext1->>Ext1: assemble() 長さ・hash検証
  Note over Ext1: phase=answer-received
  Ext1->>W1: acceptAnswer("camera-1", answerCode)
  Note over Ext1: phase=connecting
  loop connectionStateをポーリング
    Ext1->>W1: connectionState("camera-1")
  end
  Note over Ext1: phase=connected
  Ext1-->>App1: isPairingConnected = true
  Note over Ext2: phase=connected（W2のconnectionStateで確認）
  App1->>W1: sendEvent/sendLatestData で疎通確認 (DoD 2)
```

## 2. 状態遷移（hub）

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> creating_offer: startOfferPairing
  creating_offer --> offer_ready: offer code 取得・分割成功
  creating_offer --> failed: webrtc失敗 / 分割失敗
  offer_ready --> awaiting_answer: 最初のAnswer partを受理
  offer_ready --> answer_received: 単一partで完結
  awaiting_answer --> answer_received: 全part検証成功
  answer_received --> connecting: acceptAnswer 呼出し
  connecting --> connected: connectionState=connected
  connecting --> failed: connectionState=failed / closed
  offer_ready --> expired: 期限超過
  awaiting_answer --> expired: 期限超過
  connecting --> expired: 期限超過
  creating_offer --> cancelled: cancelPairing
  offer_ready --> cancelled: cancelPairing
  awaiting_answer --> cancelled: cancelPairing
  connecting --> cancelled: cancelPairing
  cancelled --> creating_offer: retryPairing(新sessionId)
  expired --> creating_offer: retryPairing(新sessionId)
  failed --> creating_offer: retryPairing(新sessionId)
  connected --> [*]
```

`offer_ready`／`awaiting_answer`は「Offerを表示しながらAnswerを待つ」段階で、
表示の有無は`pairingQrPartCount`／`pairingQrCurrentPart`、受信進捗は
`pairingReceivedParts`／`pairingRequiredParts`／`pairingMissingParts`で別々に観測する。

## 3. 状態遷移（camera）

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> awaiting_offer: startAnswerPairing
  awaiting_offer --> receiving: 最初のOffer partを受理
  receiving --> receiving: 追加part / 重複part
  awaiting_offer --> offer_received: 単一partで完結
  receiving --> offer_received: 全part検証成功
  offer_received --> creating_answer: acceptOffer 呼出し
  creating_answer --> answer_ready: answer code 取得・分割成功
  creating_answer --> failed: webrtc失敗 / 分割失敗
  answer_ready --> connecting: 表示完了後もconnectionStateを監視
  connecting --> connected: connectionState=connected
  connecting --> failed: connectionState=failed / closed
  awaiting_offer --> expired: 期限超過
  receiving --> expired: 期限超過
  answer_ready --> expired: 期限超過
  awaiting_offer --> cancelled: cancelPairing
  receiving --> cancelled: cancelPairing
  answer_ready --> cancelled: cancelPairing
  cancelled --> awaiting_offer: retryPairing
  expired --> awaiting_offer: retryPairing
  failed --> awaiting_offer: retryPairing
  connected --> [*]
```

**FR-4.2の分離**: QR読取り完了は`offer_received`／`answer_received`、
WebRTC接続成立は`connected`。両者は必ず別の状態として観測できる。

## 4. part受理の判定フロー（FR-2.3 / FR-2.5）

```mermaid
flowchart TD
  A[QRテキスト到着] --> B{長さ <= MAX_PART_TEXT}
  B -- No --> E1[part-too-large]
  B -- Yes --> C{JSON parse 可}
  C -- No --> E2[invalid-json]
  C -- Yes --> D{protocol == twqr/1}
  D -- No --> E3[unsupported-protocol]
  D -- Yes --> F{envelope各フィールドが範囲内}
  F -- No --> E4[invalid-envelope / index-out-of-range / message-too-large]
  F -- Yes --> G{sessionId が対象sessionのもの}
  G -- No --> E5[unknown-session / stale-exchange]
  G -- Yes --> H{kind と role の組合せが正しい}
  H -- No --> E6[unexpected-kind]
  H -- Yes --> I{peer対応が一致 / Answerならreply-to一致}
  I -- No --> E7[peer-mismatch / reply-mismatch]
  I -- Yes --> J{既存partと同一identity}
  J -- No --> E8[message-mismatch]
  J -- Yes --> K{同indexの既存partと payload一致}
  K -- No --> E9[conflicting-part]
  K -- Yes --> L[assembler へ格納]
  L --> M{received == partCount}
  M -- No --> N[phase=receiving を維持]
  M -- Yes --> O{結合長 == messageLength}
  O -- No --> E10[length-mismatch]
  O -- Yes --> P{SHA-256 == messageHash}
  P -- No --> E11[hash-mismatch]
  P -- Yes --> Q[検証済みメッセージ確定 → WebRTCへ1回だけ引渡し]
```

重複partで`payload`が一致する場合は`duplicate=true`を返し、エラーにはしない（正常系）。

## 5. 古い非同期結果の破棄（FR-4.4）

```mermaid
sequenceDiagram
  participant App
  participant Ctl as PairingController
  participant W as turbowarp-webrtc

  App->>Ctl: startOfferPairing(s) 
  Note over Ctl: epoch=1 を捕捉
  Ctl->>W: createOffer("camera-1")  (時間がかかる)
  App->>Ctl: cancelPairing(s)
  Note over Ctl: epoch=2、表示・lease解放、phase=cancelled
  App->>Ctl: retryPairing(s)
  Note over Ctl: epoch=3、新 sessionId
  W-->>Ctl: 旧createOfferの解決 (epoch=1で開始)
  Note over Ctl: epoch不一致 → 結果を破棄。状態は変更しない
```

同じ仕組みを`acceptOffer`／`acceptAnswer`／分割処理／connectionStateポーリングにも適用する。

## 6. 資源の取得と解放

```mermaid
flowchart LR
  S[session開始] --> T[タイマ登録]
  S --> L[camera lease 取得<br/>scanブロック使用時のみ]
  S --> K[一時skin 生成<br/>表示ブロック使用時のみ]
  S --> P[connectionState ポーリング開始<br/>connecting以降]
  subgraph 終了契機
    C1[cancel] 
    C2[expire]
    C3[connected]
    C4[PROJECT_RUN_STOP]
    C5[RUNTIME_DISPOSED]
  end
  C1 --> R
  C2 --> R
  C3 --> R
  C4 --> R
  C5 --> R
  R[解放: タイマ停止 / lease.release /<br/>元skin復元・一時skin破棄 /<br/>ポーリング停止 / assembler破棄]
```

`connected`到達時も走査・表示・タイマは解放するが、RTCPeerConnectionは維持する。
`RUNTIME_DISPOSED`ではruntimeイベントリスナも解除する。
