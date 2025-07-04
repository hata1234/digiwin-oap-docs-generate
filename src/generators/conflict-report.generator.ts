import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { MergeResult, MergeField } from '../services/merge.service';
import { OperationAnalysis } from '../services/batch-merge-analyzer.service';

export interface ConflictReportOptions {
  outputPath: string;
  format: 'markdown' | 'html' | 'json';
  includeExamples?: boolean;
  includeRecommendations?: boolean;
}

export class ConflictReportGenerator {
  
  /**
   * 生成衝突報告
   */
  async generateReport(
    mergeResult: MergeResult,
    analysis: OperationAnalysis,
    options: ConflictReportOptions
  ): Promise<void> {
    switch (options.format) {
      case 'markdown':
        await this.generateMarkdownReport(mergeResult, analysis, options);
        break;
      case 'html':
        await this.generateHtmlReport(mergeResult, analysis, options);
        break;
      case 'json':
        await this.generateJsonReport(mergeResult, analysis, options);
        break;
      default:
        throw new Error(`不支援的格式: ${options.format}`);
    }
  }

  /**
   * 生成 Markdown 格式報告
   */
  private async generateMarkdownReport(
    mergeResult: MergeResult,
    analysis: OperationAnalysis,
    options: ConflictReportOptions
  ): Promise<void> {
    const lines: string[] = [];

    // 標題和基本資訊
    lines.push(`# ${mergeResult.operationCode} - 衝突分析詳細報告`);
    lines.push('');
    lines.push(`> **生成時間**: ${new Date().toISOString()}`);
    lines.push(`> **衝突總數**: ${mergeResult.conflicts}`);
    lines.push(`> **風險等級**: ${this.getRiskBadge(analysis.mergeRisk)}`);
    lines.push('');

    // 執行摘要
    lines.push('## 📋 執行摘要');
    lines.push('');
    lines.push('| 項目 | 數值 |');
    lines.push('|------|------|');
    lines.push(`| 總欄位數 | ${mergeResult.totalFields} |`);
    lines.push(`| 新增欄位 | ${mergeResult.newFields} |`);
    lines.push(`| 更新欄位 | ${mergeResult.updatedFields} |`);
    lines.push(`| 衝突欄位 | ${mergeResult.conflicts} |`);
    lines.push('');

    // 衝突類型統計
    lines.push('## 📊 衝突類型分析');
    lines.push('');
    lines.push('| 衝突類型 | 數量 | 嚴重性 | 百分比 |');
    lines.push('|---------|------|--------|--------|');
    
    analysis.conflictTypes.forEach(ct => {
      const percentage = ((ct.count / mergeResult.conflicts) * 100).toFixed(1);
      lines.push(
        `| ${this.getConflictTypeName(ct.type)} | ${ct.count} | ${this.getSeverityBadge(ct.severity)} | ${percentage}% |`
      );
    });
    lines.push('');

    // 詳細衝突列表
    lines.push('## 🔍 詳細衝突列表');
    lines.push('');
    
    const conflictedFields = mergeResult.fields.filter(f => f.conflicts && f.conflicts.length > 0);
    
    if (conflictedFields.length === 0) {
      lines.push('*無衝突*');
    } else {
      // 按衝突類型分組顯示
      const groupedConflicts = this.groupConflictsByType(conflictedFields);
      
      for (const [type, fields] of Object.entries(groupedConflicts)) {
        lines.push(`### ${this.getConflictTypeName(type)}`);
        lines.push('');
        
        lines.push('| 欄位名稱 | 資料庫值 | Excel 值 | 建議動作 |');
        lines.push('|----------|----------|----------|----------|');
        
        fields.forEach(field => {
          field.conflicts?.forEach(conflict => {
            if (this.getConflictType(conflict.field) === type) {
              const suggestion = this.getSuggestion(conflict.field, conflict.dbValue, conflict.excelValue);
              lines.push(
                `| \`${field.apiName}\` | ${this.formatValue(conflict.dbValue)} | ${this.formatValue(conflict.excelValue)} | ${suggestion} |`
              );
            }
          });
        });
        lines.push('');
      }
    }

    // 範例資料（如果啟用）
    if (options.includeExamples && conflictedFields.length > 0) {
      lines.push('## 📝 衝突範例詳情');
      lines.push('');
      
      // 顯示前 5 個衝突的詳細資訊
      conflictedFields.slice(0, 5).forEach(field => {
        lines.push(`### ${field.apiName}`);
        lines.push('');
        lines.push('**基本資訊:**');
        lines.push(`- 資料庫欄位: \`${field.dbColumn}\``);
        lines.push(`- 資料型態: ${field.dataType}`);
        lines.push(`- 說明: ${field.description}`);
        lines.push('');
        lines.push('**衝突詳情:**');
        field.conflicts?.forEach(conflict => {
          lines.push(`- **${conflict.field}**: "${conflict.dbValue}" → "${conflict.excelValue}"`);
        });
        lines.push('');
      });
    }

    // 建議（如果啟用）
    if (options.includeRecommendations) {
      lines.push('## 💡 處理建議');
      lines.push('');
      lines.push(this.getDetailedRecommendations(analysis, mergeResult));
      lines.push('');

      // 提供具體的解決步驟
      lines.push('### 建議處理步驟');
      lines.push('');
      lines.push('1. **檢視高嚴重性衝突**');
      lines.push('   - 優先處理資料型態和欄位映射的衝突');
      lines.push('   - 這些衝突可能影響 API 功能正常運作');
      lines.push('');
      lines.push('2. **驗證必填欄位變更**');
      lines.push('   - 確認 Excel 中標記的必填欄位是否正確');
      lines.push('   - 考慮對現有 API 的影響');
      lines.push('');
      lines.push('3. **更新說明文字**');
      lines.push('   - 低優先級，但有助於文檔完整性');
      lines.push('   - 可以批次接受 Excel 的說明更新');
      lines.push('');
      lines.push('4. **執行合併**');
      lines.push('   ```bash');
      lines.push(`   # 解決衝突後執行合併`);
      lines.push(`   npm run import-excel merge ${mergeResult.operationCode} --force`);
      lines.push('   ```');
    }

    // 附錄：快速參考
    lines.push('## 📌 快速參考');
    lines.push('');
    lines.push('### 檢視原始資料');
    lines.push('```bash');
    lines.push('# 檢視現有文檔');
    lines.push(`cat /opt/apiserv/erp_api_docs/api_methods/${mergeResult.operationCode}/field-data.json | jq .`);
    lines.push('');
    lines.push('# 檢視 Excel 檔案');
    lines.push(`ls -la /opt/apiserv/erp_api_docs/GP40/*/${mergeResult.operationCode}/`);
    lines.push('```');
    lines.push('');
    lines.push('### 手動編輯解決衝突');
    lines.push('```bash');
    lines.push('# 編輯欄位資料');
    lines.push(`vim /opt/apiserv/erp_api_docs/api_methods/${mergeResult.operationCode}/field-data.json`);
    lines.push('```');

    await fs.writeFile(options.outputPath, lines.join('\n'), 'utf-8');
    console.log(chalk.green(`Markdown 衝突報告已生成: ${options.outputPath}`));
  }

  /**
   * 生成 HTML 格式報告
   */
  private async generateHtmlReport(
    mergeResult: MergeResult,
    analysis: OperationAnalysis,
    options: ConflictReportOptions
  ): Promise<void> {
    const html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${mergeResult.operationCode} - 衝突分析報告</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            padding: 30px;
        }
        h1, h2, h3 {
            color: #2c3e50;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .summary-card {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            padding: 15px;
            text-align: center;
        }
        .summary-card h3 {
            margin: 0 0 10px 0;
            font-size: 14px;
            color: #6c757d;
        }
        .summary-card .value {
            font-size: 24px;
            font-weight: bold;
            color: #495057;
        }
        .risk-low { color: #28a745; }
        .risk-medium { color: #ffc107; }
        .risk-high { color: #dc3545; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            border: 1px solid #dee2e6;
            padding: 12px;
            text-align: left;
        }
        th {
            background-color: #f8f9fa;
            font-weight: 600;
        }
        tr:nth-child(even) {
            background-color: #f8f9fa;
        }
        .conflict-type {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        .type-dataType { background: #ffebee; color: #c62828; }
        .type-required { background: #fff3e0; color: #e65100; }
        .type-mapping { background: #fce4ec; color: #c2185b; }
        .type-description { background: #e8f5e9; color: #2e7d32; }
        .code {
            background: #f5f5f5;
            border: 1px solid #ddd;
            border-radius: 3px;
            padding: 2px 4px;
            font-family: monospace;
            font-size: 0.9em;
        }
        .recommendation {
            background: #e3f2fd;
            border-left: 4px solid #2196f3;
            padding: 15px;
            margin: 20px 0;
        }
        .conflict-detail {
            background: #fff9c4;
            border: 1px solid #f9a825;
            border-radius: 4px;
            padding: 10px;
            margin: 10px 0;
        }
        .value-change {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .value-old {
            background: #ffebee;
            color: #c62828;
            padding: 4px 8px;
            border-radius: 4px;
        }
        .value-new {
            background: #e8f5e9;
            color: #2e7d32;
            padding: 4px 8px;
            border-radius: 4px;
        }
        .arrow {
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${mergeResult.operationCode} - 衝突分析報告</h1>
        <p><strong>生成時間:</strong> ${new Date().toLocaleString('zh-TW')}</p>
        <p><strong>風險等級:</strong> <span class="risk-${analysis.mergeRisk}">${this.getRiskText(analysis.mergeRisk)}</span></p>
        
        <div class="summary-grid">
            <div class="summary-card">
                <h3>總欄位數</h3>
                <div class="value">${mergeResult.totalFields}</div>
            </div>
            <div class="summary-card">
                <h3>新增欄位</h3>
                <div class="value">${mergeResult.newFields}</div>
            </div>
            <div class="summary-card">
                <h3>更新欄位</h3>
                <div class="value">${mergeResult.updatedFields}</div>
            </div>
            <div class="summary-card">
                <h3>衝突欄位</h3>
                <div class="value" style="color: #dc3545;">${mergeResult.conflicts}</div>
            </div>
        </div>

        <h2>衝突類型分析</h2>
        <table>
            <thead>
                <tr>
                    <th>衝突類型</th>
                    <th>數量</th>
                    <th>嚴重性</th>
                    <th>範例</th>
                </tr>
            </thead>
            <tbody>
                ${analysis.conflictTypes.map(ct => `
                    <tr>
                        <td><span class="conflict-type type-${ct.type}">${this.getConflictTypeName(ct.type)}</span></td>
                        <td>${ct.count}</td>
                        <td class="risk-${ct.severity}">${this.getSeverityText(ct.severity)}</td>
                        <td>${ct.examples[0] || '-'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        <h2>詳細衝突列表</h2>
        ${this.generateHtmlConflictDetails(mergeResult)}

        ${options.includeRecommendations ? `
        <div class="recommendation">
            <h3>💡 處理建議</h3>
            ${this.getDetailedRecommendations(analysis, mergeResult).replace(/\n/g, '<br>')}
        </div>
        ` : ''}
    </div>
</body>
</html>`;

    await fs.writeFile(options.outputPath, html, 'utf-8');
    console.log(chalk.green(`HTML 衝突報告已生成: ${options.outputPath}`));
  }

  /**
   * 生成 JSON 格式報告
   */
  private async generateJsonReport(
    mergeResult: MergeResult,
    analysis: OperationAnalysis,
    options: ConflictReportOptions
  ): Promise<void> {
    const report = {
      metadata: {
        operationCode: mergeResult.operationCode,
        generatedAt: new Date().toISOString(),
        riskLevel: analysis.mergeRisk,
        recommendation: analysis.recommendation
      },
      summary: {
        totalFields: mergeResult.totalFields,
        newFields: mergeResult.newFields,
        updatedFields: mergeResult.updatedFields,
        conflicts: mergeResult.conflicts
      },
      conflictTypes: analysis.conflictTypes,
      conflicts: mergeResult.fields
        .filter(f => f.conflicts && f.conflicts.length > 0)
        .map(field => ({
          fieldName: field.apiName,
          dbColumn: field.dbColumn,
          conflicts: field.conflicts
        })),
      recommendations: options.includeRecommendations ? 
        this.getJsonRecommendations(analysis, mergeResult) : undefined
    };

    await fs.writeFile(options.outputPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(chalk.green(`JSON 衝突報告已生成: ${options.outputPath}`));
  }

  /**
   * 按類型分組衝突
   */
  private groupConflictsByType(fields: MergeField[]): Record<string, MergeField[]> {
    const groups: Record<string, MergeField[]> = {};

    fields.forEach(field => {
      field.conflicts?.forEach(conflict => {
        const type = this.getConflictType(conflict.field);
        if (!groups[type]) {
          groups[type] = [];
        }
        if (!groups[type].includes(field)) {
          groups[type].push(field);
        }
      });
    });

    return groups;
  }

  /**
   * 獲取衝突類型
   */
  private getConflictType(field: string): string {
    const typeMap: Record<string, string> = {
      'dataType': 'dataType',
      'data_type': 'dataType',
      'required': 'required',
      'dbColumn': 'mapping',
      'db_column': 'mapping',
      'description': 'description'
    };
    return typeMap[field] || 'other';
  }

  /**
   * 獲取衝突類型名稱
   */
  private getConflictTypeName(type: string): string {
    const nameMap: Record<string, string> = {
      'dataType': '資料型態',
      'required': '必填狀態',
      'mapping': '欄位映射',
      'description': '說明文字',
      'other': '其他'
    };
    return nameMap[type] || type;
  }

  /**
   * 獲取風險徽章
   */
  private getRiskBadge(risk: string): string {
    const badges: Record<string, string> = {
      'low': '🟢 低風險',
      'medium': '🟡 中風險',
      'high': '🔴 高風險'
    };
    return badges[risk] || risk;
  }

  /**
   * 獲取風險文字
   */
  private getRiskText(risk: string): string {
    const texts: Record<string, string> = {
      'low': '低',
      'medium': '中',
      'high': '高'
    };
    return texts[risk] || risk;
  }

  /**
   * 獲取嚴重性徽章
   */
  private getSeverityBadge(severity: string): string {
    const badges: Record<string, string> = {
      'low': '🟢',
      'medium': '🟡',
      'high': '🔴'
    };
    return badges[severity] || severity;
  }

  /**
   * 獲取嚴重性文字
   */
  private getSeverityText(severity: string): string {
    const texts: Record<string, string> = {
      'low': '低',
      'medium': '中',
      'high': '高'
    };
    return texts[severity] || severity;
  }

  /**
   * 格式化值
   */
  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return '*空值*';
    }
    if (typeof value === 'boolean') {
      return value ? '✅' : '❌';
    }
    return String(value);
  }

  /**
   * 獲取建議
   */
  private getSuggestion(field: string, dbValue: any, excelValue: any): string {
    const type = this.getConflictType(field);
    
    switch (type) {
      case 'dataType':
        return '⚠️ 驗證型態相容性';
      case 'required':
        return excelValue ? '📌 確認必填要求' : '✅ 維持選填';
      case 'mapping':
        return '🔍 檢查映射正確性';
      case 'description':
        return '📝 採用新說明';
      default:
        return '👁️ 人工判斷';
    }
  }

  /**
   * 獲取詳細建議
   */
  private getDetailedRecommendations(analysis: OperationAnalysis, mergeResult: MergeResult): string {
    const recommendations: string[] = [];

    if (analysis.mergeRisk === 'high') {
      recommendations.push('⚠️ **高風險警告**: 此操作包含可能影響系統功能的重大衝突。');
      recommendations.push('建議由資深開發人員審核所有衝突，特別是資料型態和欄位映射的變更。');
    } else if (analysis.mergeRisk === 'medium') {
      recommendations.push('📋 **中等風險**: 此操作包含一些需要注意的衝突。');
      recommendations.push('大部分衝突可以透過採用 Excel 的更新來解決，但請注意驗證必填欄位的變更。');
    } else {
      recommendations.push('✅ **低風險**: 此操作的衝突較少且影響較小。');
      recommendations.push('可以安全地接受大部分變更，主要是說明文字的更新。');
    }

    // 根據衝突類型提供具體建議
    const hasDataTypeConflicts = analysis.conflictTypes.some(ct => ct.type === 'dataType');
    const hasRequiredConflicts = analysis.conflictTypes.some(ct => ct.type === 'required');
    const hasMappingConflicts = analysis.conflictTypes.some(ct => ct.type === 'mapping');

    if (hasDataTypeConflicts) {
      recommendations.push('');
      recommendations.push('**資料型態衝突處理**:');
      recommendations.push('- 確認新的資料型態是否與現有 API 相容');
      recommendations.push('- 檢查是否需要更新相關的驗證邏輯');
      recommendations.push('- 考慮對現有資料的影響');
    }

    if (hasRequiredConflicts) {
      recommendations.push('');
      recommendations.push('**必填欄位衝突處理**:');
      recommendations.push('- 新增的必填欄位可能導致現有 API 呼叫失敗');
      recommendations.push('- 確認是否需要提供預設值或向下相容處理');
      recommendations.push('- 更新 API 文檔說明新的必填要求');
    }

    if (hasMappingConflicts) {
      recommendations.push('');
      recommendations.push('**欄位映射衝突處理**:');
      recommendations.push('- 確認資料庫欄位映射是否正確');
      recommendations.push('- 可能需要更新資料庫 schema 或 ORM 設定');
      recommendations.push('- 注意對現有查詢的影響');
    }

    return recommendations.join('\n');
  }

  /**
   * 生成 HTML 衝突詳情
   */
  private generateHtmlConflictDetails(mergeResult: MergeResult): string {
    const conflictedFields = mergeResult.fields.filter(f => f.conflicts && f.conflicts.length > 0);
    
    if (conflictedFields.length === 0) {
      return '<p>無衝突</p>';
    }

    return conflictedFields.map(field => `
      <div class="conflict-detail">
        <h4><code>${field.apiName}</code></h4>
        <p><strong>資料庫欄位:</strong> <code>${field.dbColumn}</code></p>
        <div>
          ${field.conflicts!.map(conflict => `
            <div class="value-change">
              <strong>${conflict.field}:</strong>
              <span class="value-old">${this.formatValue(conflict.dbValue)}</span>
              <span class="arrow">→</span>
              <span class="value-new">${this.formatValue(conflict.excelValue)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  /**
   * 獲取 JSON 格式建議
   */
  private getJsonRecommendations(analysis: OperationAnalysis, mergeResult: MergeResult): any {
    return {
      riskLevel: analysis.mergeRisk,
      generalAdvice: this.getDetailedRecommendations(analysis, mergeResult),
      specificActions: {
        dataTypeConflicts: analysis.conflictTypes.find(ct => ct.type === 'dataType')?.count || 0,
        requiredConflicts: analysis.conflictTypes.find(ct => ct.type === 'required')?.count || 0,
        mappingConflicts: analysis.conflictTypes.find(ct => ct.type === 'mapping')?.count || 0,
        descriptionConflicts: analysis.conflictTypes.find(ct => ct.type === 'description')?.count || 0
      },
      suggestedCommand: `npm run import-excel merge ${mergeResult.operationCode} --force`
    };
  }
}