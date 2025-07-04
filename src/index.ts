#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { DatabaseService } from './services/database.service';
import { ExplorerService } from './services/explorer.service';
import { DEFAULT_BATCH_SIZE, DEFAULT_OUTPUT_DIR } from './config/database';
import * as fs from 'fs/promises';
import * as path from 'path';

const program = new Command();

program
  .name('digiwin-oap-docs-generate')
  .description('ERP API 欄位文檔自動生成工具 - 獨立版本')
  .version('1.0.0');

// 探索命令
const exploreCommand = program
  .command('explore')
  .description('探索資料庫結構和內容');

exploreCommand
  .command('table')
  .description('探索 OAPMB 表結構')
  .action(async () => {
    const spinner = ora('連接資料庫...').start();
    const dbService = new DatabaseService();
    const explorerService = new ExplorerService(dbService);

    try {
      await dbService.connect();
      spinner.text = '探索表結構...';
      
      const result = await explorerService.exploreTable();
      
      spinner.succeed('探索完成');
      
      if (result.tableExists) {
        console.log(chalk.blue('\n📋 OAPMB 表結構:'));
        console.log(chalk.gray(`總記錄數: ${result.totalRecords}`));
        console.log(chalk.gray(`欄位數量: ${result.columns.length}\n`));
        
        console.log('| 欄位名稱 | 資料型態 | 長度 | 允許NULL |');
        console.log('|----------|----------|------|----------|');
        
        for (const col of result.columns) {
          const length = col.CHARACTER_MAXIMUM_LENGTH ? `${col.CHARACTER_MAXIMUM_LENGTH}` : '-';
          const nullable = col.IS_NULLABLE === 'YES' ? '是' : '否';
          console.log(`| ${col.COLUMN_NAME} | ${col.DATA_TYPE} | ${length} | ${nullable} |`);
        }
      }
      
    } catch (error) {
      spinner.fail('探索失敗');
      console.error(chalk.red(error));
      process.exit(1);
    } finally {
      await dbService.disconnect();
    }
  });

exploreCommand
  .command('operations')
  .description('列出所有操作代碼')
  .action(async () => {
    const spinner = ora('連接資料庫...').start();
    const dbService = new DatabaseService();
    const explorerService = new ExplorerService(dbService);

    try {
      await dbService.connect();
      spinner.text = '查詢操作代碼...';
      
      const operations = await explorerService.getOperations();
      
      spinner.succeed('查詢完成');
      
      console.log(chalk.blue(`\n📝 發現 ${operations.length} 個操作代碼:\n`));
      console.log('| 操作代碼 | 記錄數 |');
      console.log('|----------|--------|');
      
      for (const op of operations) {
        console.log(`| ${op.operation_code} | ${op.record_count} |`);
      }
      
    } catch (error) {
      spinner.fail('查詢失敗');
      console.error(chalk.red(error));
      process.exit(1);
    } finally {
      await dbService.disconnect();
    }
  });

exploreCommand
  .command('mb-fields')
  .description('分析 MB 欄位使用情況')
  .action(async () => {
    const spinner = ora('連接資料庫...').start();
    const dbService = new DatabaseService();
    const explorerService = new ExplorerService(dbService);

    try {
      await dbService.connect();
      spinner.text = '分析 MB 欄位...';
      
      const mbFields = await explorerService.analyzeMbFields();
      
      spinner.succeed('分析完成');
      
      console.log(chalk.blue(`\n🔍 MB 欄位使用情況 (共 ${mbFields.length} 個有資料的欄位):\n`));
      console.log('| 欄位名稱 | 使用次數 | 範例值 |');
      console.log('|----------|----------|--------|');
      
      for (const field of mbFields) {
        const samples = field.sample_values.slice(0, 3).join(', ');
        console.log(`| ${field.field_name} | ${field.usage_count} | ${samples} |`);
      }
      
    } catch (error) {
      spinner.fail('分析失敗');
      console.error(chalk.red(error));
      process.exit(1);
    } finally {
      await dbService.disconnect();
    }
  });

exploreCommand
  .command('operation <code>')
  .description('查看特定操作的範例資料')
  .option('-l, --limit <number>', '範例資料筆數', '5')
  .action(async (code, options) => {
    const spinner = ora('連接資料庫...').start();
    const dbService = new DatabaseService();
    const explorerService = new ExplorerService(dbService);

    try {
      await dbService.connect();
      spinner.text = `查詢 ${code} 範例資料...`;
      
      const records = await explorerService.getOperationSample(code, parseInt(options.limit));
      
      spinner.succeed('查詢完成');
      
      if (records.length === 0) {
        console.log(chalk.yellow(`❌ 未找到 ${code} 的資料`));
        return;
      }
      
      console.log(chalk.blue(`\n📊 ${code} 範例資料 (${records.length} 筆):\n`));
      
      // 顯示第一筆記錄的所有欄位
      const firstRecord = records[0];
      console.log('第一筆記錄的欄位:');
      for (const [key, value] of Object.entries(firstRecord)) {
        if (value !== null && value !== '') {
          console.log(`  ${key}: ${value}`);
        }
      }
      
    } catch (error) {
      spinner.fail('查詢失敗');
      console.error(chalk.red(error));
      process.exit(1);
    } finally {
      await dbService.disconnect();
    }
  });

// 測試連接命令
program
  .command('test')
  .description('測試資料庫連接')
  .action(async () => {
    const spinner = ora('測試資料庫連接...').start();
    const dbService = new DatabaseService();

    try {
      const success = await dbService.testConnection();
      if (success) {
        spinner.succeed('資料庫連接測試成功');
      } else {
        spinner.fail('資料庫連接測試失敗');
        process.exit(1);
      }
    } catch (error) {
      spinner.fail('資料庫連接測試失敗');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// 生成命令
program
  .command('generate')
  .description('生成 ERP API 文檔')
  .option('-o, --operation <code>', 'API 操作代碼 (必填)')
  .option('-p, --output <path>', '輸出目錄', DEFAULT_OUTPUT_DIR)
  .option('-f, --format <types>', '文檔格式 (readme,json,markdown,unknown-fields,all)', 'readme,json')
  .option('-v, --verbose', '顯示詳細輸出', false)
  .action(async (options) => {
    if (!options.operation) {
      console.error(chalk.red('❌ 請指定操作代碼，例如：npm run generate -- --operation ACPI02'));
      process.exit(1);
    }

    const spinner = ora('連接資料庫...').start();
    const dbService = new DatabaseService();
    const explorerService = new ExplorerService(dbService);

    try {
      await dbService.connect();
      
      spinner.text = `檢查操作 ${options.operation}...`;
      
      // 檢查操作是否存在
      const operations = await explorerService.getOperations();
      const operationExists = operations.some(op => op.operation_code?.trim() === options.operation?.trim());
      
      if (!operationExists) {
        spinner.fail(`操作 ${options.operation} 不存在`);
        console.log(chalk.yellow('\n可用的操作代碼:'));
        operations.slice(0, 10).forEach(op => {
          console.log(chalk.gray(`- ${op.operation_code} (${op.record_count} 筆)`));
        });
        process.exit(1);
      }

      // 動態導入生成器
      const { ReadmeGenerator } = await import('./generators/readme.generator');
      const { JsonGenerator } = await import('./generators/json.generator');
      const { MarkdownGenerator } = await import('./generators/markdown.generator');

      const readmeGenerator = new ReadmeGenerator(explorerService);
      const jsonGenerator = new JsonGenerator(explorerService);
      const markdownGenerator = new MarkdownGenerator(explorerService);

      const formats = options.format.split(',').map((f: string) => f.trim());
      const outputPath = path.join(options.output, options.operation);

      spinner.text = '生成文檔...';
      
      console.log(chalk.blue(`\n📚 開始生成 ${options.operation} 文檔...\n`));

      // 生成各種格式的文檔
      for (const format of formats) {
        switch (format) {
          case 'readme':
            await readmeGenerator.generate(options.operation, outputPath);
            break;
          case 'json':
            await jsonGenerator.generate(options.operation, outputPath);
            break;
          case 'markdown':
          case 'all-fields':
            await markdownGenerator.generateAllFields(options.operation, outputPath);
            await markdownGenerator.generateFieldMapping(options.operation, outputPath);
            await markdownGenerator.generateQuickReference(options.operation, outputPath);
            break;
          case 'unknown-fields':
            await markdownGenerator.generateUnknownFieldValues(options.operation, outputPath);
            break;
          case 'all':
            await readmeGenerator.generate(options.operation, outputPath);
            await jsonGenerator.generate(options.operation, outputPath);
            await markdownGenerator.generateAllFields(options.operation, outputPath);
            await markdownGenerator.generateFieldMapping(options.operation, outputPath);
            await markdownGenerator.generateQuickReference(options.operation, outputPath);
            await markdownGenerator.generateUnknownFieldValues(options.operation, outputPath);
            break;
          default:
            console.warn(chalk.yellow(`⚠️ 未知格式: ${format}`));
        }
      }

      spinner.succeed('文檔生成完成');
      
      console.log(chalk.green.bold('\n✅ 文檔生成成功！\n'));
      console.log(chalk.blue('📁 輸出目錄:'), outputPath);
      console.log(chalk.gray('\n生成的檔案:'));
      
      // 列出生成的檔案
      try {
        const files = await fs.readdir(outputPath);
        for (const file of files) {
          const filePath = path.join(outputPath, file);
          const stats = await fs.stat(filePath);
          const size = (stats.size / 1024).toFixed(1);
          console.log(chalk.gray(`  📄 ${file} (${size} KB)`));
        }
      } catch (error) {
        // 忽略讀取目錄錯誤
      }

    } catch (error) {
      spinner.fail('生成失敗');
      console.error(chalk.red('\n錯誤詳情:'), error);
      process.exit(1);
    } finally {
      await dbService.disconnect();
    }
  });

// Excel 匯入命令
const importExcelCommand = program
  .command('import-excel')
  .description('匯入 Excel 文檔並與現有文檔合併');

importExcelCommand
  .command('analyze-old [operation]')
  .description('(舊版) 分析 Excel 與現有文檔的差異')
  .action(async (operation) => {
    const spinner = ora('初始化服務...').start();
    
    try {
      const { ExcelImportService } = await import('./services/excel-import.service');
      const { MergeService } = await import('./services/merge.service');
      
      const excelService = new ExcelImportService();
      const mergeService = new MergeService();
      
      if (operation) {
        spinner.text = `分析 ${operation} 的 Excel 檔案...`;
        const workbooks = await excelService.readOperationExcels(operation);
        
        if (workbooks.length === 0) {
          spinner.fail(`未找到 ${operation} 的 Excel 檔案`);
          return;
        }
        
        spinner.text = '合併欄位資料...';
        const result = await mergeService.mergeFields(operation, workbooks);
        
        spinner.succeed('分析完成');
        
        console.log(chalk.blue(`\n📊 ${operation} 分析結果:`));
        console.log(`- Excel 檔案數: ${workbooks.length}`);
        console.log(`- 總欄位數: ${result.totalFields}`);
        console.log(`- 新增欄位: ${result.newFields}`);
        console.log(`- 更新欄位: ${result.updatedFields}`);
        console.log(`- 衝突數量: ${result.conflicts}`);
        
        // 儲存分析結果
        await mergeService.saveMergeResult(result);
        console.log(chalk.gray(`\n分析報告已儲存至: api_methods/${operation}/excel-merge-report.md`));
        
      } else {
        spinner.text = '掃描所有 Excel 檔案...';
        const files = await excelService.scanExcelFiles();
        
        spinner.succeed(`發現 ${files.length} 個 Excel 檔案`);
        
        // 按操作代碼分組
        const filesByOperation: Record<string, number> = {};
        files.forEach(file => {
          const match = file.match(/\/([A-Z]+_?\d+)\//);
          if (match) {
            const op = match[1];
            filesByOperation[op] = (filesByOperation[op] || 0) + 1;
          }
        });
        
        console.log(chalk.blue('\n📋 各操作的 Excel 檔案統計:'));
        Object.entries(filesByOperation)
          .sort(([a], [b]) => a.localeCompare(b))
          .forEach(([op, count]) => {
            console.log(`  ${op}: ${count} 個檔案`);
          });
      }
      
    } catch (error) {
      spinner.fail('分析失敗');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

importExcelCommand
  .command('merge <operation>')
  .description('合併 Excel 內容到現有文檔')
  .option('-f, --force', '強制覆蓋現有文檔', false)
  .action(async (operation, options) => {
    const spinner = ora('初始化服務...').start();
    
    try {
      const { ExcelImportService } = await import('./services/excel-import.service');
      const { MergeService } = await import('./services/merge.service');
      const { ExcelMergeGenerator } = await import('./generators/excel-merge.generator');
      
      const excelService = new ExcelImportService();
      const mergeService = new MergeService();
      const generator = new ExcelMergeGenerator();
      
      spinner.text = `讀取 ${operation} 的 Excel 檔案...`;
      const workbooks = await excelService.readOperationExcels(operation);
      
      if (workbooks.length === 0) {
        spinner.fail(`未找到 ${operation} 的 Excel 檔案`);
        return;
      }
      
      spinner.text = '合併欄位資料...';
      const result = await mergeService.mergeFields(operation, workbooks);
      
      spinner.text = '生成更新文檔...';
      
      // 生成所有文檔（包含 method 文檔）
      await generator.generateAllDocuments(result, workbooks);
      
      // 儲存合併結果
      await mergeService.saveMergeResult(result);
      
      spinner.succeed('合併完成');
      
      console.log(chalk.green.bold(`\n✅ ${operation} 文檔更新成功！\n`));
      console.log(chalk.blue('更新統計:'));
      console.log(`  📊 總欄位數: ${result.totalFields}`);
      console.log(`  ✨ 新增欄位: ${result.newFields}`);
      console.log(`  📝 更新欄位: ${result.updatedFields}`);
      console.log(`  ⚠️  衝突數量: ${result.conflicts}`);
      
      console.log(chalk.gray('\n已更新的檔案:'));
      console.log('  - README.md');
      console.log('  - all-fields.md');
      console.log('  - field-data.json');
      console.log('  - update-suggestions.md');
      console.log('  - excel-merge-report.md');
      
      // 顯示生成的 method 文檔
      const methodTypes = [...new Set(workbooks.map(w => w.methodType))];
      if (methodTypes.length > 0) {
        console.log(chalk.gray('\n已生成的 Method 文檔:'));
        methodTypes.forEach(method => {
          console.log(`  - ${method}.md`);
        });
      }
      
      if (result.conflicts > 0) {
        console.log(chalk.yellow('\n⚠️  請檢查 merge-conflicts.json 以解決衝突'));
      }
      
    } catch (error) {
      spinner.fail('合併失敗');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

importExcelCommand
  .command('analyze <operation>')
  .description('分析單個操作的合併可行性')
  .option('--detailed', '顯示詳細分析', false)
  .action(async (operation, options) => {
    const spinner = ora('初始化分析服務...').start();
    
    try {
      const { BatchMergeAnalyzerService } = await import('./services/batch-merge-analyzer.service');
      const { ConflictReportGenerator } = await import('./generators/conflict-report.generator');
      
      const analyzer = new BatchMergeAnalyzerService();
      
      spinner.text = `分析 ${operation}...`;
      const analysis = await analyzer.analyzeOperation(operation);
      
      spinner.succeed(`分析完成`);
      
      // 顯示分析結果
      console.log(chalk.blue.bold(`\n${operation} 分析結果\n`));
      console.log(`📊 基本資訊:`);
      console.log(`  Excel 檔案: ${analysis.hasExcel ? chalk.green('✓') : chalk.red('✗')} (${analysis.excelFileCount} 個)`);
      console.log(`  資料庫文檔: ${analysis.hasDatabase ? chalk.green('✓') : chalk.red('✗')}`);
      console.log(`  總欄位數: ${analysis.fieldCount}`);
      console.log(`  衝突數量: ${analysis.conflictCount}`);
      console.log('');
      console.log(`🎯 分析結論:`);
      console.log(`  風險等級: ${analysis.mergeRisk === 'low' ? chalk.green('低') : analysis.mergeRisk === 'medium' ? chalk.yellow('中') : chalk.red('高')}`);
      console.log(`  建議動作: ${analysis.recommendation === 'auto-merge' ? chalk.green('自動合併') : analysis.recommendation === 'manual-review' ? chalk.yellow('人工審核') : chalk.red('跳過')}`);
      
      if (analysis.skipReason) {
        console.log(`  跳過原因: ${chalk.red(analysis.skipReason)}`);
      }
      
      if (options.detailed && analysis.conflictTypes.length > 0) {
        console.log('');
        console.log(chalk.yellow('衝突詳情:'));
        analysis.conflictTypes.forEach(ct => {
          console.log(`  ${ct.type}: ${ct.count} 個 (嚴重性: ${ct.severity})`);
          ct.examples.slice(0, 2).forEach(ex => {
            console.log(`    - ${ex}`);
          });
        });
      }
      
    } catch (error) {
      spinner.fail('分析失敗');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

importExcelCommand
  .command('scan')
  .description('掃描所有 Excel 檔案')
  .action(async () => {
    const spinner = ora('掃描 Excel 檔案...').start();
    
    try {
      const { ExcelImportService } = await import('./services/excel-import.service');
      const excelService = new ExcelImportService();
      
      const files = await excelService.scanExcelFiles();
      
      spinner.succeed(`發現 ${files.length} 個 Excel 檔案`);
      
      console.log(chalk.blue('\n📁 Excel 檔案清單:\n'));
      
      files.forEach((file, index) => {
        const relativePath = file.replace('/opt/apiserv/erp_api_docs/GP40/', '');
        console.log(`${index + 1}. ${relativePath}`);
      });
      
    } catch (error) {
      spinner.fail('掃描失敗');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// 錯誤處理
program.configureHelp({
  sortSubcommands: true
});

program.on('command:*', () => {
  console.error(chalk.red('❌ 未知命令。使用 --help 查看可用命令。'));
  process.exit(1);
});

// 解析命令列參數
program.parse();

// 如果沒有提供任何命令，顯示幫助
if (!process.argv.slice(2).length) {
  program.outputHelp();
}