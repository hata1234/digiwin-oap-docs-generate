import sql from 'mssql';
import chalk from 'chalk';
import { DatabaseConfig, OapmRecord } from '../types';
import { getDatabaseConfig } from '../config/database';

export class DatabaseService {
  private config: DatabaseConfig;
  private pool?: sql.ConnectionPool;

  constructor() {
    this.config = getDatabaseConfig();
  }

  async connect(): Promise<void> {
    try {
      console.log(chalk.gray('正在連接資料庫...'));
      
      this.pool = new sql.ConnectionPool({
        server: this.config.server,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        options: {
          ...this.config.options,
          enableArithAbort: true,
          instanceName: undefined // 明確設定為 undefined
        },
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 30000
        },
        requestTimeout: 60000,
        connectionTimeout: 15000
      });

      await this.pool.connect();
      console.log(chalk.green('✓ 資料庫連接成功'));
    } catch (error) {
      console.error(chalk.red('資料庫連接失敗:'), error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      console.log(chalk.gray('資料庫連接已關閉'));
    }
  }

  async query<T = any>(queryText: string, params?: any[]): Promise<T[]> {
    if (!this.pool) {
      throw new Error('資料庫未連接。請先呼叫 connect()');
    }

    try {
      const request = this.pool.request();
      
      // 添加參數（如果有的話）
      if (params) {
        params.forEach((param, index) => {
          request.input(`param${index}`, param);
        });
      }

      const result = await request.query(queryText);
      return result.recordset as T[];
    } catch (error) {
      console.error(chalk.red('查詢失敗:'), error);
      throw error;
    }
  }

  async queryCount(tableName: string, whereClause?: string): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM ${tableName}`;
    if (whereClause) {
      query += ` WHERE ${whereClause}`;
    }

    const result = await this.query<{ count: number }>(query);
    return result[0]?.count || 0;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      await this.query('SELECT 1 as test');
      await this.disconnect();
      return true;
    } catch (error) {
      return false;
    }
  }
}