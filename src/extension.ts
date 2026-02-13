import * as vscode from 'vscode';
import { formatDatabricksSQL } from './formatter/formatter';

function getFormatOptions(config: vscode.WorkspaceConfiguration) {
  return {
    indentSize: config.get('indentSize', 2),
    keywordCase: config.get('keywordCase', 'upper') as 'upper' | 'lower' | 'preserve',
    commaPosition: config.get('commaPosition', 'trailing') as 'leading' | 'trailing',
  };
}

function formatDocument(document: vscode.TextDocument): vscode.TextEdit[] {
  const config = vscode.workspace.getConfiguration('databricksSqlFormatter');
  const text = document.getText();
  const formatted = formatDatabricksSQL(text, getFormatOptions(config));
  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(text.length)
  );
  return [vscode.TextEdit.replace(fullRange, formatted)];
}

export function activate(context: vscode.ExtensionContext) {
  const formatter = vscode.languages.registerDocumentFormattingEditProvider('sql', {
    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
      return formatDocument(document);
    },
  });

  const formatOnSaveHandler = vscode.workspace.onWillSaveTextDocument((event) => {
    if (event.document.languageId !== 'sql') {
      return;
    }
    const config = vscode.workspace.getConfiguration('databricksSqlFormatter');
    if (!config.get('formatOnSave', false)) {
      return;
    }
    event.waitUntil(Promise.resolve(formatDocument(event.document)));
  });

  const command = vscode.commands.registerCommand('databricks-sql-formatter.formatSQL', () => {
    vscode.commands.executeCommand('editor.action.formatDocument');
  });

  context.subscriptions.push(formatter, formatOnSaveHandler, command);
}

export function deactivate() {}
