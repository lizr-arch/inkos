/**
 * Audit calibrator — generates audit-calibration.json from deconstruct report.
 * Also handles L7 audience analysis via LLM synthesis.
 */
import type {
  Layer1Lexicon,
  Layer2Structure,
  Layer3Fluctuation,
  Layer4Tone,
  Layer5Characters,
  Layer6ReaderEffects,
  Layer7Audience,
  DeconstructReport,
  DeconstructSearchConfig,
} from "../models/deconstruct.js";
import type { AuditCalibration } from "../models/audit-calibration.js";
import { DEFAULT_CALIBRATION } from "../models/audit-calibration.js";

// ────────────────────────────────────────────────
// Calibration generator
// ────────────────────────────────────────────────

export function generateCalibration(report: DeconstructReport): AuditCalibration {
  const { L1, L2, L3, L4, L5, L6, L7 } = report.layers;
  const sourceName = report.meta.sourceName;

  // Sentence length calibration — use P10 approximation: halfway between 0 and P25
  const sP05Inner = Math.max(2, Math.round(L1.sentenceLength.p25 * 0.5));
  const sP95 = L1.sentenceLength.p95 + 10;

  // Paragraph calibration: disable short-paragraph warnings if the source
  // consistently uses short paragraphs (p50 < 35)
  const paragraphShortWarning = L1.paragraphLength.p50 >= 35;
  const shortMin = paragraphShortWarning ? 35 : null;
  const consecutiveShortWarning = L1.paragraphLength.p50 >= 20;
  const maxConsecutive = consecutiveShortWarning ? (L1.dialogueTurnLength.maxConsecutiveTurns * 3) : null;

  // Opening/closing patterns
  const dominantOpening = Object.entries(L2.openingPatterns)
    .sort((a, b) => b[1] - a[1]);
  const expectedOpeningTypes = dominantOpening
    .filter(([, count]) => count > 0)
    .slice(0, 2)
    .map(([type]) => type);
  const unusedOpenings = dominantOpening
    .filter(([, count]) => count === 0)
    .map(([type]) => type);

  const dominantClosing = Object.entries(L2.closingPatterns)
    .sort((a, b) => b[1] - a[1]);
  const closingPattern = dominantClosing.length > 0 ? dominantClosing[0]![0] : "any";

  // Dialogue calibration
  const dialogueRatios = L1.dialogueDensity.map(d => d.ratio);
  const dMin = dialogueRatios.length > 0 ? Math.max(0, Math.min(...dialogueRatios) - 5) : 0;
  const dMax = dialogueRatios.length > 0 ? Math.min(100, Math.max(...dialogueRatios) + 5) : 100;

  // Combat calibration from L4 violence aesthetic
  const combatForbidTechniques = L4.violenceAesthetic < 30;
  const combatMaxDesc = L4.violenceAesthetic < 30 ? Math.round(L6.surpriseDensity * 200 + 200) : 10000;
  const combatRequireEnv = L4.violenceAesthetic < 30;

  // POV calibration
  const povForbidInner = L2.totalInnerMonologueBreaches === 0 && L2.povDistribution.objective > 0;
  const povDominant = Object.entries(L2.povDistribution)
    .sort((a, b) => b[1] - a[1]);
  const povMode = povDominant.length > 0 ? povDominant[0]![0] : "any";

  // Character entrance — from L1 avg paragraph (rough proxy for lead-in)
  const entranceMin = Math.max(0, Math.round(L1.paragraphLength.p25 * 0.5));
  const entranceMax = Math.round(L1.paragraphLength.p95 * 2);

  // Emotion calibration
  const emotionVolMin = Math.max(0, L3.volatility * 0.5);
  const emotionVolMax = Math.min(100, L3.volatility * 2 + 5);
  const emotionRevMin = Math.max(0, L3.reversalFrequency * 0.3);
  const emotionRevMax = Math.min(10, L3.reversalFrequency * 3 + 0.5);

  // Page turner
  const pageTurnerMin = Math.max(1, Math.round(L6.surpriseDensity > 3 ? 3 : (L6.surpriseDensity > 1.5 ? 2 : 1)));

  // Reader preferences from L7 if available
  const sweetSpots = L7?.sweetSpots.map(s => s.spot) ?? [];
  const dealBreakers = L7?.dealBreakers.map(d => d.breaker) ?? [];

  return {
    sourceName,
    generatedAt: new Date().toISOString(),
    enabled: true,
    sentenceLength: { p05: Math.round(sP05Inner), p95: Math.round(sP95) },
    paragraph: {
      shortParagraphWarning: paragraphShortWarning,
      shortParagraphMinLength: shortMin,
      consecutiveShortWarning: consecutiveShortWarning,
      maxConsecutiveShort: maxConsecutive,
    },
    opening: {
      expectedTypes: expectedOpeningTypes,
      forbiddenTypes: unusedOpenings,
    },
    closing: {
      expectedPattern: closingPattern,
      avgClosingLengthMin: Math.max(0, L2.avgClosingLength - 20),
      avgClosingLengthMax: L2.avgClosingLength + 30,
    },
    dialogue: {
      densityRange: [dMin, dMax] as const,
      maxConsecutiveTurns: L1.dialogueTurnLength.maxConsecutiveTurns + 3,
    },
    combat: {
      forbidTechniqueNames: combatForbidTechniques,
      maxDescriptionLength: combatMaxDesc,
      requireEnvironmentalMetaphors: combatRequireEnv,
    },
    pov: {
      forbidInnerMonologue: povForbidInner,
      expectedMode: povMode,
    },
    characterEntrance: {
      minLeadLength: entranceMin,
      maxLeadLength: entranceMax,
    },
    tone: {
      narrativeDistanceRange: [
        Math.max(0, L4.narrativeDistance - 15),
        Math.min(100, L4.narrativeDistance + 15),
      ] as const,
      lonelinessIndexRange: [
        Math.max(0, L4.lonelinessIndex - 15),
        Math.min(100, L4.lonelinessIndex + 15),
      ] as const,
      warmthLevelRange: [
        Math.max(0, L4.warmthLevel - 15),
        Math.min(100, L4.warmthLevel + 15),
      ] as const,
    },
    emotion: {
      volatilityRange: [emotionVolMin, emotionVolMax] as const,
      reversalFrequencyRange: [emotionRevMin, emotionRevMax] as const,
    },
    pageTurner: { minStrength: pageTurnerMin },
    reader: { sweetSpots, dealBreakers },
  };
}

export function loadCalibration(json: string): AuditCalibration {
  try {
    const parsed = JSON.parse(json) as Partial<AuditCalibration>;
    return { ...DEFAULT_CALIBRATION, ...parsed };
  } catch {
    return { ...DEFAULT_CALIBRATION };
  }
}

// ────────────────────────────────────────────────
// L7: Audience analysis — LLM synthesis from search results
// ────────────────────────────────────────────────

export interface AudienceAnalysisContext {
  readonly chatCompletion: (
    messages: ReadonlyArray<{ readonly role: "system" | "user" | "assistant"; readonly content: string }>,
    options?: { readonly temperature?: number },
  ) => Promise<{ readonly content: string }>;
  readonly searchResults?: string; // concatenated search results
  readonly config: DeconstructSearchConfig;
  readonly language: "zh" | "en";
  readonly log?: (msg: string) => void;
}

export async function analyzeAudience(ctx: AudienceAnalysisContext): Promise<Layer7Audience> {
  const { chatCompletion, searchResults, config, language, log } = ctx;
  const isZh = language === "zh";

  const systemPrompt = isZh
    ? `你是一个读者画像分析专家。根据搜索信息，分析目标小说类型的读者群体。

输出严格 JSON（不要任何其他文字）：
{
  "targetDemographic": { "age": "年龄段", "scenario": "阅读场景", "willingness": "付费意愿" },
  "sweetSpots": [{ "spot": "爽点", "evidence": "来自搜索的佐证", "source": "来源平台" }],
  "dealBreakers": [{ "breaker": "毒点", "evidence": "佐证", "source": "来源平台" }],
  "genreTolerances": [{ "aspect": "维度", "tolerance": "high|medium|low" }],
  "authenticityAnchors": [{ "anchor": "锚点", "description": "解释" }],
  "identityProjection": { "avatar": "代入身份", "projectionType": "强者/弱者/聪明人/普通人" },
  "satisfactionFrequency": 数字（几章一个爽点）
}

关键词：${config.keywords.sweet.join("、")}
毒点关键词：${config.keywords.bitter.join("、")}
风格关键词：${config.keywords.style.join("、")}`
    : `You are a reader demographics analyst. Based on search info, analyze the target audience.

Output strict JSON (no other text):
{
  "targetDemographic": { "age": "...", "scenario": "...", "willingness": "..." },
  "sweetSpots": [{ "spot": "...", "evidence": "...", "source": "..." }],
  "dealBreakers": [{ "breaker": "...", "evidence": "...", "source": "..." }],
  "genreTolerances": [{ "aspect": "...", "tolerance": "high|medium|low" }],
  "authenticityAnchors": [{ "anchor": "...", "description": "..." }],
  "identityProjection": { "avatar": "...", "projectionType": "..." },
  "satisfactionFrequency": number
}`;

  const searchInfo = searchResults && searchResults.length > 100
    ? `搜索结果摘要：\n${searchResults.slice(0, 8000)}`
    : isZh
      ? "（无搜索结果。请基于体裁知识进行合理推断。）"
      : "(No search results. Make reasonable inferences based on genre knowledge.)";

  if (log) log("L7 读者期望分析...");

  const response = await chatCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `体裁：${config.genre}\n\n${searchInfo}` },
    ],
    { temperature: 0.3 },
  );

  try {
    const cleaned = response.content
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const parsed = JSON.parse(cleaned) as Layer7Audience;
    return parsed;
  } catch {
    if (log) log("L7 解析失败，使用默认推断");
    return {
      targetDemographic: { age: isZh ? "18-35" : "18-35", scenario: isZh ? "通勤/睡前" : "commute/bedtime", willingness: isZh ? "中等" : "medium" },
      sweetSpots: [],
      dealBreakers: [],
      genreTolerances: [],
      authenticityAnchors: [],
      identityProjection: { avatar: isZh ? "普通读者" : "general reader", projectionType: isZh ? "普通人" : "ordinary" },
      satisfactionFrequency: 3,
    };
  }
}

// ────────────────────────────────────────────────
// Report formatter (Markdown)
// ────────────────────────────────────────────────

export function formatReport(report: DeconstructReport, language: "zh" | "en"): string {
  const isZh = language === "zh";
  const { L1, L2, L3, L4, L5, L6, L7 } = report.layers;

  const h = (text: string, level: number) => `${"#".repeat(level)} ${text}`;
  const kv = (k: string, v: unknown) => `- **${k}**：${v}`;
  const t = (zh: string, en: string) => isZh ? zh : en;

  const lines: string[] = [
    h(t("拆书报告", "Deconstruct Report"), 1),
    "",
    kv(t("来源", "Source"), report.meta.sourceName),
    kv(t("分析时间", "Analyzed at"), report.meta.analyzedAt),
    kv(t("章节数", "Chapters"), report.meta.totalChapters),
    kv(t("总字数", "Total chars"), report.meta.totalCharacters),
    "",
    h(t("第一层：语言指纹", "Layer 1: Lexicon"), 2),
    "",
    h(t("句长分布", "Sentence Length"), 3),
    kv(t("中位数(P50)", "Median(P50)"), `${L1.sentenceLength.p50}字`),
    kv(t("P25-P75", "P25-P75"), `${L1.sentenceLength.p25}-${L1.sentenceLength.p75}字`),
    kv(t("均值±标准差", "Mean±Stddev"), `${L1.sentenceLength.mean}±${L1.sentenceLength.stddev}字`),
    "",
    h(t("段落长度", "Paragraph Length"), 3),
    kv(t("中位数", "Median"), `${L1.paragraphLength.p50}字`),
    kv(t("最短-最长", "Min-Max"), `${L1.paragraphLength.min}-${L1.paragraphLength.max}字`),
    "",
    h(t("对话特征", "Dialogue"), 3),
    kv(t("平均对话密度", "Avg density"), `${L1.dialogueDensity.length > 0 ? Math.round(L1.dialogueDensity.reduce((s,d) => s + d.ratio, 0) / L1.dialogueDensity.length) : 0}%`),
    kv(t("话轮中位数", "Turn median"), `${L1.dialogueTurnLength.p50}字`),
    kv(t("最长连续对白", "Max consecutive turns"), `${L1.dialogueTurnLength.maxConsecutiveTurns}轮`),
    kv(t("对话归属:'说'/'道'/无标记", "Attribution"), `${L1.dialogueAttribution.said}/${L1.dialogueAttribution.dao}/${L1.dialogueAttribution.unmarked}`),
    "",
    h(t("标点指纹", "Punctuation"), 3),
    kv(t("省略号/千字", "Ellipsis/k"), L1.punctuation.ellipsisPer1000),
    kv(t("破折号/千字", "Dash/k"), L1.punctuation.dashPer1000),
    kv(t("句号占比", "Period ratio"), L1.punctuation.periodRatio),
    "",
    h(t("词汇多样性", "Vocabulary"), 3),
    kv("TTR", L1.vocabulary.ttr),

    "",
    h(t("第二层：章节结构", "Layer 2: Structure"), 2),
    kv(t("章长中位数", "Chapter length median"), `${L2.chapterLengthDistribution.p50}字`),
    kv(t("开场模式", "Openings"), Object.entries(L2.openingPatterns).filter(([,c]) => c > 0).map(([k,c]) => `${k}=${c}`).join(", ")),
    kv(t("收尾模式", "Closings"), Object.entries(L2.closingPatterns).filter(([,c]) => c > 0).map(([k,c]) => `${k}=${c}`).join(", ")),
    kv(t("视角分布", "POV"), Object.entries(L2.povDistribution).filter(([,c]) => c > 0).map(([k,c]) => `${k}=${c}`).join(", ")),
    kv(t("内心独白越界", "Inner breaches"), L2.totalInnerMonologueBreaches),

    "",
    h(t("第三层：叙事波动", "Layer 3: Fluctuation"), 2),
    kv(t("情绪波动率(std)", "Volatility"), L3.volatility),
    kv(t("反转频率(/章)", "Reversal freq"), L3.reversalFrequency),
    kv(t("反转振幅(均值/最大)", "Amplitude"), `${L3.reversalAmplitude.mean}/${L3.reversalAmplitude.max}`),
    kv(t("权力转移分布", "Power transfer"), `W=${L3.powerTransfer.distribution.win} L=${L3.powerTransfer.distribution.loss} T=${L3.powerTransfer.distribution.tie}`),

    "",
    h(t("第四层：调性", "Layer 4: Tone"), 2),
    kv(t("叙事距离(0近-100远)", "Distance"), L4.narrativeDistance),
    kv(t("哲学密度(0低-100高)", "Philosophy"), L4.philosophyDensity),
    kv(t("幽默质感(0无-100喜)", "Humor"), L4.humorQuality),
    kv(t("暴力美学(0避-100血)", "Violence"), L4.violenceAesthetic),
    kv(t("孤独指数(0无-100满)", "Loneliness"), L4.lonelinessIndex),
    kv(t("温度(0冷-100暖)", "Warmth"), L4.warmthLevel),

    "",
    h(t("第五层：角色工程", "Layer 5: Characters"), 2),
    kv(t("出场工艺", "Entrance"), L5.entranceCraft.pattern),
    kv(t("角色数", "Characters"), L5.characterFunctions.length),
    ...L5.characterFunctions.map(c => `  - ${c.name} (${c.function})`),

    "",
    h(t("第六层：读者效应", "Layer 6: Reader Effects"), 2),
    kv(t("意外密度(/章)", "Surprise density"), L6.surpriseDensity),
    kv(t("余味分布", "Aftertaste"), `弱=${L6.aftertasteDistribution.weak} 中=${L6.aftertasteDistribution.medium} 强=${L6.aftertasteDistribution.strong}`),
  ];

  if (L7) {
    lines.push(
      "",
      h(t("第七层：读者期望", "Layer 7: Audience"), 2),
      kv(t("目标读者", "Demographic"), `${L7.targetDemographic.age ?? "?"} / ${L7.targetDemographic.scenario ?? "?"}`),
      kv(t("爽点频率", "Satisfaction freq"), `${L7.satisfactionFrequency}章/次`),
      "",
      h(t("甜点 (Sweet Spots)", "Sweet Spots"), 3),
      ...L7.sweetSpots.map(s => `- **${s.spot}**：${s.evidence} (${s.source})`),
      "",
      h(t("毒点 (Deal Breakers)", "Deal Breakers"), 3),
      ...L7.dealBreakers.map(d => `- **${d.breaker}**：${d.evidence} (${d.source})`),
    );
  }

  return lines.join("\n");
}

// ────────────────────────────────────────────────
// Multi-source calibration merge
// ────────────────────────────────────────────────

export function mergeCalibrations(calibrations: ReadonlyArray<AuditCalibration>): AuditCalibration {
  if (calibrations.length === 0) return { ...DEFAULT_CALIBRATION, enabled: true };
  if (calibrations.length === 1) return calibrations[0]!;

  const sourceNames = calibrations.map(c => c.sourceName).filter(Boolean);

  // Sentence length: take widest range across all sources
  const p05 = Math.min(...calibrations.map(c => c.sentenceLength.p05));
  const p95 = Math.max(...calibrations.map(c => c.sentenceLength.p95));

  // Paragraph: use most permissive settings (if any source says don't warn, don't warn)
  const shortParagraphWarning = calibrations.some(c => c.paragraph.shortParagraphWarning);
  const shortMin = Math.min(
    ...calibrations.map(c => c.paragraph.shortParagraphMinLength ?? 999).filter(n => n !== null),
  );
  const consecutiveShortWarning = calibrations.some(c => c.paragraph.consecutiveShortWarning);
  const maxConsecutiveShort = Math.max(
    ...calibrations.map(c => c.paragraph.maxConsecutiveShort ?? 0).filter(n => n !== null),
    0,
  );

  // Opening: union of expected types, intersection of forbidden
  const expectedTypes = [...new Set(calibrations.flatMap(c => c.opening.expectedTypes))];
  const forbiddenTypes = [...new Set(calibrations.flatMap(c => c.opening.forbiddenTypes))];

  // Closing: take the pattern from the source with most chapters
  const closing = calibrations[0]!.closing;

  // Dialogue: widest range, max turns
  const dMin = Math.min(...calibrations.map(c => c.dialogue.densityRange[0]));
  const dMax = Math.max(...calibrations.map(c => c.dialogue.densityRange[1]));
  const maxTurns = Math.max(...calibrations.map(c => c.dialogue.maxConsecutiveTurns));

  // Combat: use most restrictive (if any source forbids techniques, forbid)
  const forbidTechniques = calibrations.some(c => c.combat.forbidTechniqueNames);
  const maxCombatDesc = Math.min(...calibrations.map(c => c.combat.maxDescriptionLength));
  const requireEnvMetaphors = calibrations.some(c => c.combat.requireEnvironmentalMetaphors);

  // POV: if any source forbids inner monologue, forbid
  const forbidInner = calibrations.some(c => c.pov.forbidInnerMonologue);
  const povModes = [...new Set(calibrations.map(c => c.pov.expectedMode))];

  // Character entrance: widest range
  const entranceMin = Math.min(...calibrations.map(c => c.characterEntrance.minLeadLength));
  const entranceMax = Math.max(...calibrations.map(c => c.characterEntrance.maxLeadLength));

  // Tone: union of all ranges
  const toneDistMin = Math.min(...calibrations.map(c => c.tone.narrativeDistanceRange[0]));
  const toneDistMax = Math.max(...calibrations.map(c => c.tone.narrativeDistanceRange[1]));
  const toneLonelyMin = Math.min(...calibrations.map(c => c.tone.lonelinessIndexRange[0]));
  const toneLonelyMax = Math.max(...calibrations.map(c => c.tone.lonelinessIndexRange[1]));
  const toneWarmthMin = Math.min(...calibrations.map(c => c.tone.warmthLevelRange[0]));
  const toneWarmthMax = Math.max(...calibrations.map(c => c.tone.warmthLevelRange[1]));

  // Emotion: widest range
  const volMin = Math.min(...calibrations.map(c => c.emotion.volatilityRange[0]));
  const volMax = Math.max(...calibrations.map(c => c.emotion.volatilityRange[1]));
  const revMin = Math.min(...calibrations.map(c => c.emotion.reversalFrequencyRange[0]));
  const revMax = Math.max(...calibrations.map(c => c.emotion.reversalFrequencyRange[1]));

  // Page-turner: lowest threshold
  const minStrength = Math.min(...calibrations.map(c => c.pageTurner.minStrength));

  // Reader: union of sweet spots and deal-breakers
  const sweetSpots = [...new Set(calibrations.flatMap(c => c.reader.sweetSpots))];
  const dealBreakers = [...new Set(calibrations.flatMap(c => c.reader.dealBreakers))];

  return {
    sourceName: `merged: ${sourceNames.join(", ")}`,
    generatedAt: new Date().toISOString(),
    enabled: true,
    sentenceLength: { p05, p95 },
    paragraph: {
      shortParagraphWarning,
      shortParagraphMinLength: shortMin === 999 ? null : shortMin,
      consecutiveShortWarning,
      maxConsecutiveShort: maxConsecutiveShort === 0 ? null : maxConsecutiveShort,
    },
    opening: { expectedTypes, forbiddenTypes },
    closing,
    dialogue: { densityRange: [dMin, dMax] as const, maxConsecutiveTurns: maxTurns },
    combat: { forbidTechniqueNames: forbidTechniques, maxDescriptionLength: maxCombatDesc, requireEnvironmentalMetaphors: requireEnvMetaphors },
    pov: { forbidInnerMonologue: forbidInner, expectedMode: povModes.join(", ") },
    characterEntrance: { minLeadLength: entranceMin, maxLeadLength: entranceMax },
    tone: {
      narrativeDistanceRange: [toneDistMin, toneDistMax] as const,
      lonelinessIndexRange: [toneLonelyMin, toneLonelyMax] as const,
      warmthLevelRange: [toneWarmthMin, toneWarmthMax] as const,
    },
    emotion: {
      volatilityRange: [volMin, volMax] as const,
      reversalFrequencyRange: [revMin, revMax] as const,
    },
    pageTurner: { minStrength },
    reader: { sweetSpots, dealBreakers },
  };
}
