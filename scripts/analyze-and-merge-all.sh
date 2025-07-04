#!/bin/bash

# ERP 文檔批次分析合併腳本
# 用途：自動分析所有操作代碼，智能合併無衝突項目，生成衝突報告
# 作者：ERP Doc Generator Tool
# 版本：1.0.0

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# 預設值
REPORT_DIR="./merge-reports"
DRY_RUN=false
CONFLICT_ONLY=false
VERBOSE=false
PARALLEL_JOBS=4
SPECIFIC_OPERATIONS=()
AUTO_MERGE_THRESHOLD=0.8  # 80% 相似度以上自動合併

# 全域統計變數
TOTAL_OPERATIONS=0
AUTO_MERGED=0
MANUAL_REVIEW=0
SKIPPED=0
ERRORS=0

# 顯示幫助信息
show_help() {
    echo -e "${CYAN}ERP 文檔批次分析合併工具${NC}"
    echo
    echo -e "${YELLOW}用法:${NC}"
    echo "  $0 [選項] [操作代碼...]"
    echo
    echo -e "${YELLOW}選項:${NC}"
    echo "  -d, --dry-run        僅分析不執行合併（預覽模式）"
    echo "  -c, --conflict-only  只處理有衝突的操作"
    echo "  -j, --jobs NUM       並行處理任務數（預設: 4）"
    echo "  -r, --report DIR     指定報告輸出目錄（預設: ./merge-reports）"
    echo "  -t, --threshold NUM  自動合併閾值 0-1（預設: 0.8）"
    echo "  -v, --verbose        顯示詳細輸出"
    echo "  -h, --help           顯示此幫助信息"
    echo
    echo -e "${YELLOW}範例:${NC}"
    echo "  $0                              # 分析並合併所有操作"
    echo "  $0 -d                           # 預覽模式，只分析不合併"
    echo "  $0 -c                           # 只處理有衝突的操作"
    echo "  $0 ACPI02 ACPI03               # 只處理特定操作"
    echo "  $0 -j 8 -t 0.9                 # 8個並行任務，90%相似度自動合併"
    echo
}

# 記錄函數
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_analysis() {
    echo -e "${MAGENTA}[ANALYSIS]${NC} $1" >&2
}

# 解析命令列參數
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -c|--conflict-only)
                CONFLICT_ONLY=true
                shift
                ;;
            -j|--jobs)
                PARALLEL_JOBS="$2"
                shift 2
                ;;
            -r|--report)
                REPORT_DIR="$2"
                shift 2
                ;;
            -t|--threshold)
                AUTO_MERGE_THRESHOLD="$2"
                shift 2
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            -*)
                log_error "未知選項: $1"
                show_help
                exit 1
                ;;
            *)
                SPECIFIC_OPERATIONS+=("$1")
                shift
                ;;
        esac
    done
}

# 初始化報告目錄
init_report_dirs() {
    log_info "初始化報告目錄..."
    
    # 建立時間戳記目錄
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BATCH_DIR="${REPORT_DIR}/batch_${TIMESTAMP}"
    
    mkdir -p "${BATCH_DIR}/auto-merged"
    mkdir -p "${BATCH_DIR}/conflicts"
    mkdir -p "${BATCH_DIR}/skipped"
    mkdir -p "${BATCH_DIR}/errors"
    
    # 建立軟連結指向最新批次
    ln -sfn "batch_${TIMESTAMP}" "${REPORT_DIR}/latest"
    
    log_success "報告目錄已建立: ${BATCH_DIR}"
}

# 分析單個操作
analyze_operation() {
    local operation="$1"
    local analysis_file="${BATCH_DIR}/.analysis/${operation}.json"
    
    mkdir -p "${BATCH_DIR}/.analysis"
    
    if [[ "$VERBOSE" == true ]]; then
        log_analysis "分析 ${operation}..."
    fi
    
    # 使用 npm 命令分析操作
    local temp_log="/tmp/analyze_${operation}_$$.log"
    
    # 執行分析命令
    npm run import-excel analyze "$operation" > "$temp_log" 2>&1
    local result=$?
    
    if [[ $result -eq 0 ]]; then
        # 從日誌中提取分析結果
        local has_excel=$(grep -c "Excel 檔案:" "$temp_log" || echo "0")
        local has_db=$(grep -c "資料庫文檔:" "$temp_log" || echo "0")
        local field_count=$(grep -oP "總欄位數: \K\d+" "$temp_log" || echo "0")
        local conflict_count=$(grep -oP "衝突數量: \K\d+" "$temp_log" || echo "0")
        
        # 建立分析結果 JSON
        cat > "$analysis_file" <<EOF
{
  "operation": "$operation",
  "has_excel": $([[ $has_excel -gt 0 ]] && echo "true" || echo "false"),
  "has_database": $([[ $has_db -gt 0 ]] && echo "true" || echo "false"),
  "field_count": $field_count,
  "conflict_count": $conflict_count,
  "can_auto_merge": $([[ $conflict_count -eq 0 && $has_excel -gt 0 ]] && echo "true" || echo "false"),
  "analyzed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
        
        if [[ "$VERBOSE" == true ]]; then
            cat "$temp_log"
        fi
        
        rm -f "$temp_log"
        return 0
    else
        log_error "分析 ${operation} 失敗"
        rm -f "$temp_log"
        return 1
    fi
}

# 執行合併
execute_merge() {
    local operation="$1"
    local merge_log="${BATCH_DIR}/auto-merged/${operation}-merge-log.md"
    
    log_info "合併 ${operation}..."
    
    if [[ "$DRY_RUN" == true ]]; then
        echo "[DRY-RUN] 將執行: npm run import-excel merge $operation"
        return 0
    fi
    
    # 執行合併命令
    local temp_log="/tmp/merge_${operation}_$$.log"
    npm run import-excel merge "$operation" > "$temp_log" 2>&1
    local result=$?
    
    if [[ $result -eq 0 ]]; then
        # 建立合併日誌
        cat > "$merge_log" <<EOF
# ${operation} - 自動合併日誌

**合併時間**: $(date -u +%Y-%m-%dT%H:%M:%SZ)
**狀態**: ✅ 成功

## 合併統計
$(grep -E "(總欄位數|新增欄位|更新欄位|衝突數量):" "$temp_log")

## 更新的檔案
$(grep -A 20 "已更新的檔案:" "$temp_log" | grep -E "^  -")

## 詳細日誌
\`\`\`
$(cat "$temp_log")
\`\`\`
EOF
        
        ((AUTO_MERGED++))
        log_success "${operation} 合併成功"
        rm -f "$temp_log"
        return 0
    else
        # 記錄錯誤
        local error_log="${BATCH_DIR}/errors/${operation}-error.log"
        cp "$temp_log" "$error_log"
        ((ERRORS++))
        log_error "${operation} 合併失敗，詳見: $error_log"
        rm -f "$temp_log"
        return 1
    fi
}

# 生成衝突報告
generate_conflict_report() {
    local operation="$1"
    local analysis_file="${BATCH_DIR}/.analysis/${operation}.json"
    local conflict_report="${BATCH_DIR}/conflicts/${operation}-conflict-report.md"
    
    log_warning "生成 ${operation} 衝突報告..."
    
    # 使用 npm 命令生成詳細衝突報告
    local temp_log="/tmp/conflict_${operation}_$$.log"
    npm run import-excel analyze "$operation" --detailed > "$temp_log" 2>&1
    
    # 建立衝突報告
    cat > "$conflict_report" <<EOF
# ${operation} - 衝突分析報告

**生成時間**: $(date -u +%Y-%m-%dT%H:%M:%SZ)
**狀態**: ⚠️ 需要人工審核

## 衝突摘要
$(grep -A 10 "衝突統計:" "$temp_log" || echo "無法獲取衝突統計")

## 詳細衝突列表
$(grep -A 50 "衝突詳情:" "$temp_log" || echo "無法獲取衝突詳情")

## 建議動作
1. 檢視上述衝突欄位
2. 決定應採用資料庫還是 Excel 的值
3. 手動執行合併或修改後再合併

## 手動合併命令
\`\`\`bash
# 檢視詳細差異
npm run import-excel analyze $operation --detailed

# 執行合併（謹慎使用）
npm run import-excel merge $operation --force
\`\`\`
EOF
    
    ((MANUAL_REVIEW++))
    log_warning "${operation} 需要人工審核，報告: $conflict_report"
    rm -f "$temp_log"
}

# 處理跳過的操作
handle_skipped() {
    local operation="$1"
    local reason="$2"
    local skip_log="${BATCH_DIR}/skipped/${operation}-skip-reason.md"
    
    cat > "$skip_log" <<EOF
# ${operation} - 跳過原因

**時間**: $(date -u +%Y-%m-%dT%H:%M:%SZ)
**原因**: $reason

## 詳細說明
$reason

## 後續動作
- 如果缺少 Excel 檔案，請確認 GP40 目錄是否包含此操作的檔案
- 如果缺少資料庫文檔，可能需要先執行 generate 命令生成基礎文檔
EOF
    
    ((SKIPPED++))
    if [[ "$VERBOSE" == true ]]; then
        log_info "跳過 ${operation}: $reason"
    fi
}

# 處理單個操作的完整流程
process_operation() {
    local operation="$1"
    
    # 分析操作
    if ! analyze_operation "$operation"; then
        handle_skipped "$operation" "分析失敗"
        return 1
    fi
    
    # 讀取分析結果
    local analysis_file="${BATCH_DIR}/.analysis/${operation}.json"
    
    # 如果沒有 jq，使用簡單的 grep 方式
    if command -v jq &> /dev/null; then
        local has_excel=$(jq -r '.has_excel' "$analysis_file")
        local has_database=$(jq -r '.has_database' "$analysis_file")
        local conflict_count=$(jq -r '.conflict_count' "$analysis_file")
        local can_auto_merge=$(jq -r '.can_auto_merge' "$analysis_file")
    else
        local has_excel=$(grep -oP '"has_excel":\s*\K(true|false)' "$analysis_file" || echo "false")
        local has_database=$(grep -oP '"has_database":\s*\K(true|false)' "$analysis_file" || echo "false")
        local conflict_count=$(grep -oP '"conflict_count":\s*\K\d+' "$analysis_file" || echo "0")
        local can_auto_merge=$(grep -oP '"can_auto_merge":\s*\K(true|false)' "$analysis_file" || echo "false")
    fi
    
    # 決定處理方式
    if [[ "$has_excel" == "false" ]]; then
        handle_skipped "$operation" "缺少 Excel 檔案"
    elif [[ "$has_database" == "false" ]]; then
        handle_skipped "$operation" "缺少資料庫文檔"
    elif [[ "$CONFLICT_ONLY" == "true" && "$conflict_count" -eq 0 ]]; then
        handle_skipped "$operation" "無衝突（conflict-only 模式）"
    elif [[ "$can_auto_merge" == "true" && "$CONFLICT_ONLY" == "false" ]]; then
        execute_merge "$operation"
    else
        generate_conflict_report "$operation"
    fi
}

# 生成批次總報告
generate_batch_summary() {
    local summary_file="${BATCH_DIR}/batch-summary.md"
    local end_time=$(date +%s)
    local duration=$((end_time - START_TIME))
    
    cat > "$summary_file" <<EOF
# ERP 文檔批次分析合併報告

**執行時間**: $(date -u -d @$START_TIME +%Y-%m-%dT%H:%M:%SZ)
**完成時間**: $(date -u +%Y-%m-%dT%H:%M:%SZ)
**總耗時**: ${duration} 秒

## 執行參數
- **模式**: $([ "$DRY_RUN" == "true" ] && echo "預覽模式" || echo "執行模式")
- **並行任務數**: $PARALLEL_JOBS
- **自動合併閾值**: $AUTO_MERGE_THRESHOLD
- **只處理衝突**: $CONFLICT_ONLY

## 執行統計

| 類別 | 數量 | 百分比 |
|------|------|--------|
| 總操作數 | $TOTAL_OPERATIONS | 100% |
| ✅ 自動合併 | $AUTO_MERGED | $(awk "BEGIN {printf \"%.1f\", $AUTO_MERGED*100/$TOTAL_OPERATIONS}")% |
| ⚠️ 需人工審核 | $MANUAL_REVIEW | $(awk "BEGIN {printf \"%.1f\", $MANUAL_REVIEW*100/$TOTAL_OPERATIONS}")% |
| ⏭️ 跳過處理 | $SKIPPED | $(awk "BEGIN {printf \"%.1f\", $SKIPPED*100/$TOTAL_OPERATIONS}")% |
| ❌ 處理錯誤 | $ERRORS | $(awk "BEGIN {printf \"%.1f\", $ERRORS*100/$TOTAL_OPERATIONS}")% |

## 詳細清單

### 自動合併的操作 ($AUTO_MERGED)
$(ls -1 "${BATCH_DIR}/auto-merged/"*.md 2>/dev/null | xargs -I {} basename {} -merge-log.md | sed 's/^/- /')

### 需人工審核的操作 ($MANUAL_REVIEW)
$(ls -1 "${BATCH_DIR}/conflicts/"*.md 2>/dev/null | xargs -I {} basename {} -conflict-report.md | sed 's/^/- /')

### 跳過的操作 ($SKIPPED)
$(ls -1 "${BATCH_DIR}/skipped/"*.md 2>/dev/null | xargs -I {} basename {} -skip-reason.md | sed 's/^/- /')

### 錯誤的操作 ($ERRORS)
$(ls -1 "${BATCH_DIR}/errors/"*.log 2>/dev/null | xargs -I {} basename {} -error.log | sed 's/^/- /')

## 後續建議

1. **人工審核衝突**：請檢視 \`conflicts/\` 目錄中的報告，決定如何處理衝突
2. **處理跳過項目**：檢查 \`skipped/\` 目錄了解跳過原因
3. **調查錯誤**：查看 \`errors/\` 目錄中的錯誤日誌

## 快速導航
- [自動合併日誌](./auto-merged/)
- [衝突報告](./conflicts/)
- [跳過原因](./skipped/)
- [錯誤日誌](./errors/)
EOF
    
    log_success "批次總報告已生成: $summary_file"
}

# 主要批次處理流程
main_batch_process() {
    local operations_to_process=()
    
    # 決定要處理的操作代碼
    if [[ ${#SPECIFIC_OPERATIONS[@]} -gt 0 ]]; then
        operations_to_process=("${SPECIFIC_OPERATIONS[@]}")
        log_info "處理指定的操作代碼: ${operations_to_process[*]}"
    else
        log_info "獲取所有可用的操作代碼..."
        # 使用與 generate-all.sh 相同的方法獲取操作列表
        local all_operations=$(npm run explore operations 2>/dev/null | \
                            sed 's/\x1b\[[0-9;]*m//g' | \
                            grep -E '^\|[[:space:]]*[A-Z0-9_]+[[:space:]]*\|[[:space:]]*[0-9]+[[:space:]]*\|$' | \
                            awk -F'|' '{gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2); print $2}' | \
                            grep -v '^操作代碼$' | \
                            grep -E '^[A-Z0-9_]{4,}$')
        
        if [[ -z "$all_operations" ]]; then
            log_error "無法獲取操作代碼列表"
            exit 1
        fi
        
        # 轉換為陣列
        while IFS= read -r op_code; do
            if [[ -n "$op_code" ]]; then
                operations_to_process+=("$op_code")
            fi
        done <<< "$all_operations"
    fi
    
    TOTAL_OPERATIONS=${#operations_to_process[@]}
    log_info "總共 $TOTAL_OPERATIONS 個操作待處理"
    
    # 顯示執行計劃
    echo
    log_info "執行計劃:"
    echo "  📁 報告目錄: $BATCH_DIR"
    echo "  🔄 並行任務: $PARALLEL_JOBS"
    echo "  📊 自動合併閾值: $AUTO_MERGE_THRESHOLD"
    echo "  🏃 執行模式: $([ "$DRY_RUN" == "true" ] && echo "預覽" || echo "執行")"
    echo
    
    if [[ "$DRY_RUN" == true ]]; then
        log_warning "預覽模式 - 只分析不執行實際合併"
    fi
    
    # 開始批次處理
    echo "開始批次分析..."
    echo "════════════════════════════════════════════"
    
    # 使用 GNU parallel 或 xargs 進行並行處理
    if command -v parallel &> /dev/null; then
        # 使用 GNU parallel
        export -f process_operation analyze_operation execute_merge generate_conflict_report handle_skipped
        export -f log_info log_success log_warning log_error log_analysis
        export BATCH_DIR DRY_RUN CONFLICT_ONLY VERBOSE AUTO_MERGE_THRESHOLD
        export AUTO_MERGED MANUAL_REVIEW SKIPPED ERRORS
        
        printf '%s\n' "${operations_to_process[@]}" | \
            parallel -j "$PARALLEL_JOBS" --bar process_operation {}
    else
        # 使用簡單的循環處理
        local current=0
        for operation in "${operations_to_process[@]}"; do
            ((current++))
            echo
            echo "進度: [$current/$TOTAL_OPERATIONS] $(awk "BEGIN {printf \"%.1f\", $current*100/$TOTAL_OPERATIONS}")%"
            process_operation "$operation"
            echo "────────────────────────────────────────────"
        done
    fi
    
    echo
    echo "════════════════════════════════════════════"
}

# 檢查依賴
check_dependencies() {
    log_info "檢查依賴..."
    
    # 檢查 jq (可選但建議)
    if ! command -v jq &> /dev/null; then
        log_warning "建議安裝 jq 來更好地處理 JSON"
        echo "  可執行: sudo apt-get install jq"
        echo "  腳本將使用備用方法處理 JSON"
    fi
    
    # 檢查 npm 和專案
    if [[ ! -f "package.json" ]]; then
        log_error "請在 digiwin-oap-docs-generate 根目錄執行此腳本"
        exit 1
    fi
    
    log_success "依賴檢查完成"
}

# 主程序
main() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════╗"
    echo "║           ERP 文檔批次分析合併工具 v1.0.0            ║"
    echo "║                                                       ║"
    echo "║  智能分析・自動合併・衝突報告・批次處理              ║"
    echo "╚═══════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    START_TIME=$(date +%s)
    
    parse_args "$@"
    check_dependencies
    init_report_dirs
    main_batch_process
    generate_batch_summary
    
    # 顯示最終統計
    echo
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    echo -e "${GREEN}批次處理完成！${NC}"
    echo
    echo "📊 最終統計:"
    echo "  ✅ 自動合併: $AUTO_MERGED"
    echo "  ⚠️  需審核: $MANUAL_REVIEW"
    echo "  ⏭️  已跳過: $SKIPPED"
    echo "  ❌ 錯誤: $ERRORS"
    echo
    echo "📁 完整報告位置: ${BATCH_DIR}"
    echo "📄 總報告: ${BATCH_DIR}/batch-summary.md"
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    
    # 根據結果返回適當的退出碼
    if [[ $ERRORS -gt 0 ]]; then
        exit 1
    fi
    exit 0
}

# 執行主程序
main "$@"