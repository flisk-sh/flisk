<div align="center">

# TDK CLI — generate and run your whole tech stack without the setup pain

Go from an empty folder to a running tech stack with one command. Built for agents.

[![npm version](https://img.shields.io/npm/v/@tdk-landscape/tdk-cli-core.svg?style=flat&color=blue)](https://www.npmjs.com/package/@tdk-landscape/tdk-cli-core) [![npm weekly downloads](https://img.shields.io/npm/dw/@tdk-landscape/tdk-cli-core?style=flat&color=blue)](https://www.npmjs.com/package/@tdk-landscape/tdk-cli-core) [![unpacked size](https://img.shields.io/npm/unpacked-size/@tdk-landscape/tdk-cli-core)](https://packagephobia.com/result?p=@tdk-landscape/tdk-cli-core) [![install size](https://badgen.net/packagephobia/install/@tdk-landscape/tdk-cli-core)](https://packagephobia.com/result?p=@tdk-landscape/tdk-cli-core) [![GitHub stars](https://img.shields.io/github/stars/flisk-sh/tdk-cli-core?style=flat&logo=github)](https://github.com/flisk-sh/tdk-cli-core/stargazers) [![OSS Insight](https://img.shields.io/badge/OSS%20Insight-analytics-blue)](https://ossinsight.io/analyze/flisk-sh/tdk-cli-core) [![X followers: 1,605](https://img.shields.io/badge/X%20followers-1%2C605-1DA1F2?style=flat&logo=x&logoColor=white)](https://x.com/brookservers)
[![Journeys E2E](https://github.com/flisk-sh/tdk-cli-core/actions/workflows/e2e-journeys.yml/badge.svg)](https://github.com/flisk-sh/tdk-cli-core/actions/workflows/e2e-journeys.yml) [![ERP fixture scale E2E](https://github.com/flisk-sh/tdk-cli-core/actions/workflows/e2e-scale-full.yml/badge.svg)](https://github.com/flisk-sh/tdk-cli-core/actions/workflows/e2e-scale-full.yml) [![Example apps E2E](https://github.com/flisk-sh/tdk-cli-core/actions/workflows/e2e-real-apps.yml/badge.svg?branch=main)](https://github.com/flisk-sh/tdk-cli-core/actions/workflows/e2e-real-apps.yml) [![CodeQL](https://github.com/flisk-sh/tdk-cli-core/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/flisk-sh/tdk-cli-core/security/code-scanning) [![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/flisk-sh/tdk-cli-core/badge)](https://scorecard.dev/viewer/?uri=github.com/flisk-sh/tdk-cli-core) [![Known Vulnerabilities](https://snyk.io/test/github/flisk-sh/tdk-cli-core/badge.svg)](https://snyk.io/test/github/flisk-sh/tdk-cli-core) [![Socket Badge](https://badge.socket.dev/npm/package/@tdk-landscape/tdk-cli-core/latest)](https://socket.dev/npm/package/@tdk-landscape/tdk-cli-core/overview)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[![ERP backends healthy](https://img.shields.io/badge/ERP%20backends%20healthy-100%2F100-brightgreen)](https://github.com/flisk-sh/tdk-cli-core/actions/runs/39160719471) [![ERP time to all healthy](https://img.shields.io/badge/ERP%20time%20to%20all%20healthy-524s-blue)](https://github.com/flisk-sh/tdk-cli-core/actions/runs/39160719471) [![ERP frontends answering](https://img.shields.io/badge/ERP%20frontends%20answering-7%2F7-brightgreen)](https://github.com/flisk-sh/tdk-cli-core/actions/runs/39160719471) [![ERP running containers](https://img.shields.io/badge/ERP%20running%20containers-109-blue)](https://github.com/flisk-sh/tdk-cli-core/actions/runs/39160719471) [![ERP memory used](https://img.shields.io/badge/ERP%20memory%20used-1736%20MiB-blue)](https://github.com/flisk-sh/tdk-cli-core/actions/runs/39160719471)
[![Test coverage](https://raw.githubusercontent.com/flisk-sh/tdk-cli-core/main/docs/assets/coverage.svg)](https://github.com/flisk-sh/tdk-cli-core/blob/main/docs/assets/coverage.svg)

<sub>ERP fixture scale run on a clean GitHub-hosted runner (4 vCPU, 15 GB RAM), snapshot from [run 39160719471](https://github.com/flisk-sh/tdk-cli-core/actions/runs/39160719471). The live status is in the ERP fixture scale E2E badge above.</sub>

<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/daily?language=Starlark" alt="flisk-sh%2Ftdk-cli-core | Trendshift" width="250" height="55"/></a>
<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/weekly?language=Starlark" alt="flisk-sh%2Ftdk-cli-core | Trendshift" width="250" height="55"/></a>
<p align="center">
  <a href="https://www.bestpractices.dev/projects/15310">
    <img src="https://www.bestpractices.dev/assets/openssf_bestpracticesbadge-a908f4124737f3d6b2c5abc82756bd2a435cff474b45615ce469746c31a4288c.svg" alt="OpenSSF Best Practices" height="80" align="middle" style="vertical-align: middle" />
  </a>
  <a href="https://www.bestpractices.dev/projects/15310">
    <img src="https://img.shields.io/badge/OpenSSF%20Silver-95%25-yellow" alt="OpenSSF Silver: 95%" height="40" align="middle" style="vertical-align: middle" />
  </a>
</p>

<br />

<a id="readme-languages"></a>

<p align="center">

English | [简体中文](docs/README-zh_cn.md) | [繁體中文](docs/README-zh_tw.md) | [日本語](docs/README-ja.md) | [한국어](docs/README-ko.md) | [Türkçe](docs/README-tr.md) | [Tiếng Việt](docs/README-vi.md) | [ไทย](docs/README-th.md) | [Deutsch](docs/README-de.md) | [Español](docs/README-es.md) | [Français](docs/README-fr.md) | [Українська](docs/README-uk.md) | [Polski](docs/README-pl.md) | [Português (Brasil)](docs/README-pt-BR.md) | [العربية](docs/README-ar.md) | [فارسی](docs/README-fa.md) | [Bahasa Indonesia](docs/README-id.md) | [Italiano](docs/README-it.md) | [Ελληνικά](docs/README-el.md) | [മലയാളം](docs/README-ml.md)

</p>

<br />

[Website](https://flisk.sh/) · [Quickstart](https://flisk.sh/docs/quickstart/) · [Examples](https://flisk.sh/docs/examples/) · [Awesome TDK](https://github.com/flisk-sh/awesome-tdk-framework) · [Demo](https://flisk-sh.github.io/tdk-demo-animation/) · [Report a bug](https://github.com/flisk-sh/tdk-cli-core/issues)

</div>

### Stop letting AI hallucinate your local infrastructure.

LLMs are brilliant at writing application logic, but notoriously terrible at maintaining local infrastructure. Every time your AI rewrites a `Dockerfile`, misconfigures a `Tiltfile`, or breaks an `nginx.conf`, it wastes your developer focus and burns thousands of unnecessary API tokens.

**TDK CLI Core** bridges the gap. You write the clean web application logic, and TDK instantly autodetects your stack to generate, link, and orchestrate the local environment for you. 

## Build your app in one click

Fastest way (recommended): open the [TDK starter](https://github.com/flisk-sh/tdk-cli-starter) in a ready-to-use environment.

<table align="center">
  <tr><td align="center" valign="middle" width="33%"><a href="https://v0.dev/"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/build-v0.svg" alt="Build app with v0" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://gitpod.io/#https://github.com/flisk-sh/tdk-cli-starter"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/build-gitpod.svg" alt="Build app with Gitpod" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://lovable.dev/"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/build-lovable.svg" alt="Build app with Lovable" height="32"></a></td></tr>
  <tr><td align="center" valign="middle" width="33%"><a href="https://bolt.new/"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/build-bolt.svg" alt="Build app with Bolt.new" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="vscode://vscode.git/clone?url=https://github.com/flisk-sh/tdk-cli-starter"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/build-vscode.svg" alt="Build app with VS Code" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://github.com/codespaces/new/flisk-sh/tdk-cli-starter"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/build-codespaces.svg" alt="Build app with Codespaces" height="32"></a></td></tr>
</table>

<details>
<summary>More build tools (7)</summary>

<table align="center">
  <tr><td align="center" valign="middle" width="33%"><a href="https://replit.com/github/flisk-sh/tdk-cli-starter"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/build-replit.svg" alt="Build app with Replit" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://glitch.com/edit/#!/import/github/flisk-sh/tdk-cli-starter"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/build-glitch.svg" alt="Build app with Glitch" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://devpod.sh/open#https://github.com/flisk-sh/tdk-cli-starter"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/build-devpod.svg" alt="Build app with DevPod" height="32"></a></td></tr>
  <tr><td align="center" valign="middle" width="33%"><a href="https://stackblitz.com/github/flisk-sh/tdk-cli-starter"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/build-stackblitz.svg" alt="Build app with StackBlitz" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://codesandbox.io/p/github/flisk-sh/tdk-cli-starter"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/build-codesandbox.svg" alt="Build app with CodeSandbox" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/flisk-sh/tdk-cli-starter"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/build-dev-containers.svg" alt="Build app with Dev Containers" height="32"></a></td></tr>
  <tr><td align="center" valign="middle" width="33%"><a href="https://studio.firebase.google.com/import?url=https://github.com/flisk-sh/tdk-cli-starter"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/build-firebase-studio.svg" alt="Build app with Firebase Studio" height="32"></a></td></tr>
</table>

</details>

<table align="center">
  <tr><td align="center" valign="middle" width="33%"><a href="https://grok.com/?q=Build%20an%20app%20with%20the%20TDK%20CLI.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/ai-grok.svg" alt="Build app with Grok" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Build%20an%20app%20with%20the%20TDK%20CLI.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/ai-claude.svg" alt="Build app with Claude" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://chatgpt.com/?q=Build%20an%20app%20with%20the%20TDK%20CLI.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/ai-chatgpt.svg" alt="Build app with ChatGPT" height="32"></a></td></tr>
</table>

### Deploy

<table align="center">
  <tr><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20AWS.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-aws.svg" alt="Deploy to AWS" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Azure.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-azure.svg" alt="Deploy to Azure" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Vercel.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-vercel.svg" alt="Deploy to Vercel" height="32"></a></td></tr>
  <tr><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Netlify.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-netlify.svg" alt="Deploy to Netlify" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Heroku.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-heroku.svg" alt="Deploy to Heroku" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Railway.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-railway.svg" alt="Deploy to Railway" height="32"></a></td></tr>
  <tr><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Cloudflare.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-cloudflare.svg" alt="Deploy to Cloudflare" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20DigitalOcean.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-digitalocean.svg" alt="Deploy to DigitalOcean" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Google%20Cloud.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-google-cloud.svg" alt="Deploy to Google Cloud" height="32"></a></td></tr>
</table>

<details>
<summary>More clouds and hosts (18)</summary>

<table align="center">
  <tr><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20SSH.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-ssh.svg" alt="Deploy to SSH" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Civo.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-civo.svg" alt="Deploy to Civo" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Flow.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-flow.svg" alt="Deploy to Flow" height="32"></a></td></tr>
  <tr><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Vultr.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-vultr.svg" alt="Deploy to Vultr" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Fly.io.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-flyio.svg" alt="Deploy to Fly.io" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Linode.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-linode.svg" alt="Deploy to Linode" height="32"></a></td></tr>
  <tr><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Render.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-render.svg" alt="Deploy to Render" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Docker.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-docker.svg" alt="Deploy to Docker" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Hetzner.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-hetzner.svg" alt="Deploy to Hetzner" height="32"></a></td></tr>
  <tr><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Cloudbit.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-cloudbit.svg" alt="Deploy to Cloudbit" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Exoscale.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-exoscale.svg" alt="Deploy to Exoscale" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Scaleway.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-scaleway.svg" alt="Deploy to Scaleway" height="32"></a></td></tr>
  <tr><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Multipass.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-multipass.svg" alt="Deploy to Multipass" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20OVHcloud.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-ovhcloud.svg" alt="Deploy to OVHcloud" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20IBM%20Cloud.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-ibm-cloud.svg" alt="Deploy to IBM Cloud" height="32"></a></td></tr>
  <tr><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Kubernetes.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-kubernetes.svg" alt="Deploy to Kubernetes" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20Oracle%20Cloud.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-oracle-cloud.svg" alt="Deploy to Oracle Cloud" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://claude.ai/new?q=Deploy%20the%20app%20I%20built%20with%20the%20TDK%20CLI%20to%20OpenTelekomCloud.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/deploy-opentelekomcloud.svg" alt="Deploy to OpenTelekomCloud" height="32"></a></td></tr>
</table>

</details>

### Build app with your AI agent

<table align="center">
  <tr><td align="center" valign="middle" width="33%"><a href="https://devin.ai"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/devin.svg" alt="Build app with Devin" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="codex://new?prompt=Build%20an%20app%20with%20the%20TDK%20CLI.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/codex.svg" alt="Build app with Codex" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="cursor://anysphere.cursor-deeplink/prompt?text=Build%20an%20app%20with%20the%20TDK%20CLI.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/cursor.svg" alt="Build app with Cursor" height="32"></a></td></tr>
  <tr><td align="center" valign="middle" width="33%"><a href="https://windsurf.com"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/windsurf.svg" alt="Build app with Windsurf" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="claude://code/new?q=Build%20an%20app%20with%20the%20TDK%20CLI.%20Read%20the%20setup%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-starter%20and%20walk%20me%20through%20it%20step%20by%20step."><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/claude-code.svg" alt="Build app with Claude Code" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://github.com/features/copilot"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/github-copilot.svg" alt="Build app with GitHub Copilot" height="32"></a></td></tr>
</table>

<details>
<summary>More agents (7)</summary>

<table align="center">
  <tr><td align="center" valign="middle" width="33%"><a href="https://zed.dev"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/zed.svg" alt="Build app with Zed" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://aider.chat/"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/aider.svg" alt="Build app with Aider" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://coder.com"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/coder.svg" alt="Build app with Coder" height="32"></a></td></tr>
  <tr><td align="center" valign="middle" width="33%"><a href="https://github.com/google-gemini/gemini-cli"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/gemini-cli.svg" alt="Build app with Gemini CLI" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://antigravity.google/"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/antigravity.svg" alt="Build app with Antigravity" height="32"></a></td><td align="center" valign="middle" width="33%"><a href="https://codeanywhere.com"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/codeanywhere.svg" alt="Build app with Codeanywhere" height="32"></a></td></tr>
  <tr><td align="center" valign="middle" width="33%"><a href="https://www.augmentcode.com"><img src="https://raw.githubusercontent.com/flisk-sh/tdk-cli-starter/main/.github/buttons/augment-code.svg" alt="Build app with Augment Code" height="32"></a></td></tr>
</table>

</details>

### ⚡ Zero-Config Local Stacks in About 14 Seconds
No vendor lock-in. No tedious plumbing. Run a single command to natively orchestrate **72 different integration tiers** including:
* **Runtimes & Frameworks:** Bun, Node, Python, Go, Rust, React, Vue, Svelte, Elysia, Fastify, NestJS
* **Databases & Tooling:** Prisma, Drizzle, Atlas, Dbmate
* **Messaging & Gateway:** NATS, Traefik

### 🤖 Run your AI agents next to your services

TDK is the local runtime for agent *systems*: the agent, its MCP tools, its database, its queue, behind one gateway, one command.

```bash
# Scaffold an agent, an MCP tools server, and a database in one stack
tdk resource bot --type agent --stack shop --yes
tdk resource tools-mcp --type mcp --stack shop --yes
tdk up shop
```

Agents get durable checkpoint volumes that survive `tdk down`, sticky session routing via `x-session-id`, graceful SIGTERM drain during hot reloads, a Docker health check on `/health`, and application-level readiness checks on `/ready`. See the [AI agents guide](docs/agents/ai-agents.md) and [honest comparison with agent frameworks](docs/compare-honest.md#ai-agent-frameworks-and-workflow-engines-libfx-langgraph-mastra-vercel-workflows-temporal).


TDK CLI — start services on your machine. It is not a deploy and not a Compose file: define each service in `service.json`, then run `tdk up`. No Kubernetes is needed on the machine.

Stability: 1.x local dev. Write `service.json`; TDK generates the local runtime files. See [what TDK writes](docs/generated-files.md) and how to check for drift. Core CLI is MIT and needs no key. Premium is optional.

Docker runs the containers. Tilt watches services and live-updates containers while you code. TDK CLI writes the configuration Tilt uses. Production deployment stays with Helm, Argo CD, or Kustomize.


> [!IMPORTANT]
> Get TDK from the [flisk-sh/tdk-cli-core](https://github.com/flisk-sh/tdk-cli-core) repository, the
> [`@tdk-landscape/tdk-cli-core`](https://www.npmjs.com/package/@tdk-landscape/tdk-cli-core) npm package, or the
> [official website](https://flisk.sh/). Follow the installation links from these official sources.
> A similar repository name or copied README does not establish that a download is official.

<p align="center"><strong><a href="#quick-start">Quick start</a> · <a href="#why-tdk-cli">Why TDK</a> · <a href="#examples">Examples</a> · <a href="#installation">Installation</a> · <a href="#faq">FAQ</a> · <a href="#docs">Documentation</a></strong></p>

If TDK helps you run your local stack, a ⭐ on [this repo](https://github.com/flisk-sh/tdk-cli-core) helps other developers find it.

`tdk ui` opens an interactive terminal dashboard for inspecting running services. Move with `↑/↓` or `j/k`, search with `/`, and press `1`–`5` to jump between tabs. See [docs/ui.md](docs/ui.md) for every key binding.

## Why TDK CLI?

- **One `service.json` per service.** TDK generates the Dockerfile, Traefik routing, and Tiltfile from it. You do not hand-write a `docker-compose.yml` or `nginx.conf`.
- **Local stack without Kubernetes.** Services run on Docker and Tilt on your machine. You do not need a local cluster such as kind or minikube.
- **Hot reload while you code.** Tilt live-updates the containers when files change.
- **Generated files you can check.** `tdk` records the generated files and reports drift, so local config stays in sync. See [generated files and drift checks](docs/generated-files.md).

| Capability | docker-compose | Local Kubernetes (kind, minikube) | Plain Tilt | TDK CLI |
| --- | --- | --- | --- | --- |
| Scaffold a new service in one command | No | No | No | Yes (`tdk resource`) |
| Hot reload on file change | Partial (`compose watch`) | Partial (extra tooling) | Yes | Yes |
| Health-checked startup order | Yes (`depends_on: condition: service_healthy`) | Yes | Manual configuration | Yes |
| Ingress routing and Postgres included | No | No | No | Yes (Traefik + Postgres) |
| Start only one stack of a large system | Partial (profiles) | Manual | Manual | Yes (`tdk up <stack>`) |

See the [detailed tool comparison](docs/comparison.md) for architectural tradeoffs, when each tool is the better choice, and migration workflows.

## How TDK works

1. **Describe each service** in a `service.json` next to its code.
2. **Run `tdk up <stack>`.** TDK generates the local runtime files from those manifests: Dockerfiles, Traefik routing, and the Tiltfile.
3. **Docker runs the containers and Tilt watches them.** Edit code and the containers live-update. Use `tdk ui` to inspect running services, and `tdk doctor` or `tdk config verify` to check the environment and generated files.

Production deployment stays with your own tools (Helm, Argo CD, or Kustomize).

## What you can do with TDK

| You want to | TDK does | Command |
| --- | --- | --- |
| Start a new project | Creates the project and first services | `tdk project --yes` |
| Add a service | Writes its `service.json` and generated files | `tdk resource <name> --type backend --stack <stack> --yes` |
| Start a whole stack | Starts Postgres, your services, and the routing, and prints the URLs | `tdk up <stack>` |
| Preview before starting | Shows which services and URLs would start, without containers | `tdk up <stack> --dry-run` |
| Inspect running services | Opens an interactive terminal dashboard | `tdk ui` |
| Check your machine | Reports Docker, Tilt, and port readiness | `tdk doctor` |
| Catch config drift | Compares generated files with what TDK last wrote | `tdk config verify` |
| Keep TDK current | Upgrades the CLI in place | `tdk upgrade` |

## Who uses TDK

Teams that run `tdk up` on their own code (listed with their consent in [ADOPTERS.md](ADOPTERS.md)):

- [Lekast](https://www.linkedin.com/company/lekast/), TDK 1.3.178
- [mfin.services](https://medium.com/@mfin.services), TDK 1.3.140
- [MakeOffer](https://www.linkedin.com/company/makeofferio), TDK 1.3.180
- [Red Moon Digital](https://redmoon.digital/), TDK 1.3.81

Using TDK too? [Tell us](https://github.com/flisk-sh/tdk-cli-core/issues/new?template=we-use-tdk.yml) or [add a row to ADOPTERS.md](ADOPTERS.md).

If TDK saves you time, a ⭐ on [this repo](https://github.com/flisk-sh/tdk-cli-core) helps other developers find it.

## Quick start

There are two ways to get started. Both end with `tdk up <stack>`.

| | Guided scaffolder | Core CLI (manual) |
| --- | --- | --- |
| Best for | A first run: pick your services and get a ready project | Full control, or adding TDK to an existing folder |
| Package | [`@tdk-landscape/create-microservices`](https://github.com/flisk-sh/create-microservices#readme) | [`@tdk-landscape/tdk-cli-core`](https://www.npmjs.com/package/@tdk-landscape/tdk-cli-core) (this repo) |

### Option A: guided scaffolder (recommended for beginners)

**Prerequisites.** Install these first. The scaffolder checks your machine while it creates the project and stops if something is missing:

- Node.js 22.12 or newer, and npm
- Docker, installed and running (Engine 25+, Compose 2.20.2+)
- [Tilt](https://docs.tilt.dev/install.html)
- [Bun](https://bun.sh/) 1.2+

Run these commands from the directory where you want the new project folder to be created. The target directory must be new or empty; existing files are never overwritten.

```bash
npm install -g @tdk-landscape/tdk-cli-core
npm init @tdk-landscape/microservices my-project
cd my-project
tdk up main
```

- `npm install -g @tdk-landscape/tdk-cli-core` installs the `tdk` command. Skip it if `tdk --version` already works.
- `npm init @tdk-landscape/microservices my-project` asks how many services to create, then each service's name and type (`backend`, `frontend`, `worker`, or `mcp`).
- `tdk up main` starts the stack. `main` is the default stack name; if you pass `--stack <name>` to the scaffolder, use that name instead. The scaffolder prints the exact `tdk up` command when it finishes.

The scaffolder creates the project configuration and a skeleton for each service you selected, using TDK CLI Core. It does not start any containers; `tdk up` does that.

To skip the prompts and get a default `api` (backend) and `web` (frontend):

```bash
npm init @tdk-landscape/microservices my-project -- --yes
```

For service types, all options, and non-interactive usage, see the [`@tdk-landscape/create-microservices` README](https://github.com/flisk-sh/create-microservices#readme).

> [!NOTE]
> Two similarly named packages exist. [`create-tdk-stack`](https://github.com/flisk-sh/create-tdk-stack) is a landing-page app and does not scaffold projects. [`@tdk-landscape/create-microservices`](https://github.com/flisk-sh/create-microservices#readme) is the project scaffolder used above.

### Option B: core CLI (manual)

Use this to create the project and each resource yourself with `tdk`. [Install the CLI](#installation) first. Preview what a stack will start before any container runs:

```bash
tdk up shop --dry-run
```

Then try the full flow:

```bash
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
curl http://api.shop.localhost/api/orders/health
```

`tdk up` prints the host ports it chose. It uses port 80 when it is free, so URLs carry no port. Otherwise it picks one from 8080-8180, and the URLs it prints include that port (on Linux and WSL2 a non-root user cannot check port 80, so the range is used there). Use the URL `tdk up` prints, or set `TDK_HTTP_PORT`. A resource named `orders-api` is served at `/api/orders` (a trailing `-api` is dropped); `tdk up` prints the exact URLs.

<p align="center">
<img src="docs/assets/demo.svg" alt="TDK scaffolding a backend and a frontend, then listing the stack" width="900" />
<br /><br />
<em>Scaffolding a backend and frontend, then listing the stack.</em>
</p>

### What TDK writes for a frontend

You maintain `service.json`; TDK generates the local runtime files. A frontend such as `services/store/storefront-web` has files like these after generation:

```text
services/store/storefront-web/
├── service.json                         # your service definition
└── .autogenerated/                     # TDK writes these files
    ├── nginx.autogenerated.conf        # serves the build and routes API requests
    ├── Dockerfile.app.autogenerated     # local app image
    ├── .env.frontend.autogenerated      # local frontend environment
    ├── vite.config.frontend.autogenerated.ts
    ├── tsconfig.autogenerated.json
    └── api-client.ts                    # generated API client
```

You do not need to write the nginx config, Dockerfile, or a `docker-compose.yml` for this local stack. `tdk up` uses Docker and Tilt to start it. The [generated-files guide](docs/generated-files.md) lists the other outputs and explains how regeneration and drift checks work.

<p align="center">
<img src="docs/assets/tdk-cli-top-9-uses.jpg" alt="Top 9 places to use TDK CLI" width="900" />
</p>

If Helm, Compose, or your existing Tilt setup already gives you a working local environment, keep using it. TDK CLI is for engineers managing several services who want a clear local service contract and one command to start the stack.

See [how TDK compares to alternative dev tools](docs/comparison.md), [how TDK CLI works alongside Helm](https://flisk.sh/docs/with-helm/), the [service schema](engine/schemas/service-schema.json), and the [project configuration schema](engine/schemas/project-schema.json).

## Terminal UI

Use `tdk ui` to inspect stacks and resources. Arrow keys or `j`/`k` move the
selection; `g`/`G` or Home/End jump to the first/last item, and PageUp/PageDown
move one visible page. `/` searches; navigation letters remain search text
while searching. The selected row stays visible when the terminal is resized.

## Update TDK

Keep TDK up to date to get the latest bug fixes:

```bash
tdk upgrade
```

`tdk update` is an alias for the same command. If you installed with npm, you can also run `npm install -g @tdk-landscape/tdk-cli-core@latest`. To pin a version or read what changed, see [upgrading and version pinning](docs/upgrading.md).

## Examples

Runnable examples show TDK on real stacks. Start with the smallest one:

| Example | What it shows |
| --- | --- |
| [one-backend](examples/one-backend/README.md) | One Bun/TypeScript backend with Postgres |
| [one-backend-python](examples/one-backend-python/README.md) | A Python backend in the same local stack |
| [one-backend-helm](examples/one-backend-helm/README.md) | Working alongside Helm |
| [byo](examples/byo/README.md) | Bringing your own existing resources |
| [byo-jobs](examples/byo-jobs/README.md) | Bring-your-own jobs |
| [tdk-example](examples/tdk-example/README.md) | A full multi-service stack |

## Use TDK with your AI agent

The repository ships agent skills for common TDK work, including `tdk-doctor` (environment checks) and `tdk-troubleshoot` (fixing `tdk` and Tilt errors), under [`.agents/skills`](.agents/skills). Agents working in this repo also follow [AGENTS.md](AGENTS.md). Use these skills to let your agent check your setup and explain failures instead of guessing at Docker or Tilt configuration.

## Installation

Install the CLI from npm (requires Node.js 22.12+) or use the prebuilt binary (no Node.js or Bun required):

```bash
npm install -g @tdk-landscape/tdk-cli-core
# or install the prebuilt binary
curl -fsSL https://flisk-sh.github.io/tdk-landscape.github.io/install.sh | sh
```

Public npm is the recommended default. To install through GitHub Packages instead, configure registry authentication as described in [GitHub Packages installation](docs/github-packages.md).

`tdk up shop --dry-run` previews selected local services and URLs before starting containers. The default starter is Bun/TypeScript; TDK's core role is running local containers through Docker + Tilt, not providing a Node.js application framework. See the [one-backend example](examples/one-backend/README.md).

## When not to use TDK

- Your existing Compose or Tilt workflow already gives you a working local environment.
- Helm is your whole development workflow and you do not want local services on Docker.
- You do not want `service.json` manifests and generated local configuration.

## Troubleshooting
Set `TDK_DEBUG=1` before running `tdk up --verbose` to include Starlark debug logs in Tilt output.

## Docs

- [CLI command cheat sheet](cli/README.md#cheat-sheet)
- [Mega cheat sheet: every command and flag](docs/cheat-sheet.md)
- [Documentation index](docs/README.md)
- [Pilot TDK on a real repository](docs/adopt-tdk.md)
- [Running AI agents in TDK](docs/agents/ai-agents.md)
- [FAQ for agencies and multi-client teams](docs/faq-teams.md)
- [Working alongside Helm](docs/with-helm.md)
- [Scope: local development, and what does not carry over to production](docs/scope.md)
- [Gradual adoption: adding TDK to an existing repository](docs/gradual-adoption.md)
- [Troubleshooting: tdk and Tilt error messages and their fixes](docs/troubleshooting.md)
- [Layout and ownership: services in several repositories](docs/layout.md)
- [Local data: reset, seed, snapshot](docs/data.md)
- [Upgrading and version pinning](docs/upgrading.md)
- [Security: network calls, secrets and supply chain](docs/security.md)
- [Pilot scorecard](docs/pilot-scorecard.md)
- [Bring-your-own resources](docs/byo.md)
- [Configuration and editor schemas](docs/configuration.md)
- [Generated service files and drift checks](docs/generated-files.md)
- [Runnable one-backend example](examples/one-backend/README.md)
- [Runnable Python backend example](examples/one-backend-python/README.md)
- [Full multi-service example](examples/tdk-example/README.md)
- [Features and license limits](docs/FEATURES.md)
- [Tool comparison: docker-compose, Tilt, Skaffold, DevSpace, kind](docs/comparison.md)
- [Honest comparison and known limits](docs/compare-honest.md)
- [Public claims registry](docs/claims.md)
- [Show HN draft](docs/drafts/show-hn.md)
- [Architecture and repository map](docs/project-overview.md)
- [Scale fixture measurements and caveats](docs/benchmarks/scale-bench.md)
- [Benchmark report: warm and cold start charts, history](https://flisk-sh.github.io/tdk-cli-core/) (updated on every change to `main` that affects start-up)
- [How to run the start-time benchmark](scripts/benchmark/README.md#tdk-up-warm-start-benchmark)

## History

TDK development began on 21 April 2026. The archived, read-only [flisk-sh/tdk](https://github.com/flisk-sh/tdk)
repository records its [first commit](https://github.com/flisk-sh/tdk/commit/1714637637196ed54cbfa18534230a782c05ab36)
("Initial commit: TDK specs, generators, CLI, and standards") from that day. A separate `tdk-cli` history spanning 21 April to
18 September 2026 was [imported into this repository](https://github.com/flisk-sh/tdk-cli-core/pull/670) as 306 filtered
commits. Those commits are now ancestors of `main`; the import did not change the source tree.

This `tdk-cli-core` repository was created on 19 September 2026, and the `@tdk-landscape/tdk-cli-core` npm package was first
published on 21 September 2026. Those dates describe the current repository and package, not the start of TDK development.

## Requirements and support

For the local runtime, install Docker (Desktop, OrbStack, or Colima; Engine 25+, Compose 2.20.2+) and [Tilt](https://docs.tilt.dev/install.html). Bun 1.2+ is used by the default generated services. TDK selects host ports from bounded fallback ranges for HTTP, HTTPS, and Postgres; set `TDK_HTTP_PORT`, `TDK_HTTPS_PORT`, or `TDK_POSTGRES_PORT` to override them. Dev ports listen on `127.0.0.1` only, so other machines on your network cannot reach them. Set `TDK_BIND_ADDRESS` (for example `0.0.0.0`, to test from a phone) to change that; `tdk doctor` warns when it is a wildcard address. TDK supports macOS, Linux, and Windows through WSL2 Ubuntu; native Windows supports CLI inspection only. Run `tdk doctor` to check local readiness (supports `--no-ping` to skip service health checks and `--ping-timeout <ms>`). See [WSL2 setup](docs/wsl2.md).

On native Windows, `tdk --version`, `tdk doctor`, and `tdk up --dry-run` are inspect-only commands. `tdk up` exits 1 with “Landscape startup needs Ubuntu on WSL2. Native Windows is inspect-only.”

## License matrix

| Capability | Free | Premium |
| --- | --- | --- |
| `tdk up`, scaffold, Traefik, Postgres, Tilt live update, golden layers | yes | yes |
| Verdaccio, DDD scaffold, Sablier idle stop | no | key |
| Playwright, C4, AGENTS.md | free if generated in-repo | only if the implementation is downloaded with a key |

Core stays free. Premium is a separate key for the extras above; no key required to run `tdk up`.

**Ecosystem map:** examples, articles, related tools, and notes live in [awesome-tdk-framework](https://github.com/flisk-sh/awesome-tdk-framework). Star this repo (`tdk-cli-core`) if the CLI is what you run; use the awesome list to browse the rest.

<p align="center">

**Share:** [X](https://twitter.com/intent/tweet?text=I%20just%20used%20TDK%20CLI%20to%20start%20my%20local%20services%20with%20one%20command%2C%20and%20it%27s%20great%21%20It%27s%20free%20and%20open%20source.%20Check%20it%20out%3A&url=https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-core) · [Bluesky](https://bsky.app/intent/compose?text=I%20just%20used%20TDK%20CLI%20to%20start%20my%20local%20services%20with%20one%20command%2C%20and%20it%27s%20great%21%20It%27s%20free%20and%20open%20source.%20Check%20it%20out%3A%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-core) · [Threads](https://www.threads.net/intent/post?text=I%20just%20used%20TDK%20CLI%20to%20start%20my%20local%20services%20with%20one%20command%2C%20and%20it%27s%20great%21%20It%27s%20free%20and%20open%20source.%20Check%20it%20out%3A%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-core) · [Mastodon](https://mastodon.social/share?text=I%20just%20used%20TDK%20CLI%20to%20start%20my%20local%20services%20with%20one%20command%2C%20and%20it%27s%20great%21%20It%27s%20free%20and%20open%20source.%20Check%20it%20out%3A%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-core) · [Reddit](https://www.reddit.com/submit?title=TDK%20CLI%3A%20start%20local%20services%20with%20one%20command&url=https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-core) · [Hacker News](https://news.ycombinator.com/submitlink?u=https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-core&t=TDK%20CLI%3A%20start%20local%20services%20with%20one%20command) · [Facebook](https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-core) · [LinkedIn](https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-core&mini=true&title=TDK%20CLI%3A%20start%20local%20services%20with%20one%20command&summary=I%20just%20used%20TDK%20CLI%20to%20start%20my%20local%20services%20with%20one%20command%2C%20and%20it%27s%20great%21%20It%27s%20free%20and%20open%20source.) · [Telegram](https://t.me/share/url?url=https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-core&text=I%20just%20used%20TDK%20CLI%20to%20start%20my%20local%20services%20with%20one%20command%2C%20and%20it%27s%20great%21%20It%27s%20free%20and%20open%20source.%20Check%20it%20out%3A) · [WhatsApp](https://wa.me/?text=I%20just%20used%20TDK%20CLI%20to%20start%20my%20local%20services%20with%20one%20command%2C%20and%20it%27s%20great%21%20It%27s%20free%20and%20open%20source.%20Check%20it%20out%3A%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-core) · [Email](mailto:?subject=TDK%20CLI%3A%20start%20local%20services%20with%20one%20command&body=I%20just%20used%20TDK%20CLI%20to%20start%20my%20local%20services%20with%20one%20command%2C%20and%20it%27s%20great%21%20It%27s%20free%20and%20open%20source.%20Check%20it%20out%3A%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Ftdk-cli-core)

</p>

## FAQ

<details>
<summary><strong>Do I need Kubernetes?</strong></summary>

No. TDK runs your services with Docker and Tilt on your machine. It does not need a local cluster such as kind or minikube, and it does not replace Helm, Compose, or your production deployment tools.

</details>

<details>
<summary><strong>Do I need a license key?</strong></summary>

No. Core CLI is MIT and needs no key to run `tdk up`. Premium extras are optional and use a separate key (see the [license matrix](#license-matrix)).

</details>

<details>
<summary><strong>Which platforms are supported?</strong></summary>

macOS and Linux are supported directly. Windows is supported through WSL2 Ubuntu; native Windows supports CLI inspection only (`tdk --version`, `tdk doctor`, and `tdk up --dry-run`). See [Requirements and support](#requirements-and-support) and [WSL2 setup](docs/wsl2.md).

</details>

<details>
<summary><strong>Does TDK send my code anywhere?</strong></summary>

TDK runs the local stack on your machine. For network calls, secrets, and supply-chain details, see [security: network calls, secrets and supply chain](docs/security.md).

</details>

<details>
<summary><strong>Can I keep using Compose, Helm, or my own Tilt setup?</strong></summary>

Yes. If your existing setup already gives you a working local environment, keep using it. See [working alongside Helm](docs/with-helm.md) and [gradual adoption](docs/gradual-adoption.md) for adding TDK to an existing repository.

</details>

<details>
<summary><strong>What should I do if I hit a bug?</strong></summary>

Update first; a recent release may already fix it. Run `tdk upgrade` (also available as `tdk update`), or:

```bash
npm install -g @tdk-landscape/tdk-cli-core@latest
```

Then run `tdk doctor` and retry the same task. If the problem persists, [open an issue](https://github.com/flisk-sh/tdk-cli-core/issues) with your TDK version, operating system, steps to reproduce, and the error output. See [upgrading and version pinning](docs/upgrading.md) and [troubleshooting](docs/troubleshooting.md).

</details>

## Contributing and license

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [contributor guide](docs/contributing/README.md). For the project structure, see the [architecture and repository map](docs/project-overview.md). To review pull requests, see [Review a pull request](docs/contributing/04-review-a-pr.md). Report security issues using [SECURITY.md](SECURITY.md).

TDK is MIT-licensed; see [LICENSE](LICENSE). The [license boundary](GOVERNANCE.md#license-boundary-and-donation-scope) says which code is MIT and which is downloaded with a key.

Project governance: [GOVERNANCE.md](GOVERNANCE.md), [MAINTAINERS.md](MAINTAINERS.md), [ADOPTERS.md](ADOPTERS.md).
