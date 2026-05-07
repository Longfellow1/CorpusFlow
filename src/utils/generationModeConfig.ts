export type FineTuneOutputKind = "qa" | "instruct";
export type FineTuneGenerationMode = "single" | "multi" | "instruct";
export type QuickOutputKind = "qa" | "instruct";
export type QuickRequestType = "qa" | "multi" | "instruct";

export function getQuickOutputKinds(): QuickOutputKind[] {
  return ["qa", "instruct"];
}

export function resolveFineTuneMode(
  outputKind: FineTuneOutputKind,
  multiTurnEnabled: boolean,
): FineTuneGenerationMode {
  if (outputKind === "qa") {
    return multiTurnEnabled ? "multi" : "single";
  }
  return "instruct";
}

export function getFineTuneOutputKind(mode: FineTuneGenerationMode): FineTuneOutputKind {
  return mode === "instruct" ? "instruct" : "qa";
}

export function isFineTuneMultiTurn(mode: FineTuneGenerationMode, multiTurnEnabled: boolean) {
  return mode === "multi" || multiTurnEnabled;
}

export function resolveQuickRequestType(
  outputKind: QuickOutputKind,
  multiTurnEnabled: boolean,
): QuickRequestType {
  if (outputKind === "qa" && multiTurnEnabled) {
    return "multi";
  }
  return outputKind;
}

export function resolveQuickResultType(
  outputKind: QuickOutputKind,
  multiTurnEnabled: boolean,
): "single" | "multi" | "instruct" {
  if (outputKind === "qa") {
    return multiTurnEnabled ? "multi" : "single";
  }
  return outputKind;
}
