import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { ExcelWorkbook, ExcelField, ApiServiceInfo } from '../services/excel-import.service';

export interface MethodDocumentOptions {
  outputDir: string;
  operationCode: string;
  methodType: string;
  workbook: ExcelWorkbook;
}

export class MethodDocumentGenerator {
  
  /**
   * 生成特定 method 的文檔
   */
  async generateMethodDocument(options: MethodDocumentOptions): Promise<void> {
    const { outputDir, operationCode, methodType, workbook } = options;
    
    // 確保輸出目錄存在
    const methodDir = path.join(outputDir, operationCode);
    await fs.mkdir(methodDir, { recursive: true });
    
    // 生成文檔內容
    const content = this.generateContent(workbook, methodType);
    
    // 寫入文檔
    const filePath = path.join(methodDir, `${methodType}.md`);
    await fs.writeFile(filePath, content, 'utf-8');
    
    console.log(chalk.green(`✓ 已生成 ${methodType} 文檔: ${filePath}`));
  }
  
  /**
   * 生成文檔內容
   */
  private generateContent(workbook: ExcelWorkbook, methodType: string): string {
    const lines: string[] = [];
    const serviceInfo = workbook.serviceInfo;
    
    // 標題
    lines.push(`# ${workbook.operationCode} - ${this.getMethodTitle(methodType)}`, '');
    
    // API 基本資訊
    lines.push('## 📋 API 基本資訊');
    lines.push(`- **完整方法名**: ${workbook.apiName}`);
    if (serviceInfo) {
      lines.push(`- **中文名稱**: ${serviceInfo.serviceDescZhTw}`);
      lines.push(`- **描述**: ${serviceInfo.serviceDescZhTw}`);
      lines.push(`- **服務版本**: ${serviceInfo.serviceVersion}`);
      lines.push(`- **調用模式**: ${serviceInfo.callMode}`);
      lines.push(`- **分頁模式**: ${serviceInfo.pageMode}`);
    }
    lines.push(`- **作業代號**: ${workbook.operationCode}`);
    lines.push('');
    
    // 技術規格
    lines.push('## 🔧 技術規格');
    lines.push(this.generateTechnicalSpec(workbook, methodType));
    lines.push('');
    
    // 請求格式
    lines.push('### 請求格式');
    lines.push('```json');
    lines.push(this.generateRequestExample(workbook, methodType));
    lines.push('```');
    lines.push('');
    
    // 回應格式
    lines.push('### 回應格式');
    lines.push('```json');
    lines.push(this.generateResponseExample(workbook, methodType));
    lines.push('```');
    lines.push('');
    
    // 欄位說明
    lines.push('## 📊 欄位說明');
    
    // 單頭欄位
    if (workbook.headerFields.length > 0) {
      lines.push('### 單頭欄位');
      lines.push(this.generateFieldTable(workbook.headerFields, methodType));
      lines.push('');
    }
    
    // 單身欄位
    if (workbook.detailFields.length > 0) {
      lines.push('### 單身欄位');
      lines.push(this.generateFieldTable(workbook.detailFields, methodType));
      lines.push('');
    }
    
    // 使用範例
    lines.push('## 🔍 使用範例');
    lines.push('### 基本使用');
    lines.push('```typescript');
    lines.push(this.generateUsageExample(workbook, methodType));
    lines.push('```');
    lines.push('');
    
    // 注意事項
    lines.push('## ⚠️ 注意事項');
    lines.push(this.generateNotes(workbook, methodType));
    lines.push('');
    
    return lines.join('\n');
  }
  
  /**
   * 取得 method 的中文標題
   */
  private getMethodTitle(methodType: string): string {
    const titleMap: Record<string, string> = {
      'create': '建立操作',
      'update': '更新操作',
      'delete': '刪除操作',
      'query': '查詢操作',
      'read': '讀取操作',
      'approve': '審核操作',
      'disapprove': '取消審核操作',
      'invalid': '作廢操作',
      'query_parameter': '查詢參數'
    };
    
    return titleMap[methodType] || methodType;
  }
  
  /**
   * 生成技術規格
   */
  private generateTechnicalSpec(workbook: ExcelWorkbook, methodType: string): string {
    const specs: string[] = [];
    
    specs.push(`- **HTTP Method**: ${this.getHttpMethod(methodType)}`);
    specs.push(`- **Content-Type**: application/json`);
    specs.push(`- **需要認證**: 是`);
    
    if (methodType === 'query' || methodType === 'read') {
      specs.push('- **支援分頁**: 是');
      specs.push('- **支援排序**: 是');
      specs.push('- **支援過濾**: 是');
    }
    
    return specs.join('\n');
  }
  
  /**
   * 取得 HTTP 方法
   */
  private getHttpMethod(methodType: string): string {
    const methodMap: Record<string, string> = {
      'create': 'POST',
      'update': 'PUT',
      'delete': 'DELETE',
      'query': 'GET',
      'read': 'GET',
      'approve': 'PUT',
      'disapprove': 'PUT',
      'invalid': 'PUT',
      'query_parameter': 'GET'
    };
    
    return methodMap[methodType] || 'POST';
  }
  
  /**
   * 生成請求範例
   */
  private generateRequestExample(workbook: ExcelWorkbook, methodType: string): string {
    const request: any = {
      std_data: {
        parameter: {
          enterprise_no: "DEMO"
        }
      }
    };
    
    // 根據不同的 method 類型添加不同的參數
    switch (methodType) {
      case 'create':
        // 添加必填欄位
        workbook.headerFields.filter(f => f.required).forEach(field => {
          request.std_data.parameter[field.apiName] = this.getFieldExample(field);
        });
        
        // 如果有單身欄位，添加陣列
        if (workbook.detailFields.length > 0) {
          request.std_data.parameter.details = [
            workbook.detailFields.filter(f => f.required).reduce((acc, field) => {
              acc[field.apiName] = this.getFieldExample(field);
              return acc;
            }, {} as any)
          ];
        }
        break;
        
      case 'update':
        request.std_data.parameter.voucher_type = "AAA";
        request.std_data.parameter.voucher_no = "20250101001";
        // 添加更新欄位
        workbook.headerFields.slice(0, 3).forEach(field => {
          request.std_data.parameter[field.apiName] = this.getFieldExample(field);
        });
        break;
        
      case 'query':
      case 'read':
        request.std_data.parameter.start_date = "20250101";
        request.std_data.parameter.end_date = "20250131";
        request.std_data.parameter.page_size = 50;
        request.std_data.parameter.page_num = 1;
        break;
        
      case 'delete':
      case 'approve':
      case 'disapprove':
      case 'invalid':
        request.std_data.parameter.voucher_type = "AAA";
        request.std_data.parameter.voucher_no = "20250101001";
        break;
    }
    
    return JSON.stringify(request, null, 2);
  }
  
  /**
   * 生成回應範例
   */
  private generateResponseExample(workbook: ExcelWorkbook, methodType: string): string {
    const response: any = {
      success: true,
      message: "操作成功"
    };
    
    switch (methodType) {
      case 'create':
        response.data = {
          voucher_type: "AAA",
          voucher_no: "20250101001"
        };
        break;
        
      case 'update':
      case 'approve':
      case 'disapprove':
      case 'invalid':
        response.data = {
          affected_rows: 1
        };
        break;
        
      case 'delete':
        response.data = {
          deleted: true
        };
        break;
        
      case 'query':
        response.data = {
          total_count: 100,
          page_size: 50,
          page_num: 1,
          records: [
            workbook.headerFields.slice(0, 5).reduce((acc, field) => {
              acc[field.apiName] = this.getFieldExample(field);
              return acc;
            }, {} as any)
          ]
        };
        break;
        
      case 'read':
        response.data = workbook.headerFields.reduce((acc, field) => {
          acc[field.apiName] = this.getFieldExample(field);
          return acc;
        }, {} as any);
        
        if (workbook.detailFields.length > 0) {
          response.data.details = [
            workbook.detailFields.reduce((acc, field) => {
              acc[field.apiName] = this.getFieldExample(field);
              return acc;
            }, {} as any)
          ];
        }
        break;
    }
    
    return JSON.stringify(response, null, 2);
  }
  
  /**
   * 取得欄位範例值
   */
  private getFieldExample(field: ExcelField): any {
    // 如果有提供範例值，使用它
    if (field.example) {
      return field.example;
    }
    
    // 根據資料型態生成範例
    const dataType = field.dataType.toLowerCase();
    
    if (dataType.includes('date')) {
      return '20250101';
    } else if (dataType.includes('numeric') || dataType.includes('decimal') || dataType.includes('number')) {
      return 0;
    } else if (dataType.includes('boolean')) {
      return false;
    } else {
      // 根據欄位名稱生成更智能的範例
      const apiName = field.apiName.toLowerCase();
      if (apiName.includes('_no') || apiName.includes('_code')) {
        return 'ABC123';
      } else if (apiName.includes('_date')) {
        return '20250101';
      } else if (apiName.includes('_amt') || apiName.includes('amount')) {
        return 1000;
      } else if (apiName.includes('_qty') || apiName.includes('quantity')) {
        return 10;
      } else if (apiName.includes('rate')) {
        return 1.0;
      } else {
        return field.description || '範例值';
      }
    }
  }
  
  /**
   * 生成欄位表格
   */
  private generateFieldTable(fields: ExcelField[], methodType: string): string {
    const lines: string[] = [];
    
    // 表格標題
    lines.push('| API 欄位 | DB 欄位 | 型態 | 必填 | 說明 | 範例 |');
    lines.push('|----------|---------|------|------|------|------|');
    
    // 根據 method 類型決定要顯示的欄位
    let displayFields = fields;
    
    if (methodType === 'query' || methodType === 'read') {
      // 查詢和讀取操作不需要顯示所有欄位，只顯示主要欄位
      displayFields = fields.slice(0, 20);
    }
    
    // 欄位資料
    displayFields.forEach(field => {
      const required = field.required ? '✅' : '❌';
      const example = field.example || this.getFieldExample(field);
      
      lines.push(
        `| \`${field.apiName}\` | ${field.dbColumn} | ${field.dataType} | ${required} | ${field.description} | ${example} |`
      );
    });
    
    if (fields.length > displayFields.length) {
      lines.push('');
      lines.push(`> 還有 ${fields.length - displayFields.length} 個欄位，請參考完整欄位文檔`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * 生成使用範例
   */
  private generateUsageExample(workbook: ExcelWorkbook, methodType: string): string {
    const examples: string[] = [];
    
    examples.push('// 使用 ERP API 工具');
    examples.push(`import { ErpApiClient } from '@/utils/erp-api';`);
    examples.push('');
    examples.push('const client = new ErpApiClient({');
    examples.push('  // 配置選項');
    examples.push('});');
    examples.push('');
    
    switch (methodType) {
      case 'create':
        examples.push(`// 建立${workbook.operationCode}資料`);
        examples.push(`const result = await client.execute('${workbook.apiName}', {`);
        examples.push('  enterprise_no: "DEMO",');
        workbook.headerFields.filter(f => f.required).slice(0, 3).forEach(field => {
          examples.push(`  ${field.apiName}: "${this.getFieldExample(field)}",`);
        });
        examples.push('});');
        break;
        
      case 'query':
        examples.push(`// 查詢${workbook.operationCode}資料`);
        examples.push(`const result = await client.execute('${workbook.apiName}', {`);
        examples.push('  enterprise_no: "DEMO",');
        examples.push('  start_date: "20250101",');
        examples.push('  end_date: "20250131",');
        examples.push('  page_size: 50,');
        examples.push('  page_num: 1');
        examples.push('});');
        break;
        
      default:
        examples.push(`// 執行${this.getMethodTitle(methodType)}`);
        examples.push(`const result = await client.execute('${workbook.apiName}', {`);
        examples.push('  enterprise_no: "DEMO",');
        examples.push('  voucher_type: "AAA",');
        examples.push('  voucher_no: "20250101001"');
        examples.push('});');
    }
    
    examples.push('');
    examples.push('if (result.success) {');
    examples.push('  console.log("操作成功", result.data);');
    examples.push('} else {');
    examples.push('  console.error("操作失敗", result.message);');
    examples.push('}');
    
    return examples.join('\n');
  }
  
  /**
   * 生成注意事項
   */
  private generateNotes(workbook: ExcelWorkbook, methodType: string): string {
    const notes: string[] = [];
    
    // 通用注意事項
    notes.push('- 所有 API 請求都需要正確的認證和授權');
    notes.push('- 請確保所有必填欄位都有提供值');
    notes.push('- 日期格式統一使用 YYYYMMDD');
    notes.push('- 數值欄位不要傳送字串格式');
    
    // 根據 method 類型添加特定注意事項
    switch (methodType) {
      case 'create':
        notes.push('- 建立操作會返回新建資料的主鍵');
        notes.push('- 如果有單身資料，必須以陣列形式提供');
        break;
        
      case 'update':
        notes.push('- 更新操作需要提供完整的主鍵資訊');
        notes.push('- 只更新有提供的欄位，未提供的欄位保持原值');
        break;
        
      case 'delete':
        notes.push('- 刪除操作是不可逆的，請謹慎使用');
        notes.push('- 某些資料可能因為關聯限制無法刪除');
        break;
        
      case 'query':
        notes.push('- 查詢結果支援分頁，請注意設定合適的頁面大小');
        notes.push('- 可以使用多個條件進行組合查詢');
        notes.push('- 大量資料查詢時請使用分頁避免超時');
        break;
        
      case 'approve':
      case 'disapprove':
      case 'invalid':
        notes.push('- 狀態變更操作需要相應的權限');
        notes.push('- 某些狀態變更可能有業務規則限制');
        break;
    }
    
    // 如果有必填欄位，特別提醒
    const requiredFields = workbook.fields.filter(f => f.required);
    if (requiredFields.length > 0) {
      notes.push('');
      notes.push(`### 必填欄位清單 (共 ${requiredFields.length} 個)`);
      requiredFields.slice(0, 10).forEach(field => {
        notes.push(`- **${field.apiName}**: ${field.description}`);
      });
      if (requiredFields.length > 10) {
        notes.push(`- ...還有 ${requiredFields.length - 10} 個必填欄位`);
      }
    }
    
    return notes.join('\n');
  }
}