# Flisk를 시도하고 본 것을 보고하기

> 이 페이지는 [try-and-report.md](../try-and-report.md)의 번역입니다. 내용이 다르면 영어 버전이 우선합니다.

코드를 쓰거나 다듬어진 버그 보고서를 만들 필요는 없습니다. 이 페이지는 Flisk를 설치하고, 예제를 실행하고, 짧은 폼으로 무슨 일이 있었는지 알려주는 방법을 보여줍니다. 거친 메모도 괜찮습니다. 실제 수치가 담긴 미완성 보고서가 아무것도 없는 것보다 훨씬 도움이 됩니다.

[폼 열기](https://github.com/flisk-sh/flisk/issues/new?template=try-it-and-report.yml). 필수 답변은 세 가지(무엇을 시도했는지, 어땠는지, 무엇을 봤는지)이고 나머지는 선택 사항입니다.

## 1. 설치

Docker(Desktop, OrbStack 또는 Colima)가 실행 중이어야 하고, Tilt 0.25.0 이상이 필요합니다. 그다음 Flisk CLI를 설치하세요.

```bash
curl -fsSL https://raw.githubusercontent.com/flisk-sh/flisk/main/install.sh | sh
flisk --version
```

`flisk --version` 출력을 폼의 "Your setup" 칸에 복사하세요. 설치가 실패해도 그 자체로 유용한 보고입니다. 오류를 붙여 넣고 OS를 적어주세요.

## 2. 예제 가져오기

```bash
git clone https://github.com/flisk-sh/flisk.git
cd flisk/examples/one-backend-python
```

이 예제는 하나의 FastAPI 서비스입니다. 전체 설명은 그 [README](../../../examples/one-backend-python/README.md)에 있습니다.

## 3. 실행하기

```bash
flisk project --yes
time flisk up one-backend-python
```

`flisk up`은 모든 서비스가 준비되었을 때만 `Flisk is up.`을 출력하므로, `time`이 출력하는 `real` 줄은 이미지 빌드와 의존성 설치를 포함한 첫 시작 시간입니다. 서비스가 응답하는지 확인하세요.

```bash
curl --fail http://api.one-backend-python.localhost/api/api-backend/health
# {"status":"ok","service":"api-backend"}
```

포트 80이 사용 중이면 Flisk가 다른 포트를 고릅니다. `flisk doctor --json`으로 어떤 포트인지 확인할 수 있습니다.

무엇인가 실패하면 `flisk status`와 `flisk doctor`를 실행하고 출력된 내용을 붙여 넣으세요. 모두 멈추려면 `flisk down`을 실행하세요.

## 4. 선택: 빠져 있는 측정값

아래 세 가지 숫자는 [issue 683](https://github.com/flisk-sh/flisk/issues/683)이 기다리고 있는 값입니다. 원하는 만큼 해보고, 건너뛴 항목은 그렇다고 말해 주세요.

**첫 시작.** 3단계의 `time flisk up` 결과입니다.

**웜 스타트.** 스택을 중지했다가 다시 시작하세요. 이미지가 이미 빌드되어 있으므로 더 빨라야 합니다.

```bash
flisk down
time flisk up one-backend-python
```

**저장부터 준비 완료까지.** 한 줄을 바꾸고, 서비스가 변경 내용을 반영해 응답하기까지 걸리는 시간을 재세요. `/health`가 반환하는 `ok`라는 단어를 바꿉니다. 예제 README에는 현재 편집할 때마다 이미지가 다시 빌드된다고 나와 있으니, 밀리초가 아니라 수 초가 걸릴 것으로 예상하세요. 우리가 보고 싶은 숫자가 바로 이것입니다.

```bash
now() { perl -MTime::HiRes=time -e 'printf "%.1f", time'; }
f=services/one-backend-python/api/src/main.py
perl -pi -e 's/"status": "ok"/"status": "changed"/' "$f"
start=$(now)
until curl -fs http://api.one-backend-python.localhost/api/api-backend/health | grep -q changed; do sleep 0.2; done
echo "save to ready: $(perl -e "printf '%.1f', $(now) - $start") s"
git checkout -- "$f"   # 편집 되돌리기
```

**`uvicorn --reload`와 비교.** Flisk 없이 같은 변경을 실행해서 차이가 있는지 확인하세요. Python 3.12 이상이 필요합니다. 두 개가 CPU를 두고 경쟁하지 않도록 먼저 `flisk down`을 실행하고, 가상 환경은 프로젝트 밖에 두세요.

```bash
cd services/one-backend-python/api
python3 -m venv /tmp/uvicorn-venv && . /tmp/uvicorn-venv/bin/activate
pip install fastapi==0.115.6 "uvicorn[standard]==0.34.0"
uvicorn main:app --app-dir src --port 4000 --reload
```

두 번째 터미널에서 `.localhost` URL 대신 `http://localhost:4000/health`를 사용해 예제 폴더에서 "저장부터 준비 완료까지" 단계를 반복하세요. 끝나면 Ctrl-C로 중지합니다.

이슈의 Postgres 부분이 중요하다면, Postgres가 시작되는 동안 API가 기록하는 연결 오류도 적어 두세요. `flisk logs`에서 볼 수 있습니다.

## 5. 폼 작성하기

[폼](https://github.com/flisk-sh/flisk/issues/new?template=try-it-and-report.yml)을 열고 자신의 말로 답하세요. 유용한 보고서의 예 두 가지를 보여드립니다(숫자는 설명을 위해 만든 값입니다).

**작동했고, 수치 포함**

| 항목 | 예시 |
|---|---|
| 무엇을 시도했나요? | examples/one-backend-python을 실행하고 시간을 쟀습니다 |
| 어땠나요? | 작동했지만 무언가 느리거나 이상했습니다 |
| 무엇을 봤나요? | 첫 `flisk up` 4분 10초. 웜 `flisk up` 35초. 저장부터 준비 완료까지 Flisk에서 약 6초, `uvicorn --reload`에서 약 1초. |
| Your setup | macOS 15, OrbStack, flisk 1.3.126 |

**실패했음**

| 항목 | 예시 |
|---|---|
| 무엇을 시도했나요? | 새로 클론한 저장소에서 `flisk up one-backend-python` |
| 어땠나요? | 실패했습니다 |
| 무엇을 봤나요? | 약 2분 뒤 `✗ api-backend failed`로 멈췄습니다. `flisk status`에는 오류로 표시됩니다. |
| 붙여 넣은 출력 | `flisk up`과 `flisk status`가 출력한 텍스트 |
| Your setup | WSL2의 Ubuntu 24.04, Docker Desktop, flisk 1.3.126 |

보고서를 더 쉽게 처리할 수 있게 해주는 것들이며, 모두 필수는 아닙니다.

- 첫 실행인지 반복 실행인지 알려주세요.
- 스크린샷 대신 텍스트를 붙여 넣으세요. 검색할 수 있습니다.
- 붙여 넣는 내용에서 비밀번호와 토큰을 제거하세요.
- 기대한 것이 있었다면 무엇이었는지 적어 주세요.

보통 issue에 하루 이내로 답변하려고 합니다. 더 나아가 의도적으로 버그를 찾고 싶다면 [Flisk에서 버그 찾기](finding-bugs-ja.md)를 참고하세요.
