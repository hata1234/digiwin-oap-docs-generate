#!/bin/bash

# ERP 操作代碼清單工具
# 用途：快速列出所有可用的操作代碼和統計資訊
# 作者：ERP Doc Generator Tool
# 版本：1.0.0

set -e  # 發生錯誤時立即退出

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# 預設值
OUTPUT_FORMAT="table"
SORT_BY="code"
FILTER=""
EXPORT_FILE=""

# 顯示幫助信息
show_help() {
    echo -e "${CYAN}ERP 操作代碼清單工具${NC}"
    echo
    echo -e "${YELLOW}用法:${NC}"
    echo "  $0 [選項]"
    echo
    echo -e "${YELLOW}選項:${NC}"
    echo "  -f, --format FORMAT  輸出格式 (table,json,csv,simple) (預設: table)"
    echo "  -s, --sort FIELD     排序欄位 (code,count) (預設: code)"
    echo "  -F, --filter REGEX   過濾操作代碼 (支援正則表達式)"
    echo "  -e, --export FILE    匯出到檔案"
    echo "  -h, --help           顯示此幫助信息"
    echo
    echo -e "${YELLOW}範例:${NC}"
    echo "  $0                           # 顯示所有操作代碼"
    echo "  $0 -f json                   # JSON 格式輸出"
    echo "  $0 -s count                  # 按記錄數排序"
    echo "  $0 -F '^ACP'                 # 只顯示以 ACP 開頭的操作"
    echo "  $0 -e operations.csv         # 匯出為 CSV 檔案"
    echo
}

# 記錄函數
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# 解析命令列參數
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--format)
                OUTPUT_FORMAT="$2"
                shift 2
                ;;
            -s|--sort)
                SORT_BY="$2"
                shift 2
                ;;
            -F|--filter)
                FILTER="$2"
                shift 2
                ;;
            -e|--export)
                EXPORT_FILE="$2"
                shift 2
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
                log_error "不支援的參數: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# 檢查環境
check_environment() {
    if [[ ! -f "package.json" ]]; then
        log_error "請在 digiwin-oap-docs-generate 根目錄執行此腳本"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        log_error "需要安裝 Node.js"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "需要安裝 npm"
        exit 1
    fi
    
    if [[ ! -d "node_modules" ]]; then
        log_info "安裝依賴套件..."
        npm install
    fi
}

# 獲取操作代碼資料
get_operations_data() {
    log_info "連接資料庫並獲取操作代碼..."
    
    local operations_output
    if ! operations_output=$(npm run explore operations 2>/dev/null); then
        log_error "無法獲取操作代碼列表"
        log_error "請檢查資料庫連接是否正常"
        exit 1
    fi
    
    # 解析操作代碼和記錄數
    local operations_data=()
    while IFS= read -r line; do
        if [[ $line =~ ^\|[[:space:]]*([A-Z0-9]+)[[:space:]]*\|[[:space:]]*([0-9]+)[[:space:]]*\|$ ]]; then
            local op_code="${BASH_REMATCH[1]}"
            local record_count="${BASH_REMATCH[2]}"
            if [[ "$op_code" != "操作代碼" ]]; then
                operations_data+=("$op_code:$record_count")
            fi
        fi
    done <<< "$operations_output"
    
    echo "${operations_data[@]}"
}

# 過濾和排序資料
process_data() {
    local -a raw_data=("$@")
    local -a filtered_data=()
    
    # 過濾
    for item in "${raw_data[@]}"; do
        local code="${item%%:*}"
        if [[ -z "$FILTER" ]] || [[ "$code" =~ $FILTER ]]; then
            filtered_data+=("$item")
        fi
    done
    
    # 排序
    case "$SORT_BY" in
        "code")
            printf '%s\n' "${filtered_data[@]}" | sort
            ;;
        "count")
            printf '%s\n' "${filtered_data[@]}" | sort -t: -k2 -nr
            ;;
        *)
            log_error "不支援的排序欄位: $SORT_BY"
            exit 1
            ;;
    esac
}

# 表格格式輸出
output_table() {
    local -a data=()
    while IFS= read -r line; do
        data+=("$line")
    done
    
    if [[ ${#data[@]} -eq 0 ]]; then
        echo -e "${YELLOW}沒有找到符合條件的操作代碼${NC}"
        return
    fi
    
    echo -e "${CYAN}ERP 操作代碼清單${NC}"
    echo
    echo "┌──────────────┬──────────────┐"
    echo "│ 操作代碼     │ 記錄數       │"
    echo "├──────────────┼──────────────┤"
    
    local total_operations=0
    local total_records=0
    
    for item in "${data[@]}"; do
        local code="${item%%:*}"
        local count="${item##*:}"
        printf "│ %-12s │ %12s │\n" "$code" "$count"
        ((total_operations++))
        ((total_records += count))
    done
    
    echo "└──────────────┴──────────────┘"
    echo
    echo -e "${GREEN}統計資訊:${NC}"
    echo "  總操作代碼數: $total_operations"
    echo "  總記錄數: $total_records"
    
    if [[ -n "$FILTER" ]]; then
        echo "  過濾條件: $FILTER"
    fi
    
    echo "  排序方式: $SORT_BY"
}

# JSON 格式輸出
output_json() {
    local -a data=()
    while IFS= read -r line; do
        data+=("$line")
    done
    
    echo "{"
    echo "  \"metadata\": {"
    echo "    \"generated_at\": \"$(date -Iseconds)\","
    echo "    \"total_operations\": ${#data[@]},"
    echo "    \"filter\": \"$FILTER\","
    echo "    \"sort_by\": \"$SORT_BY\""
    echo "  },"
    echo "  \"operations\": ["
    
    local first=true
    for item in "${data[@]}"; do
        local code="${item%%:*}"
        local count="${item##*:}"
        
        if [[ "$first" == true ]]; then
            first=false
        else
            echo ","
        fi
        
        echo -n "    {"
        echo -n "\"code\": \"$code\", "
        echo -n "\"record_count\": $count"
        echo -n "}"
    done
    
    echo
    echo "  ]"
    echo "}"
}

# CSV 格式輸出
output_csv() {
    echo "操作代碼,記錄數"
    
    while IFS= read -r line; do
        local code="${line%%:*}"
        local count="${line##*:}"
        echo "$code,$count"
    done
}

# 簡單格式輸出
output_simple() {
    while IFS= read -r line; do
        local code="${line%%:*}"
        echo "$code"
    done
}

# 主要處理流程
main_process() {
    local operations_data
    operations_data=$(get_operations_data)
    
    if [[ -z "$operations_data" ]]; then
        log_error "沒有獲取到任何操作代碼"
        exit 1
    fi
    
    read -ra raw_array <<< "$operations_data"
    local processed_data
    processed_data=$(process_data "${raw_array[@]}")
    
    local output=""
    case "$OUTPUT_FORMAT" in
        "table")
            output=$(echo "$processed_data" | output_table)
            ;;
        "json")
            output=$(echo "$processed_data" | output_json)
            ;;
        "csv")
            output=$(echo "$processed_data" | output_csv)
            ;;
        "simple")
            output=$(echo "$processed_data" | output_simple)
            ;;
        *)
            log_error "不支援的輸出格式: $OUTPUT_FORMAT"
            exit 1
            ;;
    esac
    
    if [[ -n "$EXPORT_FILE" ]]; then
        echo "$output" > "$EXPORT_FILE"
        log_success "已匯出到檔案: $EXPORT_FILE"
    else
        echo "$output"
    fi
}

# 主程序入口
main() {
    parse_args "$@"
    check_environment
    main_process
}

# 錯誤處理
trap 'log_error "腳本執行過程中發生錯誤，退出代碼: $?"' ERR

# 執行主程序
main "$@"