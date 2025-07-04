export interface DatabaseConfig {
  server: string;
  port: number;
  database: string;
  user?: string;
  password?: string;
  options: {
    encrypt: boolean;
    trustServerCertificate: boolean;
    useUTC?: boolean;
  };
}

export interface ColumnInfo {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  CHARACTER_MAXIMUM_LENGTH?: number;
  IS_NULLABLE: string;
  COLUMN_DEFAULT?: string;
}

export interface OapmRecord {
  [key: string]: any; // 動態欄位，因為我們不知道實際有哪些 MB 欄位
}

export interface ExploreResult {
  tableExists: boolean;
  columns: ColumnInfo[];
  sampleData?: OapmRecord[];
  totalRecords?: number;
}

export interface OperationInfo {
  operation_code: string;
  record_count: number;
  sample_records?: OapmRecord[];
}

export interface MbFieldUsage {
  field_name: string;
  usage_count: number;
  sample_values: string[];
}

export interface GeneratorOptions {
  operation?: string;
  output: string;
  batchSize: number;
  format: string[];
  verbose: boolean;
}