import { ExtensionContext } from 'coc.nvim';

import ValeProvider from './features/vsProvider';

export async function activate(context: ExtensionContext): Promise<void> {
  let linter = new ValeProvider();
  linter.activate(context.subscriptions);
}
