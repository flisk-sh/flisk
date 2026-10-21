# Try it and report what you saw

You do not need to write code or a polished bug report. This page shows how to install Flisk, run an example, and tell us what happened using a short form. Rough notes are fine: a half-finished report with real numbers helps more than none.

[Open the form](https://github.com/flisk-sh/flisk/issues/new?template=try-it-and-report.yml). It has three short required answers (what you tried, how it went, what you saw) and the rest is optional.

## 1. Install

You need Docker (Desktop, OrbStack or Colima) running, and Tilt 0.25.0 or newer. Then install the Flisk CLI:

```bash
curl -fsSL https://raw.githubusercontent.com/flisk-sh/flisk/main/install.sh | sh
flisk --version
```

Copy the `flisk --version` output into the form's "Your setup" box. If the install fails, that is already a useful report: paste the error and say your OS.

## 2. Get the example

```bash
git clone https://github.com/flisk-sh/flisk.git
cd flisk/examples/one-backend-python
```

The example is one FastAPI service. Its own [README](../../examples/one-backend-python/README.md) has the full description.

## 3. Run it

```bash
flisk project --yes
time flisk up one-backend-python
```

`flisk up` prints `Flisk is up.` only when every service is ready, so the `real` line `time` prints is your first-start time, including the image build and dependency install. Check the service answers:

```bash
curl --fail http://api.one-backend-python.localhost/api/api-backend/health
# {"status":"ok","service":"api-backend"}
```

If port 80 is busy, Flisk picks another port. `flisk doctor --json` shows which.

If anything fails, run `flisk status` and `flisk doctor` and paste what they print. Stop everything with `flisk down`.

## 4. Optional: the timings we are missing

These three numbers are what [issue 683](https://github.com/flisk-sh/flisk/issues/683) is waiting for. Do as many as you like, and say which you skipped.

**First start.** The `time flisk up` result from step 3.

**Warm start.** Stop the stack and start it again. The image is already built, so this should be faster:

```bash
flisk down
time flisk up one-backend-python
```

**Save to ready.** Change one line and measure how long until the service serves the change. We change the word `ok` that `/health` returns. The example README says every edit rebuilds the image today, so expect seconds, not milliseconds. That is the number we want to see:

```bash
now() { perl -MTime::HiRes=time -e 'printf "%.1f", time'; }
f=services/one-backend-python/api/src/main.py
perl -pi -e 's/"status": "ok"/"status": "changed"/' "$f"
start=$(now)
until curl -fs http://api.one-backend-python.localhost/api/api-backend/health | grep -q changed; do sleep 0.2; done
echo "save to ready: $(perl -e "printf '%.1f', $(now) - $start") s"
git checkout -- "$f"   # undo the edit
```

**Compare with `uvicorn --reload`.** Run the same change without Flisk, so we can see the gap, if there is one. This needs Python 3.12 or newer. Run `flisk down` first so the two do not compete for CPU, and keep the virtual environment outside the project:

```bash
cd services/one-backend-python/api
python3 -m venv /tmp/uvicorn-venv && . /tmp/uvicorn-venv/bin/activate
pip install fastapi==0.115.6 "uvicorn[standard]==0.34.0"
uvicorn main:app --app-dir src --port 4000 --reload
```

In a second terminal, repeat the "save to ready" step from the example folder, using `http://localhost:4000/health` instead of the `.localhost` URL. Stop with Ctrl-C when you are done.

If the Postgres part of the issue matters to you, also note any connection errors the API logs while Postgres starts. `flisk logs` shows them.

## 5. Fill in the form

Open the [form](https://github.com/flisk-sh/flisk/issues/new?template=try-it-and-report.yml) and answer in your own words. Two examples of what a useful report looks like (the numbers are made up, for illustration):

**It worked, with numbers**

| Field | Example |
|---|---|
| What did you try? | Ran examples/one-backend-python and timed it |
| How did it go? | It worked, but something was slow or odd |
| What did you see? | First `flisk up` 4 min 10 s. Warm `flisk up` 35 s. Save to ready about 6 s with Flisk, about 1 s with `uvicorn --reload`. |
| Your setup | macOS 15, OrbStack, flisk 1.3.126 |

**It failed**

| Field | Example |
|---|---|
| What did you try? | `flisk up one-backend-python` on a fresh clone |
| How did it go? | It failed |
| What did you see? | Stopped after about 2 minutes with `✗ api-backend failed`. `flisk status` shows it as an error. |
| Pasted output | The text `flisk up` and `flisk status` printed |
| Your setup | Ubuntu 24.04 in WSL2, Docker Desktop, flisk 1.3.126 |

Things that make a report easier to act on, none of them required:

- Say whether it was the first run or a repeat.
- Paste text, not screenshots, so we can search it.
- Remove passwords and tokens from anything you paste.
- Say what you expected, if you had an expectation.

We aim to reply on the issue within one working day. If you want to go further and find bugs on purpose, see [Finding bugs in Flisk](finding-bugs.md).
