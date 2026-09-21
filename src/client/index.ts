import type {} from '@deepseek-ai/dsh-client-connection/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-api-remotes/client';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type { FilePatterns } from '../config.ts';
import { SettingsForm } from './SettingsForm.tsx';
import { REMOTE } from '../rpc.ts';
import { en, zh } from './locales.ts';
import type { NoemaKey } from './locales.ts';
import { NoemaCard } from './Card.tsx';
import type { CardInjected } from './Card.tsx';
import { ReportSubscriptions } from './reports.ts';
import styles from './style.css';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    noema: NoemaKey;
  }
}
export const inject = ['slots', 'locale', 'remote', 'settingsScope'];

export async function apply(ctx: Context): Promise<void> {
  const disposeRemote = await ctx.remote.$mount(REMOTE);
  ctx.effect(() => disposeRemote);
  ctx.inject(['remote.noema'], (ctx) => {
    const subscriptions = new ReportSubscriptions(ctx.remote.noema, (error) =>
      ctx.logger.warn('Noema report subscription', error),
    );
    ctx.effect(() => () => subscriptions.close());
    ctx.on('connection/reset', () => subscriptions.reset());
    ctx.effect(() => ctx.locale.register('noema', { en, zh }));
    ctx.effect(() => {
      const style = document.createElement('style');
      style.dataset.plugin = 'dsh-plugin-noema';
      style.textContent = styles;
      document.head.append(style);
      return () => style.remove();
    });
    const scope = ctx.settingsScope.bind<FilePatterns>({ namespace: 'noema' });
    ctx.slots.inject('plugins.bundle.config', () =>
      ctx.slots.register(
        {
          name: 'plugins.bundle.config',
          key: 'dsh-plugin-noema',
          locale: 'noema',
          inject: () => ({ scope }),
        },
        SettingsForm,
      ),
    );
    ctx.slots.inject('conversation.chat.turnTail', () =>
      ctx.slots.register(
        {
          name: 'conversation.chat.turnTail',
          id: 'dsh-plugin-noema',
          locale: 'noema',
          inject: (sessionId): CardInjected => ({
            source: subscriptions.source(sessionId),
            load: (reportId, signal) => subscriptions.load(sessionId, reportId, signal),
            onError: (error) => ctx.logger.warn('Noema report read', error),
          }),
        },
        NoemaCard,
      ),
    );
  });
}
