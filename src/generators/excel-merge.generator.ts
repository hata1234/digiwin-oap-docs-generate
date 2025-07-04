import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { MergeResult, MergeField } from '../services/merge.service';
import { MethodDocumentGenerator } from './method-document.generator';
import { ExcelWorkbook } from '../services/excel-import.service';

export class ExcelMergeGenerator {
  private readonly API_METHODS_PATH = '/opt/apiserv/erp_api_docs/api_methods';
  private methodDocGenerator: MethodDocumentGenerator;
  
  constructor() {
    this.methodDocGenerator = new MethodDocumentGenerator();
  }
  
  /**
   * 生成所有文檔（包含 method 文檔）
   */
  async generateAllDocuments(result: MergeResult, workbooks?: ExcelWorkbook[]): Promise<void> {
    // 生成主要文檔
    await this.generateUpdatedReadme(result);
    await this.generateAllFieldsMarkdown(result);
    await this.generateFieldDataJson(result);
    await this.generateUpdateSuggestions(result);
    
    // 如果有提供 workbooks，生成 method 文檔
    if (workbooks && workbooks.length > 0) {
      console.log(chalk.blue('\n📝 生成 Method 文檔...'));
      
      for (const workbook of workbooks) {
        try {
          await this.methodDocGenerator.generateMethodDocument({
            outputDir: this.API_METHODS_PATH,
            operationCode: result.operationCode,
            methodType: workbook.methodType,
            workbook: workbook
          });
        } catch (error) {
          console.error(chalk.red(`生成 ${workbook.methodType} 文檔失敗:`), error);
        }
      }
    }
  }
  
  /**
   * 生成更新後的 README.md
   */
  async generateUpdatedReadme(result: MergeResult): Promise<void> {
    const outputPath = path.join(this.API_METHODS_PATH, result.operationCode, 'README.md');
    
    const lines: string[] = [];
    
    // 標題
    lines.push(`# ${result.operationCode} - ERP API 欄位文檔`);
    lines.push('');
    lines.push(`> **自動生成時間**: ${new Date().toISOString()}`);
    lines.push(`> **資料來源**: 資料庫查詢 + Excel 匯入`);
    lines.push('');
    
    // 概述
    lines.push('## 📋 概述');
    lines.push('');
    lines.push(`- **操作代碼**: ${result.operationCode}`);
    lines.push(`- **總欄位數**: ${result.totalFields}`);
    lines.push(`- **必填欄位數**: ${result.fields.filter(f => f.required).length}`);
    lines.push('');
    
    // 按資料表分組
    const fieldsByTable = this.groupFieldsByTable(result.fields);
    
    lines.push('## 📊 資料表摘要');
    lines.push('');
    lines.push('| 資料表名稱 | 欄位數量 | 必填欄位 |');
    lines.push('|------------|----------|----------|');
    
    for (const [table, fields] of Object.entries(fieldsByTable)) {
      const requiredCount = fields.filter(f => f.required).length;
      lines.push(`| ${table} | ${fields.length} | ${requiredCount} |`);
    }
    
    lines.push('');
    
    // 詳細欄位說明
    lines.push('## 📝 詳細欄位說明');
    lines.push('');
    
    for (const [table, fields] of Object.entries(fieldsByTable)) {
      lines.push(`### ${table}`);
      lines.push('');
      lines.push('| API 欄位名稱 | 資料庫欄位 | 型態 | 長度 | 必填 | 說明 | 驗證規則 |');
      lines.push('|--------------|------------|------|------|------|------|----------|');
      
      for (const field of fields) {
        const required = field.required ? '✅' : '❌';
        const length = field.maxLength || '-';
        const validation = field.validation || '-';
        
        lines.push(
          `| \`${field.apiName}\` | ${field.dbColumn} | ${field.dataType} | ${length} | ${required} | ${field.description} | ${validation} |`
        );
      }
      
      lines.push('');
    }
    
    // 更新資訊
    if (result.newFields > 0 || result.updatedFields > 0) {
      lines.push('## 📊 更新統計');
      lines.push('');
      lines.push(`- 新增欄位: ${result.newFields}`);
      lines.push(`- 更新欄位: ${result.updatedFields}`);
      lines.push(`- 資料衝突: ${result.conflicts}`);
      lines.push('');
    }
    
    await fs.writeFile(outputPath, lines.join('\n'), 'utf-8');
    console.log(chalk.green(`✅ 已更新 README.md: ${outputPath}`));
  }
  
  /**
   * 生成更新後的 all-fields.md
   */
  async generateAllFieldsMarkdown(result: MergeResult): Promise<void> {
    const outputPath = path.join(this.API_METHODS_PATH, result.operationCode, 'all-fields.md');
    
    const lines: string[] = [];
    
    lines.push(`# ${result.operationCode} - 完整欄位清單`);
    lines.push('');
    lines.push(`> 更新時間: ${new Date().toISOString()}`);
    lines.push('');
    
    lines.push('## 所有欄位');
    lines.push('');
    lines.push('| API 欄位 | DB 欄位 | 型態 | 長度 | 必填 | 說明 | 驗證 | 範例 | 來源 |');
    lines.push('|----------|---------|------|------|------|------|------|------|------|');
    
    for (const field of result.fields) {
      const required = field.required ? '✅' : '❌';
      const length = field.maxLength || '-';
      const validation = field.validation || '-';
      const example = field.example || '-';
      const sourceIcon = this.getSourceIcon(field.source);
      
      lines.push(
        `| \`${field.apiName}\` | ${field.dbColumn} | ${field.dataType} | ${length} | ${required} | ${field.description} | ${validation} | ${example} | ${sourceIcon} |`
      );
    }
    
    lines.push('');
    lines.push('## 圖例');
    lines.push('');
    lines.push('- 📊 資料庫來源');
    lines.push('- 📑 Excel 來源');
    lines.push('- 🔄 合併資料');
    
    await fs.writeFile(outputPath, lines.join('\n'), 'utf-8');
    console.log(chalk.green(`✅ 已更新 all-fields.md: ${outputPath}`));
  }
  
  /**
   * 生成更新後的 field-data.json
   */
  async generateFieldDataJson(result: MergeResult): Promise<void> {
    const outputPath = path.join(this.API_METHODS_PATH, result.operationCode, 'field-data.json');
    
    const fieldData = {
      operationCode: result.operationCode,
      generatedAt: new Date().toISOString(),
      totalFields: result.totalFields,
      requiredFields: result.fields.filter(f => f.required).length,
      dataSources: {
        database: result.fields.filter(f => f.source === 'database').length,
        excel: result.fields.filter(f => f.source === 'excel').length,
        merged: result.fields.filter(f => f.source === 'merged').length
      },
      fields: result.fields.map(field => ({
        api_name: field.apiName,
        db_column: field.dbColumn,
        data_type: field.dataType,
        max_length: field.maxLength,
        required: field.required,
        description: field.description,
        validation: field.validation,
        example: field.example,
        remark: field.remark,
        source: field.source,
        has_conflicts: !!(field.conflicts && field.conflicts.length > 0)
      }))
    };
    
    await fs.writeFile(outputPath, JSON.stringify(fieldData, null, 2), 'utf-8');
    console.log(chalk.green(`✅ 已更新 field-data.json: ${outputPath}`));
  }
  
  /**
   * 生成建議更新清單
   */
  async generateUpdateSuggestions(result: MergeResult): Promise<void> {
    const outputPath = path.join(this.API_METHODS_PATH, result.operationCode, 'update-suggestions.md');
    
    const lines: string[] = [];
    
    lines.push(`# ${result.operationCode} - 更新建議`);
    lines.push('');
    lines.push(`生成時間: ${new Date().toISOString()}`);
    lines.push('');
    
    // 新增的必填欄位
    const newRequiredFields = result.fields.filter(
      f => f.source === 'excel' && f.required
    );
    
    if (newRequiredFields.length > 0) {
      lines.push('## 🔴 新增的必填欄位');
      lines.push('');
      lines.push('以下欄位在 Excel 中標記為必填，但資料庫中沒有：');
      lines.push('');
      
      for (const field of newRequiredFields) {
        lines.push(`- **${field.apiName}** (${field.dbColumn}): ${field.description}`);
        if (field.validation) {
          lines.push(`  - 驗證規則: ${field.validation}`);
        }
      }
      lines.push('');
    }
    
    // 更新的欄位說明
    const updatedDescriptions = result.fields.filter(
      f => f.source === 'merged' && f.description
    );
    
    if (updatedDescriptions.length > 0) {
      lines.push('## 📝 更新的欄位說明');
      lines.push('');
      
      for (const field of updatedDescriptions) {
        lines.push(`- **${field.apiName}**: ${field.description}`);
      }
      lines.push('');
    }
    
    // 有衝突的欄位
    const conflictedFields = result.fields.filter(
      f => f.conflicts && f.conflicts.length > 0
    );
    
    if (conflictedFields.length > 0) {
      lines.push('## ⚠️ 需要人工確認的衝突');
      lines.push('');
      
      for (const field of conflictedFields) {
        lines.push(`### ${field.apiName}`);
        lines.push('');
        
        for (const conflict of field.conflicts!) {
          lines.push(`- **${conflict.field}**:`);
          lines.push(`  - 資料庫: \`${conflict.dbValue}\``);
          lines.push(`  - Excel: \`${conflict.excelValue}\``);
        }
        lines.push('');
      }
    }
    
    // 建議動作
    lines.push('## 💡 建議動作');
    lines.push('');
    lines.push('1. 檢視並確認所有新增的必填欄位');
    lines.push('2. 驗證更新的欄位說明是否正確');
    lines.push('3. 解決所有標記的衝突');
    lines.push('4. 更新相關的 API 實作以支援新的驗證規則');
    lines.push('');
    
    await fs.writeFile(outputPath, lines.join('\n'), 'utf-8');
    console.log(chalk.green(`✅ 已生成更新建議: ${outputPath}`));
  }
  
  /**
   * 按資料表分組欄位
   */
  private groupFieldsByTable(fields: MergeField[]): Record<string, MergeField[]> {
    const groups: Record<string, MergeField[]> = {};
    
    for (const field of fields) {
      // 從 DB 欄位名稱推斷資料表（例如 TA001 -> ACPTA）
      const tablePrefix = field.dbColumn.match(/^([A-Z]+)/)?.[1] || 'UNKNOWN';
      const tableName = this.getTableName(tablePrefix);
      
      if (!groups[tableName]) {
        groups[tableName] = [];
      }
      
      groups[tableName].push(field);
    }
    
    return groups;
  }
  
  /**
   * 取得資料表名稱
   */
  private getTableName(prefix: string): string {
    // 根據前綴推斷資料表名稱
    const tableMap: Record<string, string> = {
      'TA': 'ACPTA',
      'TB': 'ACPTB',
      'TC': 'ACPTC',
      'TD': 'ACPTD',
      // 可以根據需要擴充更多映射
    };
    
    return tableMap[prefix] || `TABLE_${prefix}`;
  }
  
  /**
   * 取得來源圖示
   */
  private getSourceIcon(source: string): string {
    switch (source) {
      case 'database':
        return '📊';
      case 'excel':
        return '📑';
      case 'merged':
        return '🔄';
      default:
        return '❓';
    }
  }
}