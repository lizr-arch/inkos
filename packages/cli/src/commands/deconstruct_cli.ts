import { Command } from "commander";
import {
  deconstruct,
  generateCalibration,
  analyzeAudience,
  formatReport,
} from "@actalk/inkos-core";
import type { DeconstructOptions, DeconstructSearchConfig, AuditCalibration } from "@actalk/inkos-core";
import { defaultSearchConfig } from "@actalk/inkos-core";
import { loadConfig, buildPipelineConfig, findProjectRoot, resolveBookId, log, logError } from "../utils.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { StateManager } from "@actalk/inkos-core";

async function readTextFile(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const cjkCount = (utf8.match(/[\u4e00-\u9fff]/g) || []).length;
  if (cjkCount === 0 && buffer.length > 1000) {
    try {
      const gbk = new TextDecoder("gbk", { fatal: false }).decode(buffer);
      const gbkCjk = (gbk.match(/[\u4e00-\u9fff]/g) || []).length;
      if (gbkCjk > cjkCount) return gbk;
    } catch { /* GBK not supported */ }
  }
  return utf8;
}

export const deconstructCommand = new Command("deconstruct")
  .description("Deconstruct a reference text — 7-layer novel analysis");

// ── deconstruct run ──
deconstructCommand
  .command("run")
  .description("Run full deconstruct analysis on a reference text")
  .argument("<file>", "Reference text file (.txt/.md)")
  .option("--depth <n>", "Analysis depth (1-7)", "6")
  .option("--language <lang>", "Text language (zh/en, auto-detect if omitted)")
  .option("--name <name>", "Source name for the report")
  .option("--json", "Output JSON only")
  .option("--max-chapters <n>", "Max chapters to analyze", parseInt)
  .option("--book <id>", "Book ID to associate calibration with")
  .action(async (file: string, opts) => {
    try {
      const depth = Math.min(7, Math.max(1, parseInt(opts.depth ?? "6", 10))) as DeconstructOptions["depth"];
      const root = findProjectRoot();
      const text = await readTextFile(resolve(file));
      const language = (opts.language as "zh" | "en") ?? (text.match(/[\u4e00-\u9fff]/g)?.length ?? 0 > 100 ? "zh" : "en");

      if (!opts.json) log(`拆书分析：${opts.name ?? file}（深度 L1-L${depth}）`);

      const config = await loadConfig();
      const pipelineConfig = buildPipelineConfig(config, root);
      const { chatCompletion } = await import("@actalk/inkos-core");

      const report = await deconstruct({
        text,
        options: {
          depth,
          language,
          sourceName: opts.name ?? file,
          maxChapters: opts.maxChapters,
          onChapterProgress: (ch, total) => {
            if (!opts.json && ch % 5 === 0) log(`  标注进度：${ch}/${total} 章`);
          },
        },
        chatCompletion: (msgs, chatOpts) =>
          chatCompletion(pipelineConfig.client, pipelineConfig.model, msgs, {
            temperature: chatOpts?.temperature,
          }),
        log: (msg) => { if (!opts.json) log(msg); },
      });

      // Determine base deconstruct directory: book-scoped or project-scoped
      let baseDeconstructDir: string;
      if (opts.book) {
        const bookId = await resolveBookId(opts.book, root);
        const state = new StateManager(root);
        const bookDir = state.bookDir(bookId);
        baseDeconstructDir = join(bookDir, "story", "deconstruct");
        if (!opts.json) log(`  关联到书籍：${bookId}`);
      } else {
        baseDeconstructDir = join(root, "story", "deconstruct");
      }
      // Each source gets its own subdirectory, so multiple books don't overwrite
      const sourceName = (opts.name ?? file).replace(/[\/\\:*?"<>|]/g, "_");
      const deconstructDir = join(baseDeconstructDir, "sources", sourceName);
      await mkdir(deconstructDir, { recursive: true });

      const calibration = generateCalibration(report);
      await writeFile(
        join(deconstructDir, "audit-calibration.json"),
        JSON.stringify(calibration, null, 2),
        "utf-8",
      );

      await writeFile(join(deconstructDir, "L1-lexicon.json"), JSON.stringify(report.layers.L1, null, 2), "utf-8");
      if (depth >= 2) {
        await writeFile(join(deconstructDir, "L2-structure.json"), JSON.stringify(report.layers.L2, null, 2), "utf-8");
        await writeFile(join(deconstructDir, "L3-fluctuation.json"), JSON.stringify(report.layers.L3, null, 2), "utf-8");
        await writeFile(join(deconstructDir, "L4-tone.json"), JSON.stringify(report.layers.L4, null, 2), "utf-8");
        await writeFile(join(deconstructDir, "L5-characters.json"), JSON.stringify(report.layers.L5, null, 2), "utf-8");
        await writeFile(join(deconstructDir, "L6-reader-effects.json"), JSON.stringify(report.layers.L6, null, 2), "utf-8");
      }

      const mdReport = formatReport(report, language);
      await writeFile(join(deconstructDir, "report.md"), mdReport, "utf-8");

      if (opts.json) {
        log(JSON.stringify({ report: join(deconstructDir, "report.md"), calibration: join(deconstructDir, "audit-calibration.json") }));
      } else {
        log(`\n报告已保存：${join(deconstructDir, "report.md")}`);
        log(`审计校准：${join(deconstructDir, "audit-calibration.json")}`);
      }
    } catch (e) {
      logError(`分析失败: ${e}`);
      process.exit(1);
    }
  });

// ── deconstruct audience ──
deconstructCommand
  .command("audience")
  .description("Analyze target audience for a genre (L7)")
  .option("--genre <genre>", "Genre ID or name")
  .option("--config <path>", "Custom search config JSON file")
  .option("--show-config", "Show the default search config and exit")
  .option("--language <lang>", "Writing language (zh/en)", "zh")
  .action(async (opts) => {
    try {
      if (opts.showConfig) {
        const cfg = defaultSearchConfig(opts.genre ?? "wuxia");
        log(JSON.stringify(cfg, null, 2));
        return;
      }

      const genre = opts.genre ?? "wuxia";
      let searchConfig: DeconstructSearchConfig;

      if (opts.config) {
        const raw = await readTextFile(resolve(opts.config));
        searchConfig = JSON.parse(raw) as DeconstructSearchConfig;
      } else {
        searchConfig = defaultSearchConfig(genre);
      }

      const language = (opts.language as "zh" | "en") ?? "zh";
      const root = findProjectRoot();
      const config = await loadConfig();
      const pipelineConfig = buildPipelineConfig(config, root);
      const { chatCompletion } = await import("@actalk/inkos-core");

      log(`读者分析：${genre}（搜索配置：${searchConfig.sources.length} 个来源）`);

      const audience = await analyzeAudience({
        chatCompletion: (msgs, chatOpts) =>
          chatCompletion(pipelineConfig.client, pipelineConfig.model, msgs, {
            temperature: chatOpts?.temperature,
          }),
        config: searchConfig,
        language,
        log: (msg) => log(msg),
      });

      const deconstructDir = join(root, "story", "deconstruct");
      await mkdir(deconstructDir, { recursive: true });
      await writeFile(join(deconstructDir, "L7-audience.json"), JSON.stringify(audience, null, 2), "utf-8");

      log(`\n读者分析已保存：${join(deconstructDir, "L7-audience.json")}`);
      log("\n甜点 (Sweet Spots):");
      for (const s of audience.sweetSpots) {
        log(`  - ${s.spot} (${s.source})`);
      }
      log("\n毒点 (Deal Breakers):");
      for (const d of audience.dealBreakers) {
        log(`  - ${d.breaker} (${d.source})`);
      }
    } catch (e) {
      logError(`读者分析失败: ${e}`);
      process.exit(1);
    }
  });

// ── deconstruct calibrate ──
deconstructCommand
  .command("calibrate")
  .description("Generate audit calibration from a deconstruct report")
  .argument("<file>", "Reference text file")
  .option("--depth <n>", "Analysis depth for calibration", "6")
  .option("--language <lang>", "Text language")
  .option("--name <name>", "Source name")
  .option("--book <id>", "Book ID to associate calibration with")
  .action(async (file: string, opts) => {
    try {
      const depth = Math.min(7, Math.max(1, parseInt(opts.depth ?? "6", 10))) as DeconstructOptions["depth"];
      const root = findProjectRoot();
      const text = await readTextFile(resolve(file));
      const language = (opts.language as "zh" | "en") ?? (text.match(/[\u4e00-\u9fff]/g)?.length ?? 0 > 100 ? "zh" : "en");

      const config = await loadConfig();
      const pipelineConfig = buildPipelineConfig(config, root);
      const { chatCompletion } = await import("@actalk/inkos-core");

      log(`生成审计校准...`);

      const report = await deconstruct({
        text,
        options: {
          depth,
          language,
          sourceName: opts.name ?? file,
          onChapterProgress: (ch, total) => {
            if (ch % 5 === 0) log(`  标注：${ch}/${total} 章`);
          },
        },
        chatCompletion: (msgs, chatOpts) =>
          chatCompletion(pipelineConfig.client, pipelineConfig.model, msgs, {
            temperature: chatOpts?.temperature,
          }),
        log: (msg) => log(msg),
      });

      const calibration = generateCalibration(report);
      let baseDeconstructDir: string;
      if (opts.book) {
        const state = new StateManager(root);
        baseDeconstructDir = join(state.bookDir(await resolveBookId(opts.book, root)), "story", "deconstruct");
      } else {
        baseDeconstructDir = join(root, "story", "deconstruct");
      }
      const sourceName = (opts.name ?? file).replace(/[\/\\:*?"<>|]/g, "_");
      const deconstructDir = join(baseDeconstructDir, "sources", sourceName);
      await mkdir(deconstructDir, { recursive: true });
      await writeFile(join(deconstructDir, "audit-calibration.json"), JSON.stringify(calibration, null, 2), "utf-8");

      log(`审计校准已保存：${join(deconstructDir, "audit-calibration.json")}`);
      log(`\n校准摘要：`);
      log(`  句长阈值：P05=${calibration.sentenceLength.p05} P95=${calibration.sentenceLength.p95}`);
      log(`  短段警告：${calibration.paragraph.shortParagraphWarning ? "启用" : "禁用"}`);
      log(`  内心独白：${calibration.pov.forbidInnerMonologue ? "禁用" : "允许"}`);
      log(`  开场模式：${calibration.opening.expectedTypes.join(", ") || "不限"}`);
      log(`  收尾模式：${calibration.closing.expectedPattern}`);
      log(`  翻页强度：≥${calibration.pageTurner.minStrength}`);
    } catch (e) {
      logError(`校准生成失败: ${e}`);
      process.exit(1);
    }
  });

// ── deconstruct merge ──
deconstructCommand
  .command("merge")
  .description("Merge multiple source calibrations into one. Reads all sources/ subdirectories.")
  .option("--book <id>", "Book ID to merge and save calibration for")
  .option("--json", "Output JSON only")
  .action(async (opts) => {
    try {
      const root = findProjectRoot();
      let deconstructDir: string;
      if (opts.book) {
        const bookId = await resolveBookId(opts.book, root);
        const state = new StateManager(root);
        deconstructDir = join(state.bookDir(bookId), "story", "deconstruct");
      } else {
        deconstructDir = join(root, "story", "deconstruct");
      }

      const sourcesDir = join(deconstructDir, "sources");
      const { readdir } = await import("node:fs/promises");
      let entries: string[];
      try {
        entries = await readdir(sourcesDir);
      } catch {
        log("没有找到 sources/ 子目录。请先运行 deconstruct run 导入参考文本。");
        process.exit(0);
      }

      // Filter to directories only
      const dirNames: string[] = [];
      for (const e of entries) {
        try {
          const s = await import("node:fs/promises").then(m => m.stat(join(sourcesDir, e)));
          if (s.isDirectory()) dirNames.push(e);
        } catch { /* skip */ }
      }
      if (dirNames.length === 0) {
        log("sources/ 下没有子目录。请先运行 deconstruct run 导入参考文本。");
        process.exit(0);
      }

      const { mergeCalibrations } = await import("@actalk/inkos-core");

      const cals: AuditCalibration[] = [];
      for (const name of dirNames) {
        try {
          const raw = await readTextFile(join(sourcesDir, name, "audit-calibration.json"));
          cals.push(JSON.parse(raw) as AuditCalibration);
        } catch {
          if (!opts.json) log(`  跳过 ${name}（无校准文件）`);
        }
      }

      if (cals.length === 0) {
        log("没有找到有效的校准文件。");
        process.exit(0);
      }

      const merged = mergeCalibrations(cals);
      await writeFile(join(deconstructDir, "audit-calibration.json"), JSON.stringify(merged, null, 2), "utf-8");
      await mkdir(deconstructDir, { recursive: true });

      if (opts.json) {
        log(JSON.stringify(merged));
      } else {
        log(`合并完成：${dirNames.length} 个来源 → audit-calibration.json`);
        log(`  来源：${merged.sourceName}`);
        log(`  句长范围：P05=${merged.sentenceLength.p05} P95=${merged.sentenceLength.p95}`);
        log(`  短段警告：${merged.paragraph.shortParagraphWarning ? "启用" : "禁用"}`);
        log(`  开场模式：${merged.opening.expectedTypes.join(", ") || "不限"}`);
        log(`  收尾模式：${merged.closing.expectedPattern}`);
        log(`  调性范围：叙事距离 ${merged.tone.narrativeDistanceRange[0]}-${merged.tone.narrativeDistanceRange[1]}，孤独 ${merged.tone.lonelinessIndexRange[0]}-${merged.tone.lonelinessIndexRange[1]}`);
        log(`  翻页强度：≥${merged.pageTurner.minStrength}`);
      }
    } catch (e) {
      logError(`合并失败: ${e}`);
      process.exit(1);
    }
  });
