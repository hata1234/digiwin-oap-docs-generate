import { ExplorerService } from '../services/explorer.service';
import { OapmRecord } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';

export class ReadmeGenerator {
  constructor(private explorerService: ExplorerService) {}

  async generate(operation: string, outputPath: string): Promise<void> {
    console.log(chalk.blue(`📝 生成 ${operation} README 文檔...`));

    try {
      // 獲取操作資料
      const result = await this.explorerService.getOperationData(operation, 0, 1000);
      
      if (result.records.length === 0) {
        throw new Error(`未找到操作 ${operation} 的資料`);
      }

      // 生成內容
      const content = await this.generateContent(operation, result.records, result.totalCount);
      
      // 確保目錄存在
      await fs.mkdir(outputPath, { recursive: true });
      
      // 寫入檔案
      const filePath = path.join(outputPath, 'README.md');
      await fs.writeFile(filePath, content, 'utf-8');
      
      console.log(chalk.green(`✓ 已生成 README.md: ${filePath}`));
      
    } catch (error) {
      console.error(chalk.red('生成 README 失敗:'), error);
      throw error;
    }
  }

  private async generateContent(operation: string, records: OapmRecord[], totalCount: number): Promise<string> {
    const groupedByTable = this.groupRecordsByTable(records);
    const fieldSummary = this.analyzeFields(records);
    
    let content = `# ${operation} - ERP API 欄位文檔\n\n`;
    content += `> **自動生成時間**: ${new Date().toISOString()}\n`;
    content += `> **資料來源**: OAPMB 表，共 ${totalCount} 筆記錄\n\n`;

    // 概述
    content += `## 📋 概述\n\n`;
    content += `- **操作代碼**: ${operation}\n`;
    content += `- **總欄位數**: ${records.length}\n`;
    content += `- **涉及資料表**: ${Object.keys(groupedByTable).length} 個\n`;
    content += `- **實際資料筆數**: ${totalCount}\n\n`;

    // 資料表摘要
    content += `## 📊 資料表摘要\n\n`;
    content += `| 資料表名稱 | 欄位數量 | 說明 |\n`;
    content += `|------------|----------|------|\n`;
    
    for (const [tableName, tableRecords] of Object.entries(groupedByTable)) {
      const description = this.getTableDescription(tableName);
      content += `| ${tableName} | ${tableRecords.length} | ${description} |\n`;
    }
    content += '\n';

    // 欄位分析
    if (fieldSummary.requiredFields.length > 0) {
      content += `## ✅ 必填欄位\n\n`;
      for (const field of fieldSummary.requiredFields) {
        content += `- \`${field}\`\n`;
      }
      content += '\n';
    }

    // 各資料表詳細欄位
    content += `## 📝 詳細欄位說明\n\n`;
    
    for (const [tableName, tableRecords] of Object.entries(groupedByTable)) {
      content += `### ${tableName}\n\n`;
      content += this.generateTableFieldsTable(tableRecords);
      content += '\n';
    }

    // 資料格式說明
    content += `## 📋 資料格式規範\n\n`;
    content += this.generateFormatRules(records);

    // 範例資料
    if (records.length > 0) {
      content += `## 🔍 範例資料\n\n`;
      content += this.generateSampleData(records.slice(0, 3));
    }

    // 使用說明
    content += `## 🚀 使用說明\n\n`;
    content += `### API 呼叫格式\n\n`;
    content += `\`\`\`json\n`;
    content += `{\n`;
    content += `  "operation": "${operation}",\n`;
    content += `  "data": {\n`;
    
    const sampleFields = records.slice(0, 5);
    for (let i = 0; i < sampleFields.length; i++) {
      const record = sampleFields[i];
      const comma = i < sampleFields.length - 1 ? ',' : '';
      content += `    "${record.MB004 || record.MB002}": "範例值"${comma}\n`;
    }
    
    content += `  }\n`;
    content += `}\n`;
    content += `\`\`\`\n\n`;

    // 注意事項
    content += `## ⚠️ 注意事項\n\n`;
    content += `1. 本文檔基於實際資料庫查詢自動生成\n`;
    content += `2. 日期格式統一使用 YYYYMMDD（西元年月日）\n`;
    content += `3. 必填欄位根據備註欄位（MB019）判定\n`;
    content += `4. 欄位長度限制請參考各欄位的詳細說明\n`;
    content += `5. 空值處理：NULL 和空字串視為相同\n\n`;

    return content;
  }

  private groupRecordsByTable(records: OapmRecord[]): Record<string, OapmRecord[]> {
    const grouped: Record<string, OapmRecord[]> = {};
    
    for (const record of records) {
      const tableName = record.MB001 || 'UNKNOWN';
      if (!grouped[tableName]) {
        grouped[tableName] = [];
      }
      grouped[tableName].push(record);
    }
    
    return grouped;
  }

  private analyzeFields(records: OapmRecord[]): {
    requiredFields: string[];
    optionalFields: string[];
    totalFields: number;
  } {
    const required: Set<string> = new Set();
    const optional: Set<string> = new Set();
    
    for (const record of records) {
      const fieldName = record.MB004 || record.MB002 || 'unknown';
      const remarks = record.MB019 || '';
      
      if (remarks.includes('必填') || remarks.includes('必須') || remarks.includes('required')) {
        required.add(fieldName);
      } else {
        optional.add(fieldName);
      }
    }
    
    return {
      requiredFields: Array.from(required).sort(),
      optionalFields: Array.from(optional).sort(),
      totalFields: records.length
    };
  }

  private getTableDescription(tableName: string): string {
    const descriptions: Record<string, string> = {
      'ACPTA': '應付帳款主檔',
      'ACPTB': '應付帳款明細',
      'INVMB': '庫存主檔',
      'INVMC': '庫存異動',
      'MOCTA': '製令主檔',
      'MOCTB': '製令明細',
      'PURTA': '採購單主檔',
      'PURTB': '採購單明細'
    };
    
    return descriptions[tableName] || '資料表';
  }

  private generateTableFieldsTable(records: OapmRecord[]): string {
    let table = `| API 欄位名稱 | 資料庫欄位 | 型態 | 長度 | 說明 | 備註 |\n`;
    table += `|--------------|------------|------|------|------|------|\n`;
    
    // 按 MB002 排序
    const sortedRecords = records.sort((a, b) => {
      const aField = a.MB002 || '';
      const bField = b.MB002 || '';
      return aField.localeCompare(bField);
    });
    
    for (const record of sortedRecords) {
      const apiField = record.MB004 || record.MB002 || '-';
      const dbField = record.MB002 || '-';
      const dataType = record.MB017 || '-';
      const length = this.extractLength(record.MB028);
      const description = record.MB018 || '-';
      const remarks = record.MB019 || record.MB007 || '-';
      
      table += `| \`${apiField}\` | ${dbField} | ${dataType} | ${length} | ${description} | ${remarks} |\n`;
    }
    
    return table;
  }

  private extractLength(mb028: string): string {
    if (!mb028) return '-';
    
    const match = mb028.match(/欄位長度:(\d+)/);
    return match ? match[1] : '-';
  }

  private generateFormatRules(records: OapmRecord[]): string {
    const dataTypes = new Set<string>();
    const dateFields: string[] = [];
    
    for (const record of records) {
      if (record.MB017) {
        dataTypes.add(record.MB017);
      }
      
      const format = record.MB007 || '';
      if (format.includes('YYYYMMDD') || format.includes('日期')) {
        dateFields.push(record.MB004 || record.MB002);
      }
    }
    
    let rules = `### 資料型態說明\n\n`;
    for (const type of Array.from(dataTypes).sort()) {
      const description = this.getDataTypeDescription(type);
      rules += `- **${type}**: ${description}\n`;
    }
    
    if (dateFields.length > 0) {
      rules += `\n### 日期欄位\n\n`;
      rules += `以下欄位使用日期格式 (YYYYMMDD)：\n`;
      for (const field of dateFields) {
        rules += `- \`${field}\`\n`;
      }
    }
    
    rules += '\n';
    return rules;
  }

  private getDataTypeDescription(dataType: string): string {
    const descriptions: Record<string, string> = {
      'nvarchar': '可變長度 Unicode 字串',
      'nchar': '固定長度 Unicode 字串',
      'varchar': '可變長度字串',
      'char': '固定長度字串',
      'int': '32位元整數',
      'decimal': '精確數值',
      'numeric': '精確數值',
      'datetime': '日期時間',
      'date': '日期',
      'bit': '布林值 (0/1)',
      'float': '浮點數',
      'money': '貨幣數值'
    };
    
    return descriptions[dataType] || dataType;
  }

  private generateSampleData(records: OapmRecord[]): string {
    let sample = `\`\`\`json\n`;
    sample += `{\n`;
    
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const apiField = record.MB004 || record.MB002;
      const sampleValue = this.generateSampleValue(record);
      const comma = i < records.length - 1 ? ',' : '';
      
      sample += `  "${apiField}": ${sampleValue}${comma}\n`;
    }
    
    sample += `}\n`;
    sample += `\`\`\`\n\n`;
    
    return sample;
  }

  private generateSampleValue(record: OapmRecord): string {
    const dataType = record.MB017 || '';
    const format = record.MB007 || '';
    
    if (format.includes('YYYYMMDD')) {
      return '"20240101"';
    }
    
    switch (dataType.toLowerCase()) {
      case 'int':
      case 'numeric':
      case 'decimal':
        return '123';
      case 'bit':
        return '1';
      case 'datetime':
        return '"2024-01-01T00:00:00"';
      case 'date':
        return '"2024-01-01"';
      default:
        return '"範例值"';
    }
  }
}