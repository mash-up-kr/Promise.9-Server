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

Expo 대시보드에서 Enhanced push security를 켠 프로젝트는 서버에 `EXPO_ACCESS_TOKEN`을 설정해야 한다. 기본적으로 선택 사항이며 빈 값은 허용하지 않는다. 이 값은 사용자 기기의 Expo Push Token과 다르다. 운영 배포에서는 GitHub Actions secret `EXPO_ACCESS_TOKEN`에 설정하면 `.env.production`으로 전달된다. 설정하지 않은 경우에는 환경변수 항목을 생성하지 않는다.

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

## 토큰 조회·삭제와 배치 연동

토큰 조회·삭제는 테이블 PR이 반영된 후 실제 스키마에 맞춰 구현한다. 현재는 테이블, migration, 임시 repository를 추가하지 않는다.

배치에서는 발송 결과의 사용자·작업 ID, 토큰과 ticket ID를 저장하고 receipt를 조회한다. ticket 또는 receipt의 `DeviceNotRegistered`를 확인하면 원래 사용자와 토큰을 조건으로 삭제해야 한다. 타임아웃, 인증정보 오류, `MessageTooBig` 같은 다른 오류를 토큰 삭제 근거로 사용하지 않는다.

현재 모듈은 서버 내부에서 사용하며 HTTP API를 추가하지 않는다.
