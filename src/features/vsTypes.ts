/**
 * A severity from Vale Server.
 */
type ValeSeverity = "suggestion" | "warning" | "error";

/**
 * An Action From Vale.
 */
interface IValeActionJSON {
  readonly Name: string;
  readonly Params: [number, string];
}

/**
 * An Alert From Vale.
 */
interface IValeErrorJSON {
  readonly Action: IValeActionJSON;
  readonly Check: string;
  readonly Match: string;
  readonly Description: string;
  readonly Line: number;
  readonly Link: string;
  readonly Message: string;
  readonly Span: [number, number];
  readonly Severity: ValeSeverity;
}

/**
 * Where to display file-level readability problems.
 */
type ValeReadabilityProblemLocation = "both" | "inline" | "status";
