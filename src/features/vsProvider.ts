'use strict';

import * as path from 'path';
import * as fs from 'fs';
import * as coc from 'coc.nvim';

import * as utils from './vsUtils';

export default class ValeProvider {
  private diagnosticCollection!: coc.DiagnosticCollection;
  private readabilityStatus!: coc.StatusBarItem;
  private alertMap: Record<string, IValeErrorJSON> = {};
  private diagnosticMap: Record<string, coc.Diagnostic[]> = {};
  private stylesPath!: string;

  private command!: coc.Disposable;
  private logger!: coc.OutputChannel;

  private async doVale(textDocument: coc.TextDocument) {
    // Reset out alert map and run-time log:
    this.alertMap = {};
    this.logger.clear();
    try {
      await this.runVale(textDocument);
    } catch (error) {
      coc.window.showErrorMessage(`There was an error running Vale ${error}.`);
    }
  }

  private async runVale(file: coc.TextDocument) {
    const folder = path.dirname(coc.Uri.parse(file.uri).fsPath);

    const binaryLocation = utils.readBinaryLocation(this.logger, file);
    const configLocation = utils.readFileLocation(this.logger, file);

    if (binaryLocation === null || configLocation === null) {
      // `file` is not part of the workspace, so we could not resolve a workspace-relative path. Ignore this file.
      return;
    }

    // There are two cases we need to handle here:
    //
    // (1) If we're given an explicit value for `--config`, then we should
    // error if it doesn't exist.
    //
    // (2) If we're not given a value (the default is ""), then we need to look
    // for a `.vale.ini`. However, we can't send an error if we don't find one
    // because the user may simply be editing a non-Vale project/file.
    let stylesPath: Array<string> = [];
    if (configLocation !== '' && !fs.existsSync(configLocation)) {
      coc.window.showErrorMessage(`[Vale]: '${configLocation}' does not exist.`);
    } else if (configLocation !== '') {
      stylesPath = [binaryLocation, '--output=JSON', '--config', configLocation, 'ls-config'];
    } else {
      stylesPath = [binaryLocation, '--output=JSON', 'ls-config'];
    }

    const configOut = await utils.runInWorkspace(folder, stylesPath);
    try {
      const configCLI = JSON.parse(configOut);

      this.stylesPath = configCLI.StylesPath;
      const fileName = coc.Uri.parse(file.uri).fsPath;
      const command = utils.buildCommand(binaryLocation, configLocation, fileName);
      const stdout = await utils.runInWorkspace(folder, command);

      this.handleJSON(stdout.toString(), file, 0);
    } catch (error) {
      this.logger.appendLine(error as string);
    }
  }

  private handleJSON(contents: string, doc: coc.TextDocument, offset: number) {
    const diagnostics: coc.Diagnostic[] = [];
    const backend = 'Vale';
    let body = JSON.parse(contents.toString());

    if (body.Code && body.Text) {
      this.logger.appendLine(body.Text);
      if (body.Path) {
        this.logger.appendLine(body.Path);
      }
      return;
    }

    for (let key in body) {
      const alerts = body[key];
      for (var i = 0; i < alerts.length; ++i) {
        const isReadabilityProblem = alerts[i].Match === '';

        if (!isReadabilityProblem) {
          let diagnostic = utils.toDiagnostic(alerts[i], this.stylesPath, backend, offset);
          let key = `${diagnostic.message}-${diagnostic.range}`;
          this.alertMap[key] = alerts[i];

          diagnostics.push(diagnostic);
        }
      }
    }

    this.diagnosticCollection.set(doc.uri, diagnostics);
    this.diagnosticMap[doc.uri.toString()] = diagnostics;
  }

  public async activate(subscriptions: coc.Disposable[]) {
    this.logger = coc.window.createOutputChannel('Vale');

    subscriptions.push(this);

    this.diagnosticCollection = coc.languages.createDiagnosticCollection();

    coc.workspace.onDidOpenTextDocument(this.doVale, this, subscriptions);
    coc.workspace.onDidCloseTextDocument(
      (textDocument) => {
        this.diagnosticCollection.delete(textDocument.uri);
      },
      null,
      subscriptions
    );

    coc.workspace.onDidSaveTextDocument(this.doVale, this);
    coc.workspace.textDocuments.forEach(this.doVale, this);
  }

  public dispose(): void {
    this.diagnosticCollection.clear();

    this.diagnosticCollection.dispose();
    this.command.dispose();
    this.readabilityStatus.dispose();

    this.diagnosticMap = {};
    this.alertMap = {};

    this.logger.dispose();
  }
}
