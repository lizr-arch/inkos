/**
 * Audit calibration — generated from deconstruct to override audit thresholds.
 *
 * When present at story/deconstruct/audit-calibration.json, the audit system
 * uses these thresholds instead of its hardcoded defaults.
 */
export interface AuditCalibration {
  readonly sourceName: string;
  readonly generatedAt: string;
  readonly enabled: boolean;

  readonly sentenceLength: {
    readonly p05: number;
    readonly p95: number;
  };

  readonly paragraph: {
    readonly shortParagraphWarning: boolean;
    readonly shortParagraphMinLength: number | null;
    readonly consecutiveShortWarning: boolean;
    readonly maxConsecutiveShort: number | null;
  };

  readonly opening: {
    readonly expectedTypes: ReadonlyArray<string>;
    readonly forbiddenTypes: ReadonlyArray<string>;
  };

  readonly closing: {
    readonly expectedPattern: string;
    readonly avgClosingLengthMin: number;
    readonly avgClosingLengthMax: number;
  };

  readonly dialogue: {
    readonly densityRange: readonly [number, number];
    readonly maxConsecutiveTurns: number;
  };

  readonly combat: {
    readonly forbidTechniqueNames: boolean;
    readonly maxDescriptionLength: number;
    readonly requireEnvironmentalMetaphors: boolean;
  };

  readonly pov: {
    readonly forbidInnerMonologue: boolean;
    readonly expectedMode: string;
  };

  readonly characterEntrance: {
    readonly minLeadLength: number;
    readonly maxLeadLength: number;
  };

  readonly tone: {
    readonly narrativeDistanceRange: readonly [number, number];
    readonly lonelinessIndexRange: readonly [number, number];
    readonly warmthLevelRange: readonly [number, number];
  };

  readonly emotion: {
    readonly volatilityRange: readonly [number, number];
    readonly reversalFrequencyRange: readonly [number, number];
  };

  readonly pageTurner: {
    readonly minStrength: number;
  };

  readonly reader: {
    readonly sweetSpots: ReadonlyArray<string>;
    readonly dealBreakers: ReadonlyArray<string>;
  };
}

export const DEFAULT_CALIBRATION: AuditCalibration = {
  sourceName: "built-in default",
  generatedAt: new Date().toISOString(),
  enabled: false,
  sentenceLength: { p05: 5, p95: 60 },
  paragraph: {
    shortParagraphWarning: true,
    shortParagraphMinLength: 35,
    consecutiveShortWarning: true,
    maxConsecutiveShort: 5,
  },
  opening: {
    expectedTypes: [],
    forbiddenTypes: [],
  },
  closing: {
    expectedPattern: "any",
    avgClosingLengthMin: 0,
    avgClosingLengthMax: 1000,
  },
  dialogue: {
    densityRange: [0, 100],
    maxConsecutiveTurns: 20,
  },
  combat: {
    forbidTechniqueNames: false,
    maxDescriptionLength: 10000,
    requireEnvironmentalMetaphors: false,
  },
  pov: {
    forbidInnerMonologue: false,
    expectedMode: "any",
  },
  characterEntrance: {
    minLeadLength: 0,
    maxLeadLength: 10000,
  },
  tone: {
    narrativeDistanceRange: [0, 100],
    lonelinessIndexRange: [0, 100],
    warmthLevelRange: [0, 100],
  },
  emotion: {
    volatilityRange: [0, 100],
    reversalFrequencyRange: [0, 1000],
  },
  pageTurner: {
    minStrength: 1,
  },
  reader: {
    sweetSpots: [],
    dealBreakers: [],
  },
};
