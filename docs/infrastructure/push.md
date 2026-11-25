# Expo Push 발송 모듈

`src/infrastructure/push`는 Expo Push Service를 호출한다. 알림 대상 선정, 문구 생성, 예약·배치 실행, 재시도와 ticket 저장은 호출하는 도메인에서 담당한다.

## 발송

발송만 필요하면 호출 모듈의 `imports`에 `PushModule`을 추가하고 `PushService`를 주입한다.

```ts
const results = await pushService.send([
    {
        to: 'ExpoPushToken[...]',
        title: '저장한 링크를 확인해보세요',
        body: '리마인드할 시간이 되었어요.',
        data: { type: 'LINK_REMINDER', linkId: 123 },
        sound: 'default',
    },
])
```

한 입력 항목에 한 토큰을 지정한다. SDK로 토큰 형식을 검증하고 요청 크기 제한에 맞춰 분할한다. 결과는 입력과 동일한 순서·개수를 유지하며 같은 토큰에 여러 메시지를 보내도 각각의 ticket을 반환한다. 한 묶음이 실패해도 다음 묶음은 처리한다.

| status     | 의미                                            | 후속 처리                                            |
| ---------- | ----------------------------------------------- | ---------------------------------------------------- |
| `accepted` | Expo가 접수함                                   | `to`와 `ticketId` 및 원래 사용자·작업 ID를 함께 저장 |
| `rejected` | 잘못된 토큰 형식 또는 Expo의 명시적 거절        | `error`에 따라 처리                                  |
| `unknown`  | 네트워크 오류 등으로 접수 여부를 확정할 수 없음 | 재시도 시 중복 발송 가능성을 고려                    |

`accepted`는 APNs·FCM 전달이나 기기 수신을 의미하지 않는다. SDK 예외의 원문, 공급자 메시지, debug 정보는 반환하거나 로그로 남기지 않는다. 반환값에는 후속 처리를 위한 토큰이 포함되므로 응답 전체를 로그나 공개 API에 노출하지 않는다.

Expo 계정에 Enhanced push security가 켜져 있어 발송 요청에 `EXPO_ACCESS_TOKEN`이 필요하다. production 환경에서는 필수이며, 다른 환경에서는 선택 사항이다. 빈 값은 허용하지 않는다. 이 값은 사용자 기기의 Expo Push Token과 다르다. 운영 배포는 GitHub Actions secret `EXPO_ACCESS_TOKEN`을 필수로 검사하고 `.env.production`으로 전달한다. secret이 비어 있으면 배포를 시작하기 전에 실패한다.

## Receipt 조회

```ts
const receipts = await pushService.getReceipts(ticketIds)
```

성공한 ticket의 ID로 조회한다. 중복 ID는 제거하고 SDK의 조회 제한에 맞춰 분할한다.

- `ok`: APNs·FCM이 메시지를 접수함. 사용자 기기 수신을 보장하지 않는다.
- `error`: `error` 코드로 전달 실패 사유를 확인한다.
- `pending`: 응답에 해당 ID가 없음. 아직 생성되지 않았거나 이미 만료된 경우 모두 가능하다.
- `unknown`: 조회 요청이 실패함. `pending`과 구분해서 처리한다.

[Expo 공식 문서](https://docs.expo.dev/push-notifications/sending-notifications/)는 발송 약 15분 뒤 receipt 조회를 권장하며, receipt는 24시간 후 삭제된다. 배치에서 ticket 생성 시각과 조회 일정을 관리해야 한다. 프로세스 메모리나 `setTimeout`에 ticket을 보관하지 않는다.

## 리마인드 배치 연동

`src/modules/link/reminder`의 리마인드 배치가 이 모듈로 푸시를 보낸다. 이메일과 같은 15분 주기로 실행하며, 알림 형식은 [푸시 토큰 API 문서](../api/push-token.md#리마인드-알림)에 정리했다.

1. 발송 시각이 된 링크에 회차(`links.reminder_occurrence_id`)를 한 번 만든다. 일정을 바꾸거나 해제하거나 링크를 삭제하면 회차를 `NULL`로 되돌려 이전 회차의 남은 재시도를 멈춘다. 삭제한 링크를 복구할 때 이미 지난 리마인드 시각은 비우고, 아직 오지 않은 일정은 유지한다.
2. 대상은 50건씩 묶어 처리하며, 묶음마다 보내기 직전에 이메일·푸시 수신 설정을 다시 읽어 대상 조회 뒤 끈 채널로는 보내지 않는다.
3. 채널마다 발송 이력을 먼저 선점한 실행만 보낸다. 이메일은 `(link_id, occurrence_id)`, 푸시는 `(link_id, occurrence_id, push_token_id)` 유니크 제약으로 첫 발송을 선점하고, 재시도는 `FAILED` 이력을 `PENDING`으로 바꾼 실행만 한다. 배치가 겹쳐 실행돼도 이메일과 기기마다 한 번만 보낸다.
4. 채널은 서로 독립이다. 한 채널의 실패·예외는 다른 채널 발송과 이력에 영향을 주지 않는다.
5. 한 채널이라도 접수되면 일정을 마친다(`reminder_at = null`). 보낼 채널이 없을 때(이메일 수신 꺼짐, 푸시 수신 꺼짐 또는 등록 기기 없음)도 보내지 않고 일정을 마친다.
6. 실패한 채널은 일정과 관계없이 첫 시도 뒤 1시간 안에서만 다시 보낸다. 이메일은 실패하면 모두, 푸시는 `MessageRateExceeded`만 다시 보낸다. 첫 발송을 시도했지만 예정 시각에서 1시간이 지나도록 어느 채널로도 보내지 못한 일정은 마친다. 아직 발송을 시도하지 않은 일정은 남겨 두고 다음 실행에서 보낸다.
7. 접수 여부를 알 수 없는 푸시(`UNKNOWN`)와 발송 도중 예외로 끝나 `PENDING`에 남은 이력은 중복 발송을 막기 위해 다시 보내지 않는다.

같은 실행에서 발송 뒤 15분이 지난 `ACCEPTED` 이력의 receipt를 조회해 `RECEIPT_OK` 또는 `FAILED`로 기록한다. 24시간이 지난 이력은 receipt가 사라졌으므로 조회하지 않는다.

ticket 또는 receipt에서 `DeviceNotRegistered`를 받으면 발송 당시 사용자 ID와 토큰 ID를 함께 조건으로 토큰을 삭제한다. 계정이 바뀐 기기의 토큰은 지우지 않는다. 타임아웃, 인증정보 오류, `MessageTooBig` 같은 다른 오류로는 토큰을 지우지 않는다.

현재 모듈은 서버 내부에서 사용하며 HTTP API를 추가하지 않는다.
