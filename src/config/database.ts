import dotenv from 'dotenv';
import { DatabaseConfig } from '../types';

dotenv.config();

export function getDatabaseConfig(): DatabaseConfig {
  const useWindowsAuth = process.env.DB_USE_WINDOWS_AUTH === 'true';
  
  const requiredEnvVars = ['DB_SERVER', 'DB_DATABASE'];
  if (!useWindowsAuth) {
    requiredEnvVars.push('DB_USERNAME', 'DB_PASSWORD');
  }
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`環境變數 ${envVar} 未設定。請檢查 .env 檔案。`);
    }
  }

  const config: DatabaseConfig = {
    server: process.env.DB_SERVER!,
    port: parseInt(process.env.DB_PORT || '1433'),
    database: process.env.DB_DATABASE!,
    user: useWindowsAuth ? undefined : process.env.DB_USERNAME!,
    password: useWindowsAuth ? undefined : process.env.DB_PASSWORD!,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
      useUTC: false // 使用本地時間
    }
  };

  // 調試資訊（不顯示密碼）
  console.log('資料庫配置:', {
    server: config.server,
    port: config.port,
    database: config.database,
    user: config.user || 'Windows 驗證',
    password: config.password ? '***已設定***' : 'Windows 驗證',
    options: config.options,
    useWindowsAuth
  });

  return config;
}

export const DEFAULT_BATCH_SIZE = parseInt(process.env.DEFAULT_BATCH_SIZE || '50');
export const MAX_BATCH_SIZE = parseInt(process.env.MAX_BATCH_SIZE || '500');
export const DEFAULT_OUTPUT_DIR = process.env.DEFAULT_OUTPUT_DIR || './output';