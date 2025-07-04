#!/bin/bash

# ERP 文檔批次生成腳本 - 修正版
# 用途：自動為所有操作代碼生成完整文檔
# 作者：ERP Doc Generator Tool
# 版本：1.0.3

# 不使用 set -e，改為手動處理錯誤

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 預設值
OUTPUT_DIR="./output"
FORMAT="all"
VERBOSE=false
DRY_RUN=false
SPECIFIC_OPERATIONS=()

# 顯示幫助信息
show_help() {
    echo -e "${CYAN}ERP 文檔批次生成工具${NC}"
    echo
    echo -e "${YELLOW}用法:${NC}"
    echo "  $0 [選項] [操作代碼...]"
    echo
    echo -e "${YELLOW}選項:${NC}"
    echo "  -o, --output DIR     指定輸出目錄 (預設: ./output)"
    echo "  -f, --format TYPE    指定文檔格式 (readme,json,markdown,unknown-fields,all) (預設: all)"
    echo "  -v, --verbose        顯示詳細輸出"
    echo "  -d, --dry-run        僅顯示將要執行的操作，不實際生成"
    echo "  -h, --help           顯示此幫助信息"
    echo
    echo -e "${YELLOW}範例:${NC}"
    echo "  $0                                    # 為所有操作代碼生成完整文檔"
    echo "  $0 -o ./my-docs -f readme,json        # 指定輸出目錄和格式"
    echo "  $0 ACPI02 ACPI03                     # 只為特定操作代碼生成文檔"
    echo "  $0 -d                                 # 預覽模式，不實際生成"
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

# 解析命令列參數
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -o|--output)
                OUTPUT_DIR="$2"
                shift 2
                ;;
            -f|--format)
                FORMAT="$2"
                shift 2
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -d|--dry-run)
                DRY_RUN=true
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

# 檢查環境
check_environment() {
    log_info "檢查執行環境..."
    
    # 檢查是否在正確的目錄
    if [[ ! -f "package.json" ]]; then
        log_error "請在 digiwin-oap-docs-generate 根目錄執行此腳本"
        exit 1
    fi
    
    # 檢查 Node.js 和 npm
    if ! command -v node &> /dev/null; then
        log_error "需要安裝 Node.js"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "需要安裝 npm"
        exit 1
    fi
    
    # 檢查依賴是否已安裝
    if [[ ! -d "node_modules" ]]; then
        log_info "安裝依賴套件..."
        npm install || {
            log_error "依賴安裝失敗"
            exit 1
        }
    fi
    
    # 檢查 .env 檔案
    if [[ ! -f ".env" ]]; then
        log_warning ".env 檔案不存在，請確保資料庫配置正確"
        if [[ -f ".env.example" ]]; then
            log_info "發現 .env.example，請參考此檔案建立 .env"
        fi
    fi
    
    log_success "環境檢查完成"
}

# 獲取所有操作代碼
get_operations() {
    # 使用更簡潔的方法：直接從輸出中提取操作代碼，忽略ANSI顏色
    local operations_raw
    operations_raw=$(npm run explore operations 2>/dev/null | \
                    sed 's/\x1b\[[0-9;]*m//g' | \
                    grep -E '^\|[[:space:]]*[A-Z0-9_]+[[:space:]]*\|[[:space:]]*[0-9]+[[:space:]]*\|$' | \
                    awk -F'|' '{gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2); print $2}' | \
                    grep -v '^操作代碼$' | \
                    grep -E '^[A-Z0-9_]{4,}$')
    
    if [[ -z "$operations_raw" ]]; then
        return 1
    fi
    
    # 直接輸出操作代碼，一行一個
    echo "$operations_raw"
}

# 生成單個操作的文檔
generate_operation_docs() {
    local operation="$1"
    local verbose_flag=""
    
    if [[ "$VERBOSE" == true ]]; then
        verbose_flag="--verbose"
    fi
    
    log_info "生成 $operation 文檔..."
    
    if [[ "$DRY_RUN" == true ]]; then
        if [[ -n "$verbose_flag" ]]; then
            echo "  [DRY-RUN] npm run generate -- --operation $operation --output \"$OUTPUT_DIR\" --format \"$FORMAT\" $verbose_flag"
        else
            echo "  [DRY-RUN] npm run generate -- --operation $operation --output \"$OUTPUT_DIR\" --format \"$FORMAT\""
        fi
        return 0
    fi
    
    local start_time=$(date +%s)
    local temp_log="/tmp/generate_${operation}_$$.log"
    
    # 執行生成命令，重定向輸出到臨時文件
    if [[ -n "$verbose_flag" ]]; then
        npm run generate -- --operation "$operation" --output "$OUTPUT_DIR" --format "$FORMAT" "$verbose_flag" > "$temp_log" 2>&1
    else
        npm run generate -- --operation "$operation" --output "$OUTPUT_DIR" --format "$FORMAT" > "$temp_log" 2>&1
    fi
    
    local result=$?
    
    if [[ $result -eq 0 ]]; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        # 如果是詳細模式，顯示日誌
        if [[ "$VERBOSE" == true ]]; then
            cat "$temp_log"
        fi
        
        log_success "$operation 文檔生成完成 (用時: ${duration}s)"
        rm -f "$temp_log"
        return 0
    else
        log_error "$operation 文檔生成失敗"
        # 顯示錯誤詳情
        echo "錯誤詳情:" >&2
        tail -20 "$temp_log" >&2
        rm -f "$temp_log"
        return 1
    fi
}

# 主要生成流程
main_generate() {
    local operations_to_process=()
    
    # 決定要處理的操作代碼
    if [[ ${#SPECIFIC_OPERATIONS[@]} -gt 0 ]]; then
        operations_to_process=("${SPECIFIC_OPERATIONS[@]}")
        log_info "處理指定的操作代碼: ${operations_to_process[*]}"
    else
        log_info "獲取所有可用的操作代碼..."
        local all_operations
        all_operations=$(get_operations)
        if [[ $? -ne 0 ]] || [[ -z "$all_operations" ]]; then
            log_error "無法獲取操作代碼列表"
            log_error "請檢查資料庫連接是否正常"
            exit 1
        fi
        
        # 將多行結果轉換為陣列
        operations_to_process=()
        while IFS= read -r op_code; do
            if [[ -n "$op_code" ]]; then
                operations_to_process+=("$op_code")
            fi
        done <<< "$all_operations"
        
        log_info "發現 ${#operations_to_process[@]} 個操作代碼"
    fi
    
    if [[ ${#operations_to_process[@]} -eq 0 ]]; then
        log_error "沒有找到任何操作代碼"
        exit 1
    fi
    
    # 顯示處理計劃
    echo
    log_info "執行計劃:"
    echo "  輸出目錄: $OUTPUT_DIR"
    echo "  文檔格式: $FORMAT"
    echo "  操作代碼總數: ${#operations_to_process[@]}"
    if [[ ${#operations_to_process[@]} -le 10 ]]; then
        echo "  操作代碼: ${operations_to_process[*]}"
    else
        echo "  前10個操作代碼: ${operations_to_process[@]:0:10}..."
    fi
    echo "  乾燥運行: $DRY_RUN"
    echo
    
    if [[ "$DRY_RUN" == true ]]; then
        log_warning "乾燥運行模式 - 不會實際生成文檔"
    fi
    
    # 開始生成
    local success_count=0
    local failed_count=0
    local failed_operations=()
    local start_time=$(date +%s)
    local total_count=${#operations_to_process[@]}
    local current_index=0
    
    echo "開始批次生成..."
    echo "═══════════════════════════════════════"
    
    for operation in "${operations_to_process[@]}"; do
        ((current_index++))
        echo
        echo "進度: [$current_index/$total_count]"
        
        if generate_operation_docs "$operation"; then
            ((success_count++)) || true
        else
            ((failed_count++)) || true
            failed_operations+=("$operation")
        fi
        
        echo "───────────────────────────────────────"
    done
    
    local end_time=$(date +%s)
    local total_duration=$((end_time - start_time))
    
    # 顯示總結報告
    echo
    echo "═══════════════════════════════════════"
    log_info "批次生成完成！"
    echo
    echo "📊 執行統計:"
    echo "  ✅ 成功: $success_count"
    echo "  ❌ 失敗: $failed_count"
    echo "  📁 輸出目錄: $OUTPUT_DIR"
    echo "  ⏱️  總用時: ${total_duration}s"
    if [[ $total_count -gt 0 ]]; then
        local avg_time=$((total_duration / total_count))
        echo "  ⚡ 平均每個: ${avg_time}s"
    fi
    
    if [[ $failed_count -gt 0 ]]; then
        echo
        log_warning "失敗的操作代碼:"
        for failed_op in "${failed_operations[@]}"; do
            echo "  - $failed_op"
        done
    fi
    
    if [[ "$DRY_RUN" == false ]]; then
        echo
        log_info "生成的文檔結構:"
        if [[ -d "$OUTPUT_DIR" ]]; then
            # 顯示前幾個生成的目錄
            local dirs_count=$(find "$OUTPUT_DIR" -maxdepth 1 -type d | wc -l)
            echo "  📂 操作代碼目錄: $((dirs_count - 1))"
            
            local total_files=$(find "$OUTPUT_DIR" -type f \( -name "*.md" -o -name "*.json" \) 2>/dev/null | wc -l)
            echo "  📄 總檔案數: $total_files"
            
            local total_size=$(du -sh "$OUTPUT_DIR" 2>/dev/null | cut -f1)
            echo "  💾 總大小: $total_size"
        fi
    fi
    
    echo "═══════════════════════════════════════"
    
    if [[ $failed_count -gt 0 ]]; then
        return 1
    fi
    return 0
}

# 主程序入口
main() {
    echo -e "${CYAN}"
    echo "████████╗██████╗ ██████╗     ██████╗  ██████╗  ██████╗"
    echo "██╔════╝██╔══██╗██╔══██╗    ██╔══██╗██╔═══██╗██╔════╝"
    echo "█████╗  ██████╔╝██████╔╝    ██║  ██║██║   ██║██║     "
    echo "██╔══╝  ██╔══██╗██╔═══╝     ██║  ██║██║   ██║██║     "
    echo "███████╗██║  ██║██║         ██████╔╝╚██████╔╝╚██████╗"
    echo "╚══════╝╚═╝  ╚═╝╚═╝         ╚═════╝  ╚═════╝  ╚═════╝"
    echo -e "${NC}"
    echo -e "${CYAN}ERP API 文檔批次生成工具 v1.0.3${NC}"
    echo
    
    parse_args "$@"
    check_environment
    main_generate
}

# 執行主程序
main "$@"