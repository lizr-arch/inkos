/**
 * 7-layer deconstruct model — full-spectrum novel analysis.
 *
 * L1: Lexicon (language fingerprint)
 * L2: Structure (chapter architecture)
 * L3: Fluctuation (narrative rhythm)
 * L4: Tone (atmospheric signature)
 * L5: Characters (character engineering)
 * L6: Reader Effects (what the author does to readers)
 * L7: Audience (who reads it, what they crave)
 */

// ────────────────────────────────────────────
// L1: Language Fingerprint (pure code)
// ────────────────────────────────────────────

export interface SentenceLengthHistogram {
  readonly bin: string;   // e.g. "0-10字"
  readonly count: number;
}

export interface Layer1Lexicon {
  readonly sentenceLength: {
    readonly histogram: ReadonlyArray<SentenceLengthHistogram>;
    readonly p25: number;
    readonly p50: number;
    readonly p75: number;
    readonly p95: number;
    readonly mean: number;
    readonly stddev: number;
  };
  readonly paragraphLength: {
    readonly p25: number;
    readonly p50: number;
    readonly p75: number;
    readonly p95: number;
    readonly mean: number;
    readonly min: number;
    readonly max: number;
  };
  readonly dialogueDensity: ReadonlyArray<{
    readonly position: number;
    readonly ratio: number;
  }>;
  readonly dialogueTurnLength: {
    readonly p50: number;
    readonly p75: number;
    readonly p95: number;
    readonly maxConsecutiveTurns: number;
  };
  readonly dialogueAttribution: {
    readonly said: number;
    readonly dao: number;
    readonly unmarked: number;
  };
  readonly punctuation: {
    readonly ellipsisPer1000: number;
    readonly dashPer1000: number;
    readonly semicolonPer1000: number;
    readonly periodRatio: number;
  };
  readonly vocabulary: {
    readonly ttr: number;
    readonly topWords: ReadonlyArray<{ readonly word: string; readonly count: number }>;
    readonly contentFunctionRatio: number;
  };
}

// ────────────────────────────────────────────
// L2: Chapter Structure (LLM-assisted annotation)
// ────────────────────────────────────────────

export type ChapterOpeningType = "environment" | "dialogue" | "action" | "inner";
export type ChapterClosingType = "singleLine" | "dialogue" | "cliffhanger" | "openEnd" | "summary";
export type SceneTransitionType = "blankLine" | "timeMarker" | "hardCut" | "imageryCut";
export type PovMode = "objective" | "limited" | "omniscient";

export interface ChapterAnnotation {
  readonly chapterNumber: number;
  readonly chapterLength: number;
  readonly openingType: ChapterOpeningType;
  readonly closingType: ChapterClosingType;
  readonly closingLength: number;
  readonly sceneCount: number;
  readonly transitionTypes: ReadonlyArray<SceneTransitionType>;
  readonly povMode: PovMode;
  readonly innerMonologueBreach: boolean;
  readonly emotionValence: number;         // -10..+10
  readonly infoDensity: number;            // 0..1
  readonly suspenseOpen: number;
  readonly suspenseResolved: number;
  readonly surpriseCount: number;
  readonly emotionalHitCount: number;
  readonly memoryAnchorCount: number;
  readonly pageTurnerStrength: 1 | 2 | 3 | 4;
  readonly aftertasteQuality: "weak" | "medium" | "strong";
  readonly powerEvents: ReadonlyArray<{
    readonly winner: string;
    readonly loser: string;
    readonly type: "power" | "info" | "relationship" | "moral";
  }>;
  readonly keyExcerpts: ReadonlyArray<string>;
}

export interface Layer2Structure {
  readonly chapterLengthDistribution: {
    readonly chapters: ReadonlyArray<{ readonly num: number; readonly length: number }>;
    readonly p25: number;
    readonly p50: number;
    readonly p75: number;
    readonly p95: number;
  };
  readonly openingPatterns: Record<ChapterOpeningType, number>;
  readonly closingPatterns: Record<ChapterClosingType, number>;
  readonly avgClosingLength: number;
  readonly sceneTransition: Record<SceneTransitionType, number>;
  readonly scenesPerChapter: { readonly p50: number; readonly p75: number; readonly p95: number };
  readonly povDistribution: Record<PovMode, number>;
  readonly totalInnerMonologueBreaches: number;
}

// ────────────────────────────────────────────
// L3: Narrative Fluctuation
// ────────────────────────────────────────────

export interface Layer3Fluctuation {
  readonly emotionCurve: ReadonlyArray<{ readonly chapter: number; readonly valence: number }>;
  readonly volatility: number;
  readonly reversalFrequency: number;
  readonly reversalAmplitude: { readonly mean: number; readonly max: number };
  readonly informationDensityCurve: ReadonlyArray<{ readonly chapter: number; readonly density: number }>;
  readonly suspenseCurve: ReadonlyArray<{
    readonly chapter: number;
    readonly open: number;
    readonly resolved: number;
  }>;
  readonly powerTransfer: {
    readonly distribution: { readonly win: number; readonly loss: number; readonly tie: number };
    readonly reversalTypes: { readonly power: number; readonly info: number; readonly relationship: number; readonly moral: number };
  };
}

// ────────────────────────────────────────────
// L4: Tone Model
// ────────────────────────────────────────────

export interface ToneEvidence {
  readonly dimension: string;
  readonly excerpt: string;
  readonly score: number;
}

export interface Layer4Tone {
  readonly narrativeDistance: number;   // 0=immersive → 100=detached
  readonly philosophyDensity: number;  // 0=pure action → 100=maxim per page
  readonly humorQuality: number;       // 0=none → 100=comedy
  readonly violenceAesthetic: number;  // 0=avoidant → 100=gore
  readonly lonelinessIndex: number;    // 0=none → 100=pervasive melancholy
  readonly warmthLevel: number;        // 0=icy → 100=warm
  readonly evidence: ReadonlyArray<ToneEvidence>;
}

// ────────────────────────────────────────────
// L5: Character Engineering
// ────────────────────────────────────────────

export type RelationshipType = "friendship" | "rivalry" | "mentor" | "romance";
export type CharacterFunction = "driver" | "blocker" | "witness" | "atmosphere" | "foil";

export interface Layer5Characters {
  readonly entranceCraft: {
    readonly pattern: string;
    readonly avgLeadLength: number;
  };
  readonly characterDifferentiation: ReadonlyArray<{
    readonly pair: readonly [string, string];
    readonly score: number;
  }>;
  readonly relationshipArcs: ReadonlyArray<{
    readonly pair: readonly [string, string];
    readonly type: RelationshipType;
    readonly developmentPace: number;
  }>;
  readonly characterFunctions: ReadonlyArray<{
    readonly name: string;
    readonly function: CharacterFunction;
  }>;
  readonly exitPatterns: ReadonlyArray<{
    readonly character: string;
    readonly method: string;
    readonly foreshadowChapters: number;
  }>;
}

// ────────────────────────────────────────────
// L6: Reader Effects
// ────────────────────────────────────────────

export interface Layer6ReaderEffects {
  readonly surpriseDensity: number;
  readonly emotionalHits: ReadonlyArray<{
    readonly chapter: number;
    readonly count: number;
    readonly types: ReadonlyArray<string>;
  }>;
  readonly memoryAnchors: ReadonlyArray<{
    readonly chapter: number;
    readonly count: number;
  }>;
  readonly pageTurnerCurve: ReadonlyArray<{
    readonly chapter: number;
    readonly strength: 1 | 2 | 3 | 4;
  }>;
  readonly aftertasteDistribution: {
    readonly weak: number;
    readonly medium: number;
    readonly strong: number;
  };
}

// ────────────────────────────────────────────
// L7: Audience Expectations
// ────────────────────────────────────────────

export interface SweetSpot {
  readonly spot: string;
  readonly evidence: string;
  readonly source: string;
}

export interface DealBreaker {
  readonly breaker: string;
  readonly evidence: string;
  readonly source: string;
}

export interface GenreTolerance {
  readonly aspect: string;
  readonly tolerance: "high" | "medium" | "low";
}

export interface Layer7Audience {
  readonly targetDemographic: {
    readonly age?: string;
    readonly scenario?: string;
    readonly willingness?: string;
  };
  readonly sweetSpots: ReadonlyArray<SweetSpot>;
  readonly dealBreakers: ReadonlyArray<DealBreaker>;
  readonly genreTolerances: ReadonlyArray<GenreTolerance>;
  readonly authenticityAnchors: ReadonlyArray<{
    readonly anchor: string;
    readonly description: string;
  }>;
  readonly identityProjection: {
    readonly avatar: string;
    readonly projectionType: string;
  };
  readonly satisfactionFrequency: number;
}

// ────────────────────────────────────────────
// L7: Search Configuration
// ────────────────────────────────────────────

export interface SearchSource {
  readonly name: string;
  readonly engine: "web";
  readonly query: string;
}

export interface DeconstructSearchConfig {
  readonly genre: string;
  readonly sources: ReadonlyArray<SearchSource>;
  readonly keywords: {
    readonly sweet: ReadonlyArray<string>;
    readonly bitter: ReadonlyArray<string>;
    readonly style: ReadonlyArray<string>;
  };
}

// ────────────────────────────────────────────
// Complete Deconstruct Report
// ────────────────────────────────────────────

export interface DeconstructReport {
  readonly meta: {
    readonly sourceName: string;
    readonly analyzedAt: string;
    readonly totalChapters: number;
    readonly totalCharacters: number;
  };
  readonly layers: {
    readonly L1: Layer1Lexicon;
    readonly L2: Layer2Structure;
    readonly L3: Layer3Fluctuation;
    readonly L4: Layer4Tone;
    readonly L5: Layer5Characters;
    readonly L6: Layer6ReaderEffects;
    readonly L7?: Layer7Audience;
  };
}

// ────────────────────────────────────────────
// Deconstruct Options
// ────────────────────────────────────────────

export type DeconstructDepth = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface DeconstructOptions {
  readonly depth: DeconstructDepth;
  readonly language: "zh" | "en";
  readonly sourceName?: string;
  readonly maxChapters?: number;
  readonly onChapterProgress?: (chapter: number, total: number) => void;
}

/**
 * Default search configuration for audience analysis.
 * {genre} is replaced at runtime with the actual genre label.
 */
export function defaultSearchConfig(genre: string): DeconstructSearchConfig {
  return {
    genre,
    sources: [
      { name: "起点书评", engine: "web", query: `${genre} 小说 好看 推荐` },
      { name: "豆瓣书评", engine: "web", query: `${genre} 书评 site:book.douban.com` },
      { name: "知乎评价", engine: "web", query: `为什么喜欢${genre}小说 site:zhihu.com` },
      { name: "贴吧讨论", engine: "web", query: `${genre} 风格 特色 site:tieba.baidu.com` },
    ],
    keywords: {
      sweet: ["好看", "经典", "推荐", "必读", "神作", "入坑"],
      bitter: ["弃书", "看不下去", "无聊", "太假", "烂尾", "注水"],
      style: ["风格", "文笔", "节奏", "对话", "意境", "人物"],
    },
  };
}
