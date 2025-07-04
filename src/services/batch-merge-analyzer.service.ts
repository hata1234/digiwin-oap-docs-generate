import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { ExcelImportService, ExcelWorkbook } from './excel-import.service';
import { MergeService, MergeResult } from './merge.service';

export interface OperationAnalysis {
  operationCode: string;
  hasExcel: boolean;
  hasDatabase: boolean;
  excelFileCount: number;
  fieldCount: number;
  conflictCount: number;
  conflictTypes: ConflictType[];
  canAutoMerge: boolean;
  mergeRisk: 'low' | 'medium' | 'high';
  recommendation: 'auto-merge' | 'manual-review' | 'skip';
  skipReason?: string;
  analyzedAt: Date;
}

export interface ConflictType {
  type: 'dataType' | 'required' | 'description' | 'mapping' | 'other';
  count: number;
  severity: 'low' | 'medium' | 'high';
  examples: string[];
}

export interface BatchAnalysisResult {
  totalOperations: number;
  analyzed: number;
  canAutoMerge: number;
  needManualReview: number;
  skipped: number;
  operations: OperationAnalysis[];
  summary: {
    byModule: Record<string, number>;
    byRisk: Record<string, number>;
    byRecommendation: Record<string, number>;
  };
}

export class BatchMergeAnalyzerService {
  private excelService: ExcelImportService;
  private mergeService: MergeService;
  private readonly API_METHODS_PATH = '/opt/apiserv/erp_api_docs/api_methods';
  private readonly CONFLICT_SEVERITY_MAP: Record<string, string> = {
    dataType: 'high',
    required: 'medium',
    mapping: 'high',
    description: 'low',
    other: 'medium'
  };

  constructor() {
    this.excelService = new ExcelImportService();
    this.mergeService = new MergeService();
  }

  /**
   * 分析單個操作的合併可行性
   */
  async analyzeOperation(operationCode: string): Promise<OperationAnalysis> {
    console.log(chalk.blue(`分析 ${operationCode}...`));

    try {
      // 檢查是否有 Excel 檔案
      const excelWorkbooks = await this.excelService.readOperationExcels(operationCode);
      const hasExcel = excelWorkbooks.length > 0;

      // 檢查是否有資料庫文檔
      const hasDatabase = await this.checkDatabaseDocExists(operationCode);

      // 如果缺少必要檔案，標記為跳過
      if (!hasExcel || !hasDatabase) {
        return {
          operationCode,
          hasExcel,
          hasDatabase,
          excelFileCount: excelWorkbooks.length,
          fieldCount: 0,
          conflictCount: 0,
          conflictTypes: [],
          canAutoMerge: false,
          mergeRisk: 'high',
          recommendation: 'skip',
          skipReason: !hasExcel ? '缺少 Excel 檔案' : '缺少資料庫文檔',
          analyzedAt: new Date()
        };
      }

      // 執行模擬合併以分析衝突
      const mergeResult = await this.mergeService.mergeFields(operationCode, excelWorkbooks);
      
      // 分析衝突類型
      const conflictTypes = this.analyzeConflictTypes(mergeResult);
      
      // 評估合併風險
      const mergeRisk = this.assessMergeRisk(conflictTypes, mergeResult);
      
      // 決定推薦動作
      const recommendation = this.getRecommendation(mergeRisk, conflictTypes);

      return {
        operationCode,
        hasExcel,
        hasDatabase,
        excelFileCount: excelWorkbooks.length,
        fieldCount: mergeResult.totalFields,
        conflictCount: mergeResult.conflicts,
        conflictTypes,
        canAutoMerge: mergeResult.conflicts === 0,
        mergeRisk,
        recommendation,
        analyzedAt: new Date()
      };

    } catch (error) {
      console.error(chalk.red(`分析 ${operationCode} 時發生錯誤:`), error);
      return {
        operationCode,
        hasExcel: false,
        hasDatabase: false,
        excelFileCount: 0,
        fieldCount: 0,
        conflictCount: 0,
        conflictTypes: [],
        canAutoMerge: false,
        mergeRisk: 'high',
        recommendation: 'skip',
        skipReason: `分析錯誤: ${error instanceof Error ? error.message : String(error)}`,
        analyzedAt: new Date()
      };
    }
  }

  /**
   * 批次分析多個操作
   */
  async analyzeBatch(operationCodes: string[]): Promise<BatchAnalysisResult> {
    const results: OperationAnalysis[] = [];
    let analyzed = 0;

    console.log(chalk.cyan(`開始批次分析 ${operationCodes.length} 個操作...`));

    // 逐一分析每個操作
    for (const operationCode of operationCodes) {
      try {
        const analysis = await this.analyzeOperation(operationCode);
        results.push(analysis);
        analyzed++;

        // 顯示進度
        const progress = Math.round((analyzed / operationCodes.length) * 100);
        console.log(chalk.gray(`進度: ${analyzed}/${operationCodes.length} (${progress}%)`));
      } catch (error) {
        console.error(chalk.red(`分析 ${operationCode} 失敗:`), error);
      }
    }

    // 生成摘要統計
    const summary = this.generateSummary(results);

    return {
      totalOperations: operationCodes.length,
      analyzed: results.length,
      canAutoMerge: results.filter(r => r.recommendation === 'auto-merge').length,
      needManualReview: results.filter(r => r.recommendation === 'manual-review').length,
      skipped: results.filter(r => r.recommendation === 'skip').length,
      operations: results,
      summary
    };
  }

  /**
   * 檢查資料庫文檔是否存在
   */
  private async checkDatabaseDocExists(operationCode: string): Promise<boolean> {
    try {
      const docPath = path.join(this.API_METHODS_PATH, operationCode, 'field-data.json');
      await fs.access(docPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 分析衝突類型
   */
  private analyzeConflictTypes(mergeResult: MergeResult): ConflictType[] {
    const typeCountMap: Record<string, { count: number; examples: string[] }> = {};

    // 分析每個有衝突的欄位
    mergeResult.fields.forEach(field => {
      if (field.conflicts && field.conflicts.length > 0) {
        field.conflicts.forEach(conflict => {
          let conflictType: string;
          
          // 判斷衝突類型
          if (conflict.field === 'dataType') {
            conflictType = 'dataType';
          } else if (conflict.field === 'required') {
            conflictType = 'required';
          } else if (conflict.field === 'dbColumn') {
            conflictType = 'mapping';
          } else if (conflict.field === 'description') {
            conflictType = 'description';
          } else {
            conflictType = 'other';
          }

          // 記錄衝突
          if (!typeCountMap[conflictType]) {
            typeCountMap[conflictType] = { count: 0, examples: [] };
          }
          
          typeCountMap[conflictType].count++;
          
          // 收集範例（最多 3 個）
          if (typeCountMap[conflictType].examples.length < 3) {
            typeCountMap[conflictType].examples.push(
              `${field.apiName}: ${conflict.dbValue} → ${conflict.excelValue}`
            );
          }
        });
      }
    });

    // 轉換為 ConflictType 陣列
    return Object.entries(typeCountMap).map(([type, data]) => ({
      type: type as any,
      count: data.count,
      severity: (this.CONFLICT_SEVERITY_MAP[type] || 'medium') as 'low' | 'medium' | 'high',
      examples: data.examples
    }));
  }

  /**
   * 評估合併風險
   */
  private assessMergeRisk(
    conflictTypes: ConflictType[],
    mergeResult: MergeResult
  ): 'low' | 'medium' | 'high' {
    // 如果沒有衝突，風險低
    if (conflictTypes.length === 0) {
      return 'low';
    }

    // 檢查是否有高嚴重性衝突
    const hasHighSeverity = conflictTypes.some(ct => ct.severity === 'high');
    if (hasHighSeverity) {
      return 'high';
    }

    // 檢查衝突數量
    const totalConflicts = conflictTypes.reduce((sum, ct) => sum + ct.count, 0);
    if (totalConflicts > 10) {
      return 'high';
    }

    // 檢查衝突類型多樣性
    if (conflictTypes.length > 3) {
      return 'medium';
    }

    // 預設為中等風險
    return 'medium';
  }

  /**
   * 獲取推薦動作
   */
  private getRecommendation(
    risk: 'low' | 'medium' | 'high',
    conflictTypes: ConflictType[]
  ): 'auto-merge' | 'manual-review' | 'skip' {
    // 低風險且無衝突，可以自動合併
    if (risk === 'low' && conflictTypes.length === 0) {
      return 'auto-merge';
    }

    // 低風險但有少量衝突（只有描述差異），仍可自動合併
    if (risk === 'low' && 
        conflictTypes.length === 1 && 
        conflictTypes[0].type === 'description') {
      return 'auto-merge';
    }

    // 其他情況需要人工審核
    return 'manual-review';
  }

  /**
   * 生成摘要統計
   */
  private generateSummary(results: OperationAnalysis[]): BatchAnalysisResult['summary'] {
    const byModule: Record<string, number> = {};
    const byRisk: Record<string, number> = { low: 0, medium: 0, high: 0 };
    const byRecommendation: Record<string, number> = {
      'auto-merge': 0,
      'manual-review': 0,
      'skip': 0
    };

    results.forEach(result => {
      // 按模組統計（從操作代碼提取模組，如 ACPI02 → ACP）
      const module = result.operationCode.match(/^([A-Z]+)/)?.[1] || 'OTHER';
      byModule[module] = (byModule[module] || 0) + 1;

      // 按風險統計
      byRisk[result.mergeRisk]++;

      // 按推薦動作統計
      byRecommendation[result.recommendation]++;
    });

    return { byModule, byRisk, byRecommendation };
  }

  /**
   * 生成分析報告
   */
  async generateAnalysisReport(
    analysis: OperationAnalysis,
    outputPath: string
  ): Promise<void> {
    const report = this.formatAnalysisReport(analysis);
    await fs.writeFile(outputPath, report, 'utf-8');
    console.log(chalk.green(`分析報告已生成: ${outputPath}`));
  }

  /**
   * 格式化分析報告
   */
  private formatAnalysisReport(analysis: OperationAnalysis): string {
    const lines: string[] = [];

    lines.push(`# ${analysis.operationCode} - 合併分析報告`);
    lines.push('');
    lines.push(`**分析時間**: ${analysis.analyzedAt.toISOString()}`);
    lines.push(`**推薦動作**: ${this.getRecommendationText(analysis.recommendation)}`);
    lines.push(`**風險等級**: ${this.getRiskText(analysis.mergeRisk)}`);
    lines.push('');

    // 基本資訊
    lines.push('## 📊 基本資訊');
    lines.push(`- Excel 檔案: ${analysis.hasExcel ? `✅ (${analysis.excelFileCount} 個)` : '❌'}`);
    lines.push(`- 資料庫文檔: ${analysis.hasDatabase ? '✅' : '❌'}`);
    lines.push(`- 總欄位數: ${analysis.fieldCount}`);
    lines.push(`- 衝突數量: ${analysis.conflictCount}`);
    lines.push('');

    // 跳過原因
    if (analysis.skipReason) {
      lines.push('## ⚠️ 跳過原因');
      lines.push(analysis.skipReason);
      lines.push('');
    }

    // 衝突分析
    if (analysis.conflictTypes.length > 0) {
      lines.push('## 🔍 衝突分析');
      lines.push('');
      lines.push('| 衝突類型 | 數量 | 嚴重性 | 範例 |');
      lines.push('|---------|------|--------|------|');
      
      analysis.conflictTypes.forEach(ct => {
        lines.push(
          `| ${this.getConflictTypeText(ct.type)} | ${ct.count} | ${this.getSeverityText(ct.severity)} | ${ct.examples[0] || '-'} |`
        );
      });
      lines.push('');
    }

    // 建議
    lines.push('## 💡 建議');
    lines.push(this.getRecommendationDetails(analysis));

    return lines.join('\n');
  }

  private getRecommendationText(recommendation: string): string {
    const map: Record<string, string> = {
      'auto-merge': '✅ 自動合併',
      'manual-review': '⚠️ 人工審核',
      'skip': '⏭️ 跳過'
    };
    return map[recommendation] || recommendation;
  }

  private getRiskText(risk: string): string {
    const map: Record<string, string> = {
      'low': '🟢 低',
      'medium': '🟡 中',
      'high': '🔴 高'
    };
    return map[risk] || risk;
  }

  private getConflictTypeText(type: string): string {
    const map: Record<string, string> = {
      'dataType': '資料型態',
      'required': '必填狀態',
      'mapping': '欄位映射',
      'description': '說明文字',
      'other': '其他'
    };
    return map[type] || type;
  }

  private getSeverityText(severity: string): string {
    const map: Record<string, string> = {
      'low': '低',
      'medium': '中',
      'high': '高'
    };
    return map[severity] || severity;
  }

  private getRecommendationDetails(analysis: OperationAnalysis): string {
    switch (analysis.recommendation) {
      case 'auto-merge':
        return '此操作無衝突或只有低風險衝突，可以安全地自動合併。';
      
      case 'manual-review':
        return '此操作包含需要人工判斷的衝突，請檢視詳細衝突報告後決定如何處理。';
      
      case 'skip':
        return `此操作因為「${analysis.skipReason}」而被跳過，請先解決此問題後再執行合併。`;
      
      default:
        return '無法判斷適當的處理方式。';
    }
  }
}