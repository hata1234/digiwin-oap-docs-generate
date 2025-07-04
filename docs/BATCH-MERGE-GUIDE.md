# 批次分析合併指南

## 概述

批次分析合併工具能夠自動分析所有 ERP 操作代碼，智能決定哪些可以自動合併，哪些需要人工審核，大幅提升文檔更新效率。

## 功能特點

### 🤖 智能分析
- 自動掃描所有 101 個操作代碼
- 分析 Excel 檔案與資料庫文檔的差異
- 根據衝突類型和數量評估風險等級
- 提供明確的處理建議

### 🚀 自動化處理
- 無衝突項目自動合併
- 低風險衝突（如說明文字）可選擇性自動合併
- 高風險衝突生成詳細報告供人工審核
- 支援並行處理提升效率

### 📊 完整報告
- 批次處理總報告
- 個別操作的合併日誌
- 詳細的衝突分析報告
- 跳過項目的原因說明

## 使用方式

### 基本使用

```bash
# 進入工具目錄
cd /opt/apiserv/tools/digiwin-oap-docs-generate

# 執行批次分析合併
npm run analyze-merge-all
```

### 進階選項

```bash
# 預覽模式（只分析不執行）
npm run analyze-merge-all -- -d

# 只處理有衝突的操作
npm run analyze-merge-all -- -c

# 設定並行任務數（預設 4）
npm run analyze-merge-all -- -j 8

# 調整自動合併閾值（預設 0.8）
npm run analyze-merge-all -- -t 0.9

# 處理特定操作
npm run analyze-merge-all -- ACPI02 ACPI03

# 顯示詳細輸出
npm run analyze-merge-all -- -v
```

### 單一操作分析

```bash
# 分析特定操作
npm run import-excel analyze ACPI02

# 顯示詳細衝突資訊
npm run import-excel analyze ACPI02 --detailed
```

## 工作流程

### 1. 執行批次分析
```bash
npm run analyze-merge-all -d  # 先用預覽模式查看
```

### 2. 檢視分析結果
批次處理完成後，檢視報告目錄：
```bash
cd merge-reports/latest
ls -la
```

報告結構：
```
merge-reports/latest/
├── batch-summary.md           # 總報告
├── auto-merged/               # 自動合併的操作
│   └── {operation}-merge-log.md
├── conflicts/                 # 需人工審核的衝突
│   └── {operation}-conflict-report.md
└── skipped/                   # 跳過的操作
    └── {operation}-skip-reason.md
```

### 3. 處理衝突
檢視衝突報告並決定處理方式：
```bash
# 查看特定操作的衝突
cat conflicts/ACPI02-conflict-report.md

# 手動合併有衝突的操作
npm run import-excel merge ACPI02 --force
```

### 4. 執行合併
確認分析結果後，執行實際合併：
```bash
npm run analyze-merge-all  # 不加 -d 執行實際合併
```

## 衝突類型說明

### 🟢 低風險（通常可自動合併）
- **說明文字差異**：Excel 提供更詳細的欄位說明
- **範例值更新**：新增或更新範例值
- **備註資訊**：額外的參考資訊

### 🟡 中風險（建議人工確認）
- **必填狀態變更**：欄位從選填變為必填
- **驗證規則變更**：新增或修改驗證條件
- **預設值變更**：影響現有邏輯

### 🔴 高風險（必須人工處理）
- **資料型態衝突**：string vs number 等
- **欄位映射衝突**：API 欄位對應不同的資料庫欄位
- **結構性變更**：影響 API 介面定義

## 建議處理策略

### 1. 分批處理
```bash
# 先處理無衝突的操作
npm run analyze-merge-all -d | grep "自動合併"

# 再處理有衝突的操作
npm run analyze-merge-all -c
```

### 2. 模組化處理
按模組分別處理，例如：
```bash
# 處理 ACP 模組
npm run analyze-merge-all -- ACPI02 ACPI03

# 處理 INV 模組
npm run analyze-merge-all -- INVI01 INVI02
```

### 3. 風險分級處理
- 先處理低風險項目（自動合併）
- 再處理中風險項目（快速審核）
- 最後處理高風險項目（詳細審核）

## 注意事項

### ⚠️ 安全考量
- 預設不會覆蓋原始檔案，而是更新內容
- 所有操作都有詳細日誌記錄
- 建議先用預覽模式（-d）確認

### 📋 前置條件
- 確保資料庫連接正常
- Excel 檔案放置在正確位置（/erp_api_docs/GP40/）
- 已生成基礎文檔（使用 generate 命令）

### 🔧 故障排除
1. **缺少 Excel 檔案**
   - 檢查 GP40 目錄結構
   - 確認檔案命名規則正確

2. **缺少資料庫文檔**
   - 先執行 `npm run generate` 生成基礎文檔
   - 確認 api_methods 目錄存在

3. **合併失敗**
   - 檢查 errors 目錄中的錯誤日誌
   - 確認沒有檔案權限問題

## 最佳實務

### 定期執行
建議每週執行一次批次分析，保持文檔同步：
```bash
# 每週五下午執行
npm run analyze-merge-all -d > weekly-report.md
```

### 版本控制
合併前後都要提交版本：
```bash
# 合併前
git add -A && git commit -m "Pre-merge snapshot"

# 執行合併
npm run analyze-merge-all

# 合併後
git add -A && git commit -m "Batch merge completed"
```

### 團隊協作
- 高風險衝突指派給資深開發者審核
- 中風險衝突可由一般開發者處理
- 自動合併結果仍需抽查驗證

## 相關命令

```bash
# 查看所有可用操作
npm run list-operations

# 生成單一操作文檔
npm run generate -- --operation ACPI02

# 手動合併單一操作
npm run import-excel merge ACPI02

# 查看 Excel 檔案
npm run import-excel scan
```

## 輸出範例

### 批次總報告
```markdown
# ERP 文檔批次分析合併報告

**執行時間**: 2025-07-04T10:00:00Z
**總耗時**: 180 秒

## 執行統計
| 類別 | 數量 | 百分比 |
|------|------|--------|
| 總操作數 | 101 | 100% |
| ✅ 自動合併 | 68 | 67.3% |
| ⚠️ 需人工審核 | 25 | 24.8% |
| ⏭️ 跳過處理 | 8 | 7.9% |
```

### 衝突報告範例
```markdown
# ACPI02 - 衝突分析詳細報告

## 衝突類型分析
| 衝突類型 | 數量 | 嚴重性 |
|---------|------|--------|
| 必填狀態 | 5 | 中 |
| 說明文字 | 12 | 低 |

## 詳細衝突列表
| 欄位名稱 | 資料庫值 | Excel 值 | 建議動作 |
|----------|----------|----------|----------|
| vendor | false | true | 📌 確認必填要求 |
```

---

透過批次分析合併工具，您可以大幅提升 ERP API 文檔的維護效率，確保文檔的準確性和完整性。