import { ExplorerService } from '../services/explorer.service';
import { OapmRecord } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';

export class MarkdownGenerator {
  constructor(private explorerService: ExplorerService) {}

  async generateAllFields(operation: string, outputPath: string): Promise<void> {
    console.log(chalk.blue(`📋 生成 ${operation} 完整欄位表格...`));

    try {
      // 獲取操作資料
      const result = await this.explorerService.getOperationData(operation, 0, 2000);
      
      if (result.records.length === 0) {
        throw new Error(`未找到操作 ${operation} 的資料`);
      }

      // 生成內容
      const content = this.generateAllFieldsContent(operation, result.records, result.totalCount);
      
      // 確保目錄存在
      await fs.mkdir(outputPath, { recursive: true });
      
      // 寫入檔案
      const filePath = path.join(outputPath, 'all-fields.md');
      await fs.writeFile(filePath, content, 'utf-8');
      
      console.log(chalk.green(`✓ 已生成 all-fields.md: ${filePath}`));
      
    } catch (error) {
      console.error(chalk.red('生成完整欄位表格失敗:'), error);
      throw error;
    }
  }

  async generateFieldMapping(operation: string, outputPath: string): Promise<void> {
    console.log(chalk.blue(`🗺️ 生成 ${operation} 欄位映射表...`));

    try {
      const result = await this.explorerService.getOperationData(operation, 0, 2000);
      
      if (result.records.length === 0) {
        throw new Error(`未找到操作 ${operation} 的資料`);
      }

      const content = this.generateFieldMappingContent(operation, result.records);
      
      await fs.mkdir(outputPath, { recursive: true });
      
      const filePath = path.join(outputPath, 'field-mapping.md');
      await fs.writeFile(filePath, content, 'utf-8');
      
      console.log(chalk.green(`✓ 已生成 field-mapping.md: ${filePath}`));
      
    } catch (error) {
      console.error(chalk.red('生成欄位映射表失敗:'), error);
      throw error;
    }
  }

  async generateQuickReference(operation: string, outputPath: string): Promise<void> {
    console.log(chalk.blue(`⚡ 生成 ${operation} 快速參考...`));

    try {
      const result = await this.explorerService.getOperationData(operation, 0, 2000);
      
      if (result.records.length === 0) {
        throw new Error(`未找到操作 ${operation} 的資料`);
      }

      const content = this.generateQuickReferenceContent(operation, result.records);
      
      await fs.mkdir(outputPath, { recursive: true });
      
      const filePath = path.join(outputPath, 'quick-reference.md');
      await fs.writeFile(filePath, content, 'utf-8');
      
      console.log(chalk.green(`✓ 已生成 quick-reference.md: ${filePath}`));
      
    } catch (error) {
      console.error(chalk.red('生成快速參考失敗:'), error);
      throw error;
    }
  }

  async generateUnknownFieldValues(operation: string, outputPath: string): Promise<void> {
    console.log(chalk.blue(`🔍 生成 ${operation} 未知欄位值資料表...`));

    try {
      const result = await this.explorerService.getOperationData(operation, 0, 2000);
      
      if (result.records.length === 0) {
        throw new Error(`未找到操作 ${operation} 的資料`);
      }

      const content = this.generateUnknownFieldValuesContent(operation, result.records, result.totalCount);
      
      await fs.mkdir(outputPath, { recursive: true });
      
      const filePath = path.join(outputPath, 'unknown-field-values.md');
      await fs.writeFile(filePath, content, 'utf-8');
      
      console.log(chalk.green(`✓ 已生成 unknown-field-values.md: ${filePath}`));
      
    } catch (error) {
      console.error(chalk.red('生成未知欄位值資料表失敗:'), error);
      throw error;
    }
  }

  private generateUnknownFieldValuesContent(operation: string, records: OapmRecord[], totalCount: number): string {
    let content = `# 未知欄位值資料表\n\n`;
    content += `**作業代號**: ${operation}\n`;
    content += `**最後更新**: ${new Date().toISOString().replace('T', 'T').replace(/\.\d{3}Z$/, '')}\n`;
    content += `**總記錄數**: ${records.length}\n`;
    
    // 統計資料表數量
    const tableGroups = this.groupByTable(records);
    const tableCount = Object.keys(tableGroups).length;
    const tableNames = Object.keys(tableGroups).join(', ');
    
    content += `**資料表數量**: ${tableCount} (${tableNames})\n\n`;

    // 生成未知欄位標題列
    const unknownFields = ['MB003', 'MB005', 'MB006', 'MB008', 'MB009', 'MB010', 'MB011', 'MB012', 'MB013', 'MB014', 'MB015', 'MB016', 'MB020', 'MB021', 'MB022', 'MB023', 'MB024', 'MB026', 'MB027', 'MB029', 'MB030', 'MB031', 'MB032', 'MB033'];
    
    content += `## 完整未知欄位值表格\n\n`;
    content += `| API欄位名稱 | ${unknownFields.join(' | ')} |\n`;
    content += `|${'-'.repeat(13)}|${unknownFields.map(() => '-'.repeat(7)).join('|')}|\n`;

    // 為每筆記錄生成表格行
    for (const record of records) {
      const apiField = record.MB004 || record.MB002 || '-';
      const values = unknownFields.map(field => {
        const value = (record as any)[field];
        if (value === null) return 'null';
        if (value === '') return '(空)';
        return String(value);
      });
      
      content += `| ${apiField} | ${values.join(' | ')} |\n`;
    }

    content += `\n## 表格說明\n\n`;
    content += `此表格包含 ${operation} 作業代號的所有 ${records.length} 筆記錄的未知欄位值，基於 ${new Date().toISOString().split('T')[0]} 從 OAPMB 資料庫的真實查詢結果生成。\n\n`;
    content += `- **第一欄**: API 欄位名稱（來自 MB004 欄位）\n`;
    content += `- **其餘欄位**: 對應的未知欄位值\n`;
    content += `- **null**: 表示資料庫中的 NULL 值\n`;
    content += `- **(空)**: 表示空字串\n\n`;

    // 欄位類型統計
    content += `## 欄位類型統計\n\n`;
    for (const [tableName, tableRecords] of Object.entries(tableGroups)) {
      content += `### ${tableName} 表格 (${tableRecords.length}筆記錄)\n`;
      content += `- 主要包含${this.getTableDescription(tableName)}資料\n`;
      content += `- 包含${this.getMainFieldTypes(tableRecords)}等主要欄位\n\n`;
    }

    // 未知欄位定義
    content += `## 未知欄位定義\n\n`;
    content += `基於真實資料分析：\n\n`;
    content += this.generateUnknownFieldDefinitions(records);

    // 相關檔案
    content += `## 相關檔案\n\n`;
    content += `- [README.md](./README.md) - 作業主要說明\n`;
    content += `- [field-data.json](./field-data.json) - 完整欄位資料快取\n`;
    content += `- [all-fields.md](./all-fields.md) - 完整欄位資料表格\n\n`;
    content += `---\n\n`;
    content += `**資料驗證**: 此檔案基於真實的 SQL Server OAPMB 資料表查詢結果生成，包含完整的 ${records.length} 筆 ${operation} 記錄。\n`;

    return content;
  }

  private generateAllFieldsContent(operation: string, records: OapmRecord[], totalCount: number): string {
    let content = `# ${operation} - 完整欄位資料表\n\n`;
    content += `> **生成時間**: ${new Date().toISOString()}\n`;
    content += `> **資料筆數**: ${records.length} / ${totalCount}\n`;
    content += `> **資料來源**: OAPMB 表\n\n`;

    content += `## 📊 統計摘要\n\n`;
    const stats = this.calculateStatistics(records);
    content += `- **總欄位數**: ${records.length}\n`;
    content += `- **資料表數**: ${Object.keys(stats.tableGroups).length}\n`;
    content += `- **必填欄位**: ${stats.requiredCount}\n`;
    content += `- **選填欄位**: ${stats.optionalCount}\n`;
    content += `- **資料型態**: ${stats.dataTypes.length} 種\n\n`;

    content += `## 📋 完整欄位列表\n\n`;
    content += `| # | 資料表 | DB欄位 | API欄位 | 型態 | 長度 | 必填 | 說明 | 格式/備註 |\n`;
    content += `|---|--------|--------|---------|------|------|------|------|----------|\n`;

    let index = 1;
    for (const record of records) {
      const tableName = record.MB001 || '-';
      const dbField = record.MB002 || '-';
      const apiField = record.MB004 || record.MB002 || '-';
      const dataType = record.MB017 || '-';
      const length = this.extractLength(record.MB028) || '-';
      const required = this.isRequired(record.MB019) ? '✅' : '❌';
      const description = record.MB018 || '-';
      const formatNote = this.combineFormatAndRemarks(record.MB007, record.MB019);

      content += `| ${index} | ${tableName} | ${dbField} | \`${apiField}\` | ${dataType} | ${length} | ${required} | ${description} | ${formatNote} |\n`;
      index++;
    }

    content += `\n## 📈 資料型態分布\n\n`;
    const typeDistribution = this.getDataTypeDistribution(records);
    for (const [type, count] of Object.entries(typeDistribution)) {
      content += `- **${type}**: ${count} 個欄位\n`;
    }

    content += `\n## 🔍 欄位搜尋索引\n\n`;
    content += this.generateFieldIndex(records);

    return content;
  }

  private generateFieldMappingContent(operation: string, records: OapmRecord[]): string {
    let content = `# ${operation} - 欄位映射對照表\n\n`;
    content += `> **生成時間**: ${new Date().toISOString()}\n`;
    content += `> **用途**: API 欄位名稱與資料庫欄位名稱對照\n\n`;

    content += `## 🗺️ API ↔ DB 欄位映射\n\n`;
    content += `| API 欄位名稱 | 資料庫欄位 | 資料表 | 資料型態 | 說明 |\n`;
    content += `|--------------|------------|--------|----------|------|\n`;

    // 按 API 欄位名稱排序
    const sortedRecords = records.sort((a, b) => {
      const aApi = a.MB004 || a.MB002 || '';
      const bApi = b.MB004 || b.MB002 || '';
      return aApi.localeCompare(bApi);
    });

    for (const record of sortedRecords) {
      const apiField = record.MB004 || record.MB002 || '-';
      const dbField = record.MB002 || '-';
      const tableName = record.MB001 || '-';
      const dataType = record.MB017 || '-';
      const description = record.MB018 || '-';

      content += `| \`${apiField}\` | ${dbField} | ${tableName} | ${dataType} | ${description} |\n`;
    }

    content += `\n## 📝 反向映射 (DB → API)\n\n`;
    content += `| 資料庫欄位 | API 欄位名稱 | 資料表 |\n`;
    content += `|------------|--------------|--------|\n`;

    const reverseSorted = records.sort((a, b) => {
      const aDb = a.MB002 || '';
      const bDb = b.MB002 || '';
      return aDb.localeCompare(bDb);
    });

    for (const record of reverseSorted) {
      const dbField = record.MB002 || '-';
      const apiField = record.MB004 || record.MB002 || '-';
      const tableName = record.MB001 || '-';

      content += `| ${dbField} | \`${apiField}\` | ${tableName} |\n`;
    }

    content += `\n## 🔧 程式開發參考\n\n`;
    content += `### TypeScript 介面定義\n\n`;
    content += `\`\`\`typescript\n`;
    content += `interface ${operation}Request {\n`;
    
    const groupedByTable = this.groupByTable(records);
    for (const [tableName, tableRecords] of Object.entries(groupedByTable)) {
      if (Object.keys(groupedByTable).length > 1) {
        content += `  // ${tableName} 相關欄位\n`;
      }
      
      for (const record of tableRecords.slice(0, 10)) { // 限制顯示數量
        const apiField = record.MB004 || record.MB002;
        const tsType = this.convertToTypeScriptType(record.MB017);
        const required = this.isRequired(record.MB019);
        const optional = required ? '' : '?';
        
        content += `  ${apiField}${optional}: ${tsType}; // ${record.MB018 || ''}\n`;
      }
    }
    
    content += `}\n`;
    content += `\`\`\`\n\n`;

    return content;
  }

  private generateQuickReferenceContent(operation: string, records: OapmRecord[]): string {
    let content = `# ${operation} - 快速參考指南\n\n`;
    content += `> **生成時間**: ${new Date().toISOString()}\n`;
    content += `> **用途**: 開發者快速查詢手冊\n\n`;

    // 必填欄位
    const requiredFields = records.filter(r => this.isRequired(r.MB019));
    if (requiredFields.length > 0) {
      content += `## ✅ 必填欄位 (${requiredFields.length} 個)\n\n`;
      content += `| API 欄位 | 型態 | 長度 | 說明 |\n`;
      content += `|----------|------|------|------|\n`;
      
      for (const record of requiredFields) {
        const apiField = record.MB004 || record.MB002;
        const dataType = record.MB017 || '-';
        const length = this.extractLength(record.MB028) || '-';
        const description = record.MB018 || '-';
        
        content += `| \`${apiField}\` | ${dataType} | ${length} | ${description} |\n`;
      }
      content += '\n';
    }

    // 日期欄位
    const dateFields = records.filter(r => {
      const format = r.MB007 || '';
      const type = r.MB017 || '';
      return format.includes('YYYYMMDD') || type.includes('date') || type.includes('datetime');
    });

    if (dateFields.length > 0) {
      content += `## 📅 日期時間欄位 (${dateFields.length} 個)\n\n`;
      content += `| API 欄位 | 格式 | 範例 | 說明 |\n`;
      content += `|----------|------|------|------|\n`;
      
      for (const record of dateFields) {
        const apiField = record.MB004 || record.MB002;
        const format = record.MB007 || 'YYYY-MM-DD';
        const example = this.generateDateExample(format);
        const description = record.MB018 || '-';
        
        content += `| \`${apiField}\` | ${format} | ${example} | ${description} |\n`;
      }
      content += '\n';
    }

    // 數值欄位
    const numericFields = records.filter(r => {
      const type = r.MB017 || '';
      return type.includes('int') || type.includes('decimal') || type.includes('numeric') || type.includes('money');
    });

    if (numericFields.length > 0) {
      content += `## 🔢 數值欄位 (${numericFields.length} 個)\n\n`;
      content += `| API 欄位 | 型態 | 範例 | 說明 |\n`;
      content += `|----------|------|------|------|\n`;
      
      for (const record of numericFields) {
        const apiField = record.MB004 || record.MB002;
        const dataType = record.MB017 || '-';
        const example = this.generateNumericExample(dataType);
        const description = record.MB018 || '-';
        
        content += `| \`${apiField}\` | ${dataType} | ${example} | ${description} |\n`;
      }
      content += '\n';
    }

    // 常見錯誤
    content += `## ⚠️ 常見錯誤與注意事項\n\n`;
    content += `### 資料格式錯誤\n\n`;
    content += `- **日期格式**: 必須使用 YYYYMMDD 格式，例如 20240101\n`;
    content += `- **數值格式**: 不可包含千分位逗號，小數點使用英文句號\n`;
    content += `- **字串長度**: 超過最大長度將被截斷\n`;
    content += `- **必填欄位**: 不可為 null 或空字串\n\n`;

    content += `### 業務邏輯檢查\n\n`;
    
    const businessRules = this.extractBusinessRules(records);
    if (businessRules.length > 0) {
      for (const rule of businessRules) {
        content += `- **${rule.field}**: ${rule.rule}\n`;
      }
    } else {
      content += `- 請參考業務需求文檔了解具體的業務邏輯限制\n`;
    }
    
    content += `\n## 🚀 API 呼叫範例\n\n`;
    content += this.generateApiExample(operation, records);

    return content;
  }

  // 輔助方法
  private calculateStatistics(records: OapmRecord[]) {
    const tableGroups = this.groupByTable(records);
    const dataTypes = new Set<string>();
    let requiredCount = 0;
    let optionalCount = 0;

    for (const record of records) {
      if (record.MB017) {
        dataTypes.add(record.MB017);
      }
      
      if (this.isRequired(record.MB019)) {
        requiredCount++;
      } else {
        optionalCount++;
      }
    }

    return {
      tableGroups,
      dataTypes: Array.from(dataTypes),
      requiredCount,
      optionalCount
    };
  }

  private groupByTable(records: OapmRecord[]): Record<string, OapmRecord[]> {
    const groups: Record<string, OapmRecord[]> = {};
    
    for (const record of records) {
      const table = record.MB001 || 'UNKNOWN';
      if (!groups[table]) {
        groups[table] = [];
      }
      groups[table].push(record);
    }
    
    return groups;
  }

  private getDataTypeDistribution(records: OapmRecord[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    for (const record of records) {
      const type = record.MB017 || 'unknown';
      distribution[type] = (distribution[type] || 0) + 1;
    }
    
    return distribution;
  }

  private generateFieldIndex(records: OapmRecord[]): string {
    const index: Record<string, string[]> = {};
    
    for (const record of records) {
      const apiField = record.MB004 || record.MB002;
      const firstChar = apiField.charAt(0).toUpperCase();
      
      if (!index[firstChar]) {
        index[firstChar] = [];
      }
      
      index[firstChar].push(apiField);
    }
    
    let indexContent = '';
    for (const [char, fields] of Object.entries(index).sort()) {
      indexContent += `### ${char}\n\n`;
      for (const field of fields.sort()) {
        indexContent += `- \`${field}\`\n`;
      }
      indexContent += '\n';
    }
    
    return indexContent;
  }

  private convertToTypeScriptType(sqlType: string): string {
    const type = sqlType?.toLowerCase() || '';
    
    if (type.includes('int') || type.includes('numeric') || type.includes('decimal') || type.includes('money')) {
      return 'number';
    }
    
    if (type.includes('bit')) {
      return 'boolean';
    }
    
    if (type.includes('date')) {
      return 'string'; // 通常以字串格式傳遞
    }
    
    return 'string';
  }

  private generateDateExample(format: string): string {
    if (format.includes('YYYYMMDD')) {
      return '20240101';
    }
    
    if (format.includes('YYYY-MM-DD')) {
      return '2024-01-01';
    }
    
    return '2024-01-01T09:00:00';
  }

  private generateNumericExample(dataType: string): string {
    const type = dataType.toLowerCase();
    
    if (type.includes('money')) {
      return '1000.00';
    }
    
    if (type.includes('decimal') || type.includes('numeric')) {
      return '123.45';
    }
    
    return '123';
  }

  private extractBusinessRules(records: OapmRecord[]): Array<{field: string, rule: string}> {
    const rules: Array<{field: string, rule: string}> = [];
    
    for (const record of records) {
      const apiField = record.MB004 || record.MB002;
      const remarks = record.MB019 || '';
      const validation = record.MB009 || '';
      
      if (remarks.includes('不可為空') || remarks.includes('必填')) {
        rules.push({
          field: apiField,
          rule: '不可為空值'
        });
      }
      
      if (validation && validation !== '') {
        rules.push({
          field: apiField,
          rule: `驗證規則: ${validation}`
        });
      }
    }
    
    return rules;
  }

  private generateApiExample(operation: string, records: OapmRecord[]): string {
    let example = `\`\`\`json\n`;
    example += `{\n`;
    example += `  "operation": "${operation}",\n`;
    example += `  "data": {\n`;
    
    const sampleFields = records.slice(0, 8);
    for (let i = 0; i < sampleFields.length; i++) {
      const record = sampleFields[i];
      const apiField = record.MB004 || record.MB002;
      const sampleValue = this.generateSampleValue(record);
      const comma = i < sampleFields.length - 1 ? ',' : '';
      
      example += `    "${apiField}": ${sampleValue}${comma}\n`;
    }
    
    example += `  }\n`;
    example += `}\n`;
    example += `\`\`\`\n\n`;
    
    return example;
  }

  // 輔助方法
  private extractLength(mb028: string): string {
    if (!mb028) return '';
    
    const match = mb028.match(/欄位長度:(\d+)/);
    return match ? match[1] : '';
  }

  private isRequired(remarks: string): boolean {
    if (!remarks) return false;
    
    return remarks.includes('必填') || 
           remarks.includes('必須') || 
           remarks.includes('required');
  }

  private combineFormatAndRemarks(format: string, remarks: string): string {
    const parts: string[] = [];
    
    if (format && format !== '') {
      parts.push(format);
    }
    
    if (remarks && remarks !== '') {
      parts.push(remarks);
    }
    
    return parts.join(' / ') || '-';
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
      case 'money':
        return '1000.00';
      case 'bit':
        return 'true';
      case 'datetime':
        return '"2024-01-01T09:00:00"';
      case 'date':
        return '"2024-01-01"';
      default:
        return '"範例值"';
    }
  }

  private getTableDescription(tableName: string): string {
    switch (tableName) {
      case 'ACPTA':
        return '憑單主檔';
      case 'ACPTB':
        return '憑單明細';
      case 'INVTA':
        return '庫存主檔';
      case 'INVTB':
        return '庫存明細';
      default:
        return '相關業務';
    }
  }

  private getMainFieldTypes(records: OapmRecord[]): string {
    const fieldTypes = new Set<string>();
    
    // 分析欄位類型
    for (const record of records) {
      const apiField = record.MB004 || record.MB002 || '';
      
      if (apiField.includes('date') || apiField.includes('time')) {
        fieldTypes.add('日期時間');
      } else if (apiField.includes('amt') || apiField.includes('amount') || apiField.includes('price')) {
        fieldTypes.add('金額');
      } else if (apiField.includes('no') || apiField.includes('id') || apiField.includes('code')) {
        fieldTypes.add('編號代碼');
      } else if (apiField.includes('name') || apiField.includes('title')) {
        fieldTypes.add('名稱說明');
      }
    }
    
    return Array.from(fieldTypes).slice(0, 3).join('、') || '各類業務';
  }

  private generateUnknownFieldDefinitions(records: OapmRecord[]): string {
    const fieldAnalysis: Record<string, Set<string>> = {};
    const unknownFields = ['MB003', 'MB005', 'MB006', 'MB008', 'MB009', 'MB010', 'MB011', 'MB012', 'MB013', 'MB014', 'MB015', 'MB016', 'MB020', 'MB021', 'MB022', 'MB023', 'MB024', 'MB026', 'MB027', 'MB029', 'MB030', 'MB031', 'MB032', 'MB033'];
    
    // 分析每個未知欄位的值分布
    for (const field of unknownFields) {
      fieldAnalysis[field] = new Set();
      
      for (const record of records) {
        const value = (record as any)[field];
        if (value !== null && value !== '') {
          fieldAnalysis[field].add(String(value));
        }
      }
    }

    let definitions = '';
    
    for (const field of unknownFields) {
      const values = Array.from(fieldAnalysis[field]);
      const uniqueValues = values.slice(0, 5); // 只顯示前5個值作為範例
      const description = this.getFieldDescription(field, values);
      
      if (values.length > 0) {
        definitions += `- **${field}**: ${description}`;
        if (uniqueValues.length > 0) {
          definitions += `，範例值: ${uniqueValues.map(v => `'${v}'`).join(', ')}`;
        }
        definitions += '\n';
      } else {
        definitions += `- **${field}**: 保留欄位，所有記錄都是空值或 null\n`;
      }
    }
    
    return definitions;
  }

  private getFieldDescription(field: string, values: string[]): string {
    const hasNumbers = values.some(v => /^\d+$/.test(v));
    const hasYN = values.some(v => v === 'Y' || v === 'N');
    const hasVersion = values.some(v => /^\d+\.\d+\.\d+\.\d+$/.test(v));
    
    switch (field) {
      case 'MB003':
        return '資料類型標記';
      case 'MB005':
        return '序號或優先級';
      case 'MB006':
        return '類別代碼';
      case 'MB008':
      case 'MB010':
        return hasYN ? '布林值標記' : '狀態標記';
      case 'MB009':
        return hasNumbers ? '數值型標記' : '計數器';
      case 'MB011':
        return '選項清單格式';
      case 'MB012':
        return '中文說明文字';
      case 'MB013':
        return '預設值設定';
      case 'MB014':
        return '保留欄位';
      case 'MB015':
        return '保留欄位';
      case 'MB016':
        return hasVersion ? '版本或系統標記' : '系統資訊';
      case 'MB032':
        return hasVersion ? '版本控制' : '系統版本';
      case 'MB033':
        return '權限管理標記';
      default:
        if (hasYN) return '功能開關';
        if (hasNumbers) return '數值設定';
        return '系統設定';
    }
  }
}