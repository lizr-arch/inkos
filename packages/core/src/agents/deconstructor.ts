/**
 * Deconstructor — 7-layer novel analysis engine.
 *
 * L1: Pure code (milliseconds)
 * L2-L5: LLM-assisted per-chapter annotation
 * L6: Synthesized from L2-L5
 * L7: External search + LLM synthesis (separate module)
 */
import type {
  Layer1Lexicon,
  Layer2Structure,
  Layer3Fluctuation,
  Layer4Tone,
  Layer5Characters,
  Layer6ReaderEffects,
  ChapterAnnotation,
  DeconstructReport,
  DeconstructOptions,
  SentenceLengthHistogram,
  ChapterOpeningType,
  ChapterClosingType,
  SceneTransitionType,
  PovMode,
  ToneEvidence,
} from "../models/deconstruct.js";

// ────────────────────────────────────────────────
// Chapter splitting
// ────────────────────────────────────────────────

const CHAPTER_SPLIT_RE = /第[一二三四五六七八九十百千\d]+[章回]\s*[^\n]*/g;

function splitChapters(text: string, maxChapters?: number): string[] {
  const matches = [...text.matchAll(CHAPTER_SPLIT_RE)];
  if (matches.length === 0) {
    // Fallback: split by large blank-line gaps as "chapters"
    return [text];
  }
  const chapters: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    chapters.push(text.slice(start, end).trim());
  }
  if (maxChapters && chapters.length > maxChapters) {
    return chapters.slice(0, maxChapters);
  }
  return chapters;
}

// ────────────────────────────────────────────────
// L1: Pure code analysis
// ────────────────────────────────────────────────

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! * (hi - pos) + sorted[hi]! * (pos - lo);
}

function buildHistogram(values: number[], bins: number[], labels: string[]): SentenceLengthHistogram[] {
  const counts = new Array(bins.length).fill(0);
  for (const v of values) {
    for (let i = 0; i < bins.length; i++) {
      if (v <= bins[i]!) { counts[i]++; break; }
      if (i === bins.length - 1) counts[i]++;
    }
  }
  return labels.map((bin, i) => ({ bin, count: counts[i]! }));
}

function countCJK(text: string): number {
  let cjk = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x4E00 && code <= 0x9FFF) ||
      (code >= 0x3400 && code <= 0x4DBF) ||
      (code >= 0x20000 && code <= 0x2A6DF) ||
      (code >= 0xF900 && code <= 0xFAFF)
    ) {
      cjk++;
    }
  }
  return cjk;
}

function analyzeL1(text: string): Layer1Lexicon {
  // Split sentences
  const rawSentences = text.split(/[。！？\n]/).map(s => s.trim()).filter(s => s.length > 0);
  const sentenceLengths = rawSentences.map(s => countCJK(s)).filter(n => n > 0);
  const sortedLen = [...sentenceLengths].sort((a, b) => a - b);

  // Sentence histogram
  const sBins = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 999];
  const sLabels = ["0-5", "6-10", "11-15", "16-20", "21-25", "26-30", "31-40", "41-50", "51-75", "76-100", "100+"];
  const sHistogram = buildHistogram(sentenceLengths, sBins, sLabels);

  const sMean = sentenceLengths.length > 0 ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length : 0;
  const sStddev = sentenceLengths.length > 1
    ? Math.sqrt(sentenceLengths.reduce((sum, l) => sum + (l - sMean) ** 2, 0) / sentenceLengths.length)
    : 0;

  // Paragraph lengths
  const rawParagraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
  const paragraphLengths = rawParagraphs.map(p => countCJK(p)).filter(n => n > 0);
  const sortedPara = [...paragraphLengths].sort((a, b) => a - b);

  // Dialogue detection (quoted text in Chinese: 「」 or "")
  const dialoguePattern = /(?:「[^」]*」|"[^"]*"|『[^』]*』)/g;
  const dialogueMatches = [...text.matchAll(dialoguePattern)];

  // Dialogue density: split text into ~500 CJK char chunks
  const chunkSize = 500;
  const totalCJK = countCJK(text);
  const chunkCount = Math.ceil(totalCJK / chunkSize);
  const dialogueDensity: { position: number; ratio: number }[] = [];
  for (let i = 0; i < chunkCount; i++) {
    // Approximate: count dialogue in each CJK range
    const startApprox = Math.floor((i / chunkCount) * text.length);
    const endApprox = Math.floor(((i + 1) / chunkCount) * text.length);
    const slice = text.slice(startApprox, endApprox);
    const sliceDialogue = [...slice.matchAll(dialoguePattern)];
    const dialogueChars = sliceDialogue.reduce((sum, m) => sum + m[0].length, 0);
    const sliceCJK = countCJK(slice);
    dialogueDensity.push({
      position: i * chunkSize,
      ratio: sliceCJK > 0 ? Math.round((dialogueChars / sliceCJK) * 100) : 0,
    });
  }

  // Dialogue turn length: measure consecutive dialogue lines
  const allDialogueStrings = dialogueMatches.map(m => m[0].replace(/[「」"『』]/g, ""));
  const dialogueTurnLengths = allDialogueStrings.map(s => countCJK(s)).filter(n => n > 0);
  const sortedDTL = [...dialogueTurnLengths].sort((a, b) => a - b);

  // Max consecutive turns: lines in the text that are dialogue
  const lines = text.split("\n");
  let maxConsecutive = 0;
  let currentConsecutive = 0;
  for (const line of lines) {
    if (dialoguePattern.test(line)) {
      currentConsecutive++;
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
    } else {
      currentConsecutive = 0;
    }
  }

  // Dialogue attribution
  let saidCount = 0;
  let daoCount = 0;
  for (const line of lines) {
    if (dialoguePattern.test(line)) {
      if (/说/.test(line)) saidCount++;
      if (/道/.test(line)) daoCount++;
    }
  }
  const totalAttributed = saidCount + daoCount;
  const unmarkedCount = Math.max(0, dialogueMatches.length - totalAttributed);

  // Punctuation stats
  const totalPunct = (text.match(/[，。！？、：；""''（）【】《》…—\-]/g) || []).length;
  const ellipsisCount = (text.match(/…/g) || []).length;
  const dashCount = (text.match(/—/g) || []).length;
  const semicolonCount = (text.match(/；/g) || []).length;
  const periodCount = (text.match(/。/g) || []).length;

  const totalCJKChars = countCJK(text);
  const per1000 = (n: number) => totalCJKChars > 0 ? Math.round((n / totalCJKChars) * 100000) / 100 : 0;

  // Vocabulary: character-level TTR
  const cleanText = text.replace(/[\s\n\r，。！？、：；""''（）【】《》\d\w]/g, "");
  const uniqueChars = new Set(cleanText);
  const ttr = cleanText.length > 0 ? Math.round((uniqueChars.size / cleanText.length) * 1000) / 1000 : 0;

  // Top words (2-char bigrams for Chinese)
  const bigramCounts: Record<string, number> = {};
  for (let i = 0; i < cleanText.length - 1; i++) {
    const bigram = cleanText.slice(i, i + 2);
    bigramCounts[bigram] = (bigramCounts[bigram] ?? 0) + 1;
  }
  const topWords = Object.entries(bigramCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([word, count]) => ({ word, count }));

  // Content/function ratio (very rough: content = CJK chars, function = punctuation + spaces)
  const contentChars = cleanText.length;
  const totalAllChars = text.replace(/\s/g, "").length;
  const contentFunctionRatio = totalAllChars > 0 ? Math.round((contentChars / totalAllChars) * 1000) / 1000 : 0;

  return {
    sentenceLength: {
      histogram: sHistogram,
      p25: quantile(sortedLen, 0.25),
      p50: quantile(sortedLen, 0.5),
      p75: quantile(sortedLen, 0.75),
      p95: quantile(sortedLen, 0.95),
      mean: Math.round(sMean * 10) / 10,
      stddev: Math.round(sStddev * 10) / 10,
    },
    paragraphLength: {
      p25: quantile(sortedPara, 0.25),
      p50: quantile(sortedPara, 0.5),
      p75: quantile(sortedPara, 0.75),
      p95: quantile(sortedPara, 0.95),
      mean: sortedPara.length > 0 ? Math.round(sortedPara.reduce((a, b) => a + b, 0) / sortedPara.length) : 0,
      min: sortedPara.length > 0 ? sortedPara[0]! : 0,
      max: sortedPara.length > 0 ? sortedPara[sortedPara.length - 1]! : 0,
    },
    dialogueDensity,
    dialogueTurnLength: {
      p50: quantile(sortedDTL, 0.5),
      p75: quantile(sortedDTL, 0.75),
      p95: quantile(sortedDTL, 0.95),
      maxConsecutiveTurns: maxConsecutive,
    },
    dialogueAttribution: {
      said: saidCount,
      dao: daoCount,
      unmarked: unmarkedCount,
    },
    punctuation: {
      ellipsisPer1000: per1000(ellipsisCount),
      dashPer1000: per1000(dashCount),
      semicolonPer1000: per1000(semicolonCount),
      periodRatio: totalPunct > 0 ? Math.round((periodCount / totalPunct) * 1000) / 1000 : 0,
    },
    vocabulary: {
      ttr,
      topWords,
      contentFunctionRatio,
    },
  };
}

// ────────────────────────────────────────────────
// Chapter annotation prompt (used for L2-L5)
// ────────────────────────────────────────────────

function buildChapterAnnotationPrompt(chapterNum: number, chapterText: string, language: "zh" | "en"): string {
  const isZh = language === "zh";
  const sysPrompt = isZh
    ? `你是一位小说结构分析专家。分析以下章节文本，输出一个严格的 JSON 对象（不要任何其他文字）。

字段说明：
- openingType: "environment"|"dialogue"|"action"|"inner" — 章节如何开头
- closingType: "singleLine"|"dialogue"|"cliffhanger"|"openEnd"|"summary" — 章节如何收尾
- closingLength: 收尾段落的字数（CJK字符数）
- sceneCount: 场景数量
- transitionTypes: 场景切换方式数组 ["blankLine","timeMarker","hardCut","imageryCut"]
- povMode: "objective"|"limited"|"omniscient" — 视角模式。古龙式风格为objective
- innerMonologueBreach: true/false — 是否出现角色内心独白
- emotionValence: -10到10，章节整体情绪倾向（负=悲伤/紧张，正=温暖/振奋）
- infoDensity: 0到1，新信息密度
- suspenseOpen: 本章新开的悬念数
- suspenseResolved: 本章解决的悬念数
- surpriseCount: 出乎意料的事件数
- emotionalHitCount: 让读者心头一动的瞬间数
- memoryAnchorCount: 独特的意象/场景/对话数（让读者记得住）
- pageTurnerStrength: 1-4，章末翻页驱动力（1弱/4致命）
- aftertasteQuality: "weak"|"medium"|"strong" — 收尾余味
- powerEvents: 权力/地位转移事件数组 [{winner, loser, type:"power"|"info"|"relationship"|"moral"}]
- keyExcerpts: 2-3个最能代表本章特色的原文摘录（各不超过50字）`
    : `You are a literary structure analyst. Analyze the following chapter and output a strict JSON object (no other text).

Fields:
- openingType: "environment"|"dialogue"|"action"|"inner"
- closingType: "singleLine"|"dialogue"|"cliffhanger"|"openEnd"|"summary"
- closingLength: character count of the closing paragraph
- sceneCount: number of scenes
- transitionTypes: array of ["blankLine","timeMarker","hardCut","imageryCut"]
- povMode: "objective"|"limited"|"omniscient"
- innerMonologueBreach: boolean
- emotionValence: -10 to 10
- infoDensity: 0 to 1
- suspenseOpen: number of new suspense threads
- suspenseResolved: number of resolved suspense threads
- surpriseCount: number of surprising events
- emotionalHitCount: number of emotionally impactful moments
- memoryAnchorCount: number of unique memorable elements
- pageTurnerStrength: 1-4
- aftertasteQuality: "weak"|"medium"|"strong"
- powerEvents: array of {winner, loser, type:"power"|"info"|"relationship"|"moral"}
- keyExcerpts: 2-3 brief excerpts (max 50 chars each)`;

  return JSON.stringify([
    { role: "system", content: sysPrompt },
    { role: "user", content: `第${chapterNum}章:\n\n${chapterText.slice(0, 6000)}` },
  ]);
}

// ────────────────────────────────────────────────
// L2-L5 synthesis from annotations
// ────────────────────────────────────────────────

function synthesizeL2(annotations: ChapterAnnotation[]): Layer2Structure {
  const lengths = annotations.map(a => a.chapterLength).sort((a, b) => a - b);
  const chapterEntries = annotations.map(a => ({ num: a.chapterNumber, length: a.chapterLength }));

  const openingCounts: Record<string, number> = { environment: 0, dialogue: 0, action: 0, inner: 0 };
  const closingCounts: Record<string, number> = { singleLine: 0, dialogue: 0, cliffhanger: 0, openEnd: 0, summary: 0 };
  const transitionCounts: Record<string, number> = { blankLine: 0, timeMarker: 0, hardCut: 0, imageryCut: 0 };
  const povCounts: Record<string, number> = { objective: 0, limited: 0, omniscient: 0 };
  const sceneCounts: number[] = [];
  let breachCount = 0;

  for (const a of annotations) {
    openingCounts[a.openingType] = (openingCounts[a.openingType] ?? 0) + 1;
    closingCounts[a.closingType] = (closingCounts[a.closingType] ?? 0) + 1;
    for (const t of a.transitionTypes) {
      transitionCounts[t] = (transitionCounts[t] ?? 0) + 1;
    }
    povCounts[a.povMode] = (povCounts[a.povMode] ?? 0) + 1;
    if (a.innerMonologueBreach) breachCount++;
    sceneCounts.push(a.sceneCount);
  }

  const sortedScene = [...sceneCounts].sort((a, b) => a - b);
  const avgClosing = annotations.length > 0
    ? Math.round(annotations.reduce((s, a) => s + a.closingLength, 0) / annotations.length)
    : 0;

  return {
    chapterLengthDistribution: {
      chapters: chapterEntries,
      p25: quantile(lengths, 0.25),
      p50: quantile(lengths, 0.5),
      p75: quantile(lengths, 0.75),
      p95: quantile(lengths, 0.95),
    },
    openingPatterns: openingCounts as Record<ChapterOpeningType, number>,
    closingPatterns: closingCounts as Record<ChapterClosingType, number>,
    avgClosingLength: avgClosing,
    sceneTransition: transitionCounts as Record<SceneTransitionType, number>,
    scenesPerChapter: {
      p50: quantile(sortedScene, 0.5),
      p75: quantile(sortedScene, 0.75),
      p95: quantile(sortedScene, 0.95),
    },
    povDistribution: povCounts as Record<PovMode, number>,
    totalInnerMonologueBreaches: breachCount,
  };
}

function synthesizeL3(annotations: ChapterAnnotation[]): Layer3Fluctuation {
  const emotionCurve = annotations.map(a => ({ chapter: a.chapterNumber, valence: a.emotionValence }));
  const infoCurve = annotations.map(a => ({ chapter: a.chapterNumber, density: a.infoDensity }));
  const suspenseCurve = annotations.map(a => ({
    chapter: a.chapterNumber,
    open: a.suspenseOpen,
    resolved: a.suspenseResolved,
  }));

  const valences = annotations.map(a => a.emotionValence);
  const vMean = valences.length > 0 ? valences.reduce((a, b) => a + b, 0) / valences.length : 0;
  const volatility = valences.length > 1
    ? Math.round(Math.sqrt(valences.reduce((s, v) => s + (v - vMean) ** 2, 0) / valences.length) * 10) / 10
    : 0;

  // Reversal frequency: sign changes between consecutive chapters
  let reversals = 0;
  for (let i = 1; i < valences.length; i++) {
    if (Math.sign(valences[i]!) !== Math.sign(valences[i - 1]!) && valences[i] !== 0 && valences[i - 1] !== 0) {
      reversals++;
    }
  }
  const reversalFreq = annotations.length > 1 ? Math.round((reversals / (annotations.length - 1)) * 100) / 100 : 0;

  // Reversal amplitude
  const amplitudes: number[] = [];
  for (let i = 1; i < valences.length; i++) {
    amplitudes.push(Math.abs(valences[i]! - valences[i - 1]!));
  }
  const ampMean = amplitudes.length > 0 ? Math.round(amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length * 10) / 10 : 0;
  const ampMax = amplitudes.length > 0 ? Math.max(...amplitudes) : 0;

  // Power transfer
  const allPower = annotations.flatMap(a => a.powerEvents);
  const winCount = allPower.filter(e => e.type === "power").length;
  const lossCount = allPower.filter(e => e.type === "info").length;
  // Note: "tie" is the moral/relationship events
  const tieCount = allPower.filter(e => e.type === "relationship" || e.type === "moral").length;

  return {
    emotionCurve,
    volatility,
    reversalFrequency: reversalFreq,
    reversalAmplitude: { mean: ampMean, max: ampMax },
    informationDensityCurve: infoCurve,
    suspenseCurve,
    powerTransfer: {
      distribution: { win: winCount, loss: lossCount, tie: tieCount },
      reversalTypes: {
        power: allPower.filter(e => e.type === "power").length,
        info: allPower.filter(e => e.type === "info").length,
        relationship: allPower.filter(e => e.type === "relationship").length,
        moral: allPower.filter(e => e.type === "moral").length,
      },
    },
  };
}

function synthesizeL4(annotations: ChapterAnnotation[], l1: Layer1Lexicon): Layer4Tone {
  // Narrative distance: higher when pov is objective, lower when omniscient + inner monologue
  const objRatio = annotations.length > 0
    ? annotations.filter(a => a.povMode === "objective").length / annotations.length
    : 0;
  const breachRatio = annotations.length > 0
    ? annotations.filter(a => a.innerMonologueBreach).length / annotations.length
    : 0;
  const narrativeDistance = Math.round((objRatio * 80 + (1 - breachRatio) * 20));

  // Philosophy density: based on dialogue density + short closing
  const avgDialogueDensity = l1.dialogueDensity.length > 0
    ? l1.dialogueDensity.reduce((s, d) => s + d.ratio, 0) / l1.dialogueDensity.length
    : 0;
  const singleLineClosings = annotations.filter(a => a.closingType === "singleLine").length;
  const singleLineRatio = annotations.length > 0 ? singleLineClosings / annotations.length : 0;
  const philosophyDensity = Math.round(Math.min(100, avgDialogueDensity * 0.8 + singleLineRatio * 40));

  // Humor: low in most genres, estimate from positive valence frequency
  const positiveRatio = annotations.length > 0
    ? annotations.filter(a => a.emotionValence > 3).length / annotations.length
    : 0;
  const humorQuality = Math.round(Math.min(100, positiveRatio * 40));

  // Violence: based on power event frequency
  const powerEventsPerChapter = annotations.length > 0
    ? annotations.reduce((s, a) => s + a.powerEvents.length, 0) / annotations.length
    : 0;
  const violenceAesthetic = Math.round(Math.min(100, powerEventsPerChapter * 25 + 10));

  // Loneliness: objective pov + low warmth scenes
  const negativeRatio = annotations.length > 0
    ? annotations.filter(a => a.emotionValence < -3).length / annotations.length
    : 0;
  const lonelinessIndex = Math.round(objRatio * 40 + negativeRatio * 50);

  // Warmth: opposite of loneliness, scaled
  const warmthLevel = Math.round(Math.min(100, positiveRatio * 60));

  const evidence: ToneEvidence[] = [
    { dimension: "叙事距离", excerpt: `客观视角占比${Math.round(objRatio * 100)}%`, score: narrativeDistance },
    { dimension: "哲学密度", excerpt: `对话密度${Math.round(avgDialogueDensity)}%，单句收尾比${Math.round(singleLineRatio * 100)}%`, score: philosophyDensity },
    { dimension: "幽默质感", excerpt: `正向情绪章占比${Math.round(positiveRatio * 100)}%`, score: humorQuality },
    { dimension: "暴力美学", excerpt: `每章权力事件${powerEventsPerChapter.toFixed(1)}个`, score: violenceAesthetic },
    { dimension: "孤独感", excerpt: `客观视角+负向情绪综合`, score: lonelinessIndex },
    { dimension: "温度", excerpt: `正向情绪章占比${Math.round(positiveRatio * 100)}%`, score: warmthLevel },
  ];

  return { narrativeDistance, philosophyDensity, humorQuality, violenceAesthetic, lonelinessIndex, warmthLevel, evidence };
}

function synthesizeL5(annotations: ChapterAnnotation[]): Layer5Characters {
  // Character engineering is hard to do purely from annotations without full text analysis.
  // Provide a structural summary from available data.
  const allPower = annotations.flatMap(a => a.powerEvents);
  const uniqueChars = new Set<string>();
  for (const e of allPower) {
    uniqueChars.add(e.winner);
    uniqueChars.add(e.loser);
  }
  const charList = [...uniqueChars];

  const entranceCraft = {
    pattern: annotations.length > 0 && annotations[0]!.openingType === "environment"
      ? "环境→细节→对话/动作→名字"
      : "无法从标注确定完整模式",
    avgLeadLength: 0, // needs full text analysis
  };

  const characterFunctions = charList.map(name => ({
    name,
    function: "driver" as const,
  }));

  return {
    entranceCraft,
    characterDifferentiation: [],
    relationshipArcs: [],
    characterFunctions,
    exitPatterns: [],
  };
}

function synthesizeL6(annotations: ChapterAnnotation[]): Layer6ReaderEffects {
  const surpriseDensity = annotations.length > 0
    ? Math.round(annotations.reduce((s, a) => s + a.surpriseCount, 0) / annotations.length * 10) / 10
    : 0;

  const emotionalHits = annotations.map(a => ({
    chapter: a.chapterNumber,
    count: a.emotionalHitCount,
    types: a.emotionValence > 0 ? ["温暖", "共鸣"] as const : ["伤感", "触动"] as const,
  }));

  const memoryAnchors = annotations.map(a => ({
    chapter: a.chapterNumber,
    count: a.memoryAnchorCount,
  }));

  const pageTurnerCurve = annotations.map(a => ({
    chapter: a.chapterNumber,
    strength: a.pageTurnerStrength,
  }));

  const weak = annotations.filter(a => a.aftertasteQuality === "weak").length;
  const medium = annotations.filter(a => a.aftertasteQuality === "medium").length;
  const strong = annotations.filter(a => a.aftertasteQuality === "strong").length;

  return {
    surpriseDensity,
    emotionalHits,
    memoryAnchors,
    pageTurnerCurve,
    aftertasteDistribution: { weak, medium, strong },
  };
}

// ────────────────────────────────────────────────
// Main deconstruct function
// ────────────────────────────────────────────────

export interface DeconstructContext {
  readonly chatCompletion: (
    messages: ReadonlyArray<{ readonly role: "system" | "user" | "assistant"; readonly content: string }>,
    options?: { readonly temperature?: number },
  ) => Promise<{ readonly content: string }>;
  readonly text: string;
  readonly options: DeconstructOptions;
  readonly log?: (msg: string) => void;
}

export async function deconstruct(ctx: DeconstructContext): Promise<DeconstructReport> {
  const { text, options, chatCompletion, log } = ctx;
  const depth = options.depth;

  const chapters = splitChapters(text, options.maxChapters);
  if (log) log(`分章完成：共 ${chapters.length} 章`);

  // L1: always run (pure code)
  if (log) log("L1 语言指纹分析...");
  const L1 = analyzeL1(text);

  // L2-L5: LLM annotation per chapter
  const annotations: ChapterAnnotation[] = [];
  if (depth >= 2) {
    if (log) log(`L2-L5 逐章标注（${chapters.length} 章）...`);
    for (let i = 0; i < chapters.length; i++) {
      const chapterText = chapters[i]!;
      const chapterNum = i + 1;
      options.onChapterProgress?.(chapterNum, chapters.length);

      // Use LLM for chapter annotation
      const prompt = buildChapterAnnotationPrompt(chapterNum, chapterText, options.language);
      const messages = JSON.parse(prompt) as Array<{ role: "system" | "user" | "assistant"; content: string }>;

      try {
        const response = await chatCompletion(messages, { temperature: 0.2 });
        const cleaned = response.content
          .replace(/```json\s*/g, "")
          .replace(/```\s*/g, "")
          .trim();
        const parsed = JSON.parse(cleaned) as ChapterAnnotation;
        annotations.push({
          ...parsed,
          chapterNumber: chapterNum,
          chapterLength: countCJK(chapterText),
        });
      } catch {
        // Fallback: minimal annotation from L1
        const lines = chapterText.split("\n").filter(l => l.trim());
        const firstLine = lines[0] ?? "";
        const dialoguePattern = /[「」"『』]/;
        annotations.push({
          chapterNumber: chapterNum,
          chapterLength: countCJK(chapterText),
          openingType: dialoguePattern.test(firstLine) ? "dialogue" : "environment",
          closingType: "openEnd",
          closingLength: lines.length > 0 ? countCJK(lines[lines.length - 1] ?? "") : 0,
          sceneCount: 1,
          transitionTypes: ["blankLine"],
          povMode: "objective",
          innerMonologueBreach: false,
          emotionValence: 0,
          infoDensity: 0.5,
          suspenseOpen: 1,
          suspenseResolved: 0,
          surpriseCount: 1,
          emotionalHitCount: 1,
          memoryAnchorCount: 1,
          pageTurnerStrength: 2,
          aftertasteQuality: "medium",
          powerEvents: [],
          keyExcerpts: [],
        });
      }
    }
  }

  // Synthesize L2-L6 from annotations
  const L2 = annotations.length > 0 ? synthesizeL2(annotations) : emptyL2();
  const L3 = annotations.length > 0 ? synthesizeL3(annotations) : emptyL3();
  const L4 = synthesizeL4(annotations, L1);
  const L5 = synthesizeL5(annotations);
  const L6 = annotations.length > 0 ? synthesizeL6(annotations) : emptyL6();

  if (log) log("分析完成");

  return {
    meta: {
      sourceName: options.sourceName ?? "unknown",
      analyzedAt: new Date().toISOString(),
      totalChapters: chapters.length,
      totalCharacters: countCJK(text),
    },
    layers: { L1, L2, L3, L4, L5, L6 },
  };
}

// ────────────────────────────────────────────────
// Empty fallbacks for when no annotations exist
// ────────────────────────────────────────────────

function emptyL2(): Layer2Structure {
  return {
    chapterLengthDistribution: { chapters: [], p25: 0, p50: 0, p75: 0, p95: 0 },
    openingPatterns: { environment: 0, dialogue: 0, action: 0, inner: 0 },
    closingPatterns: { singleLine: 0, dialogue: 0, cliffhanger: 0, openEnd: 0, summary: 0 },
    avgClosingLength: 0,
    sceneTransition: { blankLine: 0, timeMarker: 0, hardCut: 0, imageryCut: 0 },
    scenesPerChapter: { p50: 0, p75: 0, p95: 0 },
    povDistribution: { objective: 0, limited: 0, omniscient: 0 },
    totalInnerMonologueBreaches: 0,
  };
}

function emptyL3(): Layer3Fluctuation {
  return {
    emotionCurve: [],
    volatility: 0,
    reversalFrequency: 0,
    reversalAmplitude: { mean: 0, max: 0 },
    informationDensityCurve: [],
    suspenseCurve: [],
    powerTransfer: {
      distribution: { win: 0, loss: 0, tie: 0 },
      reversalTypes: { power: 0, info: 0, relationship: 0, moral: 0 },
    },
  };
}

function emptyL6(): Layer6ReaderEffects {
  return {
    surpriseDensity: 0,
    emotionalHits: [],
    memoryAnchors: [],
    pageTurnerCurve: [],
    aftertasteDistribution: { weak: 0, medium: 0, strong: 0 },
  };
}
