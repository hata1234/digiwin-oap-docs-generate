import chalk from 'chalk';
import { DatabaseService } from './database.service';
import { 
  ColumnInfo, 
  ExploreResult, 
  OperationInfo, 
  MbFieldUsage, 
  OapmRecord 
} from '../types';

export class ExplorerService {
  constructor(private dbService: DatabaseService) {}

  /**
   * 檢查 OAPMB 表是否存在並獲取結構資訊
   */
  async exploreTable(): Promise<ExploreResult> {
    console.log(chalk.blue('🔍 探索 OAPMB 表結構...'));

    try {
      // 檢查表是否存在
      const tableExistsQuery = `
        SELECT COUNT(*) as count 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'OAPMB'
      `;
      
      const tableExists = await this.dbService.query<{ count: number }>(tableExistsQuery);
      
      if (tableExists[0]?.count === 0) {
        console.log(chalk.red('❌ OAPMB 表不存在'));
        return { tableExists: false, columns: [] };
      }

      // 獲取欄位資訊
      const columnsQuery = `
        SELECT 
          COLUMN_NAME,
          DATA_TYPE,
          CHARACTER_MAXIMUM_LENGTH,
          IS_NULLABLE,
          COLUMN_DEFAULT
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'OAPMB'
        ORDER BY ORDINAL_POSITION
      `;

      const columns = await this.dbService.query<ColumnInfo>(columnsQuery);
      
      console.log(chalk.green(`✓ 發現 ${columns.length} 個欄位`));
      
      // 獲取總記錄數
      const totalRecords = await this.dbService.queryCount('OAPMB');
      console.log(chalk.gray(`總記錄數: ${totalRecords}`));

      return {
        tableExists: true,
        columns,
        totalRecords
      };

    } catch (error) {
      console.error(chalk.red('探索表結構失敗:'), error);
      throw error;
    }
  }

  /**
   * 獲取所有不重複的操作代碼
   */
  async getOperations(): Promise<OperationInfo[]> {
    console.log(chalk.blue('🔍 查詢所有操作代碼...'));

    try {
      const query = `
        SELECT 
          RTRIM(MB025) as operation_code,
          COUNT(*) as record_count
        FROM OAPMB 
        WHERE MB025 IS NOT NULL AND RTRIM(MB025) != ''
        GROUP BY RTRIM(MB025) 
        ORDER BY RTRIM(MB025)
      `;

      const operations = await this.dbService.query<OperationInfo>(query);
      
      console.log(chalk.green(`✓ 發現 ${operations.length} 個操作代碼`));
      
      return operations;

    } catch (error) {
      console.error(chalk.red('查詢操作代碼失敗:'), error);
      throw error;
    }
  }

  /**
   * 分析 MB 欄位使用情況
   */
  async analyzeMbFields(): Promise<MbFieldUsage[]> {
    console.log(chalk.blue('🔍 分析 MB 欄位使用情況...'));

    try {
      // 先獲取所有欄位名稱
      const columnsResult = await this.exploreTable();
      const mbColumns = columnsResult.columns
        .filter(col => col.COLUMN_NAME.startsWith('MB'))
        .map(col => col.COLUMN_NAME);

      console.log(chalk.gray(`發現 ${mbColumns.length} 個 MB 欄位`));

      const mbFieldUsage: MbFieldUsage[] = [];

      // 分析每個 MB 欄位的使用情況
      for (const column of mbColumns) {
        try {
          console.log(chalk.gray(`正在分析 ${column}...`));
          
          // 使用更安全的計數查詢，避免型別轉換問題
          const usageQuery = `
            SELECT COUNT(*) as usage_count
            FROM OAPMB 
            WHERE ${column} IS NOT NULL AND CAST(${column} AS NVARCHAR(MAX)) != ''
          `;

          const usageResult = await this.dbService.query<{ usage_count: number }>(usageQuery);
          const usageCount = usageResult[0]?.usage_count || 0;

          if (usageCount > 0) {
            // 獲取一些範例值，強制字串排序避免型別轉換錯誤
            const sampleQuery = `
              SELECT DISTINCT TOP 5 CAST(${column} AS NVARCHAR(MAX)) as sample_value
              FROM OAPMB 
              WHERE ${column} IS NOT NULL AND CAST(${column} AS NVARCHAR(MAX)) != ''
              ORDER BY CAST(${column} AS NVARCHAR(MAX))
            `;

            const samples = await this.dbService.query<{ sample_value: string }>(sampleQuery);
            
            mbFieldUsage.push({
              field_name: column,
              usage_count: usageCount,
              sample_values: samples.map(s => s.sample_value)
            });
            
            console.log(chalk.gray(`  ✓ ${column}: ${usageCount} 筆資料`));
          } else {
            console.log(chalk.gray(`  - ${column}: 無資料`));
          }
        } catch (error) {
          console.error(chalk.red(`  ✗ ${column} 分析失敗:`), error instanceof Error ? error.message : String(error));
          // 繼續處理其他欄位，不要因為單一欄位失敗而停止
          continue;
        }
      }

      console.log(chalk.green(`✓ ${mbFieldUsage.length} 個 MB 欄位有資料`));
      
      return mbFieldUsage.sort((a, b) => b.usage_count - a.usage_count);

    } catch (error) {
      console.error(chalk.red('分析 MB 欄位失敗:'), error);
      throw error;
    }
  }

  /**
   * 獲取特定操作的範例資料
   */
  async getOperationSample(operation: string, limit: number = 5): Promise<OapmRecord[]> {
    console.log(chalk.blue(`🔍 獲取 ${operation} 的範例資料...`));

    try {
      const query = `
        SELECT TOP ${limit} *
        FROM OAPMB 
        WHERE RTRIM(MB025) = @param0
        ORDER BY CAST(MB001 AS NVARCHAR(MAX)), CAST(MB002 AS NVARCHAR(MAX))
      `;

      const records = await this.dbService.query<OapmRecord>(query, [operation]);
      
      console.log(chalk.green(`✓ 獲取 ${records.length} 筆範例資料`));
      
      return records;

    } catch (error) {
      console.error(chalk.red(`獲取 ${operation} 範例資料失敗:`), error);
      throw error;
    }
  }

  /**
   * 獲取特定操作的所有資料
   */
  async getOperationData(operation: string, offset: number = 0, limit: number = 50): Promise<{
    records: OapmRecord[];
    totalCount: number;
    hasMore: boolean;
  }> {
    console.log(chalk.blue(`🔍 查詢 ${operation} 資料 (offset: ${offset}, limit: ${limit})...`));

    try {
      // 獲取總數
      const totalCount = await this.dbService.queryCount('OAPMB', `RTRIM(MB025) = '${operation}'`);

      // 獲取分頁資料，強制字串排序避免型別轉換錯誤
      const query = `
        SELECT *
        FROM OAPMB 
        WHERE RTRIM(MB025) = @param0
        ORDER BY CAST(MB001 AS NVARCHAR(MAX)), CAST(MB002 AS NVARCHAR(MAX))
        OFFSET ${offset} ROWS
        FETCH NEXT ${limit} ROWS ONLY
      `;

      const records = await this.dbService.query<OapmRecord>(query, [operation]);
      
      console.log(chalk.green(`✓ 獲取 ${records.length}/${totalCount} 筆資料`));
      
      return {
        records,
        totalCount,
        hasMore: offset + records.length < totalCount
      };

    } catch (error) {
      console.error(chalk.red(`查詢 ${operation} 資料失敗:`), error);
      throw error;
    }
  }
}