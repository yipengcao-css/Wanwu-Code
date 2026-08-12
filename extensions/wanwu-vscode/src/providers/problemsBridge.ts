import * as vscode from "vscode";

export class WanwuProblemsBridge {
  private readonly collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection("wanwu");
  }

  reportError(uri: vscode.Uri, message: string, range?: vscode.Range): void {
    const diagnostic = new vscode.Diagnostic(
      range ?? new vscode.Range(0, 0, 0, 1),
      message,
      vscode.DiagnosticSeverity.Error,
    );
    diagnostic.source = "wanwu";
    this.collection.set(uri, [diagnostic]);
  }

  clear(uri?: vscode.Uri): void {
    if (uri) this.collection.delete(uri);
    else this.collection.clear();
  }

  dispose(): void {
    this.collection.dispose();
  }
}
