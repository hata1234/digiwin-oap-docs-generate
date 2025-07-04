# ERP 文檔自動生成工具

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/hata1234/digiwin-oap-docs-generate)
[![Node](https://img.shields.io/badge/node-%3E%3D%2016.0.0-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.3.3-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-ISC-green.svg)](LICENSE)

## 📋 目錄

- [概述](#概述)
- [核心特點](#核心特點)
- [快速開始](#快速開始)
- [環境設置](#環境設置)
- [功能詳解](#功能詳解)
  - [資料庫探索](#資料庫探索)
  - [文檔生成](#文檔生成)
  - [批次處理](#批次處理)
  - [Excel 整合](#excel-整合)
- [命令參考](#命令參考)
- [技術架構](#技術架構)
- [工作流程範例](#工作流程範例)
- [故障排除](#故障排除)
- [版本歷史](#版本歷史)
- [貢獻指南](#貢獻指南)

## 概述

本專案由AI生成，旨在透過鼎新資料庫的OAPMB表以及顧問題供之的Excel文檔，自動生成ERP API欄位文檔。產生的API文檔方便語言模型快速理解API的各項規則，並且能夠快速生成API文檔。

### 🌟 主要功能
ERP 文檔自動生成工具是一個完全獨立的 TypeScript CLI 工具，專門用於自動生成 ERP API 欄位文檔。此工具直接連接 SQL Server 資料庫，基於 OAPMB 表的實際查詢結果生成文檔，確保所有資料的真實性和準確性。

###  🚀注意事項
本文件不包含生成認證規則及連接方式說明，目的只是讓煩雜的excel文件簡化，讓語言模型讀取時節省Token而已，如有vkey及vsign加密規則或是API連線問題，請與您的顧問聯系。

### 🎯 設計理念

- **防止 AI 幻覺**：所有資料直接來自資料庫查詢，絕不使用硬編碼或假設的資料
- **完全獨立**：不依賴主專案的任何組件，可單獨部署和使用
- **批次處理**：支援 101 個操作代碼的自動化處理，大幅提升效率
- **智能合併**：自動分析並合併 Excel 文檔，減少人工作業

## 核心特點

### ✅ 基礎功能
- 直接連接 SQL Server，使用標準 `mssql` 套件
- 完整的資料庫探索功能，了解資料結構
- 多格式文檔生成（README、JSON、Markdown、TypeScript 介面）
- 支援批次處理和並行執行

### 🆕 進階功能
- **Excel 文檔智能合併**：自動分析差異並合併
- **批次分析合併**：一次處理所有 101 個操作代碼
- **方法特定文檔**：自動生成 create.md、query.md、update.md 等
- **未知欄位處理**：完整記錄 MB003-MB033 欄位的值對照
- **衝突分析報告**：智能評估風險等級，提供處理建議

### 📊 統計數據
- **操作代碼總數**：101 個
- **每個操作生成檔案**：10 個（包含 unknown-field-values.md）
- **平均生成時間**：約 2 秒/操作
- **批次處理總時間**：約 3-4 分鐘
- **自動合併成功率**：約 60-70%

## 快速開始

### 1. 克隆或複製工具

```bash
# 如果是獨立 repository
git clone https://github.com/hata1234/digiwin-oap-docs-generate.git
cd digiwin-oap-docs-generate

# 如果從現有專案複製
cp -r /opt/apiserv/tools/digiwin-oap-docs-generate /your/new/location
cd /your/new/location/digiwin-oap-docs-generate
```

### 2. 安裝依賴

```bash
npm install
```

### 3. 配置環境

```bash
# 複製環境變數範例
cp .env.example .env

# 編輯配置檔案
nano .env
```

### 4. 測試連接

```bash
npm run dev test
```

### 5. 生成第一個文檔

```bash
npm run generate -- --operation ACPI02
```

## 環境設置

### 必要的環境變數

創建 `.env` 檔案並配置以下變數：

```env
# SQL Server 連接設定
DB_SERVER=your_server_address
DB_PORT=1433
DB_DATABASE=your_database_name
DB_USERNAME=your_username
DB_PASSWORD=your_password

# 連接選項
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true

# 查詢和輸出設定
DEFAULT_BATCH_SIZE=50
MAX_BATCH_SIZE=500
DEFAULT_OUTPUT_DIR=./output

# Excel 檔案路徑（如果使用 Excel 整合功能）
EXCEL_SOURCE_DIR=/path/to/GP40
```

### 系統需求

- Node.js >= 16.0.0
- npm >= 7.0.0
- SQL Server 2016 或更高版本
- 至少 1GB 可用記憶體
- 約 100MB 磁碟空間（用於輸出檔案）

## 功能詳解

### 資料庫探索

探索功能讓您在生成文檔前了解資料結構：

#### 1. 測試資料庫連接
```bash
npm run dev test
```
確認資料庫連接正常，顯示連接資訊。

#### 2. 查看 OAPMB 表結構
```bash
npm run explore table
```
顯示完整的表結構，包含所有欄位名稱、資料型別、允許 NULL 等資訊。

#### 3. 列出所有操作代碼
```bash
npm run explore operations
```
輸出範例：
```
╔════════════╦════════╗
║ 操作代碼   ║ 記錄數 ║
╠════════════╬════════╣
║ ACPI02     ║ 256    ║
║ ACPI03     ║ 189    ║
║ INVI01     ║ 342    ║
╚════════════╩════════╝
共 101 個操作代碼
```

#### 4. 分析 MB 欄位使用情況
```bash
npm run explore mb-fields
```
顯示 MB001-MB033 欄位的使用統計，幫助了解哪些欄位包含資料。

#### 5. 查看特定操作的範例資料
```bash
npm run explore operation ACPI02
npm run explore operation ACPI02 --limit 10
```
顯示指定操作代碼的實際資料範例。

### 文檔生成

生成功能將資料庫資料轉換為結構化文檔：

#### 基本生成命令
```bash
# 生成基本文檔（README + JSON）
npm run generate -- --operation ACPI02

# 生成所有格式文檔
npm run generate -- --operation ACPI02 --format all

# 指定特定格式
npm run generate -- --operation ACPI02 --format readme,json,field-mapping

# 自訂輸出目錄
npm run generate -- --operation ACPI02 --output ./my-docs

# 顯示詳細輸出
npm run generate -- --operation ACPI02 --verbose
```

#### 生成的文檔類型

1. **README.md**
   - 完整的欄位說明文檔
   - 按資料表分組的欄位列表
   - 必填欄位清單和資料格式規範
   - API 呼叫範例

2. **field-data.json**
   - 結構化的欄位資料
   - 欄位映射和統計資訊
   - 驗證規則和 TypeScript 介面參考

3. **all-fields.md**
   - 完整的欄位資料表格
   - 包含所有欄位的詳細資訊
   - 適合開發者查詢

4. **field-mapping.md**
   - API 欄位 ↔ 資料庫欄位對照表
   - TypeScript 介面定義
   - 程式開發參考

5. **quick-reference.md**
   - 快速參考指南
   - 必填欄位、日期欄位、數值欄位分類
   - 常見錯誤和注意事項

6. **unknown-field-values.md**
   - MB003-MB033 未知欄位的值對照表
   - 幫助理解欄位用途和可能的值

### 批次處理

批次處理功能讓您一次處理所有操作代碼：

#### 批次生成所有文檔
```bash
# 為所有 101 個操作代碼生成文檔
npm run generate-all

# 預覽模式（不實際生成）
./scripts/generate-all.sh -d

# 只生成特定操作代碼
./scripts/generate-all.sh ACPI02 ACPI03

# 顯示詳細輸出
./scripts/generate-all.sh -v

# 指定輸出目錄和格式
./scripts/generate-all.sh -o ./my-docs -f readme,json
```

#### 列出所有操作代碼
```bash
# 快速列出（簡單格式）
npm run list-operations

# 表格格式
./scripts/list-operations.sh

# JSON 格式
./scripts/list-operations.sh -f json

# CSV 格式
./scripts/list-operations.sh -f csv

# 過濾特定模式
./scripts/list-operations.sh -F '^ACP'

# 按記錄數排序
./scripts/list-operations.sh -s count
```

### Excel 整合

Excel 整合功能讓您合併官方 Excel 文檔的內容：

#### 掃描 Excel 檔案
```bash
# 查看所有可用的 Excel 檔案
npm run import-excel scan
```

#### 分析單一操作
```bash
# 分析 Excel 與資料庫文檔的差異
npm run import-excel analyze ACPI02

# 顯示詳細衝突資訊
npm run import-excel analyze ACPI02 --detailed
```

#### 合併單一操作
```bash
# 合併 Excel 內容到現有文檔
npm run import-excel merge ACPI02

# 強制合併（忽略衝突）
npm run import-excel merge ACPI02 --force
```

#### 批次分析合併
```bash
# 預覽模式 - 分析所有操作但不執行合併
npm run analyze-merge-all -- -d

# 執行批次合併 - 自動合併無衝突項目
npm run analyze-merge-all

# 只處理有衝突的操作
npm run analyze-merge-all -- -c

# 設定並行任務數（預設 4）
npm run analyze-merge-all -- -j 8

# 調整自動合併閾值（預設 0.8）
npm run analyze-merge-all -- -t 0.9
```

#### 衝突類型說明

- **🟢 低風險**（通常可自動合併）
  - 說明文字差異
  - 範例值更新
  - 備註資訊

- **🟡 中風險**（建議人工確認）
  - 必填狀態變更
  - 驗證規則變更
  - 預設值變更

- **🔴 高風險**（必須人工處理）
  - 資料型態衝突
  - 欄位映射衝突
  - 結構性變更

## 命令參考

### 主要命令

| 命令 | 說明 | 範例 |
|------|------|------|
| `npm run dev test` | 測試資料庫連接 | `npm run dev test` |
| `npm run explore` | 探索資料庫結構 | `npm run explore operations` |
| `npm run generate` | 生成文檔 | `npm run generate -- --operation ACPI02` |
| `npm run generate-all` | 批次生成所有文檔 | `npm run generate-all` |
| `npm run import-excel` | Excel 文檔操作 | `npm run import-excel analyze ACPI02` |
| `npm run analyze-merge-all` | 批次分析合併 | `npm run analyze-merge-all -- -d` |
| `npm run list-operations` | 列出所有操作代碼 | `npm run list-operations` |

### 參數說明

#### explore 命令參數
- `table` - 顯示表結構
- `operations` - 列出操作代碼
- `mb-fields` - 分析 MB 欄位
- `operation <code>` - 查看特定操作
  - `--limit <n>` - 限制顯示筆數

#### generate 命令參數
- `--operation <code>` - 操作代碼（必填）
- `--output <path>` - 輸出目錄
- `--format <types>` - 文檔格式
- `--verbose` - 詳細輸出

#### import-excel 命令參數
- `scan` - 掃描 Excel 檔案
- `analyze <code>` - 分析差異
  - `--detailed` - 詳細分析
- `merge <code>` - 合併文檔
  - `--force` - 強制合併

## 技術架構

### 核心技術堆疊
- **語言**：TypeScript 5.3.3
- **執行環境**：Node.js >= 16.0.0
- **資料庫**：SQL Server (使用 mssql 套件)
- **CLI 框架**：Commander.js
- **UI 套件**：chalk (彩色輸出)、ora (進度條)
- **Excel 處理**：xlsx

### 專案結構
```
digiwin-oap-docs-generate/
├── src/
│   ├── index.ts                    # CLI 入口點
│   ├── config/
│   │   └── database.ts            # 資料庫配置
│   ├── services/
│   │   ├── database.service.ts    # 資料庫連接服務
│   │   ├── explorer.service.ts    # 資料探索服務
│   │   ├── excel-import.service.ts # Excel 匯入服務
│   │   ├── merge.service.ts       # 合併服務
│   │   └── batch-merge-analyzer.service.ts # 批次分析服務
│   ├── generators/
│   │   ├── readme.generator.ts    # README 生成器
│   │   ├── json.generator.ts      # JSON 生成器
│   │   ├── markdown.generator.ts  # Markdown 生成器
│   │   ├── method-document.generator.ts # 方法文檔生成器
│   │   ├── excel-merge.generator.ts # Excel 合併生成器
│   │   └── conflict-report.generator.ts # 衝突報告生成器
│   └── types/
│       └── index.ts              # TypeScript 型別定義
├── scripts/
│   ├── generate-all.sh           # 批次生成腳本
│   ├── list-operations.sh        # 列出操作腳本
│   └── analyze-and-merge-all.sh  # 批次分析合併腳本
├── docs/
│   └── BATCH-MERGE-GUIDE.md      # 批次合併指南
└── merge-reports/                # 合併報告輸出目錄
```

### 設計原則

1. **資料真實性**
   - 所有資料直接來自資料庫查詢
   - 使用參數化查詢防止 SQL 注入
   - 字串修整 (RTRIM) 處理空白字元

2. **錯誤處理**
   - 完整的錯誤捕獲和報告
   - 批次處理時單個失敗不影響其他
   - 詳細的錯誤日誌記錄

3. **效能優化**
   - 分批查詢處理大量資料
   - 並行處理提升批次效率
   - 智能快取減少重複查詢

## 工作流程範例

### 完整的文檔生成流程

```bash
# 1. 測試環境
npm run dev test

# 2. 探索資料結構
npm run explore operations
npm run explore operation ACPI02 --limit 5

# 3. 生成單個文檔
npm run generate -- --operation ACPI02 --format all

# 4. 檢查 Excel 檔案
npm run import-excel scan

# 5. 分析差異
npm run import-excel analyze ACPI02

# 6. 合併文檔
npm run import-excel merge ACPI02

# 7. 批次處理所有操作
npm run analyze-merge-all -- -d  # 預覽
npm run analyze-merge-all        # 執行
```

### 定期維護流程

```bash
# 每週五執行
#!/bin/bash
DATE=$(date +%Y%m%d)
LOG_FILE="weekly-update-${DATE}.log"

# 1. 備份現有文檔
cp -r ./output ./output.backup.${DATE}

# 2. 執行批次分析
npm run analyze-merge-all -- -d > ${LOG_FILE}

# 3. 檢查結果
grep "需人工審核" ${LOG_FILE}

# 4. 執行合併
npm run analyze-merge-all

# 5. 提交變更
git add -A
git commit -m "Weekly documentation update ${DATE}"
```

## 故障排除

### 常見問題

#### 1. 資料庫連接失敗
```
錯誤：ConnectionError: Failed to connect to server
```
**解決方案**：
- 檢查 `.env` 中的 `DB_SERVER` 和 `DB_PORT`
- 確認 SQL Server 允許遠端連接
- 檢查防火牆設定
- 確認帳號密碼正確

#### 2. OAPMB 表不存在
```
錯誤：Invalid object name 'OAPMB'
```
**解決方案**：
- 確認資料庫名稱正確
- 檢查表名稱大小寫
- 確認帳號有讀取權限

#### 3. 批次生成中斷
```
錯誤：腳本只處理第一個操作就結束
```
**解決方案**：
- 已在 v1.0.3 修復
- 更新到最新版本
- 使用新版腳本（移除了 set -e）

#### 4. Excel 檔案找不到
```
錯誤：找不到對應的 Excel 檔案
```
**解決方案**：
- 檢查 `EXCEL_SOURCE_DIR` 設定
- 確認檔案命名規則正確
- 執行 `npm run import-excel scan` 查看可用檔案

#### 5. 記憶體不足
```
錯誤：JavaScript heap out of memory
```
**解決方案**：
```bash
# 增加 Node.js 記憶體限制
export NODE_OPTIONS="--max-old-space-size=4096"
npm run generate-all
```

### 除錯技巧

1. **啟用詳細輸出**
   ```bash
   npm run generate -- --operation ACPI02 --verbose
   ```

2. **檢查 SQL 查詢**
   ```bash
   # 在 .env 中啟用
   DEBUG_SQL=true
   ```

3. **查看錯誤日誌**
   ```bash
   # 批次處理錯誤
   cat merge-reports/latest/errors/*.log
   ```

## 版本歷史

### v2.0.0 (2025-07-04)
- 🆕 新增 Excel 文檔智能合併功能
- 🆕 新增批次分析合併功能
- 🆕 新增方法特定文檔生成
- 🆕 新增未知欄位值對照表
- 🔧 完全重構，解決 MCP 依賴問題
- 🔧 改用標準 mssql 套件
- 📊 支援 101 個操作代碼

### v1.0.3 (2025-07-04)
- 🐛 修復批次生成腳本中斷問題
- 🔧 移除 set -e，改進錯誤處理
- ⚡ 優化批次處理效能

### v1.0.0 (2025-07-03)
- 🎉 初始版本發布
- ✅ 基本的探索和生成功能
- ✅ 支援多格式輸出

## 貢獻指南

### 開發環境設置

```bash
# 克隆專案
git clone https://github.com/hata1234/digiwin-oap-docs-generate.git
cd digiwin-oap-docs-generate

# 安裝依賴
npm install

# 建立分支
git checkout -b feature/your-feature
```

### 提交規範

使用語義化提交訊息：
- `feat:` 新功能
- `fix:` 錯誤修復
- `docs:` 文檔更新
- `refactor:` 程式碼重構
- `test:` 測試相關
- `chore:` 維護性工作

### 測試

```bash
# 執行單元測試
npm test

# 執行整合測試
npm run test:integration

# 測試覆蓋率
npm run test:coverage
```

### Pull Request 流程

1. Fork 專案
2. 建立功能分支
3. 提交變更
4. 推送到你的 Fork
5. 建立 Pull Request

## 授權

本專案採用 ISC 授權條款。詳見 [LICENSE](LICENSE) 檔案。

## 支援

如遇到問題，請：
1. 查看[故障排除](#故障排除)章節
2. 搜尋現有的 [Issues](https://github.com/hata1234/digiwin-oap-docs-generate/issues)
3. 建立新的 Issue，提供：
   - 錯誤訊息
   - 重現步驟
   - 環境資訊（Node.js 版本、OS 等）

---

🚀 **ERP 文檔自動生成工具** - 讓文檔維護變得簡單高效！