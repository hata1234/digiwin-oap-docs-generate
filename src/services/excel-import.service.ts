import * as XLSX from 'xlsx';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';

export interface ExcelField {
  apiName: string;           // API 欄位名稱
  dbColumn: string;          // 資料庫欄位
  dataType: string;          // 資料型態
  maxLength?: number;        // 最大長度
  required: boolean;         // 是否必填
  description: string;       // 欄位說明
  validation?: string;       // 驗證規則
  example?: string;          // 範例值
  remark?: string;           // 備註
}

export interface ApiServiceInfo {
  serviceName: string;        // 服務名稱
  serviceDescZhTw: string;   // 服務說明(繁體)
  serviceDescZhCn: string;   // 服務說明(簡體)
  serviceDescEn: string;     // 服務說明(英文)
  serviceVersion: string;    // 服務版本
  callMode: string;          // 調用模式
  pageMode: string;          // 分頁模式
}

export interface ExcelWorkbook {
  operationCode: string;     // 操作代碼 (如 ACPI02)
  apiName: string;           // API 名稱
  module: string;            // 模組 (如 ACP)
  methodType: string;        // 方法類型 (create, query, read, update, etc.)
  serviceInfo?: ApiServiceInfo; // API 服務資訊
  fields: ExcelField[];      // 欄位清單
  headerFields: ExcelField[]; // 單頭欄位
  detailFields: ExcelField[]; // 單身欄位
  commonSheets?: any;        // 共通工作表內容
  rawData?: any;             // 原始資料
}

export class ExcelImportService {
  private commonSheetsCache: Map<string, any> = new Map();
  private readonly GP40_PATH = '/opt/apiserv/erp_api_docs/GP40';
  
  /**
   * 掃描 GP40 目錄下的所有 Excel 檔案
   */
  async scanExcelFiles(): Promise<string[]> {
    const excelFiles: string[] = [];
    
    try {
      const modules = await fs.readdir(this.GP40_PATH);
      
      for (const module of modules) {
        const modulePath = path.join(this.GP40_PATH, module);
        const stat = await fs.stat(modulePath);
        
        if (stat.isDirectory()) {
          const operations = await fs.readdir(modulePath);
          
          for (const operation of operations) {
            const operationPath = path.join(modulePath, operation);
            const operationStat = await fs.stat(operationPath);
            
            if (operationStat.isDirectory()) {
              const files = await fs.readdir(operationPath);
              
              for (const file of files) {
                if (file.endsWith('.xls') || file.endsWith('.xlsx')) {
                  excelFiles.push(path.join(operationPath, file));
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(chalk.red('掃描 Excel 檔案時發生錯誤:'), error);
    }
    
    return excelFiles;
  }
  
  /**
   * 讀取單個 Excel 檔案
   */
  async readExcelFile(filePath: string): Promise<ExcelWorkbook | null> {
    try {
      // 解析檔案路徑以取得操作代碼和模組
      const pathParts = filePath.split(path.sep);
      const fileIndex = pathParts.findIndex(part => part === 'GP40');
      const module = pathParts[fileIndex + 1];
      const operationCode = pathParts[fileIndex + 2];
      const fileName = path.basename(filePath, path.extname(filePath));
      
      // 識別 method 類型
      const methodType = this.extractMethodType(fileName);
      
      // 讀取 Excel 檔案
      const buffer = await fs.readFile(filePath);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      
      // 取得工作表名稱
      const sheetNames = workbook.SheetNames;
      
      // 快取共通工作表（前 4 個）
      if (!this.commonSheetsCache.has('common')) {
        const commonSheets: any = {};
        for (let i = 0; i < Math.min(4, sheetNames.length); i++) {
          const sheetName = sheetNames[i];
          const sheet = workbook.Sheets[sheetName];
          commonSheets[sheetName] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        }
        this.commonSheetsCache.set('common', commonSheets);
      }
      
      // 讀取第 5 個工作表（API 特定內容）
      if (sheetNames.length < 5) {
        console.warn(chalk.yellow(`檔案 ${fileName} 沒有第 5 個工作表`));
        return null;
      }
      
      const apiSheet = workbook.Sheets[sheetNames[4]];
      const apiData = XLSX.utils.sheet_to_json(apiSheet, { header: 1 });
      
      // 提取 API 服務資訊
      const serviceInfo = this.extractServiceInfo(apiData as any[][]);
      
      // 解析欄位資料
      const fields = this.parseFieldsFromSheet(apiData as any[][]);
      
      // 分組欄位（單頭/單身）
      const { headerFields, detailFields } = this.groupFields(fields, apiData as any[][]);
      
      return {
        operationCode,
        apiName: fileName,
        module,
        methodType,
        serviceInfo,
        fields,
        headerFields,
        detailFields,
        commonSheets: this.commonSheetsCache.get('common'),
        rawData: apiData
      };
      
    } catch (error) {
      console.error(chalk.red(`讀取 Excel 檔案失敗: ${filePath}`), error);
      return null;
    }
  }
  
  /**
   * 從工作表資料解析欄位
   */
  private parseFieldsFromSheet(sheetData: any[][]): ExcelField[] {
    const fields: ExcelField[] = [];
    
    if (!sheetData || sheetData.length === 0) {
      return fields;
    }
    
    // 尋找欄位資料的起始行（通常在表頭之後）
    let startRow = -1;
    let headerRow: any[] = [];
    
    for (let i = 0; i < sheetData.length; i++) {
      const row = sheetData[i];
      // 檢查是否包含欄位標題
      if (row && row.some(cell => 
        typeof cell === 'string' && 
        (cell.includes('欄位名稱') || cell.includes('欄位') || cell.includes('參數名稱') || 
         cell.includes('名稱') || cell.includes('資料型態') || cell.includes('必要'))
      )) {
        headerRow = row;
        startRow = i + 1;
        break;
      }
    }
    
    if (startRow === -1) {
      console.warn(chalk.yellow('無法找到欄位資料的起始位置'));
      return fields;
    }
    
    // 找出各欄位的索引位置
    const findColumnIndex = (keywords: string[]): number => {
      for (let i = 0; i < headerRow.length; i++) {
        const header = String(headerRow[i]).toLowerCase();
        if (keywords.some(keyword => header.includes(keyword))) {
          return i;
        }
      }
      return -1;
    };
    
    // 根據 Excel 格式，欄位在特定位置
    // 第 4 欄 - 辭彙代號（API 欄位名稱）
    // 第 5 欄 - 辭彙型態（資料型態）
    // 第 6 欄 - 必要（必填）
    // 第 11 欄 - 說明(繁體)
    // 第 14 欄 - 範例值
    // 第 15 欄 - 備註(繁體) - 包含 DB 欄位資訊
    
    const apiNameIdx = 4;  // 辭彙代號
    const dataTypeIdx = 5; // 辭彙型態
    const requiredIdx = 6; // 必要
    const descIdx = 11;    // 說明(繁體)
    const exampleIdx = 14; // 範例值
    const remarkIdx = 15;  // 備註(繁體)
    
    // 解析每一行的欄位資料
    for (let i = startRow; i < sheetData.length; i++) {
      const row = sheetData[i];
      if (!row || row.length === 0) continue;
      
      // 檢查第一欄的類型標記
      const rowType = row[1] ? String(row[1]).trim() : '';
      
      // 跳過非欄位行（M, P, datakey 等是分組標記）
      if (!rowType || ['M', 'P', 'datakey', 'H', 'HF'].includes(rowType)) {
        continue;
      }
      
      // MF 表示實際的欄位資料
      if (rowType !== 'MF') {
        continue;
      }
      
      // 檢查是否為有效資料行（至少要有欄位名稱）
      const apiName = apiNameIdx < row.length ? this.cleanCellValue(row[apiNameIdx]) : '';
      if (!apiName || apiName.trim() === '') continue;
      
      // 從備註欄位中提取資料庫欄位資訊
      let dbColumn = '';
      const remark = remarkIdx < row.length ? this.cleanCellValue(row[remarkIdx]) : '';
      if (remark) {
        // 從備註中提取 "欄位代號:ACPTA.TA001" 格式的資訊
        const dbMatch = remark.match(/欄位代號[:：]\s*([A-Z]+\.[A-Z0-9]+)/);
        if (dbMatch) {
          dbColumn = dbMatch[1];
        }
      }
      
      // 基本欄位映射
      const field: ExcelField = {
        apiName: apiName,
        dbColumn: dbColumn,
        dataType: dataTypeIdx < row.length ? this.cleanCellValue(row[dataTypeIdx]) : '',
        maxLength: undefined, // Excel 中沒有長度資訊
        required: requiredIdx < row.length ? this.parseRequired(row[requiredIdx]) : false,
        description: descIdx < row.length ? this.cleanCellValue(row[descIdx]) : '',
        validation: undefined, // 可以從其他欄位提取
        example: exampleIdx < row.length ? this.cleanCellValue(row[exampleIdx]) : undefined,
        remark: remark
      };
      
      fields.push(field);
    }
    
    return fields;
  }
  
  /**
   * 清理儲存格值
   */
  private cleanCellValue(value: any): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }
  
  /**
   * 解析長度值
   */
  private parseLength(value: any): number | undefined {
    if (!value) return undefined;
    const num = parseInt(String(value), 10);
    return isNaN(num) ? undefined : num;
  }
  
  /**
   * 解析必填欄位
   */
  private parseRequired(value: any): boolean {
    if (!value) return false;
    const strValue = String(value).toLowerCase().trim();
    return strValue === 'y' || 
           strValue === 'yes' || 
           strValue === '是' || 
           strValue === '必填' ||
           strValue === 'true' ||
           strValue === '1';
  }
  
  /**
   * 讀取特定操作的所有 Excel 檔案
   */
  async readOperationExcels(operationCode: string): Promise<ExcelWorkbook[]> {
    const allFiles = await this.scanExcelFiles();
    const operationFiles = allFiles.filter(file => 
      file.includes(`/${operationCode}/`)
    );
    
    const workbooks: ExcelWorkbook[] = [];
    
    for (const file of operationFiles) {
      const workbook = await this.readExcelFile(file);
      if (workbook) {
        workbooks.push(workbook);
      }
    }
    
    return workbooks;
  }
  
  /**
   * 取得共通工作表快取
   */
  getCommonSheets(): any {
    return this.commonSheetsCache.get('common');
  }
  
  /**
   * 從檔名提取 method 類型
   */
  private extractMethodType(fileName: string): string {
    // wf.oapi.payable.doc.data.create -> create
    // wf.oapi.payable.doc.data.query.get -> query
    // wf.oapi.payable.doc.data.read.get -> read
    
    const parts = fileName.split('.');
    const lastPart = parts[parts.length - 1];
    const secondLastPart = parts[parts.length - 2];
    
    // 處理 query.get 和 read.get 的情況
    if (lastPart === 'get' && (secondLastPart === 'query' || secondLastPart === 'read')) {
      return secondLastPart;
    }
    
    // 處理 query.get_Parameter 的情況
    if (lastPart === 'get_Parameter' && secondLastPart === 'query') {
      return 'query_parameter';
    }
    
    // 其他情況直接返回最後一部分
    return lastPart;
  }
  
  /**
   * 提取 API 服務資訊
   */
  private extractServiceInfo(sheetData: any[][]): ApiServiceInfo | undefined {
    try {
      // 服務資訊通常在第 2-3 行
      if (sheetData.length < 3) return undefined;
      
      // 第 2 行是標題，第 3 行是值
      const headerRow = sheetData[1];
      const valueRow = sheetData[2];
      
      if (!headerRow || !valueRow) return undefined;
      
      // 找出各欄位的索引
      const findIndex = (keyword: string): number => {
        return headerRow.findIndex((cell: any) => 
          String(cell).includes(keyword)
        );
      };
      
      const nameIdx = findIndex('服務名稱');
      const descZhTwIdx = findIndex('服務說明(繁體)');
      const descZhCnIdx = findIndex('服務說明(簡體)');
      const descEnIdx = findIndex('服務說明(英文)');
      const versionIdx = findIndex('服務版本');
      const callModeIdx = findIndex('調用模式');
      const pageModeIdx = findIndex('分頁模式');
      
      return {
        serviceName: nameIdx >= 0 ? this.cleanCellValue(valueRow[nameIdx]) : '',
        serviceDescZhTw: descZhTwIdx >= 0 ? this.cleanCellValue(valueRow[descZhTwIdx]) : '',
        serviceDescZhCn: descZhCnIdx >= 0 ? this.cleanCellValue(valueRow[descZhCnIdx]) : '',
        serviceDescEn: descEnIdx >= 0 ? this.cleanCellValue(valueRow[descEnIdx]) : '',
        serviceVersion: versionIdx >= 0 ? this.cleanCellValue(valueRow[versionIdx]) : '1.0',
        callMode: callModeIdx >= 0 ? this.cleanCellValue(valueRow[callModeIdx]) : '',
        pageMode: pageModeIdx >= 0 ? this.cleanCellValue(valueRow[pageModeIdx]) : ''
      };
    } catch (error) {
      console.warn(chalk.yellow('無法提取 API 服務資訊'));
      return undefined;
    }
  }
  
  /**
   * 分組欄位（單頭/單身）
   */
  private groupFields(fields: ExcelField[], sheetData: any[][]): {
    headerFields: ExcelField[];
    detailFields: ExcelField[];
  } {
    const headerFields: ExcelField[] = [];
    const detailFields: ExcelField[] = [];
    
    // 需要從原始資料中找出欄位的分組資訊
    // 通常在第 2 欄會標示所屬單頭/身
    let currentGroup = '';
    
    for (const field of fields) {
      // 簡單的邏輯：如果欄位名稱包含 detail 或 body，歸類為單身
      if (field.apiName.includes('detail') || 
          field.apiName.includes('body') ||
          field.remark?.includes('單身')) {
        detailFields.push(field);
      } else {
        headerFields.push(field);
      }
    }
    
    return { headerFields, detailFields };
  }
}