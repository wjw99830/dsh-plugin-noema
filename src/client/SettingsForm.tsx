import { useCallback, useId, useState, useSyncExternalStore } from 'react';
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import { FilePatterns } from '../config.ts';
import { patternLines, savePatterns, testPatterns } from './settings.ts';

export interface SettingsInjected {
  scope: SettingsScope<FilePatterns>;
}
type SettingsProps = PropsRuntime<'plugins.bundle.config'> & PropsLocale<'noema'> & InjectFace<SettingsInjected>;
interface Draft {
  include: string;
  exclude: string;
  revision: number;
  reset: boolean;
}

export function SettingsForm({ scope, t, view }: SettingsProps) {
  const snapshot = useSyncExternalStore(
    useCallback((listener) => scope.subscribe(listener), [scope]),
    useCallback(() => scope.getSnapshot(), [scope]),
    useCallback(() => scope.getSnapshot(), [scope]),
  );
  const id = useId();
  const [draft, setDraft] = useState<Draft>();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<'saved' | 'save_failed'>();
  if (view === 'summary') return <>{t('settings_summary')}</>;
  if (snapshot.status !== 'ready' || !snapshot.value || snapshot.revision === undefined) {
    return (
      <p className="noema-settings-hint">
        {t(snapshot.status === 'loading' ? 'settings_loading' : 'settings_unavailable')}
      </p>
    );
  }
  const current: Draft = draft ?? {
    include: snapshot.value.include.join('\n'),
    exclude: snapshot.value.exclude.join('\n'),
    revision: snapshot.revision,
    reset: false,
  };
  const changedElsewhere = draft !== undefined && draft.revision !== snapshot.revision;
  const edit = (field: 'include' | 'exclude', value: string) => {
    setDraft({ ...current, [field]: value, reset: false });
    setNotice(undefined);
  };
  return (
    <form
      className="noema-settings"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending || !snapshot.writable || !draft || changedElsewhere) return;
        setPending(true);
        setNotice(undefined);
        try {
          const saved = await savePatterns(
            scope,
            {
              include: patternLines(current.include),
              exclude: patternLines(current.exclude),
            },
            current.revision,
            current.reset,
          );
          if (saved) {
            setDraft(undefined);
            setNotice('saved');
          } else setNotice('save_failed');
        } catch (_error) {
          setNotice('save_failed');
        } finally {
          setPending(false);
        }
      }}
    >
      <h3>{t('settings_title')}</h3>
      <p className="noema-settings-hint">{t('settings_intro')}</p>
      <fieldset disabled={pending || !snapshot.writable}>
        <label htmlFor={`${id}-include`}>{t('include_label')}</label>
        <p id={`${id}-include-help`} className="noema-settings-hint">
          {t('include_help')}
        </p>
        <textarea
          id={`${id}-include`}
          aria-describedby={`${id}-include-help`}
          rows={3}
          value={current.include}
          spellCheck={false}
          onChange={(event) => edit('include', event.target.value)}
        />
        {patternLines(current.include).length === 0 && <p className="noema-settings-warning">{t('include_empty')}</p>}
        <label htmlFor={`${id}-exclude`}>{t('exclude_label')}</label>
        <p id={`${id}-exclude-help`} className="noema-settings-hint">
          {t('exclude_help')}
        </p>
        <textarea
          id={`${id}-exclude`}
          aria-describedby={`${id}-exclude-help`}
          rows={6}
          value={current.exclude}
          spellCheck={false}
          onChange={(event) => edit('exclude', event.target.value)}
        />
        <button
          type="button"
          onClick={() => edit('exclude', [...new Set([...patternLines(current.exclude), ...testPatterns])].join('\n'))}
        >
          {t('exclude_tests')}
        </button>
        <p className="noema-settings-hint">{t('patterns_help')}</p>
        <div className="noema-settings-actions">
          <button type="submit" className="noema-settings-save" disabled={!draft || changedElsewhere}>
            {t(pending ? 'saving' : 'save')}
          </button>
          <button
            type="button"
            onClick={() => {
              const defaults = FilePatterns(snapshot.base as FilePatterns | undefined);
              setDraft({
                include: defaults.include.join('\n'),
                exclude: defaults.exclude.join('\n'),
                revision: snapshot.revision!,
                reset: true,
              });
              setNotice(undefined);
            }}
          >
            {t('restore_defaults')}
          </button>
          {draft && (
            <button
              type="button"
              onClick={() => {
                setDraft(undefined);
                setNotice(undefined);
              }}
            >
              {t(changedElsewhere ? 'reload_settings' : 'discard_changes')}
            </button>
          )}
        </div>
      </fieldset>
      {!snapshot.writable && <p role="status">{t('settings_readonly')}</p>}
      {!pending && changedElsewhere && (
        <p role="status" className="noema-settings-warning">
          {t('settings_conflict')}
        </p>
      )}
      {notice && (
        <p role="status" className={notice === 'save_failed' ? 'noema-settings-warning' : 'noema-settings-hint'}>
          {t(notice)}
        </p>
      )}
    </form>
  );
}
