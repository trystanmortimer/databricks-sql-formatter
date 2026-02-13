export interface FormatOptions {
  indentSize: number;
  keywordCase: 'upper' | 'lower' | 'preserve';
  commaPosition: 'leading' | 'trailing';
}

export const DEFAULT_OPTIONS: FormatOptions = {
  indentSize: 2,
  keywordCase: 'upper',
  commaPosition: 'trailing',
};
