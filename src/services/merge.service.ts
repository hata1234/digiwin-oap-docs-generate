import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { ExcelField, ExcelWorkbook } from './excel-import.service';

export interface MergeField {
  apiName: string;
  dbColumn: string;
  dataType: string;
  maxLength?: number;
  required: boolean;
  description: string;
  validation?: string;
  example?: string;
  remark?: string;
  source: 'database' | 'excel' | 'merged';
  conflicts?: {
    field: string;
    dbValue: any;
    excelValue: any;
  }[];
}

export interface MergeResult {
  operationCode: string;
  totalFields: number;
  newFields: number;
  updatedFields: number;
  conflicts: number;
  fields: MergeField[];
  report: string;
}

export class MergeService {
  private readonly API_METHODS_PATH = '/opt/apiserv/erp_api_docs/api_methods';
  
  /**
   * 讀取現有的欄位資料
   */
  async readExistingFieldData(operationCode: string): Promise<any> {
    try {
      const fieldDataPath = path.join(
        this.API_METHODS_PATH,
        operationCode,
        'field-data.json'
      );
      
      const exists = await this.fileExists(fieldDataPath);
      if (!exists) {
        return null;
      }
      
      const content = await fs.readFile(fieldDataPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(chalk.red(`讀取現有欄位資料失敗: ${operationCode}`), error);
      return null;
    }
  }
  
  /**
   * 合併 Excel 和資料庫的欄位資料
   */
  async mergeFields(
    operationCode: string,
    excelWorkbooks: ExcelWorkbook[]
  ): Promise<MergeResult> {
    // 讀取現有的資料庫欄位資料
    const existingData = await this.readExistingFieldData(operationCode);
    const dbFields = existingData?.fields || [];
    
    // 整合所有 Excel 的欄位
    const allExcelFields: ExcelField[] = [];
    for (const workbook of excelWorkbooks) {
      allExcelFields.push(...workbook.fields);
    }
    
    // 建立欄位映射表
    const dbFieldMap = new Map<string, any>();
    const excelFieldMap = new Map<string, ExcelField>();
    
    // 以 API 名稱為主鍵建立映射
    dbFields.forEach((field: any) => {
      const apiName = field.api_name || field.apiName;
      if (apiName) {
        dbFieldMap.set(apiName.toLowerCase(), field);
      }
    });
    
    allExcelFields.forEach(field => {
      if (field.apiName) {
        excelFieldMap.set(field.apiName.toLowerCase(), field);
      }
    });
    
    // 合併欄位
    const mergedFields: MergeField[] = [];
    const conflicts: any[] = [];
    let newFields = 0;
    let updatedFields = 0;
    
    // 處理所有欄位（Excel 優先）
    const allFieldNames = new Set([
      ...Array.from(dbFieldMap.keys()),
      ...Array.from(excelFieldMap.keys())
    ]);
    
    for (const fieldName of allFieldNames) {
      const dbField = dbFieldMap.get(fieldName);
      const excelField = excelFieldMap.get(fieldName);
      
      if (!dbField && excelField) {
        // 新欄位（只在 Excel 中存在）
        mergedFields.push({
          apiName: excelField.apiName,
          dbColumn: excelField.dbColumn,
          dataType: excelField.dataType,
          maxLength: excelField.maxLength,
          required: excelField.required,
          description: excelField.description,
          validation: excelField.validation,
          example: excelField.example,
          remark: excelField.remark,
          source: 'excel'
        });
        newFields++;
      } else if (dbField && !excelField) {
        // 只在資料庫中存在的欄位
        mergedFields.push({
          apiName: dbField.api_name || dbField.apiName,
          dbColumn: dbField.db_column || dbField.dbColumn,
          dataType: dbField.data_type || dbField.dataType,
          maxLength: dbField.max_length || dbField.maxLength,
          required: false, // 資料庫沒有必填資訊，預設為 false
          description: dbField.description || '',
          source: 'database'
        });
      } else if (dbField && excelField) {
        // 兩邊都有的欄位，需要合併
        const merged = this.mergeField(dbField, excelField);
        mergedFields.push(merged);
        
        if (merged.conflicts && merged.conflicts.length > 0) {
          conflicts.push({
            fieldName: merged.apiName,
            conflicts: merged.conflicts
          });
        }
        
        updatedFields++;
      }
    }
    
    // 產生報告
    const report = this.generateMergeReport({
      operationCode,
      totalFields: mergedFields.length,
      newFields,
      updatedFields,
      conflicts: conflicts.length,
      conflictDetails: conflicts
    });
    
    return {
      operationCode,
      totalFields: mergedFields.length,
      newFields,
      updatedFields,
      conflicts: conflicts.length,
      fields: mergedFields,
      report
    };
  }
  
  /**
   * 合併單個欄位
   */
  private mergeField(dbField: any, excelField: ExcelField): MergeField {
    const conflicts: any[] = [];
    
    // 檢查衝突
    if (dbField.db_column !== excelField.dbColumn && 
        dbField.db_column && excelField.dbColumn) {
      conflicts.push({
        field: 'dbColumn',
        dbValue: dbField.db_column,
        excelValue: excelField.dbColumn
      });
    }
    
    if (dbField.data_type !== excelField.dataType && 
        dbField.data_type && excelField.dataType) {
      conflicts.push({
        field: 'dataType',
        dbValue: dbField.data_type,
        excelValue: excelField.dataType
      });
    }
    
    // Excel 優先的合併策略
    return {
      apiName: excelField.apiName || dbField.api_name,
      dbColumn: excelField.dbColumn || dbField.db_column,
      dataType: dbField.data_type || excelField.dataType, // 資料型態以資料庫為準
      maxLength: dbField.max_length || excelField.maxLength, // 長度以資料庫為準
      required: excelField.required, // 必填資訊以 Excel 為準
      description: excelField.description || dbField.description, // 說明以 Excel 為準
      validation: excelField.validation,
      example: excelField.example,
      remark: excelField.remark,
      source: 'merged',
      conflicts: conflicts.length > 0 ? conflicts : undefined
    };
  }
  
  /**
   * 產生合併報告
   */
  private generateMergeReport(data: any): string {
    const lines: string[] = [];
    
    lines.push(`# ${data.operationCode} Excel 匯入報告`);
    lines.push('');
    lines.push(`生成時間: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('## 📊 匯入統計');
    lines.push('');
    lines.push(`- 總欄位數: ${data.totalFields}`);
    lines.push(`- 新增欄位: ${data.newFields}`);
    lines.push(`- 更新欄位: ${data.updatedFields}`);
    lines.push(`- 衝突數量: ${data.conflicts}`);
    lines.push('');
    
    if (data.conflicts > 0) {
      lines.push('## ⚠️ 衝突清單');
      lines.push('');
      
      for (const conflict of data.conflictDetails) {
        lines.push(`### ${conflict.fieldName}`);
        lines.push('');
        
        for (const detail of conflict.conflicts) {
          lines.push(`- **${detail.field}**:`);
          lines.push(`  - 資料庫值: \`${detail.dbValue}\``);
          lines.push(`  - Excel 值: \`${detail.excelValue}\``);
        }
        lines.push('');
      }
    }
    
    lines.push('## 📝 合併策略');
    lines.push('');
    lines.push('- 必填資訊: Excel 優先');
    lines.push('- 欄位說明: Excel 優先');
    lines.push('- 資料型態: 資料庫優先');
    lines.push('- 最大長度: 資料庫優先');
    lines.push('- 驗證規則: Excel 獨有');
    lines.push('');
    
    return lines.join('\n');
  }
  
  /**
   * 儲存合併結果
   */
  async saveMergeResult(result: MergeResult): Promise<void> {
    const outputDir = path.join(this.API_METHODS_PATH, result.operationCode);
    
    // 確保目錄存在
    await fs.mkdir(outputDir, { recursive: true });
    
    // 儲存合併報告
    const reportPath = path.join(outputDir, 'excel-merge-report.md');
    await fs.writeFile(reportPath, result.report, 'utf-8');
    
    // 儲存合併後的欄位資料
    const mergedFieldsPath = path.join(outputDir, 'merged-fields.json');
    await fs.writeFile(
      mergedFieldsPath,
      JSON.stringify(result, null, 2),
      'utf-8'
    );
    
    // 如果有衝突，單獨儲存衝突清單
    if (result.conflicts > 0) {
      const conflictsPath = path.join(outputDir, 'merge-conflicts.json');
      const conflicts = result.fields
        .filter(f => f.conflicts && f.conflicts.length > 0)
        .map(f => ({
          fieldName: f.apiName,
          conflicts: f.conflicts
        }));
      
      await fs.writeFile(
        conflictsPath,
        JSON.stringify(conflicts, null, 2),
        'utf-8'
      );
    }
  }
  
  /**
   * 檢查檔案是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}