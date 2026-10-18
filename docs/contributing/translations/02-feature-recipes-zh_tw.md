# 2. 依照改動類型的指南操作

> 本頁是 [02-feature-recipes.md](../02-feature-recipes.md) 的翻譯。如有差異，以英文版為準。

這些指南只是起點。如果找不到某個檔案，請在儲存庫中搜尋指令、設定鍵或產生的檔名，並在 issue 中提問。

## 修改 CLI 指令

1. 在 `cli/src/commands/` 下找到該指令。
2. 在 `cli/src/commands/__tests__/` 下或其原始檔旁邊尋找它的測試。
3. 做最小的改動，修正問題或新增選項。
4. 如果指令或其選項對使用者可見，更新 `cli/README.md`。
5. 在儲存庫根目錄執行 `bun run typecheck`、`bun run lint` 和 `bun run test`。

對於前端框架，請遵循專門的[前端 provider 指南](../../frontend-framework-providers.md)。它說明了 React/Vue provider 的邊界、引擎範本、相容性檢查和 PR 清單。

## 新增資料庫或基礎設施工具

先確定你要新增的是什麼：

- **服務使用的資料庫**可能會影響服務 manifest、資料庫 URL 產生、遷移設定和就緒檢查。
- **共用的本機工具**（例如 Redis 或 NATS）可能會影響選用功能設定、產生的 Compose 檔案、Tilt 資源註冊、相依套件和健康檢查。

把現有程式碼當作地圖來使用：

1. 從 `engine/topologies/tilt/resources/infra-loader.star` 開始，了解共用基礎設施如何被載入和註冊。
2. 查看 `engine/topologies/tilt/resources/databases.star` 中的資料庫生命週期範例，以及 `engine/topologies/platform/docker/compose/` 中的 Compose 產生程式碼。
3. 找到相關的功能或 manifest 設定，並沿著它找到驗證和啟用的位置。用 `rg` 搜尋設定名稱。
4. 追蹤完整的生命週期：設定、產生的檔案、啟動順序、健康/就緒狀態、環境變數或機密、關閉與清理，以及工具被停用時會發生什麼事。
5. 為你修改的行為新增檢查。CLI 和 Starlark 產生器的測試位於 `cli/src/commands/__tests__/`，Python 引擎測試位於 `tests/tilt-engine/`。
6. 更新面向使用者的功能或 CLI 文件，例如 `docs/FEATURES.md` 或 `cli/README.md`。

不要假設新工具需要上面所有檔案。請遵循與你的功能最接近的現有實作，並確保共用服務的行為仍然正常。

## 不使用 Docker 試用 Starlark 改動

只要安裝了 Tilt，就可以執行任何引擎函式並查看其輸出。在儲存庫根目錄建立 `try.Tiltfile`（此檔案會被 git 忽略）：

```python
load("engine/topologies/platform/docker/compose/compose.star", "generate_backend_compose_entry")

manifest = {"appType": "backend", "stack": "shop", "port": 4000, "appName": "orders-api"}
resource = {"name": "orders-api", "_resource_path": "services/shop/orders-api"}
manifest["_resource_path"] = resource["_resource_path"]

entry = generate_backend_compose_entry("services/shop", "orders-api", resource, manifest)
fail("OUTPUT\n" + entry)  # fail() 是 Tiltfile 在不使用 Docker 的情況下印出字串的方式
```

```bash
tilt alpha tiltfile-result -f try.Tiltfile
```

產生的 Compose 項目會在 `Error in fail: OUTPUT` 之後印出。`load()` 中的路徑是相對於 Tiltfile 的，因此請將它放在儲存庫根目錄。修改 manifest、再次執行並比較結果。`cli/src/commands/__tests__/` 中的 Starlark 測試（例如 `stack-routers.test.ts`）也是以同樣的方式檢查產生器輸出的；新增測試時可以複製其中一個。

## 修改引擎或服務探索

1. 對於 Tilt 資源編排，從 `engine/topologies/tilt/resources/` 開始。
2. 對於 Docker、網路或持久化狀態，從 `engine/topologies/platform/` 開始。
3. 對於 manifest 掃描和相依圖，從 `discovery/` 開始。
4. 搜尋受影響的輸出檔案或 manifest 欄位，找到其產生器和測試。CLI 測試包含 Starlark 產生器檢查。
5. 檢查現有的 manifest 和產生的專案是否仍能正常運作。行為改變時，更新 schema、範例或 CLI 文件。
6. 如果改動涉及契約或多個模組，請先撰寫 [OpenSpec 提案](01-first-change-zh_tw.md#何時撰寫變更提案)。

`engine/AGENTS.md` 以及其他 `AGENTS.md` 檔案是給代理程式的工作筆記。它們有助於解釋本機程式碼，但在將其作為產品文件使用之前，請先對照目前的原始碼和測試檢查其路徑和建議。

## 修改文件

1. 找到最接近的現有頁面並更新它，而不是另建一份副本。
2. 使用簡短的標題、編號步驟和可直接複製的指令。
3. 檢查你所編輯檔案中的相對連結。
4. 只執行相關的檢查。對於僅涉及文件的改動，檢查你修改過的連結和指令即可，無需執行 CLI 測試套件。
