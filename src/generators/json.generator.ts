import { ExplorerService } from '../services/explorer.service';
import { OapmRecord } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';

export class JsonGenerator {
  constructor(private explorerService: ExplorerService) {}

  async generate(operation: string, outputPath: string): Promise<void> {
    console.log(chalk.blue(`📄 生成 ${operation} JSON 資料...`));

    try {
      // 獲取操作資料
      const result = await this.explorerService.getOperationData(operation, 0, 1000);
      
      if (result.records.length === 0) {
        throw new Error(`未找到操作 ${operation} 的資料`);
      }

      // 生成結構化資料
      const jsonData = this.generateStructuredData(operation, result.records, result.totalCount);
      
      // 確保目錄存在
      await fs.mkdir(outputPath, { recursive: true });
      
      // 寫入檔案
      const filePath = path.join(outputPath, 'field-data.json');
      await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');
      
      console.log(chalk.green(`✓ 已生成 field-data.json: ${filePath}`));
      
    } catch (error) {
      console.error(chalk.red('生成 JSON 失敗:'), error);
      throw error;
    }
  }

  private generateStructuredData(operation: string, records: OapmRecord[], totalCount: number) {
    const tables = this.groupByTable(records);
    const fieldMappings = this.extractFieldMappings(records);
    const stats = this.calculateStats(records, tables);

    return {
      operation_code: operation,
      generated_at: new Date().toISOString(),
      data_source: 'OAPMB',
      total_records_in_db: totalCount,
      analyzed_fields: records.length,
      
      // 統計資訊
      statistics: {
        total_fields: records.length,
        tables_involved: Object.keys(tables).length,
        required_fields: stats.requiredFields.length,
        optional_fields: stats.optionalFields.length,
        data_types_used: stats.dataTypes.length
      },

      // 按資料表分組的欄位
      tables: tables,

      // 欄位映射（DB欄位 -> API欄位）
      field_mappings: fieldMappings,

      // 資料型態定義
      data_types: this.getDataTypeDefinitions(records),

      // 驗證規則
      validation_rules: this.extractValidationRules(records),

      // 範例資料
      sample_data: this.generateSampleData(records),

      // 元資料
      metadata: {
        generator: 'digiwin-oap-docs-generate',
        version: '1.0.0',
        note: '此檔案由實際資料庫查詢自動生成，請勿手動修改'
      }
    };
  }

  private groupByTable(records: OapmRecord[]): Record<string, any[]> {
    const tables: Record<string, any[]> = {};
    
    for (const record of records) {
      const tableName = record.MB001 || 'UNKNOWN';
      
      if (!tables[tableName]) {
        tables[tableName] = [];
      }
      
      tables[tableName].push({
        db_field: record.MB002,
        api_field: record.MB004 || record.MB002,
        data_type: record.MB017,
        max_length: this.extractLength(record.MB028),
        description: record.MB018,
        format_example: record.MB007,
        remarks: record.MB019,
        is_required: this.isRequired(record.MB019),
        default_value: record.MB006,
        field_group: record.MB008,
        validation_type: record.MB009,
        display_order: record.MB011,
        raw_info: record.MB028
      });
    }
    
    // 對每個表的欄位按 display_order 或 db_field 排序
    for (const tableName of Object.keys(tables)) {
      tables[tableName].sort((a, b) => {
        const orderA = parseInt(a.display_order) || 999;
        const orderB = parseInt(b.display_order) || 999;
        
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        
        return (a.db_field || '').localeCompare(b.db_field || '');
      });
    }
    
    return tables;
  }

  private extractFieldMappings(records: OapmRecord[]): Record<string, string> {
    const mappings: Record<string, string> = {};
    
    for (const record of records) {
      const dbField = record.MB002;
      const apiField = record.MB004 || record.MB002;
      
      if (dbField && apiField) {
        mappings[dbField] = apiField;
      }
    }
    
    return mappings;
  }

  private calculateStats(records: OapmRecord[], tables: Record<string, any[]>) {
    const requiredFields: string[] = [];
    const optionalFields: string[] = [];
    const dataTypes = new Set<string>();
    
    for (const record of records) {
      const apiField = record.MB004 || record.MB002;
      
      if (this.isRequired(record.MB019)) {
        requiredFields.push(apiField);
      } else {
        optionalFields.push(apiField);
      }
      
      if (record.MB017) {
        dataTypes.add(record.MB017);
      }
    }
    
    return {
      requiredFields: requiredFields.sort(),
      optionalFields: optionalFields.sort(),
      dataTypes: Array.from(dataTypes).sort()
    };
  }

  private getDataTypeDefinitions(records: OapmRecord[]): Record<string, any> {
    const dataTypes: Record<string, any> = {};
    
    for (const record of records) {
      const type = record.MB017;
      if (!type || dataTypes[type]) continue;
      
      dataTypes[type] = {
        sql_type: type,
        description: this.getDataTypeDescription(type),
        typical_length: this.getTypicalLength(records, type),
        validation_notes: this.getValidationNotes(type)
      };
    }
    
    return dataTypes;
  }

  private extractValidationRules(records: OapmRecord[]): Record<string, any> {
    const rules: Record<string, any> = {};
    
    for (const record of records) {
      const apiField = record.MB004 || record.MB002;
      const validationType = record.MB009;
      const validationParam = record.MB010;
      const format = record.MB007;
      const maxLength = this.extractLength(record.MB028);
      
      if (apiField) {
        rules[apiField] = {
          required: this.isRequired(record.MB019),
          max_length: maxLength,
          data_type: record.MB017,
          format_pattern: format,
          validation_type: validationType,
          validation_params: validationParam,
          default_value: record.MB006
        };
      }
    }
    
    return rules;
  }

  private generateSampleData(records: OapmRecord[]): Record<string, any> {
    const sample: Record<string, any> = {};
    
    // 取前10個欄位作為範例
    const sampleRecords = records.slice(0, 10);
    
    for (const record of sampleRecords) {
      const apiField = record.MB004 || record.MB002;
      
      if (apiField) {
        sample[apiField] = this.generateSampleValue(record);
      }
    }
    
    return sample;
  }

  private extractLength(mb028: string): number | null {
    if (!mb028) return null;
    
    const match = mb028.match(/欄位長度:(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  private isRequired(remarks: string): boolean {
    if (!remarks) return false;
    
    return remarks.includes('必填') || 
           remarks.includes('必須') || 
           remarks.includes('required') ||
           remarks.includes('Required');
  }

  private getDataTypeDescription(dataType: string): string {
    const descriptions: Record<string, string> = {
      'nvarchar': '可變長度 Unicode 字串',
      'nchar': '固定長度 Unicode 字串',
      'varchar': '可變長度字串',
      'char': '固定長度字串',
      'int': '32位元整數',
      'decimal': '精確數值（小數）',
      'numeric': '精確數值',
      'datetime': '日期時間',
      'date': '日期',
      'bit': '布林值 (0/1)',
      'float': '浮點數',
      'money': '貨幣數值',
      'text': '長文字',
      'ntext': '長文字 (Unicode)'
    };
    
    return descriptions[dataType] || `未知型態: ${dataType}`;
  }

  private getTypicalLength(records: OapmRecord[], dataType: string): string {
    const lengths: number[] = [];
    
    for (const record of records) {
      if (record.MB017 === dataType) {
        const length = this.extractLength(record.MB028);
        if (length) {
          lengths.push(length);
        }
      }
    }
    
    if (lengths.length === 0) return '未指定';
    
    const min = Math.min(...lengths);
    const max = Math.max(...lengths);
    
    return min === max ? `${min}` : `${min}-${max}`;
  }

  private getValidationNotes(dataType: string): string {
    const notes: Record<string, string> = {
      'nvarchar': '支援中文字符，長度計算以字符為單位',
      'nchar': '固定長度，不足時自動補空格',
      'int': '範圍：-2,147,483,648 到 2,147,483,647',
      'decimal': '指定精度和小數位數',
      'datetime': '格式：YYYY-MM-DD HH:MM:SS',
      'date': '格式：YYYY-MM-DD 或 YYYYMMDD',
      'bit': '只接受 0 或 1',
      'money': '貨幣格式，支援4位小數'
    };
    
    return notes[dataType] || '';
  }

  private generateSampleValue(record: OapmRecord): any {
    const dataType = record.MB017 || '';
    const format = record.MB007 || '';
    const defaultValue = record.MB006;
    
    // 如果有預設值，優先使用
    if (defaultValue && defaultValue !== '') {
      return defaultValue;
    }
    
    // 根據格式範例生成
    if (format.includes('YYYYMMDD')) {
      return '20240101';
    }
    
    // 根據資料型態生成
    switch (dataType.toLowerCase()) {
      case 'int':
        return 123;
      case 'numeric':
      case 'decimal':
        return 123.45;
      case 'money':
        return 1000.00;
      case 'bit':
        return 1;
      case 'datetime':
        return '2024-01-01T09:00:00';
      case 'date':
        return '2024-01-01';
      case 'nvarchar':
      case 'nchar':
        return '範例文字';
      case 'varchar':
      case 'char':
        return 'Sample Text';
      default:
        return '範例值';
    }
  }
}