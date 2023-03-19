import * as path from 'path';
import * as which from 'which';
import { execFile } from 'child_process';

import * as coc from 'coc.nvim';

// If `customPath` contains `${workspaceFolder}`, replaces it with the workspace that `file` comes from.
// Return `null` if `customPath` contains `${workspaceFolder}` and `file` is _not_ part of the workspace.
function replaceWorkspaceFolder(logger: coc.OutputChannel, customPath: string, file: coc.TextDocument): string | null {
  customPath = path.normalize(customPath);
  const workspaceFolder = coc.workspace.getWorkspaceFolder(file.uri);
  if (workspaceFolder) {
    return customPath.replace('${workspaceFolder}', coc.Uri.parse(workspaceFolder.uri).fsPath);
  }
  logger.appendLine(`Not running Vale on file '${file.uri}' as it is not contained within the workspace`);
  return null;
}

export const readBinaryLocation = (logger: coc.OutputChannel, file: coc.TextDocument): string | null => {
  const configuration = coc.workspace.getConfiguration();

  let customBinaryPath = configuration.get<string>('vale.valeCLI.path');
  if (customBinaryPath) {
    return replaceWorkspaceFolder(logger, customBinaryPath, file);
  }
  return which.sync('vale');
};

export const readFileLocation = (logger: coc.OutputChannel, file: coc.TextDocument): string | null => {
  const configuration = coc.workspace.getConfiguration();

  let customConfigPath = configuration.get<string>('vale.valeCLI.config');
  if (customConfigPath) {
    return replaceWorkspaceFolder(logger, customConfigPath, file);
  }
  return '';
};

/**
 * Convert a Vale severity string to a code diagnostic severity.
 *
 * @param severity The severity to convert
 */
export const toSeverity = (severity: ValeSeverity): coc.DiagnosticSeverity => {
  switch (severity) {
    case 'suggestion':
      return coc.DiagnosticSeverity.Information;
    case 'warning':
      return coc.DiagnosticSeverity.Warning;
    case 'error':
      return coc.DiagnosticSeverity.Error;
  }
};

/**
 * Convert a Vale error to a code diagnostic.
 *
 * @param alert The alert to convert
 */
export const toDiagnostic = (
  alert: IValeErrorJSON,
  styles: string,
  backend: string,
  offset: number
): coc.Diagnostic => {
  const range = coc.Range.create(alert.Line - 1 + offset, alert.Span[0] - 1, alert.Line - 1 + offset, alert.Span[1]);
  const diagnostic = coc.Diagnostic.create(range, alert.Message, toSeverity(alert.Severity), alert.Check, backend);
  return diagnostic;
};

/**
 * Run a command in a given workspace folder and get its standard output.
 *
 * If the workspace folder is undefined run the command in the working directory
 * of the current coc instance.
 *
 * @param folder The workspace
 * @param command The command array
 * @return The standard output of the program
 */
export const runInWorkspace = (folder: string | undefined, command: ReadonlyArray<string>): Promise<string> =>
  new Promise((resolve, reject) => {
    const cwd = folder ? folder : process.cwd();
    const maxBuffer = 10 * 1024 * 1024; // 10MB buffer for large results
    execFile(command[0], command.slice(1), { cwd, maxBuffer }, (error, stdout, stderr) => {
      if (error) {
        resolve(stderr);
      } else {
        resolve(stdout);
      }
    });
  });

export const buildCommand = (exe: string, config: string, path: string): Array<string> => {
  const configuration = coc.workspace.getConfiguration();

  let command: Array<string> = [exe, '--no-exit'];
  if (config !== '') {
    command = command.concat(['--config', config]);
  }

  let minAlertLevel: string = configuration.get<string>('vale.valeCLI.minAlertLevel', 'inherited');

  if (minAlertLevel !== 'inherited') {
    command = command.concat(['--minAlertLevel', minAlertLevel]);
  }

  command = command.concat(['--output', 'JSON', path]);
  return command;
};
